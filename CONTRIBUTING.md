# Contributing to Bank.Query

Thanks for your interest in contributing! This is a small, dependency-light
project, so the process is intentionally simple.

## Project shape

The whole app is **`standalone/`**. There is no build step, no `package.json`,
no bundler. The folder is deployed as-is to static hosting (GitHub Pages,
Netlify, Vercel, or any web server).

- `index.html` — UI + PWA shell
- `app.js` — application logic (PDF parse → in-memory `transactions` table → SQL)
- `app.css` — styles
- `sw.js` — service worker / offline cache
- `manifest.json`, `icon-*.png` — PWA metadata
- `_headers` — Content-Security-Policy + hardening headers (Netlify-style)
- `alasql.min.js`, `pdf.min.mjs`, `pdf.worker.min.mjs` — **vendored** libraries.
  Do not edit these by hand; upgrade by replacing the file.

## Local development

```bash
cd standalone
python3 -m http.server 8000
# visit http://localhost:8000
```

Serve over `http://` rather than opening `index.html` via `file://` — the
service worker and some browser APIs require a real origin.

## Making changes

1. Edit files under `standalone/`.
2. **After changing any asset, bump `CACHE_NAME` in `standalone/sw.js`**
   (e.g. `bankquery-v20` → `bankquery-v21`). Otherwise users get stale cached
   files and won't see your update.
3. Test by loading a real bank statement PDF in the browser and running queries.
   There are no automated tests yet — manual verification is the gate.
4. Keep changes focused; one logical change per PR.

## Pull requests

- Describe what you changed and why.
- If it changes user-facing behavior, update `standalone/README.md` and/or the
  root `README.md` and `CHANGELOG.md`.
- Be kind. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

Do **not** open a public issue for security concerns. See
[SECURITY.md](SECURITY.md) for the private reporting path.
