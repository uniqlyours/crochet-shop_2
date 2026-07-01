# Deploying UNIQLYours to Railway

This is the plain-English, do-this-then-that guide to put the shop online at
**uniqlyours.com** with storage that never loses your products or orders, and with
order emails from **order@uniqlyours.com**.

You'll do five things:

1. Put the code on Railway
2. Add a Volume (so data survives)
3. Set the environment variables
4. Point uniqlyours.com at it
5. Turn on order emails

Budget: about **$5/month** (Railway Hobby plan). There's no permanent free tier that
keeps a shop running 24/7 with storage.

---

## 1. Put the code on Railway

**Recommended: deploy from GitHub** (this gives you one-click updates later).

1. Create a free GitHub account if you don't have one, and make a new **private**
   repository called `uniqly-yours`.
2. Upload this whole project folder to that repo. Easiest way: in VS Code, open this
   folder, click the **Source Control** icon on the left, "Publish to GitHub", and pick
   the private repo. (The `.gitignore` already keeps your password file `.env` and
   `node_modules` out — but your products and photos **are** included on purpose.)
3. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo →**
   select `uniqly-yours`. Railway detects Node and builds it automatically.

**Quicker alternative (no GitHub): Railway CLI.**
In a terminal opened in this folder:
```
npm install -g @railway/cli
railway login
railway init
railway up
```
This uploads the folder straight to a new Railway service. (Downside: you re-run
`railway up` by hand for each update, instead of just pushing to GitHub.)

Either way, after a minute Railway gives you a temporary URL like
`uniqly-yours-production.up.railway.app`. Open it — the shop should load with your 24
products. (At this point data is **not yet permanent** — that's step 2.)

---

## 2. Add a Volume (so nothing gets wiped)

Railway containers have a throwaway filesystem. Without a Volume, every redeploy resets
your shop to the starting catalog and loses new orders. The Volume fixes that.

1. In your Railway project, press **⌘K / Ctrl-K** (or right-click the service) →
   **"Add Volume"**.
2. Set the **mount path** to:
   ```
   /data
   ```
3. Railway redeploys the service with the volume attached.

On its first boot with the empty volume, the app automatically copies your current
catalog (the 24 products + settings) into `/data`. From then on, `/data` is the source
of truth and survives every future deploy.

---

## 3. Set the environment variables

In the service's **Variables** tab, add these (click "New Variable" for each):

| Variable | Value | Why |
|---|---|---|
| `DATA_DIR` | `/data` | Store products/orders on the volume |
| `UPLOADS_DIR` | `/data/uploads` | Store uploaded photos on the volume |
| `SITE_URL` | `https://uniqlyours.com` | SEO sitemap + social previews |
| `ADMIN_PASSWORD` | *a strong password you choose* | Your admin login |
| `SESSION_SECRET` | *a long random string* | Signs the login cookie |
| `NODE_ENV` | `production` | Standard production flag |

For `SESSION_SECRET`, mash the keyboard for 40+ random characters, or generate one.
After adding these, Railway redeploys automatically.

> You do **not** need to set `PORT` — Railway provides it.

---

## 4. Point uniqlyours.com at the shop

1. In the service → **Settings → Networking → Custom Domain**, type `uniqlyours.com`
   and also add `www.uniqlyours.com`.
2. Railway shows you **two DNS records to create** for each: a **CNAME** (routes the
   traffic) and a **TXT** (proves you own the domain). **Both are required** — without
   the TXT record the domain returns a 404 even after the CNAME works.
3. Log in to wherever you bought the domain (your registrar's DNS settings) and add the
   exact records Railway shows you.
   - The `www` subdomain takes a normal **CNAME** with no fuss.
   - The bare/root `uniqlyours.com` (the "apex") can't use a plain CNAME by DNS rules.
     The cleanest fix: move the domain's DNS to **Cloudflare** (free) — Cloudflare does
     "CNAME flattening" so a CNAME on the root just works. If you'd rather not, set up
     `www.uniqlyours.com` as the main address and a redirect from the root.
4. DNS can take anywhere from a few minutes to a couple of hours. Railway auto-issues the
   HTTPS certificate once the records verify.

I can walk you through the exact records once you tell me your registrar.

---

## 5. Turn on order emails (order@uniqlyours.com)

Email stays off until you give the app your mailbox's SMTP login. Add these variables in
the **Variables** tab (same place as step 3):

| Variable | Example | Notes |
|---|---|---|
| `SMTP_HOST` | `mail.privateemail.com` | From your email host (see below) |
| `SMTP_PORT` | `465` | 465 = SSL; use 587 if your host says so |
| `SMTP_USER` | `order@uniqlyours.com` | The full mailbox address |
| `SMTP_PASS` | *the mailbox password* | Or an "app password" (Google) |
| `SMTP_FROM` | `UNIQLYours <order@uniqlyours.com>` | What customers see |
| `ADMIN_EMAIL` | `order@uniqlyours.com` | Where new-order alerts go |

Common hosts' SMTP settings:
- **Namecheap Private Email** — host `mail.privateemail.com`, port `465`
- **Zoho Mail** — host `smtp.zoho.com`, port `465`
- **Google Workspace** — host `smtp.gmail.com`, port `465`, and use an **App Password**
  (not your normal Google password)

Once set, every new order emails you an alert **and** sends the customer a confirmation;
custom-order requests email you too. Place a test order to confirm it arrives.

---

## Quick checklist

- [ ] Service deployed on Railway, temporary URL loads the shop
- [ ] Volume mounted at `/data`, redeployed
- [ ] `DATA_DIR`, `UPLOADS_DIR`, `SITE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV` set
- [ ] `uniqlyours.com` + `www` added, DNS records created and verified
- [ ] SMTP variables set, test order email received
- [ ] Changed the admin password from the old default
- [ ] Submitted `https://uniqlyours.com/sitemap.xml` to Google Search Console

When you're ready, send me your registrar and email host and I'll give you the precise
values to paste in.
