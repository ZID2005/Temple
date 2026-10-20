// tests/test_step_33_71_physical_receipt_void_consistency.js
// Automated Verification Suite for STEP 33.71:
// Physical Receipt Reservation Void-State Consistency Fix

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('========================================================================');
console.log('STEP 33.71: PHYSICAL RECEIPT RESERVATION VOID-STATE CONSISTENCY VERIFICATION');
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
// EXTRACT APPLICATION LOGIC & SETUP TEST ENVIRONMENT
// ----------------------------------------------------

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const fullScript = html.slice(scriptStart + 8, scriptEnd);

// In-Memory Mock Storage with Transactional Buffering for Firestore
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
    this.shouldFailNextTransaction = false;
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

  async runTransaction(updateFn) {
    if (this.shouldFailNextTransaction) {
      this.shouldFailNextTransaction = false;
      throw new Error('Simulated atomic transaction failure during void.');
    }
    const writes = [];
    const tx = {
      get: async (docRef) => await docRef.get(),
      set: (docRef, data, opts) => {
        writes.push(() => docRef.set(data, opts));
      },
      update: (docRef, data) => {
        writes.push(() => docRef.set(data, { merge: true }));
      },
      delete: (docRef) => {
        writes.push(() => docRef.delete());
      }
    };
    const res = await updateFn(tx);
    // Atomic commit phase
    for (const write of writes) {
      await write();
    }
    return res;
  }

  batch() {
    const writes = [];
    return {
      set: (docRef, data, opts) => {
        writes.push(() => docRef.set(data, opts));
      },
      update: (docRef, data) => {
        writes.push(() => docRef.set(data, { merge: true }));
      },
      delete: (docRef) => {
        writes.push(() => docRef.delete());
      },
      commit: async () => {
        for (const write of writes) {
          await write();
        }
      }
    };
  }
}

// Create Sandbox
const mockDb = new MockFirestore();
let currentUser = { uid: 'admin_test_user', email: 'admin@temple.org', displayName: 'Temple Admin' };

// Initialize settings and counters
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

// Setup DOM Sandbox
const domElements = new Map();
function getMockElement(id) {
  if (!domElements.has(id)) {
    domElements.set(id, {
      id: id,
      value: '',
      innerHTML: '',
      innerText: '',
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
      appendChild: () => {},
      removeChild: () => {},
      children: [],
      options: [],
      selectedIndex: 0,
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: () => {},
      blur: () => {},
      form: null,
      querySelector: () => null,
      querySelectorAll: () => [],
      getContext: () => null
    });
  }
  return domElements.get(id);
}

mockDb.useEmulator = () => {};
const mockAuth = {
  currentUser: currentUser,
  signOut: async () => {},
  onAuthStateChanged: (cb) => { if (cb) setTimeout(() => cb(currentUser), 0); },
  useEmulator: () => {}
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
      address: 'ക്ഷേത്രം റോഡ്, കേരളം',
      globalSequenceCounter: 42,
      openingCash: 10000,
      openingBank: 50000,
      openingGeneralFund: 30000,
      openingPunarudharanamFund: 20000,
      startDate: '2026-04-01'
    },
    print: () => {},
    prompt: (msg) => 'Devotee cancellation request',
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
  sessionStorage: { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
  navigator: {},
  prompt: (msg) => 'Devotee cancellation request',
  el: (id) => getMockElement(id),
  qsa: (sel) => [],
  esc: (str) => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  alert: (msg) => { sandbox._lastAlert = msg; },
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
vm.createContext(sandbox);

// Execute application script inside sandbox
vm.runInContext(fullScript, sandbox);

const namesToExpose = ['VIEW_RENDERERS', 'allReceipts', 'activeReceipts', 'allBillingRecords', 'masterItems', 'parsePhysicalReceiptIdentifier', 'fsVoidRecordSafe', 'voidRecord', 'fsCreatePhysicalReceipt', 'fsCreateIndependentReceipt', 'fsGetOneSafe', 'getCashBalance', 'getBankBalance', 'getFundBalance'];
for (const n of namesToExpose) {
  try {
    sandbox[n] = vm.runInContext(n, sandbox);
  } catch (e) {}
}

// ----------------------------------------------------
// SECTION 1: Baseline Invariants & Cryptographic Hashes
// ----------------------------------------------------
console.log('--- SECTION 1: Baseline Invariants & Cryptographic Hashes ---');
recordTest('TC-33.71-01', 'Target file is Temple_Accounts-1.html', 'BASELINE',
  htmlPath.endsWith('Temple_Accounts-1.html'), 'Temple_Accounts-1.html', path.basename(htmlPath));

recordTest('TC-33.71-02', 'File size exceeds baseline after Step 33.71 implementation', 'BASELINE',
  fs.statSync(htmlPath).size >= 827070, '>= 827,070 bytes', `${fs.statSync(htmlPath).size} bytes`);

recordTest('TC-33.71-03', 'Pre-step 33.71 backup file exists in backups directory', 'BASELINE',
  fs.existsSync(path.resolve(__dirname, '../backups/Temple_Accounts-1_PreStep33_71_PhysicalReceiptVoidConsistency_Backup_20261016_212800.html')),
  'Backup exists', 'Confirmed');

recordTest('TC-33.71-04', 'fsVoidRecordSafe contains atomic transaction logic for receipts and reservations', 'BASELINE',
  html.includes('tx.set(docRef, voidPayload, { merge: true })') && html.includes('tx.set(resRef, resVoidPayload, { merge: true })'),
  true, true);

recordTest('TC-33.71-05', 'fsVoidRecordSafe determines res_phys_ reservation document for physical receipts', 'BASELINE',
  html.includes('res_phys_${canonicalPhysId}') || html.includes('res_phys_'), true, true);

recordTest('TC-33.71-06', 'fsCreatePhysicalReceipt persists reservationDocId bidirectional pointer', 'BASELINE',
  html.includes('reservationDocId: physResDocId'), true, true);

recordTest('TC-33.71-07', 'fsCreatePhysicalReceipt idempotency check inspects reservation void status', 'BASELINE',
  html.includes('resData.status === \'voided\''), true, true);

// ----------------------------------------------------
// SECTION 2: TEST 1 — Type P Physical Receipt Void Consistency
// ----------------------------------------------------
async function runSection2() {
  console.log('\n--- SECTION 2: TEST 1 — Type P Physical Receipt Void Consistency ---');

  // Create P600 receipt
  const p600Res = await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'P600',
    date: '2026-10-16',
    name: 'Ananthan Namboothiri',
    star: 'Thiruvonam',
    mobile: '9847012345',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    paymentMode: 'Cash',
    amount: 350,
    remarks: 'Physical Puja Slip'
  });

  const rcptP600Init = mockDb.collections.receipts.get('rcpt_phys_P600');
  const resP600Init = mockDb.collections.system.get('res_phys_P600');

  recordTest('TC-33.71-08', 'P600 initial authoritative receipt is active (voided: false)', 'TEST_1_P_SERIES',
    rcptP600Init && rcptP600Init.voided === false, false, rcptP600Init ? rcptP600Init.voided : null);

  recordTest('TC-33.71-09', 'P600 initial reservation tracking record is active (status: "active", voided: false)', 'TEST_1_P_SERIES',
    resP600Init && resP600Init.status === 'active' && resP600Init.voided === false,
    'status: active, voided: false',
    resP600Init ? `status: ${resP600Init.status}, voided: ${resP600Init.voided}` : null);

  recordTest('TC-33.71-10', 'P600 authoritative receipt contains reservationDocId pointer', 'TEST_1_P_SERIES',
    rcptP600Init && rcptP600Init.reservationDocId === 'res_phys_P600',
    'res_phys_P600', rcptP600Init ? rcptP600Init.reservationDocId : null);

  // Void P600 via voidRecord
  sandbox.prompt = () => 'Devotee cancellation request for P600';
  await sandbox.voidRecord('receipts', 'rcpt_phys_P600');

  const rcptP600Voided = mockDb.collections.receipts.get('rcpt_phys_P600');
  const resP600Voided = mockDb.collections.system.get('res_phys_P600');

  recordTest('TC-33.71-11', 'P600 authoritative receipt is marked voided: true', 'TEST_1_P_SERIES',
    rcptP600Voided && rcptP600Voided.voided === true, true, rcptP600Voided ? rcptP600Voided.voided : null);

  recordTest('TC-33.71-12', 'P600 authoritative receipt records correct voidReason and voidDate', 'TEST_1_P_SERIES',
    rcptP600Voided && rcptP600Voided.voidReason === 'Devotee cancellation request for P600' && Boolean(rcptP600Voided.voidDate),
    'Recorded voidReason and voidDate',
    rcptP600Voided ? `reason: ${rcptP600Voided.voidReason}, date: ${rcptP600Voided.voidDate}` : null);

  recordTest('TC-33.71-13', 'P600 secondary reservation is updated to voided: true', 'TEST_1_P_SERIES',
    resP600Voided && resP600Voided.voided === true, true, resP600Voided ? resP600Voided.voided : null);

  recordTest('TC-33.71-14', 'P600 secondary reservation status is set to "voided"', 'TEST_1_P_SERIES',
    resP600Voided && resP600Voided.status === 'voided', 'voided', resP600Voided ? resP600Voided.status : null);

  recordTest('TC-33.71-15', 'P600 secondary reservation mirrors receipt voidReason', 'TEST_1_P_SERIES',
    resP600Voided && resP600Voided.voidReason === 'Devotee cancellation request for P600',
    'Devotee cancellation request for P600', resP600Voided ? resP600Voided.voidReason : null);

  recordTest('TC-33.71-16', 'P600 secondary reservation preserves identifier P600 and receiptDocId pointer', 'TEST_1_P_SERIES',
    resP600Voided && resP600Voided.physicalId === 'P600' && resP600Voided.receiptDocId === 'rcpt_phys_P600',
    'P600 & rcpt_phys_P600',
    resP600Voided ? `${resP600Voided.physicalId} & ${resP600Voided.receiptDocId}` : null);

  recordTest('TC-33.71-17', 'P600 secondary reservation records updatedBy and timestamps', 'TEST_1_P_SERIES',
    resP600Voided && resP600Voided.updatedBy === currentUser.uid && Boolean(resP600Voided.voidedAt),
    true, Boolean(resP600Voided && resP600Voided.updatedBy && resP600Voided.voidedAt));
}

// ----------------------------------------------------
// SECTION 3: TEST 2 — Type PU Physical Receipt Void Consistency
// ----------------------------------------------------
async function runSection3() {
  console.log('\n--- SECTION 3: TEST 2 — Type PU Physical Receipt Void Consistency ---');

  // Create PU1 receipt
  const pu1Res = await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'PU1',
    date: '2026-10-16',
    name: 'Suresh Varma',
    mobile: '9447123456',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'Bank',
    amount: 5000,
    remarks: 'Renovation Bank Donation Slip'
  });

  const rcptPU1Init = mockDb.collections.receipts.get('rcpt_phys_PU1');
  const resPU1Init = mockDb.collections.system.get('res_phys_PU1');

  recordTest('TC-33.71-18', 'PU1 initial authoritative receipt is active (voided: false)', 'TEST_2_PU_SERIES',
    rcptPU1Init && rcptPU1Init.voided === false, false, rcptPU1Init ? rcptPU1Init.voided : null);

  recordTest('TC-33.71-19', 'PU1 initial reservation tracking record is active (status: "active", voided: false)', 'TEST_2_PU_SERIES',
    resPU1Init && resPU1Init.status === 'active' && resPU1Init.voided === false,
    'status: active, voided: false',
    resPU1Init ? `status: ${resPU1Init.status}, voided: ${resPU1Init.voided}` : null);

  // Void PU1 via voidRecord
  sandbox.prompt = () => 'Duplicate manual slip error for PU1';
  await sandbox.voidRecord('receipts', 'rcpt_phys_PU1');

  const rcptPU1Voided = mockDb.collections.receipts.get('rcpt_phys_PU1');
  const resPU1Voided = mockDb.collections.system.get('res_phys_PU1');

  recordTest('TC-33.71-20', 'PU1 authoritative receipt is marked voided: true', 'TEST_2_PU_SERIES',
    rcptPU1Voided && rcptPU1Voided.voided === true, true, rcptPU1Voided ? rcptPU1Voided.voided : null);

  recordTest('TC-33.71-21', 'PU1 authoritative receipt records correct voidReason and voidDate', 'TEST_2_PU_SERIES',
    rcptPU1Voided && rcptPU1Voided.voidReason === 'Duplicate manual slip error for PU1' && Boolean(rcptPU1Voided.voidDate),
    'Recorded voidReason and voidDate',
    rcptPU1Voided ? `reason: ${rcptPU1Voided.voidReason}, date: ${rcptPU1Voided.voidDate}` : null);

  recordTest('TC-33.71-22', 'PU1 secondary reservation is updated to voided: true', 'TEST_2_PU_SERIES',
    resPU1Voided && resPU1Voided.voided === true, true, resPU1Voided ? resPU1Voided.voided : null);

  recordTest('TC-33.71-23', 'PU1 secondary reservation status is set to "voided"', 'TEST_2_PU_SERIES',
    resPU1Voided && resPU1Voided.status === 'voided', 'voided', resPU1Voided ? resPU1Voided.status : null);

  recordTest('TC-33.71-24', 'PU1 secondary reservation mirrors receipt voidReason', 'TEST_2_PU_SERIES',
    resPU1Voided && resPU1Voided.voidReason === 'Duplicate manual slip error for PU1',
    'Duplicate manual slip error for PU1', resPU1Voided ? resPU1Voided.voidReason : null);

  recordTest('TC-33.71-25', 'PU1 secondary reservation preserves identifier PU1 and physicalType PU', 'TEST_2_PU_SERIES',
    resPU1Voided && resPU1Voided.physicalId === 'PU1' && resPU1Voided.physicalType === 'PU',
    'PU1 & PU',
    resPU1Voided ? `${resPU1Voided.physicalId} & ${resPU1Voided.physicalType}` : null);

  recordTest('TC-33.71-26', 'PU1 secondary reservation records updatedBy and timestamps', 'TEST_2_PU_SERIES',
    resPU1Voided && resPU1Voided.updatedBy === currentUser.uid && Boolean(resPU1Voided.voidedAt),
    true, Boolean(resPU1Voided && resPU1Voided.updatedBy && resPU1Voided.voidedAt));
}

// ----------------------------------------------------
// SECTION 4: TEST 3 — Accounting Balances Exclusion
// ----------------------------------------------------
async function runSection4() {
  console.log('\n--- SECTION 4: TEST 3 — Active Accounting Balances Exclusion ---');

  // Verify activeReceipts() excludes both voided physical receipts
  const activeRcpts = await sandbox.activeReceipts();
  const hasActiveP600 = activeRcpts.some(r => r.receiptNo === 'P600' || r.id === 'rcpt_phys_P600');
  const hasActivePU1 = activeRcpts.some(r => r.receiptNo === 'PU1' || r.id === 'rcpt_phys_PU1');

  recordTest('TC-33.71-27', 'activeReceipts() excludes voided P600', 'TEST_3_ACCOUNTING',
    hasActiveP600 === false, false, hasActiveP600);

  recordTest('TC-33.71-28', 'activeReceipts() excludes voided PU1', 'TEST_3_ACCOUNTING',
    hasActivePU1 === false, false, hasActivePU1);

  // Cash Book balance should NOT include ₹350 from voided P600
  const cashBal = await sandbox.getCashBalance();
  recordTest('TC-33.71-29', 'Cash balance excludes voided physical receipt P600 (remains baseline ₹10,000)', 'TEST_3_ACCOUNTING',
    cashBal === 10000, 10000, cashBal);

  // Bank Book balance should NOT include ₹5,000 from voided PU1
  const bankBal = await sandbox.getBankBalance();
  recordTest('TC-33.71-30', 'Bank balance excludes voided physical receipt PU1 (remains baseline ₹50,000)', 'TEST_3_ACCOUNTING',
    bankBal === 50000, 50000, bankBal);

  // General Temple Fund balance should NOT include ₹350
  const genFundBal = await sandbox.getFundBalance('General Temple Fund');
  recordTest('TC-33.71-31', 'General Temple Fund excludes voided P600 (remains baseline ₹30,000)', 'TEST_3_ACCOUNTING',
    genFundBal === 30000, 30000, genFundBal);

  // Punarudharanam Fund balance should NOT include ₹5,000
  const punFundBal = await sandbox.getFundBalance('Punarudharanam Fund');
  recordTest('TC-33.71-32', 'Punarudharanam Fund excludes voided PU1 (remains baseline ₹20,000)', 'TEST_3_ACCOUNTING',
    punFundBal === 20000, 20000, punFundBal);

  // allReceipts() retains voided records for audit trail
  const allRcpts = await sandbox.allReceipts();
  const retainedP600 = allRcpts.find(r => r.receiptNo === 'P600' || r.id === 'rcpt_phys_P600');
  const retainedPU1 = allRcpts.find(r => r.receiptNo === 'PU1' || r.id === 'rcpt_phys_PU1');

  recordTest('TC-33.71-33', 'allReceipts() retains P600 with voided: true for audit trail', 'TEST_3_ACCOUNTING',
    retainedP600 && retainedP600.voided === true, true, retainedP600 ? retainedP600.voided : null);

  recordTest('TC-33.71-34', 'allReceipts() retains PU1 with voided: true for audit trail', 'TEST_3_ACCOUNTING',
    retainedPU1 && retainedPU1.voided === true, true, retainedPU1 ? retainedPU1.voided : null);
}

// ----------------------------------------------------
// SECTION 5: TEST 4 — Identifier Non-Reuse & Duplicate Prevention
// ----------------------------------------------------
async function runSection5() {
  console.log('\n--- SECTION 5: TEST 4 — Identifier Non-Reuse & Duplicate Prevention ---');

  // Attempt to re-create P600
  let p600ReuseError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'P600',
      date: '2026-10-16',
      name: 'Duplicate Devotee',
      fund: 'General Temple Fund',
      category: 'Pooja Income',
      paymentMode: 'Cash',
      amount: 400
    });
  } catch (err) {
    p600ReuseError = err.message;
  }

  recordTest('TC-33.71-35', 'Re-creating voided P600 is strictly rejected with duplicate error', 'TEST_4_NON_REUSE',
    Boolean(p600ReuseError && p600ReuseError.includes('already been entered or issued')),
    'Duplicate physical receipt rejection', p600ReuseError);

  // Attempt to re-create PU1
  let pu1ReuseError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'PU1',
      date: '2026-10-16',
      name: 'Duplicate Devotee',
      fund: 'Punarudharanam Fund',
      category: 'Donation Income',
      paymentMode: 'Bank',
      amount: 6000
    });
  } catch (err) {
    pu1ReuseError = err.message;
  }

  recordTest('TC-33.71-36', 'Re-creating voided PU1 is strictly rejected with duplicate error', 'TEST_4_NON_REUSE',
    Boolean(pu1ReuseError && pu1ReuseError.includes('already been entered or issued')),
    'Duplicate physical receipt rejection', pu1ReuseError);

  // Attempt to re-create with case variant 'p600'
  let p600CaseError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'p600',
      date: '2026-10-16',
      name: 'Case Devotee',
      amount: 350
    });
  } catch (err) {
    p600CaseError = err.message;
  }

  recordTest('TC-33.71-37', 'Case variation p600 is normalized and rejected as duplicate after voiding', 'TEST_4_NON_REUSE',
    Boolean(p600CaseError && p600CaseError.includes('already been entered or issued')),
    'Duplicate physical receipt rejection', p600CaseError);

  // Attempt to re-create with whitespace variant " PU1 "
  let pu1WsError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: '  PU1  ',
      date: '2026-10-16',
      name: 'Whitespace Devotee',
      amount: 5000
    });
  } catch (err) {
    pu1WsError = err.message;
  }

  recordTest('TC-33.71-38', 'Whitespace variation " PU1 " is trimmed and rejected as duplicate after voiding', 'TEST_4_NON_REUSE',
    Boolean(pu1WsError && pu1WsError.includes('already been entered or issued')),
    'Duplicate physical receipt rejection', pu1WsError);

  // Idempotency replay attempt for voided receipt with identical fingerprint
  const origP600Op = mockDb.collections.system.get('res_phys_P600');
  let replayError = null;
  try {
    await sandbox.fsCreatePhysicalReceipt({
      receiptNo: 'P600',
      date: '2026-10-16',
      name: 'Ananthan Namboothiri',
      star: 'Thiruvonam',
      mobile: '9847012345',
      fund: 'General Temple Fund',
      category: 'Pooja Income',
      paymentMode: 'Cash',
      amount: 350,
      remarks: 'Physical Puja Slip',
      operationId: origP600Op ? origP600Op.operationId : null
    });
  } catch (err) {
    replayError = err.message;
  }

  recordTest('TC-33.71-39', 'Idempotent replay on voided physical receipt throws voided error', 'TEST_4_NON_REUSE',
    Boolean(replayError && replayError.includes('has been voided')),
    'Physical receipt "P600" has been voided', replayError);
}

// ----------------------------------------------------
// SECTION 6: TEST 5 — Repeated Void Requests & Audit Immutability
// ----------------------------------------------------
async function runSection6() {
  console.log('\n--- SECTION 6: TEST 5 — Repeated Void Requests & Audit Trail Immutability ---');

  const beforeRcptP600 = JSON.parse(JSON.stringify(mockDb.collections.receipts.get('rcpt_phys_P600')));
  const beforeResP600 = JSON.parse(JSON.stringify(mockDb.collections.system.get('res_phys_P600')));

  // Repeated void via UI voidRecord()
  sandbox._lastAlert = null;
  await sandbox.voidRecord('receipts', 'rcpt_phys_P600');

  recordTest('TC-33.71-40', 'Repeated UI voidRecord() alerts that receipt is already voided and aborts', 'TEST_5_REPEAT_VOID',
    Boolean(sandbox._lastAlert && sandbox._lastAlert.includes('already voided')),
    'Receipt is already voided alert', sandbox._lastAlert);

  const afterUiVoidRcpt = mockDb.collections.receipts.get('rcpt_phys_P600');
  const afterUiVoidRes = mockDb.collections.system.get('res_phys_P600');

  recordTest('TC-33.71-41', 'Repeated UI voidRecord() does not mutate receipt record or voidReason', 'TEST_5_REPEAT_VOID',
    afterUiVoidRcpt.voidReason === beforeRcptP600.voidReason && afterUiVoidRcpt.voidDate === beforeRcptP600.voidDate,
    beforeRcptP600.voidReason, afterUiVoidRcpt.voidReason);

  recordTest('TC-33.71-42', 'Repeated UI voidRecord() does not mutate reservation record', 'TEST_5_REPEAT_VOID',
    afterUiVoidRes.voidReason === beforeResP600.voidReason && afterUiVoidRes.voidDate === beforeResP600.voidDate,
    beforeResP600.voidReason, afterUiVoidRes.voidReason);

  // Direct repeated call to fsVoidRecordSafe with a different reason
  await sandbox.fsVoidRecordSafe('receipts', 'rcpt_phys_P600', 'Malicious overwrite reason that must be ignored');

  const afterDirectVoidRcpt = mockDb.collections.receipts.get('rcpt_phys_P600');
  const afterDirectVoidRes = mockDb.collections.system.get('res_phys_P600');

  recordTest('TC-33.71-43', 'Direct fsVoidRecordSafe repeat preserves original receipt voidReason', 'TEST_5_REPEAT_VOID',
    afterDirectVoidRcpt.voidReason === beforeRcptP600.voidReason,
    beforeRcptP600.voidReason, afterDirectVoidRcpt.voidReason);

  recordTest('TC-33.71-44', 'Direct fsVoidRecordSafe repeat preserves original receipt voidDate', 'TEST_5_REPEAT_VOID',
    afterDirectVoidRcpt.voidDate === beforeRcptP600.voidDate,
    beforeRcptP600.voidDate, afterDirectVoidRcpt.voidDate);

  recordTest('TC-33.71-45', 'Direct fsVoidRecordSafe repeat preserves original reservation voidReason', 'TEST_5_REPEAT_VOID',
    afterDirectVoidRes.voidReason === beforeResP600.voidReason,
    beforeResP600.voidReason, afterDirectVoidRes.voidReason);

  recordTest('TC-33.71-46', 'Direct fsVoidRecordSafe repeat preserves original reservation voidDate', 'TEST_5_REPEAT_VOID',
    afterDirectVoidRes.voidDate === beforeResP600.voidDate,
    beforeResP600.voidDate, afterDirectVoidRes.voidDate);
}

// ----------------------------------------------------
// SECTION 7: TEST 6 — Atomicity & Partial Update Prevention on Failure
// ----------------------------------------------------
async function runSection7() {
  console.log('\n--- SECTION 7: TEST 6 — Atomicity & Partial State Prevention on Failure ---');

  // Create an active PU2 physical receipt
  await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'PU2',
    date: '2026-10-16',
    name: 'Devadasan',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'Cash',
    amount: 1200,
    remarks: 'Active PU2 for atomic failure testing'
  });

  const rcptPU2Before = JSON.parse(JSON.stringify(mockDb.collections.receipts.get('rcpt_phys_PU2')));
  const resPU2Before = JSON.parse(JSON.stringify(mockDb.collections.system.get('res_phys_PU2')));

  recordTest('TC-33.71-47', 'PU2 initial state: receipt is active (voided: false)', 'TEST_6_ATOMICITY',
    rcptPU2Before && rcptPU2Before.voided === false, false, rcptPU2Before.voided);

  recordTest('TC-33.71-48', 'PU2 initial state: reservation is active (status: "active", voided: false)', 'TEST_6_ATOMICITY',
    resPU2Before && resPU2Before.status === 'active' && resPU2Before.voided === false,
    'status: active, voided: false', `status: ${resPU2Before.status}, voided: ${resPU2Before.voided}`);

  // Instruct mockDb to fail the next transaction
  mockDb.shouldFailNextTransaction = true;

  let failedVoidError = null;
  try {
    await sandbox.fsVoidRecordSafe('receipts', 'rcpt_phys_PU2', 'Attempted void with simulated failure');
  } catch (err) {
    failedVoidError = err.message;
  }

  recordTest('TC-33.71-49', 'fsVoidRecordSafe propagates transactional failure cleanly', 'TEST_6_ATOMICITY',
    Boolean(failedVoidError && failedVoidError.includes('Simulated atomic transaction failure')),
    'Simulated atomic transaction failure', failedVoidError);

  const rcptPU2After = mockDb.collections.receipts.get('rcpt_phys_PU2');
  const resPU2After = mockDb.collections.system.get('res_phys_PU2');

  recordTest('TC-33.71-50', 'Failed void leaves receipt record strictly intact (voided: false)', 'TEST_6_ATOMICITY',
    rcptPU2After && rcptPU2After.voided === false && rcptPU2After.voidReason === '',
    false, rcptPU2After.voided);

  recordTest('TC-33.71-51', 'Failed void leaves reservation strictly intact (status: "active", voided: false)', 'TEST_6_ATOMICITY',
    resPU2After && resPU2After.status === 'active' && resPU2After.voided === false && resPU2After.voidReason === undefined,
    'status: active, voided: false', `status: ${resPU2After.status}, voided: ${resPU2After.voided}`);

  recordTest('TC-33.71-52', 'Zero partial update state left after transactional failure', 'TEST_6_ATOMICITY',
    rcptPU2After.voided === resPU2After.voided && rcptPU2After.voided === false,
    'Both remain active', 'Both active');

  // Now perform successful void on PU2
  sandbox.prompt = () => 'Confirmed clean void after failure recovery';
  await sandbox.voidRecord('receipts', 'rcpt_phys_PU2');

  const rcptPU2Final = mockDb.collections.receipts.get('rcpt_phys_PU2');
  const resPU2Final = mockDb.collections.system.get('res_phys_PU2');

  recordTest('TC-33.71-53', 'PU2 successfully voids upon clean retry: receipt voided: true', 'TEST_6_ATOMICITY',
    rcptPU2Final && rcptPU2Final.voided === true, true, rcptPU2Final.voided);

  recordTest('TC-33.71-54', 'PU2 successfully voids upon clean retry: reservation status: "voided", voided: true', 'TEST_6_ATOMICITY',
    resPU2Final && resPU2Final.status === 'voided' && resPU2Final.voided === true,
    'status: voided, voided: true', `status: ${resPU2Final.status}, voided: ${resPU2Final.voided}`);
}

// ----------------------------------------------------
// SECTION 8: TEST 7 — Normal Software Receipt Sequence Isolation
// ----------------------------------------------------
async function runSection8() {
  console.log('\n--- SECTION 8: TEST 7 — Normal Software Receipt Sequence Isolation ---');

  // Issue software receipt R-043
  const swRes = await sandbox.fsCreateIndependentReceipt({
    date: '2026-10-16',
    name: 'Normal Devotee',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    paymentMode: 'Cash',
    amount: 150
  });

  const counterAfter43 = mockDb.collections.system.get('counters');
  recordTest('TC-33.71-55', 'Software receipt R-043 allocated sequence 43', 'TEST_7_SOFTWARE_SEQ',
    swRes && swRes.receiptRecord && swRes.receiptRecord.id === 43, 43, swRes ? swRes.receiptRecord.id : null);

  recordTest('TC-33.71-56', 'globalSequenceCounter cleanly advanced to 43', 'TEST_7_SOFTWARE_SEQ',
    counterAfter43 && counterAfter43.globalSequenceCounter === 43, 43, counterAfter43 ? counterAfter43.globalSequenceCounter : null);

  const res43Before = mockDb.collections.system.get('res_43');
  recordTest('TC-33.71-57', 'Software reservation res_43 created with status: "active"', 'TEST_7_SOFTWARE_SEQ',
    res43Before && res43Before.status === 'active' && res43Before.voided === false,
    'status: active', res43Before ? res43Before.status : null);

  // Void normal software receipt R-043
  sandbox.prompt = () => 'Normal software receipt cancellation';
  await sandbox.voidRecord('receipts', 'rcpt_43');

  const rcpt43Voided = mockDb.collections.receipts.get('rcpt_43');
  const res43Voided = mockDb.collections.system.get('res_43');
  const counterAfterVoid43 = mockDb.collections.system.get('counters');

  recordTest('TC-33.71-58', 'Software receipt rcpt_43 is marked voided: true', 'TEST_7_SOFTWARE_SEQ',
    rcpt43Voided && rcpt43Voided.voided === true, true, rcpt43Voided ? rcpt43Voided.voided : null);

  recordTest('TC-33.71-59', 'Software reservation res_43 is updated to status: "voided", voided: true', 'TEST_7_SOFTWARE_SEQ',
    res43Voided && res43Voided.status === 'voided' && res43Voided.voided === true,
    'status: voided, voided: true',
    res43Voided ? `status: ${res43Voided.status}, voided: ${res43Voided.voided}` : null);

  recordTest('TC-33.71-60', 'Voiding software receipt NEVER decrements or resets globalSequenceCounter (remains 43)', 'TEST_7_SOFTWARE_SEQ',
    counterAfterVoid43 && counterAfterVoid43.globalSequenceCounter === 43, 43,
    counterAfterVoid43 ? counterAfterVoid43.globalSequenceCounter : null);

  // Issue subsequent software receipt R-044
  const swRes44 = await sandbox.fsCreateIndependentReceipt({
    date: '2026-10-16',
    name: 'Subsequent Devotee',
    fund: 'General Temple Fund',
    category: 'Vazhipadu Income',
    paymentMode: 'Cash',
    amount: 200
  });

  const counterAfter44 = mockDb.collections.system.get('counters');

  recordTest('TC-33.71-61', 'Subsequent software receipt cleanly allocates sequence 44 (R-044)', 'TEST_7_SOFTWARE_SEQ',
    swRes44 && swRes44.receiptRecord && swRes44.receiptRecord.id === 44, 44,
    swRes44 ? swRes44.receiptRecord.id : null);

  recordTest('TC-33.71-62', 'globalSequenceCounter cleanly advances to 44', 'TEST_7_SOFTWARE_SEQ',
    counterAfter44 && counterAfter44.globalSequenceCounter === 44, 44,
    counterAfter44 ? counterAfter44.globalSequenceCounter : null);
}

// ----------------------------------------------------
// SECTION 9: TEST 8 — Direct Identifier Resolution & Format Robustness
// ----------------------------------------------------
async function runSection9() {
  console.log('\n--- SECTION 9: TEST 8 — Direct Identifier Resolution & Format Robustness ---');

  // Create P601
  await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'P601',
    date: '2026-10-16',
    name: 'Resolution Test P601',
    fund: 'General Temple Fund',
    category: 'Pooja Income',
    paymentMode: 'Cash',
    amount: 100
  });

  // Verify fsGetOneSafe resolves raw 'P601'
  const resolvedGetOneP601 = await sandbox.fsGetOneSafe('receipts', 'P601');
  recordTest('TC-33.71-63', 'fsGetOneSafe("receipts", "P601") resolves to rcpt_phys_P601', 'TEST_8_ROBUSTNESS',
    resolvedGetOneP601 && resolvedGetOneP601.receiptNo === 'P601' && resolvedGetOneP601.firestoreId === 'rcpt_phys_P601',
    'rcpt_phys_P601', resolvedGetOneP601 ? resolvedGetOneP601.firestoreId : null);

  // Void P601 passing raw identifier 'P601' directly to fsVoidRecordSafe
  await sandbox.fsVoidRecordSafe('receipts', 'P601', 'Voided via raw identifier');

  const rcptP601 = mockDb.collections.receipts.get('rcpt_phys_P601');
  const resP601 = mockDb.collections.system.get('res_phys_P601');

  recordTest('TC-33.71-64', 'fsVoidRecordSafe("receipts", "P601") marks rcpt_phys_P601 voided: true', 'TEST_8_ROBUSTNESS',
    rcptP601 && rcptP601.voided === true, true, rcptP601 ? rcptP601.voided : null);

  recordTest('TC-33.71-65', 'fsVoidRecordSafe("receipts", "P601") marks res_phys_P601 status: "voided"', 'TEST_8_ROBUSTNESS',
    resP601 && resP601.status === 'voided' && resP601.voided === true,
    'status: voided, voided: true', resP601 ? `status: ${resP601.status}, voided: ${resP601.voided}` : null);

  // Create PU3
  await sandbox.fsCreatePhysicalReceipt({
    receiptNo: 'PU3',
    date: '2026-10-16',
    name: 'Resolution Test PU3',
    fund: 'Punarudharanam Fund',
    category: 'Donation Income',
    paymentMode: 'Bank',
    amount: 1000
  });

  // Verify fsGetOneSafe resolves raw 'PU3'
  const resolvedGetOnePU3 = await sandbox.fsGetOneSafe('receipts', 'PU3');
  recordTest('TC-33.71-66', 'fsGetOneSafe("receipts", "PU3") resolves to rcpt_phys_PU3', 'TEST_8_ROBUSTNESS',
    resolvedGetOnePU3 && resolvedGetOnePU3.receiptNo === 'PU3' && resolvedGetOnePU3.firestoreId === 'rcpt_phys_PU3',
    'rcpt_phys_PU3', resolvedGetOnePU3 ? resolvedGetOnePU3.firestoreId : null);

  // Void PU3 passing raw identifier 'PU3' directly to fsVoidRecordSafe
  await sandbox.fsVoidRecordSafe('receipts', 'PU3', 'Voided via raw PU identifier');

  const rcptPU3 = mockDb.collections.receipts.get('rcpt_phys_PU3');
  const resPU3 = mockDb.collections.system.get('res_phys_PU3');

  recordTest('TC-33.71-67', 'fsVoidRecordSafe("receipts", "PU3") marks rcpt_phys_PU3 voided: true', 'TEST_8_ROBUSTNESS',
    rcptPU3 && rcptPU3.voided === true, true, rcptPU3 ? rcptPU3.voided : null);

  recordTest('TC-33.71-68', 'fsVoidRecordSafe("receipts", "PU3") marks res_phys_PU3 status: "voided"', 'TEST_8_ROBUSTNESS',
    resPU3 && resPU3.status === 'voided' && resPU3.voided === true,
    'status: voided, voided: true', resPU3 ? `status: ${resPU3.status}, voided: ${resPU3.voided}` : null);
}

// ----------------------------------------------------
// SECTION 10: TEST 9 — Regression Verification
// ----------------------------------------------------
async function runSection10() {
  console.log('\n--- SECTION 10: TEST 9 — Regression Verification ---');

  // Verify 15 master items preserved
  recordTest('TC-33.71-69', 'Master catalogue preserved with 15 predefined items', 'REGRESSION',
    sandbox.masterItems && sandbox.masterItems.length === 15, 15, sandbox.masterItems ? sandbox.masterItems.length : null);

  // Verify Billing form handlers intact
  recordTest('TC-33.71-70', 'Billing submission handler billingSubmitForm() preserved', 'REGRESSION',
    typeof sandbox.billingSubmitForm === 'function', true, typeof sandbox.billingSubmitForm === 'function');

  recordTest('TC-33.71-71', 'Linked billing/receipt voiding fsVoidLinkedBillingAndReceipt() preserved', 'REGRESSION',
    typeof sandbox.fsVoidLinkedBillingAndReceipt === 'function', true, typeof sandbox.fsVoidLinkedBillingAndReceipt === 'function');
}

// ----------------------------------------------------
// RUN ALL TESTS & SAVE ARTIFACT
// ----------------------------------------------------
async function main() {
  await runSection2();
  await runSection3();
  await runSection4();
  await runSection5();
  await runSection6();
  await runSection7();
  await runSection8();
  await runSection9();
  await runSection10();

  console.log('\n========================================================================');
  console.log(`TOTAL TESTS: ${results.totalTests} | PASSED: ${results.passedTests} | FAILED: ${results.failedTests}`);
  console.log('========================================================================\n');

  const outPath = path.resolve(__dirname, 'step_33_71_physical_receipt_void_consistency_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results written to: ${outPath}\n`);

  if (results.failedTests === 0) {
    console.log('✨ ALL STEP 33.71 PHYSICAL RECEIPT VOID CONSISTENCY CHECKS PASSED SUCCESSFULLY! ✨\n');
    process.exit(0);
  } else {
    console.error(`💥 ${results.failedTests} TEST(S) FAILED! Check results log above.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
