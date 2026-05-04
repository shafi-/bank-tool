# Bank.Query - Standalone PWA

A fully offline Progressive Web App for querying bank statement PDFs with SQL.

## Features

- **Progressive Web App**: Installable on desktop and mobile
- **Fully offline**: All processing happens in your browser
- **SQL queries**: Powered by AlaSQL - query transactions with standard SQL
- **Saved queries**: Save frequently-used queries for quick access
- **Expanded editor**: Click the ⤢ button for comfortable query editing
- **Export results**: Download query results as CSV

## Installation as PWA

1. Deploy this folder to any static hosting (GitHub Pages, Netlify, Vercel)
2. Visit the site in Chrome, Edge, or Safari
3. Click the "⬇ Install App" button in the header when it appears

## Files

```
standalone/
├── index.html              # Main app (HTML + CSS + PWA)
├── app.js                  # Application logic
├── sw.js                   # Service worker for offline capability
├── manifest.json           # PWA manifest
├── alasql.min.js           # SQL query engine
├── pdf.min.mjs             # PDF parsing library
├── pdf.worker.min.mjs      # PDF web worker
└── icon-*.png              # App icons (9 files)
```

## Usage

1. Open `index.html` in your browser
2. Drag & drop or click to upload PDF bank statements
3. Enter the PDF password (if required)
4. Click "Parse" to process the files
5. Write SQL queries or click example queries to get started

## Deployment

### GitHub Pages
```bash
git subtree push --prefix standalone origin gh-pages
```

### Netlify / Vercel
Drag & drop the `standalone/` folder contents to deploy.

### Any Web Server
Serve the files as-is. The service worker will cache everything for offline use.

## Development

The service worker (`sw.js`) caches all assets on first load, enabling full offline functionality. After installation, the app works without an internet connection.

To update the cache after modifying files, increment the `CACHE_NAME` version in `sw.js`.
