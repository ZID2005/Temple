const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('====================================================');
console.log('STEP 33.32A VALIDATION SUITE: LEDGER TOTALS FOOTER');
console.log('====================================================\n');

const htmlPath = path.resolve('d:/Temple/Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// ----------------------------------------------------
// TEST 0: Source Code and DOM Structure Verification
// ----------------------------------------------------
console.log('TEST 0: Source Code & Token Verification');
let test0Passed = true;

if (!html.includes('id="ledgerTotalRow"') || !html.includes('class="ledger-total-row"')) {
  console.error('  FAIL: ledgerTotalRow or class ledger-total-row not found in HTML');
  test0Passed = false;
} else {
  console.log('  PASS: ledgerTotalRow and class ledger-total-row defined');
}

if (!html.includes('<tfoot id="ledgerTFoot">')) {
  console.error('  FAIL: semantic <tfoot id="ledgerTFoot"> not found in HTML');
  test0Passed = false;
} else {
  console.log('  PASS: semantic <tfoot id="ledgerTFoot"> defined');
}

if (!html.includes('id="ledgerTotalDebit"') || !html.includes('id="ledgerTotalCredit"')) {
  console.error('  FAIL: ledgerTotalDebit or ledgerTotalCredit cell IDs not found in HTML');
  test0Passed = false;
} else {
  console.log('  PASS: ledgerTotalDebit and ledgerTotalCredit cell IDs defined');
}

if (!html.includes('function updateLedgerTotals()')) {
  console.error('  FAIL: updateLedgerTotals function not found in HTML');
  test0Passed = false;
} else {
  console.log('  PASS: updateLedgerTotals function defined');
}

if (!html.includes('function clearLedgerFilter()')) {
  console.error('  FAIL: clearLedgerFilter function not found in HTML');
  test0Passed = false;
} else {
  console.log('  PASS: clearLedgerFilter function defined');
}

if (!test0Passed) {
  process.exit(1);
}

// ----------------------------------------------------
// Setup Sandbox for VM Execution
// ----------------------------------------------------
const mockSettings = {
  templeName: 'Test Sree Krishna Temple',
  currencySymbol: '₹',
  startDate: '2026-04-01'
};

function createMockDOM() {
  const elements = {};
  
  function makeEl(id, tagName = 'div') {
    const elObj = {
      id,
      tagName: tagName.toUpperCase(),
      innerHTML: '',
      textContent: '',
      style: {},
      className: '',
      dataset: {},
      outerHTML: '',
      children: [],
      value: '',
      appendChild(child) {
        this.children.push(child);
        return child;
      }
    };
    elements[id] = elObj;
    return elObj;
  }

  return { elements, makeEl };
}

// Helper to create sandbox environment
function createSandbox(initialData = {}) {
  const dom = createMockDOM();
  const sandbox = {
    window: { APP_SETTINGS: mockSettings },
    document: {
      getElementById: (id) => dom.elements[id] || null,
      querySelectorAll: (sel) => {
        if (sel === '#ledgerTable tbody tr') return sandbox._tbodyRows || [];
        if (sel === 'td') return [];
        return [];
      }
    },
    el: (id) => dom.elements[id] || null,
    qs: (sel) => null,
    qsa: (sel, root) => {
      if (root && sel === 'td') return root.children || [];
      if (sel === '#ledgerTable tbody tr') return sandbox._tbodyRows || [];
      return [];
    },
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
    downloadCSV: (rows, filename) => {
      sandbox._lastDownloadedCSV = { rows, filename };
    },
    VIEW_RENDERERS: {},
    allFunds: async () => initialData.funds || [{ name: 'General Fund' }, { name: 'Annadanam Fund' }],
    activeReceipts: async () => initialData.receipts || [],
    activePayments: async () => initialData.payments || [],
    _tbodyRows: [],
    _lastDownloadedCSV: null,
    console
  };

  vm.createContext(sandbox);

  // Extract ledger code section from Temple_Accounts-1.html
  const startIdx = html.indexOf('/* ===================== LEDGER ===================== */');
  const endIdx = html.indexOf('/* ===================== FUND TRANSFERS ===================== */');
  const ledgerCode = html.slice(startIdx, endIdx);
  vm.runInContext(ledgerCode, sandbox);

  return sandbox;
}

// ----------------------------------------------------
// Run the 10 Required Regression Tests
// ----------------------------------------------------

async function runAllTests() {
  const results = [];

  // ====================================================
  // Test 1: Multiple Credit entries sum correctly
  // ====================================================
  console.log('\nTEST 1: Multiple Credit entries sum correctly');
  try {
    const sandbox = createSandbox({
      receipts: [
        { receiptNo: 'R001', date: '2026-04-01', name: 'Devotee A', category: 'Vazhipadu', fund: 'General Fund', amount: 1500.50 },
        { receiptNo: 'R002', date: '2026-04-02', name: 'Devotee B', category: 'Donation', fund: 'Annadanam Fund', amount: 2500.25 },
        { receiptNo: 'R003', date: '2026-04-03', name: 'Devotee C', category: 'Kanikka', fund: 'General Fund', amount: 1000.00 }
      ],
      payments: []
    });

    const renderedHTML = await sandbox.VIEW_RENDERERS.ledger();
    const totalCreditExpected = 1500.50 + 2500.25 + 1000.00; // 5000.75
    const totalDebitExpected = 0.00;

    if (!renderedHTML.includes('₹5,000.75')) throw new Error(`Expected formatted credit ₹5,000.75 not found in output`);
    if (!renderedHTML.includes('₹0.00')) throw new Error(`Expected formatted debit ₹0.00 not found in output`);
    if (!renderedHTML.includes('<b>TOTAL</b>')) throw new Error(`TOTAL cell missing in output`);

    console.log(`  PASS: Multiple credits summed correctly: Debit=₹0.00, Credit=₹5,000.75`);
    results.push({ test: 1, name: 'Multiple Credit Entries', status: 'PASS', debit: 0, credit: totalCreditExpected });
  } catch (err) {
    console.error(`  FAIL in Test 1:`, err.message);
    results.push({ test: 1, name: 'Multiple Credit Entries', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 2: Multiple Debit entries sum correctly
  // ====================================================
  console.log('\nTEST 2: Multiple Debit entries sum correctly');
  try {
    const sandbox = createSandbox({
      receipts: [],
      payments: [
        { voucherNo: 'V001', date: '2026-04-01', paidTo: 'Supplier X', category: 'Pooja Items', fund: 'General Fund', amount: 1200.00 },
        { voucherNo: 'V002', date: '2026-04-02', paidTo: 'Contractor Y', category: 'Maintenance', fund: 'General Fund', amount: 3800.50 },
        { voucherNo: 'V003', date: '2026-04-03', paidTo: 'Electricity Board', category: 'Utilities', fund: 'General Fund', amount: 950.25 }
      ]
    });

    const renderedHTML = await sandbox.VIEW_RENDERERS.ledger();
    const totalDebitExpected = 1200.00 + 3800.50 + 950.25; // 5950.75
    const totalCreditExpected = 0.00;

    if (!renderedHTML.includes('₹5,950.75')) throw new Error(`Expected formatted debit ₹5,950.75 not found in output`);
    if (!renderedHTML.includes('₹0.00')) throw new Error(`Expected formatted credit ₹0.00 not found in output`);

    console.log(`  PASS: Multiple debits summed correctly: Debit=₹5,950.75, Credit=₹0.00`);
    results.push({ test: 2, name: 'Multiple Debit Entries', status: 'PASS', debit: totalDebitExpected, credit: 0 });
  } catch (err) {
    console.error(`  FAIL in Test 2:`, err.message);
    results.push({ test: 2, name: 'Multiple Debit Entries', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 3: Mixed Debit and Credit entries produce independent totals
  // ====================================================
  console.log('\nTEST 3: Mixed Debit and Credit entries produce independent totals');
  try {
    const sandbox = createSandbox({
      receipts: [
        { receiptNo: 'R001', date: '2026-04-01', name: 'Devotee 1', category: 'Archana', fund: 'General Fund', amount: 5000.00 },
        { receiptNo: 'R002', date: '2026-04-04', name: 'Devotee 2', category: 'Donation', fund: 'Annadanam Fund', amount: 3500.00 }
      ],
      payments: [
        { voucherNo: 'V001', date: '2026-04-02', paidTo: 'Grocer', category: 'Annadanam Expenses', fund: 'Annadanam Fund', amount: 2000.00 },
        { voucherNo: 'V002', date: '2026-04-03', paidTo: 'Priest', category: 'Remuneration', fund: 'General Fund', amount: 4500.00 }
      ]
    });

    const renderedHTML = await sandbox.VIEW_RENDERERS.ledger();
    const totalDebitExpected = 6500.00;
    const totalCreditExpected = 8500.00;

    if (!renderedHTML.includes('₹6,500.00')) throw new Error(`Expected Debit ₹6,500.00 not found`);
    if (!renderedHTML.includes('₹8,500.00')) throw new Error(`Expected Credit ₹8,500.00 not found`);

    console.log(`  PASS: Independent totals verified: Debit=₹6,500.00, Credit=₹8,500.00 (Unbalanced as expected)`);
    results.push({ test: 3, name: 'Mixed Independent Totals', status: 'PASS', debit: totalDebitExpected, credit: totalCreditExpected });
  } catch (err) {
    console.error(`  FAIL in Test 3:`, err.message);
    results.push({ test: 3, name: 'Mixed Independent Totals', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 4: Null, missing, and zero amounts are handled safely
  // ====================================================
  console.log('\nTEST 4: Null, missing, and zero amounts are handled safely');
  try {
    const sandbox = createSandbox({
      receipts: [
        { receiptNo: 'R001', date: '2026-04-01', name: 'Devotee 1', category: 'Archana', fund: 'General Fund', amount: null },
        { receiptNo: 'R002', date: '2026-04-02', name: 'Devotee 2', category: 'Archana', fund: 'General Fund', amount: 0 },
        { receiptNo: 'R003', date: '2026-04-03', name: 'Devotee 3', category: 'Archana', fund: 'General Fund', amount: undefined },
        { receiptNo: 'R004', date: '2026-04-04', name: 'Devotee 4', category: 'Archana', fund: 'General Fund', amount: 150.00 }
      ],
      payments: [
        { voucherNo: 'V001', date: '2026-04-05', paidTo: 'Vendor 1', category: 'Items', fund: 'General Fund', amount: null },
        { voucherNo: 'V002', date: '2026-04-06', paidTo: 'Vendor 2', category: 'Items', fund: 'General Fund', amount: 0 },
        { voucherNo: 'V003', date: '2026-04-07', paidTo: 'Vendor 3', category: 'Items', fund: 'General Fund', amount: 250.00 }
      ]
    });

    const renderedHTML = await sandbox.VIEW_RENDERERS.ledger();
    if (!renderedHTML.includes('₹150.00')) throw new Error(`Credit total ₹150.00 not found`);
    if (!renderedHTML.includes('₹250.00')) throw new Error(`Debit total ₹250.00 not found`);

    // Test updateLedgerTotals with simulated DOM rows containing null/dashes
    const mockDebitCell = { innerHTML: '' };
    const mockCreditCell = { innerHTML: '' };
    sandbox.document.getElementById = (id) => {
      if (id === 'ledgerTotalDebit') return mockDebitCell;
      if (id === 'ledgerTotalCredit') return mockCreditCell;
      return null;
    };
    sandbox.el = sandbox.document.getElementById;

    sandbox._tbodyRows = [
      { style: {}, dataset: { debit: '0', credit: '0' }, children: [] },
      { style: {}, dataset: { debit: undefined, credit: undefined }, children: [
        {}, {}, {}, {},
        { textContent: '-' },
        { textContent: '—' }
      ] },
      { style: {}, dataset: { debit: '100', credit: '200' }, children: [] }
    ];

    const computed = sandbox.updateLedgerTotals();
    if (computed.debit !== 100 || computed.credit !== 200) {
      throw new Error(`Fallback handling failed: debit=${computed.debit}, credit=${computed.credit}`);
    }

    console.log(`  PASS: Null, missing, zero, and placeholder dashes handled safely without NaN or errors`);
    results.push({ test: 4, name: 'Null / Missing / Zero Safety', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 4:`, err.message);
    results.push({ test: 4, name: 'Null / Missing / Zero Safety', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 5: Date filtering updates totals correctly
  // ====================================================
  console.log('\nTEST 5: Date filtering updates totals correctly');
  try {
    const sandbox = createSandbox({
      receipts: [
        { receiptNo: 'R1', date: '2026-04-01', name: 'A', category: 'C', fund: 'F', amount: 1000 },
        { receiptNo: 'R2', date: '2026-04-10', name: 'B', category: 'C', fund: 'F', amount: 2000 },
        { receiptNo: 'R3', date: '2026-04-20', name: 'C', category: 'C', fund: 'F', amount: 3000 }
      ],
      payments: [
        { voucherNo: 'V1', date: '2026-04-05', paidTo: 'X', category: 'C', fund: 'F', amount: 500 },
        { voucherNo: 'V2', date: '2026-04-15', paidTo: 'Y', category: 'C', fund: 'F', amount: 1500 },
        { voucherNo: 'V3', date: '2026-04-25', paidTo: 'Z', category: 'C', fund: 'F', amount: 2500 }
      ]
    });

    await sandbox.VIEW_RENDERERS.ledger();

    const mockDebitCell = { innerHTML: '' };
    const mockCreditCell = { innerHTML: '' };
    const filterFrom = { value: '2026-04-05' };
    const filterTo = { value: '2026-04-18' };
    const filterFund = { value: '' };

    sandbox.el = (id) => {
      if (id === 'ledgerFrom') return filterFrom;
      if (id === 'ledgerTo') return filterTo;
      if (id === 'ledgerFundFilter') return filterFund;
      if (id === 'ledgerTotalDebit') return mockDebitCell;
      if (id === 'ledgerTotalCredit') return mockCreditCell;
      return null;
    };

    // Setup DOM rows
    const rows = [
      { style: {}, dataset: { date: '2026-04-01', fund: 'F', debit: 0, credit: 1000 } },
      { style: {}, dataset: { date: '2026-04-05', fund: 'F', debit: 500, credit: 0 } },
      { style: {}, dataset: { date: '2026-04-10', fund: 'F', debit: 0, credit: 2000 } },
      { style: {}, dataset: { date: '2026-04-15', fund: 'F', debit: 1500, credit: 0 } },
      { style: {}, dataset: { date: '2026-04-20', fund: 'F', debit: 0, credit: 3000 } },
      { style: {}, dataset: { date: '2026-04-25', fund: 'F', debit: 2500, credit: 0 } }
    ];
    sandbox._tbodyRows = rows;

    sandbox.applyLedgerFilter();

    // Within 2026-04-05 to 2026-04-18:
    // Visible:
    // row 1 (04-05): debit 500
    // row 2 (04-10): credit 2000
    // row 3 (04-15): debit 1500
    // Expected Debit: 500 + 1500 = 2000
    // Expected Credit: 2000
    if (rows[0].style.display !== 'none') throw new Error('Row 0 (04-01) should be hidden');
    if (rows[1].style.display !== '') throw new Error('Row 1 (04-05) should be visible');
    if (rows[2].style.display !== '') throw new Error('Row 2 (04-10) should be visible');
    if (rows[3].style.display !== '') throw new Error('Row 3 (04-15) should be visible');
    if (rows[4].style.display !== 'none') throw new Error('Row 4 (04-20) should be hidden');
    if (rows[5].style.display !== 'none') throw new Error('Row 5 (04-25) should be hidden');

    if (!mockDebitCell.innerHTML.includes('₹2,000.00')) throw new Error(`Expected debit ₹2,000.00, got ${mockDebitCell.innerHTML}`);
    if (!mockCreditCell.innerHTML.includes('₹2,000.00')) throw new Error(`Expected credit ₹2,000.00, got ${mockCreditCell.innerHTML}`);

    console.log(`  PASS: Date filtering accurately hid out-of-range rows and updated totals to Debit=₹2,000.00, Credit=₹2,000.00`);
    results.push({ test: 5, name: 'Date Filtering Totals', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 5:`, err.message);
    results.push({ test: 5, name: 'Date Filtering Totals', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 6: Fund filtering updates totals correctly
  // ====================================================
  console.log('\nTEST 6: Fund filtering updates totals correctly');
  try {
    const sandbox = createSandbox({
      receipts: [
        { receiptNo: 'R1', date: '2026-04-01', name: 'A', category: 'C', fund: 'General Fund', amount: 4000 },
        { receiptNo: 'R2', date: '2026-04-02', name: 'B', category: 'C', fund: 'Temple Renovation', amount: 8000 }
      ],
      payments: [
        { voucherNo: 'V1', date: '2026-04-03', paidTo: 'X', category: 'C', fund: 'General Fund', amount: 1500 },
        { voucherNo: 'V2', date: '2026-04-04', paidTo: 'Y', category: 'C', fund: 'Temple Renovation', amount: 6000 }
      ]
    });

    await sandbox.VIEW_RENDERERS.ledger();

    const mockDebitCell = { innerHTML: '' };
    const mockCreditCell = { innerHTML: '' };
    const filterFrom = { value: '' };
    const filterTo = { value: '' };
    const filterFund = { value: 'Temple Renovation' };

    sandbox.el = (id) => {
      if (id === 'ledgerFrom') return filterFrom;
      if (id === 'ledgerTo') return filterTo;
      if (id === 'ledgerFundFilter') return filterFund;
      if (id === 'ledgerTotalDebit') return mockDebitCell;
      if (id === 'ledgerTotalCredit') return mockCreditCell;
      return null;
    };

    const rows = [
      { style: {}, dataset: { date: '2026-04-01', fund: 'General Fund', debit: 0, credit: 4000 } },
      { style: {}, dataset: { date: '2026-04-02', fund: 'Temple Renovation', debit: 0, credit: 8000 } },
      { style: {}, dataset: { date: '2026-04-03', fund: 'General Fund', debit: 1500, credit: 0 } },
      { style: {}, dataset: { date: '2026-04-04', fund: 'Temple Renovation', debit: 6000, credit: 0 } }
    ];
    sandbox._tbodyRows = rows;

    sandbox.applyLedgerFilter();

    // Only 'Temple Renovation' visible:
    // Debit = 6000
    // Credit = 8000
    if (rows[0].style.display !== 'none') throw new Error('General Fund receipt should be hidden');
    if (rows[1].style.display !== '') throw new Error('Temple Renovation receipt should be visible');
    if (rows[2].style.display !== 'none') throw new Error('General Fund payment should be hidden');
    if (rows[3].style.display !== '') throw new Error('Temple Renovation payment should be visible');

    if (!mockDebitCell.innerHTML.includes('₹6,000.00')) throw new Error(`Expected debit ₹6,000.00, got ${mockDebitCell.innerHTML}`);
    if (!mockCreditCell.innerHTML.includes('₹8,000.00')) throw new Error(`Expected credit ₹8,000.00, got ${mockCreditCell.innerHTML}`);

    console.log(`  PASS: Fund filtering isolated Temple Renovation: Debit=₹6,000.00, Credit=₹8,000.00`);
    results.push({ test: 6, name: 'Fund Filtering Totals', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 6:`, err.message);
    results.push({ test: 6, name: 'Fund Filtering Totals', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 7: Clearing filters restores the appropriate totals
  // ====================================================
  console.log('\nTEST 7: Clearing filters restores the appropriate totals');
  try {
    const sandbox = createSandbox({
      receipts: [
        { receiptNo: 'R1', date: '2026-04-01', name: 'A', category: 'C', fund: 'F1', amount: 3000 },
        { receiptNo: 'R2', date: '2026-04-02', name: 'B', category: 'C', fund: 'F2', amount: 7000 }
      ],
      payments: [
        { voucherNo: 'V1', date: '2026-04-03', paidTo: 'X', category: 'C', fund: 'F1', amount: 1200 },
        { voucherNo: 'V2', date: '2026-04-04', paidTo: 'Y', category: 'C', fund: 'F2', amount: 2800 }
      ]
    });

    await sandbox.VIEW_RENDERERS.ledger();

    const mockDebitCell = { innerHTML: '' };
    const mockCreditCell = { innerHTML: '' };
    const filterFrom = { value: '2026-04-01' };
    const filterTo = { value: '2026-04-02' };
    const filterFund = { value: 'F1' };

    sandbox.el = (id) => {
      if (id === 'ledgerFrom') return filterFrom;
      if (id === 'ledgerTo') return filterTo;
      if (id === 'ledgerFundFilter') return filterFund;
      if (id === 'ledgerTotalDebit') return mockDebitCell;
      if (id === 'ledgerTotalCredit') return mockCreditCell;
      return null;
    };

    const rows = [
      { style: {}, dataset: { date: '2026-04-01', fund: 'F1', debit: 0, credit: 3000 } },
      { style: {}, dataset: { date: '2026-04-02', fund: 'F2', debit: 0, credit: 7000 } },
      { style: {}, dataset: { date: '2026-04-03', fund: 'F1', debit: 1200, credit: 0 } },
      { style: {}, dataset: { date: '2026-04-04', fund: 'F2', debit: 2800, credit: 0 } }
    ];
    sandbox._tbodyRows = rows;

    // Apply strict filter first
    sandbox.applyLedgerFilter();
    // Now call clearLedgerFilter()
    sandbox.clearLedgerFilter();

    if (filterFrom.value !== '' || filterTo.value !== '' || filterFund.value !== '') {
      throw new Error('Filter input fields were not reset to empty strings');
    }

    // All rows should now be visible:
    // Total Debit: 1200 + 2800 = 4000
    // Total Credit: 3000 + 7000 = 10000
    rows.forEach((r, idx) => {
      if (r.style.display !== '') throw new Error(`Row ${idx} is still hidden after clearing filters`);
    });

    if (!mockDebitCell.innerHTML.includes('₹4,000.00')) throw new Error(`Expected restored debit ₹4,000.00, got ${mockDebitCell.innerHTML}`);
    if (!mockCreditCell.innerHTML.includes('₹10,000.00')) throw new Error(`Expected restored credit ₹10,000.00, got ${mockCreditCell.innerHTML}`);

    console.log(`  PASS: clearLedgerFilter reset inputs and restored full totals: Debit=₹4,000.00, Credit=₹10,000.00`);
    results.push({ test: 7, name: 'Clear Filters Restoration', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 7:`, err.message);
    results.push({ test: 7, name: 'Clear Filters Restoration', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 8: Refreshing the Ledger does not duplicate the footer
  // ====================================================
  console.log('\nTEST 8: Refreshing the Ledger does not duplicate the footer');
  try {
    const sandbox = createSandbox({
      receipts: [{ receiptNo: 'R1', date: '2026-04-01', name: 'A', category: 'C', fund: 'F', amount: 500 }],
      payments: [{ voucherNo: 'V1', date: '2026-04-02', paidTo: 'X', category: 'C', fund: 'F', amount: 200 }]
    });

    // Render 1
    const render1 = await sandbox.VIEW_RENDERERS.ledger();
    // Render 2 (refresh)
    const render2 = await sandbox.VIEW_RENDERERS.ledger();
    // Render 3 (another refresh)
    const render3 = await sandbox.VIEW_RENDERERS.ledger();

    const countFooters = (htmlStr) => (htmlStr.match(/<tfoot/g) || []).length;
    const countTotalRows = (htmlStr) => (htmlStr.match(/id="ledgerTotalRow"/g) || []).length;

    if (countFooters(render1) !== 1 || countTotalRows(render1) !== 1) throw new Error('Render 1 has duplicate or missing footer');
    if (countFooters(render2) !== 1 || countTotalRows(render2) !== 1) throw new Error('Render 2 has duplicate or missing footer');
    if (countFooters(render3) !== 1 || countTotalRows(render3) !== 1) throw new Error('Render 3 has duplicate or missing footer');

    console.log(`  PASS: Multiple consecutive renders yield exactly 1 <tfoot id="ledgerTFoot"> and 1 ledgerTotalRow each time`);
    results.push({ test: 8, name: 'Zero Footer Duplication', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 8:`, err.message);
    results.push({ test: 8, name: 'Zero Footer Duplication', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 9: Currency formatting matches existing application
  // ====================================================
  console.log('\nTEST 9: Currency formatting matches existing application');
  try {
    const sandbox = createSandbox({
      receipts: [{ receiptNo: 'R1', date: '2026-04-01', name: 'Devotee', category: 'Donation', fund: 'General', amount: 1234567.89 }],
      payments: [{ voucherNo: 'V1', date: '2026-04-02', paidTo: 'Builder', category: 'Construction', fund: 'General', amount: 987654.32 }]
    });

    const renderedHTML = await sandbox.VIEW_RENDERERS.ledger();

    // Indian number system formatting:
    // 1234567.89 -> ₹12,34,567.89
    // 987654.32 -> ₹9,87,654.32
    if (!renderedHTML.includes('₹12,34,567.89')) throw new Error(`Credit formatting mismatch: expected ₹12,34,567.89`);
    if (!renderedHTML.includes('₹9,87,654.32')) throw new Error(`Debit formatting mismatch: expected ₹9,87,654.32`);

    console.log(`  PASS: Large amounts formatted in Indian numbering: Credit=₹12,34,567.89, Debit=₹9,87,654.32`);
    results.push({ test: 9, name: 'Indian Currency Formatting', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 9:`, err.message);
    results.push({ test: 9, name: 'Indian Currency Formatting', status: 'FAIL', error: err.message });
  }

  // ====================================================
  // Test 10: Existing Ledger search, CSV/Excel export, and accounting data remain unaffected
  // ====================================================
  console.log('\nTEST 10: Existing Ledger CSV/Excel export and accounting data remain unaffected');
  try {
    const receiptsData = [
      { receiptNo: 'R101', date: '2026-04-01', name: 'Devotee A', category: 'Vazhipadu', fund: 'General Fund', amount: 500.00 }
    ];
    const paymentsData = [
      { voucherNo: 'V101', date: '2026-04-02', paidTo: 'Vendor B', category: 'Flowers', fund: 'General Fund', amount: 300.00 }
    ];

    const sandbox = createSandbox({ receipts: receiptsData, payments: paymentsData });
    await sandbox.VIEW_RENDERERS.ledger();

    // Mock tbody rows for export
    sandbox._tbodyRows = [
      { style: {}, children: [
        { textContent: '01-04-2026' },
        { textContent: 'R101' },
        { textContent: 'Devotee A - Vazhipadu' },
        { textContent: 'General Fund' },
        { textContent: '-' },
        { textContent: '₹500.00' }
      ]},
      { style: {}, children: [
        { textContent: '02-04-2026' },
        { textContent: 'V101' },
        { textContent: 'Vendor B - Flowers' },
        { textContent: 'General Fund' },
        { textContent: '₹300.00' },
        { textContent: '-' }
      ]}
    ];

    sandbox.exportLedgerCSV();

    const exported = sandbox._lastDownloadedCSV;
    if (!exported) throw new Error('downloadCSV was not invoked');
    if (exported.filename !== 'Ledger') throw new Error(`Filename mismatch: expected 'Ledger', got '${exported.filename}'`);
    if (exported.rows.length !== 3) throw new Error(`Expected header + 2 data rows = 3 rows, got ${exported.rows.length}`);

    // Check header
    const header = exported.rows[0];
    const expectedHeader = ['Date', 'Voucher/Receipt No.', 'Particulars', 'Fund', 'Debit', 'Credit'];
    if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
      throw new Error(`CSV Header altered: ${JSON.stringify(header)}`);
    }

    // Check that tfoot total row was NOT exported into CSV
    const containsTotalRow = exported.rows.some(r => r[2] === 'TOTAL' || r[0] === 'TOTAL');
    if (containsTotalRow) throw new Error('Footer row was erroneously exported into CSV data');

    // Confirm receiptsData and paymentsData are untouched
    if (receiptsData[0].amount !== 500 || paymentsData[0].amount !== 300) {
      throw new Error('Accounting data mutated!');
    }

    console.log(`  PASS: CSV export schema unaltered (6 columns, exactly 2 data rows, zero totals in CSV body), accounting records unmutated`);
    results.push({ test: 10, name: 'Export & Data Unaffected', status: 'PASS' });
  } catch (err) {
    console.error(`  FAIL in Test 10:`, err.message);
    results.push({ test: 10, name: 'Export & Data Unaffected', status: 'FAIL', error: err.message });
  }

  // Summary
  console.log('\n====================================================');
  console.log('TEST SUMMARY');
  console.log('====================================================');
  const allPassed = results.every(r => r.status === 'PASS');
  results.forEach(r => {
    console.log(`Test ${r.test}: ${r.name} -> ${r.status}`);
  });
  console.log(`\nOVERALL VERDICT: ${allPassed ? 'ALL TESTS PASSED (10/10)' : 'SOME TESTS FAILED'}`);

  if (!allPassed) process.exit(1);
}

runAllTests();
