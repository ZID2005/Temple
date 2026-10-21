/**
 * tests/test_step_33_170_payment_description_mapping_suite.js
 * Comprehensive automated regression suite for:
 * STEP 33.170 — Fix Payment Description Mapping in Cash Book and Bank Book
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.170: PAYMENT DESCRIPTION MAPPING IN CASH & BANK BOOKS TEST SUITE');
console.log('='.repeat(80));

const HTML_FILE = path.resolve(__dirname, '../Temple_Accounts-1.html');
const BACKUP_FILE = path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_170_PaymentDescriptionMapping_Backup_20261021_151600.html');

const PRE_CHANGE_HASH = 'AD30A625B16AB0B908D413DED83D3E288298E12B94D2B80440CA0CE218357253';
const PRE_CHANGE_SIZE = 1236536;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testId, description, details = '') {
  totalTests++;
  const passed = !!condition;
  if (passed) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testId}: ${description}${details ? ' (' + details + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testId}: ${description}${details ? ' | ' + details : ''}`);
  }
  testResults.push({ id: testId, description, status: passed ? 'PASS' : 'FAIL', details });
}

// Read HTML content
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

// =========================================================================
// GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- GROUP 1: Cryptographic Invariants & Backup Verification ---');

assert(fs.existsSync(BACKUP_FILE), 'G1.1', 'Pre-change backup file exists on disk', BACKUP_FILE);

const backupBuf = fs.readFileSync(BACKUP_FILE);
const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();

assert(backupBuf.length === PRE_CHANGE_SIZE, 'G1.2', 'Backup size matches pre-change baseline byte-for-byte', `${backupBuf.length} bytes`);
assert(backupHash === PRE_CHANGE_HASH, 'G1.3', 'Backup SHA-256 matches pre-change baseline hash exactly', backupHash);

const postBuf = fs.readFileSync(HTML_FILE);
const postHash = crypto.createHash('sha256').update(postBuf).digest('hex').toUpperCase();

assert(postBuf.length > PRE_CHANGE_SIZE, 'G1.4', 'Post-change file has surgical additions', `Size: ${postBuf.length} (delta: +${postBuf.length - PRE_CHANGE_SIZE})`);
assert(postHash !== PRE_CHANGE_HASH, 'G1.5', 'Post-change hash updated', postHash);

// =========================================================================
// GROUP 2: Code Architecture & Function Verification
// =========================================================================
console.log('\n--- GROUP 2: Code Architecture & Helper Functions ---');

// Verify resolvePaymentDesc and resolveReceiptDesc exist
assert(htmlContent.includes('function resolvePaymentDesc(p)'), 'G2.1', 'resolvePaymentDesc helper function is declared');
assert(htmlContent.includes('function resolveReceiptDesc(r)'), 'G2.2', 'resolveReceiptDesc helper function is declared');

// Verify allPayments normalizes legacy desc/narration
assert(htmlContent.includes("p.description == null || String(p.description).trim() === ''") &&
       htmlContent.includes('p.desc || p.narration'), 'G2.3', 'allPayments data accessor normalizes legacy desc/narration fields');

// Verify VIEW_RENDERERS.payments edit pre-fill
assert(htmlContent.includes("editRec.description = String(editRec.desc || editRec.narration).trim()"), 'G2.4', 'VIEW_RENDERERS.payments pre-fills description from legacy fields when editing');

// Verify savePayment preserves prior description
assert(htmlContent.includes("if (rec.description === '' && fd.get('description') === null && prior)"), 'G2.5', 'savePayment safely preserves prior description if field was omitted in FormData');

// Verify fsGetOneSafe ID type coercion
assert(htmlContent.includes("Number(id)") && htmlContent.includes("String(id)") && htmlContent.includes("pmt_"), 'G2.6', 'fsGetOneSafe IDB lookup handles string vs numeric ID mismatches and prefixes');

// Verify fsUpdateRecordSafe targetId handling
assert(htmlContent.includes("targetId = (updates && updates.id !== undefined && updates.id !== null) ? updates.id : id"), 'G2.7', 'fsUpdateRecordSafe uses updates.id to update cache under canonical identifier');

// =========================================================================
// GROUP 3: In-Memory Sandbox Extraction & Setup
// =========================================================================
console.log('\n--- GROUP 3: In-Memory VM Sandbox Setup ---');

// Extract allPayments, helpers, buildCashBookRows, buildBankBookRows, filters, CSV exports
const allPaymentsSource = htmlContent.slice(
  htmlContent.indexOf('async function allPayments()'),
  htmlContent.indexOf('async function activeReceipts()')
);

const booksSource = htmlContent.substring(
  htmlContent.indexOf('/* ===================== CASH BOOK / BANK BOOK ===================== */'),
  htmlContent.indexOf('/* ===================== LEDGER ===================== */')
);

const repoSource = htmlContent.slice(
  htmlContent.indexOf('async function fsGetOneSafe(storeName, id)'),
  htmlContent.indexOf('async function fsDeleteRecordSafe(storeName, id)')
);

const mockSettings = {
  currencySymbol: '₹',
  startDate: '2026-04-01',
  openingCash: 50000,
  openingBank: 100000,
  templeName: 'Sree Bhagavathi Temple'
};

const idbStores = {
  payments: new Map(),
  receipts: new Map()
};

const sandbox = {
  window: {
    APP_SETTINGS: mockSettings,
    billingAllRecords: [
      { id: 'b_01', firestoreId: 'b_01', receiptNo: 'B-101', item: 'Neyyappam', quantity: 2, star: 'Rohini', description: 'Neyyappam special offering' }
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
  isBankMode: (m) => ['Bank', 'UPI', 'Cheque', 'Card', 'Online'].includes(m),
  getDeterministicDocPrefix: (store) => store === 'payments' ? 'pmt_' : (store === 'receipts' ? 'rcpt_' : ''),
  getOne: async (store, id) => idbStores[store] ? idbStores[store].get(id) || null : null,
  putRec: async (store, doc) => { if (idbStores[store]) idbStores[store].set(doc.id, doc); return doc; },
  fsGetAllSafe: async (store) => Array.from(idbStores[store] ? idbStores[store].values() : []),
  getCurrentFirebaseUser: () => ({ uid: 'test-admin-uid' }),
  getFirestoreDb: () => ({
    collection: (storeName) => ({
      doc: (docId) => ({
        get: async () => ({
          exists: true,
          data: () => idbStores[storeName] ? (idbStores[storeName].get(docId) || idbStores[storeName].get(parseInt(docId.replace(/\D/g, ''), 10)) || null) : null
        }),
        set: async (payload, opts) => {}
      }),
      where: () => ({
        limit: () => ({
          get: async () => ({ empty: true, docs: [] })
        })
      })
    })
  }),
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
  vm.runInContext(allPaymentsSource, sandbox);
  vm.runInContext(booksSource, sandbox);
  vm.runInContext(repoSource, sandbox);
  assert(true, 'G3.1', 'Extracted code segments executed cleanly in VM sandbox');
} catch (err) {
  assert(false, 'G3.1', 'Sandbox execution error: ' + err.message);
  process.exit(1);
}

// =========================================================================
// GROUP 4: Cash Book Payment Description Population & Formatting
// =========================================================================
console.log('\n--- GROUP 4: Cash Book Payment Description Population ---');

// Populate IDB stores with synthetic records
idbStores.payments.clear();
idbStores.receipts.clear();

// Synthetic payments
const mockPayments = [
  // 1. Cash payment with explicit description
  { id: 1, voucherNo: 'V-001', paidTo: 'Kerala Electricals', paymentMode: 'Cash', category: 'Electricity', amount: 4500, date: '2026-04-02', description: 'Temple sanctum LED spotlights and wiring repair', voided: false },
  // 2. Cash payment with legacy 'desc' field
  { id: 2, voucherNo: 'V-002', paidTo: 'Flower Supplier Ravi', paymentMode: 'Cash', category: 'Flower', amount: 800, date: '2026-04-03', desc: 'Jasmine garlands for Friday pooja', voided: false },
  // 3. Cash payment with empty description string
  { id: 3, voucherNo: 'V-003', paidTo: 'Cleaning Staff', paymentMode: 'Cash', category: 'Maintenance', amount: 1200, date: '2026-04-04', description: '', voided: false },
  // 4. Cash payment with null description
  { id: 4, voucherNo: 'V-004', paidTo: 'Sundry Store', paymentMode: 'Cash', category: 'Office Expense', amount: 350, date: '2026-04-05', description: null, voided: false },
  // 5. Cash payment with whitespace-only description
  { id: 5, voucherNo: 'V-005', paidTo: 'Tea Stall', paymentMode: 'Cash', category: 'Refreshment', amount: 150, date: '2026-04-06', description: '    ', voided: false },
  // 6. Bank payment (should NOT appear in Cash Book)
  { id: 6, voucherNo: 'V-006', paidTo: 'Roof Contractor', paymentMode: 'Bank', category: 'Construction', amount: 25000, date: '2026-04-07', description: 'Roof tiles replacement advance', voided: false },
  // 7. Voided cash payment (should NOT appear in Cash Book)
  { id: 7, voucherNo: 'V-007', paidTo: 'Mistake Vendor', paymentMode: 'Cash', category: 'Uncategorized', amount: 9999, date: '2026-04-02', description: 'Cancelled voucher', voided: true }
];

mockPayments.forEach(p => idbStores.payments.set(p.id, p));

// Synthetic receipts
const mockReceipts = [
  { id: 101, receiptNo: 'R-101', name: 'Devotee A', paymentMode: 'Cash', category: 'Vazhipadu', amount: 1000, date: '2026-04-02', description: 'Archana & Pushpanjali', voided: false },
  { id: 102, receiptNo: 'R-102', name: 'Devotee B', paymentMode: 'Cash', category: 'Donation', amount: 5000, date: '2026-04-03', description: '', voided: false }
];
mockReceipts.forEach(r => idbStores.receipts.set(r.id, r));

sandbox.activeReceipts = async () => mockReceipts.filter(r => !r.voided);
sandbox.activePayments = async () => mockPayments.filter(p => !p.voided);
sandbox.allTransfers = async () => [];
sandbox.activeTransfers = async () => [];
sandbox.allLoans = async () => [];
sandbox.allChittyCollections = async () => [];
sandbox.allChittyPayouts = async () => [];

(async () => {
  const cbRows = await sandbox.buildCashBookRows();
  assert(cbRows.length === 7, 'G4.1', `Cash Book built exactly 7 active cash transactions (found ${cbRows.length})`);

  // Find payments in cbRows
  const p1 = cbRows.find(r => r.particulars.includes('V-001'));
  assert(p1 !== undefined, 'G4.2', 'Payment V-001 present in Cash Book');
  assert(p1.description === 'Temple sanctum LED spotlights and wiring repair', 'G4.3', 'Payment V-001 description populated from payment.description', p1.description);
  assert(p1.particulars === 'Payment V-001 - Kerala Electricals', 'G4.4', 'Particulars column preserved separately without description suffix', p1.particulars);
  assert(p1.payment === 4500 && p1.receipt === 0, 'G4.5', 'Payment V-001 payment amount is 4500 and receipt is 0');

  const p2 = cbRows.find(r => r.particulars.includes('V-002'));
  assert(p2 !== undefined, 'G4.6', 'Payment V-002 (legacy desc field) present in Cash Book');
  assert(p2.description === 'Jasmine garlands for Friday pooja', 'G4.7', 'Payment V-002 description resolved from legacy desc field', p2.description);

  const p3 = cbRows.find(r => r.particulars.includes('V-003'));
  assert(p3 !== undefined, 'G4.8', 'Payment V-003 (empty string) present in Cash Book');
  assert(p3.description === '', 'G4.9', 'Payment V-003 description is empty string', `"${p3.description}"`);

  const p4 = cbRows.find(r => r.particulars.includes('V-004'));
  assert(p4 !== undefined, 'G4.10', 'Payment V-004 (null description) present in Cash Book');
  assert(p4.description === '', 'G4.11', 'Payment V-004 description is empty string', `"${p4.description}"`);

  const p5 = cbRows.find(r => r.particulars.includes('V-005'));
  assert(p5 !== undefined, 'G4.12', 'Payment V-005 (whitespace-only description) present in Cash Book');
  assert(p5.description === '', 'G4.13', 'Payment V-005 description normalized to empty string', `"${p5.description}"`);

  // Verify bank payment excluded
  const p6 = cbRows.find(r => r.particulars.includes('V-006'));
  assert(p6 === undefined, 'G4.14', 'Bank payment V-006 is excluded from Cash Book');

  // Verify voided payment excluded
  const p7 = cbRows.find(r => r.particulars.includes('V-007'));
  assert(p7 === undefined, 'G4.15', 'Voided payment V-007 is excluded from Cash Book');

  // Verify Cash Book HTML renderer
  const cbHtml = await sandbox.VIEW_RENDERERS.cashbook();
  assert(cbHtml.includes('Temple sanctum LED spotlights and wiring repair'), 'G4.16', 'Cash Book HTML contains rendered payment description');
  assert(cbHtml.includes('Jasmine garlands for Friday pooja'), 'G4.17', 'Cash Book HTML contains rendered legacy desc payment description');

  // Verify opening balance row has <td></td> (empty cell) as required by Step 33.84
  assert(cbHtml.includes('<td><i>Opening Balance</i></td><td></td><td>Opening Balance</td>'), 'G4.18', 'Cash Book Opening Balance row preserves empty <td></td> for Description');

  // Verify data row with empty description renders '—'
  assert(cbHtml.includes('<td>Payment V-003 - Cleaning Staff</td><td>—</td>'), 'G4.19', 'Cash Book data row with empty description renders "—"');
  assert(cbHtml.includes('<td>Payment V-004 - Sundry Store</td><td>—</td>'), 'G4.20', 'Cash Book data row with null description renders "—"');
  assert(cbHtml.includes('<td>Payment V-005 - Tea Stall</td><td>—</td>'), 'G4.21', 'Cash Book data row with whitespace description renders "—"');

  // Verify receipt with empty description also renders '—'
  assert(cbHtml.includes('<td>Receipt R-102 - Devotee B</td><td>—</td>'), 'G4.22', 'Cash Book receipt row with empty description renders "—"');

  // =========================================================================
  // GROUP 5: Bank Book Payment Description Population & Formatting
  // =========================================================================
  console.log('\n--- GROUP 5: Bank Book Payment Description Population ---');

  const mockBankPayments = [
    // 1. Bank payment with explicit description
    { id: 21, voucherNo: 'V-021', paidTo: 'Generator Diesel Supplies', paymentMode: 'Bank', category: 'Generator', amount: 12000, date: '2026-04-02', description: '500L diesel for festival generator backup', voided: false },
    // 2. UPI payment with explicit description
    { id: 22, voucherNo: 'V-022', paidTo: 'Audio Systems Rental', paymentMode: 'UPI', category: 'Festival', amount: 8500, date: '2026-04-03', description: 'Stage microphone & speaker setup for Utsavam', voided: false },
    // 3. Bank payment with legacy 'narration' field
    { id: 23, voucherNo: 'V-023', paidTo: 'Heritage Architect', paymentMode: 'Bank', category: 'Renovation', amount: 35000, date: '2026-04-04', narration: 'Chuttu-ambalam renovation structural survey', voided: false },
    // 4. Bank payment with empty description
    { id: 24, voucherNo: 'V-024', paidTo: 'Water Authority', paymentMode: 'Bank', category: 'Utilities', amount: 2100, date: '2026-04-05', description: '', voided: false },
    // 5. Cash payment (should NOT appear in Bank Book)
    { id: 25, voucherNo: 'V-025', paidTo: 'Local Carpenter', paymentMode: 'Cash', category: 'Repairs', amount: 500, date: '2026-04-06', description: 'Door latch repair', voided: false },
    // 6. Voided bank payment (should NOT appear in Bank Book)
    { id: 26, voucherNo: 'V-026', paidTo: 'Voided Contractor', paymentMode: 'Bank', category: 'Construction', amount: 99999, date: '2026-04-07', description: 'Voided bank voucher', voided: true }
  ];

  const mockBankReceipts = [
    { id: 201, receiptNo: 'R-201', name: 'Devotee NRI', paymentMode: 'Bank', category: 'Donation', amount: 50000, date: '2026-04-02', description: 'Gold kavacham sponsorship', voided: false },
    { id: 202, receiptNo: 'R-202', name: 'Devotee Local', paymentMode: 'UPI', category: 'Vazhipadu', amount: 1500, date: '2026-04-03', description: '', voided: false },
    { id: 203, receiptNo: 'R-203', name: 'Devotee Billing', paymentMode: 'UPI', category: 'Vazhipadu', amount: 300, date: '2026-04-04', source: 'billing', billingFirestoreId: 'b_01', voided: false }
  ];

  sandbox.activeReceipts = async () => mockBankReceipts.filter(r => !r.voided);
  sandbox.activePayments = async () => mockBankPayments.filter(p => !p.voided);

  const bbRows = await sandbox.buildBankBookRows();
  assert(bbRows.length === 7, 'G5.1', `Bank Book built exactly 7 active bank transactions (found ${bbRows.length})`);

  const bp1 = bbRows.find(r => r.particulars.includes('V-021'));
  assert(bp1 !== undefined, 'G5.2', 'Bank Payment V-021 present in Bank Book');
  assert(bp1.description === '500L diesel for festival generator backup', 'G5.3', 'Payment V-021 description populated from payment.description', bp1.description);
  assert(bp1.withdrawal === 12000 && bp1.deposit === 0, 'G5.4', 'Payment V-021 withdrawal amount is 12000 and deposit is 0');

  const bp2 = bbRows.find(r => r.particulars.includes('V-022'));
  assert(bp2 !== undefined, 'G5.5', 'UPI Payment V-022 present in Bank Book');
  assert(bp2.description === 'Stage microphone & speaker setup for Utsavam', 'G5.6', 'UPI Payment V-022 description populated correctly', bp2.description);

  const bp3 = bbRows.find(r => r.particulars.includes('V-023'));
  assert(bp3 !== undefined, 'G5.7', 'Bank Payment V-023 (legacy narration) present in Bank Book');
  assert(bp3 && bp3.description === 'Chuttu-ambalam renovation structural survey', 'G5.8', 'Bank Payment V-023 description resolved from narration', bp3 ? bp3.description : '');

  const bp4 = bbRows.find(r => r.particulars.includes('V-024'));
  assert(bp4 !== undefined, 'G5.9', 'Bank Payment V-024 (empty description) present in Bank Book');
  assert(bp4.description === '', 'G5.10', 'Bank Payment V-024 description is empty string', `"${bp4.description}"`);

  // Cash payment excluded
  const bp5 = bbRows.find(r => r.particulars.includes('V-025'));
  assert(bp5 === undefined, 'G5.11', 'Cash payment V-025 is strictly excluded from Bank Book');

  // Voided payment excluded
  const bp6 = bbRows.find(r => r.particulars.includes('V-026'));
  assert(bp6 === undefined, 'G5.12', 'Voided bank payment V-026 is strictly excluded from Bank Book');

  // Verify Bank Book HTML renderer
  const bbHtml = await sandbox.VIEW_RENDERERS.bankbook();
  assert(bbHtml.includes('500L diesel for festival generator backup'), 'G5.13', 'Bank Book HTML contains rendered payment description');
  assert(bbHtml.includes('Stage microphone &amp; speaker setup for Utsavam'), 'G5.14', 'Bank Book HTML contains safely escaped UPI payment description');
  assert(bbHtml.includes('Chuttu-ambalam renovation structural survey'), 'G5.15', 'Bank Book HTML contains rendered legacy narration description');

  // Verify opening balance row has '—'
  assert(bbHtml.includes('<td><i>Opening Balance</i></td><td>—</td><td>-</td><td>-</td>'), 'G5.16', 'Bank Book Opening Balance row renders em-dash "—" for Description');

  // Verify data row with empty description renders '—'
  assert(bbHtml.includes('<td>Payment V-024 - Water Authority (Bank)</td><td>—</td>'), 'G5.17', 'Bank Book payment row with empty description renders "—"');

  // Verify billing-linked receipt resolves description
  assert(bbHtml.includes('Neyyappam special offering'), 'G5.18', 'Bank Book billing-linked receipt resolves description from billing table');

  // =========================================================================
  // GROUP 6: Payment Editing, Refresh & Cache Consistency
  // =========================================================================
  console.log('\n--- GROUP 6: Payment Editing, Refresh & Cache Consistency ---');

  // 1. Test fsGetOneSafe type coercion
  idbStores.payments.set(100, { id: 100, voucherNo: 'V-100', description: 'Original Description 100' });
  const fetchedByNum = await sandbox.fsGetOneSafe('payments', 100);
  assert(fetchedByNum && fetchedByNum.description === 'Original Description 100', 'G6.1', 'fsGetOneSafe retrieves record when queried with numeric ID (100)');

  const fetchedByStr = await sandbox.fsGetOneSafe('payments', '100');
  assert(fetchedByStr && fetchedByStr.description === 'Original Description 100', 'G6.2', 'fsGetOneSafe retrieves record when queried with string ID ("100")');

  const fetchedByPrefix = await sandbox.fsGetOneSafe('payments', 'pmt_100');
  assert(fetchedByPrefix && fetchedByPrefix.description === 'Original Description 100', 'G6.3', 'fsGetOneSafe retrieves record when queried with prefixed ID ("pmt_100")');

  // 2. Test fsUpdateRecordSafe cache write
  await sandbox.fsUpdateRecordSafe('payments', 'pmt_100', { id: 100, description: 'Updated Description 100' });
  const updatedRec = await sandbox.fsGetOneSafe('payments', 100);
  assert(updatedRec && updatedRec.description === 'Updated Description 100', 'G6.4', 'fsUpdateRecordSafe updates cache and persists under canonical numeric ID');

  // 3. Test edit payment updates Cash Book and Bank Book after refresh
  // Change V-001 description and re-render
  sandbox.activeReceipts = async () => mockReceipts.filter(r => !r.voided);
  sandbox.activePayments = async () => mockPayments.filter(p => !p.voided);
  const p1Record = mockPayments.find(p => p.id === 1);
  p1Record.description = 'REVISED: Sanctum decorative chandelier wiring';
  const refreshedCbRows = await sandbox.buildCashBookRows();
  const refreshedP1 = refreshedCbRows.find(r => r.particulars.includes('V-001'));
  assert(refreshedP1 && refreshedP1.description === 'REVISED: Sanctum decorative chandelier wiring', 'G6.5', 'Cash Book reflects updated payment description after edit and refresh');

  const refreshedCbHtml = await sandbox.VIEW_RENDERERS.cashbook();
  assert(refreshedCbHtml.includes('REVISED: Sanctum decorative chandelier wiring'), 'G6.6', 'Cash Book HTML contains revised payment description');

  // Change Bank payment V-021 description and re-render
  sandbox.activeReceipts = async () => mockBankReceipts.filter(r => !r.voided);
  sandbox.activePayments = async () => mockBankPayments.filter(p => !p.voided);
  const bp1Record = mockBankPayments.find(p => p.id === 21);
  bp1Record.description = 'REVISED: Generator bulk fuel delivery - Invoice 9901';
  const refreshedBbRows = await sandbox.buildBankBookRows();
  const refreshedBp1 = refreshedBbRows.find(r => r.particulars.includes('V-021'));
  assert(refreshedBp1 && refreshedBp1.description === 'REVISED: Generator bulk fuel delivery - Invoice 9901', 'G6.7', 'Bank Book reflects updated payment description after edit and refresh');

  const refreshedBbHtml = await sandbox.VIEW_RENDERERS.bankbook();
  assert(refreshedBbHtml.includes('REVISED: Generator bulk fuel delivery - Invoice 9901'), 'G6.8', 'Bank Book HTML contains revised payment description');

  // =========================================================================
  // GROUP 7: Filters, Balances, CSV Export & Invariants
  // =========================================================================
  console.log('\n--- GROUP 7: Filters, Balances, CSV Export & Invariants ---');

  // Test Cash Book running balance continuity
  let runningCbBal = mockSettings.openingCash;
  let cbBalContinuity = true;
  refreshedCbRows.forEach(r => {
    runningCbBal += (r.receipt - r.payment);
    if (Math.abs(r.balance - runningCbBal) > 0.001) cbBalContinuity = false;
  });
  assert(cbBalContinuity, 'G7.1', 'Cash Book running balance continuity holds 100% across all rows');

  // Test Bank Book running balance continuity
  let runningBbBal = mockSettings.openingBank;
  let bbBalContinuity = true;
  refreshedBbRows.forEach(r => {
    runningBbBal += (r.deposit - r.withdrawal);
    if (Math.abs(r.balance - runningBbBal) > 0.001) bbBalContinuity = false;
  });
  assert(bbBalContinuity, 'G7.2', 'Bank Book running balance continuity holds 100% across all rows');

  // Test CSV export for Cash Book
  sandbox.exportCashBookCSV();
  const cbCsv = sandbox._lastCSV;
  assert(cbCsv && cbCsv.name === 'CashBook', 'G7.3', 'exportCashBookCSV triggered downloadCSV');
  assert(cbCsv.rows[0].length === 8, 'G7.4', 'Cash Book CSV has exactly 8 columns (Date, Particulars, Description, Category, Payment Type, Receipt, Payment, Balance)');
  assert(cbCsv.rows[0][2] === 'Description', 'G7.5', 'Cash Book CSV column 3 is Description');

  const csvPaymentRow = cbCsv.rows.find(row => row[1].includes('V-001'));
  assert(csvPaymentRow && csvPaymentRow[2] === 'REVISED: Sanctum decorative chandelier wiring', 'G7.6', 'Cash Book CSV exports non-empty payment description', csvPaymentRow ? csvPaymentRow[2] : '');

  const csvEmptyPaymentRow = cbCsv.rows.find(row => row[1].includes('V-003'));
  assert(csvEmptyPaymentRow && csvEmptyPaymentRow[2] === '—', 'G7.7', 'Cash Book CSV exports "—" for empty payment description', csvEmptyPaymentRow ? csvEmptyPaymentRow[2] : '');

  // Test CSV export for Bank Book
  sandbox.exportBankBookCSV();
  const bbCsv = sandbox._lastCSV;
  assert(bbCsv && bbCsv.name === 'BankBook', 'G7.8', 'exportBankBookCSV triggered downloadCSV');
  assert(bbCsv.rows[0].length === 6, 'G7.9', 'Bank Book CSV has exactly 6 columns (Date, Particulars, Description, Deposit, Withdrawal, Balance)');
  assert(bbCsv.rows[0][2] === 'Description', 'G7.10', 'Bank Book CSV column 3 is Description');

  const csvBankPaymentRow = bbCsv.rows.find(row => row[1].includes('V-021'));
  assert(csvBankPaymentRow && csvBankPaymentRow[2] === 'REVISED: Generator bulk fuel delivery - Invoice 9901', 'G7.11', 'Bank Book CSV exports non-empty payment description', csvBankPaymentRow ? csvBankPaymentRow[2] : '');

  const csvBankEmptyRow = bbCsv.rows.find(row => row[1].includes('V-024'));
  assert(csvBankEmptyRow && csvBankEmptyRow[2] === '—', 'G7.12', 'Bank Book CSV exports "—" for empty payment description', csvBankEmptyRow ? csvBankEmptyRow[2] : '');

  // =========================================================================
  // GROUP 8: Security & XSS Escaping Verification
  // =========================================================================
  console.log('\n--- GROUP 8: Security & HTML Escaping Verification ---');

  const xssPayment = {
    id: 99,
    voucherNo: 'V-099',
    paidTo: '<script>alert("Vendor")</script>',
    paymentMode: 'Cash',
    category: 'Security',
    amount: 100,
    date: '2026-04-08',
    description: '<script>alert("XSS")</script> & "Dangerous" \'quotes\'',
    voided: false
  };

  mockPayments.push(xssPayment);
  idbStores.payments.set(99, xssPayment);
  sandbox.activeReceipts = async () => mockReceipts.filter(r => !r.voided);
  sandbox.activePayments = async () => mockPayments.filter(p => !p.voided);

  const xssCbHtml = await sandbox.VIEW_RENDERERS.cashbook();
  assert(!xssCbHtml.includes('<script>alert("XSS")</script>'), 'G8.1', 'Cash Book HTML does NOT contain unescaped script tag');
  assert(xssCbHtml.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &quot;Dangerous&quot; &#39;quotes&#39;'), 'G8.2', 'Cash Book safely escaped HTML special characters in payment description');

  const xssBankPayment = {
    id: 98,
    voucherNo: 'V-098',
    paidTo: 'Bank Hacker',
    paymentMode: 'Bank',
    category: 'Security',
    amount: 100,
    date: '2026-04-08',
    description: '<img src=x onerror=alert(1)> & "Bank" \'quote\'',
    voided: false
  };
  mockBankPayments.push(xssBankPayment);
  sandbox.activeReceipts = async () => mockBankReceipts.filter(r => !r.voided);
  sandbox.activePayments = async () => mockBankPayments.filter(p => !p.voided);

  const xssBbHtml = await sandbox.VIEW_RENDERERS.bankbook();
  assert(!xssBbHtml.includes('<img src=x onerror=alert(1)>'), 'G8.3', 'Bank Book HTML does NOT contain unescaped img tag');
  assert(xssBbHtml.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Bank&quot; &#39;quote&#39;'), 'G8.4', 'Bank Book safely escaped HTML special characters in payment description');

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
})();
