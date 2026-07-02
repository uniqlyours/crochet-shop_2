// Optional Instagram auto-posting for UNIQLYours.
//
// Uses the "Instagram API with Instagram Login" (Meta app dashboard token) —
// a long-lived Instagram Business token pasted once into the environment as
// IG_ACCESS_TOKEN. The IG user id is discovered automatically, and the token
// is auto-refreshed (Instagram long-lived tokens last 60 days; we refresh
// weekly and persist the newest token in the data store, so the env var only
// has to be right once).
//
// Every IG_POST_EVERY_DAYS days (default 2) it picks the next in-stock
// product (rotating), and publishes its photo with a caption.
import * as db from './store.js';

const ENV_TOKEN = process.env.IG_ACCESS_TOKEN;
const EVERY_DAYS = Math.max(1, Number(process.env.IG_POST_EVERY_DAYS) || 2);
const SITE = (process.env.SITE_URL || 'https://uniqlyours.com').replace(/\/$/, '');
const GRAPH = 'https://graph.instagram.com/v21.0';

export function instagramEnabled() {
  return !!(ENV_TOKEN || db.getSettings().igToken);
}

// The freshest token wins: a refreshed one saved in settings, else the env var.
// (If the env var CHANGES, treat it as a new manual token and prefer it.)
function currentToken() {
  const s = db.getSettings();
  if (ENV_TOKEN && s.igEnvToken !== ENV_TOKEN) return ENV_TOKEN;
  return s.igToken || ENV_TOKEN;
}

async function graphGet(path, params = {}) {
  const q = new URLSearchParams({ ...params, access_token: currentToken() });
  const r = await fetch(`${GRAPH}/${path}?${q}`);
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data?.error?.message || `Graph GET ${r.status}`);
  return data;
}

async function graphPost(path, params) {
  const body = new URLSearchParams({ ...params, access_token: currentToken() });
  const r = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data?.error?.message || `Graph POST ${r.status}`);
  return data;
}

async function igUserId() {
  const s = db.getSettings();
  if (s.igUserId) return s.igUserId;
  const me = await graphGet('me', { fields: 'user_id,username' });
  const id = me.user_id || me.id;
  db.updateSettings({ igUserId: String(id) });
  console.log(`[instagram] connected as @${me.username} (${id})`);
  return id;
}

// Refresh the long-lived token if it's older than 7 days (they last 60).
async function maybeRefreshToken() {
  const s = db.getSettings();
  const age = Date.now() - (Number(s.igTokenAt) || 0);
  if (s.igToken && age < 7 * 24 * 3600 * 1000) return;
  try {
    const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: currentToken() });
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?${q}`);
    const data = await r.json();
    if (data.access_token) {
      db.updateSettings({ igToken: data.access_token, igTokenAt: Date.now(), igEnvToken: ENV_TOKEN || '' });
      console.log('[instagram] access token refreshed');
    }
  } catch (e) {
    console.error('[instagram] token refresh failed:', e.message);
  }
}

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

// Wait for a media container (videos process asynchronously) then publish it.
async function waitAndPublish(user, containerId, isVideo) {
  if (isVideo) {
    for (let i = 0; i < 30; i++) {                       // up to ~5 minutes
      const st = await graphGet(String(containerId), { fields: 'status_code' });
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR') throw new Error('video processing failed');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  const published = await graphPost(`${user}/media_publish`, { creation_id: containerId });
  return published.id;
}

// Publish one product photo (public URL required — the shop's own photos qualify).
export async function postProduct(p) {
  const user = await igUserId();
  const container = await graphPost(`${user}/media`, {
    image_url: SITE + p.photo,
    caption: caption(p)
  });
  return waitAndPublish(user, container.id, false);
}

// Publish one queue item: a tip-card image or a reel video.
export async function postSocial(item) {
  const user = await igUserId();
  const isReel = item.type === 'reel';
  const container = await graphPost(`${user}/media`, isReel
    ? { media_type: 'REELS', video_url: SITE + item.file, caption: item.caption, share_to_feed: 'true' }
    : { image_url: SITE + item.file, caption: item.caption });
  return waitAndPublish(user, container.id, isReel);
}

// Called on an interval from server.js. Alternates product posts with
// tip cards / reels / admin-uploaded media from the social queue.
export async function maybeAutoPost() {
  if (!instagramEnabled()) return;
  try {
    await maybeRefreshToken();
    const s = db.getSettings();
    const last = Number(s.igLastPostAt) || 0;
    if (Date.now() - last < EVERY_DAYS * 24 * 3600 * 1000) return;

    const products = db.getProducts({ onlyInStock: true }).filter(p => p.photo);
    const social = db.getSocial();
    const wantSocial = (s.igLastType === 'product' && social.length) || !products.length;

    if (wantSocial && social.length) {
      const idx = (Number(s.igSocialIdx) || 0) % social.length;
      const item = social[idx];
      const mediaId = await postSocial(item);
      db.updateSettings({ igLastPostAt: Date.now(), igSocialIdx: idx + 1, igLastType: 'social' });
      console.log(`[instagram] posted ${item.type} ${item.id} (media ${mediaId})`);
    } else if (products.length) {
      const idx = (Number(s.igNextIndex) || 0) % products.length;
      const p = products[idx];
      const mediaId = await postProduct(p);
      db.updateSettings({ igLastPostAt: Date.now(), igNextIndex: idx + 1, igLastType: 'product' });
      console.log(`[instagram] posted ${p.name} (media ${mediaId})`);
    }
  } catch (e) {
    console.error('[instagram] auto-post failed:', e.message);
  }
}
