// Lightweight admin auth with zero extra dependencies.
// Password is read from the ADMIN_PASSWORD env var; the login issues a signed,
// httpOnly cookie so it can't be read or forged from the browser.
import crypto from 'crypto';

const PASSWORD = process.env.ADMIN_PASSWORD || 'crochet-admin';
const SECRET = process.env.SESSION_SECRET || 'change-me-please-' + (process.env.ADMIN_PASSWORD || '');
const COOKIE = 'lp_admin';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(value) {
  const mac = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  return value + '.' + mac;
}
function verify(signed) {
  if (!signed || !signed.includes('.')) return false;
  const i = signed.lastIndexOf('.');
  const value = signed.slice(0, i), mac = signed.slice(i + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? value : false;
  } catch { return false; }
}

export function checkPassword(input) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function issueCookie(res) {
  const token = sign('admin:' + Date.now());
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE * 1000, path: '/'
  });
}
export function clearCookie(res) { res.clearCookie(COOKIE, { path: '/' }); }

export function isAuthed(req) {
  const token = req.cookies?.[COOKIE];
  return verify(token) !== false;
}

// Express middleware to protect admin API routes.
export function requireAdmin(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}
