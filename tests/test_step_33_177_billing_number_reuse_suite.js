/**
 * tests/test_step_33_177_billing_number_reuse_suite.js
 * Comprehensive automated regression & invariant test suite for:
 * STEP 33.177 — Reuse Deleted Billing Receipt Numbers Safely
 *
 * Verifies all 7 required scenarios:
 * 1. Existing bills BILL-001 through BILL-013 with deleted gaps through BILL-024.
 * 2. The next bill receiving BILL-014.
 * 3. Subsequent allocation filling eligible gaps without creating duplicates.
 * 4. Voided bills retaining their numbers.
 * 5. Existing and concurrent reservations preventing duplicate allocation.
 * 6. Deletion of a bill with a linked accounting receipt.
 * 7. Counter and sequence isolation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.177: REUSE DELETED BILLING RECEIPT NUMBERS SAFELY TEST SUITE');
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
// MOCK FIRESTORE WITH TRANSACTIONS & CONCURRENCY
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
            size: filtered.length,
            forEach: (cb) => filtered.forEach(cb)
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
    this.collections = {
      billing: new Map(),
      receipts: new Map(),
      payments: new Map(),
      transfers: new Map(),
      loans: new Map(),
      funds: new Map(),
      incomeCategories: new Map(),
      bankAccounts: new Map(),
      system: new Map()
    };
    this.versionMap = new Map(); // "col/id" -> version
    this._globalVersion = 0;
  }

  _key(col, id) {
    return `${col}/${id}`;
  }

  _ensureCol(colPath) {
    if (!this.collections[colPath]) {
      this.collections[colPath] = new Map();
    }
    return this.collections[colPath];
  }

  collection(colPath) {
    return new MockCollectionRef(this, colPath);
  }

  _getDoc(colPath, docId) {
    const col = this._ensureCol(colPath);
    const data = col.get(String(docId));
    return {
      id: String(docId),
      exists: data !== undefined,
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

  batch() {
    const ops = [];
    return {
      set: (docRef, data, options = {}) => {
        ops.push({ type: 'set', docRef, data, options });
      },
      update: (docRef, data) => {
        ops.push({ type: 'update', docRef, data });
      },
      delete: (docRef) => {
        ops.push({ type: 'delete', docRef });
      },
      commit: async () => {
        for (const op of ops) {
          if (op.type === 'set') await op.docRef.set(op.data, op.options);
          else if (op.type === 'update') await op.docRef.update(op.data);
          else if (op.type === 'delete') await op.docRef.delete();
        }
      }
    };
  }

  async runTransaction(updateFunction) {
    let attempts = 0;
    const maxAttempts = 5;

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

        // Verify optimistic concurrency: no document read by tx was modified elsewhere
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
          // Exponential backoff like real Firestore SDK
          await new Promise(r => setTimeout(r, 10 * attempts));
          continue;
        }

        // Apply writes
        for (const op of writeOps) {
          if (op.type === 'set') {
            await op.docRef.set(op.data, op.options);
          } else if (op.type === 'update') {
            await op.docRef.update(op.data);
          } else if (op.type === 'delete') {
            await op.docRef.delete();
          }
        }

        return result;
      } catch (err) {
        if (err.message && err.message.includes('concurrency conflict') && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 10 * attempts));
          continue;
        }
        throw err;
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
// VM HARNESS SETUP
// =========================================================================

const mockDb = new MockFirestore();
const mockIdb = new MockIndexedDB();
const currentUser = { uid: 'admin_user_01', displayName: 'Temple Admin', email: 'admin@temple.org' };

const sampleFunds = [
  { id: 1, name: 'General Temple Fund', firestoreId: 'fund_1' },
  { id: 2, name: 'Punarudharanam Fund', firestoreId: 'fund_2' }
];

// Initialize funds in mockDb
sampleFunds.forEach(f => {
  mockDb.collection('funds').doc(f.firestoreId).set(f);
});

const sampleIncomeCats = [
  { id: 1, name: 'Pooja Income' },
  { id: 2, name: 'Donation Income' }
];

const mockElements = new Map();

function getOrCreateElement(id) {
  if (!mockElements.has(id)) {
    mockElements.set(id, {
      id,
      value: '',
      disabled: false,
      style: {},
      dataset: {},
      options: [],
      selectedIndex: 0,
      setAttribute: () => {},
      getAttribute: () => null,
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      focus: () => {}
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
  Set: Set,
  Map: Map,
  RegExp: RegExp,
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
  el: (id) => getOrCreateElement(id),
  alert: (msg) => { context._lastAlert = msg; },
  closeModal: () => {},
  allFunds: async () => sampleFunds,
  allIncomeCategories: async () => sampleIncomeCats,
  allBillingRecords: async () => mockIdb.getAll('billing'),
  allReceipts: async () => mockIdb.getAll('receipts'),
  showFeedback: () => {},
  renderBillingReceiptPreview: () => {},
  document: {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: () => null,
    querySelectorAll: () => []
  },
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

  let openBraces = 0;
  let bodyStart = htmlContent.indexOf('{', startIdx);
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

// Extract core functions directly from Temple_Accounts-1.html
const fnsToExtract = [
  'formatGlobalNumber',
  'parseGlobalNumber',
  'getNextGlobalSequenceNo',
  'computeBillingFingerprint',
  'computeBillingFingerprintV1',
  'computeReceiptFingerprint',
  'computeReceiptFingerprintV1',
  'getBillingRecordISODate',
  'getOccupiedBillingSequenceNumbers',
  'getNextAvailableBillingSeq',
  'getNextBillingReceiptNo',
  'fsNextBillingReceiptNo',
  'fsGetCounters',
  'fsCreateBillingWithAccounting',
  'fsDeleteBillingRecord',
  'fsDeleteReceiptRecord',
  'fsVoidLinkedBillingAndReceipt',
  'fsCreateIndependentReceipt',
  'fsCreatePhysicalReceipt',
  'parsePhysicalReceiptIdentifier'
];

for (const fn of fnsToExtract) {
  try {
    const code = extractFunction(fn);
    vm.runInContext(code, context);
  } catch (err) {
    console.error(`Failed to extract and run ${fn}:`, err);
    throw err;
  }
}

// =========================================================================
// TEST EXECUTION
// =========================================================================

async function runTestSuite() {
  console.log('\n--- SETUP: Populating BILL-001 through BILL-013 and BILL-025, with deleted gap 14..24 ---');

  // Initialize counters
  await mockDb.collection('system').doc('counters').set({
    globalSequenceCounter: 25,
    billingReceiptCounter: 25,
    receiptCounter: 1000,
    voucherCounter: 0,
    billingPrefix: 'BILL-',
    receiptPrefix: 'R-'
  });

  // Populate bills 1..13
  for (let i = 1; i <= 13; i++) {
    const pad = String(i).padStart(3, '0');
    const billDoc = {
      id: i,
      receiptNo: `BILL-${pad}`,
      date: '2026-10-21',
      fund: 'General Temple Fund',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: `Devotee ${i}`,
      accountingReceiptId: `rcpt_${i}`,
      accountingReceiptNo: `R-${pad}`,
      reservationDocId: `res_${i}`,
      voided: false
    };
    const rcptDoc = {
      id: i,
      receiptNo: `R-${pad}`,
      billingReceiptNo: `BILL-${pad}`,
      billingId: i,
      source: 'billing',
      amount: 20,
      fund: 'General Temple Fund',
      voided: false
    };
    const resDoc = {
      seqNumber: i,
      formattedNo: pad,
      billReceiptNo: `BILL-${pad}`,
      receiptNo: `R-${pad}`,
      status: 'active',
      voided: false
    };

    await mockDb.collection('billing').doc(`bill_${i}`).set(billDoc);
    await mockDb.collection('receipts').doc(`rcpt_${i}`).set(rcptDoc);
    await mockDb.collection('system').doc(`res_${i}`).set(resDoc);

    await mockIdb.putRec('billing', billDoc);
    await mockIdb.putRec('receipts', rcptDoc);
  }

  // Populate bill 25 (with gap 14..24 permanently deleted)
  {
    const i = 25;
    const pad = '025';
    const billDoc = {
      id: i,
      receiptNo: `BILL-${pad}`,
      date: '2026-10-21',
      fund: 'General Temple Fund',
      item: 'അർച്ചന',
      totalAmount: 30,
      paymentMode: 'Cash',
      devoteeName: `Devotee ${i}`,
      accountingReceiptId: `rcpt_${i}`,
      accountingReceiptNo: `R-${pad}`,
      reservationDocId: `res_${i}`,
      voided: false
    };
    const rcptDoc = {
      id: i,
      receiptNo: `R-${pad}`,
      billingReceiptNo: `BILL-${pad}`,
      billingId: i,
      source: 'billing',
      amount: 30,
      fund: 'General Temple Fund',
      voided: false
    };
    const resDoc = {
      seqNumber: i,
      formattedNo: pad,
      billReceiptNo: `BILL-${pad}`,
      receiptNo: `R-${pad}`,
      status: 'active',
      voided: false
    };

    await mockDb.collection('billing').doc(`bill_${i}`).set(billDoc);
    await mockDb.collection('receipts').doc(`rcpt_${i}`).set(rcptDoc);
    await mockDb.collection('system').doc(`res_${i}`).set(resDoc);

    await mockIdb.putRec('billing', billDoc);
    await mockIdb.putRec('receipts', rcptDoc);
  }

  console.log('\n--- SCENARIO 1: Existing bills BILL-001..013 with deleted gaps 14..24 ---');
  {
    // Verify gap 14..24 are absent from Firestore
    for (let i = 14; i <= 24; i++) {
      const bSnap = await mockDb.collection('billing').doc(`bill_${i}`).get();
      const rSnap = await mockDb.collection('receipts').doc(`rcpt_${i}`).get();
      const resSnap = await mockDb.collection('system').doc(`res_${i}`).get();
      assert(!bSnap.exists && !rSnap.exists && !resSnap.exists, `S1.gap_${i}`, `Gap ${i} is completely free in Firestore`);
    }

    const occupied = await context.getOccupiedBillingSequenceNumbers();
    assert(occupied.has(13), 'S1.1', 'Occupied numbers set includes BILL-013');
    assert(occupied.has(25), 'S1.2', 'Occupied numbers set includes BILL-025');
    assert(!occupied.has(14), 'S1.3', 'Occupied numbers set DOES NOT include deleted gap 14');
    assert(!occupied.has(24), 'S1.4', 'Occupied numbers set DOES NOT include deleted gap 24');

    const nextSeq = await context.getNextAvailableBillingSeq();
    assert(nextSeq === 14, 'S1.5', 'getNextAvailableBillingSeq identifies 14 as lowest available sequence', `nextSeq=${nextSeq}`);

    const preview = await context.getNextBillingReceiptNo();
    assert(preview === 'BILL-014', 'S1.6', 'getNextBillingReceiptNo returns BILL-014', preview);

    const fsPreview = await context.fsNextBillingReceiptNo();
    assert(fsPreview === 'BILL-014', 'S1.7', 'fsNextBillingReceiptNo returns BILL-014', fsPreview);

    const counters = await context.fsGetCounters();
    assert(counters.globalSequenceCounter === 25, 'S1.8', 'globalSequenceCounter remains 25 (counters preserved)', `gsc=${counters.globalSequenceCounter}`);
  }

  console.log('\n--- SCENARIO 2: Next bill receiving BILL-014 ---');
  {
    const billInput = {
      date: '2026-10-21',
      time: '10:00 AM',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      incomeCategory: 'Pooja Income',
      item: 'നൂൽജപം',
      quantity: 1,
      unitPrice: 20,
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 14 Gap Reuser'
    };

    const res = await context.fsCreateBillingWithAccounting(billInput);
    assert(res && res.billingRecord, 'S2.1', 'Bill created successfully');
    assert(res.billingRecord.id === 14, 'S2.2', 'Bill assigned numeric ID 14', `id=${res.billingRecord.id}`);
    assert(res.billingRecord.receiptNo === 'BILL-014', 'S2.3', 'Bill assigned receiptNo BILL-014', res.billingRecord.receiptNo);
    assert(res.accountingReceipt.receiptNo === 'R-014', 'S2.4', 'Linked accounting receipt assigned R-014', res.accountingReceipt.receiptNo);
    assert(res.reservationRecord.seqNumber === 14, 'S2.5', 'System reservation document res_14 created with seq 14', `seq=${res.reservationRecord.seqNumber}`);

    // Verify Firestore documents
    const bSnap = await mockDb.collection('billing').doc('bill_14').get();
    const rSnap = await mockDb.collection('receipts').doc('rcpt_14').get();
    const resSnap = await mockDb.collection('system').doc('res_14').get();
    assert(bSnap.exists, 'S2.6', 'bill_14 document exists in Firestore');
    assert(rSnap.exists, 'S2.7', 'rcpt_14 document exists in Firestore');
    assert(resSnap.exists, 'S2.8', 'res_14 reservation document exists in Firestore');

    // Verify counter integrity: globalSequenceCounter must NOT be decreased to 14!
    const counters = await context.fsGetCounters();
    assert(counters.globalSequenceCounter === 25, 'S2.9', 'globalSequenceCounter preserved at 25 (NOT reset to 14)', `gsc=${counters.globalSequenceCounter}`);
    assert(counters.billingReceiptCounter === 25, 'S2.10', 'billingReceiptCounter preserved at 25', `brc=${counters.billingReceiptCounter}`);
  }

  console.log('\n--- SCENARIO 3: Subsequent allocation filling eligible gaps without creating duplicates ---');
  {
    // Fill remaining gaps: 15 through 24
    for (let expected = 15; expected <= 24; expected++) {
      const pad = String(expected).padStart(3, '0');
      const preview = await context.getNextBillingReceiptNo();
      assert(preview === `BILL-${pad}`, `S3.prev_${expected}`, `Preview shows BILL-${pad}`, preview);

      const res = await context.fsCreateBillingWithAccounting({
        date: '2026-10-21',
        time: '10:05 AM',
        fund: 'General Temple Fund',
        category: 'വഴിപാട്',
        item: 'നൂൽജപം',
        quantity: 1,
        unitPrice: 20,
        totalAmount: 20,
        paymentMode: 'Cash',
        devoteeName: `Devotee ${expected}`
      });

      assert(res.billingRecord.id === expected, `S3.alloc_${expected}`, `Bill assigned numeric ID ${expected}`, `id=${res.billingRecord.id}`);
      assert(res.billingRecord.receiptNo === `BILL-${pad}`, `S3.num_${expected}`, `Bill receiptNo is BILL-${pad}`, res.billingRecord.receiptNo);

      // Verify counter remains at 25 while filling middle gaps
      const c = await context.fsGetCounters();
      assert(c.globalSequenceCounter === 25, `S3.c_${expected}`, `globalSequenceCounter remains 25 while filling gap ${expected}`);
    }

    // Now all gaps 14..24 are filled! Bills 1..25 are all occupied.
    // The NEXT bill must be BILL-026!
    const preview26 = await context.getNextBillingReceiptNo();
    assert(preview26 === 'BILL-026', 'S3.prev_26', 'Next bill preview after gaps filled is BILL-026', preview26);

    const res26 = await context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      time: '10:30 AM',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      quantity: 1,
      unitPrice: 20,
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 26'
    });

    assert(res26.billingRecord.id === 26, 'S3.alloc_26', 'Bill 26 assigned numeric ID 26', `id=${res26.billingRecord.id}`);
    assert(res26.billingRecord.receiptNo === 'BILL-026', 'S3.num_26', 'Bill 26 receiptNo is BILL-026', res26.billingRecord.receiptNo);

    // Verify counter advanced to 26 now that gap filling transitioned to new numbers
    const c26 = await context.fsGetCounters();
    assert(c26.globalSequenceCounter === 26, 'S3.c_advance', 'globalSequenceCounter advanced to 26', `gsc=${c26.globalSequenceCounter}`);
    assert(c26.billingReceiptCounter === 26, 'S3.brc_advance', 'billingReceiptCounter advanced to 26', `brc=${c26.billingReceiptCounter}`);
  }

  console.log('\n--- SCENARIO 4: Voided bills retaining their numbers ---');
  {
    // Void bill 20
    await context.fsVoidLinkedBillingAndReceipt('bill_20', 'rcpt_20', 'Devotee cancelled');

    const b20Snap = await mockDb.collection('billing').doc('bill_20').get();
    const r20Snap = await mockDb.collection('receipts').doc('rcpt_20').get();
    const res20Snap = await mockDb.collection('system').doc('res_20').get();

    assert(b20Snap.exists && b20Snap.data().voided === true, 'S4.1', 'bill_20 marked voided: true');
    assert(r20Snap.exists && r20Snap.data().voided === true, 'S4.2', 'rcpt_20 marked voided: true');
    assert(res20Snap.exists && res20Snap.data().status === 'voided', 'S4.3', 'res_20 marked status: voided');

    // Permanently delete bill 18 to create an available gap at 18
    await context.fsDeleteBillingRecord('bill_18');
    const b18Snap = await mockDb.collection('billing').doc('bill_18').get();
    assert(!b18Snap.exists, 'S4.4', 'bill_18 permanently deleted');

    // Lowest available eligible number must now be 18 (NOT voided 20)
    const nextSeq = await context.getNextAvailableBillingSeq();
    assert(nextSeq === 18, 'S4.5', 'Next available sequence is 18 (deleted bill)', `nextSeq=${nextSeq}`);

    // Create bill to consume 18
    const b18_reused = await context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      time: '11:00 AM',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      quantity: 1,
      unitPrice: 20,
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 18 Reused'
    });
    assert(b18_reused.billingRecord.id === 18, 'S4.6', 'Reused deleted bill number 18', b18_reused.billingRecord.receiptNo);

    // Now 18 is occupied, and 20 is VOIDED. Next available number MUST NOT be 20! It should be 27!
    const nextSeqAfter = await context.getNextAvailableBillingSeq();
    assert(nextSeqAfter === 27, 'S4.7', 'Next sequence is 27 (voided 20 was NOT reused)', `nextSeqAfter=${nextSeqAfter}`);

    const previewAfter = await context.getNextBillingReceiptNo();
    assert(previewAfter === 'BILL-027', 'S4.8', 'Preview is BILL-027 (voided 20 strictly skipped)', previewAfter);

    // Attempting to manually allocate voided number 20 must be rejected
    let manualError = null;
    try {
      await context.fsCreateBillingWithAccounting({
        manualBillNo: 'BILL-020',
        date: '2026-10-21',
        fund: 'General Temple Fund',
        category: 'വഴിപാട്',
        item: 'നൂൽജപം',
        totalAmount: 20,
        paymentMode: 'Cash',
        devoteeName: 'Malicious Manual'
      });
    } catch (err) {
      manualError = err.message;
    }
    assert(manualError && manualError.includes('already been reserved or issued'), 'S4.9', 'Manual reuse of voided bill rejected with error', manualError);
  }

  console.log('\n--- SCENARIO 5: Existing and concurrent reservations preventing duplicate allocation ---');
  {
    // Create an explicit reservation document res_27 in system collection
    await mockDb.collection('system').doc('res_27').set({
      seqNumber: 27,
      formattedNo: '027',
      status: 'active',
      billReceiptNo: 'BILL-027',
      receiptNo: 'R-027',
      createdBy: 'another_user',
      createdAt: Date.now()
    });

    // Verification: getNextAvailableBillingSeq must detect reservation and skip 27, returning 28
    const nextWithRes = await context.getNextAvailableBillingSeq();
    assert(nextWithRes === 28, 'S5.1', 'Reservation res_27 prevents allocation of 27; skips to 28', `nextWithRes=${nextWithRes}`);

    // Clean up reservation res_27
    await mockDb.collection('system').doc('res_27').delete();

    // Concurrent race test: 2 operations simulate simultaneous execution
    // Both attempt to allocate next available number
    const p1 = context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Concurrent User 1'
    });

    const p2 = context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Concurrent User 2'
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    assert(res1.billingRecord.receiptNo !== res2.billingRecord.receiptNo, 'S5.2', 'Concurrent bills received distinct receipt numbers', `${res1.billingRecord.receiptNo} vs ${res2.billingRecord.receiptNo}`);
    const nums = [res1.billingRecord.id, res2.billingRecord.id].sort((a, b) => a - b);
    assert(nums[0] === 27 && nums[1] === 28, 'S5.3', 'Concurrent bills sequentially assigned 27 and 28', nums.join(', '));
  }

  console.log('\n--- SCENARIO 6: Deletion of a bill with a linked accounting receipt ---');
  {
    // Create bill 29
    const b29 = await context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 29'
    });
    assert(b29.billingRecord.receiptNo === 'BILL-029', 'S6.1', 'Bill 29 created as BILL-029');

    // Verify linked accounting receipt rcpt_29 exists
    const r29Before = await mockDb.collection('receipts').doc('rcpt_29').get();
    const res29Before = await mockDb.collection('system').doc('res_29').get();
    assert(r29Before.exists, 'S6.2', 'Linked accounting receipt rcpt_29 exists before deletion');
    assert(res29Before.exists, 'S6.3', 'Linked reservation res_29 exists before deletion');

    // Delete bill 29
    await context.fsDeleteBillingRecord('bill_29');

    const b29After = await mockDb.collection('billing').doc('bill_29').get();
    const r29After = await mockDb.collection('receipts').doc('rcpt_29').get();
    const res29After = await mockDb.collection('system').doc('res_29').get();

    assert(!b29After.exists, 'S6.4', 'bill_29 permanently removed from Firestore');
    assert(!r29After.exists, 'S6.5', 'Linked accounting receipt rcpt_29 permanently removed from Firestore');
    assert(!res29After.exists, 'S6.6', 'Linked reservation res_29 permanently removed from Firestore');

    // Verify number 29 is immediately free for reuse
    const nextAvailable = await context.getNextAvailableBillingSeq();
    assert(nextAvailable === 29, 'S6.7', 'Number 29 is immediately available for reuse after deletion', `nextAvailable=${nextAvailable}`);

    // Create bill 30
    const b30 = await context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 30'
    });
    assert(b30.billingRecord.receiptNo === 'BILL-029', 'S6.8', 'Next bill successfully reused deleted BILL-029');

    // Test deleting linked receipt via fsDeleteReceiptRecord
    await context.fsDeleteReceiptRecord('rcpt_29');
    const b29DeletedViaRcpt = await mockDb.collection('billing').doc('bill_29').get();
    const r29DeletedViaRcpt = await mockDb.collection('receipts').doc('rcpt_29').get();
    assert(!b29DeletedViaRcpt.exists, 'S6.9', 'bill_29 deleted when linked receipt deleted via fsDeleteReceiptRecord');
    assert(!r29DeletedViaRcpt.exists, 'S6.10', 'rcpt_29 deleted via fsDeleteReceiptRecord');

    // Recreate bill 29 to keep test data clean
    await context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 29 Final'
    });
  }

  console.log('\n--- SCENARIO 7: Counter and sequence isolation ---');
  {
    // Permanently delete bill 10 to create a middle gap at 10
    await context.fsDeleteBillingRecord('bill_10');
    assert(!(await mockDb.collection('billing').doc('bill_10').get()).exists, 'S7.1', 'bill_10 permanently deleted (middle gap)');

    // Highest bill is currently 29. Counters must be at 29
    let c = await context.fsGetCounters();
    const gscBefore = c.globalSequenceCounter;
    assert(gscBefore >= 29, 'S7.2', `globalSequenceCounter is at high watermark (${gscBefore})`);

    // Verify ordinary independent receipt creation does NOT take billing gap 10!
    // Ordinary receipts allocate monotonically from globalSequenceCounter + 1
    const rcptInput = {
      name: 'Independent Devotee',
      amount: 150,
      date: '2026-10-21',
      paymentMode: 'Cash',
      fund: 'General Temple Fund',
      category: 'Pooja Income'
    };

    const indepRcpt = await context.fsCreateIndependentReceipt(rcptInput);
    assert(indepRcpt.receiptRecord.id === gscBefore + 1, 'S7.3', `Independent receipt allocated ${gscBefore + 1} (NOT gap 10)`, `id=${indepRcpt.receiptRecord.id}`);
    assert(indepRcpt.receiptRecord.receiptNo === `R-${String(gscBefore + 1).padStart(3, '0')}`, 'S7.4', 'Independent receipt formatted correctly', indepRcpt.receiptRecord.receiptNo);

    // Verify billing still reuses gap 10
    const nextBillVal = await context.getNextAvailableBillingSeq();
    assert(nextBillVal === 10, 'S7.5', 'Billing sequence still targets lowest available gap 10', `nextBillVal=${nextBillVal}`);

    const reusedB10 = await context.fsCreateBillingWithAccounting({
      date: '2026-10-21',
      fund: 'General Temple Fund',
      category: 'വഴിപാട്',
      item: 'നൂൽജപം',
      totalAmount: 20,
      paymentMode: 'Cash',
      devoteeName: 'Devotee 10 Gap Reuser'
    });
    assert(reusedB10.billingRecord.receiptNo === 'BILL-010', 'S7.6', 'Billing successfully reused BILL-010', reusedB10.billingRecord.receiptNo);

    // Verify globalSequenceCounter was NOT decremented when gap 10 was filled
    c = await context.fsGetCounters();
    assert(c.globalSequenceCounter === gscBefore + 1, 'S7.7', `globalSequenceCounter remains ${gscBefore + 1} (NOT decremented to 10)`, `c=${c.globalSequenceCounter}`);

    // Verify physical receipts use separate P/PU sequence and do not touch globalSequenceCounter
    const physRes = await context.fsCreatePhysicalReceipt({
      receiptNo: 'P600',
      name: 'Physical Devotee',
      amount: 500,
      date: '2026-10-21',
      paymentMode: 'Cash',
      fund: 'General Temple Fund',
      category: 'Pooja Income'
    });
    assert(physRes && physRes.receiptRecord.receiptNo === 'P600', 'S7.8', 'Physical receipt created as P600');

    c = await context.fsGetCounters();
    assert(c.globalSequenceCounter === gscBefore + 1, 'S7.9', 'Physical receipt strictly did not alter globalSequenceCounter');
    assert(c.billingReceiptCounter === gscBefore, 'S7.10', 'Physical receipt strictly did not alter billingReceiptCounter');

    // Verify voucherCounter isolation
    assert(c.voucherCounter === 0, 'S7.11', 'Voucher counter remains isolated at 0');
  }

  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.177 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
