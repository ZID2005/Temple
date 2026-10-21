/**
 * tests/test_step_33_180_receipt_quota_suite.js
 * Comprehensive automated regression & invariant test suite for:
 * STEP 33.180 — Diagnose Receipt Persistence Quota Exceeded Error
 *
 * Target: Temple_Accounts-1.html
 *
 * Verifies:
 * 1. Classification helpers: isFirestoreQuotaExceeded vs isBrowserStorageQuotaExceeded.
 * 2. Successful server commit followed by local cache quota failure (QuotaExceededError):
 *    - Cloud Firestore is treated as authoritative source.
 *    - Local cache failures do NOT cause successful server saves to appear failed.
 *    - Pending op is safely cleared; no duplicate number or receipt is allocated.
 * 3. Genuinely failed server transactions (Cloud Firestore resource-exhausted / quota limit):
 *    - Explicit Cloud Firestore quota alert displayed (informing user that no number was allocated).
 *    - Does NOT display misleading "click Save Receipt again to safely verify..." message.
 *    - No receipt document or reservation is left in Firestore.
 *    - Counters strictly preserved.
 * 4. Uncertain server outcomes (network drop/timeout) + Idempotent retry:
 *    - Pending operation ID is preserved in localStorage across uncertain failure.
 *    - Retry reuses the operation ID.
 *    - Recovers the existing committed record without creating duplicate receipts or reservations.
 *    - Zero duplicate accounting entries, zero counter leaks.
 * 5. Physical receipts (P600-P900, PU1+) under local cache quota failure:
 *    - Server commit authoritative, counter isolation preserved.
 * 6. System counter and invariant preservation across all error conditions.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.180: RECEIPT PERSISTENCE QUOTA EXCEEDED ERROR TEST SUITE');
console.log('='.repeat(80));

const HTML_FILE = path.resolve(__dirname, '../Temple_Accounts-1.html');
const htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

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

// =========================================================================
// MOCK FIRESTORE
// =========================================================================

class MockDocRef {
  constructor(db, colPath, docId) {
    this.db = db;
    this.colPath = colPath;
    this.id = String(docId);
  }

  async get() {
    return this.db._getDoc(this.colPath, this.id);
  }

  async set(data, options = {}) {
    return this.db._setDoc(this.colPath, this.id, data, options);
  }

  async update(data) {
    return this.db._setDoc(this.colPath, this.id, data, { merge: true });
  }

  async delete() {
    return this.db._deleteDoc(this.colPath, this.id);
  }
}

class MockCollectionRef {
  constructor(db, colPath) {
    this.db = db;
    this.colPath = colPath;
  }

  doc(id) {
    return new MockDocRef(this.db, this.colPath, String(id));
  }

  where(field, op, val) {
    return {
      limit: (n) => ({
        get: async () => {
          const allDocs = this.db._getCol(this.colPath).docs;
          const filtered = allDocs.filter(d => {
            const data = d.data();
            if (op === '==') return data && data[field] === val;
            return false;
          }).slice(0, n);
          return {
            empty: filtered.length === 0,
            docs: filtered,
            size: filtered.length
          };
        }
      })
    };
  }

  async get() {
    return this.db._getCol(this.colPath);
  }
}

class MockFirestore {
  constructor() {
    this.collections = new Map();
    this.versionMap = new Map();
    this._globalVersion = 0;
    this.simulateQuotaExceeded = false;
    this.simulateNetworkFailureAfterCommit = false;
  }

  _key(colPath, docId) {
    return `${colPath}/${docId}`;
  }

  _ensureCol(colPath) {
    if (!this.collections.has(colPath)) {
      this.collections.set(colPath, new Map());
    }
    return this.collections.get(colPath);
  }

  collection(colPath) {
    return new MockCollectionRef(this, colPath);
  }

  _getDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    const id = String(docId);
    const data = col.get(id);
    return {
      id,
      exists: col.has(id),
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
    };
  }

  _setDoc(colPath, docId, data, options = {}) {
    const col = this._ensureCol(colPath);
    const id = String(docId);
    let finalData;
    if (options.merge && col.has(id)) {
      finalData = Object.assign({}, col.get(id), JSON.parse(JSON.stringify(data)));
    } else {
      finalData = JSON.parse(JSON.stringify(data));
    }
    col.set(id, finalData);
    this._globalVersion++;
    this.versionMap.set(this._key(colPath, id), this._globalVersion);
    return Promise.resolve();
  }

  _deleteDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    const id = String(docId);
    col.delete(id);
    this._globalVersion++;
    this.versionMap.set(this._key(colPath, id), this._globalVersion);
    return Promise.resolve();
  }

  _getCol(colPath) {
    const col = this._ensureCol(colPath);
    const docs = Array.from(col.entries()).map(([id, data]) => ({
      id,
      exists: true,
      data: () => JSON.parse(JSON.stringify(data)),
      ref: new MockDocRef(this, colPath, id)
    }));
    return {
      empty: docs.length === 0,
      docs: docs,
      size: docs.length,
      forEach: (cb) => docs.forEach(cb)
    };
  }

  async runTransaction(updateFunction) {
    if (this.simulateQuotaExceeded) {
      const err = new Error('Quota exceeded.');
      err.code = 'resource-exhausted';
      err.details = 'Daily write/read operation quota exceeded for Cloud Firestore free tier.';
      throw err;
    }

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      const readVersions = new Map();
      const writeOps = [];

      const tx = {
        get: async (docRef) => {
          const k = this._key(docRef.colPath, docRef.id);
          readVersions.set(k, this.versionMap.get(k) || 0);
          return this._getDoc(docRef.colPath, docRef.id);
        },
        set: (docRef, data, options = {}) => {
          writeOps.push({ type: 'set', docRef, data, options });
        },
        update: (docRef, data) => {
          writeOps.push({ type: 'update', docRef, data });
        },
        delete: (docRef) => {
          writeOps.push({ type: 'delete', docRef });
        }
      };

      try {
        const result = await updateFunction(tx);

        let hasConflict = false;
        for (const [k, v] of readVersions.entries()) {
          const currentVer = this.versionMap.get(k) || 0;
          if (currentVer !== v) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) {
          if (attempts >= maxAttempts) {
            throw new Error(`Firestore concurrency conflict: exceeded max retry attempts (${maxAttempts}).`);
          }
          await new Promise(r => setTimeout(r, 5 * attempts));
          continue;
        }

        for (const op of writeOps) {
          if (op.type === 'set') {
            await op.docRef.set(op.data, op.options);
          } else if (op.type === 'update') {
            await op.docRef.update(op.data);
          } else if (op.type === 'delete') {
            await op.docRef.delete();
          }
        }

        if (this.simulateNetworkFailureAfterCommit) {
          // Commit succeeded on server, but response failed to return to client
          const netErr = new Error('Network connection closed before receiving server response');
          netErr.code = 'unavailable';
          throw netErr;
        }

        return result;
      } catch (err) {
        if (attempts >= maxAttempts || this.simulateNetworkFailureAfterCommit) throw err;
        await new Promise(r => setTimeout(r, 5 * attempts));
      }
    }
  }
}

// =========================================================================
// MOCK INDEXEDDB
// =========================================================================

class MockIndexedDB {
  constructor() {
    this.stores = new Map();
    this.simulateQuotaExceeded = false;
  }

  _ensureStore(name) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
    return this.stores.get(name);
  }

  async getOne(storeName, id) {
    const st = this._ensureStore(storeName);
    return st.has(String(id)) ? JSON.parse(JSON.stringify(st.get(String(id)))) : null;
  }

  async getAll(storeName) {
    const st = this._ensureStore(storeName);
    return Array.from(st.values()).map(v => JSON.parse(JSON.stringify(v)));
  }

  async putRec(storeName, rec) {
    if (this.simulateQuotaExceeded) {
      const err = new Error('QuotaExceededError: The quota has been exceeded for IndexedDB storage.');
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    }
    const st = this._ensureStore(storeName);
    const idKey = String(rec.id !== undefined ? rec.id : (rec.firestoreId || Date.now()));
    st.set(idKey, JSON.parse(JSON.stringify(rec)));
  }

  async deleteRec(storeName, id) {
    const st = this._ensureStore(storeName);
    st.delete(String(id));
  }

  async clearStore(storeName) {
    const st = this._ensureStore(storeName);
    st.clear();
  }
}

// =========================================================================
// SETUP VM ENVIRONMENT
// =========================================================================

const mockDb = new MockFirestore();
const mockIdb = new MockIndexedDB();
const currentUser = { uid: 'admin_user_01', displayName: 'Temple Admin', email: 'admin@temple.org' };

// Initial system counters
mockDb.collection('system').doc('counters').set({
  globalSequenceCounter: 50,
  billingReceiptCounter: 30,
  receiptCounter: 1050
});

const sampleFunds = [
  { id: 1, name: 'General Temple Fund' },
  { id: 2, name: 'Punarudharanam Fund' },
  { id: 3, name: 'Festival Fund' }
];

const sampleIncomeCats = [
  { id: 1, name: 'Pooja Income' },
  { id: 2, name: 'Donation Income' },
  { id: 3, name: 'Annadanam' }
];

const mockElements = new Map();

function getOrCreateElement(id) {
  if (!mockElements.has(id)) {
    mockElements.set(id, {
      id,
      value: '',
      disabled: false,
      readOnly: false,
      placeholder: '',
      innerHTML: '',
      style: {},
      dataset: {},
      options: [],
      selectedIndex: 0,
      setAttribute: function (k, v) { this[k] = v; },
      getAttribute: function (k) { return this[k] || null; },
      removeAttribute: function (k) { delete this[k]; },
      classList: {
        _classes: new Set(),
        add: function (c) { this._classes.add(c); },
        remove: function (c) { this._classes.delete(c); },
        contains: function (c) { return this._classes.has(c); },
        toggle: function (c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
      },
      querySelector: function (sel) {
        if (sel === '.rg-text') return { textContent: '' };
        return null;
      },
      addEventListener: function () {}
    });
  }
  return mockElements.get(id);
}

const context = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Date: Date,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  String: String,
  Array: Array,
  Number: Number,
  Math: Math,
  JSON: JSON,
  localStorage: {
    _data: new Map(),
    getItem: (k) => context.localStorage._data.get(k) || null,
    setItem: (k, v) => context.localStorage._data.set(k, String(v)),
    removeItem: (k) => context.localStorage._data.delete(k)
  },
  getCurrentFirebaseUser: () => currentUser,
  getFirestoreDb: () => mockDb,
  getFsCountersDocRef: () => mockDb.collection('system').doc('counters'),
  getDeterministicDocPrefix: (storeName) => {
    switch (storeName) {
      case 'billing': return 'bill_';
      case 'receipts': return 'rcpt_';
      case 'payments': return 'pmt_';
      default: return `${storeName}_`;
    }
  },
  deleteRec: async (store, id) => mockIdb.deleteRec(store, id),
  putRec: async (store, rec) => mockIdb.putRec(store, rec),
  getOne: async (store, id) => mockIdb.getOne(store, id),
  getAll: async (store) => mockIdb.getAll(store),
  clearStore: async (store) => mockIdb.clearStore(store),
  generateOperationId: (prefix = 'op') => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  todayISO: () => '2026-10-21',
  esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  fmtMoney: (a) => '₹' + parseFloat(a || 0).toFixed(2),
  fmtDate: (d) => String(d),
  currentFormData: new Map(),
  FormData: class {
    constructor(form) {
      this._map = context.currentFormData;
    }
    get(k) {
      return this._map.has(k) ? this._map.get(k) : null;
    }
  },
  el: (id) => getOrCreateElement(id),
  alertsHistory: [],
  alert: (msg) => {
    context.alertsHistory.push(msg);
  },
  closeModal: () => {},
  refreshSettings: async () => {},
  navigate: async () => {},
  refreshBillingHistory: async () => {},
  printReceipt: () => {},
  reprintReceipt: () => {},
  CURRENT_VIEW: 'receipts',
  GlobalEditState: {
    _editing: new Map(),
    isEditing: (mod) => context.GlobalEditState._editing.has(mod),
    getEditState: (mod) => context.GlobalEditState._editing.get(mod),
    setEditing: (mod, id, data = {}) => context.GlobalEditState._editing.set(mod, { id, ...data }),
    clearEditing: (mod) => context.GlobalEditState._editing.delete(mod)
  },
  getEditingRowClass: () => '',
  optsFromNames: (list, sel) => (list || []).map(item => {
    const val = typeof item === 'string' ? item : item.name;
    return `<option value="${context.esc(val)}" ${val === sel ? 'selected' : ''}>${context.esc(val)}</option>`;
  }).join(''),
  optSel: (val, sel) => `<option value="${context.esc(val)}" ${val === sel ? 'selected' : ''}>${context.esc(val)}</option>`,
  allFunds: async () => sampleFunds,
  allIncomeCategories: async () => sampleIncomeCats,
  allExpenseCategories: async () => [],
  allBankAccounts: async () => [{ id: 1, name: 'SBI Temple Main' }],
  nextReceiptNo: async () => 'R-051',
  getNextGlobalSequenceNo: async () => {
    const counters = (await mockDb.collection('system').doc('counters').get()).data() || {};
    return (parseInt(counters.globalSequenceCounter, 10) || 0) + 1;
  },
  formatGlobalNumber: (num, prefix = 'R-') => `${prefix}${String(num).padStart(3, '0')}`,
  parseGlobalNumber: (str) => {
    const m = String(str).match(/^R-(\d+)$/i);
    return m ? parseInt(m[1], 10) : null;
  },
  notVoided: (list) => (list || []).filter(item => !item.voided),
  sumField: (list, f) => (list || []).reduce((s, x) => s + (parseFloat(x[f]) || 0), 0),
  initMotionObserver: () => {},
  simpleList: (arr) => arr.join('; '),
  VIEW_RENDERERS: {},
  document: {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (sel) => null,
    querySelectorAll: () => []
  },
  qsa: () => [],
  window: {}
};

context.window = context;
vm.createContext(context);

// Balanced-brace function extractor
function extractFunction(name) {
  const regex = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = regex.exec(htmlContent);
  if (!match) throw new Error(`Function ${name} not found in HTML`);
  const startIdx = match.index;
  const argListStart = htmlContent.indexOf('(', startIdx);
  let openParens = 0;
  let argsEnd = argListStart;
  for (let i = argListStart; i < htmlContent.length; i++) {
    if (htmlContent[i] === '(') openParens++;
    else if (htmlContent[i] === ')') {
      openParens--;
      if (openParens === 0) {
        argsEnd = i;
        break;
      }
    }
  }

  let openBraces = 0;
  let bodyStart = htmlContent.indexOf('{', argsEnd);
  let endIdx = bodyStart;
  for (let i = bodyStart; i < htmlContent.length; i++) {
    if (htmlContent[i] === '{') openBraces++;
    else if (htmlContent[i] === '}') {
      openBraces--;
      if (openBraces === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return htmlContent.substring(startIdx, endIdx);
}

const functionsToExtract = [
  'isFirestoreQuotaExceeded',
  'isBrowserStorageQuotaExceeded',
  'parsePhysicalReceiptIdentifier',
  'resolveReceiptCategory',
  'resolveReceiptFund',
  'computeReceiptFingerprint',
  'computeReceiptFingerprintV1',
  'fsGetAllSafe',
  'fsGetOneSafe',
  'fsSaveRecordSafe',
  'fsUpdateRecordSafe',
  'fsCreatePhysicalReceipt',
  'fsCreateIndependentReceipt',
  'saveReceipt',
  'allReceipts',
  'activeReceipts'
];

for (const fn of functionsToExtract) {
  const code = extractFunction(fn);
  vm.runInContext(code, context);
}

function setFormData(obj) {
  context.currentFormData.clear();
  for (const [k, v] of Object.entries(obj)) {
    context.currentFormData.set(k, String(v));
  }
}

// Ensure mock buttons exist
getOrCreateElement('btn-save-receipt');
getOrCreateElement('btn-save-print-receipt');
getOrCreateElement('btn-block-receipt');
getOrCreateElement('receiptForm');

// =========================================================================
// RUN TESTS
// =========================================================================

async function runTestSuite() {
  // -----------------------------------------------------------------------
  // GROUP 1: Classification Helper Accuracy
  // -----------------------------------------------------------------------
  console.log('\n--- GROUP 1: Classification Helper Accuracy ---');

  const fsErrCode = { code: 'resource-exhausted', message: 'Quota exceeded.' };
  assert(context.isFirestoreQuotaExceeded(fsErrCode) === true, 'T1.1', 'isFirestoreQuotaExceeded returns true for code: resource-exhausted');

  const fsErrCodeCaps = { code: 'RESOURCE_EXHAUSTED', message: 'Quota limit reached' };
  assert(context.isFirestoreQuotaExceeded(fsErrCodeCaps) === true, 'T1.2', 'isFirestoreQuotaExceeded returns true for code: RESOURCE_EXHAUSTED');

  const fsErrMsg = { message: 'Cloud Firestore Quota exceeded for project' };
  assert(context.isFirestoreQuotaExceeded(fsErrMsg) === true, 'T1.3', 'isFirestoreQuotaExceeded returns true for message containing Firestore Quota exceeded');

  const browserErrDom = { name: 'QuotaExceededError', code: 22, message: 'The quota has been exceeded.' };
  assert(context.isFirestoreQuotaExceeded(browserErrDom) === false, 'T1.4', 'isFirestoreQuotaExceeded returns false for browser QuotaExceededError');

  const netErr = { code: 'unavailable', message: 'The service is currently unavailable.' };
  assert(context.isFirestoreQuotaExceeded(netErr) === false, 'T1.5', 'isFirestoreQuotaExceeded returns false for generic network unavailable');

  assert(context.isBrowserStorageQuotaExceeded(browserErrDom) === true, 'T1.6', 'isBrowserStorageQuotaExceeded returns true for name: QuotaExceededError');

  const browserErrCodeOnly = { code: 22, message: 'Storage error' };
  assert(context.isBrowserStorageQuotaExceeded(browserErrCodeOnly) === true, 'T1.7', 'isBrowserStorageQuotaExceeded returns true for code: 22');

  const firefoxQuotaErr = { name: 'NS_ERROR_DOM_QUOTA_REACHED', message: 'Persistent storage limit reached' };
  assert(context.isBrowserStorageQuotaExceeded(firefoxQuotaErr) === true, 'T1.8', 'isBrowserStorageQuotaExceeded returns true for NS_ERROR_DOM_QUOTA_REACHED');

  const storageMsgErr = new Error('QuotaExceededError: storage quota exceeded for indexeddb');
  assert(context.isBrowserStorageQuotaExceeded(storageMsgErr) === true, 'T1.9', 'isBrowserStorageQuotaExceeded returns true for indexeddb storage quota message');

  assert(context.isBrowserStorageQuotaExceeded(fsErrCode) === false, 'T1.10', 'isBrowserStorageQuotaExceeded returns false for Cloud Firestore quota error');

  // -----------------------------------------------------------------------
  // GROUP 2: Successful Firestore Commit + Local Cache Quota Failure
  // -----------------------------------------------------------------------
  console.log('\n--- GROUP 2: Successful Firestore Commit + Local Cache Quota Failure ---');

  // Configure mockIdb to throw QuotaExceededError on putRec
  mockIdb.simulateQuotaExceeded = true;
  mockDb.simulateQuotaExceeded = false;
  mockDb.simulateNetworkFailureAfterCommit = false;
  context.alertsHistory = [];
  context.isReceiptSaving = false;

  setFormData({
    name: 'Devotee Local Quota Test',
    date: '2026-10-21',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    paymentMode: 'Cash',
    amount: '500',
    description: 'Archana Pooja'
  });

  await context.saveReceipt(false);

  assert(context.isReceiptSaving === false, 'T2.1', 'window.isReceiptSaving is cleanly reset to false');
  assert(getOrCreateElement('btn-save-receipt').disabled === false, 'T2.2', 'Save button is re-enabled');

  // Check alert history: MUST NOT show "Unable to confirm receipt persistence: Quota exceeded"
  const quotaAlertShown = context.alertsHistory.some(a => String(a).includes('Unable to confirm receipt persistence'));
  assert(!quotaAlertShown, 'T2.3', 'saveReceipt did NOT display "Unable to confirm receipt persistence" alert on cache quota failure', `Alerts: ${JSON.stringify(context.alertsHistory)}`);

  // Check Firestore record: MUST exist authoritatively
  const rcpt51Snap = await mockDb.collection('receipts').doc('rcpt_51').get();
  assert(rcpt51Snap.exists === true, 'T2.4', 'Authoritative receipt document rcpt_51 exists in Cloud Firestore');
  const r51Data = rcpt51Snap.data();
  assert(r51Data.receiptNo === 'R-051', 'T2.5', 'Receipt document has allocated sequential receiptNo R-051', r51Data.receiptNo);
  assert(r51Data.amount === 500, 'T2.6', 'Receipt document has correct amount 500', r51Data.amount);

  // Check Firestore reservation
  const res51Snap = await mockDb.collection('system').doc('res_51').get();
  assert(res51Snap.exists === true, 'T2.7', 'Reservation document res_51 exists in Cloud Firestore');

  // Check pending operation in localStorage: MUST be removed
  const pendingOp = context.localStorage.getItem('temple_pending_receipt_op');
  assert(pendingOp === null, 'T2.8', 'localStorage pending operation marker is safely cleared after Firestore commit');

  // Global counter updated
  const countersSnap = await mockDb.collection('system').doc('counters').get();
  assert(countersSnap.data().globalSequenceCounter === 51, 'T2.9', 'globalSequenceCounter advanced to 51', countersSnap.data().globalSequenceCounter);

  // Restore mockIdb
  mockIdb.simulateQuotaExceeded = false;

  // -----------------------------------------------------------------------
  // GROUP 3: Genuinely Failed Server Transaction (Cloud Firestore Quota Exceeded)
  // -----------------------------------------------------------------------
  console.log('\n--- GROUP 3: Genuinely Failed Server Transaction (Cloud Firestore Quota Exceeded) ---');

  mockDb.simulateQuotaExceeded = true;
  mockIdb.simulateQuotaExceeded = false;
  context.alertsHistory = [];
  context.isReceiptSaving = false;

  setFormData({
    name: 'Devotee Cloud Quota Test',
    date: '2026-10-21',
    fund: 'Festival Fund',
    category: 'Donation Income',
    paymentMode: 'Cash',
    amount: '1000',
    description: 'Festival Donation'
  });

  await context.saveReceipt(false);

  assert(context.isReceiptSaving === false, 'T3.1', 'window.isReceiptSaving is cleanly reset to false on Firestore quota failure');
  assert(getOrCreateElement('btn-save-receipt').disabled === false, 'T3.2', 'Save button re-enabled on Firestore quota failure');

  // Alert must inform user of Cloud Firestore quota exhaustion
  const cloudQuotaAlert = context.alertsHistory.find(a => String(a).includes('Cloud Firestore storage/operation quota exceeded'));
  assert(!!cloudQuotaAlert, 'T3.3', 'Explicit Cloud Firestore storage/operation quota exceeded alert was displayed');

  // Alert must clarify no receipt number was allocated and not advise retrying
  assert(String(cloudQuotaAlert).includes('No receipt number has been allocated'), 'T3.4', 'Alert clarifies that no receipt number has been allocated');
  assert(!String(cloudQuotaAlert).includes('clicking Save Receipt again will safely verify and recover'), 'T3.5', 'Alert does NOT give false recovery instructions');

  // Verify rcpt_52 was NOT created
  const rcpt52Snap = await mockDb.collection('receipts').doc('rcpt_52').get();
  assert(rcpt52Snap.exists === false, 'T3.6', 'Receipt doc rcpt_52 was NOT created in Firestore');

  // Verify res_52 was NOT created
  const res52Snap = await mockDb.collection('system').doc('res_52').get();
  assert(res52Snap.exists === false, 'T3.7', 'Reservation doc res_52 was NOT created in Firestore');

  // Global sequence counter remains 51
  const countersAfterFailed = (await mockDb.collection('system').doc('counters').get()).data();
  assert(countersAfterFailed.globalSequenceCounter === 51, 'T3.8', 'globalSequenceCounter strictly NOT incremented (remains 51)', countersAfterFailed.globalSequenceCounter);

  mockDb.simulateQuotaExceeded = false;

  // -----------------------------------------------------------------------
  // GROUP 4: Uncertain Server Outcome & Idempotent Retry
  // -----------------------------------------------------------------------
  console.log('\n--- GROUP 4: Uncertain Server Outcome & Idempotent Retry ---');

  mockDb.simulateNetworkFailureAfterCommit = true;
  mockIdb.simulateQuotaExceeded = false;
  context.alertsHistory = [];
  context.isReceiptSaving = false;

  const retryFormData = {
    name: 'Devotee Retry Idempotent Test',
    date: '2026-10-21',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'Cash',
    amount: '750',
    description: 'Temple Restoration Contribution'
  };
  setFormData(retryFormData);

  // First attempt: commits on server, but throws network error to client
  await context.saveReceipt(false);

  assert(context.isReceiptSaving === false, 'T4.1', 'window.isReceiptSaving reset to false after network drop');
  const netDropAlert = context.alertsHistory.find(a => String(a).includes('Unable to confirm receipt persistence'));
  assert(!!netDropAlert, 'T4.2', 'Displays "Unable to confirm receipt persistence" alert with recovery instructions on uncertain network drop');

  // The server committed rcpt_52
  const rcpt52ServerSnap = await mockDb.collection('receipts').doc('rcpt_52').get();
  assert(rcpt52ServerSnap.exists === true, 'T4.3', 'rcpt_52 committed on server before network drop');

  // localStorage pending op marker must still be present
  const pendingOpRaw = context.localStorage.getItem('temple_pending_receipt_op');
  assert(!!pendingOpRaw, 'T4.4', 'Pending operation marker preserved in localStorage for idempotent retry');
  const pendingObj = JSON.parse(pendingOpRaw);
  const originalOpId = pendingObj.operationId;
  assert(typeof originalOpId === 'string' && originalOpId.startsWith('op_rcpt'), 'T4.5', 'Pending op ID is valid', originalOpId);

  // Counter advanced to 52 by first commit
  const countersMid = (await mockDb.collection('system').doc('counters').get()).data();
  assert(countersMid.globalSequenceCounter === 52, 'T4.6', 'globalSequenceCounter is 52 after first server commit');

  // Second attempt (User clicks Save Receipt again)
  mockDb.simulateNetworkFailureAfterCommit = false;
  context.alertsHistory = [];
  setFormData(retryFormData);

  await context.saveReceipt(false);

  assert(context.isReceiptSaving === false, 'T4.7', 'window.isReceiptSaving reset to false after successful retry recovery');
  assert(context.alertsHistory.length === 0, 'T4.8', 'Retry completed with NO error alerts');

  // Pending operation marker removed
  const pendingAfterRetry = context.localStorage.getItem('temple_pending_receipt_op');
  assert(pendingAfterRetry === null, 'T4.9', 'Pending operation marker cleared after successful recovery');

  // Verify rcpt_53 does NOT exist (no duplicate number or document allocated!)
  const rcpt53Snap = await mockDb.collection('receipts').doc('rcpt_53').get();
  assert(rcpt53Snap.exists === false, 'T4.10', 'rcpt_53 strictly does NOT exist (zero duplicate receipt allocated)');

  // Verify res_53 does NOT exist
  const res53Snap = await mockDb.collection('system').doc('res_53').get();
  assert(res53Snap.exists === false, 'T4.11', 'res_53 strictly does NOT exist');

  // Global counter strictly remains 52 (NO second increment)
  const countersFinal = (await mockDb.collection('system').doc('counters').get()).data();
  assert(countersFinal.globalSequenceCounter === 52, 'T4.12', 'globalSequenceCounter strictly remains 52 (zero duplicate counter increment)', countersFinal.globalSequenceCounter);

  // -----------------------------------------------------------------------
  // GROUP 5: Physical Receipts Under Local Cache Quota Failure
  // -----------------------------------------------------------------------
  console.log('\n--- GROUP 5: Physical Receipts Under Local Cache Quota Failure ---');

  mockIdb.simulateQuotaExceeded = true;
  mockDb.simulateQuotaExceeded = false;
  mockDb.simulateNetworkFailureAfterCommit = false;
  context.alertsHistory = [];
  context.isReceiptSaving = false;

  setFormData({
    receiptNo: 'P650',
    name: 'Devotee Physical Quota Test',
    date: '2026-10-21',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    paymentMode: 'Cash',
    amount: '250',
    description: 'Physical Book Archana'
  });

  await context.saveReceipt(false);

  assert(context.isReceiptSaving === false, 'T5.1', 'window.isReceiptSaving reset to false on physical receipt save');
  const physAlertShown = context.alertsHistory.some(a => String(a).includes('Unable to confirm receipt persistence'));
  assert(!physAlertShown, 'T5.2', 'Physical receipt save does NOT fail when local cache throws quota error');

  // Authoritative physical receipt in Firestore
  const physSnap = await mockDb.collection('receipts').doc('rcpt_phys_P650').get();
  assert(physSnap.exists === true, 'T5.3', 'Physical receipt rcpt_phys_P650 exists in Cloud Firestore');

  const physResSnap = await mockDb.collection('system').doc('res_phys_P650').get();
  assert(physResSnap.exists === true, 'T5.4', 'Physical reservation res_phys_P650 exists in Cloud Firestore');

  // Counter isolation: globalSequenceCounter remains 52
  const countersPhys = (await mockDb.collection('system').doc('counters').get()).data();
  assert(countersPhys.globalSequenceCounter === 52, 'T5.5', 'globalSequenceCounter strictly isolated from physical receipts (remains 52)');

  // Clear pending physical op marker
  const pendingPhysOp = context.localStorage.getItem('temple_pending_phys_receipt_op');
  assert(pendingPhysOp === null, 'T5.6', 'temple_pending_phys_receipt_op cleanly cleared from localStorage');

  mockIdb.simulateQuotaExceeded = false;

  // -----------------------------------------------------------------------
  // GROUP 6: Invariant & Counter Verification
  // -----------------------------------------------------------------------
  console.log('\n--- GROUP 6: Invariant & Counter Verification ---');

  const finalCounters = (await mockDb.collection('system').doc('counters').get()).data();
  assert(finalCounters.globalSequenceCounter === 52, 'T6.1', 'globalSequenceCounter is exactly 52');
  assert(finalCounters.billingReceiptCounter === 30, 'T6.2', 'billingReceiptCounter is untouched at 30');
  assert(finalCounters.receiptCounter === 1050, 'T6.3', 'receiptCounter is untouched at 1050');

  // Total receipts in Firestore collection: rcpt_51, rcpt_52, rcpt_phys_P650
  const allRcptDocs = (await mockDb.collection('receipts').get()).docs;
  assert(allRcptDocs.length === 3, 'T6.4', 'Total receipt documents in Firestore is exactly 3 (no duplicate docs)', allRcptDocs.length);

  // Total reservations in system: res_51, res_52, res_phys_P650
  const allSystemDocs = (await mockDb.collection('system').get()).docs;
  const reservations = allSystemDocs.filter(d => d.id.startsWith('res_'));
  assert(reservations.length === 3, 'T6.5', 'Total reservations in Firestore is exactly 3 (no orphaned reservations)', reservations.length);

  // =======================================================================
  // SUMMARY
  // =======================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.180 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
