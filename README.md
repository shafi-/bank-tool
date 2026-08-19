# 🏦 Bank.Query

> Query your bank statement PDFs with SQL — **100% in your browser. No uploads. No servers. No accounts.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable-blue.svg)](standalone/)
[![Offline](https://img.shields.io/badge/Offline-works%20without%20internet-green.svg)](standalone/)
[![Privacy](https://img.shields.io/badge/Privacy-zero--telemetry-red.svg)](SECURITY.md)

**Live demo:** https://shafi-.github.io/bank-tool/

Bank.Query is a fully offline Progressive Web App that turns password-protected
bank statement PDFs into a queryable SQL table. Upload a statement, it is
decrypted and parsed **locally** in your browser, and you can then run standard
SQL against the transactions using [AlaSQL](https://github.com/AlaSQL/alasql).
Your PDFs, queries, and results never leave your device.

---

## ✨ Features

- **Truly private** — no backend, no analytics, no telemetry. Bank data never
  leaves the browser tab.
- **Fully offline** — after the first load the service worker caches everything;
  the app keeps working with no internet connection.
- **Password-protected PDFs** — encrypted statements are auto-detected and
  decrypted in-browser (via [pdf.js](https://github.com/mozilla/pdf.js)).
- **SQL over transactions** — standard SQL (`SELECT`, `JOIN`-free single table,
  `GROUP BY`, `HAVING`, `LIKE`, aggregates) powered by AlaSQL.
- **Filter-to-SQL** — build queries with plain dropdowns/filters; the app syncs
  them to SQL for you (no SQL knowledge required).
- **Saved queries** — keep frequently-used queries for one-click re-runs.
- **CSV export** — download any result set as CSV.
- **Installable PWA** — add to your home screen / desktop on Chrome, Edge, or
  Safari.
- **Multi-file** — load several statements at once; a `file` column tags each row.

---

## 📸 Screenshot

<!-- TODO: add a screenshot of the app to `standalone/` and reference it here:
![Bank.Query screenshot](standalone/screenshot.png) -->

---

## 🚀 Quick start (run locally)

The app is static files — **no build step, no dependencies to install**.

```bash
# From the repository root
cd standalone
python3 -m http.server 8000
# then open http://localhost:8000
```

> Serve over `http://` rather than opening `index.html` via `file://` — the
> service worker and some browser APIs require a real origin.

Any static file server works (`npx serve`, `php -S`, nginx, etc.).

---

## 🧭 How to use

1. **Open the app** (locally, or the [demo](https://shafi-.github.io/bank-tool/)).
2. **Add your statement(s)** — drag & drop or click to upload PDF bank statements.
3. **Enter the password** if the PDF is encrypted (auto-detected).
4. **Extract** — the app parses the PDFs into a `transactions` table.
5. **Query** — pick an example query, use the filter builder, or write SQL.
6. **Export** — download results as CSV, or save the query for later.

---

## 🗄️ The `transactions` table

Every parsed row becomes a row in an in-memory table named **`transactions`**:

| Column        | Type   | Description                                          |
|---------------|--------|------------------------------------------------------|
| `date`        | text   | Transaction date (`YYYY-MM-DD` or source format).    |
| `description` | text   | Merchant / narration text.                           |
| `reference`   | text   | Reference / cheque / transaction id (if present).    |
| `debit`       | number | Amount leaving the account (payments). `NULL` if n/a.|
| `credit`      | number | Amount entering the account (receipts). `NULL` if n/a.|
| `balance`     | number | Running balance after the transaction (if present).  |
| `file`        | text   | Source PDF filename (useful when loading many).      |

> Not every statement provides every column — missing values are `NULL`.

### Example queries

```sql
-- All transactions, newest first
SELECT date, description, reference, debit, credit, balance
FROM transactions
ORDER BY date DESC
LIMIT 50;
```

```sql
-- Monthly spending vs income
SELECT SUBSTRING(date, 1, 7) AS month,
       ROUND(SUM(debit), 2)  AS total_out,
       ROUND(SUM(credit), 2) AS total_in,
       COUNT(*)              AS count
FROM transactions
GROUP BY SUBSTRING(date, 1, 7)
ORDER BY month DESC;
```

```sql
-- Search a merchant
SELECT date, description, reference, debit, credit
FROM transactions
WHERE UPPER(description) LIKE '%AMAZON%'
ORDER BY date DESC;
```

```sql
-- Recurring charges (same amount more than twice)
SELECT debit, COUNT(*) AS times, MIN(description) AS sample
FROM transactions
WHERE debit IS NOT NULL
GROUP BY debit
HAVING COUNT(*) > 2
ORDER BY times DESC;
```

```sql
-- Per-file summary (when you load multiple statements)
SELECT file,
       COUNT(*)              AS tx_count,
       ROUND(SUM(debit), 2)  AS total_out,
       ROUND(SUM(credit), 2) AS total_in
FROM transactions
GROUP BY file
ORDER BY file;
```

The UI ships with these and more under the **example queries** menu.

---

## 🌐 Deployment

The **entire app is the [`standalone/`](standalone/) folder**. Deploy its
contents as static files to any host.

### GitHub Pages

```bash
git subtree push --prefix standalone origin gh-pages
```

Then enable **Settings → Pages → Source: `gh-pages` / root**.

### Netlify / Vercel

Drag-and-drop the `standalone/` folder (or connect the repo and set the publish
directory to `standalone/`). On these hosts the `standalone/_headers` file is
respected — it sets a Content-Security-Policy and other hardening headers.

### Any web server

Serve `standalone/` as-is. The service worker (`sw.js`) caches assets for
offline use.

> **After editing any asset**, bump `CACHE_NAME` in `standalone/sw.js`
> (e.g. `bankquery-v20` → `bankquery-v21`) so returning visitors get the update.

---

## 📁 Project structure

```
bank-tool/
├── standalone/                # ← The whole app. Deploy this folder.
│   ├── index.html             # UI + PWA shell
│   ├── app.js                 # Application logic (parse → table → SQL)
│   ├── app.css                # Styles
│   ├── sw.js                  # Service worker / offline cache
│   ├── manifest.json          # PWA metadata
│   ├── _headers               # CSP + hardening headers (Netlify/Vercel)
│   ├── .nojekyll              # Disables Jekyll on GitHub Pages
│   ├── alasql.min.js          # SQL engine (vendored)
│   ├── pdf.min.mjs            # PDF parsing (pdf.js, vendored)
│   ├── pdf.worker.min.mjs     # PDF web worker (vendored)
│   ├── icon-*.png             # App icons (incl. maskable)
│   └── README.md              # App-specific deployment notes
├── LICENSE                    # MIT
├── README.md                  # This file
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── CHANGELOG.md
```

---

## 🔒 Privacy & security

- All processing happens **client-side**. There is no server, API, or database.
- Bank statements, queries, and results are **never transmitted** anywhere.
- `standalone/_headers` sets a strict CSP, `no-referrer` policy, and disables
  unused browser features on hosts that honor it (Netlify/Vercel).
- See [SECURITY.md](SECURITY.md) for the reporting policy.

> **One external request:** the only network call on first load is for the
> webfont (Google Fonts). This does **not** involve any user data — only the
> app's own assets are local. If you need zero network requests, self-host the
> font or switch to a system font stack.

---

## 🌟 Browser support

Installable PWA with offline support on the latest **Chrome, Edge, Firefox, and
Safari**. PDF decryption requires a modern browser with the necessary crypto
APIs (all current desktop/mobile browsers qualify).

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: edit under `standalone/`,
bump `CACHE_NAME` after changing assets, open a PR. Be kind — by participating
you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 📜 License

[MIT](LICENSE) © 2026 shafi-

## 🙏 Acknowledgements

- [AlaSQL](https://github.com/AlaSQL/alasql) — the in-browser SQL engine.
- [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla) — client-side PDF parsing.
