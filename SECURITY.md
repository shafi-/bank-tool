# Security Policy

## Scope

Bank.Query is a **client-side-only** Progressive Web App. There is no backend,
no API server, no database, and no analytics. All processing — PDF decryption,
parsing, the SQL engine, and query results — happens entirely inside the
user's browser. Bank statements and queries are **never transmitted** anywhere.

### Known external dependency

The only network request the app makes is for its webfont, fetched from Google
Fonts (`fonts.googleapis.com`) on first load. This does **not** involve any
user data. The app's own assets, the SQL engine, and the PDF parser are
self-hosted and cached locally.

## Supported versions

Security fixes target the latest commit on `main` and the deployed `gh-pages`
branch. There are no long-term supported release lines yet.

## Reporting a vulnerability

Please **do not** file a public GitHub issue for security vulnerabilities.

Instead, report privately via GitHub's
[private vulnerability reporting](https://github.com/shafi-/bank-tool/security/advisories/new)
if enabled, or contact the maintainer directly. Include:

- A description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- Affected version / commit

You can expect an acknowledgement within a few days. Once confirmed, we'll work
on a fix and coordinate disclosure.

## Hardening already in place

- `standalone/_headers` sets a Content-Security-Policy, `X-Content-Type-Options`,
  `Referrer-Policy: no-referrer`, and disables unused Permissions-Policy features
  (geolocation, microphone, camera).
- `sw.js` is served with `Cache-Control: no-cache` so updates propagate.
