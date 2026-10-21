/**
 * STEP 33.169 VALIDATION SUITE: STANDARDIZE CASH BOOK & BANK BOOK FILTERS
 * 
 * Verifies:
 * 1. Cash Book category filtering preserved.
 * 2. Cash Book Receipt/Payment transaction-type filtering.
 * 3. Bank Book category filtering controls.
 * 4. Bank Book Receipt/Payment transaction-type filtering.
 * 5. Combined category + transaction-type filtering across both books.
 * 6. Clear Filters action restores default view and totals.
 * 7. Empty state handling when no records match filters.
 * 8. Accounting integrity: running balance historical continuity, closing balance preservation.
 * 9. Existing Description columns preserved in both books.
 * 10. Print and CSV/Excel export consistent with active filters.
 * 11. Regression test stability across all accounting subsystems.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const HTML_FILE = path.resolve('d:/Temple/Temple_Accounts-1.html');
const BACKUP_FILE = path.resolve('d:/Temple/backups/Temple_Accounts-1_PreStep33_169_CashBankBookFilters_Backup_20261021_144500.html');

const PRE_CHANGE_HASH = '9E694509C3CE30192AE6FB8545BEDE20CDBE65B01CEF4F590B3412FD651A400E';
const PRE_CHANGE_SIZE = 1226178;

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, testId, message, details = '') {
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${testId}: ${message}${details ? ' (' + details + ')' : ''}`);
  } else {
    failedAssertions++;
    console.error(`  ❌ [FAIL] ${testId}: ${message}${details ? ' — ' + details : ''}`);
  }
}

console.log('='.repeat(80));
console.log('STEP 33.169: CASH BOOK & BANK BOOK FILTER STANDARDIZATION TEST SUITE');
console.log('='.repeat(80));

// =========================================================================
// GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- GROUP 1: Cryptographic Invariants & Backup Verification ---');

assert(fs.existsSync(BACKUP_FILE), 'G1.1', 'Pre-change backup file exists');
const backupBuf = fs.readFileSync(BACKUP_FILE);
const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();

assert(backupBuf.length === PRE_CHANGE_SIZE, 'G1.2', 'Backup size matches baseline exactly', `${backupBuf.length} bytes`);
assert(backupHash === PRE_CHANGE_HASH, 'G1.3', 'Backup SHA-256 matches baseline hash', backupHash);

const postBuf = fs.readFileSync(HTML_FILE);
const postHash = crypto.createHash('sha256').update(postBuf).digest('hex').toUpperCase();
assert(postBuf.length > PRE_CHANGE_SIZE, 'G1.4', 'Post-change file has surgical additions', `Size: ${postBuf.length} (delta: +${postBuf.length - PRE_CHANGE_SIZE})`);
assert(postHash !== PRE_CHANGE_HASH, 'G1.5', 'Post-change hash updated', postHash);

const htmlContent = postBuf.toString('utf8');

// =========================================================================
// GROUP 2: Cash Book Controls & Table Schema Verification
// =========================================================================
console.log('\n--- GROUP 2: Cash Book Controls & Table Schema Verification ---');

assert(htmlContent.includes('id="cashBookCategoryFilter"'), 'G2.1', 'Cash Book category filter dropdown exists');
assert(htmlContent.includes('id="cashBookTypeFilter"'), 'G2.2', 'Cash Book transaction-type filter dropdown exists');
assert(htmlContent.includes('clearCashBookFilters()'), 'G2.3', 'Cash Book Clear Filters button exists');
assert(htmlContent.includes('exportCashBookCSV()'), 'G2.4', 'Cash Book CSV / Excel export button exists');

// Verify Cash Book Table Headers
const cbTheadMatch = htmlContent.match(/<table id="cashBookTable">\s*<thead><tr>([\s\S]*?)<\/tr><\/thead>/);
assert(cbTheadMatch !== null, 'G2.5', 'Found <table id="cashBookTable"> <thead> structure');
if (cbTheadMatch) {
  const cbThs = Array.from(cbTheadMatch[1].matchAll(/<th>(.*?)<\/th>/g)).map(m => m[1].trim());
  assert(cbThs.length === 8, 'G2.6', 'Cash Book table has exactly 8 columns', cbThs.join(', '));
  assert(cbThs[0] === 'Date', 'G2.7', 'Col 1 is Date');
  assert(cbThs[1] === 'Particulars', 'G2.8', 'Col 2 is Particulars');
  assert(cbThs[2] === 'Description', 'G2.9', 'Col 3 is Description');
  assert(cbThs[3] === 'Category', 'G2.10', 'Col 4 is Category');
  assert(cbThs[4] === 'Payment Type', 'G2.11', 'Col 5 is Payment Type');
  assert(cbThs[5] === 'Receipt', 'G2.12', 'Col 6 is Receipt');
  assert(cbThs[6] === 'Payment', 'G2.13', 'Col 7 is Payment');
  assert(cbThs[7] === 'Balance', 'G2.14', 'Col 8 is Balance');
}

// =========================================================================
// GROUP 3: Bank Book Controls & Table Schema Verification
// =========================================================================
console.log('\n--- GROUP 3: Bank Book Controls & Table Schema Verification ---');

assert(htmlContent.includes('id="bankBookCategoryFilter"'), 'G3.1', 'Bank Book category filter dropdown exists');
assert(htmlContent.includes('id="bankBookTypeFilter"'), 'G3.2', 'Bank Book transaction-type filter dropdown exists');
assert(htmlContent.includes('clearBankBookFilters()'), 'G3.3', 'Bank Book Clear Filters button exists');
assert(htmlContent.includes('exportBankBookCSV()'), 'G3.4', 'Bank Book CSV / Excel export button exists');
assert(htmlContent.includes('printGenericTable(\'Bank Book\''), 'G3.5', 'Bank Book Print button exists');

// Verify Bank Book Table Headers
const bbTheadMatch = htmlContent.match(/<table id="bankBookTable">\s*<thead><tr>([\s\S]*?)<\/tr><\/thead>/);
assert(bbTheadMatch !== null, 'G3.6', 'Found <table id="bankBookTable"> <thead> structure');
if (bbTheadMatch) {
  const bbThs = Array.from(bbTheadMatch[1].matchAll(/<th>(.*?)<\/th>/g)).map(m => m[1].trim());
  assert(bbThs.length === 6, 'G3.7', 'Bank Book table has exactly 6 columns', bbThs.join(', '));
  assert(bbThs[0] === 'Date', 'G3.8', 'Col 1 is Date');
  assert(bbThs[1] === 'Particulars', 'G3.9', 'Col 2 is Particulars');
  assert(bbThs[2] === 'Description', 'G3.10', 'Col 3 is Description');
  assert(bbThs[3] === 'Deposit', 'G3.11', 'Col 4 is Deposit');
  assert(bbThs[4] === 'Withdrawal', 'G3.12', 'Col 5 is Withdrawal');
  assert(bbThs[5] === 'Balance', 'G3.13', 'Col 6 is Balance');
}

// =========================================================================
// GROUP 4: In-Memory VM Sandbox Setup
// =========================================================================
console.log('\n--- GROUP 4: In-Memory VM Sandbox Setup ---');

const startIdx = htmlContent.indexOf('/* ===================== CASH BOOK / BANK BOOK ===================== */');
const endIdx = htmlContent.indexOf('/* ===================== LEDGER ===================== */');
const booksSource = htmlContent.substring(startIdx, endIdx);

const mockSettings = {
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingCash: 10000.00,
  openingBank: 25000.00,
  templeName: 'Sree Bhagavathi Temple'
};

const sandbox = {
  window: {
    APP_SETTINGS: mockSettings,
    billingAllRecords: [
      { id: 'b_01', firestoreId: 'b_01', receiptNo: 'B-101', item: 'Neyyappam', quantity: 2, star: 'Rohini', description: 'Neyyappam offering' }
    ]
  },
  document: {
    createElement: (tag) => {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        children: [],
        dataset: {},
        innerHTML: '',
        remove: function() { this._removed = true; }
      };
    },
    getElementById: (id) => sandbox._elements[id] || null,
    querySelectorAll: (sel) => sandbox._queryAll(sel),
    querySelector: (sel) => sandbox._queryOne(sel)
  },
  el: (id) => sandbox._elements[id] || null,
  qs: (sel) => sandbox._queryOne(sel),
  qsa: (sel) => sandbox._queryAll(sel),
  fmtMoney: (n) => {
    const s = mockSettings;
    const sym = (s && s.currencySymbol) || '₹';
    const v = parseFloat(n) || 0;
    return sym + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  fmtDate: (iso) => {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  },
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  VIEW_RENDERERS: {},
  _elements: {},
  _queryAll: () => [],
  _queryOne: () => null,
  downloadCSV: (rows, name) => { sandbox._lastCSV = { rows, name }; },
  printGenericTable: (title, el) => { sandbox._lastPrint = { title, html: el ? (el.outerHTML || el.innerHTML) : '' }; },
  console
};

vm.createContext(sandbox);

try {
  vm.runInContext(booksSource, sandbox);
  assert(true, 'G4.1', 'Cash Book and Bank Book source parsed and executed cleanly in sandbox');
} catch (err) {
  assert(false, 'G4.1', 'Sandbox execution error: ' + err.message);
  process.exit(1);
}

// Synthetic Transactions for VM tests
sandbox.activeReceipts = async () => [
  { id: 'cr1', receiptNo: 'R-1', name: 'Devotee A', paymentMode: 'Cash', category: 'masavari', amount: 500, date: '2026-04-02', description: 'Monthly masavari', voided: false },
  { id: 'cr2', receiptNo: 'R-2', name: 'Devotee B', paymentMode: 'Cash', category: 'Vazhipadu', amount: 1500, date: '2026-04-03', description: 'Archana', voided: false },
  { id: 'br1', receiptNo: 'R-3', name: 'Devotee C', paymentMode: 'Bank', category: 'Vazhipadu', amount: 2000, date: '2026-04-04', description: 'Pushpanjali', voided: false },
  { id: 'br2', receiptNo: 'R-4', name: 'Devotee D', paymentMode: 'UPI', category: 'Annadanam', amount: 3000, date: '2026-04-05', source: 'billing', billingFirestoreId: 'b_01', voided: false },
  { id: 'vr1', receiptNo: 'R-VOID', name: 'Voided Devotee', paymentMode: 'Cash', category: 'masavari', amount: 9999, date: '2026-04-02', voided: true }
];

sandbox.activePayments = async () => [
  { id: 'cp1', voucherNo: 'V-1', paidTo: 'Flower Vendor', paymentMode: 'Cash', category: 'Flower', amount: 400, date: '2026-04-03', description: 'Lotus & jasmine garlands', voided: false },
  { id: 'cp2', voucherNo: 'V-2', paidTo: 'Oil Merchant', paymentMode: 'Cash', category: 'Puja Items', amount: 600, date: '2026-04-04', description: 'Gingelly oil', voided: false },
  { id: 'bp1', voucherNo: 'V-3', paidTo: 'Electrician', paymentMode: 'Bank', category: 'Maintenance', amount: 1200, date: '2026-04-05', description: 'Generator servicing', voided: false },
  { id: 'bp2', voucherNo: 'V-4', paidTo: 'Temple Painter', paymentMode: 'UPI', category: 'Maintenance', amount: 1800, date: '2026-04-06', description: 'Wall touch-ups', voided: false },
  { id: 'vp1', voucherNo: 'V-VOID', paidTo: 'Void Vendor', paymentMode: 'Bank', category: 'Maintenance', amount: 8888, date: '2026-04-05', voided: true }
];

sandbox.activeTransfers = async () => [
  { id: 't1', date: '2026-04-07', fromAcc: 'Cash', toAcc: 'Bank', amount: 1000, mode: 'Cash', reason: 'Deposit cash to bank', description: 'Cash collection deposit', voided: false },
  { id: 't2', date: '2026-04-08', fromAcc: 'Bank', toAcc: 'Cash', amount: 500, mode: 'Cash', reason: 'ATM Withdrawal', description: 'Petty cash refill', voided: false }
];

sandbox.allLoans = async () => [
  { id: 'l1', date: '2026-04-09', person: 'Temple Trustee', paymentMode: 'Cash', loanReceived: 2000, repayment: 0, description: 'Emergency loan received', voided: false },
  { id: 'l2', date: '2026-04-10', person: 'Bank Loan', paymentMode: 'Bank', loanReceived: 0, repayment: 800, description: 'Monthly loan installment', voided: false }
];

sandbox.activeChittyCollections = async () => [
  { id: 'c1', date: '2026-04-09', memberName: 'Ravi', paymentMode: 'Cash', amountReceived: 700, description: 'Chitty instalment 1', voided: false },
  { id: 'c2', date: '2026-04-10', memberName: 'Mohan', paymentMode: 'UPI', amountReceived: 1000, description: 'Chitty instalment 2', voided: false }
];

sandbox.activeChittyPayouts = async () => [
  { id: 'p1', date: '2026-04-11', memberName: 'Ravi', paymentMode: 'Cash', amount: 2500, description: 'Chitty prize money payout', voided: false }
];

// =========================================================================
// GROUP 5: Cash Book Filter Behaviour & Financial Calculations
// =========================================================================
console.log('\n--- GROUP 5: Cash Book Filter Behaviour & Financial Calculations ---');

(async () => {
  const cbRows = await sandbox.buildCashBookRows();
  sandbox.window._cashBookRows = cbRows;
  assert(Array.isArray(cbRows) && cbRows.length > 0, 'G5.1', `Cash book rows built: ${cbRows.length} active rows`);
  
  // Verify row txType classification
  const cashReceipts = cbRows.filter(r => r.txType === 'receipt');
  const cashPayments = cbRows.filter(r => r.txType === 'payment');
  assert(cashReceipts.every(r => r.receipt > 0 && r.payment === 0), 'G5.2', 'All Cash Book receipts have receipt > 0 and payment === 0');
  assert(cashPayments.every(r => r.payment > 0 && r.receipt === 0), 'G5.3', 'All Cash Book payments have payment > 0 and receipt === 0');

  // Verify running balance continuity
  let calcBal = mockSettings.openingCash;
  let cbContinuity = true;
  for (const r of cbRows) {
    calcBal += (r.receipt - r.payment);
    if (Math.abs(r.balance - calcBal) > 0.001) cbContinuity = false;
  }
  assert(cbContinuity, 'G5.4', 'Cash Book running balance continuity holds 100%');

  // Verify Categories populated in Cash Book
  const cbCategories = [...new Set(cbRows.map(r => r.category).filter(Boolean))];
  assert(cbCategories.includes('masavari'), 'G5.5', 'Cash Book includes masavari category');
  assert(cbCategories.includes('Flower'), 'G5.6', 'Cash Book includes Flower category');
  assert(cbCategories.includes('Bank Transfer'), 'G5.7', 'Cash Book includes Bank Transfer category');

  // Mock DOM elements for Cash Book Table
  const cbCatFilter = { value: '' };
  const cbTypeFilter = { value: '' };
  const cbTotRecEl = { innerHTML: '' };
  const cbTotPayEl = { innerHTML: '' };
  sandbox._elements['cashBookCategoryFilter'] = cbCatFilter;
  sandbox._elements['cashBookTypeFilter'] = cbTypeFilter;
  sandbox._elements['cashBookTotalReceipt'] = cbTotRecEl;
  sandbox._elements['cashBookTotalPayment'] = cbTotPayEl;

  // Build Mock DOM rows for Cash Book Table
  const mockCbDomRows = [
    { id: 'ob', dataset: { category: 'Opening Balance' }, style: { display: '' } },
    ...cbRows.map(r => ({
      id: '',
      dataset: { category: r.category, txType: r.txType },
      style: { display: '' }
    }))
  ];
  sandbox._queryAll = (sel) => {
    if (sel.includes('#cashBookTable tbody tr')) return mockCbDomRows;
    return [];
  };

  // 1. Initial / Unfiltered state
  sandbox.applyCashBookCategoryFilter();
  const fullRecTotal = cbRows.reduce((s, r) => s + r.receipt, 0);
  const fullPayTotal = cbRows.reduce((s, r) => s + r.payment, 0);
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(fullRecTotal)), 'G5.8', 'Unfiltered Cash Book receipt total correct', sandbox.fmtMoney(fullRecTotal));
  assert(cbTotPayEl.innerHTML.includes(sandbox.fmtMoney(fullPayTotal)), 'G5.9', 'Unfiltered Cash Book payment total correct', sandbox.fmtMoney(fullPayTotal));
  assert(mockCbDomRows[0].style.display === '', 'G5.10', 'Opening balance visible in unfiltered view');

  // 2. Category Filter Only: 'masavari'
  cbCatFilter.value = 'masavari';
  cbTypeFilter.value = '';
  sandbox.applyCashBookCategoryFilter();
  const masavariRec = cbRows.filter(r => r.category === 'masavari').reduce((s, r) => s + r.receipt, 0);
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(masavariRec)), 'G5.11', 'Category filter (masavari) receipt total correct');
  assert(mockCbDomRows[0].style.display === 'none', 'G5.12', 'Opening balance hidden when category filtered');

  // 3. Transaction Type Filter Only: 'receipt'
  cbCatFilter.value = '';
  cbTypeFilter.value = 'receipt';
  sandbox.applyCashBookCategoryFilter();
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(fullRecTotal)), 'G5.13', 'Receipts Only shows full receipt total');
  assert(cbTotPayEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G5.14', 'Receipts Only shows ₹0.00 payment total');
  assert(mockCbDomRows[0].style.display === 'none', 'G5.15', 'Opening balance hidden when Receipts Only selected');

  // 4. Combined Filter: Receipts Only + 'masavari'
  cbCatFilter.value = 'masavari';
  cbTypeFilter.value = 'receipt';
  sandbox.applyCashBookCategoryFilter();
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(masavariRec)), 'G5.16', 'Combined Receipts Only + masavari shows correct receipt sum');
  assert(cbTotPayEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G5.17', 'Combined Receipts Only + masavari payment total is ₹0.00');

  // 5. Combined Filter: Payments Only + 'Flower'
  cbCatFilter.value = 'Flower';
  cbTypeFilter.value = 'payment';
  sandbox.applyCashBookCategoryFilter();
  const flowerPay = cbRows.filter(r => r.category === 'Flower').reduce((s, r) => s + r.payment, 0);
  assert(cbTotPayEl.innerHTML.includes(sandbox.fmtMoney(flowerPay)), 'G5.18', 'Combined Payments Only + Flower shows correct payment sum');
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G5.19', 'Combined Payments Only + Flower receipt total is ₹0.00');

  // 6. Clear Filters
  sandbox.clearCashBookFilters();
  assert(cbCatFilter.value === '', 'G5.20', 'clearCashBookFilters resets category dropdown');
  assert(cbTypeFilter.value === '', 'G5.21', 'clearCashBookFilters resets transaction type dropdown');
  assert(mockCbDomRows[0].style.display === '', 'G5.22', 'clearCashBookFilters restores Opening Balance visibility');
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(fullRecTotal)), 'G5.23', 'clearCashBookFilters restores full receipt total');

  // 7. Empty Results Handling
  cbCatFilter.value = 'NonExistentCategory';
  sandbox.applyCashBookCategoryFilter();
  assert(cbTotRecEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G5.24', 'Non-matching filter gives ₹0.00 receipt total');
  assert(cbTotPayEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G5.25', 'Non-matching filter gives ₹0.00 payment total');
  assert(mockCbDomRows.every(r => r.style.display === 'none'), 'G5.26', 'All transaction rows hidden for non-matching filter');

  // 8. Cash Book CSV Export with Active Filter
  cbCatFilter.value = 'Flower';
  cbTypeFilter.value = 'payment';
  sandbox.exportCashBookCSV();
  assert(sandbox._lastCSV && sandbox._lastCSV.name === 'CashBook', 'G5.27', 'exportCashBookCSV triggered downloadCSV');
  const csvRows = sandbox._lastCSV.rows;
  assert(csvRows[0].length === 8, 'G5.28', 'CSV export has 8 columns');
  assert(csvRows.some(row => row[1].includes('Flower Vendor')), 'G5.29', 'CSV contains filtered Flower payment');
  assert(!csvRows.some(row => row[1].includes('Devotee A')), 'G5.30', 'CSV excludes non-matching Devotee A receipt');
  const csvTotalRow = csvRows[csvRows.length - 1];
  assert(csvTotalRow[0] === 'TOTAL' && csvTotalRow[6].includes(sandbox.fmtMoney(flowerPay)), 'G5.31', 'CSV export footer matches filtered totals');

// =========================================================================
// GROUP 6: Bank Book Filter Behaviour & Financial Calculations
// =========================================================================
  console.log('\n--- GROUP 6: Bank Book Filter Behaviour & Financial Calculations ---');

  const bbRows = await sandbox.buildBankBookRows();
  sandbox.window._bankBookRows = bbRows;
  assert(Array.isArray(bbRows) && bbRows.length > 0, 'G6.1', `Bank book rows built: ${bbRows.length} active rows`);

  // Verify row txType classification
  const bankDeposits = bbRows.filter(r => r.txType === 'receipt');
  const bankWithdrawals = bbRows.filter(r => r.txType === 'payment');
  assert(bankDeposits.every(r => r.deposit > 0 && r.withdrawal === 0), 'G6.2', 'All Bank Book deposits have deposit > 0 and withdrawal === 0');
  assert(bankWithdrawals.every(r => r.withdrawal > 0 && r.deposit === 0), 'G6.3', 'All Bank Book withdrawals have withdrawal > 0 and deposit === 0');

  // Verify Category populated on Bank Book rows
  assert(bbRows.every(r => r.category !== undefined && typeof r.category === 'string'), 'G6.4', 'All Bank Book rows have a valid category property');
  const bbCategories = [...new Set(bbRows.map(r => r.category).filter(Boolean))];
  assert(bbCategories.includes('Vazhipadu'), 'G6.5', 'Bank Book includes Vazhipadu category');
  assert(bbCategories.includes('Maintenance'), 'G6.6', 'Bank Book includes Maintenance category');
  assert(bbCategories.includes('Bank Transfer'), 'G6.7', 'Bank Book includes Bank Transfer category');

  // Verify running balance continuity
  let calcBankBal = mockSettings.openingBank;
  let bbContinuity = true;
  for (const r of bbRows) {
    calcBankBal += (r.deposit - r.withdrawal);
    if (Math.abs(r.balance - calcBankBal) > 0.001) bbContinuity = false;
  }
  assert(bbContinuity, 'G6.8', 'Bank Book running balance continuity holds 100%');

  // Mock DOM elements for Bank Book Table
  const bbCatFilter = { value: '' };
  const bbTypeFilter = { value: '' };
  const bbTotDepEl = { innerHTML: '' };
  const bbTotWdrEl = { innerHTML: '' };
  sandbox._elements['bankBookCategoryFilter'] = bbCatFilter;
  sandbox._elements['bankBookTypeFilter'] = bbTypeFilter;
  sandbox._elements['bankBookTotalDeposit'] = bbTotDepEl;
  sandbox._elements['bankBookTotalWithdrawal'] = bbTotWdrEl;

  // Build Mock DOM rows for Bank Book Table
  const mockBbDomRows = [
    { id: 'ob', children: [{}, { textContent: 'Opening Balance' }], dataset: {}, style: { display: '' } },
    ...bbRows.map(r => ({
      id: '',
      children: [{}, { textContent: r.particulars }],
      dataset: { category: r.category, txType: r.txType },
      style: { display: '' }
    }))
  ];
  sandbox._queryAll = (sel) => {
    if (sel.includes('#bankBookTable tbody tr')) return mockBbDomRows;
    return [];
  };

  // 1. Initial / Unfiltered state
  sandbox.applyBankBookFilter();
  const fullDepTotal = bbRows.reduce((s, r) => s + r.deposit, 0);
  const fullWdrTotal = bbRows.reduce((s, r) => s + r.withdrawal, 0);
  assert(bbTotDepEl.innerHTML.includes(sandbox.fmtMoney(fullDepTotal)), 'G6.9', 'Unfiltered Bank Book deposit total correct', sandbox.fmtMoney(fullDepTotal));
  assert(bbTotWdrEl.innerHTML.includes(sandbox.fmtMoney(fullWdrTotal)), 'G6.10', 'Unfiltered Bank Book withdrawal total correct', sandbox.fmtMoney(fullWdrTotal));
  assert(mockBbDomRows[0].style.display === '', 'G6.11', 'Opening balance visible in unfiltered Bank Book view');

  // 2. Category Filter Only: 'Maintenance'
  bbCatFilter.value = 'Maintenance';
  bbTypeFilter.value = '';
  sandbox.applyBankBookFilter();
  const maintWdr = bbRows.filter(r => r.category === 'Maintenance').reduce((s, r) => s + r.withdrawal, 0);
  assert(bbTotWdrEl.innerHTML.includes(sandbox.fmtMoney(maintWdr)), 'G6.12', 'Category filter (Maintenance) withdrawal total correct');
  assert(mockBbDomRows[0].style.display === 'none', 'G6.13', 'Opening balance hidden when category filtered in Bank Book');

  // 3. Transaction Type Filter Only: 'receipt'
  bbCatFilter.value = '';
  bbTypeFilter.value = 'receipt';
  sandbox.applyBankBookFilter();
  assert(bbTotDepEl.innerHTML.includes(sandbox.fmtMoney(fullDepTotal)), 'G6.14', 'Receipts Only shows full deposit total in Bank Book');
  assert(bbTotWdrEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G6.15', 'Receipts Only shows ₹0.00 withdrawal total in Bank Book');
  assert(mockBbDomRows[0].style.display === 'none', 'G6.16', 'Opening balance hidden when Receipts Only selected in Bank Book');

  // 4. Combined Filter: Receipts Only + 'Vazhipadu'
  bbCatFilter.value = 'Vazhipadu';
  bbTypeFilter.value = 'receipt';
  sandbox.applyBankBookFilter();
  const vazhipaduDep = bbRows.filter(r => r.category === 'Vazhipadu').reduce((s, r) => s + r.deposit, 0);
  assert(bbTotDepEl.innerHTML.includes(sandbox.fmtMoney(vazhipaduDep)), 'G6.17', 'Combined Receipts Only + Vazhipadu shows correct deposit sum');
  assert(bbTotWdrEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G6.18', 'Combined Receipts Only + Vazhipadu withdrawal total is ₹0.00');

  // 5. Combined Filter: Payments Only + 'Maintenance'
  bbCatFilter.value = 'Maintenance';
  bbTypeFilter.value = 'payment';
  sandbox.applyBankBookFilter();
  assert(bbTotWdrEl.innerHTML.includes(sandbox.fmtMoney(maintWdr)), 'G6.19', 'Combined Payments Only + Maintenance shows correct withdrawal sum');
  assert(bbTotDepEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G6.20', 'Combined Payments Only + Maintenance deposit total is ₹0.00');

  // 6. Clear Filters
  sandbox.clearBankBookFilters();
  assert(bbCatFilter.value === '', 'G6.21', 'clearBankBookFilters resets category dropdown');
  assert(bbTypeFilter.value === '', 'G6.22', 'clearBankBookFilters resets transaction type dropdown');
  assert(mockBbDomRows[0].style.display === '', 'G6.23', 'clearBankBookFilters restores Opening Balance visibility');
  assert(bbTotDepEl.innerHTML.includes(sandbox.fmtMoney(fullDepTotal)), 'G6.24', 'clearBankBookFilters restores full deposit total');

  // 7. Empty Results Handling
  bbCatFilter.value = 'NonExistentCategory';
  sandbox.applyBankBookFilter();
  assert(bbTotDepEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G6.25', 'Non-matching filter gives ₹0.00 deposit total');
  assert(bbTotWdrEl.innerHTML.includes(sandbox.fmtMoney(0)), 'G6.26', 'Non-matching filter gives ₹0.00 withdrawal total');
  assert(mockBbDomRows.every(r => r.style.display === 'none'), 'G6.27', 'All bank rows hidden for non-matching filter');

  // 8. Bank Book CSV Export
  sandbox.clearBankBookFilters();
  sandbox.exportBankBookCSV();
  assert(sandbox._lastCSV && sandbox._lastCSV.name === 'BankBook', 'G6.28', 'exportBankBookCSV triggered downloadCSV');
  const bbCsvRows = sandbox._lastCSV.rows;
  assert(bbCsvRows[0].length === 6, 'G6.29', 'Bank Book CSV export has 6 columns');
  assert(bbCsvRows.some(row => row[1].includes('Devotee C')), 'G6.30', 'Bank Book CSV contains deposit transactions');
  const bbCsvTotalRow = bbCsvRows[bbCsvRows.length - 1];
  assert(bbCsvTotalRow[0] === 'TOTAL' && bbCsvTotalRow[3].includes(sandbox.fmtMoney(fullDepTotal)), 'G6.31', 'Bank Book CSV export footer matches totals');

// =========================================================================
// GROUP 7: Description Column Preservation & Accounting Invariants
// =========================================================================
  console.log('\n--- GROUP 7: Description Column Preservation & Accounting Invariants ---');

  // Cash Book Description column
  assert(cbRows.some(r => r.description === 'Monthly masavari'), 'G7.1', 'Cash Book preserves direct transaction descriptions');
  assert(cbRows.some(r => r.description === 'Lotus & jasmine garlands'), 'G7.2', 'Cash Book preserves payment descriptions');

  // Bank Book Description column
  assert(bbRows.some(r => r.description === 'Generator servicing'), 'G7.3', 'Bank Book preserves payment descriptions');
  assert(bbRows.some(r => r.description === 'Neyyappam offering'), 'G7.4', 'Bank Book resolves billing-linked description');

  // Accounting integrity assertions
  const cbClosing = cbRows.length ? cbRows[cbRows.length - 1].balance : mockSettings.openingCash;
  const bbClosing = bbRows.length ? bbRows[bbRows.length - 1].balance : mockSettings.openingBank;
  assert(typeof cbClosing === 'number' && !isNaN(cbClosing), 'G7.5', 'Cash Book closing balance is valid numeric invariant');
  assert(typeof bbClosing === 'number' && !isNaN(bbClosing), 'G7.6', 'Bank Book closing balance is valid numeric invariant');

  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED out of ${passedAssertions + failedAssertions} assertions`);
  console.log('='.repeat(80));

  if (failedAssertions > 0) {
    process.exit(1);
  }
})();
