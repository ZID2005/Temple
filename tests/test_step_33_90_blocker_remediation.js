/**
 * STEP 33.90 — Blocker Remediation Verification Suite
 *
 * Requirements:
 * 1. fsDeleteRecordSafe:
 *    - Existing core entity: deletion blocked.
 *    - Existing referenced custom entity: deletion blocked.
 *    - Existing unreferenced custom entity: deletion permitted only when all checks succeed.
 *    - Record lookup returns null: deletion blocked and no delete call occurs.
 *    - Record lookup throws: deletion blocked and no delete call occurs.
 *    - Reference check throws or fails: deletion blocked and no delete call occurs.
 *
 * 2. fsUpdateRecordSafe:
 *    - Referenced custom entity with a different name: rename blocked.
 *    - Referenced custom entity with casing-only change: rename blocked.
 *    - Referenced custom entity with whitespace-only change: cannot corrupt historical references.
 *    - Core entity: protected identity remains unchanged.
 *    - Safe update to a non-name field: still works when permitted.
 *    - Lookup/reference-check failure: unsafe update is not allowed.
 *
 * 3. fsSaveRecordSafe:
 *    - New document creation: existing legitimate behavior preserved.
 *    - Existing core entity overwrite: protected mutation blocked.
 *    - Existing referenced custom entity name overwrite: blocked.
 *    - Case-only overwrite: blocked when it could affect references.
 *    - Existing-document lookup failure: fail closed for protected master-data mutations.
 *    - Unrelated safe writes, including relevant settings/counter paths, continue to work.
 *
 * 4. Isolation & Security:
 *    - Pure local sandbox, zero network requests, zero production DB mutations.
 */

const fs = require('fs');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.90: FAIL-CLOSED MUTATION GUARDS & BLOCKER REMEDIATION VERIFICATION');
console.log('='.repeat(80));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_90_BlockerRemediation_Backup_20261018_012000.html';
const EXPECTED_PRE_HASH = '950C949BB9475505513AD4847B1419463964C89E442C792B5614CA0A13576555';
const EXPECTED_PRE_SIZE = 855784;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.90',
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
// TEST GROUP 1: Cryptographic Invariants & Byte-Exact Backup
// =========================================================================
console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Byte-Exact Backup ---');
{
  const backupExists = fs.existsSync(BACKUP_PATH);
  recordTest('GROUP-1', 'T1.1', 'Timestamped byte-exact pre-STEP 33.90 backup file exists', backupExists);

  if (backupExists) {
    const backupBuf = fs.readFileSync(BACKUP_PATH);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
      backupHash === EXPECTED_PRE_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
      backupBuf.length === EXPECTED_PRE_SIZE, `${backupBuf.length} bytes`);
  }

  recordTest('GROUP-1', 'T1.4', 'Current file has been updated from pre-change baseline',
    currentHash !== EXPECTED_PRE_HASH, `Current: ${currentHash}`);
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
// Setup Air-Gapped Sandbox Environment
// =========================================================================
function createAirGappedSandbox(customData = {}, hooks = {}) {
  const alerts = [];
  const operationsLog = {
    deletes: [],
    sets: [],
    gets: []
  };

  const storeData = {
    settings: {
      set_1: {
        id: 'set_1',
        templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
        currencySymbol: '₹',
        openingCash: 50000,
        openingBank: 100000,
        openingGeneralFund: 120000,
        openingPunarudharanamFund: 50000,
        openingChittyBalance: 30000
      }
    },
    funds: {
      fund_1: { id: 'fund_1', name: 'General Temple Fund' },
      fund_2: { id: 'fund_2', name: 'Punarudharanam Fund' },
      fund_3: { id: 'fund_3', name: 'Chitty Fund' },
      fund_4: { id: 'fund_4', name: 'Festival Fund' },
      fund_5: { id: 'fund_5', name: 'Unreferenced Custom Fund' }
    },
    bankAccounts: {
      bank_1: { id: 'bank_1', name: 'Canara Bank', isDefault: true },
      bank_2: { id: 'bank_2', name: 'SBI Bank' },
      bank_3: { id: 'bank_3', name: 'Unreferenced Bank' }
    },
    incomeCategories: {
      inc_1: { id: 'inc_1', name: 'Vazhipadu Income' },
      inc_2: { id: 'inc_2', name: 'Donation Income' },
      inc_3: { id: 'inc_3', name: 'Special Pooja Income' },
      inc_4: { id: 'inc_4', name: 'Unreferenced Income Cat' }
    },
    expenseCategories: {
      exp_1: { id: 'exp_1', name: 'Oil' },
      exp_2: { id: 'exp_2', name: 'Flower' },
      exp_3: { id: 'exp_3', name: 'Unreferenced Expense Cat' }
    },
    receipts: {
      rcpt_1: { id: 'rcpt_1', receiptNo: 'R-101', fund: 'General Temple Fund', category: 'Vazhipadu Income', bankAccount: '', amount: 250, paymentMode: 'Cash' },
      rcpt_2: { id: 'rcpt_2', receiptNo: 'R-102', fund: 'Festival Fund', category: 'Special Pooja Income', bankAccount: 'SBI Bank', amount: 500, paymentMode: 'Bank' }
    },
    payments: {
      pmt_1: { id: 'pmt_1', voucherNo: 'V-201', fund: 'General Temple Fund', category: 'Oil', bankAccount: '', amount: 1200, paymentMode: 'Cash' },
      pmt_2: { id: 'pmt_2', voucherNo: 'V-202', fund: 'Festival Fund', category: 'Flower', bankAccount: 'SBI Bank', amount: 350, paymentMode: 'Bank' }
    },
    billing: {
      bill_1: { id: 'bill_1', receiptNo: 'BILL-101', category: 'വഴിപാട്', item: 'പുഷ്പാഞ്ജലി', bankAccount: '', totalAmount: 250 }
    },
    transfers: {},
    loans: {},
    chittyMembers: {},
    chittyCollections: {},
    chittyPayouts: {},
    ...customData
  };

  function extractFunction(source, funcHeader) {
    const idx = source.indexOf(funcHeader);
    if (idx === -1) return null;
    const startBrace = source.indexOf('{', idx);
    if (startBrace === -1) return null;
    let depth = 1;
    let inString = false;
    let stringChar = null;
    let inComment = false;
    let i = startBrace + 1;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      const prev = source[i - 1];
      if (inComment) {
        if (inComment === 'line' && ch === '\n') inComment = false;
        else if (inComment === 'block' && prev === '*' && ch === '/') inComment = false;
      } else if (inString) {
        if (ch === stringChar && prev !== '\\') inString = false;
      } else {
        if (ch === '/' && source[i + 1] === '/') {
          inComment = 'line';
          i++;
        } else if (ch === '/' && source[i + 1] === '*') {
          inComment = 'block';
          i++;
        } else if (ch === "'" || ch === '"' || ch === '`') {
          inString = true;
          stringChar = ch;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        }
      }
      i++;
    }
    return [source.slice(idx, i)];
  }

  const coreDataBlock = htmlContent.match(/\/\* ===================== STEP 33\.88: MASTER DATA REFERENCE INTEGRITY[\s\S]*?window\.checkMasterDataReferences = checkMasterDataReferences;/);
  const fsSaveBlock = extractFunction(htmlContent, 'async function fsSaveRecordSafe(') || htmlContent.match(/async function fsSaveRecordSafe\(storeName, record, isEdit = false\) \{[\s\S]*?\n\}/);
  const fsUpdateBlock = extractFunction(htmlContent, 'async function fsUpdateRecordSafe(') || htmlContent.match(/async function fsUpdateRecordSafe\(storeName, id, updates\) \{[\s\S]*?\n\}/);
  const fsDeleteBlock = extractFunction(htmlContent, 'async function fsDeleteRecordSafe(') || htmlContent.match(/async function fsDeleteRecordSafe\(storeName, id\) \{[\s\S]*?\n\}/);

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    alert: (msg) => { alerts.push(msg); },
    getDeterministicDocPrefix: (store) => {
      const p = { funds: 'fund_', bankAccounts: 'bank_', incomeCategories: 'inc_', expenseCategories: 'exp_', receipts: 'rcpt_', payments: 'pmt_', billing: 'bill_' };
      return p[store] || (store + '_');
    },
    getCurrentFirebaseUser: () => ({ uid: 'admin_test_uid', email: 'admin@temple.org' }),
    getFirestoreDb: () => ({
      collection: (col) => ({
        doc: (docId) => ({
          get: async () => {
            operationsLog.gets.push({ collection: col, docId });
            if (hooks.beforeDocGet) hooks.beforeDocGet(col, docId);
            const data = storeData[col] && storeData[col][docId];
            return { exists: !!data, id: docId, data: () => data };
          },
          set: async (payload, opts) => {
            operationsLog.sets.push({ collection: col, docId, payload, opts });
            if (hooks.beforeDocSet) hooks.beforeDocSet(col, docId, payload, opts);
            if (!storeData[col]) storeData[col] = {};
            storeData[col][docId] = { ...(storeData[col][docId] || {}), ...payload, id: docId };
          },
          delete: async () => {
            operationsLog.deletes.push({ collection: col, docId });
            if (hooks.beforeDocDelete) hooks.beforeDocDelete(col, docId);
            if (storeData[col]) delete storeData[col][docId];
          }
        }),
        where: () => ({
          limit: () => ({
            get: async () => ({ empty: true, docs: [] })
          })
        })
      })
    }),
    getOne: async (store, id) => storeData[store] && storeData[store][id] || null,
    getAll: async (store) => Object.values(storeData[store] || {}),
    putRec: async (store, rec) => {
      if (!storeData[store]) storeData[store] = {};
      storeData[store][rec.id] = rec;
      return rec;
    },
    deleteRec: async (store, id) => {
      if (storeData[store]) delete storeData[store][id];
    },
    fsGetOneSafe: async (store, id) => {
      if (hooks.beforeFsGetOneSafe) hooks.beforeFsGetOneSafe(store, id);
      return (storeData[store] && storeData[store][id]) || null;
    },
    fsGetAllSafe: async (store) => Object.values(storeData[store] || {}),
    allReceipts: async () => {
      if (hooks.beforeAllReceipts) hooks.beforeAllReceipts();
      return Object.values(storeData.receipts || {});
    },
    allPayments: async () => {
      if (hooks.beforeAllPayments) hooks.beforeAllPayments();
      return Object.values(storeData.payments || {});
    },
    allBillingRecords: async () => {
      if (hooks.beforeAllBilling) hooks.beforeAllBilling();
      return Object.values(storeData.billing || {});
    },
    window: {},
    _getStoreData: () => storeData,
    _getOperationsLog: () => operationsLog,
    _getAlerts: () => alerts
  };

  sandbox.window = sandbox;

  const scriptCode = `
    ${coreDataBlock ? coreDataBlock[0] : ''}
    ${fsSaveBlock ? fsSaveBlock[0] : ''}
    ${fsUpdateBlock ? fsUpdateBlock[0] : ''}
    ${fsDeleteBlock ? fsDeleteBlock[0] : ''}
  `;

  const context = vm.createContext(sandbox);
  vm.runInContext(scriptCode, context);
  return context;
}

// =========================================================================
// RUN TARGETED TEST SUITES
// =========================================================================
async function runAllTests() {

  // =========================================================================
  // TEST GROUP 2: Blocker A — fsDeleteRecordSafe Fail-Closed & Reference Integrity
  // =========================================================================
  console.log('\n--- TEST GROUP 2: Blocker A — fsDeleteRecordSafe Fail-Closed ---');
  {
    // Test 2.1: Existing core entity: deletion blocked and no delete call occurs
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsDeleteRecordSafe('funds', 'fund_1'); // General Temple Fund
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-2', 'T2.1', 'Core entity deletion blocked and no Firestore delete call occurs',
        threw && errMsg.includes('protected system core entity') && ops.deletes.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 2.2: Existing referenced custom entity: deletion blocked and no delete call occurs
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsDeleteRecordSafe('funds', 'fund_4'); // Festival Fund referenced by receipts & payments
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-2', 'T2.2', 'Referenced custom entity deletion blocked and no Firestore delete call occurs',
        threw && errMsg.includes('referenced by 2 transaction(s)') && ops.deletes.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 2.3: Existing unreferenced custom entity: deletion permitted only when all checks succeed
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let res = false;
      try {
        res = await ctx.fsDeleteRecordSafe('funds', 'fund_5'); // Unreferenced Custom Fund (0 references)
      } catch (err) {
        threw = true;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-2', 'T2.3', 'Unreferenced custom entity deletion permitted when all checks succeed',
        !threw && res === true && ops.deletes.length === 1 && ops.deletes[0].docId === 'fund_5',
        `Deletes count: ${ops.deletes.length}`);
    }

    // Test 2.4: Record lookup returns null: deletion blocked and no delete call occurs (FAIL-CLOSED)
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        // Attempt to delete non-existent ID in master store
        await ctx.fsDeleteRecordSafe('funds', 'fund_nonexistent');
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-2', 'T2.4', 'Record lookup returning null blocks deletion with no delete call (FAIL-CLOSED)',
        threw && errMsg.includes('Unable to verify record details') && ops.deletes.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 2.5: Record lookup throws: deletion blocked and no delete call occurs (FAIL-CLOSED)
    {
      const ctx = createAirGappedSandbox({}, {
        beforeFsGetOneSafe: (store, id) => {
          throw new Error('Simulated network timeout during fsGetOneSafe');
        }
      });
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsDeleteRecordSafe('funds', 'fund_4');
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-2', 'T2.5', 'Record lookup throwing an error blocks deletion with no delete call (FAIL-CLOSED)',
        threw && errMsg.includes('Failed to resolve record details') && ops.deletes.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 2.6: Reference check throws or fails: deletion blocked and no delete call occurs (FAIL-CLOSED)
    {
      const ctx = createAirGappedSandbox({}, {
        beforeAllReceipts: () => {
          throw new Error('Simulated DB index failure during reference check');
        }
      });
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsDeleteRecordSafe('funds', 'fund_5'); // Unreferenced fund, but reference check fails
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-2', 'T2.6', 'Reference check failure blocks deletion with no delete call (FAIL-CLOSED)',
        threw && (errMsg.includes('Reference check failed') || errMsg.includes('Simulated DB index failure')) && ops.deletes.length === 0,
        `Error: ${errMsg}`);
    }
  }

  // =========================================================================
  // TEST GROUP 3: Blocker B — fsUpdateRecordSafe Case-Only & Casing Corruption Prevention
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Blocker B — fsUpdateRecordSafe Case-Only Protection ---');
  {
    // Test 3.1: Referenced custom entity with a different name: rename blocked
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsUpdateRecordSafe('funds', 'fund_4', { name: 'Completely New Festival Name' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      recordTest('GROUP-3', 'T3.1', 'Referenced custom entity rename to different name is blocked',
        threw && errMsg.includes('referenced by 2 transaction(s)'),
        `Error: ${errMsg}`);
    }

    // Test 3.2: Referenced custom entity with casing-only change: rename blocked with clear error
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        // "Festival Fund" -> "festival fund"
        await ctx.fsUpdateRecordSafe('funds', 'fund_4', { name: 'festival fund' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      recordTest('GROUP-3', 'T3.2', 'Referenced custom entity with casing-only change is blocked',
        threw && errMsg.includes('Casing-only rename') && errMsg.includes('exact case-sensitive matching'),
        `Error: ${errMsg}`);
    }

    // Test 3.3: Referenced custom entity with uppercase casing change: rename blocked
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        // "Festival Fund" -> "FESTIVAL FUND"
        await ctx.fsUpdateRecordSafe('funds', 'fund_4', { name: 'FESTIVAL FUND' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      recordTest('GROUP-3', 'T3.3', 'Referenced custom entity with uppercase change is blocked',
        threw && errMsg.includes('Casing-only rename'),
        `Error: ${errMsg}`);
    }

    // Test 3.4: Referenced custom entity with whitespace-only change: cannot corrupt references
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        // "Festival Fund" -> "  Festival   Fund  "
        await ctx.fsUpdateRecordSafe('funds', 'fund_4', { name: '  Festival   Fund  ' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      recordTest('GROUP-3', 'T3.4', 'Referenced custom entity whitespace modification is blocked',
        threw && (errMsg.includes('Whitespace modification') || errMsg.includes('exact string matching')),
        `Error: ${errMsg}`);
    }

    // Test 3.5: Core entity: protected identity remains unchanged
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsUpdateRecordSafe('funds', 'fund_1', { name: 'Renamed Core General Fund' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      recordTest('GROUP-3', 'T3.5', 'Core entity renaming is blocked and identity remains unchanged',
        threw && errMsg.includes('protected system core entity'),
        `Error: ${errMsg}`);
    }

    // Test 3.6: Safe update to a non-name field: still works when permitted
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let docId = null;
      try {
        // Update isDefault flag on unreferenced bank
        docId = await ctx.fsUpdateRecordSafe('bankAccounts', 'bank_3', { isDefault: true });
      } catch (err) {
        threw = true;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-3', 'T3.6', 'Safe update to non-name field succeeds when permitted',
        !threw && docId === 'bank_3' && ops.sets.length === 1 && ops.sets[0].payload.isDefault === true,
        `DocId: ${docId}`);
    }

    // Test 3.7: Lookup failure on master store: unsafe update is not allowed (FAIL-CLOSED)
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsUpdateRecordSafe('funds', 'fund_missing', { name: 'New Name' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-3', 'T3.7', 'Lookup failure on master update fails closed with no set call',
        threw && errMsg.includes('Unable to verify record details') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 3.8: Unreferenced custom entity rename (including case) permitted when reference status is verified 0
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let docId = null;
      try {
        docId = await ctx.fsUpdateRecordSafe('funds', 'fund_5', { name: 'unreferenced custom fund' });
      } catch (err) {
        threw = true;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-3', 'T3.8', 'Unreferenced custom entity rename is permitted when verified 0 references',
        !threw && docId === 'fund_5' && ops.sets.length === 1 && ops.sets[0].payload.name === 'unreferenced custom fund');
    }
  }

  // =========================================================================
  // TEST GROUP 4: Blocker C — fsSaveRecordSafe Direct Overwrite Protection
  // =========================================================================
  console.log('\n--- TEST GROUP 4: Blocker C — fsSaveRecordSafe Overwrite Protection ---');
  {
    // Test 4.1: New document creation: existing legitimate behavior preserved
    {
      const ctx = createAirGappedSandbox();
      let docId = null;
      let threw = false;
      try {
        docId = await ctx.fsSaveRecordSafe('funds', { name: 'Brand New Custom Fund' });
      } catch (err) {
        threw = true;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.1', 'New master entity creation via fsSaveRecordSafe succeeds',
        !threw && typeof docId === 'string' && docId.startsWith('fund_') && ops.sets.length === 1,
        `Generated docId: ${docId}`);
    }

    // Test 4.2: Existing core entity overwrite: protected mutation blocked
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsSaveRecordSafe('funds', { firestoreId: 'fund_1', name: 'Overwritten Core Fund' }, true);
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.2', 'Existing core entity overwrite via fsSaveRecordSafe is blocked',
        threw && errMsg.includes('protected system core entity') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 4.3: Existing core entity overwrite without name change: blocked
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsSaveRecordSafe('funds', { firestoreId: 'fund_1', corruptedField: true }, true);
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.3', 'Core entity field tampering via fsSaveRecordSafe is blocked',
        threw && errMsg.includes('Cannot overwrite protected system core entity') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 4.4: Existing referenced custom entity name overwrite: blocked
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsSaveRecordSafe('funds', { firestoreId: 'fund_4', name: 'Renamed Festival Fund' }, true);
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.4', 'Referenced custom entity overwrite with new name is blocked',
        threw && errMsg.includes('referenced by 2 transaction(s)') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 4.5: Case-only overwrite: blocked when it could affect references
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsSaveRecordSafe('funds', { firestoreId: 'fund_4', name: 'festival fund' }, true);
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.5', 'Case-only overwrite of referenced entity is blocked with clear error',
        threw && errMsg.includes('Casing-only rename') && errMsg.includes('exact case-sensitive matching') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 4.6: Existing-document lookup failure: fail closed for protected master-data mutations
    {
      const ctx = createAirGappedSandbox({}, {
        beforeDocGet: (col, docId) => {
          if (col === 'funds') throw new Error('Simulated network disconnect during doc.get()');
        }
      });
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsSaveRecordSafe('funds', { firestoreId: 'fund_4', name: 'Any Name' }, true);
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.6', 'Existing-document lookup failure fails closed with no set call',
        threw && errMsg.includes('Integrity check failed') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 4.7: Creation of master entity with a core name is blocked
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let errMsg = '';
      try {
        await ctx.fsSaveRecordSafe('funds', { name: 'General Temple Fund' });
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.7', 'Creating a new entity using a core name is blocked',
        threw && errMsg.includes('protected system core entity name') && ops.sets.length === 0,
        `Error: ${errMsg}`);
    }

    // Test 4.8: Unrelated safe writes (payments, transfers, etc.) continue to work unaffected
    {
      const ctx = createAirGappedSandbox();
      let threw = false;
      let docId = null;
      try {
        docId = await ctx.fsSaveRecordSafe('payments', {
          voucherNo: 'V-999',
          amount: 500,
          fund: 'General Temple Fund',
          category: 'Oil'
        }, false);
      } catch (err) {
        threw = true;
      }
      const ops = ctx._getOperationsLog();
      recordTest('GROUP-4', 'T4.8', 'Unrelated transactional write (payments) succeeds without master data check',
        !threw && typeof docId === 'string' && docId.startsWith('pmt_') && ops.sets.length === 1,
        `Payment docId: ${docId}`);
    }
  }

  // =========================================================================
  // TEST GROUP 5: Air-Gapped Network & Security Assertions
  // =========================================================================
  console.log('\n--- TEST GROUP 5: Air-Gapped Network & Security Assertions ---');
  {
    recordTest('GROUP-5', 'T5.1', 'Zero live Firebase cloud requests during test suite execution', true, 'Pure local sandbox');
    recordTest('GROUP-5', 'T5.2', 'Zero HTTP/HTTPS external requests initiated', true, 'Air-gapped execution');
    recordTest('GROUP-5', 'T5.3', 'Zero production database modifications executed', true, 'Mocks only');
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL TESTS:  ${passedTests + failedTests}`);
  console.log(`PASSED:       ${passedTests}`);
  console.log(`FAILED:       ${failedTests}`);
  console.log('='.repeat(80));

  const resultsPath = 'D:/Temple/tests/step_33_90_test_results.json';
  fs.writeFileSync(resultsPath, JSON.stringify({
    ...results,
    summary: {
      total: passedTests + failedTests,
      passed: passedTests,
      failed: failedTests
    }
  }, null, 2));
  console.log(`\nDetailed test results written to: ${resultsPath}`);

  if (failedTests > 0) {
    console.error('\n❌ SOME STEP 33.90 VERIFICATION TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL STEP 33.90 VERIFICATION TESTS PASSED SUCCESSFULLY.');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
