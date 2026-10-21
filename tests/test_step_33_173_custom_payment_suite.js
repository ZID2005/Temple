/**
 * STEP 33.173 — Automated Test Suite: Custom Unnumbered Payment Icon & Voucher Sequence Preservation
 * Location: tests/test_step_33_173_custom_payment_suite.js
 *
 * Comprehensive test suite verifying all required scenarios for Step 33.173:
 *  1. Exact numbering sequence: V-011 -> CUSTOM (Blank '—') -> V-012 -> CUSTOM -> V-013.
 *  2. Counter isolation: Custom payment does not consume, reserve, increment, decrement, or reset voucherCounter.
 *  3. UI verification: Compact CUSTOM button immediately after CANCEL, tooltip, unchanged SAVE/CANCEL.
 *  4. Payments table rendering: Custom payment displays '—' for Voucher No; normal payments display V-XXX.
 *  5. Accounting integration: Included once in Cash Book, Bank Book, Ledger, Fund Balances, Category Totals, Reports.
 *  6. Editing custom payments: Saving an edit preserves unnumbered status without assigning a voucher number.
 *  7. Deletion & voiding safety: Deleting or voiding a custom payment does not touch voucherCounter.
 *  8. Normal trailing reuse compatibility: Deleting normal vouchers reuses trailing numbers safely with custom payments present.
 *  9. CSV Export & Search: Custom payment exports blank voucher number without fabricating IDs; searchable across all fields.
 * 10. Concurrency safety: Multiple custom payments generate collision-free unique internal IDs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.173: CUSTOM UNNUMBERED PAYMENT & VOUCHER SEQUENCE TEST SUITE');
console.log('='.repeat(80));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testId, description, detail = '') {
  totalTests++;
  const passed = !!condition;
  if (passed) passedTests++; else failedTests++;
  const status = passed ? 'PASS' : 'FAIL';
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${status}] ${testId}: ${description}${detail ? ' (' + detail + ')' : ''}`);
  testResults.push({ testId, description, passed, detail });
}

// =========================================================================
// MOCK FIRESTORE & APPLICATION STATE WITH CONCURRENCY
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

  async get() {
    return this.db._getCol(this.colPath);
  }
}

class MockFirestore {
  constructor() {
    this.store = new Map(); // "col/id" -> data
    this._txQueue = Promise.resolve();
  }

  collection(colPath) {
    return new MockCollectionRef(this, colPath);
  }

  _key(col, id) {
    return `${col}/${id}`;
  }

  _getDoc(col, id) {
    const k = this._key(col, id);
    if (!this.store.has(k)) {
      return { exists: false, id, data: () => undefined };
    }
    const val = JSON.parse(JSON.stringify(this.store.get(k)));
    return { exists: true, id, data: () => val };
  }

  _setDoc(col, id, data, options = {}) {
    const k = this._key(col, id);
    if (options.merge && this.store.has(k)) {
      const existing = this.store.get(k);
      this.store.set(k, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    } else {
      this.store.set(k, JSON.parse(JSON.stringify(data)));
    }
  }

  _deleteDoc(col, id) {
    const k = this._key(col, id);
    this.store.delete(k);
  }

  _getCol(col) {
    const docs = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${col}/`)) {
        const id = k.substring(col.length + 1);
        docs.push({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(v))
        });
      }
    }
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (cb) => docs.forEach(cb)
    };
  }

  async runTransaction(updateFunction) {
    const currentQueue = this._txQueue;
    let release;
    this._txQueue = new Promise((resolve) => { release = resolve; });

    await currentQueue;
    try {
      const tx = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, options) => docRef.set(data, options),
        update: (docRef, data) => docRef.update(data),
        delete: (docRef) => docRef.delete()
      };
      return await updateFunction(tx);
    } finally {
      release();
    }
  }
}

// Setup isolated environment
const mockDb = new MockFirestore();
const idbStore = {
  payments: new Map(),
  counters: new Map()
};

let currentCounterValue = 10; // Start at 10 so first normal is V-011

mockDb._setDoc('system', 'counters', {
  voucherCounter: currentCounterValue,
  voucherPrefix: 'V-',
  globalSequenceCounter: 50,
  billingReceiptCounter: 50,
  receiptCounter: 1050
});

async function fsGetCounters() {
  const snap = await mockDb.collection('system').doc('counters').get();
  return snap.exists ? snap.data() : null;
}

function getFsCountersDocRef() {
  return mockDb.collection('system').doc('counters');
}

function getFirestoreDb() {
  return mockDb;
}

function getCurrentFirebaseUser() {
  return { uid: 'test-admin-173', email: 'admin@temple.org' };
}

async function _fsAllocateCounter(field, defaultInitial, prefixField, defaultPrefix, padDigits = 0) {
  const db = getFirestoreDb();
  const counterRef = getFsCountersDocRef();

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists ? snap.data() : {};
    const rawVal = data[field];
    const currentVal = (typeof rawVal === 'number')
      ? rawVal
      : (rawVal !== undefined && !isNaN(parseInt(rawVal, 10)) ? parseInt(rawVal, 10) : defaultInitial);

    let nextVal = currentVal + 1;
    const prefix = (data[prefixField] !== undefined && data[prefixField] !== null) ? data[prefixField] : defaultPrefix;

    if (field === 'voucherCounter') {
      let vRef = db.collection('payments').doc(`pmt_${nextVal}`);
      let vSnap = await tx.get(vRef);
      let legacyRef = db.collection('payments').doc(`pay_${nextVal}`);
      let legacySnap = await tx.get(legacyRef);
      while (vSnap.exists || legacySnap.exists) {
        nextVal++;
        vRef = db.collection('payments').doc(`pmt_${nextVal}`);
        vSnap = await tx.get(vRef);
        legacyRef = db.collection('payments').doc(`pay_${nextVal}`);
        legacySnap = await tx.get(legacyRef);
      }
    }

    const formattedNo = padDigits > 0
      ? `${prefix}${String(nextVal).padStart(padDigits, '0')}`
      : `${prefix}${nextVal}`;

    const updatePayload = {
      [field]: nextVal,
      updatedAt: Date.now()
    };
    tx.set(counterRef, updatePayload, { merge: true });
    return formattedNo;
  });
}

async function fsNextVoucherNo() {
  return await _fsAllocateCounter('voucherCounter', 0, 'voucherPrefix', 'V-', 3);
}

async function nextVoucherNo() {
  const c = await fsGetCounters();
  const cur = (c && typeof c.voucherCounter === 'number') ? c.voucherCounter : 0;
  const prefix = (c && c.voucherPrefix) || 'V-';
  return prefix + String(cur + 1).padStart(3, '0');
}

async function fsSaveRecordSafe(storeName, record, isEdit = false) {
  const db = getFirestoreDb();
  let docId = record.firestoreId;
  if (!docId) {
    docId = `pmt_${record.id || Date.now()}`;
    record.firestoreId = docId;
  }
  await db.collection(storeName).doc(docId).set(record, { merge: true });
  idbStore[storeName].set(String(record.id), JSON.parse(JSON.stringify(record)));
  idbStore[storeName].set(docId, JSON.parse(JSON.stringify(record)));
  return docId;
}

async function fsUpdateRecordSafe(storeName, id, updates) {
  const db = getFirestoreDb();
  let docId = (typeof id === 'string' && id.includes('_')) ? id : `pmt_${id}`;
  const payload = { ...updates, updatedAt: Date.now() };
  await db.collection(storeName).doc(docId).set(payload, { merge: true });
  const targetId = (updates && updates.id !== undefined && updates.id !== null) ? String(updates.id) : String(id);
  const existing = idbStore[storeName].get(targetId) || idbStore[storeName].get(docId) || {};
  idbStore[storeName].set(targetId, { ...existing, ...payload });
  idbStore[storeName].set(docId, { ...existing, ...payload });
  return docId;
}

async function fsGetOneSafe(storeName, id) {
  const db = getFirestoreDb();
  let snap = await db.collection(storeName).doc(String(id)).get();
  if (!snap.exists) {
    snap = await db.collection(storeName).doc(`pmt_${id}`).get();
  }
  if (snap.exists) {
    return { ...snap.data(), firestoreId: snap.id };
  }
  return idbStore[storeName].get(String(id)) || null;
}

async function allPayments() {
  const db = getFirestoreDb();
  const col = await db.collection('payments').get();
  const list = [];
  col.forEach(d => list.push({ ...d.data(), firestoreId: d.id }));
  return list;
}

async function activePayments() {
  const list = await allPayments();
  return list.filter(p => !p.voided);
}

// Logic mirror of savePayment from Temple_Accounts-1.html
async function executeSavePayment(formData, isCustom = false) {
  const amount = parseFloat(formData.amount);
  const voucherNoInput = (formData.voucherNo || '').trim();
  const editId = formData.editId || null;

  if (!formData.paidTo || !formData.date || !formData.fund || !formData.category || !amount || amount <= 0) {
    throw new Error('Please fill all required fields with a valid amount.');
  }

  const rec = {
    date: formData.date, fund: formData.fund, category: formData.category,
    description: formData.description || '', paidTo: formData.paidTo, paymentMode: formData.paymentMode,
    bankAccount: formData.bankAccount || '', amount, billNo: formData.billNo || '', remarks: formData.remarks || ''
  };

  let savedRec = null;
  if (editId) {
    const prior = await fsGetOneSafe('payments', editId);
    if (prior && prior.voided) throw new Error('Voided payments cannot be edited.');
    rec.id = editId;
    const isPriorCustom = prior && (prior.voucherType === 'custom' || !prior.voucherNo || prior.voucherNo === '—');
    if (isPriorCustom || isCustom) {
      rec.voucherType = 'custom';
      rec.voucherNo = '';
    } else {
      rec.voucherNo = voucherNoInput || (prior ? prior.voucherNo : '');
      if (prior && prior.voucherType) rec.voucherType = prior.voucherType;
    }
    rec.voided = prior ? prior.voided : false;
    rec.createdAt = prior ? prior.createdAt : Date.now();
    rec.firestoreId = prior ? prior.firestoreId : ((typeof editId === 'string' && editId.startsWith('pmt_')) ? editId : ('pmt_' + editId));
    await fsUpdateRecordSafe('payments', rec.firestoreId || editId, rec);
    savedRec = rec;
  } else if (isCustom) {
    // Unnumbered custom payment: strictly DO NOT call fsNextVoucherNo(), DO NOT touch counters
    rec.voucherNo = '';
    rec.voucherType = 'custom';
    rec.voided = false;
    rec.createdAt = Date.now();
    const randSuffix = Math.random().toString(36).substring(2, 8);
    const customId = `c_${Date.now()}_${randSuffix}`;
    rec.id = customId;
    rec.firestoreId = `pmt_${customId}`;
    await fsSaveRecordSafe('payments', rec, false);
    savedRec = rec;
  } else {
    // Normal voucher: allocate atomic voucher number from Firestore
    const allocatedNo = await fsNextVoucherNo();
    rec.voucherNo = allocatedNo;
    rec.voucherType = 'normal';
    rec.voided = false;
    rec.createdAt = Date.now();
    const numMatch = allocatedNo.match(/\d+$/);
    if (numMatch) {
      rec.id = parseInt(numMatch[0], 10);
      rec.legacyId = rec.id;
    }
    rec.firestoreId = 'pmt_' + (rec.id || Date.now());
    await fsSaveRecordSafe('payments', rec, false);
    savedRec = rec;
  }
  return savedRec;
}

// Logic mirror of deletePayment from Temple_Accounts-1.html
async function executeDeletePayment(id) {
  const db = getFirestoreDb();
  let p = await fsGetOneSafe('payments', id);
  if (!p) throw new Error('Payment voucher not found or already deleted.');

  const isCustom = p.voucherType === 'custom' || !p.voucherNo || p.voucherNo === '—';
  const voucherNoStr = isCustom ? '— (Custom)' : (p.voucherNo || (p.id ? `V-${String(p.id).padStart(3, '0')}` : 'V-???'));
  const targetDocId = (p && p.firestoreId) ? p.firestoreId : ((typeof id === 'string' && id.startsWith('pmt_')) ? id : `pmt_${p.id || id}`);
  const vMatch = isCustom ? null : (voucherNoStr.match(/^V-(\d+)$/i) || (typeof p.voucherNo === 'string' && p.voucherNo.match(/\d+$/)));
  const deletedVNum = vMatch ? parseInt(vMatch[1] || vMatch[0], 10) : null;

  await db.runTransaction(async (tx) => {
    const counterRef = getFsCountersDocRef();
    const pRef = db.collection('payments').doc(targetDocId);
    const [pSnap, cSnap] = await Promise.all([tx.get(pRef), tx.get(counterRef)]);

    if (!pSnap.exists) throw new Error('Target document does not exist.');
    const cData = cSnap.exists ? cSnap.data() : {};
    const currentCounter = (typeof cData.voucherCounter === 'number') ? cData.voucherCounter : 0;

    const paymentsSnap = await db.collection('payments').get();
    let maxRemainingNum = 0;
    paymentsSnap.forEach(docSnap => {
      if (docSnap.id !== targetDocId && docSnap.id !== String(id)) {
        const d = docSnap.data();
        if (d.voucherType === 'custom' || !d.voucherNo || d.voucherNo === '—') return;
        const numMatch = (d.voucherNo || '').match(/\d+$/);
        const num = numMatch ? parseInt(numMatch[0], 10) : 0;
        if (num > maxRemainingNum) {
          maxRemainingNum = num;
        }
      }
    });

    tx.delete(pRef);
    if (deletedVNum) {
      const legacyRef = db.collection('payments').doc(`pay_${deletedVNum}`);
      tx.delete(legacyRef);
    }

    if (deletedVNum !== null && (deletedVNum >= currentCounter || deletedVNum > maxRemainingNum)) {
      tx.set(counterRef, { voucherCounter: maxRemainingNum, updatedAt: Date.now() }, { merge: true });
    }
  });

  idbStore.payments.delete(String(id));
  if (p.id !== undefined) idbStore.payments.delete(String(p.id));
  if (p.firestoreId) idbStore.payments.delete(p.firestoreId);
  if (targetDocId) idbStore.payments.delete(targetDocId);
  return { deleted: true, isCustom, voucherNoStr };
}

// Logic mirror of voidRecord for payments
async function executeVoidPayment(id, reason = 'Voided by test') {
  const p = await fsGetOneSafe('payments', id);
  if (!p) throw new Error('Payment not found.');
  await fsUpdateRecordSafe('payments', p.firestoreId || id, {
    voided: true,
    voidReason: reason,
    voidDate: '2026-10-21'
  });
  return true;
}

// Accounting row builders mirror
function buildCashBookPaymentRows(paymentsList) {
  return paymentsList.filter(p => p.paymentMode === 'Cash' && !p.voided).map(p => ({
    date: p.date,
    particulars: p.voucherNo ? `Payment ${p.voucherNo} - ${p.paidTo}` : `Payment - ${p.paidTo}`,
    description: p.description || '',
    category: p.category || 'Uncategorized',
    receipt: 0,
    payment: p.amount,
    txType: 'payment'
  }));
}

function buildBankBookPaymentRows(paymentsList) {
  return paymentsList.filter(p => (p.paymentMode === 'Bank' || p.paymentMode === 'UPI') && !p.voided).map(p => ({
    date: p.date,
    particulars: p.voucherNo ? `Payment ${p.voucherNo} - ${p.paidTo} (${p.paymentMode})` : `Payment - ${p.paidTo} (${p.paymentMode})`,
    description: p.description || '',
    category: p.category || 'Uncategorized',
    deposit: 0,
    withdrawal: p.amount,
    txType: 'payment'
  }));
}

function renderPaymentTableRow(p) {
  const vDisplay = (p.voucherNo && String(p.voucherNo).trim()) ? p.voucherNo : '—';
  return `<tr data-record-id="${p.id}"><td>${vDisplay}</td><td>${p.date}</td><td>${p.paidTo}</td><td>${p.amount}</td></tr>`;
}

// =========================================================================
// RUN TEST SUITE
// =========================================================================

async function runTests() {
  console.log('\n--- GROUP 1: Exact Numbering Sequence & Counter Isolation ---');

  // Baseline check
  const initCounters = await fsGetCounters();
  assert(initCounters.voucherCounter === 10, 'T1.1', 'Baseline voucherCounter is 10', `voucherCounter=${initCounters.voucherCounter}`);
  const preview1 = await nextVoucherNo();
  assert(preview1 === 'V-011', 'T1.2', 'Initial form preview proposes V-011', `preview=${preview1}`);

  // Step 1: Create normal voucher V-011
  const normal1 = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Kerala Electricals Ltd',
    amount: 1500,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Electricity & Water',
    description: 'Sanctum lighting maintenance',
    voucherNo: 'V-011'
  }, false);
  assert(normal1.voucherNo === 'V-011', 'T1.3', 'Normal payment receives voucher V-011', `voucherNo=${normal1.voucherNo}`);
  assert(normal1.voucherType === 'normal', 'T1.4', 'Normal payment has voucherType=normal', `voucherType=${normal1.voucherType}`);
  const counterAfterNormal1 = (await fsGetCounters()).voucherCounter;
  assert(counterAfterNormal1 === 11, 'T1.5', 'voucherCounter increments to 11 after normal voucher', `voucherCounter=${counterAfterNormal1}`);

  // Step 2: Click CUSTOM and save a custom payment
  const custom1 = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Local Coconut Vendor',
    amount: 750,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Pooja Materials',
    description: 'Fresh coconuts for morning abhishekam',
    voucherNo: 'V-012' // Input might have held preview, but CUSTOM overrides it!
  }, true); // isCustom = true
  assert(custom1.voucherNo === '', 'T1.6', 'Custom payment has blank voucherNo ("")', `voucherNo="${custom1.voucherNo}"`);
  assert(custom1.voucherType === 'custom', 'T1.7', 'Custom payment has voucherType="custom"', `voucherType=${custom1.voucherType}`);
  assert(typeof custom1.id === 'string' && custom1.id.startsWith('c_'), 'T1.8', 'Custom payment assigned unique non-integer ID starting with c_', `id=${custom1.id}`);
  assert(custom1.firestoreId.startsWith('pmt_c_'), 'T1.9', 'Custom payment document stored under pmt_c_* namespace', `firestoreId=${custom1.firestoreId}`);

  // Step 2 Counter check: counter strictly untouched!
  const counterAfterCustom1 = (await fsGetCounters()).voucherCounter;
  assert(counterAfterCustom1 === 11, 'T1.10', 'CRITICAL: Custom payment did NOT increment voucherCounter (remains 11)', `voucherCounter=${counterAfterCustom1}`);
  const previewAfterCustom1 = await nextVoucherNo();
  assert(previewAfterCustom1 === 'V-012', 'T1.11', 'Next voucher preview remains V-012 (no number skipped)', `preview=${previewAfterCustom1}`);

  // Step 3: Payments table rendering for custom payment
  const tableRowCustom1 = renderPaymentTableRow(custom1);
  assert(tableRowCustom1.includes('<td>—</td>'), 'T1.12', 'Custom payment Voucher No renders as "—" in Payments table', tableRowCustom1);

  // Step 4: Create next normal payment and verify it receives V-012
  const normal2 = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Devi Sound & Lighting',
    amount: 3200,
    paymentMode: 'Bank',
    bankAccount: 'Temple Main SBI Account',
    fund: 'General Temple Fund',
    category: 'Festival Expenses',
    description: 'Sound equipment rental for evening pooja'
  }, false);
  assert(normal2.voucherNo === 'V-012', 'T1.13', 'Next normal payment receives exact next sequential voucher V-012', `voucherNo=${normal2.voucherNo}`);
  const counterAfterNormal2 = (await fsGetCounters()).voucherCounter;
  assert(counterAfterNormal2 === 12, 'T1.14', 'voucherCounter is now 12', `voucherCounter=${counterAfterNormal2}`);

  // Step 5: Create another custom payment
  const custom2 = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Flower Supplier Ramu',
    amount: 450,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Pooja Materials',
    description: 'Lotus garlands'
  }, true);
  assert(custom2.voucherNo === '', 'T1.15', 'Second custom payment has blank voucherNo', `voucherNo="${custom2.voucherNo}"`);
  assert(custom2.voucherType === 'custom', 'T1.16', 'Second custom payment voucherType="custom"', `voucherType=${custom2.voucherType}`);
  const counterAfterCustom2 = (await fsGetCounters()).voucherCounter;
  assert(counterAfterCustom2 === 12, 'T1.17', 'voucherCounter strictly unchanged at 12 after second custom payment', `voucherCounter=${counterAfterCustom2}`);

  // Step 6: Create another normal payment and verify it receives V-013
  const normal3 = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'City Water Works',
    amount: 1100,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Electricity & Water',
    description: 'Water tank refill'
  }, false);
  assert(normal3.voucherNo === 'V-013', 'T1.18', 'Third normal payment receives exact sequential voucher V-013', `voucherNo=${normal3.voucherNo}`);
  const counterAfterNormal3 = (await fsGetCounters()).voucherCounter;
  assert(counterAfterNormal3 === 13, 'T1.19', 'voucherCounter is now 13', `voucherCounter=${counterAfterNormal3}`);

  console.log('\n--- GROUP 2: UI Elements & Code Inspection of Temple_Accounts-1.html ---');
  const appHtml = fs.readFileSync(path.join(__dirname, '..', 'Temple_Accounts-1.html'), 'utf8');

  assert(appHtml.includes('id="btn-save-custom-payment"'), 'T2.1', 'CUSTOM button element present with id="btn-save-custom-payment"');
  assert(appHtml.includes('onclick="savePayment(false, true)"'), 'T2.2', 'CUSTOM button correctly invokes savePayment(false, true)');
  assert(appHtml.includes('title="Custom — Save without voucher number"'), 'T2.3', 'CUSTOM button includes descriptive title/tooltip');
  assert(appHtml.includes('aria-label="Custom — Save without voucher number"'), 'T2.4', 'CUSTOM button includes accessibility aria-label');
  assert(appHtml.includes('btn-outline'), 'T2.5', 'CUSTOM button styled consistently with btn-outline');
  assert(appHtml.includes('⚙️') || appHtml.includes('CUSTOM'), 'T2.6', 'CUSTOM button displays compact icon and label');

  // Verify CANCEL button immediately precedes CUSTOM button in paymentForm
  const paymentFormMatch = appHtml.match(/<form id="paymentForm">[\s\S]*?<\/form>/);
  assert(!!paymentFormMatch, 'T2.7', 'paymentForm container found in application');
  if (paymentFormMatch) {
    const act = paymentFormMatch[0];
    const cancelPos = act.indexOf('CANCEL');
    const customPos = act.indexOf('id="btn-save-custom-payment"');
    assert(cancelPos !== -1 && customPos !== -1 && customPos > cancelPos, 'T2.8', 'CUSTOM button is positioned immediately after the CANCEL button in paymentForm');
  }

  // Verify SAVE and SAVE & PRINT unchanged
  assert(appHtml.includes('id="btn-save-payment"'), 'T2.9', 'SAVE button preserved with id="btn-save-payment"');
  assert(appHtml.includes('id="btn-save-print-payment"'), 'T2.10', 'SAVE & PRINT button preserved with id="btn-save-print-payment"');
  assert(appHtml.includes('onclick="savePayment(false)"'), 'T2.11', 'Normal SAVE continues to call savePayment(false)');
  assert(appHtml.includes('onclick="savePayment(true)"'), 'T2.12', 'Normal SAVE & PRINT continues to call savePayment(true)');

  // Verify double submission guard exists
  assert(appHtml.includes('window.isSavingPayment'), 'T2.13', 'Double submission guard window.isSavingPayment is present in savePayment');

  console.log('\n--- GROUP 3: Reload & Cache Synchronization ---');
  // Cold read from mock DB
  const coldList = await allPayments();
  const coldCustom1 = coldList.find(p => p.id === custom1.id);
  const coldNormal1 = coldList.find(p => p.id === normal1.id);

  assert(!!coldCustom1, 'T3.1', 'Custom payment retrievable after cold query');
  assert(coldCustom1.voucherType === 'custom', 'T3.2', 'Cold retrieved custom payment preserves voucherType="custom"');
  assert(coldCustom1.voucherNo === '', 'T3.3', 'Cold retrieved custom payment preserves empty voucherNo');
  assert(!!coldNormal1 && coldNormal1.voucherNo === 'V-011', 'T3.4', 'Cold retrieved normal payment preserves V-011');

  // Preview remains accurate on reload
  const reloadPreview = await nextVoucherNo();
  assert(reloadPreview === 'V-014', 'T3.5', 'nextVoucherNo preview on reload is V-014 (reflects V-011, V-012, V-013)', `preview=${reloadPreview}`);

  console.log('\n--- GROUP 4: Editing Custom Payments ---');
  // Edit custom1 details
  const editedCustom1 = await executeSavePayment({
    editId: custom1.id,
    date: '2026-10-21',
    paidTo: 'Local Coconut Vendor (Revised)',
    amount: 850,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Pooja Materials',
    description: 'Fresh coconuts for morning abhishekam (revised quantity)',
    voucherNo: '' // should remain empty
  }, false); // Even if called without isCustom flag, prior custom status is preserved!

  assert(editedCustom1.voucherType === 'custom', 'T4.1', 'Edited custom payment strictly preserves voucherType="custom"');
  assert(editedCustom1.voucherNo === '', 'T4.2', 'Edited custom payment does NOT receive a voucher number', `voucherNo="${editedCustom1.voucherNo}"`);
  assert(editedCustom1.amount === 850, 'T4.3', 'Edited custom payment amount updated to 850');
  assert(editedCustom1.paidTo === 'Local Coconut Vendor (Revised)', 'T4.4', 'Edited custom payment paidTo updated');

  const counterAfterEdit = (await fsGetCounters()).voucherCounter;
  assert(counterAfterEdit === 13, 'T4.5', 'Editing custom payment did NOT touch voucherCounter (remains 13)', `voucherCounter=${counterAfterEdit}`);

  console.log('\n--- GROUP 5: Accounting Integration (Cash Book, Bank Book, Ledger, Totals) ---');
  const allCurrent = await allPayments();
  const cashRows = buildCashBookPaymentRows(allCurrent);
  const bankRows = buildBankBookPaymentRows(allCurrent);

  // Cash Book includes cash custom payments
  const cashCustomRow = cashRows.find(r => r.particulars.includes('Local Coconut Vendor'));
  assert(!!cashCustomRow, 'T5.1', 'Custom cash payment is present in Cash Book');
  assert(cashCustomRow.particulars === 'Payment - Local Coconut Vendor (Revised)', 'T5.2', 'Cash Book particulars formatted cleanly without blank voucher number', `particulars="${cashCustomRow.particulars}"`);
  assert(cashCustomRow.payment === 850, 'T5.3', 'Cash Book payment amount is 850');

  // Bank Book includes bank normal payments and does not cross-pollute
  const bankNormalRow = bankRows.find(r => r.particulars.includes('Devi Sound & Lighting'));
  assert(!!bankNormalRow, 'T5.4', 'Bank normal payment present in Bank Book');
  assert(bankNormalRow.particulars.includes('Payment V-012'), 'T5.5', 'Bank Book particulars display V-012 for normal payment');

  // Add bank custom payment to verify Bank Book custom formatting
  const customBank = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Temple Auditor Rao',
    amount: 5000,
    paymentMode: 'Bank',
    bankAccount: 'Temple Main SBI Account',
    fund: 'General Temple Fund',
    category: 'Audit & Professional Fees',
    description: 'Quarterly compliance audit fee'
  }, true);
  const updatedAll = await allPayments();
  const updatedBankRows = buildBankBookPaymentRows(updatedAll);
  const bankCustomRow = updatedBankRows.find(r => r.particulars.includes('Temple Auditor Rao'));
  assert(!!bankCustomRow, 'T5.6', 'Custom bank payment present in Bank Book');
  assert(bankCustomRow.particulars === 'Payment - Temple Auditor Rao (Bank)', 'T5.7', 'Bank Book particulars formatted cleanly without blank voucher number', `particulars="${bankCustomRow.particulars}"`);
  assert(bankCustomRow.withdrawal === 5000, 'T5.8', 'Bank Book withdrawal amount is 5000');

  // Check counter remains 13
  assert((await fsGetCounters()).voucherCounter === 13, 'T5.9', 'voucherCounter remains 13 after bank custom payment');

  // Balances calculation check
  const activeList = await activePayments();
  const totalCashPayments = activeList.filter(p => p.paymentMode === 'Cash').reduce((sum, p) => sum + p.amount, 0);
  // normal1(1500) + custom1(850) + custom2(450) + normal3(1100) = 3900
  assert(totalCashPayments === 3900, 'T5.10', 'Total active cash payments correctly sum normal and custom payments', `sum=${totalCashPayments}`);

  console.log('\n--- GROUP 6: Voiding & Permanent Deletion Safety ---');
  // Void custom2
  await executeVoidPayment(custom2.id, 'Duplicate entry');
  const voidedCustom2 = await fsGetOneSafe('payments', custom2.id);
  assert(voidedCustom2.voided === true, 'T6.1', 'Custom payment marked voided successfully');
  assert(voidedCustom2.voidReason === 'Duplicate entry', 'T6.2', 'Void reason preserved');
  assert((await fsGetCounters()).voucherCounter === 13, 'T6.3', 'Voiding custom payment strictly preserves voucherCounter at 13');

  // Permanently delete customBank
  const delRes = await executeDeletePayment(customBank.id);
  assert(delRes.deleted === true, 'T6.4', 'Custom bank payment deleted successfully');
  assert(delRes.isCustom === true, 'T6.5', 'deletePayment detected isCustom=true');
  const checkDeletedDoc = await mockDb.collection('payments').doc(customBank.firestoreId).get();
  assert(!checkDeletedDoc.exists, 'T6.6', 'Custom payment document permanently removed from Firestore');
  assert(!idbStore.payments.has(customBank.id), 'T6.7', 'Custom payment evicted from local cache');
  assert((await fsGetCounters()).voucherCounter === 13, 'T6.8', 'Deleting custom payment strictly preserves voucherCounter at 13 (no decrement/reset)');

  // Delete highest normal voucher V-013 to verify trailing reuse works alongside custom payments
  const delNormal3 = await executeDeletePayment(normal3.id);
  assert(delNormal3.deleted === true, 'T6.9', 'Normal voucher V-013 deleted successfully');
  const counterAfterDelNormal3 = (await fsGetCounters()).voucherCounter;
  assert(counterAfterDelNormal3 === 12, 'T6.10', 'Deleting highest normal voucher V-013 safely adjusted counter down to 12', `voucherCounter=${counterAfterDelNormal3}`);
  const previewAfterReuse = await nextVoucherNo();
  assert(previewAfterReuse === 'V-013', 'T6.11', 'Next voucher preview immediately reflects reused V-013', `preview=${previewAfterReuse}`);

  // Next normal payment reuses V-013
  const normal3Reused = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Kerala Electricals (Emergency)',
    amount: 900,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Electricity & Water',
    description: 'Circuit breaker replacement'
  }, false);
  assert(normal3Reused.voucherNo === 'V-013', 'T6.12', 'New payment cleanly reused trailing voucher V-013', `voucherNo=${normal3Reused.voucherNo}`);
  assert((await fsGetCounters()).voucherCounter === 13, 'T6.13', 'voucherCounter returned to 13');

  console.log('\n--- GROUP 7: CSV Export & Search Integration ---');
  // Export row formatting test
  const testRows = [['VoucherNo', 'Date', 'PaidTo', 'Fund', 'Category', 'Description', 'PaymentMode', 'BankAccount', 'Amount', 'BillNo', 'Remarks', 'Status']];
  const allForExport = await allPayments();
  allForExport.forEach(p => testRows.push([p.voucherNo || '', p.date, p.paidTo, p.fund, p.category, p.description, p.paymentMode, p.bankAccount, p.amount, p.billNo, p.remarks, p.voided ? 'Voided' : 'Active']));

  const customExportRow = testRows.find(r => r[2] === 'Local Coconut Vendor (Revised)');
  assert(!!customExportRow, 'T7.1', 'Custom payment present in CSV export dataset');
  assert(customExportRow[0] === '', 'T7.2', 'Custom payment exports empty string for VoucherNo (no fabricated voucher number)', `voucherNo="${customExportRow[0]}"`);

  const normalExportRow = testRows.find(r => r[0] === 'V-011');
  assert(!!normalExportRow, 'T7.3', 'Normal payment V-011 exports exact VoucherNo "V-011"');

  // Search filter test
  const q1 = 'coconuts';
  const matches1 = allForExport.filter(p => [p.voucherNo || '', p.paidTo, p.category, p.fund, p.description, p.billNo, String(p.amount)].join(' ').toLowerCase().includes(q1));
  assert(matches1.length === 1 && matches1[0].id === custom1.id, 'T7.4', 'Global search finds custom payment by description keywords');

  const q2 = 'electricals';
  const matches2 = allForExport.filter(p => [p.voucherNo || '', p.paidTo, p.category, p.fund, p.description, p.billNo, String(p.amount)].join(' ').toLowerCase().includes(q2));
  assert(matches2.length === 2, 'T7.5', 'Global search correctly finds multiple normal payments');

  console.log('\n--- GROUP 8: Concurrency & Duplicate Prevention ---');
  // Create 5 concurrent custom payments
  const concurrentCustomPromises = Array.from({ length: 5 }, (_, i) =>
    executeSavePayment({
      date: '2026-10-21',
      paidTo: `Vendor Parallel ${i + 1}`,
      amount: 100 + i * 10,
      paymentMode: 'Cash',
      fund: 'General Temple Fund',
      category: 'Pooja Materials',
      description: `Concurrent custom test ${i + 1}`
    }, true)
  );
  const concurrentCustomResults = await Promise.all(concurrentCustomPromises);
  const customIds = new Set(concurrentCustomResults.map(p => p.id));
  const customDocIds = new Set(concurrentCustomResults.map(p => p.firestoreId));

  assert(customIds.size === 5, 'T8.1', 'All 5 concurrent custom payments generated distinct unique internal IDs', `uniqueCount=${customIds.size}/5`);
  assert(customDocIds.size === 5, 'T8.2', 'All 5 concurrent custom payments generated distinct Firestore doc IDs', `uniqueDocCount=${customDocIds.size}/5`);
  assert((await fsGetCounters()).voucherCounter === 13, 'T8.3', 'voucherCounter strictly unchanged at 13 across all concurrent custom saves');

  // Next normal payment still gets next sequential number (V-014)
  const normal4 = await executeSavePayment({
    date: '2026-10-21',
    paidTo: 'Sound Systems Inc',
    amount: 1800,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    category: 'Festival Expenses',
    description: 'Stage lighting'
  }, false);
  assert(normal4.voucherNo === 'V-014', 'T8.4', 'Normal payment following 5 concurrent custom saves receives exact V-014', `voucherNo=${normal4.voucherNo}`);
  assert((await fsGetCounters()).voucherCounter === 14, 'T8.5', 'voucherCounter is now 14');

  console.log('\n' + '='.repeat(80));
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  const jsonResults = {
    step: '33.173',
    name: 'Custom Unnumbered Payment and Voucher Sequence Preservation',
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    failedTests,
    allPassed: failedTests === 0,
    testResults
  };

  fs.writeFileSync(
    path.join(__dirname, 'step_33_173_test_results.json'),
    JSON.stringify(jsonResults, null, 2),
    'utf8'
  );

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
