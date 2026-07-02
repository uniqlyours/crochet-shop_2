// Optional Instagram auto-posting for UNIQLYours.
//
// Activates ONLY when IG_ACCESS_TOKEN and IG_USER_ID are set (Meta Graph API,
// Instagram Business account). Every IG_POST_EVERY_DAYS days (default 2) it
// picks the next in-stock product (rotating, so everything gets featured),
// and publishes its photo with a hand-written-feeling caption.
//
// Getting the token: Meta developer app with instagram_content_publish +
// pages_read_engagement, linked to the shop's Facebook Page / IG business
// account. Use a long-lived (60-day) or System User token.
import * as db from './store.js';

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER = process.env.IG_USER_ID;
const EVERY_DAYS = Math.max(1, Number(process.env.IG_POST_EVERY_DAYS) || 2);
const SITE = (process.env.SITE_URL || 'https://uniqlyours.com').replace(/\/$/, '');
const GRAPH = 'https://graph.facebook.com/v21.0';

export function instagramEnabled() { return !!(TOKEN && IG_USER); }

const HASHTAGS = '#crochet #handmade #crochetlove #amigurumi #handmadewithlove #shopsmall #crochetersofinstagram #uniqlyours';

function caption(p) {
  const openers = [
    `Fresh off the hook 🧶 ${p.name}`,
    `Meet the ${p.name} 🧶`,
    `Made stitch by stitch: ${p.name} 🧶`,
    `New in the shop 🧶 ${p.name}`
  ];
  const opener = openers[Math.floor(Math.random() * openers.length)];
  return `${opener}\n\n${p.description || 'Hand-crocheted with soft yarn and lots of love.'}\n\n$${Number(p.price).toFixed(2)} · link in bio or ${SITE.replace('https://', '')}\n\n${HASHTAGS}`;
}

async function graphPost(path, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data?.error?.message || `Graph API ${r.status}`);
  return data;
}

// Publish one product photo. Instagram needs a public image URL — the shop's
// own /uploads photos qualify. Two-step: create container, then publish.
export async function postProduct(p) {
  const imageUrl = SITE + p.photo;
  const container = await graphPost(`${IG_USER}/media`, {
    image_url: imageUrl,
    caption: caption(p)
  });
  const published = await graphPost(`${IG_USER}/media_publish`, { creation_id: container.id });
  return published.id;
}

// Called on an interval from server.js. State (rotation index + last post time)
// lives in settings so it survives restarts.
export async function maybeAutoPost() {
  if (!instagramEnabled()) return;
  try {
    const s = db.getSettings();
    const last = Number(s.igLastPostAt) || 0;
    if (Date.now() - last < EVERY_DAYS * 24 * 3600 * 1000) return;

    const products = db.getProducts({ onlyInStock: true }).filter(p => p.photo);
    if (!products.length) return;
    const idx = (Number(s.igNextIndex) || 0) % products.length;
    const p = products[idx];

    const mediaId = await postProduct(p);
    db.updateSettings({ igLastPostAt: Date.now(), igNextIndex: idx + 1 });
    console.log(`[instagram] posted ${p.name} (media ${mediaId})`);
  } catch (e) {
    console.error('[instagram] auto-post failed:', e.message);
  }
}
