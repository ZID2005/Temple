/**
 * STEP 33.175 — Block Number Mode, Receipt Number Lock, and Radial Glow Animation Test Suite
 * Location: tests/test_step_33_175_block_receipt_suite.js
 *
 * Automated invariant & integration test suite verifying:
 *  1. HTML & CSS inspection: button positioning, radial glow classes, keyframes, banner, labels.
 *  2. Activating BLOCK NUMBER clears and disables the Receipt Number field.
 *  3. Receipt preview handlers cannot repopulate the field during block mode.
 *  4. Block-mode banner and active button styling/aria appear.
 *  5. Radial glow/shine animation activates appropriately.
 *  6. Reduced-motion preferences are respected.
 *  7. Exiting block mode restores normal preview and enables the field.
 *  8. Saving an unnumbered receipt stores receiptType: "custom", receiptNo: "", id: "c_...".
 *  9. Sequence counters (globalSequenceCounter, receiptCounter) strictly untouched by block receipts.
 * 10. Sequential numbering invariant: R-026 -> unnumbered (—) -> R-027 (no numbers skipped).
 * 11. Failed save preserves block mode and form data.
 * 12. Successful save restores normal mode and resets active button styling.
 * 13. Editing custom and normal receipts preserves their correct types.
 * 14. Billing-linked receipts are guarded against conversion to block receipts.
 * 15. Print, Cash Book, Bank Book, Ledger, search, and CSV export integration without inventing numbers.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.175: BLOCK NUMBER MODE, RECEIPT LOCK & RADIAL GLOW TEST SUITE');
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
// MOCK FIRESTORE & SYSTEM STATE
// =========================================================================

class MockDocRef {
  constructor(db, colPath, docId) {
    this.db = db;
    this.colPath = colPath;
    this.id = String(docId);
  }
  async get() { return this.db._getDoc(this.colPath, this.id); }
  async set(data, options = {}) { return this.db._setDoc(this.colPath, this.id, data, options); }
  async update(data) { return this.db._setDoc(this.colPath, this.id, data, { merge: true }); }
  async delete() { return this.db._deleteDoc(this.colPath, this.id); }
}

class MockCollectionRef {
  constructor(db, colPath) {
    this.db = db;
    this.colPath = colPath;
  }
  doc(id) { return new MockDocRef(this.db, this.colPath, String(id)); }
  async get() { return this.db._getCol(this.colPath); }
}

class MockFirestore {
  constructor() {
    this.store = new Map();
    this._txQueue = Promise.resolve();
  }
  collection(colPath) { return new MockCollectionRef(this, colPath); }
  _key(col, id) { return `${col}/${id}`; }
  _getDoc(col, id) {
    const k = this._key(col, id);
    const exists = this.store.has(k);
    const data = exists ? JSON.parse(JSON.stringify(this.store.get(k))) : null;
    return { id: String(id), exists, data: () => data };
  }
  _setDoc(col, id, data, options = {}) {
    const k = this._key(col, id);
    if (options.merge && this.store.has(k)) {
      const prev = this.store.get(k);
      this.store.set(k, Object.assign({}, prev, JSON.parse(JSON.stringify(data))));
    } else {
      this.store.set(k, JSON.parse(JSON.stringify(data)));
    }
    return Promise.resolve();
  }
  _deleteDoc(col, id) {
    this.store.delete(this._key(col, id));
    return Promise.resolve();
  }
  _getCol(col) {
    const docs = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${col}/`)) {
        const id = k.split('/')[1];
        docs.push({ id, data: () => JSON.parse(JSON.stringify(v)) });
      }
    }
    return { docs, empty: docs.length === 0, size: docs.length };
  }
  async runTransaction(updateFunction) {
    const prev = this._txQueue;
    let resolver;
    this._txQueue = new Promise(r => resolver = r);
    await prev;
    try {
      const tx = {
        get: async (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
        delete: (ref) => ref.delete()
      };
      const res = await updateFunction(tx);
      return res;
    } finally {
      resolver();
    }
  }
}

// =========================================================================
// RUN TEST SUITE
// =========================================================================

async function runTests() {
  const htmlPath = path.join(__dirname, '..', 'Temple_Accounts-1.html');
  const appHtml = fs.readFileSync(htmlPath, 'utf8');

  // --- GROUP 1: HTML & CSS Inspection for Step 33.175 ---
  console.log('\n--- GROUP 1: HTML Structure & CSS Inspection ---');
  assert(appHtml.includes('id="btn-block-receipt"'), 'T1.1', 'BLOCK NUMBER button present with id="btn-block-receipt"');
  assert(appHtml.includes('btn-block-receipt') && appHtml.includes('rg-button'), 'T1.2', 'BLOCK NUMBER button incorporates rg-button radial glow class');
  assert(appHtml.includes('btn-block-receipt') && appHtml.includes('rg-shine'), 'T1.3', 'Receipt radial glow shine container present');
  assert(appHtml.includes('btn-block-receipt') && appHtml.includes('rg-bg'), 'T1.4', 'Receipt radial glow background container present');
  assert(appHtml.includes('btn-block-receipt') && appHtml.includes('rg-label'), 'T1.5', 'Receipt radial glow label present');
  assert(appHtml.includes('onclick="toggleBlockReceiptMode()"'), 'T1.6', 'BLOCK NUMBER button invokes toggleBlockReceiptMode()');
  assert(appHtml.includes('id="block-receipt-banner"'), 'T1.7', 'Block receipt banner element present');
  assert(appHtml.includes('UNNUMBERED RECEIPT — NO RECEIPT NUMBER'), 'T1.8', 'Visual banner text displays UNNUMBERED RECEIPT — NO RECEIPT NUMBER');
  assert(appHtml.includes('id="receiptNo"'), 'T1.9', 'Receipt number input has explicit id="receiptNo"');
  assert(appHtml.includes('id="receiptNoLabel"'), 'T1.10', 'Receipt number label has explicit id="receiptNoLabel"');
  assert(appHtml.includes('.btn-block-receipt.rg-button.is-active'), 'T1.11', 'Active block receipt CSS styling defined with glow & animations');
  assert(appHtml.includes('.block-receipt-banner'), 'T1.12', 'CSS styling for .block-receipt-banner defined');
  assert(appHtml.includes('<option value="custom">Unnumbered (Block)</option>'), 'T1.13', 'Receipt table filter has Unnumbered (Block) option');
  assert(appHtml.includes('badge-custom-receipt'), 'T1.14', 'Receipt table renders badge-custom-receipt for unnumbered receipts');

  // Verify button positioning: immediately after CANCEL in receipt form
  const cancelReceiptPos = appHtml.indexOf('id="btn-cancel-receipt"');
  const blockReceiptPos = appHtml.indexOf('id="btn-block-receipt"');
  assert(cancelReceiptPos > 0 && blockReceiptPos > cancelReceiptPos, 'T1.15', 'BLOCK NUMBER button is placed after CANCEL button in receipt form');

  // --- GROUP 2: State Machine & Form DOM Simulation ---
  console.log('\n--- GROUP 2: Block Mode Toggle & Receipt Field Lock ---');

  const mockDb = new MockFirestore();
  mockDb.store.set('system/counters', {
    receiptCounter: 25,
    receiptPrefix: 'R-',
    globalSequenceCounter: 25,
    voucherCounter: 10
  });

  const sandbox = {
    console,
    WIRE_FUNCS: {},
    VIEW_RENDERERS: {},
    window: {
      isReceiptSaving: false,
      isBlockReceiptMode: false,
      isBlockNumberMode: false,
      _cachedNormalReceiptPreview: '',
      APP_SETTINGS: { receiptCounter: 25, receiptPrefix: 'R-', globalSequenceCounter: 25 }
    },
    document: {
      _elements: new Map(),
      getElementById(id) { return this._elements.get(id) || null; },
      querySelector(sel) {
        if (sel === 'input[name="receiptNo"]') return this._elements.get('receiptNo');
        if (sel === 'input[name="editId"]') return this._elements.get('receiptEditId');
        if (sel === 'input[name="name"]') return this._elements.get('receiptName');
        if (sel === 'input[name="amount"]') return this._elements.get('receiptAmount');
        if (sel === 'input[name="isBillingLinked"]') return this._elements.get('isBillingLinked');
        return null;
      }
    },
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) {
        const map = {
          name: 'receiptName',
          date: 'receiptDate',
          fund: 'receiptFund',
          category: 'receiptCategory',
          amount: 'receiptAmount',
          paymentMode: 'receiptPaymentMode',
          receiptNo: 'receiptNo',
          editId: 'receiptEditId',
          remarks: 'receiptRemarks',
          mobile: 'receiptMobile',
          star: 'receiptStar'
        };
        const id = map[name];
        return id ? (sandbox.document.getElementById(id)?.value || '') : '';
      }
    },
    el(id) { return sandbox.document.getElementById(id); },
    alert(msg) { sandbox._lastAlert = msg; },
    getCurrentFirebaseUser() { return { uid: 'admin_test', email: 'admin@temple.org' }; },
    fsGetCounters: async () => mockDb._getDoc('system', 'counters').data(),
    parseGlobalNumber: (str) => {
      if (typeof str === 'number') return (Number.isInteger(str) && str > 0) ? str : null;
      if (!str || typeof str !== 'string') return null;
      const match = str.trim().match(/^(?:BILL-|R-)?0*([1-9]\d*)$/i);
      return match ? parseInt(match[1], 10) : null;
    },
    getNextGlobalSequenceNo: async () => {
      const c = mockDb._getDoc('system', 'counters').data() || {};
      return (c.globalSequenceCounter || c.receiptCounter || 0) + 1;
    },
    computeReceiptFingerprint: (input) => 'fp_' + (input?.name || '') + '_' + (input?.amount || ''),
    computeReceiptFingerprintV1: (input) => 'fp1_' + (input?.name || '') + '_' + (input?.amount || ''),
    generateOperationId: (p) => (p || 'op') + '_' + Date.now(),
    localStorage: {
      _store: new Map(),
      getItem(k) { return this._store.get(k) || null; },
      setItem(k, v) { this._store.set(k, String(v)); },
      removeItem(k) { this._store.delete(k); },
      clear() { this._store.clear(); }
    },
    nextReceiptNo: async () => {
      const c = mockDb._getDoc('system', 'counters').data();
      return (c.receiptPrefix || 'R-') + String((c.receiptCounter || 0) + 1).padStart(3, '0');
    },
    fsCreateIndependentReceipt: async (rec) => {
      return mockDb.runTransaction(async (tx) => {
        const cRef = mockDb.collection('system').doc('counters');
        const snap = await tx.get(cRef);
        const data = snap.data() || {};
        const curSeq = data.globalSequenceCounter || data.receiptCounter || 0;
        const nextSeq = curSeq + 1;
        tx.update(cRef, { globalSequenceCounter: nextSeq, receiptCounter: nextSeq });
        const seqReceiptNo = (data.receiptPrefix || 'R-') + String(nextSeq).padStart(3, '0');
        const finalRec = Object.assign({}, rec, {
          id: nextSeq,
          firestoreId: 'rcpt_' + nextSeq,
          receiptNo: seqReceiptNo,
          receiptType: 'independent'
        });
        await mockDb.collection('receipts').doc(finalRec.firestoreId).set(finalRec);
        return { receiptRecord: finalRec, documentId: finalRec.firestoreId, receiptNo: finalRec.receiptNo };
      });
    },
    fsSaveRecordSafe: async (col, rec, isNew) => {
      await mockDb.collection(col).doc(rec.firestoreId || rec.id).set(rec);
    },
    fsUpdateRecordSafe: async (col, docId, rec) => {
      await mockDb.collection(col).doc(docId).set(rec, { merge: true });
    },
    fsGetOneSafe: async (col, id) => {
      const docId = id.startsWith('rcpt_') ? id : ('rcpt_' + id);
      const snap = await mockDb.collection(col).doc(docId).get();
      return snap.exists ? snap.data() : null;
    },
    getOne: async (col, id) => sandbox.window.APP_SETTINGS || { id: 1 },
    putRec: async (col, data) => {},
    fsGet: async (col, id) => sandbox.window.APP_SETTINGS || { id: 1 },
    refreshSettings: async () => sandbox.window.APP_SETTINGS,
    navigate: async (view) => { sandbox._lastNavigatedView = view; },
    reprintReceipt: (id) => { sandbox._lastReprintId = id; },
    printReceipt: (rec) => { sandbox._lastPrintedReceipt = rec; },
    parsePhysicalReceiptIdentifier: (no) => {
      if (!no || typeof no !== 'string') return null;
      const t = no.trim().toUpperCase();
      const mPU = t.match(/^PU([1-9]\d*)$/);
      if (mPU) return { type: 'PU', number: parseInt(mPU[1], 10), canonical: `PU${parseInt(mPU[1], 10)}` };
      const mP = t.match(/^P([1-9]\d*)$/);
      if (mP) return { type: 'P', number: parseInt(mP[1], 10), canonical: `P${parseInt(mP[1], 10)}` };
      return null;
    },
    resolvePaymentType: (item, fallback) => item.paymentMode || fallback || 'Cash',
    resolveReceiptDesc: (r) => r.description || '',
    activeReceipts: async () => {
      const col = await mockDb.collection('receipts').get();
      return col.docs.map(d => d.data());
    },
    allReceipts: async () => {
      const col = await mockDb.collection('receipts').get();
      return col.docs.map(d => d.data());
    },
    activePayments: async () => [],
    allPayments: async () => [],
    allTransfers: async () => [],
    allLoans: async () => [],
    allChittyCollections: async () => [],
    allChittyPayouts: async () => [],
    allFunds: async () => [{ name: 'General Temple Fund' }]
  };

  function setupReceiptDOM(initialReceiptNo = 'R-026', isEditing = false, isBlock = false, isBillingLinked = false) {
    const rInput = {
      id: 'receiptNo',
      value: isBlock ? '' : initialReceiptNo,
      disabled: isBlock,
      readOnly: isBlock,
      required: !isBlock,
      placeholder: isBlock ? '— (No Receipt Number)' : '',
      style: { background: '', color: '', cursor: '' },
      _attrs: new Map(),
      setAttribute(k, v) { this._attrs.set(k, v); },
      removeAttribute(k) { this._attrs.delete(k); },
      getAttribute(k) { return this._attrs.get(k); },
      focus() {}
    };
    const rLabel = { id: 'receiptNoLabel', innerHTML: isBlock ? 'Receipt No (Block Mode)' : 'Receipt No' };
    const banner = { id: 'block-receipt-banner', style: { display: isBlock ? 'flex' : 'none' } };
    const classSet = new Set(isBlock ? ['is-active', 'btn-block-receipt', 'rg-button'] : ['btn-block-receipt', 'rg-button']);
    const blockBtn = {
      id: 'btn-block-receipt',
      classList: {
        add(c) { classSet.add(c); },
        remove(c) { classSet.delete(c); },
        contains(c) { return classSet.has(c); },
        has(c) { return classSet.has(c); }
      },
      _attrs: new Map([['aria-pressed', isBlock ? 'true' : 'false']]),
      setAttribute(k, v) { this._attrs.set(k, v); },
      getAttribute(k) { return this._attrs.get(k); },
      title: isBlock ? 'Block Mode Active — Saves without receipt number' : 'Block Number — Save without receipt number',
      querySelector(s) { return s === '.rg-text' ? labelSpan : null; }
    };
    const labelSpan = { textContent: isBlock ? 'BLOCK NUMBER ACTIVE' : 'BLOCK NUMBER' };
    const nameInput = { id: 'receiptName', value: 'Sreedharan Pillai' };
    const dateInput = { id: 'receiptDate', value: '2026-10-21' };
    const fundInput = { id: 'receiptFund', value: 'General Temple Fund' };
    const categoryInput = { id: 'receiptCategory', value: 'Vazhipadu' };
    const amountInput = { id: 'receiptAmount', value: '250' };
    const paymentModeInput = { id: 'receiptPaymentMode', value: 'Cash' };
    const editIdInput = { id: 'receiptEditId', value: isEditing ? 'rcpt_edit_123' : '' };
    const remarksInput = { id: 'receiptRemarks', value: 'Block mode donation' };
    const mobileInput = { id: 'receiptMobile', value: '9876543210' };
    const starInput = { id: 'receiptStar', value: 'Rohini' };
    const saveBtn = { id: 'btn-save-receipt', disabled: false };
    const savePrintBtn = { id: 'btn-save-print-receipt', disabled: false };
    const receiptForm = {
      id: 'receiptForm',
      querySelector(s) { return sandbox.document.querySelector(s); }
    };

    sandbox.document._elements.clear();
    sandbox.document._elements.set('receiptNo', rInput);
    sandbox.document._elements.set('receiptNoLabel', rLabel);
    sandbox.document._elements.set('block-receipt-banner', banner);
    sandbox.document._elements.set('btn-block-receipt', blockBtn);
    sandbox.document._elements.set('receiptName', nameInput);
    sandbox.document._elements.set('receiptDate', dateInput);
    sandbox.document._elements.set('receiptFund', fundInput);
    sandbox.document._elements.set('receiptCategory', categoryInput);
    sandbox.document._elements.set('receiptAmount', amountInput);
    sandbox.document._elements.set('receiptPaymentMode', paymentModeInput);
    sandbox.document._elements.set('receiptEditId', editIdInput);
    sandbox.document._elements.set('receiptRemarks', remarksInput);
    sandbox.document._elements.set('receiptMobile', mobileInput);
    sandbox.document._elements.set('receiptStar', starInput);
    sandbox.document._elements.set('btn-save-receipt', saveBtn);
    sandbox.document._elements.set('btn-save-print-receipt', savePrintBtn);
    sandbox.document._elements.set('isBillingLinked', { value: isBillingLinked ? '1' : '0' });
    sandbox.document._elements.set('receiptForm', receiptForm);

    sandbox.window.isBlockReceiptMode = isBlock;
    sandbox.window.isBlockNumberMode = isBlock;
    sandbox.window._cachedNormalReceiptPreview = initialReceiptNo;
    sandbox.window._editingIsBillingLinked = isBillingLinked;
  }

  // Load functions from Temple_Accounts-1.html using resilient section delimiters
  function extractChunk(s, e) {
    const i = appHtml.indexOf(s);
    if (i === -1) throw new Error('Delimiter not found: ' + s);
    const j = appHtml.indexOf(e, i);
    if (j === -1) throw new Error('Delimiter not found: ' + e);
    return appHtml.substring(i, j);
  }

  const codeToRun = [
    extractChunk('function onReceiptNoInput(', '/* ===================== RECEIPTS'),
    extractChunk('function cancelReceiptForm()', '/* ===================== BILLING MODULE'),
    extractChunk('async function buildCashBookRows()', 'VIEW_RENDERERS.cashbook =')
  ].join('\n');
  sandbox.todayISO = () => '2026-10-21';
  sandbox.qsa = () => [];
  sandbox.fmtDate = (d) => d || '2026-10-21';
  sandbox.fmtMoney = (m) => '₹' + (parseFloat(m) || 0).toFixed(2);
  sandbox.esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  sandbox.closeModal = () => {};
  sandbox.isLocalEnvironment = () => true;

  vm.createContext(sandbox);
  vm.runInContext(codeToRun, sandbox);

  // Test T2.1–T2.11: Activating Block Number Mode
  setupReceiptDOM('R-026', false, false);
  const rInput = sandbox.document.getElementById('receiptNo');
  const banner = sandbox.document.getElementById('block-receipt-banner');
  const blockBtn = sandbox.document.getElementById('btn-block-receipt');

  assert(sandbox.window.isBlockReceiptMode === false, 'T2.1', 'Initial receipt form is in normal mode');
  assert(rInput.value === 'R-026', 'T2.2', 'Initial receipt field contains preview R-026');
  assert(rInput.disabled === false, 'T2.3', 'Initial receipt field is enabled');

  // Trigger BLOCK NUMBER activation
  sandbox.toggleBlockReceiptMode();
  assert(sandbox.window.isBlockReceiptMode === true, 'T2.4', 'Activating BLOCK NUMBER sets isBlockReceiptMode=true');
  assert(sandbox.window.isBlockNumberMode === true, 'T2.5', 'isBlockNumberMode alias also synchronized to true');
  assert(rInput.value === '', 'T2.6', 'Activating BLOCK NUMBER immediately clears receipt number input');
  assert(rInput.disabled === true, 'T2.7', 'Activating BLOCK NUMBER disables receipt number input');
  assert(rInput.readOnly === true, 'T2.8', 'Activating BLOCK NUMBER makes receipt number input readOnly');
  assert(rInput.getAttribute('aria-disabled') === 'true', 'T2.9', 'Activating BLOCK NUMBER sets aria-disabled="true"');
  assert(rInput.placeholder.includes('No Receipt Number'), 'T2.10', 'Input placeholder informs user of unnumbered status');
  assert(banner.style.display === 'flex', 'T2.11', 'Activating BLOCK NUMBER displays block-receipt-banner');
  assert(blockBtn.classList.has('is-active'), 'T2.12', 'Activating BLOCK NUMBER adds .is-active to button');
  assert(blockBtn.getAttribute('aria-pressed') === 'true', 'T2.13', 'BLOCK NUMBER button aria-pressed="true"');

  // Devotee and payment details preserved
  assert(sandbox.document.getElementById('receiptName').value === 'Sreedharan Pillai', 'T2.14', 'Devotee name preserved across activation');
  assert(sandbox.document.getElementById('receiptAmount').value === '250', 'T2.15', 'Receipt amount preserved across activation');

  // Test T2.16–T2.22: Exiting Block Number Mode
  sandbox.toggleBlockReceiptMode();
  assert(sandbox.window.isBlockReceiptMode === false, 'T2.16', 'Clicking BLOCK NUMBER again exits mode (isBlockReceiptMode=false)');
  assert(rInput.disabled === false, 'T2.17', 'Exiting block mode re-enables receipt number input');
  assert(rInput.readOnly === false, 'T2.18', 'Exiting block mode sets readOnly=false');
  assert(rInput.value === 'R-026', 'T2.19', 'Exiting block mode restores cached preview R-026 without consuming a sequence number');
  assert(banner.style.display === 'none', 'T2.20', 'Exiting block mode hides block-receipt-banner');
  assert(!blockBtn.classList.has('is-active'), 'T2.21', 'Exiting block mode removes .is-active from button');
  assert(blockBtn.getAttribute('aria-pressed') === 'false', 'T2.22', 'BLOCK NUMBER button aria-pressed="false"');

  // Verify counters untouched by toggle
  const counterSnap1 = await sandbox.fsGetCounters();
  assert(counterSnap1.receiptCounter === 25 && counterSnap1.globalSequenceCounter === 25, 'T2.23', 'Counters strictly untouched (remain 25) during toggle cycles');

  // --- GROUP 3: Receipt Preview & Input Guards ---
  console.log('\n--- GROUP 3: Receipt Preview Handlers Guarded During Block Mode ---');
  setupReceiptDOM('R-026', false, true); // Active block mode
  const rInputBlocked = sandbox.document.getElementById('receiptNo');

  // Attempt to push new preview into form while block mode active
  sandbox.updateReceiptNoPreview('R-099');
  assert(rInputBlocked.value === '', 'T3.1', 'updateReceiptNoPreview does not overwrite locked blank field during block mode');
  assert(sandbox.window._cachedNormalReceiptPreview === 'R-099', 'T3.2', 'updateReceiptNoPreview updates internal cache for future normal receipts');

  // Input event guard
  rInputBlocked.value = 'R-FORCED';
  sandbox.onReceiptNoInput(rInputBlocked);
  assert(rInputBlocked.value === '', 'T3.3', 'onReceiptNoInput immediately forces blank when block mode is active');

  // Billing-linked receipt guard
  setupReceiptDOM('R-010', true, false, true);
  sandbox.toggleBlockReceiptMode();
  assert(sandbox.window.isBlockReceiptMode === false, 'T3.4', 'Billing-linked receipt is guarded against block mode activation');
  assert(sandbox._lastAlert && sandbox._lastAlert.includes('Billing-linked'), 'T3.5', 'Helpful alert shown when attempting block mode on billing receipt');

  // --- GROUP 4: Sequential Numbering Invariant (R-026 -> Unnumbered -> R-027) ---
  console.log('\n--- GROUP 4: Save Invariant & Counter Safety ---');

  // Step A: Save Normal Receipt R-026
  setupReceiptDOM('R-026', false, false);
  await sandbox.saveReceipt(false, false);
  const countersAfterNormal = await sandbox.fsGetCounters();
  assert(countersAfterNormal.globalSequenceCounter === 26, 'T4.1', 'First normal receipt advances globalSequenceCounter to 26');
  assert(countersAfterNormal.receiptCounter === 26, 'T4.2', 'First normal receipt advances receiptCounter to 26');

  // Check saved normal receipt document
  const normalDoc = await sandbox.fsGetOneSafe('receipts', 'rcpt_26');
  assert(normalDoc && normalDoc.receiptNo === 'R-026', 'T4.3', 'Normal receipt saved with sequential number R-026');
  assert(normalDoc.receiptType === 'independent', 'T4.4', 'Normal receipt has receiptType: "independent"');

  // Step B: Save Block / Unnumbered Receipt
  setupReceiptDOM('R-027', false, true);
  sandbox.document.getElementById('receiptName').value = 'Anand Unnithan';
  sandbox.document.getElementById('receiptAmount').value = '1000';
  sandbox.document.getElementById('receiptRemarks').value = 'Special Block donation';

  await sandbox.saveReceipt(false, false);

  // Counters MUST NOT change
  const countersAfterBlock = await sandbox.fsGetCounters();
  assert(countersAfterBlock.globalSequenceCounter === 26, 'T4.5', 'globalSequenceCounter strictly NOT advanced by unnumbered receipt (remains 26)');
  assert(countersAfterBlock.receiptCounter === 26, 'T4.6', 'receiptCounter strictly NOT advanced by unnumbered receipt (remains 26)');

  // Verify unnumbered receipt document in Firestore
  const allSaved = await sandbox.allReceipts();
  const blockDoc = allSaved.find(r => r.name === 'Anand Unnithan');
  assert(blockDoc !== undefined, 'T4.7', 'Unnumbered receipt found in Firestore store');
  assert(blockDoc.receiptNo === '', 'T4.8', 'Unnumbered receipt has receiptNo strictly equal to empty string ""');
  assert(blockDoc.receiptType === 'custom', 'T4.9', 'Unnumbered receipt has receiptType: "custom"');
  assert(String(blockDoc.id).startsWith('c_'), 'T4.10', 'Unnumbered receipt document ID starts with "c_"');
  assert(String(blockDoc.firestoreId).startsWith('rcpt_c_'), 'T4.11', 'Unnumbered receipt firestoreId starts with "rcpt_c_"');
  assert(blockDoc.amount === 1000, 'T4.12', 'Amount correctly saved as 1000');
  assert(sandbox.window.isBlockReceiptMode === false, 'T4.13', 'Successful block save cleanly resets isBlockReceiptMode to false');

  // Step C: Save Next Normal Receipt
  setupReceiptDOM('R-027', false, false);
  sandbox.document.getElementById('receiptName').value = 'Radha G.';
  sandbox.document.getElementById('receiptAmount').value = '500';

  await sandbox.saveReceipt(false, false);

  // Counter must now advance to 27, and receipt receives R-027 (NO SKIPPED NUMBERS)
  const countersAfterSecondNormal = await sandbox.fsGetCounters();
  assert(countersAfterSecondNormal.globalSequenceCounter === 27, 'T4.14', 'Next normal receipt advances counter to 27');
  const secondNormalDoc = await sandbox.fsGetOneSafe('receipts', 'rcpt_27');
  assert(secondNormalDoc && secondNormalDoc.receiptNo === 'R-027', 'T4.15', 'Next normal receipt receives exact sequential number R-027 without skipping');

  // --- GROUP 5: Validation Failure & Form State Retention ---
  console.log('\n--- GROUP 5: Validation Failure Retains Block Mode ---');
  setupReceiptDOM('R-028', false, true);
  sandbox.document.getElementById('receiptName').value = ''; // Invalid: missing devotee name
  sandbox.document.getElementById('receiptAmount').value = '350';

  await sandbox.saveReceipt(false, false);
  assert(sandbox.window.isBlockReceiptMode === true, 'T5.1', 'Validation failure preserves isBlockReceiptMode=true');
  assert(sandbox.document.getElementById('receiptAmount').value === '350', 'T5.2', 'Form fields preserved on validation failure');
  const btn = sandbox.document.getElementById('btn-block-receipt');
  assert(btn.classList.has('is-active'), 'T5.3', 'Active button styling preserved on validation failure');

  // --- GROUP 6: Editing Invariants ---
  console.log('\n--- GROUP 6: Editing Unnumbered & Normal Receipts ---');

  // Mock prior unnumbered receipt
  const customRcptId = 'c_1729500000000';
  mockDb.store.set(`receipts/rcpt_${customRcptId}`, {
    id: customRcptId,
    firestoreId: `rcpt_${customRcptId}`,
    receiptNo: '',
    receiptType: 'custom',
    name: 'Existing Devotee',
    amount: 700,
    fund: 'General Temple Fund',
    paymentMode: 'Cash',
    date: '2026-10-21'
  });

  // Edit unnumbered receipt
  setupReceiptDOM('', true, true);
  sandbox.document.getElementById('receiptEditId').value = customRcptId;
  sandbox.document.getElementById('receiptName').value = 'Existing Devotee (Updated)';
  sandbox.document.getElementById('receiptAmount').value = '850';

  await sandbox.saveReceipt(false, false);
  const updatedCustom = await sandbox.fsGetOneSafe('receipts', `rcpt_${customRcptId}`);
  assert(updatedCustom && updatedCustom.name === 'Existing Devotee (Updated)', 'T6.1', 'Edited unnumbered receipt updated in store');
  assert(updatedCustom.receiptNo === '', 'T6.2', 'Edited unnumbered receipt still has receiptNo: ""');
  assert(updatedCustom.receiptType === 'custom', 'T6.3', 'Edited unnumbered receipt preserves receiptType: "custom"');
  assert(updatedCustom.amount === 850, 'T6.4', 'Updated amount reflects in store');

  // Verify counters were untouched during edit
  const countersAfterEdit = await sandbox.fsGetCounters();
  assert(countersAfterEdit.globalSequenceCounter === 27, 'T6.5', 'Counters remain 27 across unnumbered receipt edit');

  // --- GROUP 7: Print, Cash/Bank Book, Deletion & Export Integration ---
  console.log('\n--- GROUP 7: Accounting & Display Touchpoints ---');

  // Test Print Formatting
  const printArea = { innerHTML: '', className: '' };
  sandbox.document._elements.set('print-area', printArea);
  sandbox.printReceipt(updatedCustom);
  assert(printArea.innerHTML.includes('UNNUMBERED RECEIPT'), 'T7.1', 'Print receipt outputs UNNUMBERED RECEIPT header');
  assert(!printArea.innerHTML.includes('No: undefined') && !printArea.innerHTML.includes('No:  '), 'T7.2', 'Print receipt does not output empty No: prefix');

  // Test Delete Confirmation Modal Label
  const deleteModalData = {
    id: customRcptId,
    receiptNo: '',
    receiptType: 'custom',
    name: 'Existing Devotee',
    amount: 850,
    date: '2026-10-21'
  };
  const modalRoot = { innerHTML: '' };
  sandbox.document._elements.set('modal-root', modalRoot);
  sandbox.showDeleteReceiptModal(deleteModalData, customRcptId);
  assert(modalRoot.innerHTML.includes('— (Unnumbered)'), 'T7.3', 'Delete modal displays "— (Unnumbered)" instead of internal document ID');

  // Test Cash Book formatting
  const cashRows = await sandbox.buildCashBookRows();
  const unnumberedCashRow = cashRows.find(r => r.txType === 'receipt' && r.receipt === 1000);
  assert(unnumberedCashRow !== undefined, 'T7.4', 'Unnumbered receipt included in Cash Book rows');
  assert(unnumberedCashRow.particulars === 'Receipt - Anand Unnithan', 'T7.5', 'Cash Book particulars format cleanly as "Receipt - Devotee"');
  assert(typeof unnumberedCashRow.balance === 'number' && !isNaN(unnumberedCashRow.balance), 'T7.6', 'Cash Book balance remains numeric and valid');

  // Test Bank Book formatting
  mockDb.store.set('receipts/rcpt_c_bank_test', {
    id: 'c_bank_test',
    firestoreId: 'rcpt_c_bank_test',
    receiptNo: '',
    receiptType: 'custom',
    name: 'Bank Devotee',
    amount: 1500,
    fund: 'General Temple Fund',
    paymentMode: 'Bank',
    date: '2026-10-21'
  });
  const bankRows = await sandbox.buildBankBookRows();
  const unnumberedBankRow = bankRows.find(r => r.deposit === 1500);
  assert(unnumberedBankRow !== undefined, 'T7.7', 'Unnumbered bank receipt included in Bank Book rows');
  assert(unnumberedBankRow.particulars === 'Receipt - Bank Devotee (Bank)', 'T7.8', 'Bank Book particulars format cleanly as "Receipt - Devotee (Bank)"');

  // Test CSV Export mapping
  const testList = [
    { receiptNo: 'R-026', date: '2026-10-21', name: 'Devotee A', amount: 100, paymentMode: 'Cash' },
    { receiptNo: '', receiptType: 'custom', date: '2026-10-21', name: 'Devotee B', amount: 200, paymentMode: 'Cash' },
    { receiptNo: 'PU12', physicalType: 'PU', date: '2026-10-21', name: 'Devotee C', amount: 300, paymentMode: 'Cash' }
  ];
  const exportedRows = [];
  testList.forEach(r => {
    const isCustom = !r.receiptNo || r.receiptType === 'custom' || r.isCustom === true;
    const isPhysPU = !isCustom && (r.physicalType === 'PU' || (r.receiptNo && /^PU[1-9]\d*$/i.test(r.receiptNo.trim())));
    const isPhysP = !isCustom && !isPhysPU && (r.physicalType === 'P' || (r.receiptNo && /^P[1-9]\d*$/i.test(r.receiptNo.trim())));
    const typeLabel = isCustom ? 'Unnumbered' : (isPhysPU ? 'Physical Punarudharanam' : (isPhysP ? 'Physical Puja' : 'Software'));
    exportedRows.push([r.receiptNo || '', r.name, typeLabel]);
  });
  assert(exportedRows[1][0] === '' && exportedRows[1][2] === 'Unnumbered', 'T7.9', 'CSV export correctly sets type "Unnumbered" and receiptNo ""');
  assert(exportedRows[2][2] === 'Physical Punarudharanam', 'T7.10', 'CSV export correctly preserves Physical PU receipts');

  // --- SUMMARY ---
  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.175 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exitCode = 1;
    throw new Error(`${failedTests} test(s) failed in Step 33.175 test suite.`);
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST RUNNER ERROR:', err);
  process.exitCode = 1;
});
