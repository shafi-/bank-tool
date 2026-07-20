# AGENTS.md — Bank.Query (bank statement SQL tool)

Fully offline PWA: parse password-protected bank PDFs in the browser, then query transactions with SQL (AlaSQL). No server, no Python — the entire app is `standalone/`.

## App layout

- `standalone/` is the whole app. Deploy its contents as static files (GitHub Pages, Netlify, any web server).
- `standalone/index.html` — UI + PWA shell. `app.js` — logic. `app.css` — styles. `sw.js` — service worker. `manifest.json` + `icon-*.png` — PWA metadata.
- `pdf.min.mjs` + `pdf.worker.min.mjs` — in-browser PDF parsing (pdf.js). `alasql.min.js` — SQL engine; queries run against an in-memory `transactions` table.
- PDFs are decrypted/parsed client-side; nothing leaves the browser.

## Conventions

- After editing any asset, bump `CACHE_NAME` in `standalone/sw.js` or users get stale cached files.
- No tests, lint, CI, or formatter configured. Verify changes by loading a real PDF in the browser.
- `standalone/README.md` has full usage/deploy steps (incl. `git subtree push --prefix standalone origin gh-pages`).
