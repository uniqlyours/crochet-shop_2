// Simple JSON-file datastore. For a small handmade shop this is plenty.
// (When you outgrow it, the same functions can be swapped to talk to a real
// database like Postgres/Supabase — see README "Going live".)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// On Railway, set DATA_DIR to a mounted volume path (e.g. /data) so the catalog,
// orders and settings survive restarts and redeploys. Locally it defaults to ../data.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
// The store.json that ships with the app — used to seed a fresh/empty volume on first boot.
const BUNDLED_DB = path.join(__dirname, '..', 'data', 'store.json');

// ---- placeholder products to start with (your wife can delete these) ----
const SEED = {
  products: [
    { id:'p_bunny',   name:'Pip the Bunny',      kind:'Amigurumi', category:'Little ones', price:28,  description:'A floppy-eared friend, about 9 inches tall.', photo:'', colorway:'#D89AA6', inStock:true },
    { id:'p_throw',   name:'Hearthside Throw',   kind:'Blanket',   category:'Blankets',    price:145, description:'Chunky, oversized, made for the good couch.', photo:'', colorway:'#C9B98E', inStock:true },
    { id:'p_beanie',  name:'Frost Beanie',       kind:'Hat',       category:'Gifts',       price:32,  description:'Slouchy ribbed knit with a soft turned brim.', photo:'', colorway:'#9CB191', inStock:true },
    { id:'p_tote',    name:'Sunday Market Bag',  kind:'Tote',      category:'Gifts',       price:48,  description:'Stretchy net tote that swallows a farmers haul.', photo:'', colorway:'#DFC084', inStock:true },
    { id:'p_booties', name:'Tiny Steps Booties', kind:'Baby set',  category:'Little ones', price:22,  description:'Newborn booties with a snug little cuff.', photo:'', colorway:'#E0A9BD', inStock:true },
    { id:'p_coasters',name:'Daisy Coasters (4)', kind:'Homeware',  category:'Gifts',       price:24,  description:'A set of four flowers for your favorite mugs.', photo:'', colorway:'#E8C766', inStock:true },
    { id:'p_scarf',   name:'Woodsmoke Scarf',    kind:'Scarf',     category:'Gifts',       price:38,  description:'Long, fringed, and warm as a campfire story.', photo:'', colorway:'#B79F7F', inStock:true },
    { id:'p_octo',    name:'Captain Inky',       kind:'Plush',     category:'Little ones', price:30,  description:'A curly-armed octopus that loves a cuddle.', photo:'', colorway:'#9FB2C2', inStock:true },
    { id:'p_pot',     name:'Gingham Potholders', kind:'Homeware',  category:'Blankets',    price:18,  description:'A sturdy pair for the busiest kitchens.', photo:'', colorway:'#D29C8C', inStock:true }
  ],
  orders: [],
  customRequests: [],
  settings: {
    instagram: '',                 // e.g. https://instagram.com/yourshop  (set this in admin → Settings)
    email: 'order@uniqlyours.com', // contact email shown in the footer
    customOrdersOpen: true,        // master switch for the custom-order section
    customOrdersNote: "Tell us what you'd love and we'll send a quote. Most custom pieces take 2–4 weeks.",
    shippingFlat: 5                // flat shipping added at checkout (USD); 0 = free shipping
  }
};

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    // First run on a fresh data dir (e.g. a new Railway volume): seed it from the
    // catalog shipped with the app if available, otherwise the placeholder products.
    if (DB_FILE !== BUNDLED_DB && fs.existsSync(BUNDLED_DB)) {
      fs.copyFileSync(BUNDLED_DB, DB_FILE);
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(SEED, null, 2));
    }
  }
}
function read() {
  ensure();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  // backfill fields for data files created by older versions
  if (!db.customRequests) db.customRequests = [];
  if (!db.settings) db.settings = { ...SEED.settings };
  else db.settings = { ...SEED.settings, ...db.settings };
  return db;
}
function write(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

const newId = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- products ----------
export function getProducts({ onlyInStock = false } = {}) {
  const all = read().products;
  return onlyInStock ? all.filter(p => p.inStock) : all;
}
export function getProduct(id) { return read().products.find(p => p.id === id) || null; }

export function addProduct(data) {
  const db = read();
  const product = {
    id: newId('p'),
    name: data.name || 'Untitled',
    kind: data.kind || '',
    category: data.category || 'Gifts',
    price: Number(data.price) || 0,
    description: data.description || '',
    photo: data.photo || '',
    colorway: data.colorway || '#C9B98E',
    inStock: data.inStock !== false
  };
  db.products.push(product);
  write(db);
  return product;
}
export function updateProduct(id, data) {
  const db = read();
  const p = db.products.find(x => x.id === id);
  if (!p) return null;
  if (data.name !== undefined) p.name = data.name;
  if (data.kind !== undefined) p.kind = data.kind;
  if (data.category !== undefined) p.category = data.category;
  if (data.price !== undefined) p.price = Number(data.price) || 0;
  if (data.description !== undefined) p.description = data.description;
  if (data.photo !== undefined && data.photo !== '') p.photo = data.photo;
  if (data.colorway !== undefined) p.colorway = data.colorway;
  if (data.inStock !== undefined) p.inStock = data.inStock;
  write(db);
  return p;
}
export function deleteProduct(id) {
  const db = read();
  const before = db.products.length;
  db.products = db.products.filter(p => p.id !== id);
  write(db);
  return db.products.length < before;
}

// a photo value can be a full URL, an absolute path, or just a filename in /uploads
function normalizePhoto(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
  return '/uploads/' + v.replace(/^\/+/, '');
}

// bulk import from a spreadsheet. mode 'replace' clears the catalog first.
// (Past orders keep their own copy of item details, so replacing is safe for order history.)
export function importProducts(rows, { replace = false } = {}) {
  const db = read();
  if (replace) db.products = [];
  let added = 0;
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    db.products.push({
      id: newId('p'),
      name,
      kind: String(r.kind || '').trim(),
      category: String(r.category || 'Gifts').trim(),
      price: Number(r.price) || 0,
      description: String(r.description || '').trim(),
      photo: normalizePhoto(r.photo),
      colorway: String(r.colorway || '#C9B98E').trim(),
      inStock: r.inStock !== false
    });
    added++;
  }
  write(db);
  return { added, total: db.products.length };
}

// ---------- orders ----------
export function getOrders() {
  return read().orders.slice().sort((a, b) => b.createdAt - a.createdAt);
}
// Totals are computed here from stored prices — never trust the browser.
// paymentMethod: 'pay_later' (arrange with us) or 'card' (Stripe Checkout).
export function createOrder({ customer, address, items, paymentMethod = 'pay_later' }) {
  const db = read();
  const lines = [];
  let subtotal = 0;
  for (const it of (items || [])) {
    const prod = db.products.find(p => p.id === it.id);
    if (!prod) continue;
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    const lineTotal = prod.price * qty;
    subtotal += lineTotal;
    lines.push({ id: prod.id, name: prod.name, price: prod.price, qty, lineTotal });
  }
  const order = {
    id: newId('o'),
    number: 'UY-' + Math.floor(100000 + Math.random() * 900000),
    createdAt: Date.now(),
    customer: { name: customer?.name || '', email: customer?.email || '' },
    address: {
      line1: address?.line1 || '', city: address?.city || '',
      state: address?.state || '', zip: address?.zip || ''
    },
    items: lines,
    subtotal,
    shipping: Number(db.settings.shippingFlat) || 0,
    status: 'New',     // New -> Making -> Shipped
    paymentMethod,     // 'pay_later' | 'card'
    paid: false,
    stripeSessionId: ''
  };
  order.total = order.subtotal + order.shipping;
  db.orders.push(order);
  write(db);
  return order;
}
export function updateOrderStatus(id, status) {
  const db = read();
  const o = db.orders.find(x => x.id === id);
  if (!o) return null;
  o.status = status;
  write(db);
  return o;
}
export function attachStripeSession(orderId, sessionId) {
  const db = read();
  const o = db.orders.find(x => x.id === orderId);
  if (!o) return null;
  o.stripeSessionId = sessionId;
  write(db);
  return o;
}
// Marks an order paid (idempotent). Returns { order, wasAlreadyPaid }.
export function markOrderPaid(orderId) {
  const db = read();
  const o = db.orders.find(x => x.id === orderId);
  if (!o) return null;
  const wasAlreadyPaid = !!o.paid;
  if (!wasAlreadyPaid) { o.paid = true; write(db); }
  return { order: o, wasAlreadyPaid };
}

// ---------- settings ----------
export function getSettings() { return read().settings; }
export function updateSettings(patch) {
  const db = read();
  const s = db.settings;
  if (patch.instagram !== undefined) s.instagram = String(patch.instagram).trim();
  if (patch.email !== undefined) s.email = String(patch.email).trim();
  if (patch.customOrdersOpen !== undefined) s.customOrdersOpen = !!patch.customOrdersOpen;
  if (patch.customOrdersNote !== undefined) s.customOrdersNote = String(patch.customOrdersNote);
  if (patch.shippingFlat !== undefined) s.shippingFlat = Math.max(0, Number(patch.shippingFlat) || 0);
  // internal: Instagram auto-post rotation + token state
  if (patch.igLastPostAt !== undefined) s.igLastPostAt = Number(patch.igLastPostAt) || 0;
  if (patch.igNextIndex !== undefined) s.igNextIndex = Number(patch.igNextIndex) || 0;
  if (patch.igToken !== undefined) s.igToken = String(patch.igToken);
  if (patch.igTokenAt !== undefined) s.igTokenAt = Number(patch.igTokenAt) || 0;
  if (patch.igEnvToken !== undefined) s.igEnvToken = String(patch.igEnvToken);
  if (patch.igUserId !== undefined) s.igUserId = String(patch.igUserId);
  write(db);
  return s;
}

// ---------- custom order requests ----------
export function getCustomRequests() {
  return read().customRequests.slice().sort((a, b) => b.createdAt - a.createdAt);
}
export function addCustomRequest({ name, email, message, budget }) {
  const db = read();
  const reqItem = {
    id: newId('c'),
    createdAt: Date.now(),
    name: String(name || '').trim(),
    email: String(email || '').trim(),
    message: String(message || '').trim(),
    budget: String(budget || '').trim(),
    status: 'New'        // New -> Quoted -> Closed
  };
  db.customRequests.push(reqItem);
  write(db);
  return reqItem;
}
export function updateCustomRequestStatus(id, status) {
  const db = read();
  const r = db.customRequests.find(x => x.id === id);
  if (!r) return null;
  r.status = status;
  write(db);
  return r;
}

// ---------- dashboard stats ----------
export function getStats() {
  const db = read();
  const orders = db.orders;
  const revenue = orders.reduce((s, o) => s + o.subtotal, 0);
  const itemsSold = orders.reduce((s, o) => s + o.items.reduce((n, i) => n + i.qty, 0), 0);
  const toShip = orders.filter(o => o.status !== 'Shipped').length;
  const newRequests = db.customRequests.filter(r => r.status === 'New').length;
  // revenue grouped by day for the mini chart
  const byDay = {};
  for (const o of orders) {
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + o.subtotal;
  }
  return {
    revenue,
    orderCount: orders.length,
    itemsSold,
    toShip,
    newRequests,
    customOrdersOpen: db.settings.customOrdersOpen,
    avgOrder: orders.length ? revenue / orders.length : 0,
    byDay
  };
}
