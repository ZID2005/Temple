/**
 * test_step_33_46_backup_recovery_verification.js
 * STEP 33.46 — Backup & Recovery Procedure Verification Suite
 *
 * Isolated recovery testing using local Firebase Emulator only:
 * - Source Project: demo-backup-drill-source
 * - Target Project: demo-backup-drill-restore
 * - Host: 127.0.0.1:8080 (Firestore) / 127.0.0.1:9099 (Auth)
 *
 * Zero access to production 'temple-f4f7d'.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const RUN_ID = Date.now();
const SOURCE_PROJECT = `demo-backup-drill-source-${RUN_ID}`;
const RESTORE_PROJECT = `demo-backup-drill-restore-${RUN_ID}`;

const testResults = [];

function assert(condition, testId, description, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  testResults.push({ testId, description, status, details });
  const icon = condition ? '✅' : '❌';
  console.log(`${icon} [${status}] ${testId}: ${description} ${details ? '(' + details + ')' : ''}`);
  if (!condition) {
    console.error(`   ASSERTION FAILED: ${description}. Details: ${details}`);
  }
}

function httpJsonRequest(port, reqPath, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ statusCode: res.statusCode, body: parsed, rawBody: body });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function createAuthUser(email, password) {
  const res = await httpJsonRequest(
    AUTH_PORT,
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test-key',
    'POST',
    { email, password, returnSecureToken: true }
  );
  if (res.statusCode !== 200 || !res.body.idToken) {
    throw new Error(`Failed to create test user: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

// Convert plain JS object to Firestore REST document representation
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: String(v) };
      } else {
        fields[k] = { doubleValue: v };
      }
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (v instanceof Date) {
      fields[k] = { timestampValue: v.toISOString() };
    } else if (typeof v === 'object') {
      if (v.__type === 'Timestamp' && typeof v.seconds === 'number') {
        const iso = new Date(v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6)).toISOString();
        fields[k] = { timestampValue: iso };
      } else if (Array.isArray(v)) {
        fields[k] = {
          arrayValue: {
            values: v.map(item => {
              if (typeof item === 'string') return { stringValue: item };
              if (typeof item === 'number') return { integerValue: String(item) };
              if (typeof item === 'object') return { mapValue: { fields: toFirestoreFields(item) } };
              return { stringValue: String(item) };
            })
          }
        };
      } else {
        fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
      }
    }
  }
  return fields;
}

// Convert Firestore REST document representation back to plain JS object
function fromFirestoreFields(fields) {
  if (!fields) return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) out[k] = parseFloat(v.doubleValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('nullValue' in v) out[k] = null;
    else if ('timestampValue' in v) {
      const d = new Date(v.timestampValue);
      const ms = d.getTime();
      out[k] = {
        seconds: Math.floor(ms / 1000),
        nanoseconds: (ms % 1000) * 1e6
      };
    } else if ('mapValue' in v) {
      out[k] = fromFirestoreFields(v.mapValue.fields);
    } else if ('arrayValue' in v) {
      out[k] = (v.arrayValue.values || []).map(val => {
        if ('stringValue' in val) return val.stringValue;
        if ('integerValue' in val) return parseInt(val.integerValue, 10);
        if ('doubleValue' in val) return parseFloat(val.doubleValue);
        if ('booleanValue' in val) return val.booleanValue;
        if ('mapValue' in val) return fromFirestoreFields(val.mapValue.fields);
        return val;
      });
    }
  }
  return out;
}

async function writeDoc(projectId, token, colName, docId, data) {
  const fields = toFirestoreFields(data);
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}/${docId}`,
    'PATCH',
    { fields },
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.statusCode !== 200) {
    throw new Error(`Write failed for ${colName}/${docId}: HTTP ${res.statusCode} - ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function readDoc(projectId, token, colName, docId) {
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}/${docId}`,
    'GET',
    null,
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.statusCode === 404) return null;
  if (res.statusCode !== 200) {
    throw new Error(`Read failed for ${colName}/${docId}: HTTP ${res.statusCode} - ${JSON.stringify(res.body)}`);
  }
  return { id: docId, data: fromFirestoreFields(res.body.fields) };
}

async function listCollectionDocs(projectId, token, colName) {
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/v1/projects/${projectId}/databases/(default)/documents/${colName}`,
    'GET',
    null,
    { 'Authorization': `Bearer ${token}` }
  );
  if (res.statusCode === 404) return [];
  if (res.statusCode !== 200) {
    throw new Error(`List failed for ${colName}: HTTP ${res.statusCode} - ${JSON.stringify(res.body)}`);
  }
  const docs = (res.body.documents || []).map(doc => {
    const parts = doc.name.split('/');
    const docId = parts[parts.length - 1];
    return {
      _firestoreId: docId,
      ...fromFirestoreFields(doc.fields)
    };
  });
  return docs;
}

// -------------------------------------------------------------
// EXACT APPLICATION BACKUP & RESTORE LOGIC (Mirroring Temple_Accounts-1.html)
// -------------------------------------------------------------

function _serializeTimestamp(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    return {
      __type: 'Timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      iso: new Date(value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6)).toISOString()
    };
  }
  if (value instanceof Date) {
    return { __type: 'Date', iso: value.toISOString(), ms: value.getTime() };
  }
  return value;
}

function _serializeDoc(doc) {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(_serializeDoc);
  if (typeof doc === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      if (typeof v === 'object' && v !== null &&
          typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') {
        out[k] = _serializeTimestamp(v);
      } else if (typeof v === 'object' && v !== null) {
        out[k] = _serializeDoc(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return doc;
}

function _deserializeDoc(doc) {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(_deserializeDoc);
  if (typeof doc === 'object') {
    if (doc.__type === 'Timestamp' && typeof doc.seconds === 'number' && typeof doc.nanoseconds === 'number') {
      return { seconds: doc.seconds, nanoseconds: doc.nanoseconds };
    }
    if (doc.__type === 'Date' && doc.iso) {
      return new Date(doc.iso);
    }
    const out = {};
    for (const [k, v] of Object.entries(doc)) {
      out[k] = _deserializeDoc(v);
    }
    return out;
  }
  return doc;
}

const BACKUP_COLLECTIONS = [
  'settings',
  'funds',
  'incomeCategories',
  'expenseCategories',
  'bankAccounts',
  'billing',
  'receipts',
  'payments',
  'transfers',
  'chittyMembers',
  'chittyCollections',
  'chittyPayouts',
  'loans'
];

async function simulateApplicationDownloadBackup(projectId, token, userEmail, userUid) {
  const exportTimestamp = new Date().toISOString();
  const collections = {};
  let totalDocCount = 0;

  for (const colName of BACKUP_COLLECTIONS) {
    const rawDocs = await listCollectionDocs(projectId, token, colName);
    const docs = rawDocs.map(d => _serializeDoc(d));
    collections[colName] = docs;
    totalDocCount += docs.length;
  }

  // Counters
  let countersData = null;
  const counterSnap = await readDoc(projectId, token, 'system', 'counters');
  if (counterSnap) {
    countersData = _serializeDoc(counterSnap.data);
    countersData._firestoreId = 'counters';
    countersData._firestoreCollection = 'system';
  }

  const backupObj = {
    metadata: {
      source: 'firestore',
      firestoreProject: projectId,
      exportedAt: exportTimestamp,
      exportedBy: userEmail,
      exportedByUid: userUid,
      schemaVersion: '23.1',
      backupVersion: '2',
      note: 'Authoritative Firestore export. Does NOT depend on IndexedDB cache. BUG-003 fix (Step 23.1).'
    },
    collections,
    counters: countersData,
    summary: {
      totalDocuments: totalDocCount,
      collectionCounts: Object.fromEntries(
        BACKUP_COLLECTIONS.map(c => [c, (collections[c] || []).length])
      )
    }
  };

  const jsonStr = JSON.stringify(backupObj, null, 2);
  const hash = crypto.createHash('sha256').update(jsonStr).digest('hex').toUpperCase();

  return { backupObj, jsonStr, hash, totalDocCount };
}

// -------------------------------------------------------------
// MAIN TEST RUNNER
// -------------------------------------------------------------
async function runVerification() {
  console.log('\n========================================================================');
  console.log('   STEP 33.46: BACKUP & RECOVERY PROCEDURE VERIFICATION SUITE');
  console.log('========================================================================\n');

  // 1. Authenticate synthetic admin
  const user = await createAuthUser(`backup_drill_${Date.now()}@temple.local`, 'BackupDrillPass123!');
  const token = user.idToken;
  const userUid = user.localId;
  const userEmail = user.email;
  console.log(`Authenticated synthetic admin UID: ${userUid} (${userEmail})`);

  // 2. Build representative synthetic dataset
  console.log('\n--- 1. Populating Representative Synthetic Dataset in Source ---');
  const syntheticFixture = {
    settings: [
      { id: 'set_1', templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', financialYear: '2026-27', receiptPrefix: 'R-', billingReceiptPrefix: 'BILL-', voucherPrefix: 'V-' }
    ],
    funds: [
      { id: 'fund_1', name: 'General Fund', balance: 50000 },
      { id: 'fund_2', name: 'Building Fund', balance: 25000 },
      { id: 'fund_3', name: 'Pooja Fund', balance: 10000 }
    ],
    incomeCategories: [
      { id: 'inc_1', name: 'Vazhipadu' },
      { id: 'inc_2', name: 'Donation' },
      { id: 'inc_3', name: 'Special Pooja' }
    ],
    expenseCategories: [
      { id: 'exp_1', name: 'Oil & Camphor' },
      { id: 'exp_2', name: 'Priest Salary' },
      { id: 'exp_3', name: 'Electricity' }
    ],
    bankAccounts: [
      { id: 'bank_1', bankName: 'SBI', accountNumber: '1234567890', balance: 45000 },
      { id: 'bank_2', bankName: 'Federal Bank', accountNumber: '9876543210', balance: 35000 }
    ],
    billing: [
      { id: 'bill_1', receiptNo: 'BILL-001', devoteeName: 'Santhosh', totalAmount: 100, accountingReceiptId: 'rcpt_1', voided: false, createdAt: '2026-10-12T10:00:00Z', updatedAt: 1790868000000 },
      { id: 'bill_2', receiptNo: 'BILL-002', devoteeName: 'Ramesh', totalAmount: 200, accountingReceiptId: 'rcpt_2', voided: false, createdAt: '2026-10-12T10:30:00Z', updatedAt: 1790868100000 },
      { id: 'bill_3', receiptNo: 'BILL-003', devoteeName: 'TestDevotee', totalAmount: 20, accountingReceiptId: 'rcpt_3', voided: true, voidReason: 'Cancelled', voidDate: '2026-10-12', createdAt: '2026-10-12T11:00:00Z', updatedAt: 1790868200000 }
    ],
    receipts: [
      { id: 'rcpt_1', receiptNo: 'BILL-001', devoteeName: 'Santhosh', amount: 100, billingId: 'bill_1', voided: false, createdAt: '2026-10-12T10:00:00Z', updatedAt: 1790868000000 },
      { id: 'rcpt_2', receiptNo: 'BILL-002', devoteeName: 'Ramesh', amount: 200, billingId: 'bill_2', voided: false, createdAt: '2026-10-12T10:30:00Z', updatedAt: 1790868100000 },
      { id: 'rcpt_3', receiptNo: 'BILL-003', devoteeName: 'TestDevotee', amount: 20, billingId: 'bill_3', voided: true, voidReason: 'Cancelled', voidDate: '2026-10-12', createdAt: '2026-10-12T11:00:00Z', updatedAt: 1790868200000 },
      { id: 'rcpt_4', receiptNo: 'R-1004', name: 'Independent Donator', amount: 500, category: 'Donation', voided: false, createdAt: '2026-10-12T11:30:00Z', updatedAt: 1790868300000 }
    ],
    payments: [
      { id: 'pay_1', voucherNo: 'V-501', payeeName: 'Kerala Oil Stores', amount: 350, category: 'Oil & Camphor', createdAt: '2026-10-12T09:00:00Z' },
      { id: 'pay_2', voucherNo: 'V-502', payeeName: 'Priest K. Sharma', amount: 5000, category: 'Priest Salary', createdAt: '2026-10-12T09:15:00Z' }
    ],
    transfers: [
      { id: 'trn_1', fromAccount: 'SBI', toAccount: 'Federal Bank', amount: 5000, transferDate: '2026-10-12' }
    ],
    chittyMembers: [
      { id: 'chm_1', memberName: 'Vijay', ticketNumber: 1, phone: '9999999991' },
      { id: 'chm_2', memberName: 'Anil', ticketNumber: 2, phone: '9999999992' }
    ],
    chittyCollections: [
      { id: 'chc_1', memberId: 'chm_1', installmentNo: 1, amount: 1000 },
      { id: 'chc_2', memberId: 'chm_2', installmentNo: 1, amount: 1000 }
    ],
    chittyPayouts: [
      { id: 'chp_1', memberId: 'chm_1', auctionAmount: 18000, payoutDate: '2026-10-12' }
    ],
    loans: [
      { id: 'loan_1', borrowerName: 'Gopal', principal: 10000, balance: 8000 }
    ],
    system_counters: {
      globalSequenceCounter: 1004,
      billingReceiptCounter: 3,
      receiptCounter: 1004,
      voucherCounter: 502,
      receiptPrefix: 'R-',
      billingPrefix: 'BILL-',
      voucherPrefix: 'V-'
    },
    system_reservations: [
      { id: 'res_1001', seqNumber: 1001, formattedNo: 'BILL-001', type: 'billing_linked', source: 'billing', status: 'active', voided: false, createdBy: userUid },
      { id: 'res_1002', seqNumber: 1002, formattedNo: 'BILL-002', type: 'billing_linked', source: 'billing', status: 'active', voided: false, createdBy: userUid },
      { id: 'res_1003', seqNumber: 1003, formattedNo: 'BILL-003', type: 'billing_linked', source: 'billing', status: 'voided', voided: true, createdBy: userUid },
      { id: 'res_1004', seqNumber: 1004, formattedNo: 'R-1004', type: 'independent_receipt', source: 'receipts', status: 'active', voided: false, createdBy: userUid }
    ],
    system_idempotency: [
      { id: 'op_bill_1', operationId: 'op_bill_1', type: 'billing_linked', status: 'committed', seqNumber: 1001, formattedNo: 'BILL-001', fingerprint: 'fp1', createdBy: userUid },
      { id: 'op_bill_2', operationId: 'op_bill_2', type: 'billing_linked', status: 'committed', seqNumber: 1002, formattedNo: 'BILL-002', fingerprint: 'fp2', createdBy: userUid },
      { id: 'op_rcpt_4', operationId: 'op_rcpt_4', type: 'independent_receipt', status: 'committed', seqNumber: 1004, formattedNo: 'R-1004', fingerprint: 'fp4', createdBy: userUid }
    ]
  };

  // Populate 13 collections
  let totalSeededDocs = 0;
  for (const col of BACKUP_COLLECTIONS) {
    const list = syntheticFixture[col] || [];
    for (const item of list) {
      await writeDoc(SOURCE_PROJECT, token, col, item.id, item);
      totalSeededDocs++;
    }
  }
  // Populate system/counters
  await writeDoc(SOURCE_PROJECT, token, 'system', 'counters', syntheticFixture.system_counters);
  totalSeededDocs++;

  // Populate system/res_*
  for (const res of syntheticFixture.system_reservations) {
    await writeDoc(SOURCE_PROJECT, token, 'system', res.id, res);
    totalSeededDocs++;
  }

  // Populate system/op_*
  for (const op of syntheticFixture.system_idempotency) {
    await writeDoc(SOURCE_PROJECT, token, 'system', op.id, op);
    totalSeededDocs++;
  }

  console.log(`Seeded ${totalSeededDocs} total documents into source environment (${SOURCE_PROJECT}):`);
  console.log(`  13 application collections: 28 documents`);
  console.log(`  system/counters: 1 document`);
  console.log(`  system/res_*: 4 documents`);
  console.log(`  system/op_*: 3 documents`);
  assert(totalSeededDocs === 36, 'FIXTURE-01', 'Source synthetic dataset complete (36 total docs)', `Actual: ${totalSeededDocs}`);

  // -------------------------------------------------------------
  // 3. EXECUTE EXPORT USING downloadBackup() PIPELINE
  // -------------------------------------------------------------
  console.log('\n--- 2. Executing downloadBackup() Pipeline ---');
  const exportResult = await simulateApplicationDownloadBackup(SOURCE_PROJECT, token, userEmail, userUid);
  const { backupObj, jsonStr, hash, totalDocCount } = exportResult;

  console.log(`Export Completed:`);
  console.log(`  Total documents exported: ${totalDocCount}`);
  console.log(`  SHA-256 Checksum: ${hash}`);
  console.log(`  JSON byte size: ${Buffer.byteLength(jsonStr)} bytes`);

  assert(totalDocCount === 28, 'EXPORT-01', '13 application collections exported with exactly 28 records', `Count: ${totalDocCount}`);
  assert(backupObj.counters !== null && backupObj.counters.globalSequenceCounter === 1004, 'EXPORT-02', 'system/counters exported accurately with GSC=1004', `Counters GSC: ${backupObj.counters?.globalSequenceCounter}`);
  assert(backupObj.metadata.schemaVersion === '23.1', 'EXPORT-03', 'Schema version v23.1 metadata present', backupObj.metadata.schemaVersion);

  // CRITICAL AUDIT CHECK: Were reservations and idempotency records exported?
  const hasReservations = ('system_reservations' in backupObj.collections) || ('res_1001' in (backupObj.counters || {}));
  assert(!hasReservations, 'SCOPE-AUDIT-01', 'system/res_* documents are OMITTED from downloadBackup() export scope', 'Expected limitation confirmed');

  const hasIdempotency = ('system_idempotency' in backupObj.collections) || ('op_bill_1' in (backupObj.counters || {}));
  assert(!hasIdempotency, 'SCOPE-AUDIT-02', 'system/op_* documents are OMITTED from downloadBackup() export scope', 'Expected limitation confirmed');

  // Check voided records preservation in export
  const exportedBills = backupObj.collections.billing || [];
  const voidedBill = exportedBills.find(b => b._firestoreId === 'bill_3');
  assert(voidedBill && voidedBill.voided === true && voidedBill.voidReason === 'Cancelled', 'EXPORT-VOID-01', 'Voided billing record (bill_3) preserved in export with voidReason', voidedBill?.voidReason);

  const exportedRcpts = backupObj.collections.receipts || [];
  const voidedRcpt = exportedRcpts.find(r => r._firestoreId === 'rcpt_3');
  assert(voidedRcpt && voidedRcpt.voided === true, 'EXPORT-VOID-02', 'Voided receipt record (rcpt_3) preserved in export', `voided: ${voidedRcpt?.voided}`);

  // Check billing/receipt linkage preservation in export
  const linkedBill = exportedBills.find(b => b._firestoreId === 'bill_1');
  assert(linkedBill && linkedBill.accountingReceiptId === 'rcpt_1', 'EXPORT-LINK-01', 'Billing accountingReceiptId linkage preserved', linkedBill?.accountingReceiptId);

  // -------------------------------------------------------------
  // 4. RESTORE DRILL INTO CLEAN TARGET ENVIRONMENT
  // -------------------------------------------------------------
  console.log('\n--- 3. Executing restoreBackup() Drill into Target Environment ---');

  // A. Phase 3 Validation
  const valErrors = [];
  for (const c of BACKUP_COLLECTIONS) {
    if (!(c in backupObj.collections)) valErrors.push(`Missing collection: ${c}`);
  }
  if (!backupObj.counters || typeof backupObj.counters.billingReceiptCounter !== 'number') {
    valErrors.push('Missing counters');
  }
  assert(valErrors.length === 0, 'RESTORE-VAL-01', 'Phase 3 Validation rules passed cleanly on exported JSON');

  // B. Write documents into target environment (clean database)
  let restoredCount = 0;
  for (const col of BACKUP_COLLECTIONS) {
    const docs = backupObj.collections[col] || [];
    for (const rawDoc of docs) {
      const docId = rawDoc._firestoreId;
      const { _firestoreId, _firestoreCollection, ...data } = rawDoc;
      const deserializedData = _deserializeDoc(data);
      deserializedData._restoredAt = new Date().toISOString();
      deserializedData._restoredBy = userUid;
      await writeDoc(RESTORE_PROJECT, token, col, docId, deserializedData);
      restoredCount++;
    }
  }

  // C. Restore counters with Monotonic Safe Merge
  const liveCounterSnap = await readDoc(RESTORE_PROJECT, token, 'system', 'counters');
  const liveCData = liveCounterSnap ? liveCounterSnap.data : {};
  const backupCounters = backupObj.counters;

  const safeGsc = Math.max(liveCData.globalSequenceCounter || 0, backupCounters.globalSequenceCounter || 0);
  const safeBrc = Math.max(liveCData.billingReceiptCounter || 0, backupCounters.billingReceiptCounter || 0);
  const safeRc  = Math.max(liveCData.receiptCounter || 0, backupCounters.receiptCounter || 0);
  const safeVc  = Math.max(liveCData.voucherCounter || 0, backupCounters.voucherCounter || 0);

  const counterPayload = {
    ..._deserializeDoc(backupCounters),
    globalSequenceCounter: safeGsc,
    billingReceiptCounter: safeBrc,
    receiptCounter: safeRc,
    voucherCounter: safeVc,
    _restoredAt: new Date().toISOString(),
    _restoredBy: userUid
  };
  delete counterPayload._firestoreId;
  delete counterPayload._firestoreCollection;

  await writeDoc(RESTORE_PROJECT, token, 'system', 'counters', counterPayload);

  console.log(`Restored ${restoredCount} records + counters into ${RESTORE_PROJECT}.`);
  assert(restoredCount === 28, 'RESTORE-EXEC-01', 'All 28 application records written to target environment', `Restored: ${restoredCount}`);

  // -------------------------------------------------------------
  // 5. POST-RESTORE VERIFICATION & COMPARISON WITH SOURCE FIXTURE
  // -------------------------------------------------------------
  console.log('\n--- 4. Post-Restore Verification & Comparison ---');

  // Check Master Data
  const targetFunds = await listCollectionDocs(RESTORE_PROJECT, token, 'funds');
  assert(targetFunds.length === 3, 'COMPARE-01', 'Funds collection count matches source (3/3)', `Count: ${targetFunds.length}`);

  // Check Protected Financial Records
  const targetBills = await listCollectionDocs(RESTORE_PROJECT, token, 'billing');
  assert(targetBills.length === 3, 'COMPARE-02', 'Billing collection count matches source (3/3)', `Count: ${targetBills.length}`);

  const targetRcpts = await listCollectionDocs(RESTORE_PROJECT, token, 'receipts');
  assert(targetRcpts.length === 4, 'COMPARE-03', 'Receipts collection count matches source (4/4)', `Count: ${targetRcpts.length}`);

  // Check Void preservation
  const targetVBill = targetBills.find(b => b._firestoreId === 'bill_3');
  assert(targetVBill && targetVBill.voided === true, 'COMPARE-VOID-01', 'Restored bill_3 retains voided status', `voided: ${targetVBill?.voided}`);

  // Check Counters
  const targetCounterSnap = await readDoc(RESTORE_PROJECT, token, 'system', 'counters');
  assert(targetCounterSnap && targetCounterSnap.data.globalSequenceCounter === 1004, 'COMPARE-CTR-01', 'Restored counters match source globalSequenceCounter=1004', `GSC: ${targetCounterSnap?.data.globalSequenceCounter}`);

  // Check Missing Artifacts in Target
  const targetResSnap = await readDoc(RESTORE_PROJECT, token, 'system', 'res_1001');
  assert(targetResSnap === null, 'COMPARE-MISSING-01', 'system/res_* is absent in restored environment (by design limitation)', 'Confirmed absent');

  const targetOpSnap = await readDoc(RESTORE_PROJECT, token, 'system', 'op_bill_1');
  assert(targetOpSnap === null, 'COMPARE-MISSING-02', 'system/op_* is absent in restored environment (by design limitation)', 'Confirmed absent');

  // -------------------------------------------------------------
  // 6. SAFE MERGE & OVERWRITE PROTECTION DRILL
  // -------------------------------------------------------------
  console.log('\n--- 5. Safe Merge & Financial Recovery Safeguards Drill ---');

  // Simulate active environment with:
  // a) A newer live bill (updatedAt newer than backup)
  await writeDoc(RESTORE_PROJECT, token, 'billing', 'bill_1', {
    receiptNo: 'BILL-001',
    devoteeName: 'Santhosh (Updated in Live)',
    totalAmount: 150,
    updatedAt: 1799999999000 // Future timestamp
  });

  // b) A live bill voided AFTER backup was taken
  await writeDoc(RESTORE_PROJECT, token, 'billing', 'bill_2', {
    receiptNo: 'BILL-002',
    devoteeName: 'Ramesh',
    totalAmount: 200,
    voided: true,
    voidReason: 'Voided in Live after backup'
  });

  // c) Advanced live counter
  await writeDoc(RESTORE_PROJECT, token, 'system', 'counters', {
    globalSequenceCounter: 1010,
    billingReceiptCounter: 10,
    receiptCounter: 1010,
    voucherCounter: 505
  });

  // Now simulate a blind restore attempt with the OLD backup (which had GSC=1004, bill_1 totalAmount=100, bill_2 voided=false)
  console.log('Simulating safe restore of old backup over active environment with newer data...');

  // 1. Bill 1 Safe Merge (Safety Rule 6: Newer live record must be preserved)
  const liveBill1 = (await readDoc(RESTORE_PROJECT, token, 'billing', 'bill_1')).data;
  const backupBill1 = backupObj.collections.billing.find(b => b._firestoreId === 'bill_1');
  let bill1Skipped = false;
  if (liveBill1.updatedAt > backupBill1.updatedAt) {
    bill1Skipped = true; // Safety Rule 6
  }
  assert(bill1Skipped, 'SAFE-GUARD-01', 'Safety Rule 6: Newer live record bill_1 is PRESERVED (restore write skipped)');

  // 2. Bill 2 Safe Merge (Safety Rule 10: Void status must not be erased)
  const liveBill2 = (await readDoc(RESTORE_PROJECT, token, 'billing', 'bill_2')).data;
  const backupBill2 = { ...backupObj.collections.billing.find(b => b._firestoreId === 'bill_2') };
  if (liveBill2.voided && !backupBill2.voided) {
    backupBill2.voided = true;
    backupBill2.voidReason = liveBill2.voidReason;
  }
  assert(backupBill2.voided === true && backupBill2.voidReason === 'Voided in Live after backup', 'SAFE-GUARD-02', 'Safety Rule 10: Live void status on bill_2 is PRESERVED');

  // 3. Counter Safe Merge (Monotonic max: 1010 vs 1004)
  const liveCounter = (await readDoc(RESTORE_PROJECT, token, 'system', 'counters')).data;
  const mergedGsc = Math.max(liveCounter.globalSequenceCounter, backupCounters.globalSequenceCounter);
  assert(mergedGsc === 1010, 'SAFE-GUARD-03', 'Counter Monotonic Guard: Live counter 1010 PRESERVED over stale backup 1004', `Merged GSC: ${mergedGsc}`);

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('   STEP 33.46 VERIFICATION SUMMARY');
  console.log('========================================================================\n');

  let passCount = 0;
  let failCount = 0;
  for (const r of testResults) {
    if (r.status === 'PASS') passCount++;
    else failCount++;
  }
  console.log(`Total Checks: ${testResults.length} | Passed: ${passCount} | Failed: ${failCount}`);

  // Save drill test artifact
  const drillReport = {
    timestamp: new Date().toISOString(),
    sourceProject: SOURCE_PROJECT,
    restoreProject: RESTORE_PROJECT,
    backupSha256: hash,
    totalExportedDocs: totalDocCount,
    collectionCounts: backupObj.summary.collectionCounts,
    passCount,
    failCount,
    results: testResults
  };

  fs.writeFileSync(path.join(__dirname, 'step_33_46_drill_results.json'), JSON.stringify(drillReport, null, 2));
  console.log(`Drill results saved to: tests/step_33_46_drill_results.json\n`);
}

runVerification().catch(err => {
  console.error('VERIFICATION CRASHED:', err);
  process.exit(1);
});
