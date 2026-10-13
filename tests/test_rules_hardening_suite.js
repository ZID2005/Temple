/**
 * test_rules_hardening_suite.js
 * STEP 33.7: Firestore Security Rules Hardening Automated Test Suite
 * 
 * Tests candidate rules (firestore.rules.candidate) against the local Firebase Emulator Suite
 * (Project: demo-temple-accounts-test).
 * 
 * Verifies:
 * 1. Unauthenticated access denied across all namespaces.
 * 2. Authenticated access to permitted application collections works.
 * 3. Physical deletion of protected financial records (billing, receipts) is denied.
 * 4. Settings deletion is strictly denied.
 * 5. System counters modification works for atomic counters, but physical deletion is denied.
 * 6. Access to unknown/unsupported collections is denied by default.
 * 7. Billing creation and linked receipt operations remain compatible.
 * 8. Void operations (update with void metadata) work without allowing physical deletion.
 * 9. Backup reading and restore write compatibility, plus documentation of deletion constraints.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'demo-temple-accounts-test';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const HUB_PORT = 4400;

const testResults = [];

function assert(condition, testId, description, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  testResults.push({ testId, description, status, details });
  const icon = condition ? '✅' : '❌';
  console.log(`${icon} [${status}] ${testId}: ${description} ${details ? '(' + details + ')' : ''}`);
  if (!condition) {
    console.error(`   ASSERTION FAILED: Expected condition not met. Details: ${details}`);
  }
}

function httpJsonRequest(port, path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch(e) { parsed = body; }
        resolve({ statusCode: res.statusCode, body: parsed, rawBody: body });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function setEmulatorRules(rulesContent) {
  const res = await httpJsonRequest(
    FIRESTORE_PORT,
    `/emulator/v1/projects/${PROJECT_ID}:securityRules`,
    'PUT',
    { rules: { files: [{ content: rulesContent }] } }
  );
  if (res.statusCode !== 200) {
    throw new Error(`Failed to load rules into emulator: HTTP ${res.statusCode} - ${JSON.stringify(res.body)}`);
  }
}

async function createAuthUser(email, password) {
  const res = await httpJsonRequest(
    AUTH_PORT,
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test-key',
    'POST',
    { email, password, returnSecureToken: true }
  );
  if (res.statusCode !== 200 || !res.body.idToken) {
    throw new Error(`Failed to create test user in Auth Emulator: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

function fsDocPath(docPath) {
  return `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`;
}

async function runTestSuite() {
  console.log('\n========================================================================');
  console.log('   STEP 33.7: FIRESTORE SECURITY RULES HARDENING VERIFICATION SUITE');
  console.log('   Target Project: ' + PROJECT_ID);
  console.log('========================================================================\n');

  // Environment Check
  console.log('--- Environment & Air-Gap Verification ---');
  assert(PROJECT_ID.startsWith('demo-'), 'ENV-01', 'Air-gapped demo project ID verified', PROJECT_ID);

  const hubRes = await httpJsonRequest(HUB_PORT, '/emulators');
  assert(hubRes.statusCode === 200 && hubRes.body.firestore && hubRes.body.auth, 'ENV-02', 'Emulator suite active on ports 8080 & 9099');

  // Load Candidate Rules
  console.log('\n--- Loading Candidate Rules into Emulator ---');
  const candidateRulesPath = (fs.existsSync(path.join(__dirname, 'firestore.rules.candidate')) ? path.join(__dirname, 'firestore.rules.candidate') : path.join(__dirname, '..', 'firestore.rules.candidate'));
  const candidateRules = fs.readFileSync(candidateRulesPath, 'utf8');
  await setEmulatorRules(candidateRules);
  console.log('Candidate rules successfully loaded into memory.');

  // Create Synthetic Test User
  const testUser = await createAuthUser(`auditor_${Date.now()}@demo.local`, 'SyntheticPassword123!');
  const token = testUser.idToken;
  const userUid = testUser.localId;
  console.log(`Synthetic test user created (UID: ${userUid}).`);

  const authHeader = { 'Authorization': `Bearer ${token}` };

  // =========================================================================
  // SUITE 1: Unauthenticated Reads & Writes Denied
  // =========================================================================
  console.log('\n--- Suite 1: Unauthenticated Reads & Writes Denied ---');
  {
    const r1 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('settings/set_1'), 'GET');
    assert(r1.statusCode === 403, 'TC-1.1', 'Unauthenticated GET /settings/set_1 is denied (HTTP 403)', `Status: ${r1.statusCode}`);

    const r2 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('receipts/rcpt_1'), 'GET');
    assert(r2.statusCode === 403, 'TC-1.2', 'Unauthenticated GET /receipts/rcpt_1 is denied (HTTP 403)', `Status: ${r2.statusCode}`);

    const r3 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('billing/bill_1'), 'GET');
    assert(r3.statusCode === 403, 'TC-1.3', 'Unauthenticated GET /billing/bill_1 is denied (HTTP 403)', `Status: ${r3.statusCode}`);

    const r4 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('system/counters'), 'GET');
    assert(r4.statusCode === 403, 'TC-1.4', 'Unauthenticated GET /system/counters is denied (HTTP 403)', `Status: ${r4.statusCode}`);

    const r5 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('funds/fund_1'), 'PATCH', { fields: { name: { stringValue: 'Unauth' } } });
    assert(r5.statusCode === 403, 'TC-1.5', 'Unauthenticated PATCH /funds/fund_1 is denied (HTTP 403)', `Status: ${r5.statusCode}`);

    const r6 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('billing/bill_unauth'), 'PATCH', { fields: { amount: { integerValue: 500 } } });
    assert(r6.statusCode === 403, 'TC-1.6', 'Unauthenticated write /billing/bill_unauth is denied (HTTP 403)', `Status: ${r6.statusCode}`);

    const r7 = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('settings/set_unauth'), 'DELETE');
    assert(r7.statusCode === 403, 'TC-1.7', 'Unauthenticated DELETE /settings/set_unauth is denied (HTTP 403)', `Status: ${r7.statusCode}`);
  }

  // =========================================================================
  // SUITE 2: Authenticated Access to Permitted Application Collections
  // =========================================================================
  console.log('\n--- Suite 2: Authenticated Access to Permitted Collections ---');
  const permittedCollections = [
    'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts',
    'payments', 'transfers', 'loans', 'chittyMembers', 'chittyCollections', 'chittyPayouts'
  ];

  for (const col of permittedCollections) {
    const docId = `doc_${col}_test`;
    // Create / write
    const writeRes = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`${col}/${docId}`),
      'PATCH',
      { fields: { testField: { stringValue: `val_${col}` } } },
      authHeader
    );
    assert(writeRes.statusCode === 200, `TC-2.1-${col}`, `Authenticated write to /${col}/${docId} succeeds (HTTP 200)`, `Status: ${writeRes.statusCode}`);

    // Read
    const readRes = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`${col}/${docId}`), 'GET', null, authHeader);
    assert(readRes.statusCode === 200, `TC-2.2-${col}`, `Authenticated read from /${col}/${docId} succeeds (HTTP 200)`, `Status: ${readRes.statusCode}`);

    // Delete (operational collections permit deletion)
    const delRes = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`${col}/${docId}`), 'DELETE', null, authHeader);
    assert(delRes.statusCode === 200, `TC-2.3-${col}`, `Authenticated delete from /${col}/${docId} succeeds (HTTP 200)`, `Status: ${delRes.statusCode}`);
  }

  // Diagnostics rule match vs Firestore engine reserved namespace check:
  {
    const diagRes = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath('__system_diagnostics__/diag_1'),
      'GET',
      null,
      authHeader
    );
    // Firestore engine natively reserves '__*__' collection names (HTTP 400 INVALID_ARGUMENT: Collection id is reserved)
    assert(diagRes.statusCode === 400 && diagRes.body.error && diagRes.body.error.message.includes('reserved'), 'TC-2.4-reserved', 'Firestore engine enforces reserved collection constraint on /__system_diagnostics__ (HTTP 400)', diagRes.body.error ? diagRes.body.error.message : '');
  }

  // Migration staging namespace
  {
    const stagingRes = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath('migration_staging/mig_test/sub_manifest/item_1'),
      'PATCH',
      { fields: { step: { integerValue: 1 } } },
      authHeader
    );
    assert(stagingRes.statusCode === 200, 'TC-2.4-staging', 'Authenticated access to /migration_staging subcollection succeeds (HTTP 200)', `Status: ${stagingRes.statusCode}`);
  }

  // =========================================================================
  // SUITE 3: Physical Deletion of Protected Financial Records is Denied
  // =========================================================================
  console.log('\n--- Suite 3: Physical Deletion of Financial Records Denied ---');
  {
    // Billing document
    const billDocId = 'bill_protect_test';
    const createBill = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`billing/${billDocId}`),
      'PATCH',
      { fields: { billNo: { stringValue: 'BILL-9999' }, amount: { integerValue: 250 } } },
      authHeader
    );
    assert(createBill.statusCode === 200, 'TC-3.1', 'Authenticated create of /billing doc succeeds (HTTP 200)');

    const deleteBill = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`billing/${billDocId}`), 'DELETE', null, authHeader);
    assert(deleteBill.statusCode === 403, 'TC-3.2', 'Physical DELETE of /billing doc is DENIED (HTTP 403)', `Status: ${deleteBill.statusCode}`);

    const verifyBillExists = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`billing/${billDocId}`), 'GET', null, authHeader);
    assert(verifyBillExists.statusCode === 200, 'TC-3.3', 'Financial billing record remains intact in Firestore', `Status: ${verifyBillExists.statusCode}`);

    // Receipts document
    const rcptDocId = 'rcpt_protect_test';
    const createRcpt = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`receipts/${rcptDocId}`),
      'PATCH',
      { fields: { receiptNo: { stringValue: 'R-9999' }, amount: { integerValue: 250 } } },
      authHeader
    );
    assert(createRcpt.statusCode === 200, 'TC-3.4', 'Authenticated create of /receipts doc succeeds (HTTP 200)');

    const deleteRcpt = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`receipts/${rcptDocId}`), 'DELETE', null, authHeader);
    assert(deleteRcpt.statusCode === 403, 'TC-3.5', 'Physical DELETE of /receipts doc is DENIED (HTTP 403)', `Status: ${deleteRcpt.statusCode}`);

    const verifyRcptExists = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`receipts/${rcptDocId}`), 'GET', null, authHeader);
    assert(verifyRcptExists.statusCode === 200, 'TC-3.6', 'Financial receipt record remains intact in Firestore', `Status: ${verifyRcptExists.statusCode}`);
  }

  // =========================================================================
  // SUITE 4: Settings Deletion is Denied (Shadowing Bug Fixed)
  // =========================================================================
  console.log('\n--- Suite 4: Settings Deletion Denied (Shadowing Fix) ---');
  {
    const setDocId = 'set_protect_test';
    const createSet = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`settings/${setDocId}`),
      'PATCH',
      { fields: { templeName: { stringValue: 'Audit Temple' }, receiptPrefix: { stringValue: 'R-' } } },
      authHeader
    );
    assert(createSet.statusCode === 200, 'TC-4.1', 'Authenticated create /settings doc succeeds (HTTP 200)');

    const updateSet = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`settings/${setDocId}`),
      'PATCH',
      { fields: { templeName: { stringValue: 'Updated Audit Temple' } } },
      authHeader
    );
    assert(updateSet.statusCode === 200, 'TC-4.2', 'Authenticated update /settings doc succeeds (HTTP 200)');

    const deleteSet = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`settings/${setDocId}`), 'DELETE', null, authHeader);
    assert(deleteSet.statusCode === 403, 'TC-4.3', 'Physical DELETE /settings doc is strictly DENIED (HTTP 403) - Shadowing fixed!', `Status: ${deleteSet.statusCode}`);

    const verifySet = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`settings/${setDocId}`), 'GET', null, authHeader);
    assert(verifySet.statusCode === 200, 'TC-4.4', 'Settings document preserved in database', `Status: ${verifySet.statusCode}`);
  }

  // =========================================================================
  // SUITE 5: System Counters Protection & Mutation
  // =========================================================================
  console.log('\n--- Suite 5: System Counters Protection ---');
  {
    // Counters create/update by authenticated client
    const updateCounters = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath('system/counters'),
      'PATCH',
      { fields: { billingReceiptCounter: { integerValue: 12 }, receiptCounter: { integerValue: 1018 }, voucherCounter: { integerValue: 501 } } },
      authHeader
    );
    assert(updateCounters.statusCode === 200, 'TC-5.1', 'Authenticated update /system/counters succeeds (HTTP 200)');

    const readCounters = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('system/counters'), 'GET', null, authHeader);
    assert(readCounters.statusCode === 200, 'TC-5.2', 'Authenticated read /system/counters succeeds (HTTP 200)');

    // Counters deletion MUST be blocked
    const deleteCounters = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('system/counters'), 'DELETE', null, authHeader);
    assert(deleteCounters.statusCode === 403, 'TC-5.3', 'Physical DELETE of /system/counters is DENIED (HTTP 403)', `Status: ${deleteCounters.statusCode}`);

    const verifyCounters = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('system/counters'), 'GET', null, authHeader);
    assert(verifyCounters.statusCode === 200, 'TC-5.4', 'Counters document intact in database', `Status: ${verifyCounters.statusCode}`);
  }

  // =========================================================================
  // SUITE 6: Unknown / Unsupported Collections Denied by Default
  // =========================================================================
  console.log('\n--- Suite 6: Unknown Collections Denied by Default ---');
  {
    const badCol = 'arbitrary_unauthorized_collection';
    const rRead = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`${badCol}/doc1`), 'GET', null, authHeader);
    assert(rRead.statusCode === 403, 'TC-6.1', `Authenticated read to unknown collection /${badCol} is DENIED (HTTP 403)`, `Status: ${rRead.statusCode}`);

    const rWrite = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`${badCol}/doc1`), 'PATCH', { fields: { hacked: { booleanValue: true } } }, authHeader);
    assert(rWrite.statusCode === 403, 'TC-6.2', `Authenticated write to unknown collection /${badCol} is DENIED (HTTP 403)`, `Status: ${rWrite.statusCode}`);

    const rDelete = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`${badCol}/doc1`), 'DELETE', null, authHeader);
    assert(rDelete.statusCode === 403, 'TC-6.3', `Authenticated delete to unknown collection /${badCol} is DENIED (HTTP 403)`, `Status: ${rDelete.statusCode}`);

    const rAdmin = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('admin_roles/user1'), 'PATCH', { fields: { role: { stringValue: 'admin' } } }, authHeader);
    assert(rAdmin.statusCode === 403, 'TC-6.4', 'Privileged fake collection /admin_roles is DENIED (HTTP 403)', `Status: ${rAdmin.statusCode}`);
  }

  // =========================================================================
  // SUITE 7: Billing Creation and Linked Receipt Operations Compatibility
  // =========================================================================
  console.log('\n--- Suite 7: Billing Creation & Linked Receipt Operations ---');
  {
    const bId = 'bill_linked_test_101';
    const rId = 'rcpt_linked_test_101';

    // 1. Write bill
    const wBill = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`billing/${bId}`),
      'PATCH',
      {
        fields: {
          receiptNo: { stringValue: 'BILL-0101' },
          devoteeName: { stringValue: 'Devotee Test' },
          totalAmount: { integerValue: 350 },
          accountingReceiptId: { stringValue: rId },
          accountingReceiptNo: { stringValue: 'R-1101' },
          voided: { booleanValue: false }
        }
      },
      authHeader
    );
    assert(wBill.statusCode === 200, 'TC-7.1', 'Billing record write with cross-link metadata succeeds (HTTP 200)');

    // 2. Write linked receipt
    const wRcpt = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`receipts/${rId}`),
      'PATCH',
      {
        fields: {
          receiptNo: { stringValue: 'R-1101' },
          person: { stringValue: 'Devotee Test' },
          amount: { integerValue: 350 },
          source: { stringValue: 'billing' },
          billingFirestoreId: { stringValue: bId },
          billingReceiptNo: { stringValue: 'BILL-0101' },
          voided: { booleanValue: false }
        }
      },
      authHeader
    );
    assert(wRcpt.statusCode === 200, 'TC-7.2', 'Accounting receipt write with billing link metadata succeeds (HTTP 200)');
  }

  // =========================================================================
  // SUITE 8: Void Operations Work Without Allowing Physical Deletion
  // =========================================================================
  console.log('\n--- Suite 8: Void Operations Compatibility ---');
  {
    const bId = 'bill_linked_test_101';
    const rId = 'rcpt_linked_test_101';

    // 1. Void billing record (update with void fields)
    const voidBill = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`billing/${bId}`),
      'PATCH',
      {
        fields: {
          voided: { booleanValue: true },
          voidReason: { stringValue: 'Devotee cancellation test' },
          voidDate: { stringValue: '2026-10-10' },
          updatedBy: { stringValue: userUid }
        }
      },
      authHeader
    );
    assert(voidBill.statusCode === 200, 'TC-8.1', 'Void update on Billing record succeeds (HTTP 200)');

    // 2. Void linked receipt (update with void fields)
    const voidRcpt = await httpJsonRequest(
      FIRESTORE_PORT,
      fsDocPath(`receipts/${rId}`),
      'PATCH',
      {
        fields: {
          voided: { booleanValue: true },
          voidReason: { stringValue: 'Devotee cancellation test' },
          voidDate: { stringValue: '2026-10-10' },
          updatedBy: { stringValue: userUid }
        }
      },
      authHeader
    );
    assert(voidRcpt.statusCode === 200, 'TC-8.2', 'Void update on Linked Receipt succeeds (HTTP 200)');

    // 3. Physical delete on either voided record is blocked
    const delVoidBill = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`billing/${bId}`), 'DELETE', null, authHeader);
    assert(delVoidBill.statusCode === 403, 'TC-8.3', 'Physical delete of voided billing record is DENIED (HTTP 403)');

    const delVoidRcpt = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`receipts/${rId}`), 'DELETE', null, authHeader);
    assert(delVoidRcpt.statusCode === 403, 'TC-8.4', 'Physical delete of voided receipt record is DENIED (HTTP 403)');

    // 4. Verify voided state remains intact
    const verifyVBill = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`billing/${bId}`), 'GET', null, authHeader);
    assert(verifyVBill.statusCode === 200 && verifyVBill.body.fields.voided.booleanValue === true, 'TC-8.5', 'Billing voided flag verified true in Firestore');

    const verifyVRcpt = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`receipts/${rId}`), 'GET', null, authHeader);
    assert(verifyVRcpt.statusCode === 200 && verifyVRcpt.body.fields.voided.booleanValue === true, 'TC-8.6', 'Receipt voided flag verified true in Firestore');
  }

  // =========================================================================
  // SUITE 9: Backup & Restore Policy Compatibility
  // =========================================================================
  console.log('\n--- Suite 9: Backup & Restore Compatibility ---');
  {
    // Backup: read all 13 production collections + counters
    const backupCols = [
      'settings', 'funds', 'incomeCategories', 'expenseCategories', 'bankAccounts',
      'billing', 'receipts', 'payments', 'transfers',
      'chittyMembers', 'chittyCollections', 'chittyPayouts', 'loans'
    ];

    let allReadsPassed = true;
    for (const c of backupCols) {
      const res = await httpJsonRequest(FIRESTORE_PORT, fsDocPath(`${c}/dummy_probe`), 'GET', null, authHeader);
      // Status should be 404 (document not found) or 200, but NEVER 403 (permission denied)
      if (res.statusCode === 403) {
        allReadsPassed = false;
        console.error(`Read failed with 403 for collection: ${c}`);
      }
    }
    const cRes = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('system/counters'), 'GET', null, authHeader);
    if (cRes.statusCode === 403) allReadsPassed = false;

    assert(allReadsPassed, 'TC-9.1', 'Backup pipeline reads authorized across all 13 collections and system/counters');

    // Restore set operations (writing docs):
    const rSetSettings = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('settings/set_restore_test'), 'PATCH', { fields: { restored: { booleanValue: true } } }, authHeader);
    assert(rSetSettings.statusCode === 200, 'TC-9.2', 'Restore write to /settings succeeds (HTTP 200)');

    const rSetCounters = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('system/counters'), 'PATCH', { fields: { _restoredAt: { stringValue: '2026-10-10' } } }, authHeader);
    assert(rSetCounters.statusCode === 200, 'TC-9.3', 'Restore write to /system/counters succeeds (HTTP 200)');

    const rSetBilling = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('billing/bill_restore_test'), 'PATCH', { fields: { restored: { booleanValue: true } } }, authHeader);
    assert(rSetBilling.statusCode === 200, 'TC-9.4', 'Restore write to /billing succeeds (HTTP 200)');

    // Restore deletion limitation test:
    // If restore attempts to delete an un-backed-up billing or receipts doc, rules will block it.
    const rDelBilling = await httpJsonRequest(FIRESTORE_PORT, fsDocPath('billing/bill_restore_test'), 'DELETE', null, authHeader);
    assert(rDelBilling.statusCode === 403, 'TC-9.5', 'Restore pruning deletion of /billing is blocked by design (HTTP 403 - Non-destructive audit guard)');
  }

  // Restore Original Rules to Emulator
  console.log('\n--- Restoring Baseline firestore.rules to Emulator ---');
  const originalRulesPath = (fs.existsSync(path.join(__dirname, 'firestore.rules')) ? path.join(__dirname, 'firestore.rules') : path.join(__dirname, '..', 'firestore.rules'));
  const originalRules = fs.readFileSync(originalRulesPath, 'utf8');
  await setEmulatorRules(originalRules);
  console.log('Baseline firestore.rules reloaded into emulator memory.');

  // Summary
  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;
  console.log('\n========================================================================');
  console.log(`   TEST EXECUTION COMPLETE: ${passCount} PASSED / ${failCount} FAILED (${testResults.length} TOTAL)`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
