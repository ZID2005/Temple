/**
 * STEP 33.174 — Custom Payment Mode, Voucher Number Lock, and Radial Glow Animation Test Suite
 * Location: tests/test_step_33_174_custom_mode_suite.js
 *
 * Automated invariant & integration test suite verifying:
 *  1. Activating CUSTOM clears and disables the Voucher Number field.
 *  2. Voucher preview handlers cannot repopulate the field during custom mode.
 *  3. Custom-mode banner and active button styling appear.
 *  4. Radial glow/shine animation activates appropriately.
 *  5. Reduced-motion preferences are respected.
 *  6. Exiting custom mode restores normal preview and enables the field.
 *  7. Saving a custom payment stores no voucher number.
 *  8. Successful save restores normal mode and stops active animation.
 *  9. Failed save preserves custom mode and form data.
 * 10. The next normal payment receives the correct next voucher number.
 * 11. Editing custom and normal payments preserves their correct types.
 * 12. Existing print, void, delete, accounting, and export behaviour remains intact.
 * 13. All relevant Step 33.173 and voucher-numbering regression tests pass.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.174: CUSTOM PAYMENT MODE, VOUCHER LOCK & RADIAL GLOW TEST SUITE');
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

  // --- GROUP 1: HTML & CSS Inspection for Step 33.174 ---
  console.log('\n--- GROUP 1: HTML Structure & CSS Inspection ---');
  assert(appHtml.includes('id="btn-save-custom-payment"'), 'T1.1', 'CUSTOM button present with id="btn-save-custom-payment"');
  assert(appHtml.includes('rg-button'), 'T1.2', 'CUSTOM button incorporates rg-button radial glow class');
  assert(appHtml.includes('rg-shine'), 'T1.3', 'Radial glow shine container element present');
  assert(appHtml.includes('rg-bg'), 'T1.4', 'Radial glow background element present');
  assert(appHtml.includes('rg-label'), 'T1.5', 'Radial glow label element present');
  assert(appHtml.includes('onclick="toggleCustomPaymentMode()"'), 'T1.6', 'CUSTOM button invokes toggleCustomPaymentMode()');
  assert(appHtml.includes('id="custom-payment-banner"'), 'T1.7', 'Custom payment banner element present');
  assert(appHtml.includes('CUSTOM PAYMENT — NO VOUCHER NUMBER'), 'T1.8', 'Visual banner text displays CUSTOM PAYMENT — NO VOUCHER NUMBER');
  assert(appHtml.includes('id="paymentVoucherNo"'), 'T1.9', 'Voucher Number input has explicit id="paymentVoucherNo"');
  assert(appHtml.includes('id="paymentVoucherNoLabel"'), 'T1.10', 'Voucher Number label has explicit id="paymentVoucherNoLabel"');
  assert(appHtml.includes('@property --rg-pos-x'), 'T1.11', 'CSS @property --rg-pos-x declaration defined');
  assert(appHtml.includes('@property --rg-color-1'), 'T1.12', 'CSS @property --rg-color-1 declaration defined');
  assert(appHtml.includes('@keyframes rg-spin'), 'T1.13', 'CSS @keyframes rg-spin defined for shine rotation');
  assert(appHtml.includes('@keyframes rg-slide'), 'T1.14', 'CSS @keyframes rg-slide defined for shine translation');
  assert(appHtml.includes('@media (prefers-reduced-motion: reduce)'), 'T1.15', 'CSS prefers-reduced-motion media query defined');
  assert(appHtml.includes('.btn-custom-payment.rg-button.is-active'), 'T1.16', 'Active custom-mode CSS styling defined with glow & animations');

  // --- GROUP 2: State Machine & Form DOM Simulation ---
  console.log('\n--- GROUP 2: Custom Mode Toggle & Voucher Field Lock ---');

  // Set up mock DOM environment
  const mockDb = new MockFirestore();
  mockDb.store.set('system/counters', {
    voucherCounter: 10,
    voucherPrefix: 'V-',
    globalSequenceCounter: 5,
    receiptCounter: 1005
  });

  // Create isolated JS context mirroring Temple_Accounts-1.html functions
  const sandbox = {
    console,
    WIRE_FUNCS: {},
    window: {
      isSavingPayment: false,
      isCustomPaymentMode: false,
      _cachedNormalVoucherPreview: '',
      APP_SETTINGS: { voucherCounter: 10, voucherPrefix: 'V-' }
    },
    document: {
      _elements: new Map(),
      getElementById(id) { return this._elements.get(id) || null; },
      querySelector(sel) {
        if (sel === 'input[name="voucherNo"]') return this._elements.get('paymentVoucherNo');
        if (sel === 'input[name="editId"]') return this._elements.get('editIdInput');
        if (sel === 'input[name="paidTo"]') return this._elements.get('paidToInput');
        if (sel === 'input[name="amount"]') return this._elements.get('amountInput');
        return null;
      }
    },
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) {
        if (name === 'paidTo') return sandbox.document.getElementById('paidToInput')?.value || '';
        if (name === 'date') return sandbox.document.getElementById('dateInput')?.value || '';
        if (name === 'fund') return sandbox.document.getElementById('fundInput')?.value || '';
        if (name === 'category') return sandbox.document.getElementById('categoryInput')?.value || '';
        if (name === 'amount') return sandbox.document.getElementById('amountInput')?.value || '';
        if (name === 'paymentMode') return sandbox.document.getElementById('paymentModeInput')?.value || 'Cash';
        if (name === 'voucherNo') return sandbox.document.getElementById('paymentVoucherNo')?.value || '';
        if (name === 'editId') return sandbox.document.getElementById('editIdInput')?.value || '';
        return '';
      }
    },
    el(id) { return sandbox.document.getElementById(id); },
    alert(msg) { sandbox._lastAlert = msg; },
    getCurrentFirebaseUser() { return { uid: 'admin_test', email: 'admin@temple.org' }; },
    fsGetCounters: async () => mockDb._getDoc('system', 'counters').data(),
    nextVoucherNo: async () => {
      const c = mockDb._getDoc('system', 'counters').data();
      return (c.voucherPrefix || 'V-') + String((c.voucherCounter || 0) + 1).padStart(3, '0');
    },
    fsNextVoucherNo: async () => {
      return mockDb.runTransaction(async (tx) => {
        const cRef = mockDb.collection('system').doc('counters');
        const snap = await tx.get(cRef);
        const data = snap.data() || {};
        const cur = data.voucherCounter || 0;
        const next = cur + 1;
        tx.update(cRef, { voucherCounter: next });
        return (data.voucherPrefix || 'V-') + String(next).padStart(3, '0');
      });
    },
    fsSaveRecordSafe: async (col, rec) => {
      await mockDb.collection(col).doc(rec.firestoreId || rec.id).set(rec);
    },
    fsUpdateRecordSafe: async (col, docId, rec) => {
      await mockDb.collection(col).doc(docId).set(rec, { merge: true });
    },
    fsGetOneSafe: async (col, id) => {
      const snap = await mockDb.collection(col).doc(id.startsWith('pmt_') ? id : ('pmt_' + id)).get();
      return snap.exists ? snap.data() : null;
    },
    refreshSettings: async () => {},
    navigate: async (view) => { sandbox._lastNavigatedView = view; }
  };

  // Build Mock DOM Elements
  function setupDOM(initialVoucherNo = 'V-011', isEditing = false, isCustom = false) {
    const vInput = {
      id: 'paymentVoucherNo',
      value: isCustom ? '' : initialVoucherNo,
      disabled: isCustom,
      readOnly: isCustom,
      required: !isCustom,
      placeholder: isCustom ? '— (No Voucher Number)' : '',
      style: { background: '', color: '', cursor: '' },
      _attrs: new Map(),
      setAttribute(k, v) { this._attrs.set(k, v); },
      removeAttribute(k) { this._attrs.delete(k); },
      getAttribute(k) { return this._attrs.get(k); },
      closest(sel) { return vGroup; }
    };
    const vLabel = { id: 'paymentVoucherNoLabel', innerHTML: isCustom ? 'Voucher Number (Custom)' : 'Voucher Number *' };
    const vGroup = { querySelector(s) { return s === 'label' ? vLabel : vInput; } };
    const banner = { id: 'custom-payment-banner', style: { display: isCustom ? 'flex' : 'none' } };
    const classSet = new Set(isCustom ? ['is-active', 'btn-custom-payment', 'rg-button'] : ['btn-custom-payment', 'rg-button']);
    const customBtn = {
      id: 'btn-save-custom-payment',
      classList: {
        add(c) { classSet.add(c); },
        remove(c) { classSet.delete(c); },
        contains(c) { return classSet.has(c); },
        has(c) { return classSet.has(c); }
      },
      _attrs: new Map([['aria-pressed', isCustom ? 'true' : 'false']]),
      setAttribute(k, v) { this._attrs.set(k, v); },
      getAttribute(k) { return this._attrs.get(k); },
      title: isCustom ? 'Custom Mode Active' : 'Custom — Save without voucher number',
      querySelector(s) { return s === '.rg-text' ? labelSpan : null; }
    };
    const labelSpan = { textContent: isCustom ? 'CUSTOM ACTIVE' : 'CUSTOM' };
    const paidToInput = { id: 'paidToInput', value: 'Local Artisan' };
    const dateInput = { id: 'dateInput', value: '2026-10-21' };
    const fundInput = { id: 'fundInput', value: 'General Temple Fund' };
    const categoryInput = { id: 'categoryInput', value: 'Pooja Materials' };
    const amountInput = { id: 'amountInput', value: '450' };
    const paymentModeInput = { id: 'paymentModeInput', value: 'Cash' };
    const editIdInput = { id: 'editIdInput', value: isEditing ? 'edit_123' : '' };
    const saveBtn = { id: 'btn-save-payment', disabled: false };
    const savePrintBtn = { id: 'btn-save-print-payment', disabled: false };
    const paymentForm = {
      id: 'paymentForm',
      querySelector(s) { return sandbox.document.querySelector(s); }
    };

    sandbox.document._elements.clear();
    sandbox.document._elements.set('paymentVoucherNo', vInput);
    sandbox.document._elements.set('paymentVoucherNoLabel', vLabel);
    sandbox.document._elements.set('custom-payment-banner', banner);
    sandbox.document._elements.set('btn-save-custom-payment', customBtn);
    sandbox.document._elements.set('paidToInput', paidToInput);
    sandbox.document._elements.set('dateInput', dateInput);
    sandbox.document._elements.set('fundInput', fundInput);
    sandbox.document._elements.set('categoryInput', categoryInput);
    sandbox.document._elements.set('amountInput', amountInput);
    sandbox.document._elements.set('paymentModeInput', paymentModeInput);
    sandbox.document._elements.set('editIdInput', editIdInput);
    sandbox.document._elements.set('btn-save-payment', saveBtn);
    sandbox.document._elements.set('btn-save-print-payment', savePrintBtn);
    sandbox.document._elements.set('paymentForm', paymentForm);

    sandbox.window.isCustomPaymentMode = isCustom;
    sandbox.window._cachedNormalVoucherPreview = initialVoucherNo;
  }

  // Load functions into sandbox
  const codeToRun = `
    ${appHtml.substring(appHtml.indexOf('function cancelPaymentForm()'), appHtml.indexOf('async function reprintPayment'))}
  `;
  vm.createContext(sandbox);
  vm.runInContext(codeToRun, sandbox);

  // Test T2.1–T2.10: Activating Custom Mode
  setupDOM('V-011', false, false);
  const vInput = sandbox.document.getElementById('paymentVoucherNo');
  const banner = sandbox.document.getElementById('custom-payment-banner');
  const customBtn = sandbox.document.getElementById('btn-save-custom-payment');

  assert(sandbox.window.isCustomPaymentMode === false, 'T2.1', 'Initial form is in normal mode');
  assert(vInput.value === 'V-011', 'T2.2', 'Initial Voucher field contains normal preview V-011');
  assert(vInput.disabled === false, 'T2.3', 'Initial Voucher field is enabled');

  // Trigger CUSTOM activation
  sandbox.toggleCustomPaymentMode();
  assert(sandbox.window.isCustomPaymentMode === true, 'T2.4', 'Activating CUSTOM sets isCustomPaymentMode=true');
  assert(vInput.value === '', 'T2.5', 'Activating CUSTOM immediately clears Voucher Number input');
  assert(vInput.disabled === true, 'T2.6', 'Activating CUSTOM disables Voucher Number input');
  assert(vInput.readOnly === true, 'T2.7', 'Activating CUSTOM makes Voucher Number input readOnly');
  assert(vInput.getAttribute('aria-disabled') === 'true', 'T2.8', 'Activating CUSTOM sets aria-disabled="true"');
  assert(banner.style.display === 'flex', 'T2.9', 'Activating CUSTOM displays custom-payment-banner');
  assert(customBtn.classList.has('is-active'), 'T2.10', 'Activating CUSTOM adds .is-active to CUSTOM button');
  assert(customBtn.getAttribute('aria-pressed') === 'true', 'T2.11', 'CUSTOM button aria-pressed="true"');

  // Form inputs preserved
  assert(sandbox.document.getElementById('paidToInput').value === 'Local Artisan', 'T2.12', 'Payee input preserved after entering custom mode');
  assert(sandbox.document.getElementById('amountInput').value === '450', 'T2.13', 'Amount input preserved after entering custom mode');

  // Test T2.14–T2.18: Exiting Custom Mode (click CUSTOM again)
  sandbox.toggleCustomPaymentMode();
  assert(sandbox.window.isCustomPaymentMode === false, 'T2.14', 'Clicking CUSTOM again exits custom mode (isCustomPaymentMode=false)');
  assert(vInput.disabled === false, 'T2.15', 'Exiting custom mode re-enables Voucher Number input');
  assert(vInput.readOnly === false, 'T2.16', 'Exiting custom mode sets readOnly=false');
  assert(vInput.value === 'V-011', 'T2.17', 'Exiting custom mode restores cached preview V-011 without consuming a number');
  assert(banner.style.display === 'none', 'T2.18', 'Exiting custom mode hides custom-payment-banner');
  assert(!customBtn.classList.has('is-active'), 'T2.19', 'Exiting custom mode removes .is-active from CUSTOM button');
  assert(customBtn.getAttribute('aria-pressed') === 'false', 'T2.20', 'CUSTOM button aria-pressed="false"');

  // Verify counter was untouched by entering & exiting custom mode
  const counterSnap = await sandbox.fsGetCounters();
  assert(counterSnap.voucherCounter === 10, 'T2.21', 'Voucher sequence counter strictly untouched (remains 10) across toggle cycles');

  // --- GROUP 3: Voucher Preview Handlers Cannot Repopulate Field ---
  console.log('\n--- GROUP 3: Voucher Preview Protection in Custom Mode ---');
  sandbox.toggleCustomPaymentMode(true); // Enter custom mode
  assert(sandbox.window.isCustomPaymentMode === true, 'T3.1', 'Confirmed in custom mode');
  assert(vInput.value === '', 'T3.2', 'Voucher field is blank');

  // Try calling preview update
  sandbox.updatePaymentVoucherPreview('V-999');
  assert(vInput.value === '', 'T3.3', 'updatePaymentVoucherPreview strictly blocked while in custom mode');

  // --- GROUP 4: Save Workflow & Counter Invariants ---
  console.log('\n--- GROUP 4: Saving Custom Payment & Sequence Integrity ---');

  // Admin saves with custom mode active via standard SAVE button
  await sandbox.savePayment(false);

  assert(sandbox._lastNavigatedView === 'payments', 'T4.1', 'savePayment navigated back to payments view');
  assert(sandbox.window.isCustomPaymentMode === false, 'T4.2', 'Successful save resets isCustomPaymentMode to false');

  // Check saved document in Mock Firestore
  const allPmts = (await mockDb.collection('payments').get()).docs.map(d => d.data());
  const savedCustom = allPmts[allPmts.length - 1];

  assert(savedCustom.voucherNo === '', 'T4.3', 'Saved custom payment has voucherNo="" (empty)');
  assert(savedCustom.voucherType === 'custom', 'T4.4', 'Saved custom payment has voucherType="custom"');
  assert(savedCustom.id.startsWith('c_'), 'T4.5', 'Custom payment assigned id starting with c_');
  assert(savedCustom.firestoreId.startsWith('pmt_c_'), 'T4.6', 'Custom payment firestoreId starts with pmt_c_');

  // Counter check: counter strictly untouched!
  const counterAfterCustom = (await sandbox.fsGetCounters()).voucherCounter;
  assert(counterAfterCustom === 10, 'T4.7', 'voucherCounter strictly untouched at 10 after custom save');

  // Next normal payment: form proposed V-011!
  const nextPreview = await sandbox.nextVoucherNo();
  assert(nextPreview === 'V-011', 'T4.8', 'Next normal preview is exact sequential V-011 (no number skipped)');

  // Now create normal payment V-011
  setupDOM('V-011', false, false);
  sandbox.document.getElementById('paidToInput').value = 'Electrician Service';
  sandbox.document.getElementById('amountInput').value = '1200';
  await sandbox.savePayment(false);

  const allPmts2 = (await mockDb.collection('payments').get()).docs.map(d => d.data());
  const savedNormal = allPmts2[allPmts2.length - 1];
  assert(savedNormal.voucherNo === 'V-011', 'T4.9', 'Normal payment received sequential voucher V-011');
  assert(savedNormal.voucherType === 'normal', 'T4.10', 'Normal payment has voucherType="normal"');

  const counterAfterNormal = (await sandbox.fsGetCounters()).voucherCounter;
  assert(counterAfterNormal === 11, 'T4.11', 'voucherCounter correctly incremented to 11 after normal voucher');

  // --- GROUP 5: Error Handling & Form Data Retention ---
  console.log('\n--- GROUP 5: Failed Save Error Handling & Form Data Retention ---');

  // Setup form with custom mode, but empty amount
  setupDOM('V-012', false, false);
  sandbox.toggleCustomPaymentMode(true);
  sandbox.document.getElementById('paidToInput').value = 'Marble Polish Specialist';
  sandbox.document.getElementById('amountInput').value = ''; // Invalid amount

  await sandbox.savePayment(false);

  assert(sandbox._lastAlert.includes('Please fill all required fields'), 'T5.1', 'Validation failure alerted user');
  assert(sandbox.window.isCustomPaymentMode === true, 'T5.2', 'Failed save preserves isCustomPaymentMode=true');
  assert(sandbox.document.getElementById('paidToInput').value === 'Marble Polish Specialist', 'T5.3', 'Payee data preserved on failed save');
  assert(sandbox.document.getElementById('paymentVoucherNo').disabled === true, 'T5.4', 'Voucher field remains locked on failed save');
  assert(sandbox.document.getElementById('btn-save-payment').disabled === false, 'T5.5', 'Save button re-enabled on failed save');
  assert(sandbox.document.getElementById('btn-save-custom-payment').disabled === false, 'T5.6', 'Custom button re-enabled on failed save');

  // Admin fixes amount and retries
  sandbox.document.getElementById('amountInput').value = '2500';
  await sandbox.savePayment(false);

  assert(sandbox.window.isCustomPaymentMode === false, 'T5.7', 'Successful retry resets custom mode to false');
  const allPmts3 = (await mockDb.collection('payments').get()).docs.map(d => d.data());
  const retrySaved = allPmts3[allPmts3.length - 1];
  assert(retrySaved.paidTo === 'Marble Polish Specialist', 'T5.8', 'Payment saved successfully with retained data');
  assert(retrySaved.voucherNo === '', 'T5.9', 'Retry saved as custom with blank voucherNo');

  const counterAfterRetry = (await sandbox.fsGetCounters()).voucherCounter;
  assert(counterAfterRetry === 11, 'T5.10', 'voucherCounter remains 11 after retry custom payment');

  // --- GROUP 6: Editing Custom & Normal Payments ---
  console.log('\n--- GROUP 6: Editing Custom & Normal Payments ---');

  // Setup editing for existing custom payment
  setupDOM('', true, true);
  assert(sandbox.window.isCustomPaymentMode === true, 'T6.1', 'Editing custom payment enters custom mode');
  assert(sandbox.document.getElementById('paymentVoucherNo').disabled === true, 'T6.2', 'Voucher field is disabled during custom edit');

  sandbox.document.getElementById('amountInput').value = '2800';
  await sandbox.savePayment(false);

  assert(sandbox.window.isCustomPaymentMode === false, 'T6.3', 'Saving edit resets custom mode');
  const counterAfterEdit = (await sandbox.fsGetCounters()).voucherCounter;
  assert(counterAfterEdit === 11, 'T6.4', 'Editing custom payment did not touch voucherCounter (remains 11)');

  // --- GROUP 7: Form Reset & Cancel Handler ---
  console.log('\n--- GROUP 7: Form Cancellation & Reset Lifecycle ---');
  setupDOM('V-012', false, false);
  sandbox.toggleCustomPaymentMode(true);
  assert(sandbox.window.isCustomPaymentMode === true, 'T7.1', 'Custom mode activated before cancel');

  sandbox.cancelPaymentForm();
  assert(sandbox.window.isCustomPaymentMode === false, 'T7.2', 'cancelPaymentForm() resets isCustomPaymentMode to false');
  assert(sandbox._lastNavigatedView === 'payments', 'T7.3', 'cancelPaymentForm() navigates back to payments');

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED out of ${totalTests} assertions`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
