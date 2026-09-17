# Iftikhar Enterprises — POS / ERP

Foam, mattress, bedding and healthcare retail management, built on Firebase.

Phone: 0322-6529414 · Currency: PKR · Dates: DD-MM-YYYY

---

## 1. Setup

1. Firebase config is already filled in at `js/firebase-config.js` (project `iftikhar-enterprises`).
2. Firebase Console → **Authentication** → enable **Email/Password**.
3. Firebase Console → **Firestore Database** → create in production mode.
4. Firestore → **Rules** tab → paste `firestore.rules` → **Publish**.
5. Firestore → **Indexes** → add the composite indexes listed in section 4 below.

### First Super Admin (one-time, by hand)

The app only creates staff users once someone with `users:create` is signed in, so the first account is made manually:

1. Authentication → **Add user** → set the owner's email and password.
2. Copy that user's **UID**.
3. Firestore → start collection `users` → document ID = that UID:
   ```json
   { "name": "Owner Name", "email": "owner@email.com", "role": "SUPER_ADMIN", "active": true }
   ```
4. Sign into the app with those credentials.
5. Go to **Users & Roles** → click **Seed Default Roles** (appears because `/roles` is empty). This creates all six roles with their permission matrix.
6. Go to **Products** → the seven default categories are created automatically on first visit.
7. Go to **Settings** → fill in address, tax, invoice prefix, discount limits, low-stock threshold.

From here, create all other staff from **Users & Roles**.

---

## 2. Where to deploy

### Option A — GitHub + Vercel

`vercel.json` is already included, so no build configuration is needed.

**Step 1 — put the code on GitHub**

Create an empty repository at [github.com/new](https://github.com/new). Name it `iftikhar-pos` and leave "Add a README" unticked. Then, from inside the project folder:

```bash
git init
git add .
git commit -m "Iftikhar Enterprises POS"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/iftikhar-pos.git
git push -u origin main
```

If GitHub asks for a password, it wants a **personal access token**, not your account password: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate, with Contents read/write on this repo. Paste the token as the password.

Prefer clicking to typing? Install [GitHub Desktop](https://desktop.github.com), choose **Add local repository**, point it at the folder, then **Publish repository**.

**Step 2 — deploy on Vercel**

1. Sign in at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project** → import `iftikhar-pos`.
3. Framework Preset: **Other**. Leave Build Command and Output Directory **empty** — this is a static site with nothing to build.
4. **Deploy.**

You get a URL like `https://iftikhar-pos.vercel.app` in under a minute. Every `git push` afterwards redeploys automatically.

**Step 3 — authorize the domain in Firebase (required, or login will fail)**

Firebase Console → **Authentication → Settings → Authorized domains → Add domain** → enter your Vercel domain (`iftikhar-pos.vercel.app`). Without this step, sign-in is rejected on the live site even though everything else works.

**Step 4 — publish your Firestore rules**

Vercel only hosts the front end; your database rules still live in Firebase. Firestore → **Rules** tab → paste the contents of `firestore.rules` → **Publish**. Do this before letting staff in, or your data is wide open.

> **A note on the config file:** `js/firebase-config.js` will be publicly visible in your GitHub repo and in the browser. That is normal and expected — Firebase web config keys are identifiers, not secrets. What actually protects your data is the Firestore security rules from step 4. If you'd rather keep the repo private anyway, GitHub private repos work with Vercel's free tier.

### Option B — Firebase Hosting

Install the CLI once (needs Node.js on your machine):

```bash
npm install -g firebase-tools
firebase login
```

From inside the project folder:

```bash
firebase init hosting
```

Answer the prompts:
- **Use an existing project** → `iftikhar-enterprises`
- **Public directory** → `.` (a single dot — your files are in the root, not in `dist` or `public`)
- **Single-page app?** → `Yes`
- **Set up automatic builds with GitHub?** → `No`
- **Overwrite index.html?** → **No** (important — this would delete your app)

Then deploy:

```bash
firebase deploy --only hosting,firestore:rules
```

Your POS goes live at `https://iftikhar-enterprises.web.app`. Every future update is just `firebase deploy --only hosting` again. The advantage over Vercel is that hosting and database sit in one project, so the authorized-domain step is handled for you.

To use your own domain (e.g. `pos.iftikharenterprises.com`), go to Hosting → **Add custom domain** and follow the DNS instructions.

### Option C — Shared hosting / cPanel

Upload all files over FTP to `public_html`. It works because this is plain HTML/JS with no build step. Add the domain to Firebase's **Authorized domains** list as above. Make sure the site is served over HTTPS.

### What not to do

Don't open `index.html` directly from your hard drive (`file://`). ES modules and Firebase Auth both fail on the `file://` protocol. If you want to test locally, run:

```bash
npx serve .
```

and open the `http://localhost:3000` address it prints.

### Daily use on the shop counter

Once deployed, open the URL in Chrome on the billing computer and use **⋮ → Cast, save and share → Install page as app**. It then opens in its own window like a desktop program. The same URL works on a phone or tablet for stock checks.

---

## 3. Modules

**Dashboard** — today's sales, purchases, expenses, gross profit, cash received, credit sales, customer and supplier payments; inventory, receivables and payables summaries; month-to-date P&L; sales and purchase trend charts; top products, category-wise sales, payment-method breakdown; notification panel for low stock, out of stock, over-credit-limit customers and pending deliveries.

**POS / Billing** — barcode scan, live search, category filter, product grid, editable cart, custom-size item builder (length × width × thickness priced by sq ft / cu ft / piece), customer selection with previous balance, split payments across Cash / Bank Transfer / JazzCash / Easypaisa / Card / Credit, delivery details, discount and credit-limit enforcement. Hotkeys: **F2** search, **F9** complete sale.

**Sales History** — Today / Yesterday / Week / Month / All filters, totals, reprint and WhatsApp share.

**Returns** — sale returns by invoice lookup (per-line return quantity, restock toggle, refund or customer credit) and purchase returns against a supplier invoice.

**Orders & Delivery** — delivery board with Pending / Scheduled / Out for Delivery / Delivered / Cancelled, and custom mattress orders with dimensions, advance, remaining, expected completion and production status.

**Products** — all seven categories with per-category fields, SKU and barcode generation with duplicate rejection, multiple price tiers, minimum stock levels, custom size calculator.

**Stock** — stock value at cost and sale, low-stock and out-of-stock alerts, per-product ledger (opening + purchase − sale + returns ± adjustments = current), manual entries for adjustment, damage and expiry.

**Purchases** — multi-line purchase entry that increases stock on confirmation, updates weighted-average cost, and posts to the supplier ledger and cash book.

**Customers / Suppliers** — full CRM, running ledgers, receive-payment and pay-supplier flows, printable A4 statements.

**Expenses & Cash** — 11 expense categories and a daily cash book with opening cash, inflows, outflows and closing cash reconciliation.

**Reports** — 20 reports plus Profit & Loss, each with period presets or a custom date range, in-report search, print and CSV export.

**Admin** — audit log (user, action, module, before/after values), monthly closing with lockable historical data, full JSON backup and per-collection CSV exports.

**Settings** — business details, currency, tax, invoice numbering, receipt size, discount and stock policies, branches and warehouses.

**Users & Roles** — six roles (Super Admin, Admin, Manager, Cashier, Stock Manager, Accountant) over a module × action permission matrix, enforced both in the UI and in Firestore rules. Cashiers cannot reach financial reports unless granted.

---

## 4. Firestore indexes

Firestore will show a console error with a one-click "create index" link the first time each of these is needed. Creating them up front avoids that:

| Collection | Fields |
|---|---|
| `stockMovements` | `productId` ASC, `at` ASC |
| `customerLedger` | `customerId` ASC, `at` ASC |
| `supplierLedger` | `supplierId` ASC, `at` ASC |
| `saleItems` | `saleId` ASC |
| `purchaseItems` | `purchaseId` ASC |
| `sales` | `createdAt` DESC |
| `purchases` | `createdAt` DESC |

---

## 5. Things to know

- **Accounting rules are enforced in code**: a sale drops stock and raises either cash or receivables; a purchase raises stock and drops cash or raises payables; returns reverse both sides. Nothing is double-counted.
- **Costing is weighted average**, recalculated on each purchase. The data model leaves room for FIFO later.
- **Ledgers are append-only** — Firestore rules block updates and deletes on ledger entries and stock movements, so history can't be quietly rewritten.
- **PDF export uses the browser's print-to-PDF** (choose "Save as PDF" in the print dialog) rather than bundling a PDF library. This keeps the app dependency-free and produces better output for thermal receipts.
- **Bulk operations run in the browser.** Once you're past a few thousand invoices, the Reports page will get slow because it loads collections client-side. At that point, move report aggregation into a scheduled Cloud Function that writes daily summary documents.
- **Barcodes are internal sequential numbers**, scannable as Code128 by any standard scanner. They are not certified EAN-13 codes, which you'd only need to sell through other retailers.
