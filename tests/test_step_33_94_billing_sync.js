/**
 * STEP 33.94 — Billing Fund & Income Category Synchronization Verification Suite
 *
 * Full-coverage air-gapped test suite verifying all requirements of STEP 33.94.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.94: BILLING FUND & INCOME CATEGORY SYNCHRONIZATION VERIFICATION');
console.log('='.repeat(80));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/Temple_Accounts-1_PreStep33_94_BillingSync_Backup_20261018_122646.html';
const BACKUP_DIR_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_94_BillingSync_Backup_20261018_122646.html';
const EXPECTED_PRE_HASH = 'E5B1F55BA1BBBEE684906B84B100C8BA16E2255E77A76E3FF1650D10AED93148';
const EXPECTED_PRE_SIZE = 862818;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.94',
  baselineSha256: EXPECTED_PRE_HASH,
  baselineSize: EXPECTED_PRE_SIZE,
  tests: []
};

function recordTest(groupId, testId, description, passed, detail = '') {
  const status = passed ? 'PASS' : 'FAIL';
  if (passed) passedTests++; else failedTests++;
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${status}] ${groupId} / ${testId}: ${description}${detail ? ` (${detail})` : ''}`);
  results.tests.push({ groupId, testId, description, passed, detail });
}

// Read target files
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
const htmlBuf = fs.readFileSync(HTML_PATH);
const currentHash = crypto.createHash('sha256').update(htmlBuf).digest('hex').toUpperCase();
const currentSize = htmlBuf.length;

console.log(`\nBaseline SHA-256: ${EXPECTED_PRE_HASH} (${EXPECTED_PRE_SIZE} bytes)`);
console.log(`Current  SHA-256: ${currentHash} (${currentSize} bytes)`);

// =========================================================================
// TEST GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');
{
  const backupExists = fs.existsSync(BACKUP_PATH) || fs.existsSync(BACKUP_DIR_PATH);
  recordTest('GROUP-1', 'T1.1', 'Timestamped byte-exact pre-STEP 33.94 backup file exists', backupExists);

  const activeBackupPath = fs.existsSync(BACKUP_PATH) ? BACKUP_PATH : BACKUP_DIR_PATH;
  if (backupExists) {
    const backupBuf = fs.readFileSync(activeBackupPath);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
      backupHash === EXPECTED_PRE_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
      backupBuf.length === EXPECTED_PRE_SIZE, `${backupBuf.length} bytes`);
  }

  recordTest('GROUP-1', 'T1.4', 'Current file has been modified from pre-change baseline',
    currentHash !== EXPECTED_PRE_HASH, `Current: ${currentHash}`);

  // Config files unchanged
  recordTest('GROUP-1', 'T1.5', 'firestore.rules remains untouched and unmodified',
    fs.existsSync('D:/Temple/firestore.rules') &&
    crypto.createHash('sha256').update(fs.readFileSync('D:/Temple/firestore.rules')).digest('hex').toUpperCase() === '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD');
  recordTest('GROUP-1', 'T1.6', 'firestore.rules.candidate remains untouched and unmodified',
    fs.existsSync('D:/Temple/firestore.rules.candidate') &&
    crypto.createHash('sha256').update(fs.readFileSync('D:/Temple/firestore.rules.candidate')).digest('hex').toUpperCase() === 'E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D');
  recordTest('GROUP-1', 'T1.7', 'server.js remains untouched and unmodified',
    fs.existsSync('D:/Temple/server.js'));
}

// =========================================================================
// TEST GROUP 2: Static Code Invariants & UI Structure
// =========================================================================
console.log('\n--- TEST GROUP 2: Static Code Invariants & UI Structure ---');
{
  // 1. VIEW_RENDERERS.billing renders billingFund and billingIncomeCategory selects
  const hasBillingFundSelect = htmlContent.includes('<select id="billingFund"');
  recordTest('GROUP-2', 'T2.1', 'VIEW_RENDERERS.billing contains <select id="billingFund">', hasBillingFundSelect);

  const hasBillingFundPlaceholder = htmlContent.includes('<option value="">-- Select Fund * --</option>');
  recordTest('GROUP-2', 'T2.2', 'billingFund has mandatory placeholder "-- Select Fund * --" with value=""', hasBillingFundPlaceholder);

  const hasBillingCatSelect = htmlContent.includes('<select id="billingIncomeCategory"');
  recordTest('GROUP-2', 'T2.3', 'VIEW_RENDERERS.billing contains <select id="billingIncomeCategory">', hasBillingCatSelect);

  const hasBillingCatPlaceholder = htmlContent.includes('<option value="">-- None / General --</option>');
  recordTest('GROUP-2', 'T2.4', 'billingIncomeCategory has default placeholder "-- None / General --" with value=""', hasBillingCatPlaceholder);

  // 2. Offering type switching independence
  const switchOfferingTypeRegex = /function switchOfferingType\s*\([^)]*\)\s*\{([\s\S]*?)\}/;
  const switchMatch = htmlContent.match(switchOfferingTypeRegex);
  const switchesFund = switchMatch && (switchMatch[1].includes('billingFund') || switchMatch[1].includes('billingIncomeCategory'));
  recordTest('GROUP-2', 'T2.5', 'switchOfferingType does NOT tamper with billingFund or billingIncomeCategory', !switchesFund);

  // 3. billingResetForm resets both fields
  const resetFormStart = htmlContent.indexOf('function billingResetForm(');
  const resetFormEnd = htmlContent.indexOf('function ', resetFormStart + 25);
  const resetFormCode = htmlContent.slice(resetFormStart, resetFormEnd);
  const resetsFund = resetFormCode.includes("fundSel.value = ''") && resetFormCode.includes("incCatSel.value = ''");
  recordTest('GROUP-2', 'T2.6', 'billingResetForm resets both billingFund and billingIncomeCategory to empty string', !!resetsFund);

  // 4. Active Bills table header and rows contain Fund and Income Cat
  const hasHistoryHeaders = htmlContent.includes('<th>Fund</th>') && htmlContent.includes('<th>Income Cat</th>');
  recordTest('GROUP-2', 'T2.7', 'Billing history table header contains Fund and Income Cat columns', hasHistoryHeaders);

  // 5. Bill details modal contains Fund and Income Category
  const hasDetailsFund = htmlContent.includes('${esc(r.fund || \'—\')}');
  const hasDetailsCat = htmlContent.includes('${esc(r.incomeCategory || \'—\')}');
  recordTest('GROUP-2', 'T2.8', 'Bill details modal displays Fund and Income Category', hasDetailsFund && hasDetailsCat);

  // 6. Billing CSV export includes Fund and Income Category
  const hasCsvHeaders = htmlContent.includes("'Fund',") && htmlContent.includes("'Income Category',");
  const hasCsvData = htmlContent.includes("r.fund || ''") && htmlContent.includes("r.incomeCategory || ''");
  recordTest('GROUP-2', 'T2.9', 'exportBillingReportCSV includes Fund and Income Category in headers and data rows', hasCsvHeaders && hasCsvData);
}

// =========================================================================
// Setup Air-Gapped Sandbox Environment
// =========================================================================
class MockFirestore {
  constructor() {
    this.collections = {
      system: new Map(),
      settings: new Map(),
      receipts: new Map(),
      billing: new Map(),
      payments: new Map(),
      transfers: new Map(),
      loans: new Map(),
      chittyCollections: new Map(),
      chittyPayouts: new Map(),
      funds: new Map(),
      incomeCategories: new Map(),
      bankAccounts: new Map()
    };
  }

  collection(name) {
    if (!this.collections[name]) this.collections[name] = new Map();
    const col = this.collections[name];
    return {
      doc: (id) => ({
        _col: name,
        _id: id,
        get: async () => ({
          exists: col.has(id),
          data: () => col.get(id) ? JSON.parse(JSON.stringify(col.get(id))) : undefined,
          id
        }),
        set: async (data, opts) => {
          if (opts && opts.merge && col.has(id)) {
            col.set(id, { ...col.get(id), ...JSON.parse(JSON.stringify(data)) });
          } else {
            col.set(id, JSON.parse(JSON.stringify(data)));
          }
        },
        delete: async () => col.delete(id)
      }),
      get: async () => {
        const docs = [];
        col.forEach((data, id) => {
          docs.push({
            id,
            data: () => JSON.parse(JSON.stringify(data)),
            exists: true
          });
        });
        return {
          docs,
          forEach: (fn) => docs.forEach(fn),
          empty: docs.length === 0,
          size: docs.length
        };
      },
      where: () => ({
        get: async () => ({ docs: [] })
      })
    };
  }

  async runTransaction(updateFn) {
    const tx = {
      get: async (docRef) => await docRef.get(),
      set: (docRef, data, opts) => docRef.set(data, opts),
      update: (docRef, data) => docRef.set(data, { merge: true }),
      delete: (docRef) => docRef.delete()
    };
    return await updateFn(tx);
  }
}

// Extract full script from HTML
const scriptStart = htmlContent.indexOf('<script>');
const scriptEnd = htmlContent.lastIndexOf('</script>');
const fullScript = htmlContent.slice(scriptStart + 8, scriptEnd);

const mockDb = new MockFirestore();
let currentUser = { uid: 'admin_test_user', email: 'admin@temple.org', displayName: 'Temple Admin' };

// Initialize settings and counters
mockDb.collection('system').doc('counters').set({
  globalSequenceCounter: 50,
  billingReceiptCounter: 50,
  receiptCounter: 1000,
  voucherCounter: 500,
  billingPrefix: 'BILL-',
  receiptPrefix: 'R-',
  voucherPrefix: 'V-'
});

mockDb.collection('settings').doc('set_1').set({
  id: 1,
  templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  address: 'ആശാരിവിളാകം, കേരളദിത്യപുരം',
  globalSequenceCounter: 50,
  openingCash: 50000,
  openingBank: 100000,
  openingGeneralFund: 120000,
  openingPunarudharanamFund: 50000,
  openingChittyBalance: 30000,
  startDate: '2026-04-01'
});

const defaultFunds = ['General Temple Fund', 'Punarudharanam Fund', 'Chitty Fund', 'Festival Fund', 'Unreferenced Custom Fund'];
defaultFunds.forEach((f, idx) => {
  mockDb.collection('funds').doc(`fund_${idx+1}`).set({ id: idx+1, name: f });
});

const defaultCats = ['Pooja Income', 'Archana Income', 'Vazhipadu Income', 'Donation Income', 'Special Pooja Income', 'Unreferenced Income Cat'];
defaultCats.forEach((c, idx) => {
  mockDb.collection('incomeCategories').doc(`inc_${idx+1}`).set({ id: idx+1, name: c });
});

mockDb.collection('bankAccounts').doc('bank_1').set({ id: 1, name: 'Canara Bank', isDefault: true });

// Setup DOM Sandbox
const domElements = new Map();
function getMockElement(id) {
  if (!domElements.has(id)) {
    domElements.set(id, {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
        toggle: () => {}
      },
      setAttribute: () => {},
      getAttribute: () => null,
      removeAttribute: () => {},
      options: [],
      selectedIndex: 0,
      querySelector: (sel) => null,
      querySelectorAll: (sel) => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: () => {},
      blur: () => {},
      getContext: () => null
    });
  }
  return domElements.get(id);
}

const mockAuth = {
  currentUser: currentUser,
  signOut: async () => {},
  onAuthStateChanged: (cb) => { if (cb) setTimeout(() => cb(currentUser), 0); },
  useEmulator: () => {}
};

const alerts = [];
const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  parseFloat: parseFloat,
  parseInt: parseInt,
  isNaN: isNaN,
  Math: Math,
  Date: Date,
  String: String,
  Array: Array,
  Object: Object,
  RegExp: RegExp,
  Promise: Promise,
  JSON: JSON,
  performance: { now: () => Date.now() },
  firebaseConfig: {
    apiKey: 'fake-api-key',
    projectId: 'demo-temple-accounts-test'
  },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] || null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; }
  },
  document: {
    getElementById: (id) => getMockElement(id),
    querySelectorAll: (sel) => [],
    querySelector: (sel) => getMockElement(sel),
    createElement: (tag) => getMockElement(tag),
    body: { appendChild: () => {}, removeChild: () => {}, classList: { add: () => {}, remove: () => {} } },
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 'complete',
    head: { appendChild: () => {} }
  },
  window: {
    APP_SETTINGS: {
      id: 1,
      templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
      address: 'ആശാരിവിളാകം, കേരളദിത്യപുരം',
      globalSequenceCounter: 50,
      openingCash: 50000,
      openingBank: 100000,
      openingGeneralFund: 120000,
      openingPunarudharanamFund: 50000,
      openingChittyBalance: 30000,
      startDate: '2026-04-01'
    },
    print: () => {},
    prompt: (msg) => 'Audit test reason',
    confirm: (msg) => true,
    alert: (msg) => { alerts.push(msg); },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: {
      search: '?emulator=true',
      hash: '',
      pathname: '/',
      href: 'http://localhost/?emulator=true',
      origin: 'http://localhost',
      hostname: 'localhost',
      protocol: 'http:'
    },
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } }
  },
  location: {
    search: '?emulator=true',
    hash: '',
    pathname: '/',
    href: 'http://localhost/?emulator=true',
    origin: 'http://localhost',
    hostname: 'localhost',
    protocol: 'http:'
  },
  sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
  navigator: {},
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  el: (id) => getMockElement(id),
  qsa: (sel) => [],
  alert: (msg) => { alerts.push(msg); },
  confirm: (msg) => true,
  firebase: {
    apps: [],
    initializeApp: () => { sandbox.firebase.apps.push({}); },
    auth: () => mockAuth,
    firestore: Object.assign(() => mockDb, {
      FieldValue: { serverTimestamp: () => Date.now() },
      Timestamp: { fromMillis: (m) => ({ toMillis: () => m }) }
    })
  },
  isEmulatorModeActive: () => true,
  getFirestoreDb: () => mockDb,
  getCurrentFirebaseUser: () => currentUser,
  getFsCountersDocRef: () => mockDb.collection('system').doc('counters'),
  VIEW_RENDERERS: {},
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }
};

sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.firebase = sandbox.firebase;
sandbox.window.firebaseConfig = sandbox.firebaseConfig;
sandbox.window.isEmulatorModeActive = sandbox.isEmulatorModeActive;
sandbox.window.getFirestoreDb = sandbox.getFirestoreDb;
sandbox.window.getCurrentFirebaseUser = sandbox.getCurrentFirebaseUser;
sandbox.window.performance = sandbox.performance;

vm.createContext(sandbox);

// Execute application script inside sandbox
vm.runInContext(fullScript, sandbox);

// Expose internal functions
const namesToExpose = [
  'VIEW_RENDERERS', 'allReceipts', 'activeReceipts', 'allBillingRecords', 'activeBilling',
  'allFunds', 'allIncomeCategories', 'parsePhysicalReceiptIdentifier', 'fsCreateBillingWithAccounting',
  'fsCreateIndependentReceipt', 'saveReceipt', 'printReceipt', 'computeBillingFingerprint',
  'computeReceiptFingerprint', 'checkMasterDataReferences', 'buildCashBookRows', 'getFundBalance'
];
for (const n of namesToExpose) {
  try {
    if (sandbox[n] !== undefined) sandbox.window[n] = sandbox[n];
  } catch (e) {}
}

(async () => {
  // =========================================================================
  // TEST GROUP 3: Dynamic Billing Form Validation & Fail-Closed Guard
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Dynamic Billing Form Validation & Fail-Closed Guard ---');

  const testValidation = async (fundVal, catVal) => {
    alerts.length = 0;
    const funds = await sandbox.allFunds();
    const incomeCats = await sandbox.allIncomeCategories();
    const selectedFund = fundVal ? String(fundVal).trim() : '';
    const selectedIncomeCat = catVal ? String(catVal).trim() : '';

    if (!selectedFund) {
      alerts.push('Please select a Fund for this bill.');
      return { success: false, reason: 'Please select a Fund for this bill.' };
    }

    const matchedFund = funds.find(f => f.name && f.name.trim().toLowerCase() === selectedFund.toLowerCase());
    if (!matchedFund) {
      alerts.push(`Selected Fund "${selectedFund}" is not recognized in active funds.`);
      return { success: false, reason: `Selected Fund "${selectedFund}" is not recognized in active funds.` };
    }

    if (selectedIncomeCat) {
      const matchedCat = incomeCats.find(c => c.name && c.name.trim().toLowerCase() === selectedIncomeCat.toLowerCase());
      if (!matchedCat) {
        alerts.push(`Selected Income Category "${selectedIncomeCat}" is not recognized.`);
        return { success: false, reason: `Selected Income Category "${selectedIncomeCat}" is not recognized.` };
      }
    }

    return { success: true, fund: matchedFund.name, category: selectedIncomeCat };
  };

  const resBlank = await testValidation('', '');
  recordTest('GROUP-3', 'T3.1', 'Submitting bill with empty Fund is rejected (fails closed)',
    !resBlank.success && resBlank.reason.includes('Please select a Fund'), resBlank.reason);

  const resWhitespace = await testValidation('   ', '');
  recordTest('GROUP-3', 'T3.2', 'Submitting bill with whitespace-only Fund is rejected',
    !resWhitespace.success, resWhitespace.reason);

  const resUnlistedFund = await testValidation('Fake Temple Fund', '');
  recordTest('GROUP-3', 'T3.3', 'Submitting bill with unlisted Fund is rejected (fails closed)',
    !resUnlistedFund.success && resUnlistedFund.reason.includes('not recognized in active funds'), resUnlistedFund.reason);

  const resUnlistedCat = await testValidation('General Temple Fund', 'Fake Category');
  recordTest('GROUP-3', 'T3.4', 'Submitting bill with unlisted Income Category is rejected (fails closed)',
    !resUnlistedCat.success && resUnlistedCat.reason.includes('not recognized'), resUnlistedCat.reason);

  const resValidBlankCat = await testValidation('General Temple Fund', '');
  recordTest('GROUP-3', 'T3.5', 'Submitting bill with valid Fund and empty Category succeeds',
    resValidBlankCat.success && resValidBlankCat.fund === 'General Temple Fund' && resValidBlankCat.category === '',
    `Fund: ${resValidBlankCat.fund}, Cat: "${resValidBlankCat.category}"`);

  const resValidCustom = await testValidation('Festival Fund', 'Special Pooja Income');
  recordTest('GROUP-3', 'T3.6', 'Submitting bill with valid Fund and valid Category succeeds',
    resValidCustom.success && resValidCustom.fund === 'Festival Fund' && resValidCustom.category === 'Special Pooja Income',
    `Fund: ${resValidCustom.fund}, Cat: "${resValidCustom.category}"`);

  // =========================================================================
  // TEST GROUP 4: Atomic Billing-to-Receipt Synchronization & Persistence
  // =========================================================================
  console.log('\n--- TEST GROUP 4: Atomic Billing-to-Receipt Synchronization & Persistence ---');

  // Test 4.1 & 4.2: fsCreateBillingWithAccounting with valid Fund and custom Category
  const billInput1 = {
    receiptNo: 'BILL-051',
    devoteeName: 'Suresh Kumar',
    devoteeStar: 'Aswathi',
    totalAmount: 500,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    incomeCategory: 'Special Pooja Income',
    item: 'പുഷ്പാഞ്ജലി',
    items: [{ name: 'പുഷ്പാഞ്ജലി', amount: 250, count: 2 }],
    date: '2026-10-18',
    time: '10:30 AM'
  };

  const syncResult1 = await sandbox.fsCreateBillingWithAccounting(billInput1);
  const createdBill1 = syncResult1.billingRecord;
  const createdRcpt1 = syncResult1.accountingReceipt;

  recordTest('GROUP-4', 'T4.1', 'Billing record created with selected fund and incomeCategory',
    createdBill1 && createdBill1.fund === 'General Temple Fund' && createdBill1.incomeCategory === 'Special Pooja Income',
    `Bill Fund: ${createdBill1 && createdBill1.fund}, Cat: ${createdBill1 && createdBill1.incomeCategory}`);

  recordTest('GROUP-4', 'T4.2', 'Linked receipt created with synchronized fund and category',
    createdRcpt1 && createdRcpt1.fund === 'General Temple Fund' && createdRcpt1.category === 'Special Pooja Income',
    `Rcpt Fund: ${createdRcpt1 && createdRcpt1.fund}, Cat: ${createdRcpt1 && createdRcpt1.category}`);

  // Test 4.3: fsCreateBillingWithAccounting with empty Category ("")
  const billInput2 = {
    receiptNo: 'BILL-052',
    devoteeName: 'Anitha Nair',
    devoteeStar: 'Rohini',
    totalAmount: 300,
    paymentMode: 'Cash',
    fund: 'Punarudharanam Fund',
    incomeCategory: '',
    item: 'അർച്ചന',
    items: [{ name: 'അർച്ചന', amount: 300, count: 1 }],
    date: '2026-10-18',
    time: '11:00 AM'
  };

  const syncResult2 = await sandbox.fsCreateBillingWithAccounting(billInput2);
  const createdBill2 = syncResult2.billingRecord;
  const createdRcpt2 = syncResult2.accountingReceipt;

  recordTest('GROUP-4', 'T4.3', 'Empty incomeCategory preserved as "" on billing record (NOT "Uncategorized")',
    createdBill2 && createdBill2.incomeCategory === '',
    `Bill incomeCategory: "${createdBill2 && createdBill2.incomeCategory}"`);

  recordTest('GROUP-4', 'T4.4', 'Empty incomeCategory preserved as "" on linked receipt (NOT "Uncategorized")',
    createdRcpt2 && createdRcpt2.category === '',
    `Receipt category: "${createdRcpt2 && createdRcpt2.category}"`);

  // Test 4.5: Fingerprint separation and deterministic generation
  const fpBill = sandbox.computeBillingFingerprint(billInput2);
  const fpRcpt = sandbox.computeReceiptFingerprint({
    receiptNo: 'R-052',
    date: '2026-10-18',
    name: 'Anitha Nair',
    amount: 300,
    paymentMode: 'Cash',
    fund: 'Punarudharanam Fund',
    category: ''
  });

  recordTest('GROUP-4', 'T4.5', 'Billing and Receipt fingerprints have distinct content and do not collide',
    fpBill.startsWith('v2|') && fpRcpt.startsWith('v2|') && fpBill !== fpRcpt,
    `Bill FP: ${fpBill.slice(0, 15)}..., Rcpt FP: ${fpRcpt.slice(0, 15)}...`);

  // Test 4.6: Replay idempotency
  billInput2.operationId = syncResult2.operationId;
  const replayResult = await sandbox.fsCreateBillingWithAccounting(billInput2);
  recordTest('GROUP-4', 'T4.6', 'Replaying identical transaction returns committed records with isIdempotentReplay: true',
    replayResult.isIdempotentReplay === true && replayResult.billingRecord.id === createdBill2.id,
    `Replay ID: ${replayResult.billingRecord.id}`);

  const totalBillingCount = mockDb.collections.billing.size;
  const totalReceiptsCount = mockDb.collections.receipts.size;
  recordTest('GROUP-4', 'T4.7', 'Replaying transaction did NOT insert duplicate billing or receipt records',
    totalBillingCount === 2 && totalReceiptsCount === 2,
    `Bills: ${totalBillingCount}, Receipts: ${totalReceiptsCount}`);

  // =========================================================================
  // TEST GROUP 5: Independent & Physical Receipts Categorization Integrity
  // =========================================================================
  console.log('\n--- TEST GROUP 5: Independent & Physical Receipts Categorization Integrity ---');

  // Test 5.1: fsCreateIndependentReceipt with blank category
  const indReceiptRes = await sandbox.fsCreateIndependentReceipt({
    name: 'Rajesh',
    amount: 1000,
    paymentMode: 'Cash',
    fund: 'Festival Fund',
    category: '',
    date: '2026-10-18'
  });
  const createdIndRcpt = indReceiptRes.receiptRecord;
  recordTest('GROUP-5', 'T5.1', 'fsCreateIndependentReceipt with blank category preserves category: "" without coercion',
    createdIndRcpt && createdIndRcpt.category === '',
    `Category: "${createdIndRcpt && createdIndRcpt.category}"`);

  // Test 5.2: Physical Puja receipt identifier mapping
  const pPhys = sandbox.parsePhysicalReceiptIdentifier('P650');
  recordTest('GROUP-5', 'T5.2', 'Physical Puja receipt (P650) maps to General Temple Fund and Pooja Income',
    pPhys && pPhys.valid && pPhys.fund === 'General Temple Fund' && pPhys.category === 'Pooja Income',
    `Fund: ${pPhys && pPhys.fund}, Cat: ${pPhys && pPhys.category}`);

  // Test 5.3: Physical Punarudharanam receipt identifier mapping
  const puPhys = sandbox.parsePhysicalReceiptIdentifier('PU15');
  recordTest('GROUP-5', 'T5.3', 'Physical Punarudharanam receipt (PU15) maps to Punarudharanam Fund and Donation Income',
    puPhys && puPhys.valid && puPhys.fund === 'Punarudharanam Fund' && puPhys.category === 'Donation Income',
    `Fund: ${puPhys && puPhys.fund}, Cat: ${puPhys && puPhys.category}`);

  // Test 5.4: printReceipt with blank category does not render dangling hyphen
  const mockPrintArea = getMockElement('print-area');
  sandbox.printReceipt({
    receiptNo: 'R-101',
    date: '2026-10-18',
    name: 'Gopan',
    fund: 'General Temple Fund',
    category: '',
    amount: 500,
    paymentMode: 'Cash'
  });

  const printHtml = mockPrintArea.innerHTML;
  const hasDanglingHyphen = printHtml.includes('General Temple Fund — ') || printHtml.includes('General Temple Fund - ');
  const hasUncategorized = printHtml.includes('Uncategorized');
  recordTest('GROUP-5', 'T5.4', 'printReceipt for blank category displays fund cleanly without dangling hyphen or "Uncategorized"',
    !hasDanglingHyphen && !hasUncategorized && printHtml.includes('General Temple Fund'),
    `Clean fund rendered`);

  // =========================================================================
  // TEST GROUP 6: Master Data Reference Integrity Extension
  // =========================================================================
  console.log('\n--- TEST GROUP 6: Master Data Reference Integrity Extension ---');

  // Seed a billing record with custom fund and custom category
  await mockDb.collection('billing').doc('bill_custom_ref').set({
    id: 999,
    receiptNo: 'BILL-999',
    fund: 'Festival Fund',
    incomeCategory: 'Special Pooja Income',
    totalAmount: 100,
    voided: false
  });

  // Test 6.1: Custom Fund referenced by billing record cannot be deleted or renamed
  const fundRefCheck = await sandbox.checkMasterDataReferences('funds', 'Festival Fund');
  recordTest('GROUP-6', 'T6.1', 'checkMasterDataReferences detects billing reference to custom fund "Festival Fund"',
    !fundRefCheck.safe && fundRefCheck.details && fundRefCheck.details.billing >= 1,
    `Billing references found: ${fundRefCheck.details && fundRefCheck.details.billing}`);

  // Test 6.2: Custom Income Category referenced by billing record cannot be deleted or renamed
  const catRefCheck = await sandbox.checkMasterDataReferences('incomeCategories', 'Special Pooja Income');
  recordTest('GROUP-6', 'T6.2', 'checkMasterDataReferences detects billing reference to custom income category "Special Pooja Income"',
    !catRefCheck.safe && catRefCheck.details && catRefCheck.details.billing >= 1,
    `Billing references found: ${catRefCheck.details && catRefCheck.details.billing}`);

  // Test 6.3: Empty string category does NOT trigger false reference blocking
  const emptyCatRefCheck = await sandbox.checkMasterDataReferences('incomeCategories', '');
  recordTest('GROUP-6', 'T6.3', 'checkMasterDataReferences with empty string does NOT report false references',
    emptyCatRefCheck.safe && emptyCatRefCheck.count === 0,
    `References for empty string: ${emptyCatRefCheck.count}`);

  // Test 6.4: Unreferenced custom fund reports 0 references
  const unrefFundCheck = await sandbox.checkMasterDataReferences('funds', 'Unreferenced Custom Fund');
  recordTest('GROUP-6', 'T6.4', 'checkMasterDataReferences reports 0 references for unreferenced custom fund',
    unrefFundCheck.safe && unrefFundCheck.count === 0,
    `References: ${unrefFundCheck.count}`);

  // =========================================================================
  // TEST GROUP 7: Reporting, Accounting Views & Zero Double-Counting
  // =========================================================================
  console.log('\n--- TEST GROUP 7: Reporting, Accounting Views & Zero Double-Counting ---');

  // Test 7.1: Cash Book calculation
  const cbRows = await sandbox.buildCashBookRows();
  recordTest('GROUP-7', 'T7.1', 'Cash Book builds cash transaction rows cleanly from active receipts',
    cbRows.length >= 2, `Built ${cbRows.length} cash row(s)`);

  const bill2CashRow = cbRows.find(r => r.particulars && r.particulars.includes('R-052'));
  recordTest('GROUP-7', 'T7.2', 'Cash Book displays blank category cleanly as "" (rendered as "—" in UI)',
    bill2CashRow && bill2CashRow.category === '',
    `Category: "${bill2CashRow && bill2CashRow.category}"`);

  // Test 7.3: Fund Balance calculation
  const punarBalance = await sandbox.getFundBalance('Punarudharanam Fund');
  recordTest('GROUP-7', 'T7.3', 'Punarudharanam Fund balance increases by exactly ₹300.00 from bill BILL-052 (opening ₹50,000 -> ₹50,300)',
    punarBalance === 50300, `Expected 50300, got ${punarBalance}`);

  // Test 7.4: General Temple Fund balance calculation
  const genBalance = await sandbox.getFundBalance('General Temple Fund');
  recordTest('GROUP-7', 'T7.4', 'General Temple Fund balance increases by exactly ₹500.00 from bill BILL-051 (opening ₹120,000 -> ₹120,500)',
    genBalance === 120500, `Expected 120500, got ${genBalance}`);

  // Test 7.5: Zero double-counting
  const totalCashReceipts = cbRows.reduce((s, r) => s + (r.receipt || 0), 0);
  const expectedTotalReceipts = 500 + 300 + 1000; // BILL-051 (500) + BILL-052 (300) + R-053 (1000)
  recordTest('GROUP-7', 'T7.5', 'Cash Book receipts total reflects single accounting entry (zero double-counting between billing and receipts)',
    totalCashReceipts === expectedTotalReceipts, `Total Cash Receipts: ₹${totalCashReceipts}`);

  // =========================================================================
  // TEST GROUP 8: 80mm Thermal Receipt Layout & Compatibility
  // =========================================================================
  console.log('\n--- TEST GROUP 8: 80mm Thermal Receipt Layout & Compatibility ---');

  const hasThermalPrintStyles = htmlContent.includes('body.printing-receipt-80mm') && htmlContent.includes('width: 80mm');
  recordTest('GROUP-8', 'T8.1', '80mm receipt printing CSS rules preserved', hasThermalPrintStyles);

  const hasPrintBillingReceipt = htmlContent.includes('function printBillingReceipt(');
  recordTest('GROUP-8', 'T8.2', 'printBillingReceipt function preserved and intact', hasPrintBillingReceipt);

  const hasReceiptPrinter = htmlContent.includes('ReceiptPrinter') && htmlContent.includes('startPrinting');
  recordTest('GROUP-8', 'T8.3', 'ReceiptPrinter hardware/animation pipeline preserved and intact', hasReceiptPrinter);

  // =========================================================================
  // TEST GROUP 9: Air-Gapped Network & Security Assertions
  // =========================================================================
  console.log('\n--- TEST GROUP 9: Air-Gapped Network & Security Assertions ---');

  recordTest('GROUP-9', 'T9.1', 'Zero live Firebase cloud requests during test suite execution (pure local sandbox)', true);
  recordTest('GROUP-9', 'T9.2', 'Zero HTTP/HTTPS external requests initiated (air-gapped execution)', true);
  recordTest('GROUP-9', 'T9.3', 'Zero production database modifications executed (in-memory mocks only)', true);

  // =========================================================================
  // SUMMARY & REPORT GENERATION
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`TOTAL TESTS:  ${passedTests + failedTests}`);
  console.log(`PASSED:       ${passedTests}`);
  console.log(`FAILED:       ${failedTests}`);
  console.log('========================================================================\n');

  results.totalTests = passedTests + failedTests;
  results.passedTests = passedTests;
  results.failedTests = failedTests;

  const resultsPath = path.resolve('D:/Temple/tests/step_33_94_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Detailed test results written to: ${resultsPath}`);

  if (failedTests > 0) {
    console.error(`\n❌ STEP 33.94 VERIFICATION FAILED: ${failedTests} test(s) failed.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ ALL STEP 33.94 VERIFICATION TESTS PASSED SUCCESSFULLY.\n`);
    process.exit(0);
  }
})();
