# Changelog

All notable changes to Bank.Query are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/) where practical.

## [Unreleased]

### Added
- MIT `LICENSE`, root `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, and this `CHANGELOG.md` to prepare the project for
  public/open-source release.
- Removed a corrupted root `CNAME` file that leaked a personal email address.

## [0.1.0] - Initial public-ready state

### Added
- Fully offline PWA for querying bank statement PDFs with SQL (AlaSQL).
- Client-side decryption and parsing of password-protected PDFs (pdf.js).
- LLM-regex based statement parser for flexible transaction extraction.
- Plain-language filter controls that sync to SQL for non-technical users.
- Saved queries and CSV export of results.
- Installable PWA with offline service-worker caching and an auto-update banner.
- Content-Security-Policy and hardening headers (`_headers`).
- Privacy assurance UI clarifying that no data leaves the browser.
