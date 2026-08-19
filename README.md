# Bank.Query

A fully offline, privacy-first Progressive Web App for querying bank statement
PDFs with SQL — entirely in your browser. No server, no uploads, no accounts.

Upload a password-protected (or plain) bank statement PDF, and the app parses
it client-side into a table of transactions. Then query it with standard SQL
powered by [AlaSQL](https://github.com/AlaSQL/alasql). Nothing you load ever
leaves your device.

- **Live demo:** https://shafi-.github.io/bank-tool/
- **Deployable app:** [`standalone/`](standalone/) — that folder *is* the app.

## Why

Bank statements are sensitive. Most "PDF to spreadsheet" tools ask you to email
or upload your statement to a third-party server. Bank.Query does everything
locally: PDF decryption and parsing, the SQL engine, and the results — all run
in your browser tab. You can even disconnect from the network after the first
load and it keeps working.

## Features

- **Fully offline after first load** — service worker caches all assets; works
  with no internet connection.
- **Privacy by design** — no server, no analytics, no telemetry. Your PDFs and
  queries never leave the browser.
- **SQL over transactions** — standard SQL via AlaSQL against an in-memory
  `transactions` table.
- **Filter-to-SQL** — build queries with plain controls; the app syncs them to
  SQL for you.
- **Saved queries** — keep frequently-used queries for quick re-runs.
- **CSV export** — download query results.
- **Installable PWA** — add to your home screen / desktop on Chrome, Edge, or
  Safari.
- **Password-protected PDFs** — auto-detected and decrypted in-browser.

> **Note on external resources:** All *data processing* is local. The only
> network request on first load is the webfont (Google Fonts). No bank data,
> queries, or results are ever sent anywhere.

## Quick start (local)

The app is static files — no build step.

```bash
# From the repo root
cd standalone
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `standalone/index.html` directly in a browser (some features like
the service worker need to be served over http://, not file://).

## Deploy

The entire app lives in [`standalone/`](standalone/README.md). Deploy its
contents as static files to any host.

- **GitHub Pages:** `git subtree push --prefix standalone origin gh-pages`
- **Netlify / Vercel:** drag-and-drop the `standalone/` folder contents.
- **Any web server:** serve the files as-is; the service worker handles caching.

See [`standalone/README.md`](standalone/README.md) for the full file layout and
deployment details.

## Repository layout

```
bank-tool/
├── standalone/        # The entire app (deploy this folder)
│   ├── index.html     # UI + PWA shell
│   ├── app.js         # Application logic
│   ├── app.css        # Styles
│   ├── sw.js          # Service worker (offline cache)
│   ├── manifest.json  # PWA metadata
│   ├── _headers       # CSP + hardening headers (Netlify-style)
│   ├── alasql.min.js  # SQL engine (vendored)
│   ├── pdf.min.mjs    # PDF parsing (pdf.js, vendored)
│   ├── pdf.worker.min.mjs
│   └── icon-*.png     # App icons
├── LICENSE            # MIT
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── CHANGELOG.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: edit files under
`standalone/`, bump `CACHE_NAME` in `sw.js` after changing assets, and open a PR.

## License

[MIT](LICENSE) © 2026 shafi-
