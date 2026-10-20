// tests/test_step_33_72_physical_receipt_validation.js
// STEP 33.72 — Physical Receipt Validation & Save Workflow Verification Suite

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('========================================================================');
console.log('STEP 33.72: PHYSICAL RECEIPT VALIDATION & SAVE WORKFLOW VERIFICATION');
console.log('========================================================================\n');

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const fileHash = crypto.createHash('sha256').update(html).digest('hex').toUpperCase();

console.log(`Target File: Temple_Accounts-1.html`);
console.log(`Current SHA-256: ${fileHash}`);
console.log(`File Size: ${html.length} bytes (on disk: ${fs.statSync(htmlPath).size} bytes)\n`);

const results = {
  timestamp: new Date().toISOString(),
  targetFile: 'Temple_Accounts-1.html',
  targetFileSha256: fileHash,
  fileSizeBytes: fs.statSync(htmlPath).size,
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  tests: []
};

function recordTest(id, name, group, passed, expected, actual, detail = '') {
  results.totalTests++;
  if (passed) {
    results.passedTests++;
    console.log(`  ✅ [PASS] ${id}: ${name}`);
  } else {
    results.failedTests++;
    console.error(`  ❌ [FAIL] ${id}: ${name} | Expected: ${expected} | Actual: ${actual}${detail ? ' — ' + detail : ''}`);
  }
  results.tests.push({ id, name, group, passed, expected, actual, detail });
}

// ----------------------------------------------------
// EXTRACT APPLICATION LOGIC & SETUP TEST HARNESS
// ----------------------------------------------------

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const fullScript = html.slice(scriptStart + 8, scriptEnd);

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
      }
    };
  }

  batch() {
    const operations = [];
    return {
      set: (docRef, data, opts) => operations.push({ type: 'set', docRef, data, opts }),
      delete: (docRef) => operations.push({ type: 'delete', docRef }),
      commit: async () => {
        for (const op of operations) {
          if (op.type === 'set') await op.docRef.set(op.data, op.opts);
          else if (op.type === 'delete') await op.docRef.delete();
        }
      }
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

const mockDb = new MockFirestore();
mockDb.useEmulator = () => {};
let currentUser = { uid: 'admin_test_user', email: 'admin@temple.org', displayName: 'Temple Admin' };

mockDb.collection('system').doc('counters').set({
  globalSequenceCounter: 42,
  billingReceiptCounter: 42,
  receiptCounter: 1000,
  voucherCounter: 500,
  billingPrefix: 'BILL-',
  receiptPrefix: 'R-',
  voucherPrefix: 'V-'
});

mockDb.collection('settings').doc('set_1').set({
  id: 1,
  templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
  address: 'ക്ഷേത്രം റോഡ്, കേരളം',
  globalSequenceCounter: 42,
  openingCash: 10000,
  openingBank: 50000,
  openingGeneralFund: 30000,
  openingPunarudharanamFund: 20000,
  startDate: '2026-04-01'
});

// Preload baseline reference data
mockDb.collection('funds').doc('f1').set({ id: 1, name: 'General Temple Fund' });
mockDb.collection('funds').doc('f2').set({ id: 2, name: 'Punarudharanam Fund' });
mockDb.collection('incomeCategories').doc('c1').set({ id: 1, name: 'Pooja Income' });
mockDb.collection('incomeCategories').doc('c2').set({ id: 2, name: 'Donation Income' });
mockDb.collection('incomeCategories').doc('c3').set({ id: 3, name: 'Vazhipadu Income' });
mockDb.collection('bankAccounts').doc('b1').set({ id: 1, name: 'SBI Temple Account' });

// DOM Elements Store
const domElements = new Map();
function getMockElement(id) {
  if (!domElements.has(id)) {
    domElements.set(id, {
      id,
      name: id,
      value: '',
      innerHTML: '',
      textContent: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
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

let _fundIdx = 0;
let _catIdx = 0;

const formElements = {
  receiptNo: { value: '' },
  editId: { value: '' },
  date: { value: '2026-10-16' },
  name: { value: 'Devotee Test' },
  star: { value: 'Rohini' },
  mobile: { value: '9876543210' },
  fund: {
    get selectedIndex() { return _fundIdx; },
    set selectedIndex(i) { _fundIdx = i; if (this.options[i]) this.value = this.options[i].value; },
    value: 'General Temple Fund',
    options: [
      { value: 'General Temple Fund', text: 'General Temple Fund' },
      { value: 'Punarudharanam Fund', text: 'Punarudharanam Fund' }
    ]
  },
  category: {
    get selectedIndex() { return _catIdx; },
    set selectedIndex(i) { _catIdx = i; if (this.options[i]) this.value = this.options[i].value; },
    value: 'Pooja Income',
    options: [
      { value: 'Pooja Income', text: 'Pooja Income' },
      { value: 'Donation Income', text: 'Donation Income' },
      { value: 'Vazhipadu Income', text: 'Vazhipadu Income' }
    ]
  },
  description: { value: 'Receipt Test Description' },
  paymentMode: { value: 'Cash' },
  bankAccount: { value: '' },
  amount: { value: '500' },
  remarks: { value: 'Test remarks' }
};

const hintElement = { innerHTML: '', style: {} };
const printAreaElement = { className: '', innerHTML: '' };

let printCallCount = 0;
let lastAlertMessage = null;
const alertHistory = [];

const mockReceiptForm = {
  id: 'receiptForm',
  querySelector: (sel) => {
    if (sel === '.receipt-number-hint') return hintElement;
    if (sel === 'select[name="fund"]') return formElements.fund;
    if (sel === 'select[name="category"]') return formElements.category;
    return null;
  },
  querySelectorAll: () => []
};

class MockFormData {
  constructor(f) {
    this.f = f;
  }
  get(key) {
    return formElements[key] ? formElements[key].value : null;
  }
}

const mockLocalStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};

const loc = {
  search: '?emulator=true',
  hash: '',
  href: 'http://localhost/?emulator=true',
  pathname: '/',
  origin: 'http://localhost',
  hostname: 'localhost',
  protocol: 'http:'
};

const mockAuth = {
  currentUser: currentUser,
  signOut: async () => {},
  onAuthStateChanged: (cb) => { if (cb) setTimeout(() => cb(currentUser), 0); },
  useEmulator: () => {}
};

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
  FormData: MockFormData,
  firebaseConfig: {
    apiKey: 'fake-api-key',
    projectId: 'demo-temple-accounts-test'
  },
  localStorage: mockLocalStorage,
  sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
  document: {
    getElementById: (id) => {
      if (id === 'receiptForm') return mockReceiptForm;
      if (id === 'print-area') return printAreaElement;
      return getMockElement(id);
    },
    querySelectorAll: (sel) => [],
    querySelector: (sel) => {
      if (sel === '#receiptForm') return mockReceiptForm;
      if (sel === '#print-area') return printAreaElement;
      return getMockElement(sel);
    },
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
      address: 'ക്ഷേത്രം റോഡ്, കേരളം',
      globalSequenceCounter: 42,
      openingCash: 10000,
      openingBank: 50000,
      openingGeneralFund: 30000,
      openingPunarudharanamFund: 20000,
      startDate: '2026-04-01'
    },
    print: () => { printCallCount++; },
    prompt: (msg) => 'Physical receipt test void reason',
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    location: loc,
    sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
    performance: { now: () => Date.now() },
    GlobalEditState: { setEditing: () => {}, clearEditing: () => {} }
  },
  performance: { now: () => Date.now() },
  location: loc,
  navigator: {},
  prompt: (msg) => 'Physical receipt test void reason',
  el: (id) => {
    if (id === 'receiptForm') return mockReceiptForm;
    if (id === 'print-area') return printAreaElement;
    return getMockElement(id);
  },
  qsa: (sel) => [],
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  alert: (msg) => {
    lastAlertMessage = msg;
    alertHistory.push(msg);
  },
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
sandbox.window.el = sandbox.el;
sandbox.window.alert = sandbox.alert;
sandbox.window.FormData = MockFormData;

vm.createContext(sandbox);

// Execute application script inside sandbox
vm.runInContext(fullScript, sandbox);

const namesToExpose = [
  'VIEW_RENDERERS', 'allReceipts', 'activeReceipts', 'allFunds', 'allIncomeCategories',
  'allBankAccounts', 'parsePhysicalReceiptIdentifier', 'parseGlobalNumber', 'formatGlobalNumber',
  'computeReceiptFingerprint', 'generateOperationId', 'onReceiptNoInput', 'saveReceipt',
  'printReceipt', 'reprintReceipt', 'voidRecord', 'fsCreatePhysicalReceipt',
  'fsCreateIndependentReceipt', 'fsGetOneSafe', 'fsVoidRecordSafe', 'getCashBalance',
  'getBankBalance', 'getFundBalance', 'exportCSV'
];

for (const n of namesToExpose) {
  try {
    sandbox[n] = vm.runInContext(n, sandbox);
  } catch (e) {}
}

function resetForm() {
  formElements.receiptNo.value = '';
  formElements.editId.value = '';
  formElements.date.value = '2026-10-16';
  formElements.name.value = 'Devotee Test';
  formElements.star.value = 'Rohini';
  formElements.mobile.value = '9876543210';
  formElements.fund.value = 'General Temple Fund';
  formElements.fund.selectedIndex = 0;
  formElements.category.value = 'Pooja Income';
  formElements.category.selectedIndex = 0;
  formElements.amount.value = '500';
  formElements.paymentMode.value = 'Cash';
  hintElement.innerHTML = '';
  lastAlertMessage = null;
  printCallCount = 0;
}

// ----------------------------------------------------
// TEST MATRIX EXECUTION
// ----------------------------------------------------

async function main() {
  console.log('--- SECTION 1: Baseline Invariants & Pre-Change Cryptographic Verification ---');
  recordTest('TC-33.72-01', 'Target file is Temple_Accounts-1.html', 'BASELINE',
    htmlPath.endsWith('Temple_Accounts-1.html'), 'Temple_Accounts-1.html', path.basename(htmlPath));

  recordTest('TC-33.72-02', 'Pre-step 33.72 backup file exists in backups directory', 'BASELINE',
    fs.existsSync(path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_72_PhysicalReceiptValidation_Backup_20261016_220000.html')),
    'Backup exists', 'Confirmed');

  const bkpHash = crypto.createHash('sha256')
    .update(fs.readFileSync(path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_72_PhysicalReceiptValidation_Backup_20261016_220000.html')))
    .digest('hex').toUpperCase();

  recordTest('TC-33.72-03', 'Pre-step backup matches expected STEP 33.71 hash', 'BASELINE',
    bkpHash === '1A1C6333A942F67D04C9804BFC89222DCCB4E6BB108857FEA5EDBDAB24DEB307',
    '1A1C6333A942F67D04C9804BFC89222DCCB4E6BB108857FEA5EDBDAB24DEB307', bkpHash);

  recordTest('TC-33.72-04', 'Application post-modification SHA-256 differs from pre-change', 'BASELINE',
    fileHash !== bkpHash, true, fileHash !== bkpHash);


  console.log('\n--- SECTION 2: Identifier Parser & Boundary Validation Matrix ---');

  // P600 valid
  const p600 = sandbox.parsePhysicalReceiptIdentifier('P600');
  recordTest('TC-33.72-05', 'Enter P600: parsed as valid Type P identifier', 'FORMAT_PARSING',
    p600 && p600.valid && p600.type === 'P' && p600.formattedId === 'P600', true, p600 ? p600.formattedId : null);
  recordTest('TC-33.72-06', 'P600 maps to General Temple Fund and Pooja Income', 'FORMAT_PARSING',
    p600 && p600.fund === 'General Temple Fund' && p600.category === 'Pooja Income', true, p600 ? `${p600.fund}|${p600.category}` : null);

  // P900 valid
  const p900 = sandbox.parsePhysicalReceiptIdentifier('P900');
  recordTest('TC-33.72-07', 'Enter P900: upper boundary of P-series accepted', 'FORMAT_PARSING',
    p900 && p900.valid && p900.formattedId === 'P900', true, p900 ? p900.formattedId : null);

  // PU1 valid
  const pu1 = sandbox.parsePhysicalReceiptIdentifier('PU1');
  recordTest('TC-33.72-08', 'Enter PU1: parsed as valid Type PU identifier', 'FORMAT_PARSING',
    pu1 && pu1.valid && pu1.type === 'PU' && pu1.formattedId === 'PU1', true, pu1 ? pu1.formattedId : null);
  recordTest('TC-33.72-09', 'PU1 maps to Punarudharanam Fund and Donation Income', 'FORMAT_PARSING',
    pu1 && pu1.fund === 'Punarudharanam Fund' && pu1.category === 'Donation Income', true, pu1 ? `${pu1.fund}|${pu1.category}` : null);

  // PU2 valid
  const pu2 = sandbox.parsePhysicalReceiptIdentifier('PU2');
  recordTest('TC-33.72-10', 'Enter PU2: subsequent sequential PU accepted', 'FORMAT_PARSING',
    pu2 && pu2.valid && pu2.formattedId === 'PU2', true, pu2 ? pu2.formattedId : null);

  // P599 invalid (under boundary)
  const p599 = sandbox.parsePhysicalReceiptIdentifier('P599');
  recordTest('TC-33.72-11', 'Enter P599: rejected as out of range (< 600)', 'FORMAT_PARSING',
    p599 && !p599.valid && p599.error.includes('out of valid range'), true, p599 ? p599.error : null);

  // P901 invalid (over boundary)
  const p901 = sandbox.parsePhysicalReceiptIdentifier('P901');
  recordTest('TC-33.72-12', 'Enter P901: rejected as out of range (> 900)', 'FORMAT_PARSING',
    p901 && !p901.valid && p901.error.includes('out of valid range'), true, p901 ? p901.error : null);

  // PU0 invalid
  const pu0 = sandbox.parsePhysicalReceiptIdentifier('PU0');
  recordTest('TC-33.72-13', 'Enter PU0: rejected (< 1 positive integer)', 'FORMAT_PARSING',
    pu0 && !pu0.valid && pu0.error.includes('sequential positive integer'), true, pu0 ? pu0.error : null);

  // PU-1 invalid
  const puDash = sandbox.parsePhysicalReceiptIdentifier('PU-1');
  recordTest('TC-33.72-14', 'Enter PU-1: rejected with physical format error', 'FORMAT_PARSING',
    puDash && !puDash.valid && puDash.error.includes('Invalid physical receipt identifier format'), true, puDash ? puDash.error : null);

  // PX100 invalid
  const px100 = sandbox.parsePhysicalReceiptIdentifier('PX100');
  recordTest('TC-33.72-15', 'Enter PX100: rejected unsupported prefix', 'FORMAT_PARSING',
    px100 && !px100.valid && px100.error.includes('Invalid physical receipt identifier format'), true, px100 ? px100.error : null);

  // P-600 invalid
  const pDash = sandbox.parsePhysicalReceiptIdentifier('P-600');
  recordTest('TC-33.72-16', 'Enter P-600: rejected with physical format error', 'FORMAT_PARSING',
    pDash && !pDash.valid && pDash.error.includes('Invalid physical receipt identifier format'), true, pDash ? pDash.error : null);

  // P 600 with space invalid
  const pSpace = sandbox.parsePhysicalReceiptIdentifier('P 600');
  recordTest('TC-33.72-17', 'Enter P 600: rejected with physical format error (not ordinary error)', 'FORMAT_PARSING',
    pSpace && !pSpace.valid && pSpace.error.includes('Invalid physical receipt identifier format'), true, pSpace ? pSpace.error : null);

  // Case normalization
  const pLower = sandbox.parsePhysicalReceiptIdentifier('p600');
  recordTest('TC-33.72-18', 'Lowercase p600 normalized to uppercase formattedId P600', 'NORMALIZATION',
    pLower && pLower.valid && pLower.formattedId === 'P600', true, pLower ? pLower.formattedId : null);

  const puLower = sandbox.parsePhysicalReceiptIdentifier('pu1');
  recordTest('TC-33.72-19', 'Lowercase pu1 normalized to uppercase formattedId PU1', 'NORMALIZATION',
    puLower && puLower.valid && puLower.formattedId === 'PU1', true, puLower ? puLower.formattedId : null);

  // Surrounding whitespace trimmed
  const pTrim = sandbox.parsePhysicalReceiptIdentifier('  P600  ');
  recordTest('TC-33.72-20', 'Surrounding whitespace trimmed to P600', 'NORMALIZATION',
    pTrim && pTrim.valid && pTrim.formattedId === 'P600', true, pTrim ? pTrim.formattedId : null);


  console.log('\n--- SECTION 3: onReceiptNoInput UI Handler & Auto-Selection ---');

  // onReceiptNoInput with P600
  const inputElP = { value: 'P600', form: mockReceiptForm };
  sandbox.onReceiptNoInput(inputElP);
  recordTest('TC-33.72-21', 'onReceiptNoInput(P600) sets General Temple Fund', 'UI_INPUT_HANDLER',
    formElements.fund.value === 'General Temple Fund', true, formElements.fund.value);
  recordTest('TC-33.72-22', 'onReceiptNoInput(P600) sets physical Puja hint badge', 'UI_INPUT_HANDLER',
    hintElement.innerHTML.includes('Physical Puja Receipt') && hintElement.innerHTML.includes('P600'), true, hintElement.innerHTML);

  // onReceiptNoInput with PU1
  const inputElPU = { value: 'PU1', form: mockReceiptForm };
  sandbox.onReceiptNoInput(inputElPU);
  recordTest('TC-33.72-23', 'onReceiptNoInput(PU1) sets Punarudharanam Fund & Donation Income', 'UI_INPUT_HANDLER',
    formElements.fund.value === 'Punarudharanam Fund' && formElements.category.value === 'Donation Income', true, `${formElements.fund.value}|${formElements.category.value}`);
  recordTest('TC-33.72-24', 'onReceiptNoInput(PU1) sets physical Punarudharanam hint badge', 'UI_INPUT_HANDLER',
    hintElement.innerHTML.includes('Physical Punarudharanam Receipt') && hintElement.innerHTML.includes('PU1'), true, hintElement.innerHTML);

  // onReceiptNoInput with invalid P599
  const inputElErr = { value: 'P599', form: mockReceiptForm };
  sandbox.onReceiptNoInput(inputElErr);
  recordTest('TC-33.72-25', 'onReceiptNoInput(P599) displays out-of-range error in hint', 'UI_INPUT_HANDLER',
    hintElement.innerHTML.includes('out of valid range'), true, hintElement.innerHTML);

  // onReceiptNoInput with blank
  const inputElBlank = { value: '', form: mockReceiptForm };
  sandbox.onReceiptNoInput(inputElBlank);
  recordTest('TC-33.72-26', 'onReceiptNoInput("") resets to default sequence hint', 'UI_INPUT_HANDLER',
    hintElement.innerHTML.includes('leave blank for auto-allocated'), true, hintElement.innerHTML);


  console.log('\n--- SECTION 4: Real Form Validation & saveReceipt(false) [SAVE PATH] ---');

  // Test Save P600
  resetForm();
  formElements.receiptNo.value = 'P600';
  formElements.name.value = 'Bhaskaran Nair';
  formElements.amount.value = '750';
  formElements.paymentMode.value = 'Cash';

  await sandbox.saveReceipt(false);
  const rcptP600 = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  const resP600 = await mockDb.collection('system').doc('res_phys_P600').get();

  recordTest('TC-33.72-27', 'Save P600 accepted by real form validation path without alert error', 'SAVE_HANDLER',
    lastAlertMessage === null, true, lastAlertMessage);
  recordTest('TC-33.72-28', 'Save P600 routes through physical creation path (receipts/rcpt_phys_P600 exists)', 'SAVE_HANDLER',
    rcptP600.exists, true, rcptP600.exists);
  recordTest('TC-33.72-29', 'Save P600 creates secondary reservation record (system/res_phys_P600 exists)', 'SAVE_HANDLER',
    resP600.exists, true, resP600.exists);
  recordTest('TC-33.72-30', 'Save P600 preserves devotee name, star, amount, and receiptNo P600', 'SAVE_HANDLER',
    rcptP600.data().name === 'Bhaskaran Nair' && rcptP600.data().amount === 750 && rcptP600.data().receiptNo === 'P600', true, JSON.stringify(rcptP600.data()));
  recordTest('TC-33.72-31', 'Save P600 has fund General Temple Fund and category Pooja Income', 'SAVE_HANDLER',
    rcptP600.data().fund === 'General Temple Fund' && rcptP600.data().category === 'Pooja Income', true, `${rcptP600.data().fund}|${rcptP600.data().category}`);
  recordTest('TC-33.72-32', 'Save P600 created ZERO new billing records in billing collection', 'SAVE_HANDLER',
    mockDb.collections.billing.size === 0, true, mockDb.collections.billing.size);
  const countersSnap = await mockDb.collection('system').doc('counters').get();
  recordTest('TC-33.72-33', 'Save P600 strictly isolates globalSequenceCounter (remains 42)', 'SAVE_HANDLER',
    countersSnap.data().globalSequenceCounter === 42, true, countersSnap.data().globalSequenceCounter);

  // Test Save PU1 with inadvertent default fund in form
  resetForm();
  formElements.receiptNo.value = 'PU1';
  formElements.name.value = 'Madhavan Pillai';
  formElements.amount.value = '2500';
  formElements.fund.value = 'General Temple Fund'; // simulating form default bleed
  formElements.category.value = 'Pooja Income';

  await sandbox.saveReceipt(false);
  const rcptPU1 = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
  const resPU1 = await mockDb.collection('system').doc('res_phys_PU1').get();

  recordTest('TC-33.72-34', 'Save PU1 accepted by real form validation path without alert error', 'SAVE_HANDLER',
    lastAlertMessage === null, true, lastAlertMessage);
  recordTest('TC-33.72-35', 'Save PU1 creates receipts/rcpt_phys_PU1 and system/res_phys_PU1', 'SAVE_HANDLER',
    rcptPU1.exists && resPU1.exists, true, `rcpt: ${rcptPU1.exists}, res: ${resPU1.exists}`);
  recordTest('TC-33.72-36', 'Save PU1 strictly enforces Punarudharanam Fund & Donation Income mapping', 'SAVE_HANDLER',
    rcptPU1.data().fund === 'Punarudharanam Fund' && rcptPU1.data().category === 'Donation Income', true, `${rcptPU1.data().fund}|${rcptPU1.data().category}`);
  recordTest('TC-33.72-37', 'Save PU1 created ZERO new billing records', 'SAVE_HANDLER',
    mockDb.collections.billing.size === 0, true, mockDb.collections.billing.size);

  // Test Save P900 (upper boundary)
  resetForm();
  formElements.receiptNo.value = 'P900';
  formElements.amount.value = '1000';
  await sandbox.saveReceipt(false);
  const rcptP900 = await mockDb.collection('receipts').doc('rcpt_phys_P900').get();
  recordTest('TC-33.72-38', 'Save P900 upper boundary accepted and persisted', 'SAVE_HANDLER',
    rcptP900.exists && rcptP900.data().receiptNo === 'P900', true, rcptP900.exists);

  // Test Save PU2 (subsequent sequence)
  resetForm();
  formElements.receiptNo.value = 'PU2';
  formElements.amount.value = '5000';
  await sandbox.saveReceipt(false);
  const rcptPU2 = await mockDb.collection('receipts').doc('rcpt_phys_PU2').get();
  recordTest('TC-33.72-39', 'Save PU2 sequential renovation receipt accepted and persisted', 'SAVE_HANDLER',
    rcptPU2.exists && rcptPU2.data().receiptNo === 'PU2', true, rcptPU2.exists);


  console.log('\n--- SECTION 5: Rejection of Invalid Identifiers via saveReceipt ---');

  // Submit P599
  resetForm();
  formElements.receiptNo.value = 'P599';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-40', 'Submit P599: rejected with physical out-of-range alert', 'REJECTION_MATRIX',
    lastAlertMessage && lastAlertMessage.includes('out of valid range (P600 through P900)'), true, lastAlertMessage);
  const rcptP599 = await mockDb.collection('receipts').doc('rcpt_phys_P599').get();
  recordTest('TC-33.72-41', 'Submit P599: zero database writes on rejection', 'REJECTION_MATRIX',
    !rcptP599.exists, true, rcptP599.exists);

  // Submit P901
  resetForm();
  formElements.receiptNo.value = 'P901';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-42', 'Submit P901: rejected with physical out-of-range alert', 'REJECTION_MATRIX',
    lastAlertMessage && lastAlertMessage.includes('out of valid range (P600 through P900)'), true, lastAlertMessage);

  // Submit PU0
  resetForm();
  formElements.receiptNo.value = 'PU0';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-43', 'Submit PU0: rejected with sequential positive integer alert', 'REJECTION_MATRIX',
    lastAlertMessage && lastAlertMessage.includes('sequential positive integer'), true, lastAlertMessage);

  // Submit PU-1
  resetForm();
  formElements.receiptNo.value = 'PU-1';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-44', 'Submit PU-1: rejected with physical format alert (does not mislead with ordinary R-001)', 'REJECTION_MATRIX',
    lastAlertMessage && lastAlertMessage.includes('Invalid physical receipt identifier format') && !lastAlertMessage.includes('or standard prefix R-001.'), true, lastAlertMessage);

  // Submit PX100
  resetForm();
  formElements.receiptNo.value = 'PX100';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-45', 'Submit PX100: rejected with physical format alert', 'REJECTION_MATRIX',
    lastAlertMessage && lastAlertMessage.includes('Invalid physical receipt identifier format'), true, lastAlertMessage);


  console.log('\n--- SECTION 6: Save & Print Path [SAVE & PRINT HANDLER] ---');

  // Test Save & Print P601
  resetForm();
  formElements.receiptNo.value = 'P601';
  formElements.name.value = 'Suresh Kumar';
  formElements.amount.value = '600';
  await sandbox.saveReceipt(true);

  const rcptP601 = await mockDb.collection('receipts').doc('rcpt_phys_P601').get();
  recordTest('TC-33.72-46', 'Save & Print P601: persists physical receipt', 'SAVE_AND_PRINT',
    rcptP601.exists && rcptP601.data().receiptNo === 'P601', true, rcptP601.exists);
  recordTest('TC-33.72-47', 'Save & Print P601: triggers print pipeline exactly once', 'SAVE_AND_PRINT',
    printCallCount === 1, true, printCallCount);
  recordTest('TC-33.72-48', 'Save & Print P601: renders [PHYSICAL PUJA RECEIPT] banner in print preview', 'SAVE_AND_PRINT',
    printAreaElement.innerHTML.includes('[PHYSICAL PUJA RECEIPT]'), true, printAreaElement.innerHTML);
  recordTest('TC-33.72-49', 'Save & Print P601: print preview contains devotee name and amount', 'SAVE_AND_PRINT',
    printAreaElement.innerHTML.includes('Suresh Kumar') && printAreaElement.innerHTML.includes('600'), true, printAreaElement.innerHTML);

  // Test Save & Print PU3
  resetForm();
  formElements.receiptNo.value = 'PU3';
  formElements.name.value = 'Devi Prasad';
  formElements.amount.value = '15000';
  await sandbox.saveReceipt(true);

  const rcptPU3 = await mockDb.collection('receipts').doc('rcpt_phys_PU3').get();
  recordTest('TC-33.72-50', 'Save & Print PU3: persists physical renovation receipt', 'SAVE_AND_PRINT',
    rcptPU3.exists && rcptPU3.data().receiptNo === 'PU3', true, rcptPU3.exists);
  recordTest('TC-33.72-51', 'Save & Print PU3: triggers print pipeline', 'SAVE_AND_PRINT',
    printCallCount === 1, true, printCallCount);
  recordTest('TC-33.72-52', 'Save & Print PU3: renders [PHYSICAL · PUNARUDHARANAM RECEIPT] banner', 'SAVE_AND_PRINT',
    printAreaElement.innerHTML.includes('[PHYSICAL · PUNARUDHARANAM RECEIPT]'), true, printAreaElement.innerHTML);
  recordTest('TC-33.72-53', 'Save & Print does NOT create billing records (count remains 0)', 'SAVE_AND_PRINT',
    mockDb.collections.billing.size === 0, true, mockDb.collections.billing.size);


  console.log('\n--- SECTION 7: Duplicates, Idempotency & Void Protection ---');

  // Submit duplicate P600
  resetForm();
  formElements.receiptNo.value = 'P600';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-54', 'Submit duplicate P600: strictly rejected with duplicate error', 'DUPLICATES_AND_VOIDS',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  // Submit duplicate PU1 (with case variation pu1)
  resetForm();
  formElements.receiptNo.value = 'pu1';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-55', 'Submit duplicate pu1 (case variation): strictly rejected as duplicate', 'DUPLICATES_AND_VOIDS',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  // Void P600 via fsVoidRecordSafe
  await sandbox.fsVoidRecordSafe('receipts', 'rcpt_phys_P600', 'Voided for testing');
  const voidedRcptP600 = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  const voidedResP600 = await mockDb.collection('system').doc('res_phys_P600').get();

  recordTest('TC-33.72-56', 'Voiding P600 marks authoritative receipt voided: true', 'DUPLICATES_AND_VOIDS',
    voidedRcptP600.data().voided === true, true, voidedRcptP600.data().voided);
  recordTest('TC-33.72-57', 'Voiding P600 marks secondary reservation status: "voided", voided: true', 'DUPLICATES_AND_VOIDS',
    voidedResP600.data().status === 'voided' && voidedResP600.data().voided === true, true, JSON.stringify(voidedResP600.data()));

  // Re-enter voided P600
  resetForm();
  formElements.receiptNo.value = 'P600';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-58', 'Re-entering voided P600 strictly rejected (identifier cannot be reused)', 'DUPLICATES_AND_VOIDS',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  // Void PU1 via fsVoidRecordSafe
  await sandbox.fsVoidRecordSafe('receipts', 'PU1', 'Renovation test void');
  const voidedRcptPU1 = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
  const voidedResPU1 = await mockDb.collection('system').doc('res_phys_PU1').get();

  recordTest('TC-33.72-59', 'Voiding PU1 by direct identifier marks receipt voided: true', 'DUPLICATES_AND_VOIDS',
    voidedRcptPU1.data().voided === true, true, voidedRcptPU1.data().voided);
  recordTest('TC-33.72-60', 'Voiding PU1 marks secondary reservation status: "voided", voided: true', 'DUPLICATES_AND_VOIDS',
    voidedResPU1.data().status === 'voided' && voidedResPU1.data().voided === true, true, JSON.stringify(voidedResPU1.data()));

  // Re-enter voided PU1
  resetForm();
  formElements.receiptNo.value = 'PU1';
  await sandbox.saveReceipt(false);
  recordTest('TC-33.72-61', 'Re-entering voided PU1 strictly rejected', 'DUPLICATES_AND_VOIDS',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);


  console.log('\n--- SECTION 8: Normal Software Receipt Numbering & Isolation ---');

  // Verify counters before ordinary receipt
  const preCnt = await mockDb.collection('system').doc('counters').get();
  recordTest('TC-33.72-62', 'Counter untouched throughout all physical receipt operations (still 42)', 'NUMBERING_ISOLATION',
    preCnt.data().globalSequenceCounter === 42, true, preCnt.data().globalSequenceCounter);

  // Save blank-number ordinary receipt
  resetForm();
  formElements.receiptNo.value = '';
  formElements.name.value = 'Ordinary Devotee';
  formElements.amount.value = '300';
  formElements.fund.value = 'General Temple Fund';
  formElements.category.value = 'Vazhipadu Income';

  await sandbox.saveReceipt(false);

  const ordRcpt = await mockDb.collection('receipts').doc('rcpt_43').get();
  const ordRes = await mockDb.collection('system').doc('res_43').get();
  const postCnt = await mockDb.collection('system').doc('counters').get();

  recordTest('TC-33.72-63', 'Blank-number ordinary receipt creates rcpt_43 with receiptNo R-043', 'NUMBERING_ISOLATION',
    ordRcpt.exists && ordRcpt.data().receiptNo === 'R-043', true, ordRcpt.exists ? ordRcpt.data().receiptNo : null);
  recordTest('TC-33.72-64', 'Blank-number ordinary receipt creates system/res_43', 'NUMBERING_ISOLATION',
    ordRes.exists, true, ordRes.exists);
  recordTest('TC-33.72-65', 'Ordinary receipt cleanly advances globalSequenceCounter from 42 to 43', 'NUMBERING_ISOLATION',
    postCnt.data().globalSequenceCounter === 43, true, postCnt.data().globalSequenceCounter);


  console.log('\n--- SECTION 9: Direct Delegation in fsCreateIndependentReceipt ---');

  // Call fsCreateIndependentReceipt with valid physical identifier P602
  const directPResult = await sandbox.fsCreateIndependentReceipt({
    manualReceiptNo: 'P602',
    name: 'Direct Delegate P',
    date: '2026-10-16',
    amount: 800,
    paymentMode: 'Cash'
  });
  recordTest('TC-33.72-66', 'fsCreateIndependentReceipt({manualReceiptNo: P602}) delegates to physical creation', 'DELEGATION_ENGINE',
    directPResult && directPResult.receiptRecord && directPResult.receiptRecord.receiptNo === 'P602', true, directPResult ? directPResult.receiptRecord.receiptNo : null);

  // Call fsCreateIndependentReceipt with receiptNo PU4
  const directPUResult = await sandbox.fsCreateIndependentReceipt({
    receiptNo: 'PU4',
    name: 'Direct Delegate PU',
    date: '2026-10-16',
    amount: 12000,
    paymentMode: 'Cash'
  });
  recordTest('TC-33.72-67', 'fsCreateIndependentReceipt({receiptNo: PU4}) delegates to physical creation', 'DELEGATION_ENGINE',
    directPUResult && directPUResult.receiptRecord && directPUResult.receiptRecord.receiptNo === 'PU4', true, directPUResult ? directPUResult.receiptRecord.receiptNo : null);

  // Call fsCreateIndependentReceipt with invalid physical format P599
  let directErr = null;
  try {
    await sandbox.fsCreateIndependentReceipt({
      manualReceiptNo: 'P599',
      name: 'Invalid Direct',
      date: '2026-10-16',
      amount: 100,
      paymentMode: 'Cash'
    });
  } catch (e) {
    directErr = e.message;
  }
  recordTest('TC-33.72-68', 'fsCreateIndependentReceipt(P599) throws specific physical error without fallthrough to generic R-001 error', 'DELEGATION_ENGINE',
    directErr && directErr.includes('out of valid range (P600 through P900)') && !directErr.includes('Must be a sequential positive integer (e.g. 001, 002) or standard prefix R-001.'), true, directErr);


  console.log('\n--- SECTION 10: Accounting Balance Synchronization & CSV Classification ---');

  // Active receipts vs voided receipts
  const allRcpts = await sandbox.allReceipts();
  const actRcpts = await sandbox.activeReceipts();

  recordTest('TC-33.72-69', 'allReceipts includes both active and voided physical records', 'ACCOUNTING_SYNCHRONIZATION',
    allRcpts.some(r => r.receiptNo === 'P600' && r.voided) && allRcpts.some(r => r.receiptNo === 'P900' && !r.voided), true, allRcpts.length);
  recordTest('TC-33.72-70', 'activeReceipts strictly excludes voided physical receipts (P600 & PU1 absent)', 'ACCOUNTING_SYNCHRONIZATION',
    !actRcpts.some(r => r.receiptNo === 'P600') && !actRcpts.some(r => r.receiptNo === 'PU1'), true, actRcpts.map(r => r.receiptNo).join(','));

  // CSV Export verification
  let exportedData = null;
  sandbox.downloadCSV = (rows, name) => { exportedData = rows; };
  await sandbox.exportCSV('receipts');

  const p900Row = exportedData.find(r => r[0] === 'P900');
  const pu2Row = exportedData.find(r => r[0] === 'PU2');
  const ordRow = exportedData.find(r => r[0] === 'R-043');

  recordTest('TC-33.72-71', 'CSV export classifies P900 as Physical Puja', 'ACCOUNTING_SYNCHRONIZATION',
    p900Row && p900Row[12] === 'Physical Puja', true, p900Row ? p900Row[12] : null);
  recordTest('TC-33.72-72', 'CSV export classifies PU2 as Physical Punarudharanam', 'ACCOUNTING_SYNCHRONIZATION',
    pu2Row && pu2Row[12] === 'Physical Punarudharanam', true, pu2Row ? pu2Row[12] : null);
  recordTest('TC-33.72-73', 'CSV export classifies R-043 as Software', 'ACCOUNTING_SYNCHRONIZATION',
    ordRow && ordRow[12] === 'Software', true, ordRow ? ordRow[12] : null);

  // reprintReceipt verification
  printAreaElement.innerHTML = '';
  await sandbox.reprintReceipt('P900');
  recordTest('TC-33.72-74', 'reprintReceipt("P900") correctly prints Physical Puja banner', 'REPRINT_VERIFICATION',
    printAreaElement.innerHTML.includes('[PHYSICAL PUJA RECEIPT]') && printAreaElement.innerHTML.includes('P900'), true, printAreaElement.innerHTML);

  printAreaElement.innerHTML = '';
  await sandbox.reprintReceipt('PU2');
  recordTest('TC-33.72-75', 'reprintReceipt("PU2") correctly prints Physical Punarudharanam banner', 'REPRINT_VERIFICATION',
    printAreaElement.innerHTML.includes('[PHYSICAL · PUNARUDHARANAM RECEIPT]') && printAreaElement.innerHTML.includes('PU2'), true, printAreaElement.innerHTML);


  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${results.totalTests} | PASSED: ${results.passedTests} | FAILED: ${results.failedTests}`);
  console.log('========================================================================\n');

  const resultsPath = path.resolve(__dirname, 'step_33_72_physical_receipt_validation_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results written to: ${resultsPath}\n`);

  if (results.failedTests > 0) {
    console.error('❌ SOME CHECKS FAILED!');
    process.exit(1);
  } else {
    console.log('✨ ALL STEP 33.72 PHYSICAL RECEIPT VALIDATION CHECKS PASSED SUCCESSFULLY! ✨');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
