# UNIQLYours — handmade crochet shop

A cozy online shop with a storefront, a shopping basket, checkout, and a private
admin area where you can add products (with photos and prices), see orders with
shipping addresses, and watch revenue on a simple dashboard.

It runs on your own computer with no accounts to sign up for. Everything is saved
to a single file (`data/store.json`) and uploaded photos go in `public/uploads/`.

---

## Run it (in Visual Studio / VS Code)

1. Install **Node.js** (version 18 or newer) from https://nodejs.org if you don't have it.
2. Open this folder in Visual Studio Code.
3. Open the terminal (**Terminal → New Terminal**) and run:

   ```bash
   npm install
   npm start
   ```

4. Open your browser to:
   - **Shop:** http://localhost:3000
   - **Admin:** http://localhost:3000/admin

The admin password is **`crochet-admin`** to start. Change it before going live (see below).

> Tip: `npm run dev` restarts the server automatically whenever you edit a file.

---

## How your wife adds her real products

1. Go to **http://localhost:3000/admin** and sign in.
2. Click **Products → “+ Add a product.”**
3. Fill in the name, type, category, price, and a short description.
4. Click **choose file** to upload a photo (a bright, square-ish JPG/PNG works best).
   You'll see a preview right away.
5. Click **Save product.** It appears in the shop instantly.

To change or remove something later, use **Edit** or **Delete** on any product card.
The nine starter products are placeholders — delete them whenever you're ready.

---

## Adding lots of products at once (Excel import)

For a whole catalog, use **Admin → Import (Excel)** instead of adding one at a time:

1. **Download the template** (an `.xlsx`) from the Import page and fill in one row per
   product — name, type, category, price, description, photo, color, in stock. Category
   and "in stock" have dropdowns.
2. **Upload your photos.** On the same page, drop in all your product photos at once.
   Name them simply (e.g. `hearthside-throw.jpg`) and you'll get back the exact filename
   for each — paste that into the spreadsheet's **photo** column. No outside image host
   is needed. (Prefer to host images elsewhere? Paste a full image **URL** into the photo
   column instead.)
3. **Upload the spreadsheet.** You'll see a **preview** of every row — prices, thumbnails,
   and any problems flagged — before anything is saved. Then choose:
   - **Add to my catalog** — keeps existing products and adds these on top, or
   - **Replace my whole catalog** — uses the sheet as the complete list (past orders are
     unaffected).

This is the easiest way to manage the shop in bulk: keep products in the spreadsheet and
re-import whenever you want to make changes.

---

## What's in the admin area

- **Dashboard** — total revenue, number of orders, items sold, average order value,
  a 14-day revenue chart, and a custom-orders status banner.
- **Products** — add / edit / delete items, upload photos, set prices, hide things
  that are out of stock.
- **Import (Excel)** — bulk-add a whole catalog from a spreadsheet, with a photo
  uploader and a preview before anything goes live.
- **Orders** — every order with the customer's name, email, **shipping address**,
  what they bought, and the total. Update each order's status (New → Making → Shipped).
- **Custom requests** — messages from people who want something made just for them,
  each with a status (New → Quoted → Closed).
- **Settings** — your Instagram link, contact email, and the **custom-orders on/off switch.**

---

## Your Instagram link & contact email

Go to **Admin → Settings**, paste your full Instagram URL (e.g.
`https://instagram.com/yourshop`) and your contact email, and Save. The Instagram link
then shows in the shop's header and footer, and the email becomes an "Email us" link.
Leave a field blank to hide it.

---

## Opening and closing custom orders

Sometimes you're too busy to take custom work — so you can switch it off.

In **Admin → Settings**, toggle **"Accept custom orders."**
- **On:** the shop shows a "Want something made just for you?" section with a request
  form. Submissions land in **Admin → Custom requests.**
- **Off:** that section shows a friendly "Custom orders are paused" message instead, and
  the form won't accept new requests (this is enforced on the server, not just hidden).

The ready-made products stay available to buy either way.

---

## A note on payments

Checkout currently uses a **demo payment step** — it records the order but does **not**
charge a real card. That's so the whole thing runs without any setup. When you're ready
to take real money, connect **Stripe** (see below).

---

## Showing up on Google (SEO)

The shop already includes the on-page pieces Google looks for: a descriptive page
title and meta description, social-share preview tags (so links look good on Instagram,
Facebook, etc.), a favicon, structured data that tells Google it's a store, and a
`robots.txt` and `sitemap.xml`.

Two things still have to happen for it to actually appear in Google — and both need the
site to be **live on a public web address** first (Google can't see `localhost`):

1. **Domain is already set.** The site is wired to `uniqlyours.com` — `SITE_URL` defaults
   to `https://uniqlyours.com`, and the `canonical`, `og:url`, and `og:image` tags in
   `public/index.html` already point there. (If you ever change domains, update those.)
2. **Tell Google about it.** Once hosted, add your site to **Google Search Console**
   (free), and submit `https://uniqlyours.com/sitemap.xml`. Indexing then takes anywhere
   from a few days to a few weeks.

See **DEPLOY.md** for the full step-by-step on deploying to Railway and pointing the domain.

---

## Going live (when you're ready)

This version is built to run on your own computer, which is perfect for setting it up
and adding products. To put it on the internet for customers, you'll want three upgrades:

1. **Real card payments — Stripe.** Create a Stripe account, drop your keys into `.env`
   (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`), and swap the demo checkout for a
   Stripe Checkout session. I can wire this up for you.
2. **A hosted database.** The local `data/store.json` file is great for one computer.
   For a live site, move products and orders to a hosted database (e.g. Postgres /
   Supabase) so nothing is lost. The code is organized so this is a contained change —
   everything talks to `lib/store.js`.
3. **Photo storage + hosting.** On most hosts the local `public/uploads` folder isn't
   permanent, so product photos should go to file storage (e.g. Supabase Storage or S3),
   and the app can be deployed somewhere like a small server or a host that allows file
   writes.

---

## Security before launch

- Change `ADMIN_PASSWORD` and `SESSION_SECRET` in a `.env` file (copy `.env.example` to
  `.env` first). Never commit `.env`.
- The admin login is intentionally simple for a one-person shop. For multiple staff or
  stronger protection, we can move to a managed login service.

---

## Project layout

```
crochet-shop/
├─ server.js            # the web server + all API routes
├─ lib/
│  ├─ store.js          # reads/writes products & orders (the "database")
│  └─ auth.js           # admin login (signed cookie, no extra dependencies)
├─ data/store.json      # your products & orders live here (created on first run)
├─ public/
│  ├─ index.html        # the shop
│  ├─ shop.css, app.js  # shop styling & behavior
│  ├─ uploads/          # product photos you upload
│  └─ admin/            # the admin dashboard, products, orders, login pages
├─ .env.example         # copy to .env and set your password/secret
└─ package.json
```
