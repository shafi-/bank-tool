// ─── pdf.js setup ───────────────────────────────────────────────────────────
import * as pdfjsLib from './pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

// ─── State ──────────────────────────────────────────────────────────────────
let files     = [];   // FileList/array
let allData   = [];   // parsed transactions
let rawPageLines = []; // raw text lines per page, used by the template parser
let lastRows  = [];   // last query results
let sortCol   = null;
let sortDir   = 1;
let DEBUG = false;  // Set to true to enable console logging

// ─── Saved queries (localStorage) ───────────────────────────────────────────
const SAVED_KEY = 'bankquery_saved_queries';

function getSavedQueries() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueriesToStorage(queries) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(queries));
  } catch (e) { console.error('Failed to save queries:', e); }
}

function addSavedQuery(name, sql) {
  const queries = getSavedQueries();
  queries.unshift({ id: Date.now().toString(), name, sql });
  saveQueriesToStorage(queries);
  renderSavedQueries();
}

function deleteSavedQuery(id) {
  const queries = getSavedQueries().filter(q => q.id !== id);
  saveQueriesToStorage(queries);
  renderSavedQueries();
}

function renderSavedQueries() {
  const savedList = document.getElementById('saved-list');
  const savedSection = document.getElementById('saved-section');
  const queries = getSavedQueries();

  if (!queries.length) {
    savedSection.style.display = 'none';
    return;
  }

  savedSection.style.display = '';
  savedList.innerHTML = '';
  queries.forEach(q => {
    const el = document.createElement('div');
    el.className = 'eq-item saved';
    el.innerHTML = `<div class="eq-label">${escapeHtml(q.name)}</div><span class="eq-delete" onclick="event.stopPropagation(); deleteSavedQuery('${q.id}')">×</span>`;
    el.onclick = () => { document.getElementById('sql').value = q.sql; };
    savedList.appendChild(el);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
function escapeAttr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Save prompt functions
window.showSavePrompt = function() {
  const sql = document.getElementById('sql').value.trim();
  if (!sql) return;
  document.getElementById('save-prompt').style.display = 'flex';
  document.getElementById('save-name').value = '';
  document.getElementById('save-name').focus();
};

window.hideSavePrompt = function() {
  document.getElementById('save-prompt').style.display = 'none';
};

window.saveQuery = function() {
  const name = document.getElementById('save-name').value.trim();
  const sql = document.getElementById('sql').value.trim();
  if (!name || !sql) return;
  addSavedQuery(name, sql);
  hideSavePrompt();
};

// Expanded editor functions
window.showExpandModal = function() {
  const sql = document.getElementById('sql').value;
  document.getElementById('sql-expanded').value = sql;
  document.getElementById('expand-modal').style.display = 'flex';
  document.getElementById('sql-expanded').focus();
};

window.closeExpandModal = function() {
  document.getElementById('expand-modal').style.display = 'none';
};

window.runFromExpanded = function() {
  const expandedSql = document.getElementById('sql-expanded').value;
  document.getElementById('sql').value = expandedSql;
  closeExpandModal();
  runQuery();
};

// Handle Enter key in save prompt
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('save-name');
  if (nameInput) {
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveQuery(); }
      if (e.key === 'Escape') hideSavePrompt();
    });
  }

  // Keyboard shortcuts for expanded editor
  const expandedSql = document.getElementById('sql-expanded');
  if (expandedSql) {
    expandedSql.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runFromExpanded();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeExpandModal();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const t = e.target, s = t.selectionStart;
        t.value = t.value.substring(0, s) + '  ' + t.value.substring(t.selectionEnd);
        t.selectionStart = t.selectionEnd = s + 2;
      }
    });
  }

  renderSavedQueries();
});

// ─── Example queries ────────────────────────────────────────────────────────
const EXAMPLES = [
  { label: "All transactions",    sql: "SELECT date, description, reference, debit, credit, balance\nFROM transactions\nORDER BY date DESC\nLIMIT 50" },
  { label: "Monthly spending",    sql: "SELECT SUBSTRING(date,1,7) AS month,\n  ROUND(SUM(debit),2) AS total_out,\n  ROUND(SUM(credit),2) AS total_in,\n  COUNT(*) AS count\nFROM transactions\nGROUP BY SUBSTRING(date,1,7)\nORDER BY month DESC" },
  { label: "Biggest payments",   sql: "SELECT date, description, reference, debit, file\nFROM transactions\nWHERE debit IS NOT NULL\nORDER BY debit DESC\nLIMIT 20" },
  { label: "Search merchant",     sql: "SELECT date, description, reference, debit, credit\nFROM transactions\nWHERE UPPER(description) LIKE '%AMAZON%'\nORDER BY date DESC" },
  { label: "Received only",     sql: "SELECT date, description, reference, credit\nFROM transactions\nWHERE credit IS NOT NULL AND credit > 0\nORDER BY credit DESC" },
  { label: "Per-file summary",    sql: "SELECT file,\n  COUNT(*) AS tx_count,\n  ROUND(SUM(debit),2) AS total_out,\n  ROUND(SUM(credit),2) AS total_in\nFROM transactions\nGROUP BY file\nORDER BY file" },
  { label: "Date range",          sql: "SELECT date, description, reference, debit, credit\nFROM transactions\nWHERE date >= '2024-01-01'\n  AND date <= '2024-03-31'\nORDER BY date" },
  { label: "Recurring amounts",   sql: "SELECT debit, COUNT(*) AS times,\n  MIN(description) AS sample\nFROM transactions\nWHERE debit IS NOT NULL\nGROUP BY debit\nHAVING COUNT(*) > 2\nORDER BY times DESC" },
  { label: "Daily totals",        sql: "SELECT date,\n  ROUND(SUM(debit),2) AS spent,\n  ROUND(SUM(credit),2) AS received\nFROM transactions\nGROUP BY date\nORDER BY date DESC\nLIMIT 30" },
  { label: "Raw data",            sql: "SELECT * FROM transactions LIMIT 10" },
];

const eqList = document.getElementById('eq-list');
EXAMPLES.forEach(q => {
  const el = document.createElement('div');
  el.className = 'eq-item';
  el.innerHTML = `<div class="eq-label">${q.label}</div>`;
  el.onclick = () => { document.getElementById('sql').value = q.sql; };
  eqList.appendChild(el);
});

// ─── File handling ───────────────────────────────────────────────────────────
const fileIn  = document.getElementById('file-in');
const dropZone = document.getElementById('drop-zone');
const btnParse = document.getElementById('btn-parse');
const pwInput  = document.getElementById('pw');

fileIn.addEventListener('change', e => {
  setFiles(Array.from(e.target.files));
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('over');
  const pdfs = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length) setFiles(pdfs);
});

function setFiles(list) {
  files = list;
  const n = list.length;
  dropZone.innerHTML = `<span class="icon">📄</span><strong>${n} file${n>1?'s':''} selected</strong><br>${list.map(f=>escapeHtml(f.name)).join(', ')}`;
  btnParse.disabled = false;
}

// ─── PDF parsing ─────────────────────────────────────────────────────────────

// Date parsing — multiple formats
const DATE_PATTERNS = [
  // DD-MMM-YYYY (e.g., 30-Jan-2024) - put first as it's the expected format
  { re: /\b(\d{1,2})[\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\-](\d{4})\b/i,
    fmt: m => {
      const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
      return `${m[3]}-${months[m[2].toLowerCase().slice(0,3)]}-${m[1].padStart(2,'0')}`;
    }
  },
  // DD MMM YYYY (space separated)
  { re: /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
    fmt: m => {
      const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
      return `${m[3]}-${months[m[2].toLowerCase().slice(0,3)]}-${m[1].padStart(2,'0')}`;
    }
  },
  // DD/MM/YYYY or DD-MM-YYYY
  { re: /\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/,   fmt: m => `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` },
  // YYYY-MM-DD
  { re: /\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/,   fmt: m => `${m[1]}-${m[2]}-${m[3]}` },
  // MMM DD, YYYY (e.g., Jan 15, 2024)
  { re: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b/i,
    fmt: m => {
      const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
      return `${m[3]}-${months[m[1].toLowerCase().slice(0,3)]}-${m[2].padStart(2,'0')}`;
    }
  },
  // DD/MM (no year — infer from filename/current year)
  { re: /\b(\d{2})[\/\-](\d{2})\b/, fmt: m => `__-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` },
];

function parseDate(text) {
  for (const { re, fmt } of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      try { return fmt(m); } catch(e) {}
    }
  }
  return null;
}

function inferYear(dateStr, filename) {
  if (!dateStr || !dateStr.startsWith('__')) return dateStr;
  const m = filename.match(/(20\d{2})/);
  const yr = m ? m[1] : new Date().getFullYear().toString();
  return dateStr.replace('__', yr);
}

function isValidDate(d) {
  if (!d || d.includes('__')) return false;
  try { return !isNaN(new Date(d).getTime()); } catch { return false; }
}

const MONEY_RE = /[\$£€]?\s*(\d{1,3}(?:,\d{3})*\.\d{2})/g;
const CR_RE    = /\b(CR|CREDIT)\b/i;
const DR_RE    = /\b(DR|DEBIT)\b/i;
const ACCT_RE  = /(?:account(?:\s+(?:number|no\.?|#))?|a\/c)\s*[:\-]?\s*(\*{0,4}[\d\*]{4,})/i;
const IBAN_RE  = /\b([A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16})\b/;

function parseAmounts(text) {
  const nums = [];
  let m;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(n)) nums.push(n);
  }
  return nums;
}

function classifyLine(line, filename) {
  line = line.trim();
  if (line.length < 8) return null;

  // Must have a date to be a transaction
  let dateStr = parseDate(line);
  if (!dateStr) return null;
  dateStr = inferYear(dateStr, filename);
  if (!isValidDate(dateStr)) return null;

  const amounts = parseAmounts(line);

  let debit = null, credit = null, balance = null;
  const isCredit = CR_RE.test(line);
  const isDebit  = DR_RE.test(line);

  if (amounts.length >= 3) {
    balance = amounts[amounts.length - 1];
    if (isCredit)      credit = amounts[amounts.length - 2];
    else if (isDebit)  debit  = amounts[amounts.length - 2];
    else {
      // Heuristic: if 3 amounts, middle = debit, last = balance
      debit = amounts[amounts.length - 2];
    }
  } else if (amounts.length === 2) {
    balance = amounts[1];
    if (isCredit) credit = amounts[0];
    else          debit  = amounts[0];
  } else if (amounts.length === 1) {
    if (isCredit) credit = amounts[0];
    else          debit  = amounts[0];
  }

  // Description: strip date, amounts, markers from line
  let desc = line;
  desc = desc.replace(/\b\d{1,2}[\/\-]\d{2}[\/\-]?\d{0,4}\b/g, '');
  desc = desc.replace(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{0,4}\b/gi, '');
  desc = desc.replace(/[\$£€]?\s*\d{1,3}(?:,\d{3})*\.\d{2}/g, '');
  desc = desc.replace(/\b(CR|DR|CREDIT|DEBIT)\b/gi, '');
  desc = desc.replace(/[|:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!desc) desc = '(unparsed)';

  return { date: dateStr, description: desc, reference: null, debit, credit, balance, raw_line: line };
}

// ─── Column-aware parser using pdf.js X positions ───────────────────────────
// For PDFs with columns: trn.date | description | reference | debits | credits | balance

// Common footer patterns to skip
const FOOTER_PATTERNS = [
  /page\s+\d+\s+of\s+\d+/i,
  /\d+\s*\/\s*\d+/,  // e.g., "1 / 5"
  /^continued?$/i,
  /^—+\s*continue\s*d—+$/i,
];

function isFooterLine(text) {
  const trimmed = text.trim().toLowerCase();
  return FOOTER_PATTERNS.some(p => p.test(trimmed));
}

// Group items by Y coordinate (with tolerance) and sort lines top-to-bottom
function groupItemsByLine(items, yTolerance = 5) {
  const byY = {};
  for (const item of items) {
    if (!item.str.trim()) continue;
    // Round Y to nearest multiple of yTolerance for grouping
    const y = Math.round(item.transform[5] / yTolerance) * yTolerance;
    if (!byY[y]) byY[y] = [];
    byY[y].push({ x: item.transform[4], str: item.str, w: item.width });
  }

  // Sort lines by Y descending (PDFs are usually top-down with decreasing Y)
  return Object.entries(byY)
    .sort(([ya], [yb]) => Number(yb) - Number(ya))
    .map(([y, parts]) => {
      parts.sort((a, b) => a.x - b.x);
      return { y: Number(y), parts, text: parts.map(p => p.str).join(' ') };
    });
}

// Detect column boundaries from the header row
// Expected columns: trn. date | description | reference | debits | credits | balance
function detectColumns(lines) {
  if (DEBUG) console.log('🔍 Detecting columns from', lines.length, 'lines');

  // First, find lines that look like headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rowText = line.text.toLowerCase().trim();

    if (DEBUG && i < 10) console.log(`  Line ${i}: "${rowText}"`);

    // Look for header row with key indicators - be more flexible
    const hasAmount = /(debit|credit|balance|amount|dr|cr)/i.test(rowText);
    const hasDate = /date|trn\.|tran|trn /i.test(rowText);

    if (hasAmount && hasDate) {
      if (DEBUG) console.log('  ✓ Found header row:', rowText);

      const cols = {};
      for (const part of line.parts) {
        const s = part.str.toLowerCase().trim();
        if (DEBUG) console.log(`    Part: "${s}" at x=${part.x}, width=${part.w}`);

        // Match various header name variations - specifically handle "trn. date"
        if (/^trn\.?\s*date$|^date$|^tran\s*date|^trn$/i.test(s))
          cols.date = { x: part.x, w: part.w, end: part.x + part.w };
        if (/descr|narr|detail|remarks|particulars|description/i.test(s))
          cols.desc = { x: part.x, w: part.w, end: part.x + part.w };
        if (/ref|reference|cheque|check|ref\.|no\./i.test(s))
          cols.ref = { x: part.x, w: part.w, end: part.x + part.w };
        if (/debit|dr\b|amount out|withdrawal|withdraw|debits/i.test(s))
          cols.debit = { x: part.x, w: part.w, end: part.x + part.w };
        if (/credit|cr\b|amount in|deposit|credits/i.test(s))
          cols.credit = { x: part.x, w: part.w, end: part.x + part.w };
        if (/balance|bal\b|running/i.test(s))
          cols.balance = { x: part.x, w: part.w, end: part.x + part.w };
      }

      if (DEBUG) console.log('  Columns found:', Object.keys(cols));

      // If we found the key columns, compute boundaries
      if (cols.debit && cols.balance) {
        // Calculate column boundaries based on X positions
        const allCols = Object.values(cols).sort((a, b) => a.x - b.x);

        // Column boundaries: use midpoint between columns as dividers
        const dateX = cols.date?.x ?? 0;
        const descX = cols.desc?.x ?? (cols.ref?.x ?? cols.debit.x);
        const refX = cols.ref?.x ?? cols.debit.x;
        const debitX = cols.debit.x;
        const creditX = cols.credit?.x ?? (debitX + 60);
        const balX = cols.balance.x;

        const boundaries = {
          dateEnd:     dateX + (cols.date?.w ?? 40) + 5,
          descStart:   dateX + (cols.date?.w ?? 40) + 10,
          descEnd:     refX - 5,
          refStart:    refX,
          refEnd:      debitX - 5,
          debitStart:  debitX - 10,
          debitEnd:    debitX + (cols.debit.w ?? 40) + 10,
          creditStart: creditX - 10,
          creditEnd:   creditX + (cols.credit?.w ?? 40) + 10,
          balStart:    balX - 10,
        };
        if (DEBUG) console.log('  Boundaries:', boundaries);
        return { foundY: line.y, boundaries, hasReference: !!cols.ref };
      }
    }
  }

  if (DEBUG) console.log('  ✗ No header row found');
  return null;
}

function parseWithColumns(lines, colInfo, filename) {
  const { foundY, boundaries, hasReference } = colInfo;
  const transactions = [];
  let pastHeader = false;
  let linesChecked = 0;
  let linesSkipped = 0;

  if (DEBUG) console.log('📋 Parsing with columns, header Y =', foundY);

  // First, find the header row on this page
  let headerFoundOnPage = false;
  for (const line of lines) {
    if (Math.abs(line.y - foundY) < 5) {
      headerFoundOnPage = true;
      break;
    }
  }

  // If we couldn't find the header by Y, try to find it by content
  let actualHeaderY = foundY;
  if (!headerFoundOnPage) {
    for (const line of lines) {
      const rowText = line.text.toLowerCase();
      if (/(debit|credit|balance|amount|dr|cr)/i.test(rowText) && /date|trn|tran/i.test(rowText)) {
        actualHeaderY = line.y;
        if (DEBUG) console.log('  Found header by content at Y =', actualHeaderY);
        headerFoundOnPage = true;
        break;
      }
    }
  }

  if (!headerFoundOnPage && DEBUG) {
    console.log('  ⚠ No header found on this page, will use first transaction-looking line as start');
  }

  for (const line of lines) {
    const { text, y, parts } = line;

    // Skip lines before the header (account details, etc.)
    if (!pastHeader) {
      if (headerFoundOnPage) {
        // Use a tolerance for Y comparison since PDF coordinates can vary
        if (Math.abs(y - actualHeaderY) < 5) {
          pastHeader = true;
          if (DEBUG) console.log('  ✓ Passed header at Y =', y);
        }
      } else {
        // No header found - start parsing from first line with a date
        const dateMatch = text.match(/\d{1,2}[\-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d{1,2}[/\-\s]\d{1,2}/i);
        if (dateMatch) {
          pastHeader = true;
          if (DEBUG) console.log('  ✓ Started parsing at first transaction line (no header found)');
        }
      }
      if (!pastHeader) continue;
    }

    linesChecked++;

    // Skip footer lines
    if (isFooterLine(text)) {
      linesSkipped++;
      continue;
    }
    if (text.trim().length < 5) continue;

    // Must have a date to be a transaction
    const dateMatch = text.match(/\d{1,2}[\-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d{1,2}[/\-\s]\d{1,2}/i);
    if (!dateMatch) {
      linesSkipped++;
      continue;
    }

    // Parse into columns based on X position
    let dateStr = '', descParts = [], refParts = [], debitStr = '', creditStr = '', balStr = '';

    for (const p of parts) {
      const midX = p.x + p.w / 2;

      if (p.x < boundaries.dateEnd)
        dateStr += p.str + ' ';
      else if (midX >= boundaries.descStart && midX < boundaries.descEnd)
        descParts.push(p.str);
      else if (hasReference && midX >= boundaries.refStart && midX < boundaries.refEnd)
        refParts.push(p.str);
      else if (midX >= boundaries.debitStart && midX < boundaries.debitEnd)
        debitStr += p.str + ' ';
      else if (midX >= boundaries.creditStart && midX < boundaries.creditEnd)
        creditStr += p.str + ' ';
      else if (midX >= boundaries.balStart)
        balStr += p.str + ' ';
      else
        // Fallback: anything between desc/ref and amounts goes to description
        descParts.push(p.str);
    }

    dateStr = dateStr.trim();
    const desc = descParts.join(' ').replace(/\s+/g, ' ').trim();
    const ref = refParts.join(' ').replace(/\s+/g, ' ').trim() || null;

    // Parse the date - try dateStr first, then full text
    let parsedDate = parseDate(dateStr);
    if (!parsedDate) {
      parsedDate = parseDate(text);
    }
    parsedDate = inferYear(parsedDate, filename);
    if (!isValidDate(parsedDate)) {
      linesSkipped++;
      continue;
    }

    // Parse amounts - be careful with empty strings
    const debit = debitStr.trim() ? parseFloat(debitStr.replace(/,/g, '')) : null;
    const credit = creditStr.trim() ? parseFloat(creditStr.replace(/,/g, '')) : null;
    const balance = balStr.trim() ? parseFloat(balStr.replace(/,/g, '')) : null;

    // Validate parsed numbers (NaN becomes null)
    const validDebit = (debit !== null && !isNaN(debit)) ? debit : null;
    const validCredit = (credit !== null && !isNaN(credit)) ? credit : null;
    const validBalance = (balance !== null && !isNaN(balance)) ? balance : null;

    // Skip if no debit AND no credit value (but allow zero values)
    if (validDebit === null && validCredit === null) {
      linesSkipped++;
      continue;
    }

    transactions.push({
      date: parsedDate,
      description: desc || '(no description)',
      reference: ref,
      debit: validDebit,
      credit: validCredit,
      balance: validBalance,
      file: filename,
      account: null,
      raw_line: text,
    });
  }

  if (DEBUG) console.log(`  Checked ${linesChecked} lines, skipped ${linesSkipped}, found ${transactions.length} transactions`);

  return transactions;
}

function extractAccountInfo(text) {
  let m = text.match(IBAN_RE);
  if (m) return m[1];
  m = text.match(ACCT_RE);
  if (m) return m[1];
  return null;
}

// Helper: Log sample lines from PDF for debugging
function logSampleLines(lines, count = 5) {
  if (!DEBUG) return;
  console.log(`  📝 Sample lines (first ${count}):`);
  for (let i = 0; i < Math.min(count, lines.length); i++) {
    const line = lines[i];
    console.log(`    [Y=${line.y}] "${line.text.substring(0, 60)}${line.text.length > 60 ? '...' : ''}"`);
    if (line.parts.length > 0) {
      console.log(`      Parts: ${line.parts.map(p => `[x=${p.x.toFixed(0)},"${p.str}"]`).join(' ')}`);
    }
  }
}

async function parsePDF(file, password) {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data,
      password: password || '',
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e.name === 'PasswordException') {
      if (e.code === 1) {
        const err = new Error(`needs-password:${file.name}`);
        err.needsPassword = true;
        throw err;
      }
      throw new Error(`Wrong password for "${file.name}"`);
    }
    throw e;
  }

  if (DEBUG) console.log(`📄 Processing ${file.name}, ${doc.numPages} pages`);

  const transactions = [];
  let fullText = '';
  let colInfo = null; // Column info detected from first page header

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items;

    // Build full text for account detection (first page only)
    const pageText = items.map(i => i.str).join(' ');
    if (p === 1) {
      fullText = pageText;
      if (DEBUG) console.log(`  Page 1 text preview: "${pageText.substring(0, 200)}..."`);
    }

    // Group items into lines
    const lines = groupItemsByLine(items);

    // Capture raw lines for the template parser (shown to the user later)
    rawPageLines.push({
      file: file.name,
      page: p,
      lines: lines.map(l => (l.text || '').trim()).filter(Boolean)
    });
    if (DEBUG && p === 1) {
      console.log(`  Page ${p}: ${lines.length} lines grouped`);
      logSampleLines(lines, 8);
    }

    // Try to detect columns from first page header (if not already detected)
    if (p === 1 || !colInfo) {
      colInfo = detectColumns(lines);
      if (!colInfo) {
        if (DEBUG) console.log(`  ⚠ No columns detected, will use fallback`);
      }
    }

    // For each page, try to find the header row again
    // (or use the detected boundaries from page 1)
    let pageColInfo = colInfo;
    if (colInfo && p > 1) {
      // Try to find header on this page too (pages often repeat headers)
      const pageHeader = detectColumns(lines);
      if (pageHeader) {
        pageColInfo = pageHeader; // Use this page's header Y coordinate
      }
      // Otherwise use the same boundaries but we'll need to find where transactions start
    }

    // Parse transactions with column awareness
    if (pageColInfo) {
      const parsed = parseWithColumns(lines, pageColInfo, file.name);
      transactions.push(...parsed);
    } else {
      // Fallback: regex-based classifier (no columns detected)
      if (DEBUG) console.log(`  Using fallback classifier for page ${p}`);
      for (const line of lines) {
        if (isFooterLine(line.text)) continue;
        const tx = classifyLine(line.text, file.name);
        if (tx) {
          tx.file = file.name;
          tx.account = null;
          transactions.push(tx);
        }
      }
    }
  }

  if (DEBUG) console.log(`  Total transactions: ${transactions.length}`);

  // Fill in account number
  const account = extractAccountInfo(fullText);
  for (const tx of transactions) tx.account = account;

  return transactions;
}

// Raw text lines (used to build an LLM parser sample for unsupported formats)
async function getRawLines(file, password) {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data, password: password || '', useWorkerFetch: false, isEvalSupported: false }).promise;
  } catch (e) {
    if (e.name === 'PasswordException') {
      if (e.code === 1) {
        const err = new Error(`needs-password:${file.name}`);
        err.needsPassword = true;
        throw err;
      }
      throw new Error(`Wrong password for "${file.name}"`);
    }
    throw e;
  }
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const line of groupItemsByLine(content.items)) {
      const t = line.text.trim();
      if (t) lines.push(t);
    }
  }
  return lines;
}

// ─── LLM (ChatGPT) parser paste-in ──────────────────────────────────────────
// For formats the built-in parser can't handle: the user opens a prefilled
// ChatGPT link with a sample, pastes back a `parse(lines, file)` function, and
// we run it inside a sandboxed Web Worker (no DOM / network / imports).
let llmSample = { fileName: '', lines: [] };

window.showLLMImprove = function() {
  const panel = document.getElementById('llm-parser-panel');
  if (!panel) return;
  panel.style.display = '';
  const nameEl = document.getElementById('llm-file-name');
  if (nameEl) nameEl.textContent = llmSample.fileName || nameEl.textContent;
  updateLLMButton();
  panel.scrollIntoView({ behavior: 'smooth' });
};

// Button title reflects how many rows the built-in parser already found.
function updateLLMButton() {
  const btn = document.getElementById('llm-improve');
  if (!btn) return;
  const n = allData.length;
  if (n === 0) {
    btn.textContent = '⬡ Get parser from ChatGPT';
    btn.title = 'Built-in parser found no transactions. Get a custom parser from ChatGPT.';
  } else {
    btn.textContent = '⬡ Improve with ChatGPT';
    btn.title = 'Built-in parser found ' + n.toLocaleString() + ' rows. Get a more accurate parser from ChatGPT.';
  }
}

// Build a self-contained spec prompt: example lines + attributes to extract +
// the exact output contract the app expects. Does NOT rely on the built-in parser.
// Redact sensitive data from a line before sending to ChatGPT:
// account/IBAN numbers, long digit runs (amounts, references), and any
// remaining card-like sequences are masked. Structure is preserved so the
// model can still learn the column layout.
function redactLine(line) {
  let s = line;
  // IBAN / account numbers (letters + long digits, or 8+ digit runs)
  s = s.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4,}\b/g, '<IBAN>');
  s = s.replace(/\b(?:\d[ \-]?){8,}\b/g, '<ACCOUNT>');
  // Money amounts: with decimals, or integers >= 100 (likely money, not a year/ref)
  s = s.replace(/\d{1,3}(?:[,\s]\d{3})*\.\d{2}\b/g, '<AMOUNT>');
  s = s.replace(/\b(?:[1-9]\d{2,3}(?:[,\s]\d{3})*)\b/g, '<AMOUNT>');
  // Card / sort-code-like digits and any remaining long numeric refs
  s = s.replace(/\b\d{4,}\b/g, '<NUM>');
  return s;
}

function buildParserPrompt() {
  // Pick up to 3 transaction-like lines (contain a date AND some digits).
  const candidates = llmSample.lines.filter(l =>
    /\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(l) && /\d/.test(l)
  );
  const picked = (candidates.length ? candidates : llmSample.lines).slice(0, 3);
  const exampleLines = picked.map(redactLine).join('\n');
  return [
    'Write a single JavaScript REGULAR EXPRESSION (regex) that extracts transaction fields from bank statement text lines.',
    '',
    'The app will run your regex against each line and read its NAMED CAPTURE GROUPS. Use these exact group names (any subset, but `date` is required):',
    '  • date        — the transaction date',
    '  • description — the payee / transaction description',
    '  • reference   — cheque no. or reference (optional)',
    '  • debit       — money OUT (optional)',
    '  • credit      — money IN (optional)',
    '  • balance     — running balance (optional)',
    '',
    'RETURN ONLY A REGEX LITERAL with named groups, e.g.:',
    '  /(?<date>\\d{2}-[A-Za-z]{3}-\\d{4})\\s+(?<description>.*?)\\s+(?<debit>[\\d,]+(?:\\.\\d{2}))\\s*(?:DR)/g',
    '',
    'RULES:',
    '  • Return ONLY the regex literal. No explanation, no markdown code fences, and NO JavaScript function or code.',
    '  • Use named groups with the exact names above.',
    '  • Do NOT write code that executes; the app interprets the regex itself.',
    '',
    'EXAMPLE RAW LINES (sensitive values redacted as <IBAN>/<ACCOUNT>/<AMOUNT>/<NUM>):',
    exampleLines
  ].join('\n');
}

window.openChatGPT = function() {
  if (!llmSample.lines.length) return;
  updateLLMButton();
  const prompt = buildParserPrompt();
  const url = 'https://chat.openai.com/?prompt=' + encodeURIComponent(prompt);
  window.open(url, '_blank', 'noopener');
};

// Interpret a pasted regex (declarative — never executed as code) into rows.
// The regex must use named groups: date, description, reference, debit,
// credit, balance (any subset). We compile it with RegExp (no eval) and apply
// it to each raw line. This eliminates arbitrary-code-execution risk entirely.
window.useLLMParser = function() {
  const ta = document.getElementById('llm-parser-input');
  const raw = (ta?.value || '').trim();
  if (!raw) return;
  const out = document.getElementById('llm-status');
  out.style.display = '';

  // Accept either a /pattern/flags literal or a bare pattern.
  let pattern, flags = 'g';
  const lit = raw.match(/^\/(.*)\/([gimsuy]*)$/s);
  if (lit) { pattern = lit[1]; if (lit[2]) flags = lit[2]; }
  else { pattern = raw; }

  // Compile on the main thread (no eval). Quick validate before offloading.
  let re;
  try {
    re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  } catch (e) {
    out.textContent = '✗ Invalid regex: ' + e.message;
    return;
  }
  if (!re.global) re = new RegExp(pattern, (flags + 'g'));
  if (pattern.length > 2000) {
    out.textContent = '✗ Regex too long (max 2000 chars).';
    return;
  }

  const source = pattern;
  const named = re.source.includes('?<');

  // Run matching in a Worker with a hard timeout. The worker ONLY compiles a
  // RegExp and runs exec — it never evaluates user code, touches the DOM, or
  // accesses the network. The timeout bounds catastrophic-backtracking (ReDoS)
  // so a malicious/slow regex cannot hang the UI thread.
  const workerCode = `
    self.onmessage = function(e) {
      const { source, flags, lines, file, named } = e.data;
      const kill = setTimeout(() => { self.postMessage({ error: 'Regex timed out (>2s) — possible catastrophic backtracking. Simplify the pattern.' }); self.close(); }, 2000);
      try {
        const re = new RegExp(source, flags.includes('g') ? flags : flags + 'g');
        const rows = [];
        for (const line of lines) {
          if (line.length > 2000) continue;
          re.lastIndex = 0;
          const m = re.exec(line);
          if (!m) continue;
          const g = named ? m.groups : null;
          const get = k => (g && g[k] !== undefined) ? g[k] : null;
          const date = (get('date') || '').trim();
          if (!date) continue;
          const num = v => { if (v == null || v === '' ) return null; const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n) ? null : n; };
          rows.push({
            date: date,
            description: String(get('description') || '').trim() || '(no description)',
            reference: get('reference') ? String(get('reference')).trim() : null,
            debit: num(get('debit')),
            credit: num(get('credit')),
            balance: num(get('balance')),
            file: file,
            account: null,
            raw_line: line
          });
        }
        clearTimeout(kill);
        self.postMessage({ rows });
      } catch (err) {
        clearTimeout(kill);
        self.postMessage({ error: String(err && err.message ? err.message : err) });
      }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  worker.onmessage = function(ev) {
    if (ev.data.error) {
      out.textContent = '✗ ' + ev.data.error;
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      return;
    }
    const rows = ev.data.rows || [];
    if (!rows.length) {
      out.textContent = '✗ No lines matched the regex. Check the named groups (date, description, reference, debit, credit, balance).';
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      return;
    }
    allData = allData.concat(rows);
    allData.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    alasql('DROP TABLE IF EXISTS transactions');
    alasql('CREATE TABLE transactions');
    alasql.tables.transactions.data = allData;
    refreshAfterParse();
    out.textContent = '✓ Parsed ' + rows.length + ' transactions from your regex.';
    if (ta) ta.value = '';
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  };
  worker.onerror = function() {
    out.textContent = '✗ Parser worker failed.';
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  };
  worker.postMessage({ source, flags, lines: llmSample.lines, file: llmSample.fileName, named });
};

// ─── Template parser (build a regex from a marked-up line) ───────────────────
// Instead of hand-writing a regex or prompting ChatGPT, the user picks a real
// transaction line, replaces the values with placeholders ({date}, {description},
// …), and we compile it into the same named-group regex useLLMParser expects.
const TMPL_TOKENS = {
  date:        '(?<date>[0-9]{1,4}[-/.][0-9A-Za-z]{1,5}[-/.][0-9]{1,4})',
  // Description is greedy so it captures the whole narrative; reference is lazy
  // so the amount block at the end still binds correctly. Dates/amounts use
  // specific patterns, which anchor the match.
  // Description is a tempered-greedy capture: it grabs the narrative but stops
  // at the first number that is itself followed by another number (the amount
  // block). That keeps it from eating the debit/credit/balance columns, and
  // naturally leaves a trailing code (e.g. a reference number) for {reference}.
  description: '(?<description>(?:(?!\\d[\\d,.]*\\s+\\d)[\\s\\S])*)',
  reference:   '(?<reference>.+?)',
  debit:       '(?<debit>-?[0-9][0-9,]*(?:\\.[0-9]{1,2})?)',
  credit:      '(?<credit>-?[0-9][0-9,]*(?:\\.[0-9]{1,2})?)',
  balance:     '(?<balance>-?[0-9][0-9,]*(?:\\.[0-9]{1,2})?)',
};

const TMPL_AMOUNTS = new Set(['debit', 'credit', 'balance']);

// Escape a literal segment, turning its whitespace into the right separator:
// generous (\s*) before an amount column (blank columns are common), tighter
// (\s+) between text columns.
function escapeLiteral(lit, nextTok) {
  const esc = lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sep = nextTok && TMPL_AMOUNTS.has(nextTok) ? '\\s*' : '\\s+';
  return esc.replace(/\s+/g, sep);
}

// Turn a template like "{date}  {description}  {reference}  {debit}  {credit}  {balance}"
// into a RegExp source the worker (useLLMParser) can run.
function buildRegexFromTemplate(tmpl) {
  const tokenRe = /\{([a-z]+)\}/g;
  let m, last = 0;
  const parts = [];
  const seen = {};
  while ((m = tokenRe.exec(tmpl)) !== null) {
    const name = m[1];
    if (!TMPL_TOKENS[name]) {
      return { error: `Unknown placeholder "{${name}}". Use: ${Object.keys(TMPL_TOKENS).join(', ')}` };
    }
    if (seen[name]) {
      return { error: `Placeholder "{${name}}" is used more than once. Use each placeholder at most once.` };
    }
    seen[name] = true;
    const lit = tmpl.slice(last, m.index);
    if (lit) parts.push(escapeLiteral(lit, name));
    parts.push(TMPL_TOKENS[name]);
    last = tokenRe.lastIndex;
  }
  const tail = tmpl.slice(last);
  if (tail) parts.push(escapeLiteral(tail).replace(/\s+/g, '\\s*'));
  if (!seen.date) return { error: 'Include a {date} placeholder — it is required.' };
  if (parts.length === 0) return { error: 'Template is empty.' };
  return { pattern: '^\\s*' + parts.join('') + '\\s*$' };
}

window.openTemplateBuilder = function() {
  const modal = document.getElementById('template-builder-modal');
  if (!modal) return;
  if (rawPageLines.length) {
    llmSample = { fileName: rawPageLines[0].file, lines: rawPageLines.flatMap(p => p.lines) };
  }
  const sel = document.getElementById('tmpl-page');
  sel.innerHTML = '';
  if (!rawPageLines.length) {
    sel.innerHTML = '<option>No statement loaded yet</option>';
  } else {
    rawPageLines.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `${p.file} — page ${p.page}`;
      sel.appendChild(o);
    });
  }
  tmplRenderPage();
  document.getElementById('tmpl-input').value = '';
  document.getElementById('tmpl-preview').textContent = '';
  modal.style.display = 'flex';
};

window.closeTemplateBuilder = function() {
  const modal = document.getElementById('template-builder-modal');
  if (modal) modal.style.display = 'none';
};

function tmplRenderPage() {
  const sel = document.getElementById('tmpl-page');
  const idx = parseInt(sel.value, 10) || 0;
  const page = rawPageLines[idx];
  const wrap = document.getElementById('tmpl-raw');
  wrap.innerHTML = '';
  if (!page) return;
  page.lines.forEach(line => {
    const d = document.createElement('div');
    d.className = 'tmpl-line';
    d.textContent = line;
    d.onclick = () => {
      document.getElementById('tmpl-input').value = line;
      document.getElementById('tmpl-preview').textContent = '';
    };
    wrap.appendChild(d);
  });
}

window.tmplSelectPage = function() { tmplRenderPage(); };

window.tmplInsertToken = function(tok) {
  const ta = document.getElementById('tmpl-input');
  const s = ta.selectionStart || ta.value.length;
  const e = ta.selectionEnd || ta.value.length;
  ta.value = ta.value.slice(0, s) + '{' + tok + '}' + ta.value.slice(e);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + tok.length + 2;
};

window.tmplPreview = function() {
  const out = document.getElementById('tmpl-preview');
  const tmpl = document.getElementById('tmpl-input').value;
  const { pattern, error } = buildRegexFromTemplate(tmpl);
  if (error) { out.textContent = '✗ ' + error; return; }
  const sel = document.getElementById('tmpl-page');
  const page = rawPageLines[parseInt(sel.value, 10) || 0];
  let re;
  try { re = new RegExp(pattern, 'g'); } catch (e) { out.textContent = '✗ Invalid regex: ' + e.message; return; }
  let count = 0, sample = null;
  for (const line of (page ? page.lines : [])) {
    re.lastIndex = 0;
    const m = re.exec(line);
    if (m) { count++; if (!sample) sample = m.groups; }
  }
  let msg = `✓ ${count} line(s) on this page match.\n`;
  msg += sample ? 'Sample: ' + JSON.stringify(sample) : 'No matches here — adjust the template or pick another page.';
  out.textContent = msg;
};

window.tmplUseParser = function() {
  const out = document.getElementById('tmpl-preview');
  const tmpl = document.getElementById('tmpl-input').value;
  const { pattern, error } = buildRegexFromTemplate(tmpl);
  if (error) { out.textContent = '✗ ' + error; return; }
  if (rawPageLines.length) {
    llmSample = { fileName: rawPageLines[0].file, lines: rawPageLines.flatMap(p => p.lines) };
  }
  allData = [];
  document.getElementById('llm-parser-input').value = pattern;
  closeTemplateBuilder();
  useLLMParser();
};

function refreshAfterParse() {
  const badge = document.getElementById('badge');
  badge.className = 'badge ok';
  document.getElementById('badge-text').textContent = `${allData.length.toLocaleString()} rows loaded`;
  const totalDebit  = allData.reduce((s, r) => s + (r.debit  || 0), 0);
  const totalCredit = allData.reduce((s, r) => s + (r.credit || 0), 0);
  const fileCount   = new Set(allData.map(r => r.file)).size;
  document.getElementById('s-count').textContent  = allData.length.toLocaleString();
  document.getElementById('s-files').textContent  = fileCount;
  document.getElementById('s-debit').textContent  = fmtMoney(totalDebit);
  document.getElementById('s-credit').textContent = fmtMoney(totalCredit);
  document.getElementById('stats-section').style.display = '';
  const welcomeCard = document.getElementById('welcome-card');
  if (welcomeCard) welcomeCard.style.display = 'none';
  const panel = document.getElementById('llm-parser-panel');
  if (panel) panel.style.display = 'none';
  setTableView('table');
}

// ─── Parse orchestration ────────────────────────────────────────────────────
window.startParsing = async function() {
  if (!files.length) return;
  const password = document.getElementById('pw').value;
  const pwSection = document.getElementById('pw-section');

  // If password section is visible and password is empty, highlight it
  if (pwSection.style.display !== 'none' && !password) {
    document.getElementById('pw').focus();
    document.getElementById('pw').style.borderColor = 'var(--red)';
    return;
  }
  document.getElementById('pw').style.borderColor = '';

  // Show progress
  document.getElementById('progress-section').style.display = '';
  document.getElementById('btn-parse').disabled = true;
  const log = document.getElementById('progress-log');
  const bar = document.getElementById('progress-bar');

  function addLog(msg) {
    log.innerHTML += msg + '<br>';
    log.scrollTop = log.scrollHeight;
  }

  allData = [];
  rawPageLines = [];
  let done = 0;
  const unsupported = [];

  for (const file of files) {
    addLog(`⏳ ${file.name}…`);
    try {
      const txns = await parsePDF(file, password || '');
      allData.push(...txns);
      addLog(`✓ ${file.name} → ${txns.length} transactions`);
      if (!txns.length) unsupported.push(file);
    } catch (e) {
      if (e.needsPassword) {
        addLog(`🔒 ${file.name} is password protected`);
        pwSection.style.display = '';
        document.getElementById('pw-message').textContent = `🔒 ${file.name} requires a password`;
        document.getElementById('pw').focus();
        document.getElementById('btn-parse').disabled = false;
        document.getElementById('btn-parse').textContent = 'Retry with Password';
        document.getElementById('progress-section').style.display = 'none';
        return;
      }
      addLog(`✗ ${file.name}: ${e.message}`);
      unsupported.push(file);
    }
    done++;
    bar.style.width = `${(done / files.length) * 100}%`;
  }
  // Reset button text after successful parse
  document.getElementById('btn-parse').textContent = 'Extract Data';

  addLog(`─ Done: ${allData.length} total transactions`);

  // Capture a sample from the first file so "Improve with ChatGPT" is available
  // whenever data is loaded (not only on parse failure).
  const sampleFile = files[0];
  try {
    const raw = await getRawLines(sampleFile, password);
    llmSample = { fileName: sampleFile.name, lines: raw };
  } catch (e) {
    addLog(`✗ Could not extract sample: ${e.message}`);
  }

  // If a file produced no transactions, show the full LLM parser panel.
  if (unsupported.length && allData.length === 0) {
    const panel = document.getElementById('llm-parser-panel');
    if (panel) {
      panel.style.display = '';
      const nameEl = document.getElementById('llm-file-name');
      if (nameEl) nameEl.textContent = sampleFile.name;
    }
  } else if (allData.length > 0) {
    // Built-in parser succeeded: offer "Improve statement parsing with ChatGPT".
    const improve = document.getElementById('llm-improve');
    if (improve) {
      improve.style.display = '';
      updateLLMButton();
    }
  }

  // Sort by date
  allData.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Register in AlaSQL
  alasql('DROP TABLE IF EXISTS transactions');
  alasql('CREATE TABLE transactions');
  alasql.tables.transactions.data = allData;

  // Update UI
  const badge = document.getElementById('badge');
  badge.className = 'badge ok';
  document.getElementById('badge-text').textContent = `${allData.length.toLocaleString()} rows loaded`;

  const totalDebit  = allData.reduce((s, r) => s + (r.debit  || 0), 0);
  const totalCredit = allData.reduce((s, r) => s + (r.credit || 0), 0);
  const fileCount   = new Set(allData.map(r => r.file)).size;
  document.getElementById('s-count').textContent  = allData.length.toLocaleString();
  document.getElementById('s-files').textContent  = fileCount;
  document.getElementById('s-debit').textContent  = fmtMoney(totalDebit);
  document.getElementById('s-credit').textContent = fmtMoney(totalCredit);
  document.getElementById('stats-section').style.display = '';
  // Hide welcome card when data is loaded
  const welcomeCard = document.getElementById('welcome-card');
  if (welcomeCard) welcomeCard.style.display = 'none';

  document.getElementById('btn-run').disabled     = false;
  document.getElementById('btn-run-mobile').disabled = false;
  document.getElementById('btn-parse').disabled   = false;
  document.getElementById('btn-save').disabled    = false;
  document.getElementById('btn-save-mobile').disabled = false;

  // Reveal the "Build template" entry point now that raw lines exist
  const tmplBtn = document.getElementById('btn-tmpl');
  if (tmplBtn) tmplBtn.style.display = '';

  // Default into the no-SQL data-table view; keep SQL prefilled for advanced mode
  const sqlEl = document.getElementById('sql');
  if (!sqlEl.value.trim()) {
    sqlEl.value = "SELECT date, description, reference, debit, credit, balance\nFROM transactions\nORDER BY date DESC\nLIMIT 50";
  }
  // If a password was used, trigger Chrome's password manager to offer saving
  if (password) {
    const pwForm = document.getElementById('pw-form');
    if (pwForm && pwForm.requestSubmit) pwForm.requestSubmit();
  }
  setTableView('table');
};

// ─── SQL query execution ─────────────────────────────────────────────────────
document.getElementById('sql').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const t = e.target, s = t.selectionStart;
    t.value = t.value.substring(0, s) + '  ' + t.value.substring(t.selectionEnd);
    t.selectionStart = t.selectionEnd = s + 2;
  }
});

window.runQuery = function() {
  const sql = document.getElementById('sql').value.trim();
  if (!sql) return;
  hideError();

  const t0 = performance.now();
  try {
    const rows = alasql(sql);
    const ms   = (performance.now() - t0).toFixed(1);
    if (!Array.isArray(rows)) {
      document.getElementById('results-meta').innerHTML = '<span>Query executed</span>';
      renderTable([]);
      return;
    }
    lastRows = rows;
    document.getElementById('results-meta').innerHTML =
      `<span>RESULTS</span><span><span class="hi">${rows.length.toLocaleString()}</span> row${rows.length!==1?'s':''}</span>`;
    document.getElementById('exec-time').textContent = `${ms}ms`;
    document.getElementById('btn-export').disabled = rows.length === 0;
    renderTable(rows);
  } catch (e) {
    showError(e.message);
  }
};

window.clearSQL  = () => { document.getElementById('sql').value = ''; document.getElementById('sql').focus(); };
// ─── Data-table mode (no-SQL advanced table) ────────────────────────────────
// Operates directly on `allData` (the in-memory transactions table).
let tableView = 'table';          // 'table' | 'sql'
const DT_COLUMNS = [
  { key: 'date',        label: 'Date',        type: 'date' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'reference',   label: 'Reference',   type: 'text' },
  { key: 'debit',       label: 'Sent/Spent',  type: 'number' },
  { key: 'credit',      label: 'Received',    type: 'number' },
  { key: 'balance',     label: 'Balance',     type: 'number' },
  { key: 'file',        label: 'File',        type: 'category' },
];
const DT_TYPE_OPTIONS = {
  text:    [['contains','Contains'],['eq','Equals'],['starts','Starts with'],['empty','Is empty']],
  number:  [['eq','='],['gte','≥'],['lte','≤'],['between','Between'],['empty','Is empty']],
  date:    [['gte','From'],['lte','To'],['between','Range'],['empty','Is empty']],
  category:[['eq','Equals'],['neq','Not equals'],['empty','Is empty']],
};
// Per-column filter state: { op, value, value2 }
const dtFilters = {};
// Group-by key (one of DT_COLUMNS.key) or null
let dtGroupBy = null;
// Sort state shared with header clicks
let dtSortCol = null;
let dtSortDir = 1;
// Debounce timers per column/field for live filter inputs
const dtDebounceTimers = {};

function dtColumnType(key) {
  return DT_COLUMNS.find(c => c.key === key)?.type || 'text';
}

function dtApplyFilters(rows) {
  return rows.filter(r => {
    for (const key in dtFilters) {
      const f = dtFilters[key];
      if (!f || !f.op) continue;
      const raw = r[key];
      const type = dtColumnType(key);
      const empty = raw === null || raw === undefined || raw === '';
      if (f.op === 'empty') {
        if (!empty) return false;
        continue;
      }
      if (empty) return false;
      if (type === 'text') {
        const s = String(raw).toLowerCase();
        const v = String(f.value || '').toLowerCase();
        if (f.op === 'contains' && !s.includes(v)) return false;
        if (f.op === 'eq' && s !== v) return false;
        if (f.op === 'starts' && !s.startsWith(v)) return false;
      } else if (type === 'number') {
        const n = Number(raw);
        if (f.op === 'eq' && n !== Number(f.value)) return false;
        if (f.op === 'gte' && n < Number(f.value)) return false;
        if (f.op === 'lte' && n > Number(f.value)) return false;
        if (f.op === 'between' && (n < Number(f.value) || n > Number(f.value2))) return false;
      } else if (type === 'date') {
        const d = String(raw);
        if (f.op === 'gte' && d < f.value) return false;
        if (f.op === 'lte' && d > f.value) return false;
        if (f.op === 'between' && (d < f.value || d > f.value2)) return false;
      } else if (type === 'category') {
        const s = String(raw);
        if (f.op === 'eq' && s !== f.value) return false;
        if (f.op === 'neq' && s === f.value) return false;
      }
    }
    return true;
  });
}

function dtSort(rows) {
  if (!dtSortCol) return rows;
  const col = dtSortCol;
  const type = dtColumnType(col);
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (type === 'number') return dtSortDir * (Number(av) - Number(bv));
    return dtSortDir * String(av).localeCompare(String(bv));
  });
}

function dtGroup(rows) {
  if (!dtGroupBy) return [{ key: null, label: null, rows }];
  const map = new Map();
  for (const r of rows) {
    let gk = r[dtGroupBy];
    if (gk === null || gk === undefined || gk === '') gk = '(blank)';
    if (dtGroupBy === 'date' && typeof gk === 'string' && gk.length >= 7) gk = gk.slice(0, 7); // month
    if (!map.has(gk)) map.set(gk, []);
    map.get(gk).push(r);
  }
  return [...map.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([k, rs]) => ({ key: k, label: `${DT_COLUMNS.find(c=>c.key===dtGroupBy)?.label}: ${k}`, rows: rs }));
}

// Build the filter toolbar markup for the data-table header row
function dtFilterControls() {
  return DT_COLUMNS.map(c => {
    const f = dtFilters[c.key] || {};
    const ops = DT_TYPE_OPTIONS[c.type]
      .map(([v,l]) => `<option value="${v}" ${f.op===v?'selected':''}>${l}</option>`).join('');
    return `<th data-col="${c.key}">
      <div class="dt-th-label" onclick="dtSortClick('${c.key}')">${c.label}<span class="si">${dtSortCol===c.key?(dtSortDir>0?'↑':'↓'):'⇅'}</span></div>
      <select class="dt-op" onchange="dtOpChange('${c.key}',this.value)">${ops}</select>
      <input class="dt-val" type="text" placeholder="value" value="${f.value??''}" oninput="dtValChange('${c.key}','value',this.value)">
      ${f.op==='between' ? `<input class="dt-val2" type="text" placeholder="to" value="${f.value2??''}" oninput="dtValChange('${c.key}','value2',this.value)">` : ''}
    </th>`;
  }).join('');
}

window.dtOpChange = function(key, op) {
  if (!dtFilters[key]) dtFilters[key] = {};
  dtFilters[key].op = op;
  if (!op) delete dtFilters[key];
  dtRender();
};
window.dtValChange = function(key, which, val) {
  if (!dtFilters[key]) dtFilters[key] = {};
  dtFilters[key][which] = val;
  // Live-but-debounced: operator change re-renders instantly; value typing waits 250ms
  if (!dtDebounceTimers[key]) dtDebounceTimers[key] = {};
  clearTimeout(dtDebounceTimers[key][which]);
  dtDebounceTimers[key][which] = setTimeout(dtRender, 250);
};
window.dtSortClick = function(key) {
  if (dtSortCol === key) dtSortDir *= -1;
  else { dtSortCol = key; dtSortDir = 1; }
  dtRender();
};
window.dtSetGroup = function(key) {
  dtGroupBy = (dtGroupBy === key) ? null : key;
  document.querySelectorAll('.dt-chip[data-group]').forEach(c => {
    c.classList.toggle('active', c.dataset.group === dtGroupBy);
  });
  dtRender();
};
window.dtClearFilters = function() {
  for (const k in dtFilters) { delete dtFilters[k]; if (dtDebounceTimers[k]) for (const w in dtDebounceTimers[k]) clearTimeout(dtDebounceTimers[k][w]); }
  dtRender();
};
window.dtClearGroup = function() {
  dtGroupBy = null;
  dtRender();
};

function dtRowHtml(row) {
  return '<tr>' + DT_COLUMNS.map(c => {
    const cls = cellClass(c.key);
    return `<td class="${cls}" title="${escapeAttr(row[c.key]??'')}">${fmtCell(c.key, row[c.key])}</td>`;
  }).join('') + '</tr>';
}

function dtRender() {
  const wrap = document.getElementById('table-wrap');
  if (tableView !== 'table') return;
  let rows = dtApplyFilters(allData);
  rows = dtSort(rows);
  const groups = dtGroup(rows);

  const total = rows.length;
  document.getElementById('results-meta').innerHTML =
    `<span>DATA TABLE</span><span><span class="hi">${total.toLocaleString()}</span> row${total!==1?'s':''}${dtGroupBy?' · grouped by '+dtGroupBy:''}</span>`;
  document.getElementById('exec-time').textContent = '';
  document.getElementById('btn-export').disabled = total === 0;
  lastRows = rows;

  let html = '<table class="dt-table"><thead><tr>' + dtFilterControls() + '</tr></thead><tbody>';
  if (!total) {
    html += `<tr><td colspan="${DT_COLUMNS.length}" class="dt-empty">No rows match filters</td></tr>`;
  } else if (dtGroupBy) {
    for (const g of groups) {
      const sumD = g.rows.reduce((s,r)=>s+(r.debit||0),0);
      const sumC = g.rows.reduce((s,r)=>s+(r.credit||0),0);
      html += `<tr class="dt-group"><td colspan="${DT_COLUMNS.length}">${escapeHtml(g.label)} · ${g.rows.length} rows · ${fmtMoney(sumD)} out / ${fmtMoney(sumC)} in</td></tr>`;
      html += g.rows.map(dtRowHtml).join('');
    }
  } else {
    html += rows.map(dtRowHtml).join('');
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
  dtSyncSQL();
}

function dtSyncSQL() {
  const clauses = [];
  for (const key in dtFilters) {
    const f = dtFilters[key];
    if (!f || !f.op) continue;
    if (f.op === 'empty') {
      clauses.push(key + ' IS NULL');
      continue;
    }
    if (!f.value && f.value !== 0) continue;
    const v = String(f.value);
    const v2 = f.value2 != null ? String(f.value2) : null;
    const esc = s => "'" + s.replace(/'/g, "''") + "'";
    switch (f.op) {
      case 'contains': clauses.push('UPPER(' + key + ') LIKE ' + esc('%' + v.toUpperCase() + '%')); break;
      case 'starts':   clauses.push('UPPER(' + key + ') LIKE ' + esc(v.toUpperCase() + '%')); break;
      case 'eq':       clauses.push(key + ' = ' + (isNaN(Number(v)) ? esc(v) : v)); break;
      case 'neq':      clauses.push(key + ' != ' + (isNaN(Number(v)) ? esc(v) : v)); break;
      case 'gte':      clauses.push(key + ' >= ' + v); break;
      case 'lte':      clauses.push(key + ' <= ' + v); break;
      case 'between':  clauses.push(key + ' >= ' + v + ' AND ' + key + ' <= ' + (v2 || v)); break;
    }
  }
  let sql = 'SELECT date, description, reference, debit, credit, balance, file\nFROM transactions';
  if (clauses.length) sql += '\nWHERE ' + clauses.join('\n  AND ');
  if (dtSortCol) sql += '\nORDER BY ' + dtSortCol + ' ' + (dtSortDir > 0 ? 'ASC' : 'DESC');
  if (dtGroupBy) sql += '\nGROUP BY ' + dtGroupBy;
  document.getElementById('sql').value = sql;
}

// Mode switching
window.setTableView = function(mode) {
  tableView = mode;
  document.getElementById('pane-sql').style.display    = (mode === 'sql') ? '' : 'none';
  document.getElementById('pane-table').style.display  = (mode === 'table') ? '' : 'none';
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  if (mode === 'table') dtRender();
  else dtSyncSQL();
};

// Export reflects current view
window.exportCSV = function() {
  if (!lastRows.length) return;
  const cols = (tableView === 'table')
    ? DT_COLUMNS.map(c => c.key)
    : (lastRows[0] ? Object.keys(lastRows[0]) : []);
  const lines = [cols.join(',')];
  for (const row of lastRows) {
    lines.push(cols.map(c => {
      const v = row[c] ?? '';
      return String(v).includes(',') ? `"${String(v).replace(/"/g,'""')}"` : v;
    }).join(','));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `bankquery_${Date.now()}.csv`;
  a.click();
};

// ─── Table rendering ──────────────────────────────────────────────────────────
const DEBIT_COLS   = new Set(['debit']);
const CREDIT_COLS  = new Set(['credit']);
const BAL_COLS     = new Set(['balance']);
const DESC_COLS    = new Set(['description', 'desc', 'narr']);
const REF_COLS     = new Set(['reference', 'ref']);
const DATE_COLS    = new Set(['date']);

function cellClass(col) {
  if (DEBIT_COLS.has(col))  return 'c-debit c-right';
  if (CREDIT_COLS.has(col)) return 'c-credit c-right';
  if (BAL_COLS.has(col))    return 'c-bal c-right';
  if (DESC_COLS.has(col))   return 'c-desc';
  if (REF_COLS.has(col))    return 'c-dim';
  if (DATE_COLS.has(col))   return 'c-dim';
  if (typeof (lastRows[0]?.[col]) === 'number') return 'c-right';
  return '';
}
function fmtCell(col, val) {
  if (val === null || val === undefined) return '<span style="color:var(--rule2)">—</span>';
  if ((DEBIT_COLS.has(col)||CREDIT_COLS.has(col)||BAL_COLS.has(col)) && typeof val === 'number')
    return fmtMoney(val);
  return escapeHtml(String(val));
}
function fmtMoney(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTable(rows) {
  const wrap = document.getElementById('table-wrap');
  if (!rows || !rows.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="big">∅</div><div class="title">No results</div></div>';
    return;
  }
  const cols = Object.keys(rows[0]);
  sortCol = null; sortDir = 1;
  let html = '<table><thead><tr>';
  cols.forEach(c => {
    html += `<th onclick="sortBy('${c}')" data-col="${c}">${c} <span class="si">⇅</span></th>`;
  });
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const c of cols) {
      const cls = cellClass(c);
      html += `<td class="${cls}" title="${escapeAttr(row[c]??'')}">${fmtCell(c,row[c])}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

window.sortBy = function(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  const sorted = [...lastRows].sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return sortDir * (av - bv);
    return sortDir * String(av).localeCompare(String(bv));
  });
  renderTable(sorted);
  document.querySelectorAll('th').forEach(th => {
    const isSorted = th.dataset.col === col;
    th.classList.toggle('sorted', isSorted);
    const si = th.querySelector('.si');
    if (si) si.textContent = isSorted ? (sortDir > 0 ? '↑' : '↓') : '⇅';
  });
};

function showError(msg) {
  const box = document.getElementById('error-msg');
  box.textContent = '✗ ' + msg;
  box.style.display = 'block';
  document.getElementById('results-meta').innerHTML = '<span>RESULTS</span><span class="err">Error</span>';
  document.getElementById('table-wrap').innerHTML =
    '<div class="empty-state"><div class="big">⚠</div><div class="title">Query failed</div></div>';
}
function hideError() {
  document.getElementById('error-msg').style.display = 'none';
}

// ─── Mobile sidebar toggle ─────────────────────────────────────────────────────
window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
};

window.closeSidebar = function() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
};

// Focus upload zone - for welcome card CTA
// On mobile: opens sidebar; on desktop: triggers file picker
window.focusUpload = function() {
  if (window.innerWidth <= 768) {
    // Mobile: open sidebar
    toggleSidebar();
  } else {
    // Desktop: trigger file picker
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.click();
    }
  }
};

// Toggle password field visibility
window.togglePasswordField = function() {
  const checkbox = document.getElementById('pw-protected');
  const pwRow = document.getElementById('pw-row');
  if (pwRow) {
    pwRow.style.display = checkbox.checked ? 'flex' : 'none';
  }
};

// ─── Query picker modal (mobile) ───────────────────────────────────────────────
window.showQueryPicker = function() {
  const modal = document.getElementById('query-picker-modal');
  modal.classList.add('active');
  populateQueryPicker();
};

window.hideQueryPicker = function() {
  document.getElementById('query-picker-modal').classList.remove('active');
};

function populateQueryPicker() {
  // Populate saved queries
  const savedSection = document.getElementById('qp-saved-section');
  const savedList = document.getElementById('qp-saved-list');
  const savedQueries = getSavedQueries();

  if (savedQueries.length > 0) {
    savedSection.style.display = '';
    savedList.innerHTML = '';
    savedQueries.forEach(q => {
      const el = document.createElement('button');
      el.className = 'query-item saved';
      el.innerHTML = `<span class="q-label">${escapeHtml(q.name)}</span>`;
      el.onclick = () => {
        document.getElementById('sql').value = q.sql;
        hideQueryPicker();
      };
      savedList.appendChild(el);
    });
  } else {
    savedSection.style.display = 'none';
  }

  // Populate example queries
  const exampleList = document.getElementById('qp-example-list');
  if (!exampleList.hasChildNodes()) {
    EXAMPLES.forEach(q => {
      const el = document.createElement('button');
      el.className = 'query-item';
      el.innerHTML = `<span class="q-label">${q.label}</span>`;
      el.onclick = () => {
        document.getElementById('sql').value = q.sql;
        hideQueryPicker();
      };
      exampleList.appendChild(el);
    });
  }
}

// Close query picker on backdrop click
document.getElementById('query-picker-modal')?.addEventListener('click', e => {
  if (e.target.id === 'query-picker-modal') {
    hideQueryPicker();
  }
});
