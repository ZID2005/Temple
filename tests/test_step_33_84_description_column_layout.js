// tests/test_step_33_84_description_column_layout.js
// Automated Regression Suite for STEP 33.84:
// Dedicated Description Columns and Table Layout Repair in Receipts, Cash Book, and General Ledger

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

console.log('========================================================================');
console.log('STEP 33.84: DEDICATED DESCRIPTION COLUMNS & TABLE LAYOUT REPAIR TEST');
console.log('========================================================================\n');

const htmlPath = path.resolve('D:/Temple/Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const PRE_CHANGE_HASH = '4CAB53CFD6F62B8675F458492D90F46C1C366551404027A88FE8CC79497ED629';
const PRE_CHANGE_SIZE = 833272;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];

function assert(condition, testId, description, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testId}: ${description}`);
    testDetails.push({ id: testId, description, status: 'PASS', details });
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testId}: ${description}${details ? ' | ' + details : ''}`);
    testDetails.push({ id: testId, description, status: 'FAIL', details });
  }
}

// -----------------------------------------------------------------------------
// Helper: Setup Sandbox for VM Execution
// -----------------------------------------------------------------------------
function setupSandbox(customSettings = {}) {
  const settings = {
    templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
    templeAddress: 'ആശാരിവിളാകം കേരളദിത്യപുരം',
    templeContact: '9847000000',
    currencySymbol: '₹',
    startDate: '2026-04-01',
    openingCash: 50000.00,
    openingBank: 100000.00,
    ...customSettings
  };

  const elements = {};
  function makeEl(id, tag = 'div') {
    const obj = {
      id,
      tagName: tag.toUpperCase(),
      innerHTML: '',
      textContent: '',
      value: '',
      style: {},
      dataset: {},
      className: '',
      children: [],
      appendChild(c) { this.children.push(c); return c; },
      getAttribute(attr) { return this.dataset[attr.replace('data-', '')] || null; }
    };
    elements[id] = obj;
    return obj;
  }

  const sandbox = {
    window: {
      APP_SETTINGS: settings,
      _cashBookRows: [],
      _ledgerRows: [],
      _bankBookRows: [],
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: (sel) => sandbox._qsa(sel),
      body: { appendChild: () => {}, removeChild: () => {}, classList: { add: () => {}, remove: () => {} } }
    },
    el: (id) => elements[id] || null,
    qsa: (sel, root) => sandbox._qsa(sel, root),
    _elements: elements,
    _makeEl: makeEl,
    _mockTrs: [],
    _qsa: (sel, root) => {
      if (sel.includes('tbody tr')) return sandbox._mockTrs || [];
      if (sel === 'td' && root) return root.children || [];
      return [];
    },
    fmtMoney: (n) => {
      const v = parseFloat(n) || 0;
      return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    fmtDate: (iso) => {
      if (!iso) return '-';
      const [y, m, d] = iso.split('-');
      return `${d}-${m}-${y}`;
    },
    todayISO: () => '2026-10-17',
    esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    getEditingRowClass: () => '',
    reprintReceipt: () => {},
    navigate: () => {},
    voidRecord: () => {},
    printGenericTable: (title, tbl) => { sandbox._lastPrinted = { title, html: tbl ? tbl.outerHTML : '' }; },
    downloadCSV: (rows, name) => { sandbox._lastDownloadedCSV = { rows, name }; },
    VIEW_RENDERERS: {},
    console
  };

  vm.createContext(sandbox);
  return sandbox;
}

async function runAllTests() {
  // -----------------------------------------------------------------------------
  // TEST GROUP 1: Cryptographic Invariants & Backup Verification
  // -----------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');

  const currentHash = crypto.createHash('sha256').update(html).digest('hex').toUpperCase();
  const currentSize = Buffer.byteLength(html, 'utf8');
  console.log(`Current HTML SHA-256: ${currentHash}`);
  console.log(`Current HTML Size:    ${currentSize} bytes`);

  const backupFiles = fs.readdirSync('D:/Temple/backups')
    .filter(f => f.startsWith('Temple_Accounts-1_PreStep33_84_DescriptionColumnLayout_Backup_'))
    .sort();

  assert(backupFiles.length > 0, 'GROUP-1 / T1.1', 'Pre-Step 33.84 byte-exact backup file exists in backups directory');

  if (backupFiles.length > 0) {
    const latestBackup = path.join('D:/Temple/backups', backupFiles[backupFiles.length - 1]);
    const backupContent = fs.readFileSync(latestBackup, 'utf8');
    const backupHash = crypto.createHash('sha256').update(backupContent).digest('hex').toUpperCase();
    const backupSize = Buffer.byteLength(backupContent, 'utf8');

    assert(backupHash === PRE_CHANGE_HASH, 'GROUP-1 / T1.2', `Backup SHA-256 matches pre-change baseline exactly (${backupHash})`);
    assert(backupSize === PRE_CHANGE_SIZE, 'GROUP-1 / T1.3', `Backup size matches pre-change baseline exactly (${backupSize} bytes)`);
  }

  assert(currentHash !== PRE_CHANGE_HASH, 'GROUP-1 / T1.4', 'Current file has been modified from pre-change baseline');

  // Verify CSS alignment and wrapping rules exist
  const cssNumericAlignment = html.includes('#receiptTable th:nth-child(8)')
    && html.includes('#receiptTable td:nth-child(8)')
    && html.includes('#cashBookTable th:nth-child(6)')
    && html.includes('#cashBookTable td:nth-child(6)')
    && html.includes('#cashBookTable th:nth-child(8)')
    && html.includes('#cashBookTable td:nth-child(8)')
    && html.includes('#ledgerTable th:nth-child(6)')
    && html.includes('#ledgerTable td:nth-child(6)')
    && html.includes('#ledgerTable th:nth-child(7)')
    && html.includes('#ledgerTable td:nth-child(7)');
  assert(cssNumericAlignment, 'GROUP-1 / T1.5', 'CSS tabular numeric alignment updated for shifted numeric columns in Receipts (8), Cash Book (6,7,8), and Ledger (6,7)');

  const cssWrappingRules = html.includes('#receiptTable th:nth-child(4)')
    && html.includes('#receiptTable td:nth-child(4)')
    && html.includes('#cashBookTable th:nth-child(3)')
    && html.includes('#cashBookTable td:nth-child(3)')
    && html.includes('#ledgerTable th:nth-child(4)')
    && html.includes('#ledgerTable td:nth-child(4)')
    && html.includes('white-space: normal;')
    && html.includes('word-break: break-word;');
  assert(cssWrappingRules, 'GROUP-1 / T1.6', 'CSS description column wrapping (white-space: normal; word-break: break-word) defined for all 3 tables');

  // -----------------------------------------------------------------------------
  // TEST GROUP 2: Receipts Table Structure & Row Rendering
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Receipts Table Structure & Row Rendering ---');

  {
    const sandbox = setupSandbox();

    // Extract VIEW_RENDERERS.receipts code
    const rcptStart = html.indexOf('VIEW_RENDERERS.receipts = async function');
    const rcptEnd = html.indexOf('function toggleBankField(sel, wrapId)');
    const rcptCode = html.slice(rcptStart, rcptEnd);

    // Setup mock receipts list
    const testReceipts = [
      {
        id: 'rcpt_1',
        receiptNo: 'R-101',
        date: '2026-10-01',
        name: 'Ananthakrishnan Nair',
        star: 'Rohini',
        description: 'Special Archana & Pushpanjali Offering',
        fund: 'General Temple Fund',
        category: 'Vazhipadu',
        paymentMode: 'Cash',
        amount: 450.00,
        voided: false
      },
      {
        id: 'rcpt_2',
        receiptNo: 'R-102',
        date: '2026-10-02',
        name: 'Devotee Without Description',
        star: '',
        description: '',
        fund: 'General Temple Fund',
        category: 'Donation',
        paymentMode: 'Cash',
        amount: 1000.00,
        voided: false
      },
      {
        id: 'rcpt_3',
        receiptNo: 'R-103',
        date: '2026-10-03',
        name: 'Devotee Whitespace Description',
        star: 'Aswathi',
        description: '   ',
        fund: 'Annadanam Fund',
        category: 'Annadanam',
        paymentMode: 'Bank',
        amount: 5000.00,
        voided: false
      },
      {
        id: 'rcpt_4',
        receiptNo: 'R-104',
        date: '2026-10-04',
        name: 'Devotee Long Description',
        star: 'Makayiram',
        description: 'Sponsorship for 100 people Annadanam on Deepavali festival occasion with special payasam offering',
        fund: 'Annadanam Fund',
        category: 'Annadanam',
        paymentMode: 'Cash',
        amount: 15000.00,
        voided: false
      },
      {
        id: 'rcpt_5',
        receiptNo: 'R-105',
        date: '2026-10-05',
        name: 'Security Test Devotee',
        star: 'Thiruvonam',
        description: '<script>alert("XSS")</script><b onmouseover="eval()">Payload</b> & "quotes"',
        fund: 'General Temple Fund',
        category: 'Pooja',
        paymentMode: 'UPI',
        amount: 250.00,
        voided: false
      },
      {
        id: 'rcpt_6',
        receiptNo: 'P650',
        date: '2026-10-06',
        name: 'Physical Puja Devotee',
        star: 'Chithira',
        description: 'Physical Pooja Receipt Entry',
        fund: 'General Temple Fund',
        category: 'Pooja Income',
        paymentMode: 'Cash',
        amount: 300.00,
        physicalType: 'P',
        voided: false
      }
    ];

    sandbox.allReceipts = async () => testReceipts;
    sandbox.allFunds = async () => [{ name: 'General Temple Fund' }, { name: 'Annadanam Fund' }];
    sandbox.allIncomeCategories = async () => [{ name: 'Vazhipadu' }, { name: 'Donation' }, { name: 'Annadanam' }, { name: 'Pooja Income' }];
    sandbox.allBankAccounts = async () => [];
    sandbox.nextReceiptNo = async () => 'R-005';
    sandbox.optsFromNames = (arr) => (arr || []).map(x => `<option value="${x.name}">${x.name}</option>`).join('');
    sandbox.optSel = (val) => `<option value="${val}">${val}</option>`;
    sandbox.fsGetOneSafe = async () => null;
    sandbox.searchReceipts = null;

    vm.runInContext(rcptCode, sandbox);

    // Render Receipts View
    const renderedHtml = await sandbox.VIEW_RENDERERS.receipts();

    // Check Table Headers
    const theadMatch = renderedHtml.match(/<table id="receiptTable"[^>]*>[\s\S]*?<thead>\s*<tr>([\s\S]*?)<\/tr>\s*<\/thead>/);
    assert(!!theadMatch, 'GROUP-2 / T2.1', 'Receipts table thead found');

    const headers = [...theadMatch[1].matchAll(/<th>(.*?)<\/th>/g)].map(m => m[1]);
    const expectedReceiptHeaders = ['Receipt No', 'Date', 'Name', 'Description', 'Fund', 'Category', 'Mode', 'Amount', 'Status', 'Actions'];
    assert(JSON.stringify(headers) === JSON.stringify(expectedReceiptHeaders), 'GROUP-2 / T2.2', `Receipts table has exactly 10 columns: [${headers.join(', ')}]`);

    // Parse tbody rows
    const tbodyMatch = renderedHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const rowHtmls = tbodyMatch[1].split('</tr>').filter(s => s.trim().startsWith('<tr'));

    // Test Row 1: Non-empty description
    const row1Cells = [...rowHtmls[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row1Cells.length === 10, 'GROUP-2 / T2.3', `Receipt row 1 has 10 cells (got ${row1Cells.length})`);
    assert(row1Cells[2].includes('Ananthakrishnan Nair') && row1Cells[2].includes('(Rohini)'), 'GROUP-2 / T2.4', 'Name cell contains devotee name and star');
    assert(!row1Cells[2].includes('Special Archana'), 'GROUP-2 / T2.5', 'Name cell does NOT contain description subtitle');
    assert(row1Cells[3] === 'Special Archana &amp; Pushpanjali Offering', 'GROUP-2 / T2.6', 'Description cell (col 4) contains safely escaped description text');
    assert(row1Cells[7] === '₹450.00', 'GROUP-2 / T2.7', 'Amount cell (col 8) contains correctly formatted amount ₹450.00');

    // Test Row 2: Empty description
    const row2Cells = [...rowHtmls[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row2Cells[3] === '', 'GROUP-2 / T2.8', 'Receipt with empty description renders genuinely blank Description cell (<td></td>)');
    assert(!row2Cells[2].includes('<div style="font-size:11px'), 'GROUP-2 / T2.9', 'Receipt with empty description has no subtitle div under name');

    // Test Row 3: Whitespace description
    const row3Cells = [...rowHtmls[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row3Cells[3] === '', 'GROUP-2 / T2.10', 'Receipt with whitespace-only description renders genuinely blank Description cell');

    // Test Row 4: Long description
    const row4Cells = [...rowHtmls[3].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row4Cells[3].includes('Sponsorship for 100 people Annadanam'), 'GROUP-2 / T2.11', 'Long description rendered completely in Description cell');
    assert(!row4Cells[2].includes('Sponsorship'), 'GROUP-2 / T2.12', 'Long description is NOT duplicated in Name cell');

    // Test Row 5: HTML-like text
    const row5Cells = [...rowHtmls[4].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(!row5Cells[3].includes('<script>'), 'GROUP-2 / T2.13', 'HTML tags in description neutralized (no raw <script> in cell)');
    assert(row5Cells[3].includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'), 'GROUP-2 / T2.14', 'HTML tags safely escaped as text');
    assert(row5Cells[3].includes('&amp; &quot;quotes&quot;'), 'GROUP-2 / T2.15', 'Quotes and ampersands properly escaped');

    // Test Row 6: Physical receipt
    const row6Cells = [...rowHtmls[5].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row6Cells[0].includes('P650') && row6Cells[0].includes('PHYSICAL'), 'GROUP-2 / T2.16', 'Physical receipt badge and number rendered');
    assert(row6Cells[3] === 'Physical Pooja Receipt Entry', 'GROUP-2 / T2.17', 'Physical receipt description rendered in dedicated Description column');
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 3: Cash Book Structure, Accounting Semantics & DOM Rendering
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Cash Book Structure & DOM Rendering ---');

  {
    const sandbox = setupSandbox();

    // Extract Cash Book code block
    const cbStart = html.indexOf('function resolvePaymentType');
    const cbEnd = html.indexOf('VIEW_RENDERERS.bankbook =');
    const cbCode = html.slice(cbStart, cbEnd);

    const mockReceipts = [
      { receiptNo: 'R-201', date: '2026-04-05', name: 'Ramesh Kumar', description: 'Noolum Mala Offering', category: 'Vazhipadu', paymentMode: 'Cash', amount: 500, voided: false },
      { receiptNo: 'R-202', date: '2026-04-06', name: 'Suresh Pillai', description: '', category: 'Donation', paymentMode: 'Cash', amount: 2000, voided: false },
      { receiptNo: 'R-203', date: '2026-04-07', name: 'Mahesh Menon', description: '  Special Pooja  ', category: 'Vazhipadu', paymentMode: 'Cash', amount: 1500, voided: false },
      { receiptNo: 'R-204', date: '2026-04-08', name: 'Bank Devotee', description: 'Bank Transfer Receipt', category: 'Vazhipadu', paymentMode: 'Bank', amount: 3000, voided: false } // Should be excluded from cash book
    ];

    const mockPayments = [
      { voucherNo: 'V-101', date: '2026-04-06', paidTo: 'Temple Priest', description: 'Monthly Pooja Allowance', category: 'Pooja Expense', paymentMode: 'Cash', amount: 1200, voided: false },
      { voucherNo: 'V-102', date: '2026-04-09', paidTo: 'Electricity Board', description: '', category: 'Utilities', paymentMode: 'Cash', amount: 800, voided: false }
    ];

    const mockTransfers = [
      { date: '2026-04-07', fromAcc: 'Cash', toAcc: 'Bank', mode: 'Cash', amount: 1000, reason: 'Bank Deposit', voided: false }
    ];

    sandbox.activeReceipts = async () => mockReceipts;
    sandbox.activePayments = async () => mockPayments;
    sandbox.allTransfers = async () => mockTransfers;
    sandbox.allLoans = async () => [];
    sandbox.allChittyCollections = async () => [];
    sandbox.allChittyPayouts = async () => [];

    vm.runInContext(cbCode, sandbox);

    const cbRows = await sandbox.buildCashBookRows();
    const cbHtml = await sandbox.VIEW_RENDERERS.cashbook();

    // 1. Check buildCashBookRows output
    assert(cbRows.length === 6, 'GROUP-3 / T3.1', `Cash Book built exactly 6 active cash rows (got ${cbRows.length})`);

    // Row with description: R-201
    const r201Row = cbRows.find(r => r.particulars.includes('R-201'));
    assert(r201Row.particulars === 'Receipt R-201 - Ramesh Kumar', 'GROUP-3 / T3.2', 'Cash Book Particulars has NO description suffix (exact: "Receipt R-201 - Ramesh Kumar")');
    assert(r201Row.description === 'Noolum Mala Offering', 'GROUP-3 / T3.3', 'Cash Book row object has separate description field ("Noolum Mala Offering")');

    // Row without description: R-202
    const r202Row = cbRows.find(r => r.particulars.includes('R-202'));
    assert(r202Row.particulars === 'Receipt R-202 - Suresh Pillai', 'GROUP-3 / T3.4', 'Cash Book Particulars without description has clean format');
    assert(r202Row.description === '', 'GROUP-3 / T3.5', 'Cash Book row without description has empty description string');

    // Running balance check
    // Opening: 50,000
    // 04-05: +500 (R-201) -> 50,500
    // 04-06: -1200 (V-101) -> 49,300
    // 04-06: +2000 (R-202) -> 51,300
    // 04-07: +1500 (R-203) -> 52,800
    // 04-07: -1000 (Transfer) -> 51,800
    // 04-09: -800 (V-102) -> 51,000
    const finalRow = cbRows[cbRows.length - 1];
    assert(finalRow.balance === 51000, 'GROUP-3 / T3.6', `Cash Book running balance mathematically exact (₹51,000.00, got ${finalRow.balance})`);

    // 2. Check Table Headers in Cash Book HTML
    const cbTheadMatch = cbHtml.match(/<table id="cashBookTable"[^>]*>[\s\S]*?<thead>\s*<tr>([\s\S]*?)<\/tr>\s*<\/thead>/);
    assert(!!cbTheadMatch, 'GROUP-3 / T3.7', 'Cash Book thead found');

    const cbHeaders = [...cbTheadMatch[1].matchAll(/<th>(.*?)<\/th>/g)].map(m => m[1]);
    const expectedCbHeaders = ['Date', 'Particulars', 'Description', 'Category', 'Payment Type', 'Receipt', 'Payment', 'Balance'];
    assert(JSON.stringify(cbHeaders) === JSON.stringify(expectedCbHeaders), 'GROUP-3 / T3.8', `Cash Book table has exactly 8 columns: [${cbHeaders.join(', ')}]`);

    // 3. Check Opening Balance row
    const obMatch = cbHtml.match(/<tr data-category="Opening Balance">([\s\S]*?)<\/tr>/);
    const obCells = [...obMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(obCells.length === 8, 'GROUP-3 / T3.9', `Cash Book Opening Balance row has exactly 8 columns (got ${obCells.length})`);
    assert(obCells[1].includes('Opening Balance') && obCells[2] === '', 'GROUP-3 / T3.10', 'Opening Balance row Description cell is blank (<td></td>)');
    assert(obCells[7] === '₹50,000.00', 'GROUP-3 / T3.11', 'Opening Balance amount intact in column 8');

    // 4. Check Data Rows
    const cbTbodyMatch = cbHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const cbRowHtmls = cbTbodyMatch[1].split('</tr>').filter(s => s.trim().startsWith('<tr') && !s.includes('Opening Balance'));
    assert(cbRowHtmls.length === 6, 'GROUP-3 / T3.12', `Rendered 6 data rows in Cash Book tbody`);

    // Verify first data row cells
    const firstDataCells = [...cbRowHtmls[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(firstDataCells.length === 8, 'GROUP-3 / T3.13', `Cash Book data row has exactly 8 cells`);
    assert(firstDataCells[1] === 'Receipt R-201 - Ramesh Kumar', 'GROUP-3 / T3.14', 'Data row Particulars cell has NO em-dash or description');
    assert(firstDataCells[2] === 'Noolum Mala Offering', 'GROUP-3 / T3.15', 'Data row Description cell (col 3) has receipt description');
    assert(firstDataCells[5] === '₹500.00', 'GROUP-3 / T3.16', 'Receipt column (col 6) has ₹500.00');
    assert(firstDataCells[6] === '-', 'GROUP-3 / T3.17', 'Payment column (col 7) has "-"');
    assert(firstDataCells[7] === '₹50,500.00', 'GROUP-3 / T3.18', 'Balance column (col 8) has ₹50,500.00');

    // 5. Check Footer Totals Row
    const cbTfootMatch = cbHtml.match(/<tfoot id="cashBookTFoot">[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/tfoot>/);
    assert(!!cbTfootMatch, 'GROUP-3 / T3.19', 'Cash Book tfoot found');
    const tfootCells = [...cbTfootMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(tfootCells.length === 8, 'GROUP-3 / T3.20', `Cash Book totals row has exactly 8 cells (got ${tfootCells.length})`);
    assert(tfootCells[0].includes('TOTAL'), 'GROUP-3 / T3.21', 'Totals row cell 0 is TOTAL');
    assert(tfootCells[5].includes('₹4,000.00'), 'GROUP-3 / T3.22', 'Total Receipts: ₹4,000.00 (500 + 2000 + 1500)');
    assert(tfootCells[6].includes('₹3,000.00'), 'GROUP-3 / T3.23', 'Total Payments: ₹3,000.00 (1200 + 800 + 1000)');

    // 6. Check CSV Export
    sandbox._elements.cashBookCategoryFilter = { value: '' };
    sandbox.exportCashBookCSV();
    const csvData = sandbox._lastDownloadedCSV;
    assert(!!csvData, 'GROUP-3 / T3.24', 'Cash Book exportCashBookCSV executed and triggered downloadCSV');
    assert(JSON.stringify(csvData.rows[0]) === JSON.stringify(expectedCbHeaders), 'GROUP-3 / T3.25', 'CSV export header contains exactly 8 columns matching table schema');

    // Check each row in CSV has 8 items
    const allRows8Cols = csvData.rows.every((r, idx) => r.length === 8);
    assert(allRows8Cols, 'GROUP-3 / T3.26', 'Every row in Cash Book CSV export has exactly 8 columns without value shifting');

    const csvR201 = csvData.rows.find(r => r[1] && r[1].includes('R-201'));
    assert(csvR201[1] === 'Receipt R-201 - Ramesh Kumar', 'GROUP-3 / T3.27', 'CSV row Particulars is clean without description suffix');
    assert(csvR201[2] === 'Noolum Mala Offering', 'GROUP-3 / T3.28', 'CSV row Description column has "Noolum Mala Offering"');
    assert(csvR201[5] === '₹500.00', 'GROUP-3 / T3.29', 'CSV row Receipt column preserves ₹500.00 at index 5');
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 4: General Ledger Structure, Totals & PDF Export
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: General Ledger Structure & Totals Recalculation ---');

  {
    const sandbox = setupSandbox();

    // Extract Ledger code block
    const ldgStart = html.indexOf('/* ===================== LEDGER ===================== */');
    const ldgEnd = html.indexOf('/* ===================== FUND TRANSFERS ===================== */');
    const ldgCode = html.slice(ldgStart, ldgEnd);

    const mockReceipts = [
      { receiptNo: 'R-301', date: '2026-05-01', name: 'Devotee Alpha', description: 'Maha Ganapathi Homam', category: 'Vazhipadu', fund: 'General Fund', amount: 2500.00 },
      { receiptNo: 'R-302', date: '2026-05-03', name: 'Devotee Beta', description: '', category: 'Donation', fund: 'Punarudharanam Fund', amount: 50000.00 },
      { receiptNo: 'R-303', date: '2026-05-05', name: 'Security Devotee', description: '<b>Special</b> & "Safe"', category: 'Vazhipadu', fund: 'General Fund', amount: 1500.00 }
    ];

    const mockPayments = [
      { voucherNo: 'V-201', date: '2026-05-02', paidTo: 'Priest Salary', description: 'Monthly Remuneration', category: 'Salary', fund: 'General Fund', amount: 12000.00 },
      { voucherNo: 'V-202', date: '2026-05-04', paidTo: 'Cement Supplier', description: '', category: 'Construction', fund: 'Punarudharanam Fund', amount: 18500.00 }
    ];

    sandbox.allFunds = async () => [{ name: 'General Fund' }, { name: 'Punarudharanam Fund' }];
    sandbox.activeReceipts = async () => mockReceipts;
    sandbox.activePayments = async () => mockPayments;

    vm.runInContext(ldgCode, sandbox);

    const ldgHtml = await sandbox.VIEW_RENDERERS.ledger();

    // 1. Check Table Headers in General Ledger HTML
    const ldgTheadMatch = ldgHtml.match(/<table id="ledgerTable"[^>]*>[\s\S]*?<thead>\s*<tr>([\s\S]*?)<\/tr>\s*<\/thead>/);
    assert(!!ldgTheadMatch, 'GROUP-4 / T4.1', 'General Ledger thead found');

    const ldgHeaders = [...ldgTheadMatch[1].matchAll(/<th>(.*?)<\/th>/g)].map(m => m[1]);
    const expectedLdgHeaders = ['Date', 'Voucher/Receipt No.', 'Particulars', 'Description', 'Fund', 'Debit', 'Credit'];
    assert(JSON.stringify(ldgHeaders) === JSON.stringify(expectedLdgHeaders), 'GROUP-4 / T4.2', `General Ledger table has exactly 7 columns: [${ldgHeaders.join(', ')}]`);

    // 2. Check Data Rows
    const ldgTbodyMatch = ldgHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const ldgRowHtmls = ldgTbodyMatch[1].split('</tr>').filter(s => s.trim().startsWith('<tr'));
    assert(ldgRowHtmls.length === 5, 'GROUP-4 / T4.3', `Rendered 5 sorted transactions in General Ledger`);

    // Row 1: R-301 (Receipt with description)
    const row1Cells = [...ldgRowHtmls[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row1Cells.length === 7, 'GROUP-4 / T4.4', `Ledger row 1 has exactly 7 cells`);
    assert(row1Cells[2] === 'Devotee Alpha - Vazhipadu', 'GROUP-4 / T4.5', 'Ledger receipt Particulars has NO em-dash or description suffix');
    assert(row1Cells[3] === 'Maha Ganapathi Homam', 'GROUP-4 / T4.6', 'Ledger Description column (col 4) has "Maha Ganapathi Homam"');
    assert(row1Cells[4] === 'General Fund', 'GROUP-4 / T4.7', 'Ledger Fund column (col 5) has "General Fund"');
    assert(row1Cells[5] === '-', 'GROUP-4 / T4.8', 'Ledger Debit column (col 6) has "-"');
    assert(row1Cells[6] === '₹2,500.00', 'GROUP-4 / T4.9', 'Ledger Credit column (col 7) has "₹2,500.00"');

    // Row 2: V-201 (Payment with description)
    const row2Cells = [...ldgRowHtmls[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row2Cells[2] === 'Priest Salary - Salary', 'GROUP-4 / T4.10', 'Ledger payment Particulars has clean format');
    assert(row2Cells[3] === 'Monthly Remuneration', 'GROUP-4 / T4.11', 'Ledger payment Description rendered in Description column');
    assert(row2Cells[5] === '₹12,000.00', 'GROUP-4 / T4.12', 'Ledger payment Debit in col 6: ₹12,000.00');
    assert(row2Cells[6] === '-', 'GROUP-4 / T4.13', 'Ledger payment Credit in col 7: "-"');

    // Row 3: R-302 (Receipt without description)
    const row3Cells = [...ldgRowHtmls[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row3Cells[3] === '', 'GROUP-4 / T4.14', 'Ledger row without description renders genuinely blank Description cell (<td></td>)');

    // Row 5: Security test row (HTML escaping)
    const row5Cells = [...ldgRowHtmls[4].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(row5Cells[3] === '&lt;b&gt;Special&lt;/b&gt; &amp; &quot;Safe&quot;', 'GROUP-4 / T4.15', 'Ledger Description cell safely escapes HTML and quotes');

    // 3. Check Ledger Footer Totals Row
    const ldgTfootMatch = ldgHtml.match(/<tfoot id="ledgerTFoot">[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/tfoot>/);
    assert(!!ldgTfootMatch, 'GROUP-4 / T4.16', 'General Ledger tfoot found');
    const ldgTfootCells = [...ldgTfootMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    assert(ldgTfootCells.length === 7, 'GROUP-4 / T4.17', `General Ledger totals row has exactly 7 cells (got ${ldgTfootCells.length})`);
    assert(ldgTfootCells[2].includes('TOTAL'), 'GROUP-4 / T4.18', 'Totals label at cell 2');
    assert(ldgTfootCells[5].includes('₹30,500.00'), 'GROUP-4 / T4.19', 'Total Debit in col 6: ₹30,500.00 (12000 + 18500)');
    assert(ldgTfootCells[6].includes('₹54,000.00'), 'GROUP-4 / T4.20', 'Total Credit in col 7: ₹54,000.00 (2500 + 50000 + 1500)');

    // 4. Test updateLedgerTotals function with 7-column DOM fallback
    const mockDeb = { innerHTML: '' };
    const mockCrd = { innerHTML: '' };
    sandbox._elements.ledgerTotalDebit = mockDeb;
    sandbox._elements.ledgerTotalCredit = mockCrd;

    // Simulate DOM rows without dataset attributes to test index fallback (cols 5 and 6)
    sandbox._mockTrs = [
      {
        style: { display: '' },
        dataset: {},
        children: [
          { textContent: '01-05-2026' },
          { textContent: 'R-301' },
          { textContent: 'Devotee Alpha - Vazhipadu' },
          { textContent: 'Homam' },
          { textContent: 'General Fund' },
          { textContent: '-' },
          { textContent: '₹2,500.00' }
        ]
      },
      {
        style: { display: '' },
        dataset: {},
        children: [
          { textContent: '02-05-2026' },
          { textContent: 'V-201' },
          { textContent: 'Priest Salary - Salary' },
          { textContent: 'Remuneration' },
          { textContent: 'General Fund' },
          { textContent: '₹12,000.00' },
          { textContent: '-' }
        ]
      }
    ];

    const totals = sandbox.updateLedgerTotals();
    assert(totals.debit === 12000, 'GROUP-4 / T4.21', `updateLedgerTotals fallback reads Debit from column index 5 (expected 12000, got ${totals.debit})`);
    assert(totals.credit === 2500, 'GROUP-4 / T4.22', `updateLedgerTotals fallback reads Credit from column index 6 (expected 2500, got ${totals.credit})`);

    // 5. Test getFilteredLedgerRecords fallback from 7-column DOM
    sandbox.window._ledgerRows = null; // force fallback to DOM
    sandbox._elements.ledgerFrom = { value: '' };
    sandbox._elements.ledgerTo = { value: '' };
    sandbox._elements.ledgerFundFilter = { value: '' };

    const parsedRecords = sandbox.getFilteredLedgerRecords();
    assert(parsedRecords.length === 2, 'GROUP-4 / T4.23', 'getFilteredLedgerRecords parsed 2 rows from 7-column DOM');
    assert(parsedRecords[0].description === 'Homam', 'GROUP-4 / T4.24', 'getFilteredLedgerRecords extracted Description from tds[3]');
    assert(parsedRecords[0].fund === 'General Fund', 'GROUP-4 / T4.25', 'getFilteredLedgerRecords extracted Fund from tds[4]');
    assert(parsedRecords[0].credit === 2500 && parsedRecords[0].debit === 0, 'GROUP-4 / T4.26', 'getFilteredLedgerRecords extracted Credit=2500, Debit=0');
    assert(parsedRecords[1].debit === 12000 && parsedRecords[1].credit === 0, 'GROUP-4 / T4.27', 'getFilteredLedgerRecords extracted Debit=12000, Credit=0');

    // 6. Test exportLedgerCSV
    sandbox._mockTrs = [
      {
        style: { display: '' },
        children: [
          { textContent: '01-05-2026' },
          { textContent: 'R-301' },
          { textContent: 'Devotee Alpha - Vazhipadu' },
          { textContent: 'Maha Ganapathi Homam' },
          { textContent: 'General Fund' },
          { textContent: '-' },
          { textContent: '₹2,500.00' }
        ]
      }
    ];
    sandbox.exportLedgerCSV();
    const ledgerCsv = sandbox._lastDownloadedCSV;
    assert(!!ledgerCsv, 'GROUP-4 / T4.28', 'exportLedgerCSV executed and triggered downloadCSV');
    assert(JSON.stringify(ledgerCsv.rows[0]) === JSON.stringify(expectedLdgHeaders), 'GROUP-4 / T4.29', 'exportLedgerCSV header has 7 columns including Description');
    assert(ledgerCsv.rows[1].length === 7, 'GROUP-4 / T4.30', 'exportLedgerCSV data row has 7 columns');
    assert(ledgerCsv.rows[1][3] === 'Maha Ganapathi Homam', 'GROUP-4 / T4.31', 'exportLedgerCSV Description column populated');
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 5: Absence of Duplication & Master Invariant Verification
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Absence of Duplication & Master Invariants ---');

  {
    // 1. Verify no em-dash appending remains in buildCashBookRows or VIEW_RENDERERS.ledger
    const buildCbMatch = html.match(/particulars:\s*`Receipt \$\{r\.receiptNo\} - \$\{r\.name\}([^`]*)`/);
    assert(buildCbMatch && !buildCbMatch[1].includes('—'), 'GROUP-5 / T5.1', 'No em-dash description suffix in buildCashBookRows particulars');

    const ldgParticularsMatch = html.match(/particulars:\s*`\$\{r\.name\} - \$\{r\.category\}([^`]*)`/);
    assert(ldgParticularsMatch && !ldgParticularsMatch[1].includes('—'), 'GROUP-5 / T5.2', 'No em-dash description suffix in VIEW_RENDERERS.ledger particulars');

    // 2. Verify no secondary line div in Receipts table name cell
    const rcptNameCellMatch = html.match(/<td>\$\{esc\(r\.name\)\}\$\{r\.star \? ` <span style="font-size:11px;color:var\(--text-muted\);font-weight:normal;">\(\$\{esc\(r\.star\)\}\)<\/span>` : ''\}([^<]*)<\/td>/);
    assert(rcptNameCellMatch && !rcptNameCellMatch[1].includes('div'), 'GROUP-5 / T5.3', 'No description div underneath devotee name in Receipts table Name cell');

    // 3. Verify atomic billing transaction, fingerprint, and counter logic are untouched
    assert(html.includes('async function fsCreateBillingWithAccounting(') && html.includes('async function fsTransaction('), 'GROUP-5 / T5.4', 'fsCreateBillingWithAccounting and fsTransaction are intact and untouched');
    assert(html.includes('function computeReceiptFingerprint('), 'GROUP-5 / T5.5', 'computeReceiptFingerprint is intact and untouched');
    assert(html.includes('function fsCreateIndependentReceipt('), 'GROUP-5 / T5.6', 'fsCreateIndependentReceipt is intact and untouched');
    assert(html.includes('function fsCreatePhysicalReceipt('), 'GROUP-5 / T5.7', 'fsCreatePhysicalReceipt is intact and untouched');
  }

  // -----------------------------------------------------------------------------
  // SUMMARY & OUTPUT
  // -----------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`TOTAL TESTS:  ${totalTests}`);
  console.log(`PASSED:       ${passedTests}`);
  console.log(`FAILED:       ${failedTests}`);
  console.log('========================================================================\n');

  const resultsPath = path.resolve('D:/Temple/tests/step_33_84_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    step: '33.84',
    timestamp: new Date().toISOString(),
    preChangeHash: PRE_CHANGE_HASH,
    postChangeHash: currentHash,
    preChangeSize: PRE_CHANGE_SIZE,
    postChangeSize: currentSize,
    totalTests,
    passedTests,
    failedTests,
    details: testDetails
  }, null, 2), 'utf8');

  console.log(`Detailed test results written to: ${resultsPath}`);

  if (failedTests > 0) {
    console.error('\n❌ STEP 33.84 VERIFICATION FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL STEP 33.84 VERIFICATION TESTS PASSED SUCCESSFULLY.');
  }
}

runAllTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
