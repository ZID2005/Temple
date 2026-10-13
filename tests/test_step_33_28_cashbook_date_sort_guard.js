/**
 * test_step_33_28_cashbook_date_sort_guard.js
 * STEP 33.28: Focused Test Suite for Safe Cash Book Date-Sorting Guard
 *
 * Verifies:
 * 1. Static code guard at line ~11412 in Temple_Accounts-1.html.
 * 2. Unaltered configuration and rules files (hashes preserved).
 * 3. Comparator behavior:
 *    - Two records with valid dates.
 *    - A record with a missing date (undefined).
 *    - A record with a null date.
 *    - Multiple records with mixed valid and missing dates.
 * 4. VM execution of buildCashBookRows with legacy records lacking dates.
 * 5. Rendering of Cash Book view via VIEW_RENDERERS.cashbook when legacy records lack dates.
 * 6. Live browser execution via CDP on isolated emulator instance.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT_DIR, 'Temple_Accounts-1.html');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  PASS: [${testName}] ${details}`);
  } else {
    failedTests++;
    console.error(`  FAIL: [${testName}] ${details}`);
  }
}

function getFileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

console.log('================================================================');
console.log('STEP 33.28: SAFE CASH BOOK DATE-SORTING GUARD TEST SUITE');
console.log('================================================================\n');

// ----------------------------------------------------------------------
// SECTION 1: Static Architecture & File Hash Preservation
// ----------------------------------------------------------------------
console.log('--- SECTION 1: Static Source & Hash Verification ---');
const html = fs.readFileSync(HTML_FILE, 'utf8');

// 1.1 Verify guarded expression exists in HTML
const guardPattern = /rows\.sort\(\(a,\s*b\)\s*=>\s*String\(a\.date\s*\|\|\s*''\)\.localeCompare\(String\(b\.date\s*\|\|\s*''\)\)\);/;
assert(guardPattern.test(html), 'Static Guard Exists', 'Found String(a.date || \'\').localeCompare(String(b.date || \'\')) in HTML');

// 1.2 Verify unsafe expression is eliminated from buildCashBookRows
const buildCashBookMatch = html.match(/async function buildCashBookRows\(\)[\s\S]*?return rows\.map/);
assert(buildCashBookMatch !== null, 'buildCashBookRows Located', 'Extracted buildCashBookRows function body');
if (buildCashBookMatch) {
  const fnBody = buildCashBookMatch[0];
  const hasUnsafeSort = /rows\.sort\(\(a,\s*b\)\s*=>\s*a\.date\.localeCompare\(b\.date\)\)/.test(fnBody);
  assert(!hasUnsafeSort, 'Unsafe Sort Removed', 'No unsafe a.date.localeCompare(b.date) in buildCashBookRows');
}

// 1.3 Verify critical files are untouched
const EXPECTED_RULES_HASH = '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD';
const EXPECTED_CANDIDATE_HASH = 'B11D865A7A7D8FFE1435BBC9D115463DA5F6039830E5A9A9F33EBBFBD6F1728C';
const EXPECTED_FIREBASE_JSON_HASH = 'E87125F3EC6439A59BA44D80A6DCC46378A27A0644B0CDA30ABEAFD2EFB67E20';
const EXPECTED_EMULATOR_JSON_HASH = '75E395CD1E8D3DA12B65E812E172A070BBD6C78853EFA7A7B62E41620E288572';

assert(getFileHash(path.join(ROOT_DIR, 'firestore.rules')) === EXPECTED_RULES_HASH,
  'firestore.rules Untouched', 'Production rules hash preserved');
assert(getFileHash(path.join(ROOT_DIR, 'firestore.rules.candidate')) === EXPECTED_CANDIDATE_HASH,
  'firestore.rules.candidate Untouched', 'Candidate rules hash preserved');
assert(getFileHash(path.join(ROOT_DIR, 'firebase.json')) === EXPECTED_FIREBASE_JSON_HASH,
  'firebase.json Untouched', 'firebase.json hash preserved');
assert(getFileHash(path.join(ROOT_DIR, 'firebase.emulator.json')) === EXPECTED_EMULATOR_JSON_HASH,
  'firebase.emulator.json Untouched', 'firebase.emulator.json hash preserved');

// ----------------------------------------------------------------------
// SECTION 2: Focused Unit Tests on Date Sorting Guard
// ----------------------------------------------------------------------
console.log('\n--- SECTION 2: Comparator Logic Unit Tests ---');
const comparator = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));

// Test 2.1: Two records with valid dates
{
  const r1 = { id: 1, date: '2026-04-01', particulars: 'Receipt 1' };
  const r2 = { id: 2, date: '2026-04-05', particulars: 'Receipt 2' };
  const list = [r2, r1];
  list.sort(comparator);
  assert(list[0].id === 1 && list[1].id === 2,
    'Two Valid Dates', 'Chronological sorting preserved (2026-04-01 before 2026-04-05)');
}

// Test 2.2: A record with a missing date (undefined)
{
  const r1 = { id: 1, date: undefined, particulars: 'Legacy Missing Date' };
  const r2 = { id: 2, date: '2026-04-05', particulars: 'Valid Date' };
  let threw = false;
  try {
    const list = [r2, r1];
    list.sort(comparator);
    assert(list[0].id === 1 && list[1].id === 2,
      'Missing Date Record Handled', 'Undefined date treated as empty string, does not throw, sorts gracefully');
  } catch (e) {
    threw = true;
    assert(false, 'Missing Date Record Threw', e.message);
  }
}

// Test 2.3: A record with a null date
{
  const r1 = { id: 1, date: null, particulars: 'Legacy Null Date' };
  const r2 = { id: 2, date: '2026-04-05', particulars: 'Valid Date' };
  let threw = false;
  try {
    const list = [r2, r1];
    list.sort(comparator);
    assert(list[0].id === 1 && list[1].id === 2,
      'Null Date Record Handled', 'Null date treated as empty string, does not throw, sorts gracefully');
  } catch (e) {
    threw = true;
    assert(false, 'Null Date Record Threw', e.message);
  }
}

// Test 2.4: Multiple records with mixed valid and missing dates
{
  const records = [
    { id: 'v3', date: '2026-04-10' },
    { id: 'm1', date: undefined },
    { id: 'v1', date: '2026-04-01' },
    { id: 'n1', date: null },
    { id: 'e1', date: '' },
    { id: 'v2', date: '2026-04-05' }
  ];
  let threw = false;
  try {
    records.sort(comparator);
    const validPart = records.filter(r => r.date && r.date.length > 0).map(r => r.id);
    const missingPart = records.filter(r => !r.date).map(r => r.id);
    assert(validPart.join(',') === 'v1,v2,v3',
      'Mixed Valid & Missing Dates Order', 'Valid dates remain sorted chronologically (v1, v2, v3)');
    assert(missingPart.length === 3,
      'Mixed Empty Dates Partitioned', 'Missing/null/empty records all grouped safely without crashing');
  } catch (e) {
    assert(false, 'Mixed Dates Threw', e.message);
  }
}

// ----------------------------------------------------------------------
// SECTION 3: Isolated VM Simulation of buildCashBookRows & VIEW_RENDERERS.cashbook
// ----------------------------------------------------------------------
console.log('\n--- SECTION 3: Isolated VM buildCashBookRows & Renderer Execution ---');

const mockSettings = {
  templeName: 'Isolated Emulator Temple',
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingCash: 25000.00
};

const sandbox = {
  window: { APP_SETTINGS: mockSettings },
  document: {
    getElementById: (id) => sandbox._elements[id] || null,
    querySelectorAll: (sel) => []
  },
  fmtMoney: (n) => {
    const v = parseFloat(n) || 0;
    return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  fmtDate: (iso) => {
    if (!iso) return '-';
    const [y, m, d] = String(iso).split('-');
    return `${d}-${m}-${y}`;
  },
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  VIEW_RENDERERS: {},
  _elements: {},
  _cashBookRows: [],
  console
};

vm.createContext(sandbox);

// Extract helper functions, buildCashBookRows, and VIEW_RENDERERS.cashbook from HTML
const codeStart = html.indexOf('function resolvePaymentType');
const codeEnd = html.indexOf('VIEW_RENDERERS.bankbook =');
const cashBookCode = html.slice(codeStart, codeEnd);

try {
  vm.runInContext(cashBookCode, sandbox);
  assert(true, 'Cash Book Code Evaluated', 'Extracted Cash Book functions loaded into VM sandbox');
} catch (err) {
  assert(false, 'Cash Book Code Evaluation Failed', err.message);
}

// Test 3.1: buildCashBookRows with legacy records lacking dates
async function runVmCashBookTest() {
  // Inject mock active fetchers into sandbox
  sandbox.activeReceipts = async () => [
    { id: 1, date: '2026-04-02', receiptNo: 'R-001', name: 'Devotee A', paymentMode: 'Cash', amount: 1500, category: 'Vazhipadu', voided: false },
    { id: 2, date: undefined, receiptNo: 'R-002', name: 'Legacy Devotee No Date', paymentMode: 'Cash', amount: 500, category: 'Donation', voided: false }, // missing date
    { id: 3, date: null, receiptNo: 'R-003', name: 'Legacy Devotee Null Date', paymentMode: 'Cash', amount: 200, category: 'Vazhipadu', voided: false } // null date
  ];
  sandbox.activePayments = async () => [
    { id: 10, date: '2026-04-03', voucherNo: 'V-001', paidTo: 'Vendor X', paymentMode: 'Cash', amount: 400, category: 'Pooja Items', voided: false },
    { id: 11, date: undefined, voucherNo: 'V-002', paidTo: 'Legacy Vendor No Date', paymentMode: 'Cash', amount: 300, category: 'Electricity', voided: false } // missing date
  ];
  sandbox.activeTransfers = async () => [
    { id: 20, date: '2026-04-04', fromAcc: 'Cash', toAcc: 'Bank', mode: 'Cash Deposit', amount: 5000, voided: false },
    { id: 21, date: null, fromAcc: 'Bank', toAcc: 'Cash', mode: 'Cash Withdrawal', amount: 2000, voided: false } // null date
  ];
  sandbox.allLoans = async () => [
    { id: 30, date: undefined, person: 'Staff Y', paymentMode: 'Cash', loanReceived: 1000, repayment: 0, voided: false } // missing date
  ];
  sandbox.activeChittyCollections = async () => [
    { id: 40, date: '2026-04-01', memberName: 'Member 1', paymentMode: 'Cash', amountReceived: 1000, voided: false }
  ];
  sandbox.activeChittyPayouts = async () => [
    { id: 50, date: null, memberName: 'Member 2', paymentMode: 'Cash', amount: 3000, voided: false } // null date
  ];

  const rows = await vm.runInContext('buildCashBookRows()', sandbox);
  assert(Array.isArray(rows), 'buildCashBookRows Succeeded', `Returned ${rows.length} rows`);
  assert(rows.length === 10, 'All 10 Rows Preserved', 'All active cash receipts (3), payments (2), transfers (2), loans (1), and chitty records (2) included');

  // Verify running balances computed without NaN
  const allBalancesValid = rows.every(r => typeof r.balance === 'number' && !isNaN(r.balance));
  assert(allBalancesValid, 'Running Balances Valid', 'No NaN or calculation breaks in running balance');

  // Initial opening cash: 25000
  // Receipts: 1500 (R-001) + 500 (R-002) + 200 (R-003) + 2000 (Withdrawal) + 1000 (Loan) + 1000 (Chitty) = +6200
  // Payments: 400 (V-001) + 300 (V-002) + 5000 (Deposit) + 3000 (Chitty Payout) = -8700
  // Expected final balance = 25000 + 6200 - 8700 = 22500
  const finalBal = rows[rows.length - 1].balance;
  assert(finalBal === 22500, 'Final Running Balance Exact', `Expected ₹22,500.00, calculated: ₹${finalBal}`);

  // Test 3.2: VIEW_RENDERERS.cashbook rendering
  const htmlResult = await vm.runInContext('VIEW_RENDERERS.cashbook()', sandbox);
  assert(typeof htmlResult === 'string' && htmlResult.includes('Closing Cash Balance: ₹22,500.00'),
    'Cash Book View Rendered', 'Closing Cash Balance correctly displayed in rendered HTML');
  assert(htmlResult.includes('<table id="cashBookTable">'),
    'Cash Book Table Present', 'Table with id="cashBookTable" rendered successfully');
  assert(htmlResult.includes('All Categories'),
    'Category Filter Populated', 'Category filter dropdown present');
}

// ----------------------------------------------------------------------
// SECTION 4: Live Browser Execution in Isolated Emulator (CDP)
// ----------------------------------------------------------------------
async function runBrowserCdpTests() {
  console.log('\n--- SECTION 4: Live Browser Verification (CDP Port 9222) ---');

  let tabsRes;
  try {
    tabsRes = await fetch('http://127.0.0.1:9222/json');
  } catch (e) {
    console.log('  INFO: Chrome remote debugging port 9222 not reachable, skipping live CDP test.');
    return;
  }

  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) {
    console.log('  INFO: Temple_Accounts-1.html tab not found on port 9222, skipping live CDP test.');
    return;
  }

  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) reject(d.error);
      else resolve(d.result);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = msgId++;
    pending.set(curId, { resolve, reject });
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  const evaluate = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  };

  // 4.1 Verify buildCashBookRows in browser contains guard
  const fnStr = await evaluate('buildCashBookRows.toString()');
  assert(fnStr.includes("String(a.date || '').localeCompare(String(b.date || ''))"),
    'Browser Code Verified', 'Live browser has guarded String(a.date || \'\').localeCompare in memory');

  // Ensure window.APP_SETTINGS is populated
  await evaluate(`(async () => {
    if (!window.APP_SETTINGS) {
      window.APP_SETTINGS = {
        templeName: 'Isolated Emulator Temple',
        startDate: '2026-04-01',
        openingCash: 50000,
        currencySymbol: '₹'
      };
    }
  })()`);

  // 4.2 Test sorting in browser context with synthetic records lacking dates
  const browserTestResult = await evaluate(`(async () => {
    // Back up original fetchers
    const origReceipts = window.activeReceipts;
    const origPayments = window.activePayments;
    const origTransfers = window.activeTransfers;
    const origLoans = window.allLoans;
    const origCol = window.activeChittyCollections;
    const origPay = window.activeChittyPayouts;

    try {
      // Mock fetchers with records containing valid, undefined, null, and empty dates
      window.activeReceipts = async () => [
        { id: 101, date: '2026-04-05', receiptNo: 'R-TEST1', name: 'Browser User 1', paymentMode: 'Cash', amount: 100, category: 'Vazhipadu', voided: false },
        { id: 102, date: undefined, receiptNo: 'R-TEST2', name: 'Browser User No Date', paymentMode: 'Cash', amount: 200, category: 'Donation', voided: false },
        { id: 103, date: null, receiptNo: 'R-TEST3', name: 'Browser User Null Date', paymentMode: 'Cash', amount: 300, category: 'Vazhipadu', voided: false }
      ];
      window.activePayments = async () => [
        { id: 201, date: '2026-04-02', voucherNo: 'V-TEST1', paidTo: 'Browser Vendor', paymentMode: 'Cash', amount: 50, category: 'General', voided: false }
      ];
      window.activeTransfers = async () => [];
      window.allLoans = async () => [];
      window.activeChittyCollections = async () => [];
      window.activeChittyPayouts = async () => [];

      // Execute buildCashBookRows
      const rows = await buildCashBookRows();

      // Execute VIEW_RENDERERS.cashbook
      const renderedHtml = await VIEW_RENDERERS.cashbook();

      return {
        success: true,
        rowCount: rows.length,
        hasNoDate: rows.some(r => r.date === undefined),
        hasNullDate: rows.some(r => r.date === null),
        renderedValid: typeof renderedHtml === 'string' && renderedHtml.includes('Closing Cash Balance:')
      };
    } finally {
      // Restore original fetchers
      window.activeReceipts = origReceipts;
      window.activePayments = origPayments;
      window.activeTransfers = origTransfers;
      window.allLoans = origLoans;
      window.activeChittyCollections = origCol;
      window.activeChittyPayouts = origPay;
    }
  })()`);

  assert(browserTestResult.success === true,
    'Browser Execution Succeeded', 'buildCashBookRows resolved without error in live Chrome runtime');
  assert(browserTestResult.rowCount === 4,
    'Browser Row Count Exact', '4 synthetic rows (3 receipts + 1 payment) generated');
  assert(browserTestResult.hasNoDate && browserTestResult.hasNullDate,
    'Missing/Null Dates Processed in Browser', 'Both undefined and null date records were handled safely');
  assert(browserTestResult.renderedValid,
    'Browser Cash Book View Markup Generated', 'VIEW_RENDERERS.cashbook returned valid HTML table markup');

  ws.close();
}

// ----------------------------------------------------------------------
// Runner
// ----------------------------------------------------------------------
async function main() {
  await runVmCashBookTest();
  await runBrowserCdpTests();

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL ${totalTests})`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
