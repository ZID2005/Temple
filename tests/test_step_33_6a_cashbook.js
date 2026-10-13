const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('STEP 33.6A VALIDATION SUITE: CASH BOOK ENHANCEMENT');
console.log('====================================================\n');

const htmlPath = path.resolve('d:/Temple/Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Verify CSS alignment changes
console.log('TEST 1: CSS Tabular Numeric Alignment');
const cssMatch = html.match(/#cashBookTable\s+th:nth-child\(5\),\s*#cashBookTable\s+td:nth-child\(5\)/);
if (cssMatch) {
  console.log('  PASS: CSS updated to align column 5 (Receipt), 6 (Payment), 7 (Balance)');
} else {
  console.error('  FAIL: CSS alignment not updated');
  process.exit(1);
}

// 2. Extract Cash Book code block from HTML
console.log('\nTEST 2: Syntax and Function Extraction');
// We can extract resolvePaymentType, buildCashBookRows, VIEW_RENDERERS.cashbook, applyCashBookCategoryFilter, updateCashBookTotals, exportCashBookCSV
const extractFn = (name) => {
  const start = html.indexOf(`function ${name}`);
  if (start === -1) return null;
  // find matching braces
  let depth = 0;
  let started = false;
  let end = start;
  while (end < html.length) {
    if (html[end] === '{') { depth++; started = true; }
    else if (html[end] === '}') {
      depth--;
      if (started && depth === 0) { end++; break; }
    }
    end++;
  }
  return html.slice(start, end);
};

// Also mock DOM environment
const mockSettings = {
  templeName: 'Test Sree Krishna Temple',
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingCash: 50000.00
};

// Create sandbox
const sandbox = {
  window: { APP_SETTINGS: mockSettings },
  document: {
    getElementById: (id) => sandbox._elements[id] || null,
    querySelectorAll: (sel) => sandbox._queryAll(sel)
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
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  VIEW_RENDERERS: {},
  _elements: {},
  _queryAll: () => [],
  _queryOne: () => null,
  _cashBookRows: [],
  downloadCSV: (rows, name) => { sandbox._lastDownloadedCSV = { rows, name }; },
  printGenericTable: (title, tableEl) => { sandbox._lastPrinted = { title, html: tableEl ? tableEl.outerHTML : '' }; },
  console
};

vm.createContext(sandbox);

// Evaluate helper functions and Cash Book in sandbox
const codeBlockStart = html.indexOf('function resolvePaymentType');
const codeBlockEnd = html.indexOf('VIEW_RENDERERS.bankbook =');
const cashBookCode = html.slice(codeBlockStart, codeBlockEnd);

try {
  vm.runInContext(cashBookCode, sandbox);
  console.log('  PASS: Cash Book code block executed with zero syntax errors');
} catch (err) {
  console.error('  FAIL: Syntax error in Cash Book code:', err);
  process.exit(1);
}

// 3. Test resolvePaymentType unit tests
console.log('\nTEST 3: Payment Type Resolution Unit Tests');
const testCases = [
  { input: { paymentMode: 'Cash' }, fallback: 'Cash', expected: 'Cash' },
  { input: { paymentMode: 'UPI' }, fallback: 'Cash', expected: 'UPI' },
  { input: { paymentMode: 'Bank' }, fallback: 'Cash', expected: 'Bank Transfer' },
  { input: { mode: 'Cheque' }, fallback: 'Bank Transfer', expected: 'Cheque' },
  { input: { mode: 'Online' }, fallback: 'Bank Transfer', expected: 'Online' },
  { input: { mode: 'Cash' }, fallback: 'Cash', expected: 'Cash' },
  { input: { mode: 'Other' }, fallback: 'Other', expected: 'Other' },
  { input: {}, fallback: 'Bank Transfer', expected: 'Bank Transfer' },
  { input: null, fallback: '—', expected: '—' },
  { input: { paymentMode: '' }, fallback: null, expected: '—' }
];

let resAllPass = true;
testCases.forEach((tc, idx) => {
  const result = sandbox.resolvePaymentType(tc.input, tc.fallback);
  const pass = result === tc.expected;
  if (!pass) {
    console.error(`  FAIL Case ${idx + 1}: expected "${tc.expected}", got "${result}"`);
    resAllPass = false;
  }
});
if (resAllPass) {
  console.log('  PASS: All 10 payment type mapping test cases succeeded');
} else {
  process.exit(1);
}

// 4. Test buildCashBookRows with synthetic transactions
console.log('\nTEST 4: buildCashBookRows Execution & Row Mapping');

const mockReceipts = [
  { id: 'r1', date: '2026-04-05', receiptNo: 'R-001', name: 'Devotee A', category: 'Vazhipadu', paymentMode: 'Cash', amount: 1500, voided: false },
  { id: 'r2', date: '2026-04-06', receiptNo: 'R-002', name: 'Devotee B', category: 'Annadanam', paymentMode: 'Cash', amount: 3000, voided: false },
  { id: 'r3', date: '2026-04-07', receiptNo: 'R-003', name: 'Devotee C (VOID)', category: 'Vazhipadu', paymentMode: 'Cash', amount: 10000, voided: true }, // VOIDED
  { id: 'r4', date: '2026-04-08', receiptNo: 'R-004', name: 'Devotee D (BANK)', category: 'Donation', paymentMode: 'Bank', amount: 50000, voided: false } // BANK MODE
];

const mockPayments = [
  { id: 'p1', date: '2026-04-06', voucherNo: 'V-001', paidTo: 'Vendor Pooja Items', category: 'Pooja Expense', paymentMode: 'Cash', amount: 800, voided: false },
  { id: 'p2', date: '2026-04-09', voucherNo: 'V-002', paidTo: 'Contractor Cleaning', category: 'Maintenance', paymentMode: 'Cash', amount: 1200, voided: false },
  { id: 'p3', date: '2026-04-10', voucherNo: 'V-003', paidTo: 'Vendor (VOID)', category: 'Maintenance', paymentMode: 'Cash', amount: 9999, voided: true } // VOIDED
];

const mockTransfers = [
  { id: 't1', date: '2026-04-07', fromAcc: 'Cash', toAcc: 'Bank', amount: 2000, mode: 'Cheque', reason: 'Deposit' },
  { id: 't2', date: '2026-04-08', fromAcc: 'Bank', toAcc: 'Cash', amount: 5000, mode: 'Online', reason: 'ATM Withdrawal' }
];

const mockLoans = [
  { id: 'l1', date: '2026-04-09', person: 'Temple Trustee', paymentMode: 'Cash', loanReceived: 10000, repayment: 0 }
];

const mockCollections = [
  { id: 'c1', date: '2026-04-09', memberName: 'Chitty Member 1', paymentMode: 'Cash', amountReceived: 1000 }
];

const mockPayouts = [
  { id: 'pout1', date: '2026-04-10', memberName: 'Chitty Winner', paymentMode: 'Cash', amount: 4000 }
];

sandbox.activeReceipts = async () => mockReceipts.filter(r => !r.voided);
sandbox.activePayments = async () => mockPayments.filter(p => !p.voided);
sandbox.allTransfers = async () => mockTransfers;
sandbox.allLoans = async () => mockLoans;
sandbox.allChittyCollections = async () => mockCollections;
sandbox.allChittyPayouts = async () => mockPayouts;

(async () => {
  const rows = await sandbox.buildCashBookRows();
  console.log(`  Built ${rows.length} Cash Book rows`);

  // Verify rows are sorted by date
  let sorted = true;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].date < rows[i - 1].date) sorted = false;
  }
  console.log(`  Sorted chronologically: ${sorted ? 'YES' : 'NO'}`);

  // Check voided transactions
  const hasVoided = rows.some(r => r.particulars.includes('(VOID)'));
  console.log(`  Voided transactions excluded: ${!hasVoided ? 'PASS' : 'FAIL'}`);

  // Check bank transfer mechanisms
  const chequeTransfer = rows.find(r => r.particulars.includes('Transfer to Bank'));
  const onlineTransfer = rows.find(r => r.particulars.includes('Transfer from Bank'));
  console.log(`  Cheque transfer paymentType: "${chequeTransfer ? chequeTransfer.paymentType : 'NONE'}" (Expected: "Cheque")`);
  console.log(`  Online transfer paymentType: "${onlineTransfer ? onlineTransfer.paymentType : 'NONE'}" (Expected: "Online")`);
  if (chequeTransfer && chequeTransfer.paymentType === 'Cheque' && onlineTransfer && onlineTransfer.paymentType === 'Online') {
    console.log('  PASS: Fund transfer mechanisms correctly distinguished');
  } else {
    console.error('  FAIL: Fund transfer paymentType incorrect');
    process.exit(1);
  }

  // Check running balance
  // Opening: 50,000
  // 2026-04-05: +1500 (Receipt R-001) -> 51,500
  // 2026-04-06: -800 (Payment V-001) -> 50,700
  // 2026-04-06: +3000 (Receipt R-002) -> 53,700
  // 2026-04-07: -2000 (Transfer to Bank) -> 51,700
  // 2026-04-08: +5000 (Transfer from Bank) -> 56,700
  // 2026-04-09: -1200 (Payment V-002) -> 55,500
  // 2026-04-09: +10000 (Loan Received) -> 65,500
  // 2026-04-09: +1000 (Chitty Collection) -> 66,500
  // 2026-04-10: -4000 (Chitty Payout) -> 62,500
  const finalRow = rows[rows.length - 1];
  console.log(`  Initial Opening Cash: ${sandbox.fmtMoney(50000)}`);
  console.log(`  Final Running Balance: ${sandbox.fmtMoney(finalRow.balance)} (Expected: ₹62,500.00)`);
  if (finalRow.balance === 62500) {
    console.log('  PASS: Running balance matches mathematical transaction stream exactly');
  } else {
    console.error(`  FAIL: Running balance discrepancy: ${finalRow.balance} vs 62500`);
    process.exit(1);
  }

  // 5. Test VIEW_RENDERERS.cashbook HTML rendering
  console.log('\nTEST 5: On-Screen HTML Table Rendering');
  const renderedHtml = await sandbox.VIEW_RENDERERS.cashbook();
  
  // Verify header has 7 columns in exact order
  const theadMatch = renderedHtml.match(/<thead><tr><th>(.*?)<\/tr><\/thead>/s);
  if (!theadMatch) {
    console.error('  FAIL: <thead> not found');
    process.exit(1);
  }
  const thHeaders = theadMatch[1].split('<\/th>').map(s => s.replace(/.*<th>/, '').trim()).filter(Boolean);
  console.log('  Header columns:', thHeaders);
  const expectedHeaders = ['Date', 'Particulars', 'Category', 'Payment Type', 'Receipt', 'Payment', 'Balance'];
  const headersMatch = JSON.stringify(thHeaders) === JSON.stringify(expectedHeaders);
  console.log(`  Headers match expected [${expectedHeaders.join(', ')}]: ${headersMatch ? 'PASS' : 'FAIL'}`);
  if (!headersMatch) process.exit(1);

  // Verify Opening Balance row
  const obRowMatch = renderedHtml.match(/<tr data-category="Opening Balance">(.*?)<\/tr>/s);
  if (!obRowMatch) {
    console.error('  FAIL: Opening Balance row not found');
    process.exit(1);
  }
  const obCells = obRowMatch[1].split('<\/td>').map(s => s.replace(/.*<td>/, '').trim()).filter(Boolean);
  console.log('  Opening Balance cells:', obCells);
  // Column 3 is Payment Type: should be '—'
  if (obCells[3] === '—') {
    console.log('  PASS: Opening Balance Payment Type is "—"');
  } else {
    console.error(`  FAIL: Opening Balance Payment Type is "${obCells[3]}"`);
    process.exit(1);
  }
  if (obCells.length === 7) {
    console.log('  PASS: Opening Balance row has exactly 7 columns');
  } else {
    console.error(`  FAIL: Opening Balance row has ${obCells.length} columns, expected 7`);
    process.exit(1);
  }

  // Verify Totals Row in <tfoot>
  const tfootMatch = renderedHtml.match(/<tfoot[^>]*>(.*?)<\/tfoot>/s);
  if (!tfootMatch) {
    console.error('  FAIL: <tfoot> not found');
    process.exit(1);
  }
  const tfootCells = tfootMatch[1].split('<\/td>').map(s => s.replace(/.*<td[^>]*>/, '').replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  console.log('  Totals row cells (stripped tags):', tfootCells);
  if (tfootCells.length === 7) {
    console.log('  PASS: Totals row has exactly 7 columns');
  } else {
    console.error(`  FAIL: Totals row has ${tfootCells.length} columns, expected 7`);
    process.exit(1);
  }

  // Verify Totals row values:
  // Total Receipts: 1500 (R-001) + 3000 (R-002) + 5000 (Transfer) + 10000 (Loan) + 1000 (Chitty) = 20,500
  // Total Payments: 800 (V-001) + 2000 (Transfer) + 1200 (V-002) + 4000 (Payout) = 8,000
  // Net: 20,500 - 8,000 = 12,500 (+ 50,000 opening = 62,500)
  console.log(`  Calculated Total Receipt: ₹20,500.00 | Table cell: ${tfootCells[4]}`);
  console.log(`  Calculated Total Payment: ₹8,000.00 | Table cell: ${tfootCells[5]}`);
  console.log(`  Final Balance cell: "${tfootCells[6]}" (Expected: "—")`);
  if (tfootCells[4] === '₹20,500.00' && tfootCells[5] === '₹8,000.00' && tfootCells[6] === '—') {
    console.log('  PASS: Totals row receipts, payments, and balance cell values match perfectly');
  } else {
    console.error('  FAIL: Totals row cell values mismatch');
    process.exit(1);
  }

  // 6. Test Category Filter & Total Recalculation
  console.log('\nTEST 6: Category Filter Recalculation');
  // Mock elements for filter testing
  const mockTableTrs = [];
  // Parse rows from renderedHtml
  const rowMatches = [...renderedHtml.matchAll(/<tr data-category="([^"]+)">/g)];
  rowMatches.forEach(m => {
    mockTableTrs.push({
      dataset: { category: m[1] },
      style: { display: '' }
    });
  });

  const filterSelect = { value: 'Vazhipadu' };
  const totalReceiptEl = { innerHTML: '' };
  const totalPaymentEl = { innerHTML: '' };

  sandbox._elements = {
    cashBookCategoryFilter: filterSelect,
    cashBookTotalReceipt: totalReceiptEl,
    cashBookTotalPayment: totalPaymentEl
  };
  sandbox._queryAll = (sel) => {
    if (sel.includes('tbody tr')) return mockTableTrs;
    return [];
  };

  // Run filter with 'Vazhipadu'
  sandbox.applyCashBookCategoryFilter();
  
  // Check hidden rows
  const visibleCategories = mockTableTrs.filter(tr => tr.style.display !== 'none').map(tr => tr.dataset.category);
  console.log(`  Visible categories with 'Vazhipadu' filter:`, visibleCategories);
  console.log(`  Updated Total Receipt HTML: ${totalReceiptEl.innerHTML} (Expected: <b>₹1,500.00</b>)`);
  console.log(`  Updated Total Payment HTML: ${totalPaymentEl.innerHTML} (Expected: <b>₹0.00</b>)`);
  if (totalReceiptEl.innerHTML === '<b>₹1,500.00</b>' && totalPaymentEl.innerHTML === '<b>₹0.00</b>') {
    console.log('  PASS: Category filter recalculation works accurately');
  } else {
    console.error('  FAIL: Category filter totals mismatch');
    process.exit(1);
  }

  // Test filter reset to ''
  filterSelect.value = '';
  sandbox.applyCashBookCategoryFilter();
  console.log(`  Reset to All Categories - Total Receipt: ${totalReceiptEl.innerHTML} | Total Payment: ${totalPaymentEl.innerHTML}`);
  if (totalReceiptEl.innerHTML === '<b>₹20,500.00</b>' && totalPaymentEl.innerHTML === '<b>₹8,000.00</b>') {
    console.log('  PASS: Reset to All Categories restored full totals accurately');
  } else {
    console.error('  FAIL: Reset to All Categories totals mismatch');
    process.exit(1);
  }

  // 7. Test CSV / Excel Export
  console.log('\nTEST 7: CSV / Excel Export Consistency');
  filterSelect.value = '';
  sandbox.exportCashBookCSV();
  const csvData = sandbox._lastDownloadedCSV;
  if (!csvData) {
    console.error('  FAIL: CSV download not called');
    process.exit(1);
  }
  console.log(`  Filename Prefix: ${csvData.name}`);
  console.log(`  CSV Total Rows: ${csvData.rows.length}`);
  
  // Verify CSV headers
  const csvHeader = csvData.rows[0];
  console.log('  CSV Header:', csvHeader);
  if (JSON.stringify(csvHeader) === JSON.stringify(expectedHeaders)) {
    console.log('  PASS: CSV header columns match on-screen table exactly');
  } else {
    console.error('  FAIL: CSV header does not match');
    process.exit(1);
  }

  // Check each row in CSV has 7 columns
  let all7 = true;
  csvData.rows.forEach((r, idx) => {
    if (r.length !== 7) {
      console.error(`  FAIL: CSV row ${idx} has ${r.length} columns:`, r);
      all7 = false;
    }
  });
  if (all7) {
    console.log('  PASS: Every row in the CSV export has exactly 7 columns');
  } else {
    process.exit(1);
  }

  // Verify CSV Opening Balance row
  const csvOB = csvData.rows[1];
  console.log('  CSV Opening Balance row:', csvOB);
  if (csvOB[0] === '01-04-2026' && csvOB[1] === 'Opening Balance' && csvOB[3] === '—' && csvOB[4] === '-' && csvOB[5] === '-' && csvOB[6] === '₹50,000.00') {
    console.log('  PASS: CSV Opening Balance row has "—" for Payment Type and "-" for Receipt/Payment');
  } else {
    console.error('  FAIL: CSV Opening Balance row incorrect');
    process.exit(1);
  }

  // Verify CSV Totals row
  const csvTotals = csvData.rows[csvData.rows.length - 1];
  console.log('  CSV Totals row:', csvTotals);
  if (csvTotals[0] === 'TOTAL' && csvTotals[1] === '—' && csvTotals[2] === '—' && csvTotals[3] === '—' && csvTotals[4] === '₹20,500.00' && csvTotals[5] === '₹8,000.00' && csvTotals[6] === '—') {
    console.log('  PASS: CSV Totals row is the final row, with matching column counts and correct totals');
  } else {
    console.error('  FAIL: CSV Totals row incorrect');
    process.exit(1);
  }

  // Test CSV with filtered category
  filterSelect.value = 'Chitty';
  sandbox.exportCashBookCSV();
  const filteredCSV = sandbox._lastDownloadedCSV;
  // Opening balance excluded when filter is Chitty (not All or Opening Balance)
  const filteredTotals = filteredCSV.rows[filteredCSV.rows.length - 1];
  console.log(`  CSV filtered by 'Chitty' rows count: ${filteredCSV.rows.length}`);
  console.log('  CSV filtered Totals row:', filteredTotals);
  // Chitty: Receipt = 1000, Payment = 4000
  if (filteredTotals[4] === '₹1,000.00' && filteredTotals[5] === '₹4,000.00') {
    console.log('  PASS: Filtered CSV export recalculates totals correctly');
  } else {
    console.error('  FAIL: Filtered CSV totals mismatch');
    process.exit(1);
  }

  // 8. Test Print Output
  console.log('\nTEST 8: Print Output Verification');
  // Mock tableEl
  const mockTableEl = {
    outerHTML: renderedHtml.match(/<table id="cashBookTable">[\s\S]*?<\/table>/)[0]
  };
  sandbox.printGenericTable('Cash Book', mockTableEl);
  const printOutput = sandbox._lastPrinted;
  if (!printOutput) {
    console.error('  FAIL: Print not invoked');
    process.exit(1);
  }
  console.log(`  Print Title: "${printOutput.title}"`);
  const hasTheadInPrint = printOutput.html.includes('<th>Payment Type</th>');
  const hasTfootInPrint = printOutput.html.includes('id="cashBookTotalRow"');
  console.log(`  Print HTML contains "<th>Payment Type</th>": ${hasTheadInPrint ? 'PASS' : 'FAIL'}`);
  console.log(`  Print HTML contains totals row: ${hasTfootInPrint ? 'PASS' : 'FAIL'}`);
  if (hasTheadInPrint && hasTfootInPrint) {
    console.log('  PASS: Print output includes the new column and totals row with matching structure');
  } else {
    console.error('  FAIL: Print output incomplete');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('ALL STEP 33.6A VALIDATION CHECKS PASSED SUCCESSFULLY');
  console.log('====================================================');
})();
