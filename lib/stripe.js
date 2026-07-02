// Minimal Stripe integration over the REST API (no SDK needed, Node 18+ fetch).
// Enabled when STRIPE_SECRET_KEY is set; the shop works fine without it
// (pay-later orders only). STRIPE_WEBHOOK_SECRET enables webhook verification.
import crypto from 'crypto';

const API = 'https://api.stripe.com/v1';

export function stripeEnabled() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function authHeaders() {
  return {
    'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

// flatten {a:{b:1}, c:[{d:2}]} -> "a[b]=1&c[0][d]=2" (Stripe's form encoding)
function encodeForm(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') encodeForm(item, `${key}[${i}]`, out);
        else out.push(`${key}[${i}]=` + encodeURIComponent(item));
      });
    } else if (typeof v === 'object') {
      encodeForm(v, key, out);
    } else {
      out.push(`${key}=` + encodeURIComponent(v));
    }
  }
  return out.join('&');
}

async function stripePost(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: authHeaders(), body: encodeForm(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Stripe error (${r.status})`);
  return data;
}

async function stripeGet(path) {
  const r = await fetch(API + path, { headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY } });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Stripe error (${r.status})`);
  return data;
}

// Create a hosted Checkout session for an order already saved (unpaid) in the store.
export async function createCheckoutSession(order, siteUrl) {
  const line_items = order.items.map(li => ({
    quantity: li.qty,
    price_data: {
      currency: 'usd',
      unit_amount: Math.round(li.price * 100),
      product_data: { name: li.name }
    }
  }));
  if (order.shipping > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(order.shipping * 100),
        product_data: { name: 'Shipping' }
      }
    });
  }
  return stripePost('/checkout/sessions', {
    mode: 'payment',
    customer_email: order.customer.email || undefined,
    line_items,
    metadata: { order_id: order.id, order_number: order.number },
    success_url: `${siteUrl}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/?canceled=1`
  });
}

export function getCheckoutSession(id) {
  return stripeGet('/checkout/sessions/' + encodeURIComponent(id));
}

// Verify a "stripe-signature" header against the raw request body.
export function verifyWebhookSignature(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=').map(s => s.trim())));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}
