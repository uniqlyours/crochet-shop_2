import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as db from './lib/store.js';
import { checkPassword, issueCookie, clearCookie, isAuthed, requireAdmin } from './lib/auth.js';
import { sendOrderEmails, sendCustomRequestEmail } from './lib/mailer.js';
import { stripeEnabled, createCheckoutSession, getCheckoutSession, verifyWebhookSignature } from './lib/stripe.js';
import { instagramEnabled, maybeAutoPost } from './lib/instagram.js';
import { GUIDES } from './lib/guides.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
// Google Analytics 4: set GA_MEASUREMENT_ID (G-XXXXXXX) in Railway to enable.
// The snippet is injected into every public page; no-op until the ID is set.
const GA_ID = process.env.GA_MEASUREMENT_ID || '';
const gaSnippet = () => GA_ID
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>\n` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}` +
    `gtag('js',new Date());gtag('config','${GA_ID}');</script>\n`
  : '';
// Railway (and most hosts) terminate HTTPS at a proxy in front of the app.
// Trusting it lets the admin login cookie be marked Secure correctly over HTTPS.
app.set('trust proxy', 1);

// ---------- middleware ----------
// Stripe webhook needs the RAW body for signature verification, so it is
// registered before the JSON parser.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(400).json({ error: 'Webhook not configured' });
  const raw = req.body.toString('utf8');
  if (!verifyWebhookSignature(raw, req.headers['stripe-signature'], secret)) {
    return res.status(400).json({ error: 'Bad signature' });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad payload' }); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const orderId = session?.metadata?.order_id;
    if (orderId && session?.payment_status === 'paid') {
      const r = db.markOrderPaid(orderId);
      if (r && !r.wasAlreadyPaid) sendOrderEmails(r.order); // first confirmation only
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '4mb' }));
// tiny cookie reader (avoids an extra dependency)
app.use((req, _res, next) => {
  req.cookies = {};
  const h = req.headers.cookie;
  if (h) for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  next();
});

// ---------- photo uploads ----------
// On Railway, set UPLOADS_DIR to a folder on the mounted volume (e.g. /data/uploads)
// so customer/product photos survive restarts. Falls back to public/uploads locally.
const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ext);
    }
  }),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

// turns "Hearthside Throw.JPG" -> "hearthside-throw.jpg"
function safeName(original) {
  const ext = (path.extname(original) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const base = path.basename(original, path.extname(original))
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'photo';
  return base + (ext.startsWith('.') ? ext : '.' + ext);
}
// keeps the (sanitized) original filename so it can be referenced from the spreadsheet
const uploadKeep = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeName(file.originalname))
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

// ============================================================
//  PUBLIC STOREFRONT API
// ============================================================
app.get('/api/products', (_req, res) => {
  res.json(db.getProducts({ onlyInStock: true }));
});

app.post('/api/orders', (req, res) => {
  const { customer, address, items } = req.body || {};
  if (!customer?.name || !customer?.email || !address?.line1) {
    return res.status(400).json({ error: 'Name, email and address are required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your basket is empty.' });
  }
  const order = db.createOrder({ customer, address, items, paymentMethod: 'pay_later' });
  sendOrderEmails(order); // fire-and-forget; no-op unless SMTP is configured
  res.json({ number: order.number, subtotal: order.subtotal, shipping: order.shipping, total: order.total });
});

// ---------- Stripe Checkout (card payments) ----------
// Creates the order (unpaid) then redirects the customer to Stripe's hosted page.
app.post('/api/checkout', async (req, res) => {
  if (!stripeEnabled()) return res.status(400).json({ error: 'Card payments are not available right now.' });
  const { customer, address, items } = req.body || {};
  if (!customer?.name || !customer?.email || !address?.line1) {
    return res.status(400).json({ error: 'Name, email and address are required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your basket is empty.' });
  }
  try {
    const order = db.createOrder({ customer, address, items, paymentMethod: 'card' });
    const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await createCheckoutSession(order, siteUrl.replace(/\/$/, ''));
    db.attachStripeSession(order.id, session.id);
    res.json({ url: session.url });
  } catch (e) {
    console.error('checkout:', e.message);
    res.status(502).json({ error: 'Could not start the card payment. Please try again.' });
  }
});

// Fallback confirmation when the customer returns from Stripe (webhook is primary).
app.get('/api/checkout/confirm', async (req, res) => {
  if (!stripeEnabled()) return res.status(400).json({ error: 'Not available' });
  const id = String(req.query.session_id || '');
  if (!id) return res.status(400).json({ error: 'Missing session' });
  try {
    const session = await getCheckoutSession(id);
    const orderId = session?.metadata?.order_id;
    if (!orderId) return res.status(404).json({ error: 'Unknown session' });
    if (session.payment_status !== 'paid') return res.status(402).json({ error: 'Payment not completed' });
    const r = db.markOrderPaid(orderId);
    if (!r) return res.status(404).json({ error: 'Order not found' });
    if (!r.wasAlreadyPaid) sendOrderEmails(r.order);
    res.json({ number: r.order.number });
  } catch (e) {
    console.error('confirm:', e.message);
    res.status(502).json({ error: 'Could not confirm the payment.' });
  }
});

// public, safe settings (Instagram link + custom-order availability)
app.get('/api/settings', (_req, res) => {
  const s = db.getSettings();
  res.json({
    instagram: s.instagram,
    email: s.email,
    customOrdersOpen: s.customOrdersOpen,
    customOrdersNote: s.customOrdersNote,
    shippingFlat: Number(s.shippingFlat) || 0,
    cardPayments: stripeEnabled()
  });
});

// custom order request — only accepted while custom orders are open
app.post('/api/custom-requests', (req, res) => {
  if (!db.getSettings().customOrdersOpen) {
    return res.status(403).json({ error: 'Custom orders are paused right now.' });
  }
  const { name, email, message, budget } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Please add your name, email and a short description.' });
  }
  const reqItem = db.addCustomRequest({ name, email, message, budget });
  sendCustomRequestEmail(reqItem); // fire-and-forget; no-op unless SMTP is configured
  res.json({ ok: true });
});

// ============================================================
//  ADMIN AUTH
// ============================================================
app.post('/api/admin/login', (req, res) => {
  if (!checkPassword(req.body?.password)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  issueCookie(res, req);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { clearCookie(res); res.json({ ok: true }); });
app.get('/api/admin/session', (req, res) => res.json({ authed: isAuthed(req) }));

// ============================================================
//  ADMIN DATA (all protected)
// ============================================================
app.get('/api/admin/products', requireAdmin, (_req, res) => res.json(db.getProducts()));

app.post('/api/admin/products', requireAdmin, upload.single('photo'), (req, res) => {
  const b = req.body;
  const photo = req.file ? '/uploads/' + req.file.filename : '';
  const product = db.addProduct({
    name: b.name, kind: b.kind, category: b.category, price: b.price,
    description: b.description, colorway: b.colorway,
    inStock: b.inStock !== 'false', photo
  });
  res.json(product);
});

app.put('/api/admin/products/:id', requireAdmin, upload.single('photo'), (req, res) => {
  const b = req.body;
  const patch = {
    name: b.name, kind: b.kind, category: b.category, price: b.price,
    description: b.description, colorway: b.colorway
  };
  if (b.inStock !== undefined) patch.inStock = b.inStock !== 'false';
  if (req.file) patch.photo = '/uploads/' + req.file.filename;
  const updated = db.updateProduct(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  res.json({ ok: db.deleteProduct(req.params.id) });
});

app.get('/api/admin/orders', requireAdmin, (_req, res) => res.json(db.getOrders()));
app.post('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const o = db.updateOrderStatus(req.params.id, req.body?.status);
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json(o);
});
app.get('/api/admin/stats', requireAdmin, (_req, res) => res.json(db.getStats()));

// bulk photo upload — returns the saved filename for each, to use in the spreadsheet
app.post('/api/admin/photos', requireAdmin, uploadKeep.array('photos', 60), (req, res) => {
  const files = (req.files || []).map(f => ({ original: f.originalname, filename: f.filename, url: '/uploads/' + f.filename }));
  res.json({ files });
});

// ---------- Instagram queue (drop folder) ----------
// Accepts images and videos; videos become Reels in the rotation.
const socialDir = path.join(UPLOAD_DIR, 'social');
fs.mkdirSync(socialDir, { recursive: true });
const uploadSocial = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, socialDir),
    filename: (_req, file, cb) => cb(null, safeName(file.originalname))
  }),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB for videos
  fileFilter: (_req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype))
});
app.get('/api/admin/social', requireAdmin, (_req, res) => {
  res.json({ items: db.getSocial(), nextIndex: (Number(db.getSettings().igSocialIdx) || 0) });
});
app.post('/api/admin/social', requireAdmin, uploadSocial.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Add an image or video file.' });
  const type = /^video\//.test(req.file.mimetype) ? 'reel' : 'image';
  const item = db.addSocial({
    type,
    file: '/uploads/social/' + req.file.filename,
    caption: req.body?.caption || ''
  });
  res.json(item);
});
app.delete('/api/admin/social/:id', requireAdmin, (req, res) => {
  res.json({ ok: db.removeSocial(req.params.id) });
});

// bulk product import (rows parsed from the spreadsheet in the browser)
app.post('/api/admin/import', requireAdmin, (req, res) => {
  const { products, mode } = req.body || {};
  if (!Array.isArray(products) || !products.length) {
    return res.status(400).json({ error: 'No products to import.' });
  }
  res.json(db.importProducts(products, { replace: mode === 'replace' }));
});

// admin settings
app.get('/api/admin/settings', requireAdmin, (_req, res) => res.json(db.getSettings()));
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(db.updateSettings(req.body || {}));
});

// admin custom requests
app.get('/api/admin/custom-requests', requireAdmin, (_req, res) => res.json(db.getCustomRequests()));
app.post('/api/admin/custom-requests/:id/status', requireAdmin, (req, res) => {
  const r = db.updateCustomRequestStatus(req.params.id, req.body?.status);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

// ---------- SEO: robots.txt + sitemap.xml ----------
// Set SITE_URL in .env to your real domain once hosted (e.g. https://uniqlyours.com)
const SITE_URL = (process.env.SITE_URL || 'https://uniqlyours.com').replace(/\/$/, '');
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const products = db.getProducts({ onlyInStock: true });
  const productUrls = products.map(p =>
    `  <url><loc>${SITE_URL}/product/${encodeURIComponent(p.id)}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
  ).join('\n');
  const guideUrls = [`  <url><loc>${SITE_URL}/gifts</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`]
    .concat(GUIDES.map(g =>
      `  <url><loc>${SITE_URL}/gifts/${g.slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`))
    .join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
    guideUrls + '\n' +
    productUrls + `\n</urlset>\n`
  );
});

// ---------- Store policies (linked from Google Merchant Center) ----------
app.get('/returns', (_req, res) => {
  const url = SITE_URL + '/returns';
  res.send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Returns & Exchanges — UNIQLYours</title>
<meta name="description" content="UNIQLYours return policy — every piece is handmade to order in small batches; all sales are final.">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Nunito:wght@400;600;700&family=Merienda:wght@700&family=Satisfy&display=swap" rel="stylesheet">
<style>
 body{margin:0;font-family:Nunito,sans-serif;background:#FCFDFC;color:#333A33}
 .wrap{max-width:760px;margin:0 auto;padding:28px 20px 60px}
 a.brand{text-decoration:none;color:#333A33;font-family:Merienda,cursive;font-weight:700;font-size:1.5rem}
 a.brand i{font-family:Satisfy,cursive;font-style:normal;color:#7C9A73;font-size:1.15em}
 h1{font-family:Quicksand,sans-serif;font-size:2rem;margin:26px 0 14px}
 h2{font-family:Quicksand,sans-serif;font-size:1.2rem;margin:26px 0 8px}
 p{line-height:1.7;color:#5A625A}
 .back{color:#5E7D55;text-decoration:none;font-weight:700}
</style></head><body><div class="wrap">
<a class="brand" href="/">UNIQLY<i>ours</i></a>
<h1>Returns &amp; Exchanges</h1>
<p>Every UNIQLYours piece is crocheted by hand in small batches — many are one of a kind. Because of the handmade nature of our products, <b>all sales are final</b>: we don’t accept returns or exchanges.</p>
<h2>Arrived damaged?</h2>
<p>If your order arrives damaged or isn’t what you ordered, email us at <a href="mailto:order@uniqlyours.com">order@uniqlyours.com</a> within 7 days of delivery with a photo, and we’ll make it right.</p>
<h2>Custom orders</h2>
<p>Custom pieces are made just for you and are confirmed by quote before we begin — they can’t be returned or exchanged.</p>
<p><a class="back" href="/">← Back to the shop</a></p>
</div></body></html>`);
});

// ---------- Google Merchant Center product feed ----------
// Add this URL as a scheduled feed in Merchant Center: /merchant-feed.xml
app.get('/merchant-feed.xml', (_req, res) => {
  const items = db.getProducts({ onlyInStock: true }).filter(p => p.photo).map(p => {
    const url = `${SITE_URL}/product/${encodeURIComponent(p.id)}`;
    const desc = (p.description || `Handmade crochet ${p.name} by UNIQLYours.`) +
      ' Hand-crocheted in small batches — no two pieces are exactly alike.';
    return `  <item>
    <g:id>${escHtml(p.id)}</g:id>
    <g:title>${escHtml(p.name)} — Handmade Crochet</g:title>
    <g:description>${escHtml(desc)}</g:description>
    <g:link>${url}</g:link>
    <g:image_link>${SITE_URL}${escHtml(p.photo)}</g:image_link>
    <g:availability>in_stock</g:availability>
    <g:price>${Number(p.price).toFixed(2)} USD</g:price>
    <g:condition>new</g:condition>
    <g:brand>UNIQLYours</g:brand>
    <g:identifier_exists>false</g:identifier_exists>
    <g:product_type>${escHtml(p.category || 'Handmade')}</g:product_type>
  </item>`;
  }).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>UNIQLYours — Handmade Crochet</title>
  <link>${SITE_URL}</link>
  <description>Handmade crochet baskets, keychains, handbags and gifts.</description>
${items}
</channel>
</rss>`);
});

// ---------- SEO: server-rendered product pages ----------
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get('/product/:id', (req, res) => {
  const all = db.getProducts({ onlyInStock: true });
  const p = all.find(x => x.id === req.params.id);
  if (!p) return res.status(404).redirect('/#shop');
  const img = p.photo ? SITE_URL + p.photo : SITE_URL + '/og-image.png';
  const url = `${SITE_URL}/product/${encodeURIComponent(p.id)}`;
  const desc = p.description || `Hand-crocheted ${p.name} by UNIQLYours.`;
  // Long-tail SEO title: append "Handmade Crochet <kind>" unless the name already says so.
  const kind = (p.kind || '').trim();
  const nameLc = p.name.toLowerCase();
  const tailWords = ['handmade crochet', kind && !nameLc.includes(kind.toLowerCase()) ? kind : '']
    .filter(Boolean).join(' ');
  const seoTitle = `${p.name} — ${tailWords.replace(/\b\w/g, c => c.toUpperCase())}`;
  // Meta description: real copy + brand/price hook, capped near 155 chars.
  const metaDesc = (desc.length > 110 ? desc.slice(0, 110).replace(/\s+\S*$/, '') + '…' : desc) +
    ` Handmade crochet by UNIQLYours — $${Number(p.price).toFixed(2)}, ships from the USA.`;
  const altText = `${p.name} — handmade crochet ${kind || 'piece'} by UNIQLYours`;
  // Related products: same category first, then same kind, then anything else.
  const related = [
    ...all.filter(x => x.id !== p.id && x.photo && x.category && x.category === p.category),
    ...all.filter(x => x.id !== p.id && x.photo && x.kind && x.kind === p.kind),
    ...all.filter(x => x.id !== p.id && x.photo)
  ].filter((x, i, arr) => arr.findIndex(y => y.id === x.id) === i).slice(0, 4);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, description: desc, image: [img], url,
    brand: { '@type': 'Brand', name: 'UNIQLYours' },
    offers: {
      '@type': 'Offer', url, priceCurrency: 'USD', price: Number(p.price).toFixed(2),
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'UNIQLYours' }
    }
  };
  const crumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'UNIQLYours', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: p.category || 'Shop', item: SITE_URL + '/#shop' },
      { '@type': 'ListItem', position: 3, name: p.name, item: url }
    ]
  };
  res.send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(seoTitle)} | UNIQLYours</title>
<meta name="description" content="${escHtml(metaDesc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product"><meta property="og:site_name" content="UNIQLYours">
<meta property="og:title" content="${escHtml(p.name)} — UNIQLYours">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${img}">
<meta property="og:price:amount" content="${Number(p.price).toFixed(2)}">
<meta property="og:price:currency" content="USD">
<meta property="product:price:amount" content="${Number(p.price).toFixed(2)}">
<meta property="product:price:currency" content="USD">
<meta property="og:availability" content="instock">
<meta property="product:availability" content="in stock">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Nunito:wght@400;600;700&family=Merienda:wght@700&family=Satisfy&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(crumbLd)}</script>
${gaSnippet()}<style>
  body{margin:0;font-family:Nunito,sans-serif;background:#FCFDFC;color:#333A33}
  .wrap{max-width:880px;margin:0 auto;padding:28px 20px}
  a.brand{text-decoration:none;color:#333A33;font-family:Merienda,cursive;font-weight:700;font-size:1.5rem}
  a.brand i{font-family:Satisfy,cursive;font-style:normal;color:#7C9A73;font-size:1.15em}
  .prod{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:26px;align-items:start}
  .prod img{width:100%;border-radius:18px;border:1px solid #E7ECE6}
  h1{font-family:Quicksand,sans-serif;margin:0 0 10px;font-size:1.9rem}
  .price{font-size:1.4rem;font-weight:700;color:#5E7D55;margin:8px 0 14px}
  .kind{letter-spacing:.18em;text-transform:uppercase;font-size:.72rem;color:#7C9A73;font-weight:700}
  p.desc{line-height:1.65;color:#5A625A}
  .btn{display:inline-block;background:#7C9A73;color:#fff;text-decoration:none;font-weight:700;
       padding:13px 26px;border-radius:999px;margin-top:10px}
  .back{display:inline-block;margin-top:18px;color:#7C9A73;text-decoration:none;font-weight:700}
  h2.rel{font-family:Quicksand,sans-serif;margin:44px 0 14px;font-size:1.25rem}
  .relgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
  .rcard{border:1px solid #E7ECE6;border-radius:14px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;display:block}
  .rcard img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}
  .rcard .cb{padding:10px 12px}
  .rcard .nm{font-weight:700;font-family:Quicksand,sans-serif;font-size:.92rem}
  .rcard .pr{color:#5E7D55;font-weight:700;margin-top:3px;font-size:.9rem}
  @media(max-width:700px){.prod{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<a class="brand" href="/">UNIQLY<i>ours</i></a>
<div class="prod">
  <img src="${escHtml(p.photo || '/og-image.png')}" alt="${escHtml(altText)}" fetchpriority="high">
  <div>
    <span class="kind">${escHtml(p.kind || 'Handmade')} · ${escHtml(p.category || '')}</span>
    <h1>${escHtml(p.name)}</h1>
    <div class="price">$${Number(p.price).toFixed(2)}</div>
    <p class="desc">${escHtml(desc)}</p>
    <a class="btn" href="/?add=${encodeURIComponent(p.id)}#shop">Add to basket</a><br>
    <a class="back" href="/#shop">← Browse everything</a>
  </div>
</div>
${related.length ? `<h2 class="rel">You might also like</h2>
<div class="relgrid">
${related.map(r => `<a class="rcard" href="/product/${encodeURIComponent(r.id)}">
  <img src="${escHtml(r.photo)}" alt="${escHtml(r.name)} — handmade crochet by UNIQLYours" loading="lazy">
  <div class="cb"><div class="nm">${escHtml(r.name)}</div><div class="pr">$${Number(r.price).toFixed(2)}</div></div></a>`).join('\n')}
</div>` : ''}
</div></body></html>`);
});

// ---------- SEO: gift-guide landing pages ----------
const guideShell = (title, metaDesc, url, ld, body) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)} — UNIQLYours</title>
<meta name="description" content="${escHtml(metaDesc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="UNIQLYours">
<meta property="og:title" content="${escHtml(title)}"><meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE_URL}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Nunito:wght@400;600;700&family=Merienda:wght@700&family=Satisfy&display=swap" rel="stylesheet">
${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
${gaSnippet()}<style>
  body{margin:0;font-family:Nunito,sans-serif;background:#FCFDFC;color:#333A33}
  .wrap{max-width:1060px;margin:0 auto;padding:28px 20px 60px}
  a.brand{text-decoration:none;color:#333A33;font-family:Merienda,cursive;font-weight:700;font-size:1.5rem}
  a.brand i{font-family:Satisfy,cursive;font-style:normal;color:#7C9A73;font-size:1.15em}
  .crumb{font-size:.85rem;color:#7A827A;margin:18px 0 8px}
  .crumb a{color:#5E7D55;text-decoration:none}
  h1{font-family:Quicksand,sans-serif;font-size:2.1rem;margin:6px 0 14px}
  p.lead{line-height:1.7;color:#5A625A;max-width:760px;margin:0 0 14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;margin:30px 0 10px}
  .card{border:1px solid #E7ECE6;border-radius:16px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;display:block}
  .card img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}
  .card .cb{padding:12px 14px}
  .card .nm{font-weight:700;font-family:Quicksand,sans-serif}
  .card .pr{color:#5E7D55;font-weight:700;margin-top:4px}
  h2{font-family:Quicksand,sans-serif;margin:36px 0 12px}
  .faq{border-top:1px solid #E7ECE6;padding:16px 0;max-width:760px}
  .faq b{display:block;margin-bottom:6px;font-family:Quicksand,sans-serif}
  .faq p{margin:0;color:#5A625A;line-height:1.65}
  .more{margin-top:34px;font-size:.92rem;color:#5A625A}
  .more a{color:#5E7D55}
  .cta{display:inline-block;background:#7C9A73;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:999px;margin-top:16px}
</style></head><body><div class="wrap">
<a class="brand" href="/">UNIQLY<i>ours</i></a>
${body}
</div></body></html>`;

const guideCrumb = (name, url) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'UNIQLYours', item: SITE_URL + '/' },
    { '@type': 'ListItem', position: 2, name: 'Gift guides', item: SITE_URL + '/gifts' },
    { '@type': 'ListItem', position: 3, name, item: url }
  ]
});

app.get('/gifts', (_req, res) => {
  const url = SITE_URL + '/gifts';
  const body = `
<div class="crumb"><a href="/">Home</a> › Gift guides</div>
<h1>Gift guides</h1>
<p class="lead">Handmade crochet gift ideas for every person and occasion — each guide is a hand-picked selection from our small-batch studio.</p>
<div class="grid">
${GUIDES.map(g => {
    const p = db.getProducts({ onlyInStock: true }).filter(x => x.photo);
    const first = g.pick(p)[0];
    return `<a class="card" href="/gifts/${g.slug}">
      ${first ? `<img src="${escHtml(first.photo)}" alt="${escHtml(g.title)}" loading="lazy">` : ''}
      <div class="cb"><div class="nm">${escHtml(g.h1)}</div><div class="pr">View guide →</div></div></a>`;
  }).join('\n')}
</div>`;
  res.send(guideShell('Gift Guides — Handmade Crochet Gift Ideas',
    'Handmade crochet gift guides — Christmas, baby showers, First Communion favors, Mother’s Day and more. Small-batch, hooked by hand.',
    url,
    [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Gift guides', url }],
    body));
});

app.get('/gifts/:slug', (req, res) => {
  const g = GUIDES.find(x => x.slug === req.params.slug);
  if (!g) return res.status(404).redirect('/gifts');
  const url = `${SITE_URL}/gifts/${g.slug}`;
  const products = g.pick(db.getProducts({ onlyInStock: true }).filter(p => p.photo));
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: g.faqs.map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };
  const listLd = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${SITE_URL}/product/${encodeURIComponent(p.id)}`, name: p.name
    }))
  };
  const body = `
<div class="crumb"><a href="/">Home</a> › <a href="/gifts">Gift guides</a> › ${escHtml(g.h1)}</div>
<h1>${escHtml(g.h1)}</h1>
${g.intro.map(t => `<p class="lead">${escHtml(t)}</p>`).join('\n')}
<div class="grid">
${products.map(p => `<a class="card" href="/product/${encodeURIComponent(p.id)}">
  <img src="${escHtml(p.photo)}" alt="${escHtml(p.name)} — handmade crochet" loading="lazy">
  <div class="cb"><div class="nm">${escHtml(p.name)}</div><div class="pr">$${Number(p.price).toFixed(2)}</div></div></a>`).join('\n')}
</div>
<a class="cta" href="/#custom">Request something custom</a>
<h2>Good to know</h2>
${g.faqs.map(f => `<div class="faq"><b>${escHtml(f.q)}</b><p>${escHtml(f.a)}</p></div>`).join('\n')}
<div class="more">More guides: ${GUIDES.filter(x => x.slug !== g.slug).map(x => `<a href="/gifts/${x.slug}">${escHtml(x.h1)}</a>`).join(' · ')}</div>`;
  res.send(guideShell(g.title, g.metaDesc, url, [faqLd, listLd, guideCrumb(g.h1, url)], body));
});

// Homepage: inject an ItemList of products (structured data) into the static HTML.
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
app.get('/', (_req, res) => {
  const products = db.getProducts({ onlyInStock: true });
  const ld = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${SITE_URL}/product/${encodeURIComponent(p.id)}`, name: p.name
    }))
  };
  res.type('html').send(INDEX_HTML.replace('</head>',
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n${gaSnippet()}</head>`));
});

// ---------- static files ----------
// Serve uploaded photos from the (possibly volume-backed) uploads dir first, then
// fall back to anything bundled under public/ (incl. the seed product images).
// Cache headers: photos rarely change once uploaded (30d); other assets 1d.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// Instagram auto-posting: checks hourly, posts when the interval has elapsed.
// No-op until IG_ACCESS_TOKEN + IG_USER_ID are set in the environment.
if (instagramEnabled()) {
  console.log('  📸 Instagram auto-posting enabled');
  setTimeout(maybeAutoPost, 60 * 1000);              // first check a minute after boot
  setInterval(maybeAutoPost, 60 * 60 * 1000);        // then hourly
} else {
  console.log('  📸 Instagram auto-posting off (set IG_ACCESS_TOKEN + IG_USER_ID)');
}

app.listen(PORT, () => {
  console.log(`\n  🧶 UNIQLYours is running`);
  console.log(`  Storefront → http://localhost:${PORT}`);
  console.log(`  Admin      → http://localhost:${PORT}/admin\n`);
});
