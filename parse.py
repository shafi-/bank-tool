#!/usr/bin/env python3
"""
Bank Statement PDF Parser
Usage: python parse.py <folder_path> <password> [--out data.json]

Decrypts password-protected PDFs, extracts transactions, outputs JSON.
"""

import sys
import os
import re
import json
import argparse
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
    from pypdf import PdfReader
except ImportError:
    print("Missing dependencies. Run: pip install pypdf pdfplumber")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Date parsing helpers
# ---------------------------------------------------------------------------

DATE_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY
    (r'\b(\d{2})[/\-](\d{2})[/\-](\d{4})\b', lambda m: f"{m.group(3)}-{m.group(2)}-{m.group(1)}"),
    # MM/DD/YYYY
    (r'\b(\d{2})[/\-](\d{2})[/\-](\d{4})\b', lambda m: f"{m.group(3)}-{m.group(1)}-{m.group(2)}"),
    # YYYY-MM-DD
    (r'\b(\d{4})[/\-](\d{2})[/\-](\d{2})\b', lambda m: f"{m.group(1)}-{m.group(2)}-{m.group(3)}"),
    # DD Mon YYYY  e.g. 15 Jan 2024
    (r'\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b',
     lambda m: datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %b %Y").strftime("%Y-%m-%d")),
    # Mon DD, YYYY  e.g. Jan 15, 2024
    (r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b',
     lambda m: datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%b %d %Y").strftime("%Y-%m-%d")),
    # DD/MM (no year — common in UK statements; year inferred later)
    (r'\b(\d{2})[/\-](\d{2})\b', lambda m: f"__-{m.group(2)}-{m.group(1)}"),
]


def parse_date(text):
    """Try each date pattern, return ISO string or None."""
    for pattern, formatter in DATE_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return formatter(m)
            except Exception:
                continue
    return None


def infer_year(date_str, filename):
    """Replace __ year placeholder using filename or current year."""
    if not date_str or not date_str.startswith("__-"):
        return date_str
    year_match = re.search(r'(20\d{2})', filename)
    year = year_match.group(1) if year_match else str(datetime.now().year)
    return date_str.replace("__", year)


# ---------------------------------------------------------------------------
# Amount parsing
# ---------------------------------------------------------------------------

def parse_amount(text):
    """Extract a numeric amount from a string, stripping currency symbols."""
    text = text.replace(",", "").strip()
    m = re.search(r'[\$£€]?\s*(\d+\.\d{2})', text)
    if m:
        return float(m.group(1))
    m = re.search(r'(\d+\.\d{2})', text)
    if m:
        return float(m.group(1))
    return None


# ---------------------------------------------------------------------------
# Core line classifier
# ---------------------------------------------------------------------------

# Regex that looks like a transaction line:
# Must contain a date-ish token and at least one money amount
MONEY_RE = re.compile(r'[\$£€]?\s*\d{1,3}(?:,\d{3})*\.\d{2}')
CR_MARKERS = re.compile(r'\b(CR|CREDIT|cr)\b', re.IGNORECASE)
DR_MARKERS = re.compile(r'\b(DR|DEBIT|dr)\b', re.IGNORECASE)


def classify_line(line, filename, statement_year=None):
    """
    Attempt to parse a single text line into a transaction dict.
    Returns dict or None.
    """
    line = line.strip()
    if len(line) < 10:
        return None

    # Must have at least one amount
    amounts = MONEY_RE.findall(line)
    if not amounts:
        return None

    # Must have a date
    date_raw = parse_date(line)
    if not date_raw:
        return None
    date = infer_year(date_raw, filename)

    # Validate date is sane
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return None

    # Parse all numeric amounts found
    numeric_amounts = [parse_amount(a) for a in amounts if parse_amount(a) is not None]
    if not numeric_amounts:
        return None

    # Heuristic: last amount is often balance, second-to-last is transaction
    # If only one amount: treat as debit unless CR marker present
    balance = None
    debit = None
    credit = None

    is_credit = bool(CR_MARKERS.search(line))
    is_debit = bool(DR_MARKERS.search(line))

    if len(numeric_amounts) >= 3:
        # Likely: date | description | debit | credit | balance
        balance = numeric_amounts[-1]
        # Check which column (debit vs credit) has a value
        if is_credit:
            credit = numeric_amounts[-2]
        elif is_debit:
            debit = numeric_amounts[-2]
        else:
            # Guess: if there are two amounts before balance, one may be 0/empty
            debit = numeric_amounts[-3] if numeric_amounts[-3] else None
            credit = numeric_amounts[-2] if len(numeric_amounts) >= 3 else None
    elif len(numeric_amounts) == 2:
        balance = numeric_amounts[-1]
        if is_credit:
            credit = numeric_amounts[0]
        else:
            debit = numeric_amounts[0]
    elif len(numeric_amounts) == 1:
        if is_credit:
            credit = numeric_amounts[0]
        else:
            debit = numeric_amounts[0]

    # Description: everything between the date token and the first amount
    # Strip the date from the line first
    desc_line = re.sub(r'\b\d{1,2}[/\-]\d{2}[/\-]?\d{0,4}\b', '', line)
    desc_line = re.sub(r'\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{0,4}\b', '', desc_line, flags=re.IGNORECASE)
    # Remove all amounts
    desc_line = MONEY_RE.sub('', desc_line)
    # Remove CR/DR markers
    desc_line = re.sub(r'\b(CR|DR|CREDIT|DEBIT)\b', '', desc_line, flags=re.IGNORECASE)
    # Clean up whitespace and punctuation
    description = re.sub(r'\s+', ' ', desc_line).strip().strip('|:-')

    if not description:
        description = "(no description parsed)"

    return {
        "date": date,
        "description": description,
        "debit": debit,
        "credit": credit,
        "balance": balance,
        "raw_line": line,
    }


# ---------------------------------------------------------------------------
# PDF processing
# ---------------------------------------------------------------------------

def decrypt_and_extract(pdf_path, password):
    """
    Returns list of (page_number, text) tuples.
    Raises on wrong password or unreadable file.
    """
    pages = []

    # Use pypdf to decrypt first (pdfplumber doesn't handle passwords well)
    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        result = reader.decrypt(password)
        if result.value == 0:
            raise ValueError(f"Wrong password for {pdf_path.name}")

    # Now open with pdfplumber for better text extraction
    with pdfplumber.open(str(pdf_path), password=password) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text(x_tolerance=3, y_tolerance=3)
            if text:
                pages.append((i + 1, text))

    return pages


def extract_account_info(text):
    """Try to pull account number or IBAN from text."""
    patterns = [
        r'\b([A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16})\b',  # IBAN
        r'Account\s+(?:Number|No\.?|#)\s*[:\-]?\s*(\*{0,4}\d{4,})',  # Account number
        r'A/C\s*[:\-]?\s*(\*{0,4}\d{4,})',
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def extract_statement_year(text, filename):
    """Try to find the statement year from the first page text."""
    m = re.search(r'(20\d{2})', text)
    if m:
        return m.group(1)
    m = re.search(r'(20\d{2})', filename)
    if m:
        return m.group(1)
    return str(datetime.now().year)


def process_pdf(pdf_path, password):
    """Process a single PDF, return list of transaction dicts."""
    transactions = []
    skipped_lines = []

    print(f"  Processing: {pdf_path.name}")

    try:
        pages = decrypt_and_extract(pdf_path, password)
    except ValueError as e:
        print(f"  ✗ {e}")
        return [], [{"error": str(e), "file": pdf_path.name}]
    except Exception as e:
        print(f"  ✗ Unexpected error: {e}")
        return [], [{"error": str(e), "file": pdf_path.name}]

    full_text = "\n".join(text for _, text in pages)
    account = extract_account_info(full_text)
    statement_year = extract_statement_year(full_text, pdf_path.name)

    for page_num, text in pages:
        for line in text.splitlines():
            result = classify_line(line, pdf_path.name, statement_year)
            if result:
                result["file"] = pdf_path.name
                result["account"] = account
                result["page"] = page_num
                transactions.append(result)
            elif line.strip():
                skipped_lines.append({"file": pdf_path.name, "page": page_num, "line": line.strip()})

    print(f"  ✓ {len(transactions)} transactions found across {len(pages)} pages")
    return transactions, skipped_lines


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Parse password-protected bank statement PDFs into JSON"
    )
    parser.add_argument("folder", help="Folder containing PDF files")
    parser.add_argument("password", help="Shared PDF password")
    parser.add_argument("--out", default="data.json", help="Output JSON file (default: data.json)")
    parser.add_argument("--skipped", default="skipped_lines.json", help="Output file for unparsed lines")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print output JSON")
    args = parser.parse_args()

    folder = Path(args.folder)
    if not folder.exists() or not folder.is_dir():
        print(f"Error: '{folder}' is not a valid directory.")
        sys.exit(1)

    pdf_files = sorted(folder.glob("*.pdf")) + sorted(folder.glob("*.PDF"))
    if not pdf_files:
        print(f"No PDF files found in '{folder}'")
        sys.exit(1)

    print(f"\nFound {len(pdf_files)} PDF(s) in '{folder}'")
    print("-" * 50)

    all_transactions = []
    all_skipped = []

    for pdf_path in pdf_files:
        txns, skipped = process_pdf(pdf_path, args.password)
        all_transactions.extend(txns)
        all_skipped.extend(skipped)

    # Sort by date
    all_transactions.sort(key=lambda x: (x.get("date") or "", x.get("file") or ""))

    # Write output
    indent = 2 if args.pretty else None
    out_path = Path(args.out)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_transactions, f, indent=indent, ensure_ascii=False)

    skipped_path = Path(args.skipped)
    with open(skipped_path, "w", encoding="utf-8") as f:
        json.dump(all_skipped, f, indent=2, ensure_ascii=False)

    print("-" * 50)
    print(f"\n✓ Done!")
    print(f"  Total transactions : {len(all_transactions)}")
    print(f"  Skipped lines      : {len(all_skipped)} (see {skipped_path})")
    print(f"  Output written to  : {out_path.resolve()}")
    print(f"\nNow open index.html in your browser and load '{out_path.name}'")


if __name__ == "__main__":
    main()
