// tests/test_step_33_74_isolated_physical_receipt_e2e.js
// Automated End-to-End Verification Suite for STEP 33.74:
// Isolated Physical Receipt Save & End-to-End Accounting Verification

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('========================================================================');
console.log('STEP 33.74: ISOLATED PHYSICAL RECEIPT END-TO-END VERIFICATION SUITE');
console.log('========================================================================\n');

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const fileHash = crypto.createHash('sha256').update(html).digest('hex').toUpperCase();

console.log(`Target Application: Temple_Accounts-1.html`);
console.log(`Measured Baseline SHA-256: ${fileHash}`);
console.log(`Expected Target SHA-256:   0B8FD7B183DAC834FB70B1DDAE1E090761AD29BFD31217AA7A95E1D2C6B9112C`);
console.log(`File Size on Disk: ${fs.statSync(htmlPath).size} bytes\n`);

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
// EXTRACT APPLICATION SCRIPT
// ----------------------------------------------------
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const fullScript = html.slice(scriptStart + 8, scriptEnd);

// ----------------------------------------------------
// DEMONSTRABLY ISOLATED IN-MEMORY FIRESTORE & STORAGE ENGINE
// ----------------------------------------------------
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
      chittyMembers: new Map(),
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

// Instantiate fresh in-memory mock store
const mockDb = new MockFirestore();
mockDb.useEmulator = () => {};

// Isolated authenticated user context
let currentUser = {
  uid: 'isolated_test_admin_uid',
  email: 'isolated_test@temple.local',
  displayName: 'Isolated Test Admin'
};

// Seed baseline settings and counters
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

// Baseline master categories
mockDb.collection('funds').doc('f1').set({ id: 1, name: 'General Temple Fund' });
mockDb.collection('funds').doc('f2').set({ id: 2, name: 'Punarudharanam Fund' });
mockDb.collection('incomeCategories').doc('c1').set({ id: 1, name: 'Pooja Income' });
mockDb.collection('incomeCategories').doc('c2').set({ id: 2, name: 'Donation Income' });
mockDb.collection('incomeCategories').doc('c3').set({ id: 3, name: 'Vazhipadu Income' });
mockDb.collection('bankAccounts').doc('b1').set({ id: 1, name: 'SBI Temple Account' });

// In-Memory IndexedDB Simulation
const mockIdbStores = {
  receipts: new Map(),
  settings: new Map(),
  funds: new Map(),
  incomeCategories: new Map(),
  bankAccounts: new Map(),
  payments: new Map(),
  transfers: new Map(),
  loans: new Map(),
  chittyMembers: new Map(),
  chittyCollections: new Map(),
  chittyPayouts: new Map()
};

async function putRec(storeName, obj) {
  if (!mockIdbStores[storeName]) mockIdbStores[storeName] = new Map();
  const id = obj.id !== undefined ? obj.id : obj.receiptNo;
  mockIdbStores[storeName].set(id, JSON.parse(JSON.stringify(obj)));
  return id;
}

async function getOne(storeName, id) {
  if (!mockIdbStores[storeName]) return null;
  return mockIdbStores[storeName].get(id) ? JSON.parse(JSON.stringify(mockIdbStores[storeName].get(id))) : null;
}

async function getAll(storeName) {
  if (!mockIdbStores[storeName]) return [];
  return Array.from(mockIdbStores[storeName].values()).map(x => JSON.parse(JSON.stringify(x)));
}

async function deleteRec(storeName, id) {
  if (mockIdbStores[storeName]) mockIdbStores[storeName].delete(id);
}

async function clearStore(storeName) {
  if (mockIdbStores[storeName]) mockIdbStores[storeName].clear();
}

// Complete mock IDBDatabase instance for synchronous storeTx calls
const mockIdbDatabase = {
  transaction: (storeName, mode) => {
    return {
      objectStore: (name) => {
        return {
          get: (id) => {
            const req = { onsuccess: null, onerror: null, result: null };
            setTimeout(() => {
              const val = mockIdbStores[name]?.get(id);
              req.result = val ? JSON.parse(JSON.stringify(val)) : undefined;
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          },
          getAll: () => {
            const req = { onsuccess: null, onerror: null, result: [] };
            setTimeout(() => {
              req.result = Array.from(mockIdbStores[name]?.values() || []).map(x => JSON.parse(JSON.stringify(x)));
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          },
          put: (item) => {
            const req = { onsuccess: null, onerror: null, result: item.id || item.receiptNo };
            setTimeout(() => {
              if (!mockIdbStores[name]) mockIdbStores[name] = new Map();
              mockIdbStores[name].set(item.id || item.receiptNo, JSON.parse(JSON.stringify(item)));
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          },
          delete: (id) => {
            const req = { onsuccess: null, onerror: null };
            setTimeout(() => {
              mockIdbStores[name]?.delete(id);
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          },
          clear: () => {
            const req = { onsuccess: null, onerror: null };
            setTimeout(() => {
              mockIdbStores[name]?.clear();
              if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
            return req;
          }
        };
      }
    };
  }
};

// Mock DOM elements and form controls
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
      querySelector: () => null,
      querySelectorAll: () => [],
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
  date: { value: '2026-10-17' },
  name: { value: 'Radhakrishnan Nair' },
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
  description: { value: 'Physical Receipt Test Description' },
  paymentMode: { value: 'Cash' },
  bankAccount: { value: '' },
  amount: { value: '250' },
  remarks: { value: 'Isolated E2E Test' }
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
    if (sel === 'input[name="receiptNo"]') return formElements.receiptNo;
    return null;
  },
  querySelectorAll: () => []
};

class MockFormData {
  constructor(f) { this.f = f; }
  get(key) { return formElements[key] ? formElements[key].value : null; }
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

let downloadedCSVRows = null;
let downloadedCSVTitle = null;

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
    apiKey: 'isolated-demo-api-key',
    projectId: 'demo-temple-isolated-test'
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
    prompt: (msg) => 'STEP 33.74 test void reason',
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    getComputedStyle: () => ({ animationName: 'none' }),
    location: loc,
    sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
    performance: { now: () => Date.now() },
    GlobalEditState: { setEditing: () => {}, clearEditing: () => {} },
    db: mockIdbDatabase
  },
  performance: { now: () => Date.now() },
  location: loc,
  navigator: {},
  prompt: (msg) => 'STEP 33.74 test void reason',
  el: (id) => {
    if (id === 'receiptForm') return mockReceiptForm;
    if (id === 'print-area') return printAreaElement;
    return getMockElement(id);
  },
  qsa: (sel) => [],
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  fmtDate: (d) => d || '',
  fmtMoney: (amt) => '₹' + (parseFloat(amt) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  alert: (msg) => {
    lastAlertMessage = msg;
    alertHistory.push(msg);
  },
  downloadCSV: (rows, filename) => {
    downloadedCSVRows = rows;
    downloadedCSVTitle = filename;
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
  indexedDB: {
    open: () => {
      const req = { onsuccess: null, onerror: null, result: mockIdbDatabase };
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
      return req;
    }
  },
  Blob: globalThis.Blob,
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
  // IDB global references
  db: mockIdbDatabase,
  putRec: putRec,
  getOne: getOne,
  getAll: getAll,
  deleteRec: deleteRec,
  clearStore: clearStore
};

sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.firebase = sandbox.firebase;
sandbox.window.firebaseConfig = sandbox.firebaseConfig;
sandbox.window.isEmulatorModeActive = sandbox.isEmulatorModeActive;
sandbox.window.el = sandbox.el;
sandbox.window.alert = sandbox.alert;
sandbox.window.FormData = MockFormData;
sandbox.window.indexedDB = sandbox.indexedDB;
sandbox.window.Blob = globalThis.Blob;
sandbox.window.putRec = putRec;
sandbox.window.getOne = getOne;
sandbox.window.getAll = getAll;
sandbox.window.deleteRec = deleteRec;
sandbox.window.clearStore = clearStore;
sandbox.window.downloadCSV = sandbox.downloadCSV;

vm.createContext(sandbox);

// Execute application code inside sandbox
vm.runInContext(fullScript, sandbox);

// Expose lexical VIEW_RENDERERS, wire db, and intercept downloadCSV
vm.runInContext(`
  window.VIEW_RENDERERS = VIEW_RENDERERS;
  try { db = window.db; } catch(e) {}
  const _origDownload = downloadCSV;
  downloadCSV = (rows, filename) => {
    window.downloadedCSVRows = rows;
    window.downloadedCSVTitle = filename;
    try { _origDownload(rows, filename); } catch(e) {}
  };
`, sandbox);

// Expose runtime application methods
const {
  allReceipts, activeReceipts, allFunds, allIncomeCategories,
  allBankAccounts, parsePhysicalReceiptIdentifier, parseGlobalNumber, formatGlobalNumber,
  computeReceiptFingerprint, generateOperationId, onReceiptNoInput, saveReceipt,
  printReceipt, reprintReceipt, voidRecord, fsCreatePhysicalReceipt,
  fsCreateIndependentReceipt, fsGetOneSafe, fsVoidRecordSafe, getCashBalance,
  getBankBalance, getFundBalance, getAllFundBalances, monthIncomeExpense,
  buildCashBookRows, buildBankBookRows, exportCSV
} = sandbox;

const VIEW_RENDERERS = sandbox.window.VIEW_RENDERERS;

async function main() {
  console.log('--- SECTION 1: Environment Isolation & Production Protection Assertions ---');

  // 1. Target project isolation
  recordTest('TC-33.74-01', 'Active Firebase project is not production (temple-f4f7)', 'Isolation',
    sandbox.firebaseConfig.projectId !== 'temple-f4f7' && sandbox.firebaseConfig.projectId !== 'temple-f4f7d',
    'demo-temple-isolated-test', sandbox.firebaseConfig.projectId);

  // 2. Data store memory isolation
  recordTest('TC-33.74-02', 'Storage backend is memory-resident Map instances', 'Isolation',
    mockDb.collections.receipts instanceof Map && mockDb.collections.system instanceof Map,
    true, true);

  // 3. No production network fall-through
  recordTest('TC-33.74-03', 'isEmulatorModeActive returns true for air-gapped isolation', 'Isolation',
    sandbox.isEmulatorModeActive(), true, true);

  // 4. Initial global sequence counter baseline
  const initialCounters = (await mockDb.collection('system').doc('counters').get()).data();
  recordTest('TC-33.74-04', 'Initial baseline globalSequenceCounter is exactly 42', 'Isolation',
    initialCounters.globalSequenceCounter === 42, 42, initialCounters.globalSequenceCounter);

  // 5. Initial billing collection is completely empty
  const initialBills = await mockDb.collection('billing').get();
  recordTest('TC-33.74-05', 'Initial billing collection has size 0', 'Isolation',
    initialBills.size === 0, 0, initialBills.size);

  // 6. Application baseline hash match
  recordTest('TC-33.74-06', 'Application file SHA-256 matches STEP 33.73 baseline', 'Integrity',
    fileHash === '0B8FD7B183DAC834FB70B1DDAE1E090761AD29BFD31217AA7A95E1D2C6B9112C',
    '0B8FD7B183DAC834FB70B1DDAE1E090761AD29BFD31217AA7A95E1D2C6B9112C', fileHash);


  console.log('\n--- SECTION 2: Save Workflow for Physical Puja Receipt (P600) ---');

  // Setup form inputs for P600
  formElements.receiptNo.value = 'P600';
  formElements.name.value = 'Radhakrishnan Nair';
  formElements.star.value = 'Rohini';
  formElements.mobile.value = '9876543210';
  formElements.amount.value = '250';
  formElements.paymentMode.value = 'Cash';
  formElements.date.value = '2026-10-17';
  formElements.editId.value = '';

  // Trigger UI validation
  onReceiptNoInput({ value: 'P600', form: mockReceiptForm });
  recordTest('TC-33.74-07', 'onReceiptNoInput for P600 detects Physical Puja Receipt', 'P600 Save',
    hintElement.innerHTML.includes('⚡ Physical Puja Receipt (P600) detected'), true, true);
  recordTest('TC-33.74-08', 'onReceiptNoInput for P600 selects General Temple Fund', 'P600 Save',
    formElements.fund.value === 'General Temple Fund', 'General Temple Fund', formElements.fund.value);
  recordTest('TC-33.74-09', 'onReceiptNoInput for P600 selects Pooja Income', 'P600 Save',
    formElements.category.value === 'Pooja Income', 'Pooja Income', formElements.category.value);

  // Execute actual Save handler
  printCallCount = 0;
  await saveReceipt(false);

  // Verify created authoritative receipt record
  const p600Doc = await mockDb.collection('receipts').doc('rcpt_phys_P600').get();
  recordTest('TC-33.74-10', 'Save handler creates authoritative receipts/rcpt_phys_P600', 'P600 Save',
    p600Doc.exists, true, p600Doc.exists);

  const p600Data = p600Doc.data() || {};
  recordTest('TC-33.74-11', 'rcpt_phys_P600 has correct receiptNo "P600"', 'P600 Save',
    p600Data.receiptNo === 'P600', 'P600', p600Data.receiptNo);
  recordTest('TC-33.74-12', 'rcpt_phys_P600 has isPhysical: true and physicalType: "P"', 'P600 Save',
    p600Data.isPhysical === true && p600Data.physicalType === 'P', true, `${p600Data.isPhysical}, ${p600Data.physicalType}`);
  recordTest('TC-33.74-13', 'rcpt_phys_P600 has fund: "General Temple Fund"', 'P600 Save',
    p600Data.fund === 'General Temple Fund', 'General Temple Fund', p600Data.fund);
  recordTest('TC-33.74-14', 'rcpt_phys_P600 has category: "Pooja Income"', 'P600 Save',
    p600Data.category === 'Pooja Income', 'Pooja Income', p600Data.category);
  recordTest('TC-33.74-15', 'rcpt_phys_P600 has devotee details (Name: Radhakrishnan Nair, Star: Rohini)', 'P600 Save',
    p600Data.name === 'Radhakrishnan Nair' && p600Data.star === 'Rohini', true, `${p600Data.name}, ${p600Data.star}`);
  recordTest('TC-33.74-16', 'rcpt_phys_P600 has amount: 250 and paymentMode: "Cash"', 'P600 Save',
    p600Data.amount === 250 && p600Data.paymentMode === 'Cash', true, `${p600Data.amount}, ${p600Data.paymentMode}`);
  recordTest('TC-33.74-17', 'rcpt_phys_P600 has source: "physical" and voided: false', 'P600 Save',
    p600Data.source === 'physical' && p600Data.voided === false, true, `${p600Data.source}, ${p600Data.voided}`);

  // Verify reservation document in system collection
  const p600Res = await mockDb.collection('system').doc('res_phys_P600').get();
  recordTest('TC-33.74-18', 'Save handler creates tracking record system/res_phys_P600', 'P600 Save',
    p600Res.exists, true, p600Res.exists);
  const p600ResData = p600Res.data() || {};
  recordTest('TC-33.74-19', 'system/res_phys_P600 has status: "active" and seqNumber: null', 'P600 Save',
    p600ResData.status === 'active' && p600ResData.seqNumber === null, true, `${p600ResData.status}, ${p600ResData.seqNumber}`);

  // Verify sequence counter isolation for P600
  const countersAfterP600 = (await mockDb.collection('system').doc('counters').get()).data();
  recordTest('TC-33.74-20', 'globalSequenceCounter in system/counters is UNTOUCHED (still 42)', 'P600 Isolation',
    countersAfterP600.globalSequenceCounter === 42, 42, countersAfterP600.globalSequenceCounter);
  recordTest('TC-33.74-21', 'Billing collection remains 0 documents (zero billing created)', 'P600 Isolation',
    (await mockDb.collection('billing').get()).size === 0, 0, 0);


  console.log('\n--- SECTION 3: Save Workflow for Physical Punarudharanam Receipt (PU1) ---');

  // Setup form inputs for PU1
  formElements.receiptNo.value = 'PU1';
  formElements.name.value = 'Parvathy Amma';
  formElements.star.value = 'Aswathi';
  formElements.mobile.value = '9847012345';
  formElements.amount.value = '1000';
  formElements.paymentMode.value = 'Cash';
  formElements.date.value = '2026-10-17';
  formElements.editId.value = '';

  // Trigger UI validation
  onReceiptNoInput({ value: 'PU1', form: mockReceiptForm });
  recordTest('TC-33.74-22', 'onReceiptNoInput for PU1 detects Physical Punarudharanam Receipt', 'PU1 Save',
    hintElement.innerHTML.includes('⚡ Physical Punarudharanam Receipt (PU1) detected'), true, true);
  recordTest('TC-33.74-23', 'onReceiptNoInput for PU1 selects Punarudharanam Fund', 'PU1 Save',
    formElements.fund.value === 'Punarudharanam Fund', 'Punarudharanam Fund', formElements.fund.value);
  recordTest('TC-33.74-24', 'onReceiptNoInput for PU1 selects Donation Income', 'PU1 Save',
    formElements.category.value === 'Donation Income', 'Donation Income', formElements.category.value);

  // Execute actual Save handler
  printCallCount = 0;
  await saveReceipt(false);

  // Verify created authoritative receipt record
  const pu1Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU1').get();
  recordTest('TC-33.74-25', 'Save handler creates authoritative receipts/rcpt_phys_PU1', 'PU1 Save',
    pu1Doc.exists, true, pu1Doc.exists);

  const pu1Data = pu1Doc.data() || {};
  recordTest('TC-33.74-26', 'rcpt_phys_PU1 has correct receiptNo "PU1"', 'PU1 Save',
    pu1Data.receiptNo === 'PU1', 'PU1', pu1Data.receiptNo);
  recordTest('TC-33.74-27', 'rcpt_phys_PU1 has isPhysical: true and physicalType: "PU"', 'PU1 Save',
    pu1Data.isPhysical === true && pu1Data.physicalType === 'PU', true, `${pu1Data.isPhysical}, ${pu1Data.physicalType}`);
  recordTest('TC-33.74-28', 'rcpt_phys_PU1 has fund: "Punarudharanam Fund"', 'PU1 Save',
    pu1Data.fund === 'Punarudharanam Fund', 'Punarudharanam Fund', pu1Data.fund);
  recordTest('TC-33.74-29', 'rcpt_phys_PU1 has category: "Donation Income"', 'PU1 Save',
    pu1Data.category === 'Donation Income', 'Donation Income', pu1Data.category);
  recordTest('TC-33.74-30', 'rcpt_phys_PU1 has devotee details (Name: Parvathy Amma, Star: Aswathi)', 'PU1 Save',
    pu1Data.name === 'Parvathy Amma' && pu1Data.star === 'Aswathi', true, `${pu1Data.name}, ${pu1Data.star}`);
  recordTest('TC-33.74-31', 'rcpt_phys_PU1 has amount: 1000 and paymentMode: "Cash"', 'PU1 Save',
    pu1Data.amount === 1000 && pu1Data.paymentMode === 'Cash', true, `${pu1Data.amount}, ${pu1Data.paymentMode}`);
  recordTest('TC-33.74-32', 'rcpt_phys_PU1 has source: "physical" and voided: false', 'PU1 Save',
    pu1Data.source === 'physical' && pu1Data.voided === false, true, `${pu1Data.source}, ${pu1Data.voided}`);

  // Verify reservation document in system collection
  const pu1Res = await mockDb.collection('system').doc('res_phys_PU1').get();
  recordTest('TC-33.74-33', 'Save handler creates tracking record system/res_phys_PU1', 'PU1 Save',
    pu1Res.exists, true, pu1Res.exists);
  const pu1ResData = pu1Res.data() || {};
  recordTest('TC-33.74-34', 'system/res_phys_PU1 has status: "active" and seqNumber: null', 'PU1 Save',
    pu1ResData.status === 'active' && pu1ResData.seqNumber === null, true, `${pu1ResData.status}, ${pu1ResData.seqNumber}`);

  // Verify sequence counter isolation for PU1
  const countersAfterPU1 = (await mockDb.collection('system').doc('counters').get()).data();
  recordTest('TC-33.74-35', 'globalSequenceCounter in system/counters is UNTOUCHED (still 42)', 'PU1 Isolation',
    countersAfterPU1.globalSequenceCounter === 42, 42, countersAfterPU1.globalSequenceCounter);
  recordTest('TC-33.74-36', 'Billing collection remains 0 documents (zero billing created)', 'PU1 Isolation',
    (await mockDb.collection('billing').get()).size === 0, 0, 0);


  console.log('\n--- SECTION 4: Independent Save & Print Workflows ---');

  // Test Case: P-series Save & Print (P601)
  formElements.receiptNo.value = 'P601';
  formElements.name.value = 'Anand Kumar';
  formElements.star.value = 'Makayiram';
  formElements.mobile.value = '9447112233';
  formElements.amount.value = '300';
  formElements.paymentMode.value = 'Cash';
  formElements.date.value = '2026-10-17';
  formElements.editId.value = '';

  onReceiptNoInput({ value: 'P601', form: mockReceiptForm });
  printCallCount = 0;
  printAreaElement.innerHTML = '';

  // Execute Save & Print
  await saveReceipt(true);

  recordTest('TC-33.74-37', 'Save & Print invoked print handler exactly once (printCallCount = 1)', 'Save & Print',
    printCallCount === 1, 1, printCallCount);

  const p601Doc = await mockDb.collection('receipts').doc('rcpt_phys_P601').get();
  recordTest('TC-33.74-38', 'rcpt_phys_P601 created in Firestore', 'Save & Print',
    p601Doc.exists, true, p601Doc.exists);

  recordTest('TC-33.74-39', 'Print preview contains [PHYSICAL PUJA RECEIPT] banner', 'Save & Print',
    printAreaElement.innerHTML.includes('[PHYSICAL PUJA RECEIPT]'), true, true);
  recordTest('TC-33.74-40', 'Print preview contains correct identifier No: P601', 'Save & Print',
    printAreaElement.innerHTML.includes('No: P601'), true, true);
  recordTest('TC-33.74-41', 'Print preview contains devotee Anand Kumar and star Makayiram', 'Save & Print',
    printAreaElement.innerHTML.includes('Anand Kumar') && printAreaElement.innerHTML.includes('Makayiram'), true, true);
  recordTest('TC-33.74-42', 'Print preview contains General Temple Fund — Pooja Income', 'Save & Print',
    printAreaElement.innerHTML.includes('General Temple Fund — Pooja Income'), true, true);
  recordTest('TC-33.74-43', 'Print preview contains amount ₹300.00 and words "Three Hundred Rupees only"', 'Save & Print',
    printAreaElement.innerHTML.includes('300.00') && printAreaElement.innerHTML.includes('Three Hundred Rupees only'), true, true);

  // Test Case: PU-series Save & Print (PU2)
  formElements.receiptNo.value = 'PU2';
  formElements.name.value = 'Lakshmi Pillai';
  formElements.star.value = 'Chithira';
  formElements.mobile.value = '9447556677';
  formElements.amount.value = '2500';
  formElements.paymentMode.value = 'Cash';
  formElements.date.value = '2026-10-17';
  formElements.editId.value = '';

  onReceiptNoInput({ value: 'PU2', form: mockReceiptForm });
  printCallCount = 0;
  printAreaElement.innerHTML = '';

  // Execute Save & Print
  await saveReceipt(true);

  recordTest('TC-33.74-44', 'Save & Print PU2 invoked print handler exactly once (printCallCount = 1)', 'Save & Print',
    printCallCount === 1, 1, printCallCount);

  const pu2Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU2').get();
  recordTest('TC-33.74-45', 'rcpt_phys_PU2 created in Firestore', 'Save & Print',
    pu2Doc.exists, true, pu2Doc.exists);

  recordTest('TC-33.74-46', 'Print preview contains [PHYSICAL · PUNARUDHARANAM RECEIPT] banner', 'Save & Print',
    printAreaElement.innerHTML.includes('[PHYSICAL · PUNARUDHARANAM RECEIPT]'), true, true);
  recordTest('TC-33.74-47', 'Print preview contains correct identifier No: PU2', 'Save & Print',
    printAreaElement.innerHTML.includes('No: PU2'), true, true);
  recordTest('TC-33.74-48', 'Print preview contains devotee Lakshmi Pillai and star Chithira', 'Save & Print',
    printAreaElement.innerHTML.includes('Lakshmi Pillai') && printAreaElement.innerHTML.includes('Chithira'), true, true);
  recordTest('TC-33.74-49', 'Print preview contains Punarudharanam Fund — Donation Income', 'Save & Print',
    printAreaElement.innerHTML.includes('Punarudharanam Fund — Donation Income'), true, true);
  recordTest('TC-33.74-50', 'Print preview contains amount ₹2,500.00 and words "Two Thousand Five Hundred Rupees only"', 'Save & Print',
    printAreaElement.innerHTML.includes('2,500.00') && printAreaElement.innerHTML.includes('Two Thousand Five Hundred Rupees only'), true, true);

  // Test Case: Bank/UPI payment mode physical receipt (PU3 with UPI)
  formElements.receiptNo.value = 'PU3';
  formElements.name.value = 'Gopinathan Nair';
  formElements.star.value = 'Anizham';
  formElements.mobile.value = '9847998877';
  formElements.amount.value = '5000';
  formElements.paymentMode.value = 'UPI';
  formElements.bankAccount.value = 'SBI Temple Account';
  formElements.date.value = '2026-10-17';
  formElements.editId.value = '';

  await saveReceipt(false);
  const pu3Doc = await mockDb.collection('receipts').doc('rcpt_phys_PU3').get();
  recordTest('TC-33.74-51', 'rcpt_phys_PU3 created with paymentMode: "UPI"', 'Save & Print',
    pu3Doc.exists && pu3Doc.data().paymentMode === 'UPI', true, true);


  console.log('\n--- SECTION 5: Accounting Ledger & Book Synchronization ---');

  // Verify Cash Book
  const cashRows = await buildCashBookRows();
  const cashClosing = cashRows.length ? cashRows[cashRows.length - 1].balance : 10000;
  const cashBalanceFn = await getCashBalance();

  recordTest('TC-33.74-52', 'Cash Book includes physical cash receipts P600, PU1, P601, PU2', 'Accounting',
    cashRows.some(r => r.particulars.includes('P600')) &&
    cashRows.some(r => r.particulars.includes('PU1')) &&
    cashRows.some(r => r.particulars.includes('P601')) &&
    cashRows.some(r => r.particulars.includes('PU2')),
    true, true);

  recordTest('TC-33.74-53', 'Cash Book strictly excludes bank/UPI physical receipt PU3', 'Accounting',
    !cashRows.some(r => r.particulars.includes('PU3')), true, true);

  // Opening 10000 + P600(250) + PU1(1000) + P601(300) + PU2(2500) = 14050
  recordTest('TC-33.74-54', 'Cash Book closing balance reflects exact sum (10000 + 4050 = 14050)', 'Accounting',
    cashClosing === 14050, 14050, cashClosing);
  recordTest('TC-33.74-55', 'getCashBalance() matches Cash Book closing balance (14050)', 'Accounting',
    cashBalanceFn === 14050, 14050, cashBalanceFn);

  // Verify Bank Book
  const bankRows = await buildBankBookRows();
  const bankClosing = bankRows.length ? bankRows[bankRows.length - 1].balance : 50000;
  const bankBalanceFn = await getBankBalance();

  recordTest('TC-33.74-56', 'Bank Book includes physical UPI receipt PU3 (deposit: 5000)', 'Accounting',
    bankRows.some(r => r.particulars.includes('PU3') && r.deposit === 5000), true, true);
  recordTest('TC-33.74-57', 'Bank Book excludes cash physical receipts P600, PU1, P601, PU2', 'Accounting',
    !bankRows.some(r => r.particulars.includes('P600') || r.particulars.includes('PU1')), true, true);
  recordTest('TC-33.74-58', 'Bank Book closing balance reflects deposit (50000 + 5000 = 55000)', 'Accounting',
    bankClosing === 55000, 55000, bankClosing);
  recordTest('TC-33.74-59', 'getBankBalance() matches Bank Book closing balance (55000)', 'Accounting',
    bankBalanceFn === 55000, 55000, bankBalanceFn);

  // Verify Fund Balances
  const genFundBal = await getFundBalance('General Temple Fund');
  const punFundBal = await getFundBalance('Punarudharanam Fund');

  // General Temple Fund: Opening 30000 + P600(250) + P601(300) = 30550
  recordTest('TC-33.74-60', 'General Temple Fund includes P600 and P601 (30000 + 550 = 30550)', 'Accounting',
    genFundBal === 30550, 30550, genFundBal);

  // Punarudharanam Fund: Opening 20000 + PU1(1000) + PU2(2500) + PU3(5000) = 28500
  recordTest('TC-33.74-61', 'Punarudharanam Fund includes PU1, PU2, PU3 (20000 + 8500 = 28500)', 'Accounting',
    punFundBal === 28500, 28500, punFundBal);

  // Verify General Ledger view
  const ledgerHtml = await VIEW_RENDERERS.ledger();
  const ledgerRows = sandbox.window._ledgerRows || [];
  const totalCredit = ledgerRows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const totalDebit = ledgerRows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);

  recordTest('TC-33.74-62', 'General Ledger includes all 5 physical receipts in credit rows', 'Accounting',
    ledgerRows.length === 5 && totalDebit === 0, true, `${ledgerRows.length} rows, debit: ${totalDebit}`);
  recordTest('TC-33.74-63', 'General Ledger total credits equal exactly 9050 (250+1000+300+2500+5000)', 'Accounting',
    totalCredit === 9050, 9050, totalCredit);

  // Monthly Income/Expense
  const monthTotals = await monthIncomeExpense('2026-10-01', '2026-10-31');
  recordTest('TC-33.74-64', 'monthIncomeExpense for October reflects total income 9050 and expense 0', 'Accounting',
    monthTotals.income === 9050 && monthTotals.expense === 0, true, `income: ${monthTotals.income}, expense: ${monthTotals.expense}`);

  // CSV Export Classification
  sandbox.window.downloadedCSVRows = null;
  await exportCSV('receipts');
  const downloadedCSVRows = sandbox.window.downloadedCSVRows;
  recordTest('TC-33.74-65', 'exportCSV("receipts") produces header row with Type and Status columns', 'Export',
    downloadedCSVRows && downloadedCSVRows[0].includes('Type') && downloadedCSVRows[0].includes('Status'), true, true);

  const csvRowsMap = new Map();
  if (downloadedCSVRows) {
    downloadedCSVRows.slice(1).forEach(r => csvRowsMap.set(r[0], { status: r[11], type: r[12] }));
  }

  recordTest('TC-33.74-66', 'CSV export classifies P600 as "Physical Puja"', 'Export',
    csvRowsMap.get('P600') && csvRowsMap.get('P600').type === 'Physical Puja', 'Physical Puja', csvRowsMap.get('P600')?.type);
  recordTest('TC-33.74-67', 'CSV export classifies PU1 as "Physical Punarudharanam"', 'Export',
    csvRowsMap.get('PU1') && csvRowsMap.get('PU1').type === 'Physical Punarudharanam', 'Physical Punarudharanam', csvRowsMap.get('PU1')?.type);
  recordTest('TC-33.74-68', 'CSV export marks active physical receipts with status "Active"', 'Export',
    csvRowsMap.get('P600')?.status === 'Active' && csvRowsMap.get('PU1')?.status === 'Active', true, true);


  console.log('\n--- SECTION 6: Duplicate, Idempotency & Void-State Resilience ---');

  // Attempt duplicate entry of P600
  formElements.receiptNo.value = 'P600';
  lastAlertMessage = null;
  await saveReceipt(false);
  recordTest('TC-33.74-69', 'Re-saving P600 is strictly blocked by pre-save duplicate check', 'Duplicate',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  // Attempt duplicate entry of PU1
  formElements.receiptNo.value = 'PU1';
  lastAlertMessage = null;
  await saveReceipt(false);
  recordTest('TC-33.74-70', 'Re-saving PU1 is strictly blocked by pre-save duplicate check', 'Duplicate',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  // Case & Whitespace variation duplicate tests
  formElements.receiptNo.value = 'p600';
  lastAlertMessage = null;
  await saveReceipt(false);
  recordTest('TC-33.74-71', 'Lowercase "p600" is normalized and rejected as duplicate', 'Duplicate',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  formElements.receiptNo.value = '  PU1  ';
  lastAlertMessage = null;
  await saveReceipt(false);
  recordTest('TC-33.74-72', 'Whitespace-padded "  PU1  " is trimmed and rejected as duplicate', 'Duplicate',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);

  // Idempotency replay test
  const existingPU2Doc = (await mockDb.collection('receipts').doc('rcpt_phys_PU2').get()).data();
  const pu2OpId = existingPU2Doc.operationId;
  const replayResult = await fsCreatePhysicalReceipt({
    ...existingPU2Doc,
    manualReceiptNo: 'PU2',
    receiptNo: 'PU2',
    operationId: pu2OpId
  });
  recordTest('TC-33.74-73', 'Idempotent replay with same operation ID returns isIdempotentReplay: true', 'Idempotency',
    replayResult.isIdempotentReplay === true, true, replayResult.isIdempotentReplay);

  // Voiding Workflow Verification
  await fsVoidRecordSafe('receipts', 'P600');
  const voidedP600Doc = (await mockDb.collection('receipts').doc('rcpt_phys_P600').get()).data();
  const voidedP600Res = (await mockDb.collection('system').doc('res_phys_P600').get()).data();

  recordTest('TC-33.74-74', 'Voiding P600 sets voided: true on authoritative receipt document', 'Void',
    voidedP600Doc.voided === true, true, voidedP600Doc.voided);
  recordTest('TC-33.74-75', 'Voiding P600 sets status: "voided" and voided: true on system/res_phys_P600', 'Void',
    voidedP600Res.status === 'voided' && voidedP600Res.voided === true, true, `${voidedP600Res.status}, ${voidedP600Res.voided}`);

  // Confirm voided receipt is excluded from active ledger
  const activeRcptsAfterVoid = await activeReceipts();
  recordTest('TC-33.74-76', 'activeReceipts() strictly excludes voided physical receipt P600', 'Void',
    !activeRcptsAfterVoid.some(r => r.receiptNo === 'P600'), true, true);

  const cashAfterVoid = await getCashBalance();
  // 14050 - 250 (P600) = 13800
  recordTest('TC-33.74-77', 'Cash balance immediately excludes voided receipt P600 (14050 - 250 = 13800)', 'Void',
    cashAfterVoid === 13800, 13800, cashAfterVoid);

  const genFundAfterVoid = await getFundBalance('General Temple Fund');
  // 30550 - 250 = 30300
  recordTest('TC-33.74-78', 'General Temple Fund immediately excludes voided receipt P600 (30550 - 250 = 30300)', 'Void',
    genFundAfterVoid === 30300, 30300, genFundAfterVoid);

  // Re-saving voided identifier is strictly blocked
  formElements.receiptNo.value = 'P600';
  lastAlertMessage = null;
  await saveReceipt(false);
  recordTest('TC-33.74-79', 'Attempt to re-enter voided identifier P600 is strictly rejected', 'Void',
    lastAlertMessage && lastAlertMessage.includes('already been entered or issued'), true, lastAlertMessage);


  console.log('\n--- SECTION 7: Software Receipt Sequence Preservation ---');

  // Verify counters were never touched
  const countersBeforeNormal = (await mockDb.collection('system').doc('counters').get()).data();
  recordTest('TC-33.74-80', 'Counters document remained at 42 through all physical receipt saves and voids', 'Sequence',
    countersBeforeNormal.globalSequenceCounter === 42, 42, countersBeforeNormal.globalSequenceCounter);

  // Save normal software receipt with blank number
  formElements.receiptNo.value = '';
  formElements.name.value = 'Normal Software Devotee';
  formElements.amount.value = '100';
  formElements.paymentMode.value = 'Cash';
  formElements.fund.value = 'General Temple Fund';
  formElements.category.value = 'Pooja Income';
  formElements.editId.value = '';

  await saveReceipt(false);

  const countersAfterNormal = (await mockDb.collection('system').doc('counters').get()).data();
  recordTest('TC-33.74-81', 'Normal software receipt cleanly advances globalSequenceCounter to 43', 'Sequence',
    countersAfterNormal.globalSequenceCounter === 43, 43, countersAfterNormal.globalSequenceCounter);

  const normalRcptDoc = await mockDb.collection('receipts').doc('rcpt_43').get();
  recordTest('TC-33.74-82', 'Normal receipt document rcpt_43 created with receiptNo "R-043"', 'Sequence',
    normalRcptDoc.exists && normalRcptDoc.data().receiptNo === 'R-043', true, normalRcptDoc.data()?.receiptNo);

  const normalResDoc = await mockDb.collection('system').doc('res_43').get();
  recordTest('TC-33.74-83', 'Normal reservation document res_43 created with seqNumber: 43', 'Sequence',
    normalResDoc.exists && normalResDoc.data().seqNumber === 43, true, normalResDoc.data()?.seqNumber);


  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${results.totalTests} | PASSED: ${results.passedTests} | FAILED: ${results.failedTests}`);
  console.log('========================================================================\n');

  const outPath = path.resolve(__dirname, 'step_33_74_test_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results saved to: ${outPath}\n`);

  if (results.failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Unhandled fatal error in STEP 33.74 test execution:', err);
  process.exit(1);
});
