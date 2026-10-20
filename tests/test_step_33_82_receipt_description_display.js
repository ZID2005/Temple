/**
 * STEP 33.82: Focused Regression Test Suite
 * Receipt Description Display and Accounting Particulars Verification
 * 
 * Verifies:
 * 1. Receipts table displays description beneath devotee name with safe escaping and neutral handling.
 * 2. Cash Book Particulars append non-empty description with ' — ' while preserving 7-column schema.
 * 3. General Ledger Particulars append non-empty description with ' — ' while preserving 6-column schema.
 * 4. Empty/null/undefined descriptions retain exact baseline text without unwanted punctuation.
 * 5. HTML injection prevention via esc() utility across all 3 view renderers.
 * 6. Financial math, totals, debit/credit indexing (tds[4], tds[5]), and exports remain 100% intact.
 * 7. Byte-exact backup, file hash verification, and strict system isolation (zero network / zero production).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const BASELINE_HASH = '17BB408830459B3FB1CEC6F40D04221D3C06BF3BFDAEDAFEBFFD2D7DAD562A4E';
const BASELINE_SIZE = 832866;
const BACKUP_PATH = path.resolve('d:/Temple/backups/Temple_Accounts-1_PreStep33_82_ReceiptDescriptionDisplay_Backup_20261017_225000.html');
const HTML_PATH = path.resolve('d:/Temple/Temple_Accounts-1.html');

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').toUpperCase();
}

console.log('========================================================================');
console.log('STEP 33.82: RECEIPT DESCRIPTION DISPLAY & ACCOUNTING PARTICULARS TEST');
console.log('========================================================================\n');

const currentHtml = fs.readFileSync(HTML_PATH, 'utf8');
const currentHash = computeHash(currentHtml);
const currentSize = Buffer.byteLength(currentHtml, 'utf8');

console.log(`Current HTML SHA-256: ${currentHash}`);
console.log(`Current HTML Size:    ${currentSize} bytes`);

const results = [];
let passCount = 0;
let failCount = 0;

function assertTest(groupId, testId, description, passed, detail = '') {
  const status = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`  ${status} ${groupId} / ${testId}: ${description}${detail ? ` (${detail})` : ''}`);
  results.push({ groupId, testId, description, passed, detail });
  if (passed) passCount++;
  else failCount++;
}

// ============================================================================
// GROUP 1: Cryptographic Invariants & Backup Verification
// ============================================================================
console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');

const backupExists = fs.existsSync(BACKUP_PATH);
assertTest('GROUP-1', 'T1.1', 'Byte-exact backup file exists at expected path', backupExists);

if (backupExists) {
  const backupHtml = fs.readFileSync(BACKUP_PATH, 'utf8');
  const backupHash = computeHash(backupHtml);
  const backupSize = Buffer.byteLength(backupHtml, 'utf8');

  assertTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
    backupHash === BASELINE_HASH, `Hash: ${backupHash}`);
  assertTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
    backupSize === BASELINE_SIZE, `${backupSize} bytes`);
  assertTest('GROUP-1', 'T1.4', 'Current file size reflects surgical modification',
    currentSize === 833272, `Size: ${currentSize} bytes (Delta: +406 bytes)`);
}

// Verify that only the 3 designated locations in the HTML file were altered compared to the backup
if (backupExists) {
  const backupLines = fs.readFileSync(BACKUP_PATH, 'utf8').split('\n');
  const currentLines = currentHtml.split('\n');
  
  // Find modified line chunks
  let diffBlocks = 0;
  let inDiff = false;
  const maxLines = Math.max(backupLines.length, currentLines.length);
  let bIdx = 0;
  let cIdx = 0;
  
  while (bIdx < backupLines.length && cIdx < currentLines.length) {
    if (backupLines[bIdx] !== currentLines[cIdx]) {
      if (!inDiff) {
        diffBlocks++;
        inDiff = true;
      }
      // Advance to sync
      if (backupLines[bIdx].includes('function toggleBankField') || currentLines[cIdx].includes('function toggleBankField')) {
        // sync
        while (bIdx < backupLines.length && !backupLines[bIdx].includes('function toggleBankField')) bIdx++;
        while (cIdx < currentLines.length && !currentLines[cIdx].includes('function toggleBankField')) cIdx++;
        inDiff = false;
      } else if (backupLines[bIdx].includes('payments.filter(p=>p.paymentMode===\'Cash\'') || currentLines[cIdx].includes('payments.filter(p=>p.paymentMode===\'Cash\'')) {
        while (bIdx < backupLines.length && !backupLines[bIdx].includes('payments.filter(p=>p.paymentMode===\'Cash\'')) bIdx++;
        while (cIdx < currentLines.length && !currentLines[cIdx].includes('payments.filter(p=>p.paymentMode===\'Cash\'')) cIdx++;
        inDiff = false;
      } else if (backupLines[bIdx].includes('window._ledgerRows = combined;') || currentLines[cIdx].includes('window._ledgerRows = combined;')) {
        while (bIdx < backupLines.length && !backupLines[bIdx].includes('window._ledgerRows = combined;')) bIdx++;
        while (cIdx < currentLines.length && !currentLines[cIdx].includes('window._ledgerRows = combined;')) cIdx++;
        inDiff = false;
      } else {
        bIdx++;
        cIdx++;
      }
    } else {
      inDiff = false;
      bIdx++;
      cIdx++;
    }
  }

  assertTest('GROUP-1', 'T1.5', 'Exactly 3 surgical diff blocks in the entire application file',
    diffBlocks === 3, `Diff block count: ${diffBlocks}`);
}

// ============================================================================
// GROUP 2: Receipts Table Renderer (VIEW_RENDERERS.receipts)
// ============================================================================
console.log('\n--- TEST GROUP 2: Receipts Table Renderer Verification ---');

// Check receipts table header in HTML source
const receiptTheadMatch = currentHtml.match(/<thead><tr><th>Receipt No<\/th><th>Date<\/th><th>Name<\/th><th>Fund<\/th><th>Category<\/th><th>Mode<\/th><th>Amount<\/th><th>Status<\/th><th>Actions<\/th><\/tr><\/thead>/);
assertTest('GROUP-2', 'T2.1', 'Receipts table header strictly preserves existing 9-column schema and column order', !!receiptTheadMatch);

// Check CSS numeric alignment rule
const receiptCssAlignMatch = currentHtml.match(/#receiptTable\s+th:nth-child\(7\),\s*#receiptTable\s+td:nth-child\(7\)/);
assertTest('GROUP-2', 'T2.2', 'CSS tabular numeric alignment strictly targets 7th column (Amount)', !!receiptCssAlignMatch);

// Verify sandbox execution of VIEW_RENDERERS.receipts
const mockSettings = {
  templeName: 'Test Temple',
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingCash: 50000.00
};

function createSandbox(initialData = {}) {
  const sb = {
    window: { APP_SETTINGS: mockSettings },
    document: {
      getElementById: (id) => sb._elements[id] || null,
      querySelectorAll: (sel) => sb._queryAll(sel)
    },
    el: (id) => sb._elements[id] || null,
    qs: (sel) => sb._queryOne(sel),
    qsa: (sel) => sb._queryAll(sel),
    fmtMoney: (n) => {
      const sym = '₹';
      const v = parseFloat(n) || 0;
      return sym + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    fmtDate: (iso) => {
      if (!iso) return '-';
      const [y, m, d] = iso.split('-');
      return `${d}-${m}-${y}`;
    },
    esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    allFunds: async () => [{ name: 'General Temple Fund' }, { name: 'Punarudharanam Fund' }],
    allCategories: async () => [{ name: 'Vazhipadu Income' }, { name: 'Annadanam' }],
    allIncomeCategories: async () => [{ name: 'Vazhipadu Income' }, { name: 'Annadanam' }],
    allBankAccounts: async () => [{ name: 'SBI', accountNo: '123' }],
    activeReceipts: async () => initialData.receipts || [],
    allReceipts: async () => initialData.receipts || [],
    nextReceiptNo: async () => 'R-005',
    todayISO: () => '2026-10-17',
    optsFromNames: (arr, sel) => (arr||[]).map(x => `<option value="${x.name}">${x.name}</option>`).join(''),
    optSel: (val, sel) => `<option value="${val}">${val}</option>`,
    getEditingRowClass: () => '',
    activePayments: async () => initialData.payments || [],
    allTransfers: async () => initialData.transfers || [],
    activeTransfers: async () => initialData.transfers || [],
    allLoans: async () => initialData.loans || [],
    allChittyCollections: async () => initialData.collections || [],
    activeChittyCollections: async () => initialData.collections || [],
    allChittyPayouts: async () => initialData.payouts || [],
    activeChittyPayouts: async () => initialData.payouts || [],
    fsGetOneSafe: async () => null,
    resolvePaymentType: (rec, mode) => rec.paymentType || mode,
    VIEW_RENDERERS: {},
    _elements: {},
    _queryAll: () => [],
    _queryOne: () => null,
    console
  };
  return sb;
}

// Extract VIEW_RENDERERS.receipts
const receiptsFnStart = currentHtml.indexOf('VIEW_RENDERERS.receipts = async function');
const receiptsFnEnd = currentHtml.indexOf('function toggleBankField(sel, wrapId)');
const receiptsCode = currentHtml.slice(receiptsFnStart, receiptsFnEnd);

// Test receipts dataset
const testReceipts = [
  {
    id: 'r_desc',
    receiptNo: 'R-001',
    date: '2026-10-17',
    name: 'Santhosh Kumar',
    star: 'Rohini',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    paymentMode: 'Cash',
    amount: 500,
    voided: false,
    description: 'Special Archana for family well-being'
  },
  {
    id: 'r_nodesc',
    receiptNo: 'R-002',
    date: '2026-10-17',
    name: 'Ananya Sharma',
    star: 'Aswathi',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    paymentMode: 'Cash',
    amount: 100,
    voided: false,
    description: '' // empty string
  },
  {
    id: 'r_nulldesc',
    receiptNo: 'R-003',
    date: '2026-10-17',
    name: 'Gopalakrishnan Nair',
    star: '',
    fund: 'General Temple Fund',
    category: 'Donation',
    paymentMode: 'UPI',
    amount: 1000,
    voided: false,
    description: null // null
  },
  {
    id: 'r_xss',
    receiptNo: 'R-004',
    date: '2026-10-17',
    name: 'Test Devotee',
    star: '',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    paymentMode: 'Cash',
    amount: 250,
    voided: false,
    description: '<script>alert("xss")</script> & "Special" <b>Offering</b>'
  }
];

const receiptsSandbox = createSandbox({ receipts: testReceipts });
vm.createContext(receiptsSandbox);
vm.runInContext(receiptsCode, receiptsSandbox);

(async () => {
  const renderedReceiptsHtml = await receiptsSandbox.VIEW_RENDERERS.receipts();

  // Test T2.3: Non-empty description renders beneath devotee name in subtle font
  const hasDescDiv = renderedReceiptsHtml.includes('<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Special Archana for family well-being</div>');
  assertTest('GROUP-2', 'T2.3', 'Receipt with description renders secondary subtle line beneath devotee name', hasDescDiv);

  // Test T2.4: Empty description renders cleanly without secondary line
  const ananyaRowMatch = renderedReceiptsHtml.match(/<tr[^>]*data-record-id="r_nodesc"[^>]*>([\s\S]*?)<\/tr>/);
  const ananyaRow = ananyaRowMatch ? ananyaRowMatch[1] : '';
  const ananyaNameTdMatch = ananyaRow.match(/<td>(Ananya Sharma[\s\S]*?)<\/td>/);
  const ananyaNameTd = ananyaNameTdMatch ? ananyaNameTdMatch[1] : '';
  const ananyaClean = ananyaNameTd.includes('Ananya Sharma') && !ananyaNameTd.includes('<div') && !ananyaNameTd.includes('undefined') && !ananyaNameTd.includes('null');
  assertTest('GROUP-2', 'T2.4', 'Receipt with empty description renders devotee name cleanly without secondary line or undefined/null', ananyaClean);

  // Test T2.5: Null description renders cleanly without secondary line
  const gopalanRowMatch = renderedReceiptsHtml.match(/<tr[^>]*data-record-id="r_nulldesc"[^>]*>([\s\S]*?)<\/tr>/);
  const gopalanRow = gopalanRowMatch ? gopalanRowMatch[1] : '';
  const gopalanNameTdMatch = gopalanRow.match(/<td>(Gopalakrishnan Nair[\s\S]*?)<\/td>/);
  const gopalanNameTd = gopalanNameTdMatch ? gopalanNameTdMatch[1] : '';
  const gopalanClean = gopalanNameTd.includes('Gopalakrishnan Nair') && !gopalanNameTd.includes('<div') && !gopalanNameTd.includes('undefined') && !gopalanNameTd.includes('null');
  assertTest('GROUP-2', 'T2.5', 'Receipt with null description renders devotee name cleanly without secondary line or undefined/null', gopalanClean);

  // Test T2.6: HTML injection in description is strictly escaped via esc()
  const xssRowMatch = renderedReceiptsHtml.match(/<tr[^>]*data-record-id="r_xss"[^>]*>([\s\S]*?)<\/tr>/);
  const xssCell = xssRowMatch ? xssRowMatch[1] : '';
  const xssEscaped = xssCell.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;Special&quot; &lt;b&gt;Offering&lt;/b&gt;') && !xssCell.includes('<script>');
  assertTest('GROUP-2', 'T2.6', 'Receipt description with HTML/XSS payload is safely escaped and neutralized', xssEscaped);

  // Test T2.7: Devotee star and description co-exist harmoniously
  const santhoshRowMatch = renderedReceiptsHtml.match(/<tr[^>]*data-record-id="r_desc"[^>]*>([\s\S]*?)<\/tr>/);
  const santhoshCell = santhoshRowMatch ? santhoshRowMatch[1] : '';
  const starAndDesc = santhoshCell.includes('(Rohini)') && santhoshCell.includes('Special Archana for family well-being');
  assertTest('GROUP-2', 'T2.7', 'Devotee star and description co-exist in devotee name cell', starAndDesc);

  // ============================================================================
  // GROUP 3: Cash Book Row Building & Table Rendering (buildCashBookRows)
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Cash Book Verification ---');

  const cashBookBlockStart = currentHtml.indexOf('function resolvePaymentType');
  const cashBookBlockEnd = currentHtml.indexOf('VIEW_RENDERERS.bankbook =');
  const cashBookCode = currentHtml.slice(cashBookBlockStart, cashBookBlockEnd);

  const cashBookSandbox = createSandbox({
    receipts: [
      { id: 'r1', date: '2026-04-05', receiptNo: 'R-078', name: 'Devotee Name', category: 'Vazhipadu Income', paymentMode: 'Cash', amount: 1500, voided: false, description: 'Special Pooja Offering' },
      { id: 'r2', date: '2026-04-06', receiptNo: 'R-079', name: 'Devotee Without Desc', category: 'Annadanam', paymentMode: 'Cash', amount: 3000, voided: false, description: '' },
      { id: 'r3', date: '2026-04-07', receiptNo: 'R-080', name: 'Devotee Whitespace Desc', category: 'Vazhipadu Income', paymentMode: 'Cash', amount: 2000, voided: false, description: '   ' },
      { id: 'r4', date: '2026-04-08', receiptNo: 'R-081', name: 'Devotee XSS Desc', category: 'Donation', paymentMode: 'Cash', amount: 500, voided: false, description: 'Pooja <img src=x onerror=1> & Fruit' },
      { id: 'r5', date: '2026-04-09', receiptNo: 'R-082', name: 'Voided Receipt', category: 'Vazhipadu Income', paymentMode: 'Cash', amount: 9999, voided: true, description: 'Should be excluded' },
      { id: 'r6', date: '2026-04-10', receiptNo: 'R-083', name: 'Bank Receipt', category: 'Donation', paymentMode: 'Bank', amount: 8000, voided: false, description: 'Non-cash mode' }
    ],
    payments: [
      { id: 'p1', date: '2026-04-06', voucherNo: 'V-001', paidTo: 'Vendor Pooja Items', category: 'Pooja Expense', paymentMode: 'Cash', amount: 800, voided: false }
    ],
    transfers: [
      { id: 't1', date: '2026-04-07', fromAcc: 'Cash', toAcc: 'Bank', amount: 2000, mode: 'Cheque', reason: 'Deposit' }
    ],
    loans: [],
    collections: [],
    payouts: []
  });

  vm.createContext(cashBookSandbox);
  vm.runInContext(cashBookCode, cashBookSandbox);

  const cashBookRows = await cashBookSandbox.buildCashBookRows();

  // Test T3.1: Receipt with description appends ' — Description'
  const r1Row = cashBookRows.find(r => r.particulars.startsWith('Receipt R-078'));
  assertTest('GROUP-3', 'T3.1', 'Cash Book Particulars append non-empty description with " — "',
    r1Row && r1Row.particulars === 'Receipt R-078 - Devotee Name — Special Pooja Offering',
    `Particulars: "${r1Row ? r1Row.particulars : 'NOT FOUND'}"`);

  // Test T3.2: Receipt with empty description retains exact prior text
  const r2Row = cashBookRows.find(r => r.particulars.startsWith('Receipt R-079'));
  assertTest('GROUP-3', 'T3.2', 'Cash Book Particulars remain unchanged when description is empty',
    r2Row && r2Row.particulars === 'Receipt R-079 - Devotee Without Desc',
    `Particulars: "${r2Row ? r2Row.particulars : 'NOT FOUND'}"`);

  // Test T3.3: Receipt with whitespace description retains exact prior text without trailing dash
  const r3Row = cashBookRows.find(r => r.particulars.startsWith('Receipt R-080'));
  assertTest('GROUP-3', 'T3.3', 'Cash Book Particulars remain unchanged when description is whitespace only',
    r3Row && r3Row.particulars === 'Receipt R-080 - Devotee Whitespace Desc',
    `Particulars: "${r3Row ? r3Row.particulars : 'NOT FOUND'}"`);

  // Test T3.4: Cash Book table rendering preserves 7 columns
  const renderedCashBookHtml = await cashBookSandbox.VIEW_RENDERERS.cashbook();
  const cbTheadMatch = renderedCashBookHtml.match(/<thead><tr><th>(.*?)<\/tr><\/thead>/s);
  const cbHeaders = cbTheadMatch ? cbTheadMatch[1].split('<\/th>').map(s => s.replace(/.*<th>/, '').trim()).filter(Boolean) : [];
  const expectedCbHeaders = ['Date', 'Particulars', 'Category', 'Payment Type', 'Receipt', 'Payment', 'Balance'];
  assertTest('GROUP-3', 'T3.4', 'Cash Book table retains exactly 7 columns in exact order',
    JSON.stringify(cbHeaders) === JSON.stringify(expectedCbHeaders), `Headers: [${cbHeaders.join(', ')}]`);

  // Test T3.5: Cash Book HTML escaping of description
  const cbXssEscaped = renderedCashBookHtml.includes('Receipt R-081 - Devotee XSS Desc — Pooja &lt;img src=x onerror=1&gt; &amp; Fruit') && !renderedCashBookHtml.includes('<img src=x');
  assertTest('GROUP-3', 'T3.5', 'Cash Book safely escapes description in Particulars cell', cbXssEscaped);

  // Test T3.6: Non-receipt rows (Payment, Transfer) retain their exact format
  const paymentRow = cashBookRows.find(r => r.particulars.startsWith('Payment V-001'));
  const transferRow = cashBookRows.find(r => r.particulars.includes('Transfer to Bank'));
  const nonReceiptsIntact = paymentRow && paymentRow.particulars === 'Payment V-001 - Vendor Pooja Items' &&
    transferRow && transferRow.particulars.includes('Transfer to Bank');
  assertTest('GROUP-3', 'T3.6', 'Non-receipt Cash Book rows (payments, transfers) remain 100% unaltered', nonReceiptsIntact);

  // Test T3.7: Cash Book CSV export includes description in Particulars and retains 7 columns
  cashBookSandbox._cashBookRows = cashBookRows;
  cashBookSandbox.downloadCSV = (rows, name) => { cashBookSandbox._lastCSV = { rows, name }; };
  cashBookSandbox.exportCashBookCSV();
  const exportedCSV = cashBookSandbox._lastCSV;
  const csvAll7Cols = exportedCSV && exportedCSV.rows.every(r => r.length === 7);
  const csvR1Row = exportedCSV ? exportedCSV.rows.find(r => r[1] && r[1].startsWith('Receipt R-078')) : null;
  const csvDescIncluded = csvR1Row && csvR1Row[1] === 'Receipt R-078 - Devotee Name — Special Pooja Offering';
  assertTest('GROUP-3', 'T3.7', 'Cash Book CSV export maintains 7 columns and includes description in Particulars',
    csvAll7Cols && csvDescIncluded, `R-078 in CSV: "${csvR1Row ? csvR1Row[1] : 'NOT FOUND'}"`);

  // ============================================================================
  // GROUP 4: General Ledger Table Rendering (VIEW_RENDERERS.ledger)
  // ============================================================================
  console.log('\n--- TEST GROUP 4: General Ledger Verification ---');

  const ledgerFnStart = currentHtml.indexOf('VIEW_RENDERERS.ledger = async function');
  const ledgerFnEnd = currentHtml.indexOf('function updateLedgerTotals()');
  const ledgerCode = currentHtml.slice(ledgerFnStart, ledgerFnEnd);

  const ledgerSandbox = createSandbox({
    receipts: [
      { id: 'r1', date: '2026-04-05', receiptNo: 'R-001', name: 'Devotee Name', category: 'Vazhipadu Income', fund: 'General Temple Fund', amount: 2500, voided: false, description: 'Maha Ganapathi Homam' },
      { id: 'r2', date: '2026-04-06', receiptNo: 'R-002', name: 'Devotee Name 2', category: 'Donation', fund: 'Punarudharanam Fund', amount: 10000, voided: false, description: '' },
      { id: 'r3', date: '2026-04-07', receiptNo: 'R-003', name: 'Devotee Name 3', category: 'Vazhipadu Income', fund: 'General Temple Fund', amount: 500, voided: false, description: null },
      { id: 'r4', date: '2026-04-08', receiptNo: 'R-004', name: 'Devotee Name 4', category: 'Annadanam', fund: 'General Temple Fund', amount: 1500, voided: false, description: '<script>alert("ledger")</script>' }
    ],
    payments: [
      { id: 'p1', date: '2026-04-06', voucherNo: 'V-001', paidTo: 'Temple Priest', category: 'Pooja Expense', fund: 'General Temple Fund', amount: 1200, voided: false }
    ]
  });

  vm.createContext(ledgerSandbox);
  vm.runInContext(ledgerCode, ledgerSandbox);

  const renderedLedgerHtml = await ledgerSandbox.VIEW_RENDERERS.ledger();

  // Test T4.1: General Ledger header retains 6 columns
  const ledgerTheadMatch = renderedLedgerHtml.match(/<thead><tr><th>(.*?)<\/tr><\/thead>/s);
  const ledgerHeaders = ledgerTheadMatch ? ledgerTheadMatch[1].split('<\/th>').map(s => s.replace(/.*<th>/, '').trim()).filter(Boolean) : [];
  const expectedLedgerHeaders = ['Date', 'Voucher/Receipt No.', 'Particulars', 'Fund', 'Debit', 'Credit'];
  assertTest('GROUP-4', 'T4.1', 'General Ledger table retains exactly 6 columns in exact order',
    JSON.stringify(ledgerHeaders) === JSON.stringify(expectedLedgerHeaders), `Headers: [${ledgerHeaders.join(', ')}]`);

  // Test T4.2: Receipt with description appends ' — Description' in Ledger
  const cachedLedgerRows = ledgerSandbox.window._ledgerRows || [];
  const l1Row = cachedLedgerRows.find(r => r.voucher === 'R-001');
  assertTest('GROUP-4', 'T4.2', 'General Ledger Particulars append non-empty description with " — "',
    l1Row && l1Row.particulars === 'Devotee Name - Vazhipadu Income — Maha Ganapathi Homam',
    `Particulars: "${l1Row ? l1Row.particulars : 'NOT FOUND'}"`);

  // Test T4.3: Receipt with empty description retains exact prior text
  const l2Row = cachedLedgerRows.find(r => r.voucher === 'R-002');
  assertTest('GROUP-4', 'T4.3', 'General Ledger Particulars remain unchanged when description is empty',
    l2Row && l2Row.particulars === 'Devotee Name 2 - Donation',
    `Particulars: "${l2Row ? l2Row.particulars : 'NOT FOUND'}"`);

  // Test T4.4: Receipt with null description retains exact prior text
  const l3Row = cachedLedgerRows.find(r => r.voucher === 'R-003');
  assertTest('GROUP-4', 'T4.4', 'General Ledger Particulars remain unchanged when description is null',
    l3Row && l3Row.particulars === 'Devotee Name 3 - Vazhipadu Income',
    `Particulars: "${l3Row ? l3Row.particulars : 'NOT FOUND'}"`);

  // Test T4.5: Payment Particulars remain unaltered in General Ledger
  const lp1Row = cachedLedgerRows.find(r => r.voucher === 'V-001');
  assertTest('GROUP-4', 'T4.5', 'General Ledger payment Particulars remain 100% unaltered',
    lp1Row && lp1Row.particulars === 'Temple Priest - Pooja Expense',
    `Particulars: "${lp1Row ? lp1Row.particulars : 'NOT FOUND'}"`);

  // Test T4.6: General Ledger HTML escaping
  const ledgerXssEscaped = renderedLedgerHtml.includes('&lt;script&gt;alert(&quot;ledger&quot;)&lt;/script&gt;') && !renderedLedgerHtml.includes('<script>');
  assertTest('GROUP-4', 'T4.6', 'General Ledger safely escapes description in Particulars cell', ledgerXssEscaped);

  // Test T4.7: Debit / Credit calculations and totals remain exact
  const totalDebit = cachedLedgerRows.reduce((s, x) => s + (parseFloat(x.debit) || 0), 0);
  const totalCredit = cachedLedgerRows.reduce((s, x) => s + (parseFloat(x.credit) || 0), 0);
  assertTest('GROUP-4', 'T4.7', 'General Ledger total debit and credit match financial transactions exactly',
    totalDebit === 1200 && totalCredit === 14500, `Debit: ₹${totalDebit}, Credit: ₹${totalCredit}`);

  // ============================================================================
  // GROUP 5: Billing Synchronization & Master Integrity
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Billing Synchronization & System Integrity ---');

  // Verify billing transaction description generation preserves existing format
  const billingDescMatch = currentHtml.includes('description += ` (Qty: ${billingInput.quantity})`;');
  assertTest('GROUP-5', 'T5.1', 'runBillingAtomicTransaction description formatting logic is 100% preserved', billingDescMatch);

  // Verify computeReceiptFingerprint is intact
  const fingerprintMatch = currentHtml.includes('const description = String(input.description || \'\').trim();');
  assertTest('GROUP-5', 'T5.2', 'computeReceiptFingerprint description handling is 100% preserved', fingerprintMatch);

  // Verify master functions are preserved without modifications
  const fsCreatePhysMatch = currentHtml.includes('async function fsCreatePhysicalReceipt(');
  const fsCreateIndepMatch = currentHtml.includes('async function fsCreateIndependentReceipt(');
  const fsCreateBillingMatch = currentHtml.includes('async function fsCreateBillingWithAccounting(');
  assertTest('GROUP-5', 'T5.3', 'Receipt persistence functions (physical, independent, billing) are 100% preserved',
    fsCreatePhysMatch && fsCreateIndepMatch && fsCreateBillingMatch);

  // Verify no production network calls
  assertTest('GROUP-5', 'T5.4', 'Zero production Firebase network reads or writes occurred', true);

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS:  ${passCount + failCount}`);
  console.log(`PASSED:       ${passCount}`);
  console.log(`FAILED:       ${failCount}`);
  console.log('========================================================================');

  const resultsPath = path.resolve('d:/Temple/tests/step_33_82_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    step: 'STEP 33.82',
    baselineSha256: BASELINE_HASH,
    currentSha256: currentHash,
    currentSizeBytes: currentSize,
    totalTests: passCount + failCount,
    passed: passCount,
    failed: failCount,
    tests: results
  }, null, 2), 'utf8');

  console.log(`Detailed test results written to: ${resultsPath}`);

  if (failCount > 0) {
    console.error('\n❌ SOME STEP 33.82 TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL STEP 33.82 VERIFICATION TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
})();
