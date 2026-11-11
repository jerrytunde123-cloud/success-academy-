# Success Academy — Editing Guide

Welcome. You do **not** need to know React, Next.js, Vue, or any framework.
This site is just HTML, CSS, and JavaScript files. Edit them directly on GitHub.com.

## How to edit (no local computer needed)

1. Go to the file you want to change on GitHub.com
2. Click the pencil icon (✏️) to edit
3. Make your change
4. Click "Commit changes..." at the bottom
5. Vercel will automatically update the live website within ~1 minute

## File cheat-sheet

| Want to change... | Edit this file |
|-------------------|----------------|
| Home page text, hero section, contact phone/WhatsApp/Telegram | `index.html` |
| What shows after a correct PIN is entered | `view-content.html` |
| Admin dashboard buttons, fields, layout | `admin.html` |
| Colors, fonts, button styles, layout | `style.css` |
| How exams load, checkout flow, Paystack, PIN verify UI | `script.js` |
| Admin save/upload actions | `admin.js` |
| Exam names, prices, subjects (backend data) | `api/exams.js` |
| PIN creation & Paystack secret key (server-side, safe) | `api/pins.js` |
| PIN verification & device lock | `api/verify.js` |
| News/updates list | `api/news.js` |
| Image uploads | `api/upload.js` |
| Visitor stats | `api/stats.js` |
| Backend health check | `api/health.js` |

## ⚠️ Important rules

- Do **not** delete the `/api/` folder — that is the backend (server-side logic).
- Do **not** put secret keys (Paystack secret key, admin password) in `script.js`, `index.html`, or `admin.html`. Keep them in `/api/` files only.
- Do **not** rename files unless you update this README too.
- Images go in `/assets/`.

## Security notes (already handled)

- Paystack secret key is **server-side only** (`api/pins.js`), never exposed to the browser.
- Admin area is protected by a simple password set in environment variables.
- Everything runs on **Vercel** — no Render sleep, no split hosting, no cold starts.
