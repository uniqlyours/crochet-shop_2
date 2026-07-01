// Optional order email notifications for UNIQLYours.
//
// This module activates ONLY when SMTP_HOST, SMTP_USER and SMTP_PASS are set in the
// environment (.env locally, or Railway variables in production). When they are not
// set, every function below is a graceful no-op — the shop runs exactly the same,
// it just doesn't send email. That means you can deploy first and turn email on later.
import nodemailer from 'nodemailer';

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_EMAIL
} = process.env;

const ENABLED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (ENABLED) {
  const port = Number(SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,            // 465 = SSL/TLS, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  console.log(`  ✉️  Email enabled — sending as ${SMTP_FROM || SMTP_USER}`);
} else {
  console.log('  ✉️  Email disabled (set SMTP_HOST/SMTP_USER/SMTP_PASS to enable)');
}

const FROM = SMTP_FROM || SMTP_USER;          // what customers see in "from"
const ADMIN_TO = ADMIN_EMAIL || SMTP_USER;    // where new-order alerts go
const money = (n) => '$' + Number(n || 0).toFixed(2);
const itemLines = (items = []) =>
  items.map(i => `  ${i.qty}× ${i.name} — ${money(i.lineTotal)}`).join('\n');

// New order: alert the shop owner, and send the customer a confirmation.
export async function sendOrderEmails(order) {
  if (!transporter || !order) return;
  const a = order.address || {};
  const adminText =
`New order ${order.number}

From:    ${order.customer?.name} <${order.customer?.email}>
Ship to: ${a.line1}, ${a.city}, ${a.state} ${a.zip}

${itemLines(order.items)}

Total: ${money(order.subtotal)}`;

  const customerText =
`Hi ${order.customer?.name || 'there'},

Thanks for your order with UNIQLYours! We've received it and will start
making your piece soon.

Order ${order.number}
${itemLines(order.items)}
Total: ${money(order.subtotal)}

We'll be in touch as soon as it ships.

— UNIQLYours`;

  try {
    await transporter.sendMail({
      from: FROM, to: ADMIN_TO,
      subject: `🧶 New order ${order.number}`, text: adminText
    });
    if (order.customer?.email) {
      await transporter.sendMail({
        from: FROM, to: order.customer.email, replyTo: ADMIN_TO,
        subject: `Your UNIQLYours order ${order.number}`, text: customerText
      });
    }
  } catch (e) {
    console.error('[mailer] order email failed:', e.message);
  }
}

// New custom-order request: alert the shop owner.
export async function sendCustomRequestEmail(reqItem) {
  if (!transporter || !reqItem) return;
  const text =
`New custom order request

From:   ${reqItem.name} <${reqItem.email}>
Budget: ${reqItem.budget || '—'}

${reqItem.message}`;
  try {
    await transporter.sendMail({
      from: FROM, to: ADMIN_TO, replyTo: reqItem.email,
      subject: '🧶 New custom request', text
    });
  } catch (e) {
    console.error('[mailer] custom request email failed:', e.message);
  }
}
