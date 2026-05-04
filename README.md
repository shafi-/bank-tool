# Bank Statement Query Tool

Parse password-protected bank statement PDFs into JSON and query them with SQL — fully offline, runs in Docker.

## Quick Start

```bash
# 1. Build the image
docker build -t bank-tool .

# 2. Drop your PDFs into ./statements/
mkdir -p statements output
cp ~/Downloads/*.pdf statements/

# 3. Parse + serve in one command
docker run --rm \
  -v "$(pwd)/statements:/data/statements:ro" \
  -v "$(pwd)/output:/data" \
  -p 8080:8080 \
  bank-tool run "yourpassword"

# 4. Open http://localhost:8080
```

---

## With Docker Compose (easier)

```bash
cp .env.example .env
# Edit .env: set PDF_PASSWORD=yourpassword

mkdir -p statements output
cp ~/Downloads/*.pdf statements/

docker compose up --build
# Open http://localhost:8080
```

---

## Modes

| Command | What it does |
|---------|-------------|
| `run <password>` | Parse all PDFs, then start web server (recommended) |
| `parse <password>` | Parse only, write data.json to /data, then exit |
| `serve` | Start web server only (data.json must already exist) |

### Parse only (no web server)
```bash
docker run --rm \
  -v "$(pwd)/statements:/data/statements:ro" \
  -v "$(pwd)/output:/data" \
  bank-tool parse "yourpassword"
# Output: ./output/data.json and ./output/skipped_lines.json
```

### Serve only (data.json already parsed)
```bash
docker run --rm \
  -v "$(pwd)/output:/data" \
  -p 8080:8080 \
  bank-tool serve
```

---

## Output files (written to ./output/)

| File | Contents |
|------|----------|
| `data.json` | All parsed transactions as a JSON array |
| `skipped_lines.json` | Lines the parser couldn't classify (for debugging) |

### Transaction schema

| Field | Type | Notes |
|-------|------|-------|
| `date` | TEXT | ISO 8601 (YYYY-MM-DD) |
| `description` | TEXT | Merchant / narrative |
| `debit` | FLOAT | Amount out (null if not applicable) |
| `credit` | FLOAT | Amount in (null if not applicable) |
| `balance` | FLOAT | Running balance if present in PDF |
| `file` | TEXT | Source PDF filename |
| `account` | TEXT | Account number if detected |
| `page` | INT | Page number in PDF |
| `raw_line` | TEXT | Original text line (for debugging) |

---

## Example SQL Queries

```sql
-- Monthly spending
SELECT SUBSTRING(date,1,7) AS month, ROUND(SUM(debit),2) AS spent
FROM transactions GROUP BY month ORDER BY month DESC

-- Find merchant
SELECT * FROM transactions WHERE UPPER(description) LIKE '%AMAZON%'

-- Biggest debits
SELECT date, description, debit FROM transactions
WHERE debit IS NOT NULL ORDER BY debit DESC LIMIT 20

-- Date range
SELECT * FROM transactions
WHERE date >= '2024-01-01' AND date <= '2024-03-31'
```

---

## Notes

- All data stays local — no internet access at runtime
- PDFs are mounted read-only inside the container
- If your bank uses an unusual PDF layout and some amounts are misclassified,
  check `skipped_lines.json` and the `raw_line` field to diagnose
