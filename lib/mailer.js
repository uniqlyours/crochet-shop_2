// Optional order email notifications for UNIQLYours.
//
// Two delivery backends, picked automatically:
//   1. RESEND_API_KEY set        -> Resend HTTPS API (works on Railway Hobby,
//                                   which blocks all outbound SMTP ports).
//   2. SMTP_HOST/USER/PASS set   -> classic SMTP via nodemailer (needs a host
//                                   that allows outbound SMTP, e.g. Railway Pro).
// Neither set -> every function is a graceful no-op; the shop runs the same.
import nodemailer from 'nodemailer';

const {
  RESEND_API_KEY,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_EMAIL
} = process.env;

const FROM = SMTP_FROM || SMTP_USER || 'UNIQLYours <order@uniqlyours.com>';
const ADMIN_TO = ADMIN_EMAIL || SMTP_USER || 'order@uniqlyours.com';

let backend = null; // 'resend' | 'smtp' | null
let transporter = null;

if (RESEND_API_KEY) {
  backend = 'resend';
  console.log(`  ✉️  Email enabled via Resend — sending as ${FROM}`);
} else if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  backend = 'smtp';
  const port = Number(SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,            // 465 = SSL/TLS, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  console.log(`  ✉️  Email enabled via SMTP — sending as ${FROM}`);
} else {
  console.log('  ✉️  Email disabled (set RESEND_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS)');
}

// One send interface for both backends.
async function deliver({ to, subject, text, replyTo }) {
  if (backend === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM, to: [to], subject, text,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Resend ${r.status}: ${body.slice(0, 200)}`);
    }
  } else if (backend === 'smtp') {
    await transporter.sendMail({ from: FROM, to, subject, text, ...(replyTo ? { replyTo } : {}) });
  }
}

const money = (n) => '$' + Number(n || 0).toFixed(2);
const itemLines = (items = []) =>
  items.map(i => `  ${i.qty}× ${i.name} — ${money(i.lineTotal)}`).join('\n');

// New order: alert the shop owner, and send the customer a confirmation.
export async function sendOrderEmails(order) {
  if (!backend || !order) return;
  const a = order.address || {};
  const adminText =
`New order ${order.number}

From:    ${order.customer?.name} <${order.customer?.email}>
Ship to: ${a.line1}, ${a.city}, ${a.state} ${a.zip}

${itemLines(order.items)}

Subtotal: ${money(order.subtotal)}
Shipping: ${money(order.shipping || 0)}
Total:    ${money(order.total ?? order.subtotal)}
Payment:  ${order.paymentMethod === 'card' ? (order.paid ? 'PAID by card (Stripe)' : 'card — not completed') : 'pay later — arrange with customer'}`;

  const customerText =
`Hi ${order.customer?.name || 'there'},

Thanks for your order with UNIQLYours! We've received it and will start
making your piece soon.

Order ${order.number}
${itemLines(order.items)}
Subtotal: ${money(order.subtotal)}
Shipping: ${money(order.shipping || 0)}
Total: ${money(order.total ?? order.subtotal)}${order.paymentMethod === 'card' && order.paid ? ' — paid, thank you!' : ''}

We'll be in touch as soon as it ships.

— UNIQLYours`;

  try {
    await deliver({ to: ADMIN_TO, subject: `🧶 New order ${order.number}`, text: adminText });
    if (order.customer?.email) {
      await deliver({
        to: order.customer.email, replyTo: ADMIN_TO,
        subject: `Your UNIQLYours order ${order.number}`, text: customerText
      });
    }
  } catch (e) {
    console.error('[mailer] order email failed:', e.message);
  }
}

// New custom-order request: alert the shop owner.
export async function sendCustomRequestEmail(reqItem) {
  if (!backend || !reqItem) return;
  const text =
`New custom order request

From:   ${reqItem.name} <${reqItem.email}>
Budget: ${reqItem.budget || '—'}

${reqItem.message}`;
  try {
    await deliver({ to: ADMIN_TO, replyTo: reqItem.email, subject: '🧶 New custom request', text });
  } catch (e) {
    console.error('[mailer] custom request email failed:', e.message);
  }
}
