# Success Academy

One Vercel deployment: a static frontend (`index.html`, `admin.html`) plus Node.js serverless functions in `api/`, backed by **Turso** (database) and **Cloudflare R2** (images). The old separate Render backend is no longer needed.

```
success-academy/
├── api/                 Serverless functions (Vercel routes each file)
│   ├── exams.js         GET  /api/exams
│   ├── news.js          GET  /api/news
│   ├── visitors.js      POST /api/visitors
│   ├── enquiries.js     POST /api/enquiries
│   ├── checkout.js      POST /api/checkout
│   ├── config.js        GET  /api/config
│   ├── health.js        GET  /api/health
│   ├── pins/
│   │   ├── claim.js     POST /api/pins/claim
│   │   └── verify.js    POST /api/pins/verify
│   └── admin/           Cookie-protected admin endpoints
├── lib/                 Shared server modules (DB, auth, Paystack, R2, …)
├── test/                node:test suite (in-memory SQLite, mocked Paystack)
├── assets/              Logos used by the admin/uploads (root PNGs are used by the UI)
├── index.html           Public site (original UI)
├── admin.html           Admin dashboard (original UI)
├── script.js            Public site logic
├── admin.js             Admin dashboard logic
├── style.css            Public site styles (original)
├── vercel.json          Headers + function duration
└── .env.example         Every environment variable
```

## How it works

1. The browser loads exams from `GET /api/exams`. Subject answer content and private Q&A images are **not** included in this response.
2. Checkout is created server-side with `POST /api/checkout`. The server reads prices from Turso, creates a pending order and an **inactive PIN**, then initializes a Paystack transaction. The browser is redirected to Paystack's hosted checkout.
3. Paystack redirects back with a reference. The browser calls `POST /api/pins/claim`; the server verifies the transaction directly with Paystack (reference, amount, currency), marks the order paid, and activates the PIN. Claiming is idempotent.
4. The PIN is bound to the device ID used at checkout. `POST /api/pins/verify` only returns the subjects that were purchased.
5. The admin dashboard uses a signed, HttpOnly session cookie. Image uploads use short-lived presigned R2 `PUT` URLs, so files go straight from the admin browser to R2 and never pass through Vercel.
6. `GET /api/config` returns the Paystack public key (safe to expose) and whether payments are enabled. The key comes from `PAYSTACK_PUBLIC_KEY`, falling back to the built-in key in `lib/paystack.js`.

## Environment variables

Copy `.env.example` to `.env` (or `.env.local` for machine-only test keys) for local work, and add the same variables in **Vercel → Project → Settings → Environment Variables**.

`vercel dev` loads `.env`, but zero-config projects do not load `.env.local` automatically. `lib/env.js` loads `.env.local` explicitly on local/development runs without overwriting variables that are already set, so `.env.local` is a safe place for Paystack test keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Yes | Turso database URL (`libsql://…`) |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token |
| `ADMIN_PASSWORD` | Yes | Password for `/admin` |
| `ADMIN_SESSION_SECRET` | Strongly recommended | Random string used to sign the admin cookie. Generate with `openssl rand -hex 32`. If omitted, `ADMIN_PASSWORD` is used as the signing secret. |
| `PAYSTACK_SECRET_KEY` | Yes for checkout | Paystack **secret** key (`sk_live_…` or `sk_test_…`). Without it checkout returns `503`. |
| `PAYSTACK_PUBLIC_KEY` | Optional | Paystack **public** key (`pk_live_…` or `pk_test_…`), returned by `GET /api/config`. If unset, the built-in fallback key in `lib/paystack.js` is used. |
| `PUBLIC_BASE_URL` | Optional | Only needed for a custom domain or to force the Paystack return URL. On Vercel the request host is used automatically. |
| `R2_ENDPOINT` | Yes for uploads | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | Yes for uploads | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | Yes for uploads | R2 API token secret |
| `R2_BUCKET_NAME` | Yes for uploads | Bucket name |
| `R2_PUBLIC_URL` | Yes for uploads | Public bucket URL (`https://pub-….r2.dev` or a custom domain) |
| `RESEND_API_KEY` | Optional | Enables email replies from the admin dashboard |
| `EMAIL_FROM` | Optional | Verified Resend sender, e.g. `Success Academy <support@yourdomain.com>` |

The admin UI will still work without Resend; use the WhatsApp button beside each enquiry instead.

## Turso setup

1. Create a database in the Turso dashboard (or `turso db create success-academy`).
2. Copy the database URL and create/copy an auth token.
3. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

The API uses Turso's official serverless driver (`@tursodatabase/serverless`) through its libSQL-compatible layer, so every query is plain SQL over HTTP with no native modules.

The schema is created and migrated lazily on the first API request. Migrations are **additive and idempotent**:

- Existing tables `exams`, `pins`, `enquiries`, `news`, `visitors` are kept.
- New tables: `orders`, `rate_limits`, `meta`.
- New columns: `exams.updatedAt`, `pins.orderRef`, `pins.active`, `pins.lastUsedAt`, `enquiries.repliedAt`, `news.updatedAt`.
- Existing PINs get `active = 1`, so previously issued PINs keep working.
- Existing exams and PIN data are not overwritten. Missing default exams are seeded with `INSERT OR IGNORE`.

> If the database already contains important production data, take a Turso backup/exports before the first deployment. The migration is designed to preserve data, but a backup is always the safe move.

## Cloudflare R2 setup

1. Create an R2 bucket.
2. Create an R2 API token with **Object Read & Write** access to the bucket.
3. Enable public access (r2.dev subdomain or a custom domain) and copy that URL into `R2_PUBLIC_URL`.
4. Set `R2_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`.
5. Add a **CORS policy** to the bucket. Browser uploads use presigned `PUT` requests, so the deployed origin must be allowed:

```json
[
  {
    "AllowedOrigins": [
      "https://your-project.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your custom domain and any Vercel preview domains that need uploads. Without this CORS policy, the admin browser can obtain an upload URL but R2 will block the actual upload.

## Paystack setup

1. Add `PAYSTACK_SECRET_KEY` in Vercel. The public site never receives the secret key.
2. Paystack returns the buyer to the site automatically with `?reference=…&trxref=…`. If you use a custom domain, set `PUBLIC_BASE_URL` to it; otherwise leave it unset.
3. Checkout uses Paystack's hosted page, so the frontend does not need the public key to complete a payment. `PAYSTACK_PUBLIC_KEY` is exposed by `GET /api/config` for any client-side Paystack use, and falls back to the built-in key when the variable is not set.
4. Amounts are stored and compared in **kobo** (`price × 100`), and currency is verified as `NGN`.
5. Use test keys first. A test transaction can be completed with Paystack's test cards. Switch to live keys only when ready.

For local test mode, put `PAYSTACK_SECRET_KEY=sk_test_…` and `PAYSTACK_PUBLIC_KEY=pk_test_…` in `.env.local`, then restart `vercel dev`. `GET /api/health` should report `"payments": true`.

## Deploy to Vercel

```bash
cd success-academy
npm install
npm test
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

Or connect the folder/repository to Vercel and let it build. There is no build step; Vercel serves the static files and deploys each `api/**/*.js` file as a function.

**Deployment checklist**

- [ ] `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set
- [ ] `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` set
- [ ] `PAYSTACK_SECRET_KEY` set (checkout is disabled without it)
- [ ] All five R2 variables set
- [ ] R2 bucket CORS allows the production origin
- [ ] `/api/health` returns `200` and `{ "ok": true, "db": true }`
- [ ] `/admin` login works and a small image upload succeeds
- [ ] A Paystack test purchase issues a PIN and unlocks content

## Local development

```bash
cp .env.example .env
# fill in the variables
npm install
npx vercel dev
```

Open `http://localhost:3000`. The admin dashboard is at `/admin` (or `/admin.html`).

Put machine-only values (such as Paystack test keys you do not want pulled from Vercel) in `.env.local`. It is loaded explicitly on local/development runs, and real environment variables always take precedence. Restart `vercel dev` after changing either file.

> `package.json` intentionally has no `dev` script. Vercel serves this zero-config project itself; adding `"dev": "vercel dev"` causes Vercel's `DEV_RECURSIVE_INVOCATION` error. Use `npx vercel dev --local` if you want to run without linking a Vercel project.

Run checks:

```bash
npm run lint
npm test
```

Tests use an in-memory `node:sqlite` database and a mocked Paystack API; they do **not** touch your Turso database. `npm test` covers schema migration, package rules, admin auth, R2 presigning, and the full checkout → claim → verify flow.

## Admin dashboard

Open `/admin` and log in with `ADMIN_PASSWORD`.

- **Manage Exams** — edit package prices and availability; edit subject text answers, public thumbnails, and private Q&A images.
- **PIN History** — see every PIN (paid and pending) and create manual PINs for a device ID.
- **Manage News** — publish/edit/delete updates and upload up to 5 images.
- **Enquiries** — read messages, reply by email (if Resend is configured), or open WhatsApp.

Uploads need R2 configured and CORS set. If an upload fails, check the browser console/network tab for the R2 `PUT` response.

## Security notes

- Paystack is verified server-side; the browser cannot set the amount or activate a PIN by itself.
- PINs are device-bound. Public exam responses never contain answer content or `qaImages`.
- Admin sessions are HMAC-signed, `HttpOnly`, `SameSite=Strict` cookies; the admin password is compared in constant time. Admin writes also enforce same-origin requests.
- Login, checkout, claim, verify, enquiry, visitor, and upload endpoints are rate-limited in the database.
- All user/admin-supplied text is escaped before being rendered in the dashboards.
- `.env` and `.env.local` are ignored by git and excluded from Vercel uploads via `.vercelignore`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Checkout returns `503 Payments are not available yet` | `PAYSTACK_SECRET_KEY` is not set in the current Vercel environment. If you added it to `.env.local`, restart `vercel dev`. |
| `/api/health` shows `payments: false` | `PAYSTACK_SECRET_KEY` is missing or was added after the dev server started. Restart `vercel dev`. |
| `/api/health` shows `db: false` | Turso URL/token missing or wrong. |
| Admin login says `Admin login is not configured` | `ADMIN_PASSWORD` is missing. |
| Upload fails with `The image could not be uploaded to R2` | R2 CORS policy, bucket name, token permissions, or `R2_PUBLIC_URL`. |
| R2 upload URL is created but image URL 404s | Public access is disabled on the bucket, or `R2_PUBLIC_URL` is wrong. |
| Payment succeeds but no PIN | The claim call failed. Use the same browser/device that started checkout, or check the pending order/PIN in `/admin`. |
| Admin session drops immediately | Ensure `ADMIN_SESSION_SECRET` is stable across deployments; changing it invalidates existing cookies. |

## Removed old architecture

- No Render/Express backend.
- No `multer` uploads through the API.
- No hardcoded admin password in `admin.html`.
- No hardcoded Paystack public key in the frontend; the fallback lives server-side and is served by `/api/config`.
- No `API_URL` pointing at `onrender.com`.
