// ─── pdf.js setup ───────────────────────────────────────────────────────────
import * as pdfjsLib from './pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

// ─── State ──────────────────────────────────────────────────────────────────
let files     = [];   // FileList/array
let allData   = [];   // parsed transactions
let lastRows  = [];   // last query results
let sortCol   = null;
let sortDir   = 1;
let DEBUG = true;  // Set to false to disable console logging

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
    el.innerHTML = `<div class="eq-label">${escapeHtml(q.name)}</div>${escapeHtml(q.sql.split('\n')[0])}…<span class="eq-delete" onclick="event.stopPropagation(); deleteSavedQuery('${q.id}')">×</span>`;
    el.onclick = () => { document.getElementById('sql').value = q.sql; };
    savedList.appendChild(el);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  { label: "Biggest debits",      sql: "SELECT date, description, reference, debit, file\nFROM transactions\nWHERE debit IS NOT NULL\nORDER BY debit DESC\nLIMIT 20" },
  { label: "Search merchant",     sql: "SELECT date, description, reference, debit, credit\nFROM transactions\nWHERE UPPER(description) LIKE '%AMAZON%'\nORDER BY date DESC" },
  { label: "Credits only",        sql: "SELECT date, description, reference, credit\nFROM transactions\nWHERE credit IS NOT NULL AND credit > 0\nORDER BY credit DESC" },
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
  el.innerHTML = `<div class="eq-label">${q.label}</div>${q.sql.split('\n')[0]}…`;
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
  dropZone.innerHTML = `<span class="icon">📄</span><strong>${n} file${n>1?'s':''} selected</strong><br>${list.map(f=>f.name).join(', ')}`;
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
      password,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e.name === 'PasswordException' || (e.message && e.message.toLowerCase().includes('password'))) {
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

// ─── Parse orchestration ────────────────────────────────────────────────────
window.startParsing = async function() {
  if (!files.length) return;
  const password = document.getElementById('pw').value;

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
  let done = 0;

  for (const file of files) {
    addLog(`⏳ ${file.name}…`);
    try {
      const txns = await parsePDF(file, password);
      allData.push(...txns);
      addLog(`✓ ${file.name} → ${txns.length} transactions`);
    } catch (e) {
      addLog(`✗ ${file.name}: ${e.message}`);
    }
    done++;
    bar.style.width = `${(done / files.length) * 100}%`;
  }

  addLog(`─ Done: ${allData.length} total transactions`);

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

  // Auto-run default query
  const sqlEl = document.getElementById('sql');
  if (!sqlEl.value.trim()) {
    sqlEl.value = "SELECT date, description, reference, debit, credit, balance\nFROM transactions\nORDER BY date DESC\nLIMIT 50";
  }
  runQuery();
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
window.exportCSV = () => {
  if (!lastRows.length) return;
  const cols = Object.keys(lastRows[0]);
  const lines = [cols.join(',')];
  for (const row of lastRows) {
    lines.push(cols.map(c => {
      const v = row[c] ?? '';
      return String(v).includes(',') ? `"${String(v).replace(/"/g,'""')}"` : v;
    }).join(','));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `query_${Date.now()}.csv`;
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
  return String(val);
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
      html += `<td class="${cls}" title="${String(row[c]??'').replace(/"/g,'&quot;')}">${fmtCell(c,row[c])}</td>`;
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
      el.innerHTML = `<span class="q-label">${escapeHtml(q.name)}</span><span class="q-preview">${escapeHtml(q.sql)}</span>`;
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
      el.innerHTML = `<span class="q-label">${q.label}</span><span class="q-preview">${q.sql.split('\n')[0]}…</span>`;
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
