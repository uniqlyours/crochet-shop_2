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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
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
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
    productUrls + `\n</urlset>\n`
  );
});

// ---------- SEO: server-rendered product pages ----------
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get('/product/:id', (req, res) => {
  const p = db.getProducts({ onlyInStock: true }).find(x => x.id === req.params.id);
  if (!p) return res.status(404).redirect('/#shop');
  const img = p.photo ? SITE_URL + p.photo : SITE_URL + '/og-image.png';
  const url = `${SITE_URL}/product/${encodeURIComponent(p.id)}`;
  const desc = p.description || `Hand-crocheted ${p.name} by UNIQLYours.`;
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
  res.send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(p.name)} — UNIQLYours</title>
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product"><meta property="og:site_name" content="UNIQLYours">
<meta property="og:title" content="${escHtml(p.name)} — UNIQLYours">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Nunito:wght@400;600;700&family=Merienda:wght@700&family=Satisfy&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
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
  @media(max-width:700px){.prod{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<a class="brand" href="/">UNIQLY<i>ours</i></a>
<div class="prod">
  <img src="${escHtml(p.photo || '/og-image.png')}" alt="${escHtml(p.name)}">
  <div>
    <span class="kind">${escHtml(p.kind || 'Handmade')} · ${escHtml(p.category || '')}</span>
    <h1>${escHtml(p.name)}</h1>
    <div class="price">$${Number(p.price).toFixed(2)}</div>
    <p class="desc">${escHtml(desc)}</p>
    <a class="btn" href="/?add=${encodeURIComponent(p.id)}#shop">Add to basket</a><br>
    <a class="back" href="/#shop">← Browse everything</a>
  </div>
</div></div></body></html>`);
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
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`));
});

// ---------- static files ----------
// Serve uploaded photos from the (possibly volume-backed) uploads dir first, then
// fall back to anything bundled under public/ (incl. the seed product images).
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

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
