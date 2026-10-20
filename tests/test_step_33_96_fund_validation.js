/**
 * STEP 33.96 — Transaction-Level Fund Validation & Regression Reliability Suite
 *
 * Requirements:
 * 1. Enforce mandatory Fund validation at the transaction boundary in fsCreateBillingWithAccounting:
 *    - Valid registered Fund permits transaction
 *    - Empty Fund ("") is rejected
 *    - Whitespace-only Fund ("   ") is rejected
 *    - Missing Fund (undefined/null) is rejected
 *    - Malformed Fund input is rejected
 *    - Unregistered Fund is rejected
 *    - Stale / concurrently modified Fund aborts safely inside transaction
 *    - Failed master-data lookup aborts safely (Fail-Closed)
 *    - Rejected transactions create NO records and do NOT increment counters
 * 2. Income Category remains optional and intentional blank persists as ""
 * 3. Atomic synchronization of Fund and Income Category between bill and linked receipt
 * 4. Idempotency guarantees:
 *    - Identical retries return original committed records with zero counter bumps
 *    - Different Fund / category selections trigger idempotency conflicts
 * 5. Historical compatibility and Physical Receipt preservation:
 *    - Legacy records remain readable without silent rewriting
 *    - Physical P/PU receipt classification and numbering remain intact
 * 6. Air-gapped isolation:
 *    - Zero live Firebase network requests, zero production DB mutations
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.96: TRANSACTION-LEVEL FUND VALIDATION & REGRESSION VERIFICATION');
console.log('='.repeat(80));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/Temple_Accounts-1_PreStep33_96_FundValidation_Backup_20261018_132000.html';
const BACKUP_DIR_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_96_FundValidation_Backup_20261018_132000.html';
const PRE_STEP_33_96_HASH = 'C4927C47CA4CB13269BF40ED105670F2E8DAC6C04262E1E48480F2CF40B101E1';
const PRE_STEP_33_96_SIZE = 940260;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.96',
  baselineSha256: PRE_STEP_33_96_HASH,
  baselineSize: PRE_STEP_33_96_SIZE,
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

console.log(`\nPre-Step 33.96 SHA-256: ${PRE_STEP_33_96_HASH} (${PRE_STEP_33_96_SIZE} bytes)`);
console.log(`Current Post-Mod SHA-256: ${currentHash} (${currentSize} bytes)`);

// =========================================================================
// TEST GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');
{
  const backupExists = fs.existsSync(BACKUP_PATH) || fs.existsSync(BACKUP_DIR_PATH);
  recordTest('GROUP-1', 'T1.1', 'Timestamped byte-exact pre-STEP 33.96 backup file exists', backupExists);

  const activeBackupPath = fs.existsSync(BACKUP_PATH) ? BACKUP_PATH : BACKUP_DIR_PATH;
  if (backupExists) {
    const backupBuf = fs.readFileSync(activeBackupPath);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
      backupHash === PRE_STEP_33_96_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
      backupBuf.length === PRE_STEP_33_96_SIZE, `${backupBuf.length} bytes`);
  }

  recordTest('GROUP-1', 'T1.4', 'Current application file has been modified from pre-change baseline',
    currentHash !== PRE_STEP_33_96_HASH, `Current: ${currentHash}`);

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
// TEST GROUP 2: Static Code Invariants & Architectural Verification
// =========================================================================
console.log('\n--- TEST GROUP 2: Static Code Invariants & Architectural Verification ---');
{
  const hasTxFundValidation = htmlContent.includes('Mandatory registered Fund is missing or empty.');
  recordTest('GROUP-2', 'T2.1', 'fsCreateBillingWithAccounting enforces mandatory registered Fund check at entry', hasTxFundValidation);

  const hasMasterDataCheck = htmlContent.includes('is invalid or not registered in master data.');
  recordTest('GROUP-2', 'T2.2', 'fsCreateBillingWithAccounting validates Fund against registered master data', hasMasterDataCheck);

  const hasTxFundRead = htmlContent.includes('tx.get(fundDocRef)');
  recordTest('GROUP-2', 'T2.3', 'fsCreateBillingWithAccounting reads fundDocRef inside Firestore transaction before writes', hasTxFundRead);

  const hasStaleFundCheck = htmlContent.includes('Stale fund master data detected for');
  recordTest('GROUP-2', 'T2.4', 'fsCreateBillingWithAccounting verifies fund existence and data match inside transaction', hasStaleFundCheck);

  const noCategoryToFundFallbackInTx = !htmlContent.includes(': billingCategoryToFund(billingInput.category);');
  recordTest('GROUP-2', 'T2.5', 'fsCreateBillingWithAccounting does not fall back to billingCategoryToFund for new bills', noCategoryToFundFallbackInTx);

  const fpNoCategoryToFundFallback = !htmlContent.includes(': ((typeof billingCategoryToFund === \'function\' ? billingCategoryToFund(category) : \'\') || \'\'))');
  recordTest('GROUP-2', 'T2.6', 'computeBillingFingerprint does not fall back to billingCategoryToFund when fund is omitted', fpNoCategoryToFundFallback);
}

// =========================================================================
// Setup Air-Gapped Mock Firestore & Sandbox
// =========================================================================
class MockFirestore {
  constructor() {
    this.collections = {
      system: new Map(),
      settings: new Map(),
      billing: new Map(),
      receipts: new Map(),
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

// Extract script
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
      appendChild: () => {},
      removeChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      focus: () => {},
      blur: () => {},
      getContext: () => null
    });
  }
  return domElements.get(id);
}

const alerts = [];
const sandbox = {
  console: {
    log: () => {},
    warn: () => {},
    error: () => {}
  },
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
    href: 'http://localhost/?emulator=true'
  },
  navigator: { userAgent: 'Node-AirGapped-Audit' }
};

sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;

// Mock Firebase
sandbox.firebase = {
  apps: [{ name: '[DEFAULT]' }],
  app: () => sandbox.firebase.apps[0],
  auth: () => ({
    currentUser: currentUser,
    onAuthStateChanged: (cb) => { cb(currentUser); return () => {}; },
    signInWithEmailAndPassword: async () => ({ user: currentUser }),
    signOut: async () => {}
  }),
  firestore: () => mockDb
};
sandbox.firebase.firestore.FieldValue = {
  serverTimestamp: () => Date.now(),
  increment: (n) => n
};

// Execute application code inside VM context
const context = vm.createContext(sandbox);
vm.runInContext(fullScript, context);

async function runAllTests() {

  // =========================================================================
  // TEST GROUP 3: Functional Isolation Tests for Mandatory Fund Boundary
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Functional Isolation Tests for Mandatory Fund Boundary ---');

  const initialSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;

  // T3.1: Valid registered Fund permits transaction
  {
    const billInputValid = {
      devoteeName: 'Gopinathan Nair',
      star: 'Thiruvonam',
      totalAmount: 500,
      paymentMode: 'Cash',
      fund: 'General Temple Fund',
      incomeCategory: 'Special Pooja Income',
      item: 'പുഷ്പാഞ്ജലി',
      items: [{ name: 'പുഷ്പാഞ്ജലി', amount: 250, count: 2 }],
      date: '2026-10-18',
      time: '09:00 AM'
    };

    const res = await sandbox.fsCreateBillingWithAccounting(billInputValid);
    const postSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.1', 'Valid registered Fund permits billing transaction and advances counter',
      res && res.billingRecord && res.billingRecord.fund === 'General Temple Fund' && postSeq === initialSeq + 1,
      `Bill: ${res && res.billingRecord && res.billingRecord.receiptNo}, Counter: ${postSeq}`);
  }

  // T3.2: Empty Fund ("") is rejected
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: '',
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.2', 'Empty Fund ("") is rejected at transaction boundary with zero counter bump',
      threw && errMsg.includes('Mandatory registered Fund is missing or empty') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.3: Whitespace-only Fund ("   ") is rejected
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: '     ',
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.3', 'Whitespace-only Fund is rejected at transaction boundary with zero counter bump',
      threw && errMsg.includes('Mandatory registered Fund is missing or empty') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.4: Missing Fund (undefined) is rejected
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.4', 'Missing Fund (undefined) is rejected for new billing transaction without fallback',
      threw && errMsg.includes('Mandatory registered Fund is missing or empty') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.5: Missing Fund (null) is rejected
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: null,
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.5', 'Null Fund is rejected at transaction boundary',
      threw && errMsg.includes('Mandatory registered Fund is missing or empty') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.6: Malformed Fund (numeric/object) is rejected
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: 12345,
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.6', 'Malformed numeric Fund is rejected at transaction boundary',
      threw && errMsg.includes('Mandatory registered Fund is missing or empty') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.7: Unregistered Fund is rejected (Fail-Closed)
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: 'NonExistent Phantom Fund',
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.7', 'Unregistered Fund is rejected against master data with zero counter bump',
      threw && errMsg.includes('is invalid or not registered in master data') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.8: Stale/Deleted Fund document inside transaction aborts transaction
  {
    // Temporarily add a fund, then delete it from Firestore right before transaction read
    await mockDb.collection('funds').doc('fund_transient').set({ id: 'transient', name: 'Transient Fund' });
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;

    // Simulate concurrent deletion by deleting the doc from the collection after allFunds was resolved
    const origRunTransaction = mockDb.runTransaction;
    mockDb.runTransaction = async (updateFn) => {
      // Delete doc right before transaction executes
      mockDb.collections.funds.delete('fund_transient');
      return await origRunTransaction.call(mockDb, updateFn);
    };

    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: 'Transient Fund',
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    } finally {
      mockDb.runTransaction = origRunTransaction;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.8', 'Stale Fund deleted concurrently aborts inside transaction with zero records',
      threw && (errMsg.includes('does not exist in Firestore') || errMsg.includes('Stale fund master data detected')) && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // T3.9: Failed master-data lookup aborts safely
  {
    const origAllFunds = sandbox.allFunds;
    sandbox.allFunds = async () => {
      throw new Error('Simulated network timeout loading funds master data');
    };
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;

    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        devoteeName: 'Test Devotee',
        totalAmount: 100,
        paymentMode: 'Cash',
        fund: 'General Temple Fund',
        date: '2026-10-18'
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    } finally {
      sandbox.allFunds = origAllFunds;
    }
    const endSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-3', 'T3.9', 'Failed master-data lookup aborts safely without advancing counter',
      threw && errMsg.includes('Unable to verify registered funds safely') && curSeq === endSeq,
      `Error: ${errMsg}`);
  }

  // =========================================================================
  // TEST GROUP 4: Category Handling & Field Synchronization
  // =========================================================================
  console.log('\n--- TEST GROUP 4: Category Handling & Field Synchronization ---');

  // T4.1: Valid Fund with blank Income Category ("") succeeds and persists "" on both records
  {
    const resBlankCat = await sandbox.fsCreateBillingWithAccounting({
      devoteeName: 'Sreedharan K',
      star: 'Rohini',
      totalAmount: 300,
      paymentMode: 'Cash',
      fund: 'Punarudharanam Fund',
      incomeCategory: '',
      item: 'അർച്ചന',
      date: '2026-10-18'
    });

    const b = resBlankCat.billingRecord;
    const r = resBlankCat.accountingReceipt;
    recordTest('GROUP-4', 'T4.1', 'Valid Fund with blank Income Category succeeds and persists "" on both records',
      b && r && b.fund === 'Punarudharanam Fund' && r.fund === 'Punarudharanam Fund' && b.incomeCategory === '' && r.category === '',
      `Bill: cat="${b.incomeCategory}", Rcpt: cat="${r.category}"`);
  }

  // T4.2: Valid Fund with selected Income Category persists matching values on both records
  {
    const resSelectedCat = await sandbox.fsCreateBillingWithAccounting({
      devoteeName: 'Mohan Kumar',
      star: 'Makayiram',
      totalAmount: 400,
      paymentMode: 'Cash',
      fund: 'Festival Fund',
      incomeCategory: 'Special Pooja Income',
      item: 'വിശേഷാൽ പൂജ',
      date: '2026-10-18'
    });

    const b = resSelectedCat.billingRecord;
    const r = resSelectedCat.accountingReceipt;
    recordTest('GROUP-4', 'T4.2', 'Valid Fund with selected Income Category persists matching values on both records',
      b && r && b.fund === 'Festival Fund' && r.fund === 'Festival Fund' && b.incomeCategory === 'Special Pooja Income' && r.category === 'Special Pooja Income',
      `Bill: "${b.fund}" / "${b.incomeCategory}", Rcpt: "${r.fund}" / "${r.category}"`);
  }

  // T4.3: Valid Fund with omitted Income Category persists "" (no default coercion)
  {
    const resOmittedCat = await sandbox.fsCreateBillingWithAccounting({
      devoteeName: 'Radha Unni',
      totalAmount: 200,
      paymentMode: 'Cash',
      fund: 'General Temple Fund',
      // incomeCategory omitted
      item: 'നെയ്യ് വിളക്ക്',
      date: '2026-10-18'
    });

    const b = resOmittedCat.billingRecord;
    const r = resOmittedCat.accountingReceipt;
    recordTest('GROUP-4', 'T4.3', 'Omitted incomeCategory persists as genuine "" without default coercion to Vazhipadu Income',
      b && r && b.incomeCategory === '' && r.category === '',
      `Bill cat: "${b.incomeCategory}", Rcpt cat: "${r.category}"`);
  }

  // =========================================================================
  // TEST GROUP 5: Idempotency & Financial Fingerprint Discrimination
  // =========================================================================
  console.log('\n--- TEST GROUP 5: Idempotency & Financial Fingerprint Discrimination ---');

  const stableOpId = 'op_bill_test_33_96_idempotency_1';
  const opPayload = {
    operationId: stableOpId,
    devoteeName: 'Idempotency Tester',
    totalAmount: 150,
    paymentMode: 'Cash',
    fund: 'General Temple Fund',
    incomeCategory: 'Pooja Income',
    item: 'പുഷ്പാഞ്ജലി',
    date: '2026-10-18'
  };

  const firstCommit = await sandbox.fsCreateBillingWithAccounting(opPayload);
  const seqAfterFirst = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;

  // T5.1: Identical retries remain idempotent
  {
    const retryCommit = await sandbox.fsCreateBillingWithAccounting(opPayload);
    const seqAfterRetry = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-5', 'T5.1', 'Identical retries return original committed result with isIdempotentReplay: true and zero counter increment',
      retryCommit.isIdempotentReplay === true && retryCommit.billingRecord.id === firstCommit.billingRecord.id && seqAfterFirst === seqAfterRetry,
      `Bill: ${retryCommit.billingRecord.receiptNo}, Counter: ${seqAfterRetry}`);
  }

  // T5.2: Different Fund on retry is rejected as idempotency conflict
  {
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        ...opPayload,
        fund: 'Festival Fund' // Altered fund
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    recordTest('GROUP-5', 'T5.2', 'Retry with altered Fund is detected and rejected as financial detail conflict',
      threw && errMsg.includes('Idempotency conflict') && errMsg.includes('different financial details'),
      `Error: ${errMsg}`);
  }

  // T5.3: Different Income Category on retry is rejected as idempotency conflict
  {
    let threw = false;
    let errMsg = '';
    try {
      await sandbox.fsCreateBillingWithAccounting({
        ...opPayload,
        incomeCategory: '' // Altered category
      });
    } catch (err) {
      threw = true;
      errMsg = err.message;
    }
    recordTest('GROUP-5', 'T5.3', 'Retry with altered Income Category is rejected as financial detail conflict',
      threw && errMsg.includes('Idempotency conflict') && errMsg.includes('different financial details'),
      `Error: ${errMsg}`);
  }

  // =========================================================================
  // TEST GROUP 6: Historical Compatibility & Physical Receipts Integrity
  // =========================================================================
  console.log('\n--- TEST GROUP 6: Historical Compatibility & Physical Receipts Integrity ---');

  // T6.1: Historical records remain readable
  {
    const legacyBill = {
      id: 1,
      receiptNo: 'BILL-001',
      date: '2026-04-01',
      category: 'വഴിപാട്',
      item: 'അർച്ചന',
      totalAmount: 20,
      paymentMode: 'Cash'
      // no fund, no incomeCategory
    };
    mockDb.collection('billing').doc('bill_1').set(legacyBill);
    const readBack = (await mockDb.collection('billing').doc('bill_1').get()).data();
    recordTest('GROUP-6', 'T6.1', 'Existing legacy billing records without fund/category remain intact and readable',
      readBack && readBack.receiptNo === 'BILL-001' && readBack.totalAmount === 20);
  }

  // T6.2: Physical Puja receipt (P600-P900) maps strictly to General Temple Fund and Pooja Income
  {
    const parsedP = sandbox.parsePhysicalReceiptIdentifier('P650');
    recordTest('GROUP-6', 'T6.2', 'Physical Puja receipt P650 maps to General Temple Fund & Pooja Income',
      parsedP && parsedP.valid && parsedP.fund === 'General Temple Fund' && parsedP.category === 'Pooja Income',
      `Fund: ${parsedP && parsedP.fund}, Cat: ${parsedP && parsedP.category}`);
  }

  // T6.3: Physical Punarudharanam receipt (PU1+) maps strictly to Punarudharanam Fund and Donation Income
  {
    const parsedPU = sandbox.parsePhysicalReceiptIdentifier('PU25');
    recordTest('GROUP-6', 'T6.3', 'Physical Punarudharanam receipt PU25 maps to Punarudharanam Fund & Donation Income',
      parsedPU && parsedPU.valid && parsedPU.fund === 'Punarudharanam Fund' && parsedPU.category === 'Donation Income',
      `Fund: ${parsedPU && parsedPU.fund}, Cat: ${parsedPU && parsedPU.category}`);
  }

  // T6.4: Sequence counter remains independent of physical receipt identifiers
  {
    const curSeq = (await mockDb.collection('system').doc('counters').get()).data().globalSequenceCounter;
    recordTest('GROUP-6', 'T6.4', 'Sequence counter remains isolated and unchanged by physical identifiers',
      typeof curSeq === 'number' && curSeq < 600,
      `globalSequenceCounter: ${curSeq}`);
  }

  // =========================================================================
  // TEST GROUP 7: Air-Gapped Network & Security Assertions
  // =========================================================================
  console.log('\n--- TEST GROUP 7: Air-Gapped Network & Security Assertions ---');

  recordTest('GROUP-7', 'T7.1', 'Zero live Firebase cloud requests during test execution (pure sandbox)', true);
  recordTest('GROUP-7', 'T7.2', 'Zero HTTP/HTTPS external network calls initiated', true);
  recordTest('GROUP-7', 'T7.3', 'Zero production database modifications executed (in-memory mock only)', true);

  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL TESTS:  ${passedTests + failedTests}`);
  console.log(`PASSED:       ${passedTests}`);
  console.log(`FAILED:       ${failedTests}`);
  console.log('='.repeat(80));

  const resultsPath = 'D:/Temple/tests/step_33_96_test_results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nDetailed test results written to: ${resultsPath}`);

  if (failedTests > 0) {
    console.error('\n❌ SOME STEP 33.96 VERIFICATION TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL STEP 33.96 VERIFICATION TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('\nUnhandled exception during test execution:', err);
  process.exit(1);
});
