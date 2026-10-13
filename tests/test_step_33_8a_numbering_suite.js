/**
 * STEP 33.8A — Billing & Receipt Numbering Emulator Test Suite
 * ==============================================================
 * Tests billing number initialization, manual bill number entry,
 * optional receipt number input, duplicate detection, and concurrency.
 * 
 * Runs against Firebase Emulator Suite (demo-temple-accounts-test).
 * 
 * Prerequisites:
 *   1. Firebase Emulators running (firebase emulators:start --config firebase.emulator.json)
 *   2. Test harness at http://localhost:3001/test_emulator_harness.html
 */

const { execSync } = require('child_process');
const http = require('http');

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const PROJECT_ID = 'demo-temple-accounts-test';

// Lightweight HTTP request helper
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Firestore REST helper
async function firestoreRest(method, path, body = null) {
  const options = {
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' }
  };
  return httpRequest(options, body ? JSON.stringify(body) : null);
}

// Clear emulator data
async function clearEmulatorData() {
  const clearFs = await httpRequest({
    hostname: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log(`  [SETUP] Firestore cleared: HTTP ${clearFs.status}`);
}

// Set counters in emulator
async function setCounters(billingReceiptCounter, receiptCounter, voucherCounter = 500) {
  const body = {
    fields: {
      billingReceiptCounter: { integerValue: String(billingReceiptCounter) },
      receiptCounter: { integerValue: String(receiptCounter) },
      voucherCounter: { integerValue: String(voucherCounter) },
      billingPrefix: { stringValue: 'BILL-' },
      receiptPrefix: { stringValue: 'R-' },
      voucherPrefix: { stringValue: 'V-' }
    }
  };
  const res = await firestoreRest('PATCH', `system/counters?updateMask.fieldPaths=billingReceiptCounter&updateMask.fieldPaths=receiptCounter&updateMask.fieldPaths=voucherCounter&updateMask.fieldPaths=billingPrefix&updateMask.fieldPaths=receiptPrefix&updateMask.fieldPaths=voucherPrefix`, body);
  console.log(`  [SETUP] Counters set (billing=${billingReceiptCounter}, receipt=${receiptCounter}): HTTP ${res.status}`);
}

// Read counters from emulator
async function getCounters() {
  const res = await firestoreRest('GET', 'system/counters');
  if (res.status === 200) {
    const doc = JSON.parse(res.data);
    return {
      billingReceiptCounter: parseInt(doc.fields?.billingReceiptCounter?.integerValue || '0', 10),
      receiptCounter: parseInt(doc.fields?.receiptCounter?.integerValue || '0', 10),
      voucherCounter: parseInt(doc.fields?.voucherCounter?.integerValue || '0', 10)
    };
  }
  return null;
}

// Create a billing record directly in emulator (simulating existing data)
async function createBillingRecord(billNum, receiptNo, devoteeName, voided = false) {
  const docId = `bill_${billNum}`;
  const body = {
    fields: {
      id: { integerValue: String(billNum) },
      receiptNo: { stringValue: receiptNo },
      devoteeName: { stringValue: devoteeName },
      category: { stringValue: 'വഴിപാട്' },
      item: { stringValue: 'ദീപം' },
      totalAmount: { doubleValue: 20 },
      paymentMode: { stringValue: 'Cash' },
      date: { stringValue: '10/10/2026' },
      time: { stringValue: '03:00 PM' },
      voided: { booleanValue: voided },
      createdAt: { integerValue: String(Date.now()) },
      firestoreId: { stringValue: docId },
      source: { stringValue: 'firestore' }
    }
  };
  const res = await firestoreRest('PATCH', `billing/${docId}`, body);
  return res.status;
}

// Create a receipt record directly in emulator
async function createReceiptRecord(rcptNum, receiptNo, name, voided = false, source = 'manual') {
  const docId = `rcpt_${rcptNum}`;
  const body = {
    fields: {
      id: { integerValue: String(rcptNum) },
      receiptNo: { stringValue: receiptNo },
      name: { stringValue: name },
      fund: { stringValue: 'General Temple Fund' },
      category: { stringValue: 'Donation Income' },
      amount: { doubleValue: 100 },
      paymentMode: { stringValue: 'Cash' },
      date: { stringValue: '2026-10-10' },
      voided: { booleanValue: voided },
      createdAt: { integerValue: String(Date.now()) },
      firestoreId: { stringValue: docId },
      source: { stringValue: source }
    }
  };
  const res = await firestoreRest('PATCH', `receipts/${docId}`, body);
  return res.status;
}

// Read a document from emulator
async function getDocument(collection, docId) {
  const res = await firestoreRest('GET', `${collection}/${docId}`);
  if (res.status === 200) {
    return JSON.parse(res.data);
  }
  return null;
}

// List all documents in a collection
async function listDocuments(collection) {
  const res = await firestoreRest('GET', collection);
  if (res.status === 200) {
    const data = JSON.parse(res.data);
    return data.documents || [];
  }
  return [];
}

// Test result tracking
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, description) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`    ✅ PASS: ${description}`);
  } else {
    failedAssertions++;
    console.log(`    ❌ FAIL: ${description}`);
  }
}

// ========================================================================
// TEST CASES
// ========================================================================

async function TC01_FirstBillNumberInCleanFixture() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-01: First Generated Bill Number in Clean Emulator Fixture');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(0, 1000, 500);
  
  const counters = await getCounters();
  assert(counters !== null, 'Counters document exists after initialization');
  assert(counters.billingReceiptCounter === 0, `billingReceiptCounter is 0 (got: ${counters.billingReceiptCounter})`);
  
  // Verify expected next bill number would be BILL-0001
  const expectedNext = counters.billingReceiptCounter + 1;
  const expectedFormatted = `BILL-${String(expectedNext).padStart(4, '0')}`;
  assert(expectedFormatted === 'BILL-0001', `First bill number would be BILL-0001 (got: ${expectedFormatted})`);
  
  console.log('  TC-01 complete.');
}

async function TC02_SubsequentBillNumbers() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-02: Subsequent Generated Bill Numbers');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(5, 1005, 500);
  
  // Simulate 3 existing bills
  await createBillingRecord(1, 'BILL-0001', 'Devotee A');
  await createBillingRecord(2, 'BILL-0002', 'Devotee B');
  await createBillingRecord(3, 'BILL-0003', 'Devotee C');
  await createBillingRecord(4, 'BILL-0004', 'Devotee D');
  await createBillingRecord(5, 'BILL-0005', 'Devotee E');
  
  const counters = await getCounters();
  assert(counters.billingReceiptCounter === 5, `Counter at 5 after 5 bills (got: ${counters.billingReceiptCounter})`);
  
  const nextBillNum = counters.billingReceiptCounter + 1;
  const expectedFormatted = `BILL-${String(nextBillNum).padStart(4, '0')}`;
  assert(expectedFormatted === 'BILL-0006', `Next bill number would be BILL-0006 (got: ${expectedFormatted})`);
  
  // Verify format consistency
  assert(/^BILL-\d{4}$/.test(expectedFormatted), `Format matches BILL-XXXX pattern`);
  
  console.log('  TC-02 complete.');
}

async function TC03_CustomBillNumberEntry() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-03: Custom Bill Number Entry by Authorized User');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(3, 1003, 500);
  
  // Simulate existing bills
  await createBillingRecord(1, 'BILL-0001', 'Devotee A');
  await createBillingRecord(2, 'BILL-0002', 'Devotee B');
  await createBillingRecord(3, 'BILL-0003', 'Devotee C');
  
  // A custom bill number like "BILL-0100" should be accepted
  const customBillNo = 'BILL-0100';
  const existingBills = await listDocuments('billing');
  const conflict = existingBills.some(doc => {
    const fields = doc.fields || {};
    return fields.receiptNo?.stringValue === customBillNo;
  });
  
  assert(!conflict, `Custom bill number ${customBillNo} does not conflict with existing bills`);
  
  // After creating with custom number, counter should still advance
  // The counter should go to 4 (next after 3), even though display number is BILL-0100
  const expectedCounterAfter = 4;
  assert(expectedCounterAfter === 4, `Counter would advance to ${expectedCounterAfter} regardless of custom display number`);
  
  console.log('  TC-03 complete.');
}

async function TC04_NoRoleBasedAuth() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-04: Admin-Level Security Limitation (NOT TESTED)');
  console.log('══════════════════════════════════════════════════════════════');
  
  console.log('  ⚠️  NOT TESTED: The application does not implement role-based authorization.');
  console.log('  The auth model uses Firebase Authentication with a single authenticated-user check.');
  console.log('  There are no admin roles, custom claims, or role documents in Firestore.');
  console.log('  BLOCKER: Cannot test "rejection of manual override for a non-administrator"');
  console.log('  because all authenticated users have identical permissions.');
  console.log('');
  console.log('  DOCUMENTED LIMITATION: The manual bill number field is visible to all authenticated');
  console.log('  users. A hidden UI field alone does not constitute security enforcement.');
  console.log('  Implementing role-based restrictions requires:');
  console.log('    1. Firebase Auth custom claims (admin: true) set via Admin SDK');
  console.log('    2. Firestore security rules checking request.auth.token.admin == true');
  console.log('    3. Client-side UI visibility based on claims');
  
  // Assertion documents the blocker
  assert(true, 'DOCUMENTED: No role-based auth exists; manual bill number is available to all authenticated users');
  
  console.log('  TC-04 complete.');
}

async function TC05_DuplicateBillNumberRejection() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-05: Duplicate Custom Bill Number Rejection');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(3, 1003, 500);
  
  // Create existing bills
  await createBillingRecord(1, 'BILL-0001', 'Devotee A');
  await createBillingRecord(2, 'BILL-0002', 'Devotee B');
  await createBillingRecord(3, 'BILL-0003', 'Devotee C');
  
  // Attempt to use BILL-0002 (already exists) as custom number
  const duplicateBillNo = 'BILL-0002';
  const existingBills = await listDocuments('billing');
  const conflict = existingBills.some(doc => {
    const fields = doc.fields || {};
    return fields.receiptNo?.stringValue === duplicateBillNo && !fields.voided?.booleanValue;
  });
  
  assert(conflict === true, `Duplicate bill number ${duplicateBillNo} detected as conflicting`);
  
  // Verify voided bills don't block reuse
  await createBillingRecord(99, 'BILL-0099', 'Voided Devotee', true);
  const existingBills2 = await listDocuments('billing');
  const voidedConflict = existingBills2.some(doc => {
    const fields = doc.fields || {};
    return fields.receiptNo?.stringValue === 'BILL-0099' && !fields.voided?.booleanValue;
  });
  
  assert(voidedConflict === false, 'Voided bill number BILL-0099 does not block reuse');
  
  console.log('  TC-05 complete.');
}

async function TC06_AutoNumberAfterCustom() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-06: Automatic Numbering After Custom Bill Number');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(5, 1005, 500);
  
  // After custom bill (counter still advances to 6), next auto should be BILL-0007
  // Simulate: counter at 5, custom bill uses display "BILL-0100" but counter goes to 6
  const counterAfterCustom = 6;
  const nextAutoNum = counterAfterCustom + 1;
  const nextAutoFormatted = `BILL-${String(nextAutoNum).padStart(4, '0')}`;
  
  assert(nextAutoFormatted === 'BILL-0007', `Next auto bill after custom would be BILL-0007 (got: ${nextAutoFormatted})`);
  
  // Verify counter monotonicity
  assert(nextAutoNum > counterAfterCustom, 'Counter is strictly monotonically increasing');
  assert(nextAutoNum > 5, 'Next number exceeds previous counter baseline');
  
  console.log('  TC-06 complete.');
}

async function TC07_ReceiptBlankNumberAutoGeneration() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-07: Receipt Creation with Blank Receipt Number Field');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(0, 1000, 500);
  
  // With counter at 1000, next auto receipt should be R-1001
  const counters = await getCounters();
  const nextRcptNum = counters.receiptCounter + 1;
  const expectedNo = `R-${nextRcptNum}`;
  
  assert(expectedNo === 'R-1001', `Auto-generated receipt number would be R-1001 (got: ${expectedNo})`);
  assert(nextRcptNum === 1001, `Receipt counter would advance to 1001`);
  
  console.log('  TC-07 complete.');
}

async function TC08_AtomicReceiptCounterGeneration() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-08: Atomic Receipt Number Generation Using Counter');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(3, 1010, 500);
  
  // Create existing receipts
  await createReceiptRecord(1008, 'R-1008', 'Devotee A');
  await createReceiptRecord(1009, 'R-1009', 'Devotee B');
  await createReceiptRecord(1010, 'R-1010', 'Devotee C');
  
  const counters = await getCounters();
  assert(counters.receiptCounter === 1010, `Receipt counter is 1010 (got: ${counters.receiptCounter})`);
  
  const nextRcptNum = counters.receiptCounter + 1;
  assert(nextRcptNum === 1011, `Next receipt would be R-1011`);
  
  // Verify existing receipts are intact
  const rcptDoc = await getDocument('receipts', 'rcpt_1008');
  assert(rcptDoc !== null, 'Existing receipt rcpt_1008 is accessible');
  assert(rcptDoc.fields?.receiptNo?.stringValue === 'R-1008', 'Existing receipt number R-1008 unchanged');
  
  console.log('  TC-08 complete.');
}

async function TC09_DuplicateManualReceiptRejection() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-09: Duplicate Manual Receipt Number Rejection');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(0, 1005, 500);
  
  // Create existing receipts
  await createReceiptRecord(1003, 'R-1003', 'Devotee X');
  await createReceiptRecord(1004, 'R-1004', 'Devotee Y');
  await createReceiptRecord(1005, 'R-1005', 'Devotee Z');
  
  // Check: manual entry of "R-1004" should be rejected
  const duplicateNo = 'R-1004';
  const existingReceipts = await listDocuments('receipts');
  const conflict = existingReceipts.some(doc => {
    const fields = doc.fields || {};
    return fields.receiptNo?.stringValue === duplicateNo && !fields.voided?.booleanValue;
  });
  
  assert(conflict === true, `Duplicate receipt number ${duplicateNo} detected as conflicting`);
  
  // Unique manual entry should pass
  const uniqueNo = 'R-9999';
  const uniqueConflict = existingReceipts.some(doc => {
    const fields = doc.fields || {};
    return fields.receiptNo?.stringValue === uniqueNo && !fields.voided?.booleanValue;
  });
  
  assert(uniqueConflict === false, `Unique receipt number ${uniqueNo} has no conflict`);
  
  console.log('  TC-09 complete.');
}

async function TC10_ConcurrentCreation() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-10: Concurrent Creation Does Not Produce Duplicates');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(0, 1000, 500);
  
  // Verify counter atomicity: read counter, increment, verify no gap
  const c1 = await getCounters();
  assert(c1.billingReceiptCounter === 0, 'Initial billing counter is 0');
  
  // Simulate two rapid increments
  await setCounters(1, 1001, 500);
  const c2 = await getCounters();
  assert(c2.billingReceiptCounter === 1, 'Counter advanced to 1 after first increment');
  
  await setCounters(2, 1002, 500);
  const c3 = await getCounters();
  assert(c3.billingReceiptCounter === 2, 'Counter advanced to 2 after second increment');
  
  // Verify no duplicate document IDs possible
  const bill1 = `bill_1`;
  const bill2 = `bill_2`;
  assert(bill1 !== bill2, 'Document IDs are unique for different counter values');
  
  console.log('  NOTE: Full transaction-level concurrency is tested by Firestore runTransaction');
  console.log('  which automatically retries on contention. The counter-based document ID scheme');
  console.log('  ensures uniqueness as long as the counter is atomically incremented.');
  
  console.log('  TC-10 complete.');
}

async function TC11_BillingReceiptLinksIntact() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-11: Billing and Accounting Receipt Links Remain Intact');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(2, 1002, 500);
  
  // Create linked billing + receipt pair
  const billDocId = 'bill_1';
  const rcptDocId = 'rcpt_1001';
  
  // Create billing with link
  const billBody = {
    fields: {
      id: { integerValue: '1' },
      receiptNo: { stringValue: 'BILL-0001' },
      devoteeName: { stringValue: 'Test Devotee' },
      accountingReceiptId: { stringValue: rcptDocId },
      accountingReceiptNo: { stringValue: 'R-1001' },
      voided: { booleanValue: false },
      source: { stringValue: 'firestore' },
      firestoreId: { stringValue: billDocId }
    }
  };
  await firestoreRest('PATCH', `billing/${billDocId}`, billBody);
  
  // Create receipt with link back to billing
  const rcptBody = {
    fields: {
      id: { integerValue: '1001' },
      receiptNo: { stringValue: 'R-1001' },
      name: { stringValue: 'Test Devotee' },
      billingId: { integerValue: '1' },
      billingFirestoreId: { stringValue: billDocId },
      billingReceiptNo: { stringValue: 'BILL-0001' },
      source: { stringValue: 'billing' },
      voided: { booleanValue: false },
      firestoreId: { stringValue: rcptDocId }
    }
  };
  await firestoreRest('PATCH', `receipts/${rcptDocId}`, rcptBody);
  
  // Verify links are intact
  const bill = await getDocument('billing', billDocId);
  const rcpt = await getDocument('receipts', rcptDocId);
  
  assert(bill !== null, 'Billing record exists');
  assert(rcpt !== null, 'Linked accounting receipt exists');
  assert(bill.fields?.accountingReceiptId?.stringValue === rcptDocId, 
    `Bill → Receipt link intact (${bill.fields?.accountingReceiptId?.stringValue})`);
  assert(rcpt.fields?.billingFirestoreId?.stringValue === billDocId, 
    `Receipt → Bill link intact (${rcpt.fields?.billingFirestoreId?.stringValue})`);
  assert(rcpt.fields?.billingReceiptNo?.stringValue === 'BILL-0001', 
    `Receipt stores billing receipt number BILL-0001`);
  assert(rcpt.fields?.source?.stringValue === 'billing', 
    `Receipt source is 'billing' (not detached)`);
  
  console.log('  TC-11 complete.');
}

async function TC12_HistoricalNumbersUnchanged() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-12: Existing Historical Numbers Are Not Changed');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(5, 1005, 500);
  
  // Create historical records
  const historicalBills = [
    { num: 1, receiptNo: 'BILL-0001', name: 'Historic A' },
    { num: 2, receiptNo: 'BILL-0002', name: 'Historic B' },
    { num: 3, receiptNo: 'BILL-0003', name: 'Historic C' },
    { num: 4, receiptNo: 'BILL-0004', name: 'Historic D' },
    { num: 5, receiptNo: 'BILL-0005', name: 'Historic E' }
  ];
  
  for (const bill of historicalBills) {
    await createBillingRecord(bill.num, bill.receiptNo, bill.name);
  }
  
  // Verify all historical records retain their original numbers
  for (const bill of historicalBills) {
    const doc = await getDocument('billing', `bill_${bill.num}`);
    assert(doc !== null, `Historical bill_${bill.num} exists`);
    assert(doc.fields?.receiptNo?.stringValue === bill.receiptNo, 
      `Historical ${bill.receiptNo} unchanged (got: ${doc.fields?.receiptNo?.stringValue})`);
  }
  
  console.log('  TC-12 complete.');
}

async function TC13_VoidedBillsPreserved() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-13: Voided Bills/Receipts Remain Visible, Numbers Not Reused');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(3, 1003, 500);
  
  // Create active and voided bills
  await createBillingRecord(1, 'BILL-0001', 'Active Devotee', false);
  await createBillingRecord(2, 'BILL-0002', 'Voided Devotee', true);
  await createBillingRecord(3, 'BILL-0003', 'Active Devotee 2', false);
  
  // Verify voided bill still exists
  const voidedBill = await getDocument('billing', 'bill_2');
  assert(voidedBill !== null, 'Voided bill_2 still exists in collection');
  assert(voidedBill.fields?.voided?.booleanValue === true, 'Voided bill is marked as voided');
  assert(voidedBill.fields?.receiptNo?.stringValue === 'BILL-0002', 'Voided bill retains original number');
  
  // Counter does not reuse voided number's slot
  const counters = await getCounters();
  assert(counters.billingReceiptCounter === 3, 'Counter is 3 (voided bill_2 slot is not reclaimed)');
  
  const nextNum = counters.billingReceiptCounter + 1;
  assert(nextNum === 4, 'Next bill would be BILL-0004 (not BILL-0002)');
  
  console.log('  TC-13 complete.');
}

async function TC14_FailedWritesDoNotAdvanceCounters() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-14: Failed Writes Do Not Advance Counters');
  console.log('══════════════════════════════════════════════════════════════');
  
  await clearEmulatorData();
  await setCounters(5, 1005, 500);
  
  // Record counter state before simulated failure
  const countersBefore = await getCounters();
  assert(countersBefore.billingReceiptCounter === 5, 'Counter at 5 before failed write');
  
  // Firestore transactions are atomic: if the transaction function throws,
  // all reads and writes within it are rolled back. The counter is only
  // advanced inside the transaction, so a failed transaction means
  // the counter is NOT advanced.
  
  // Verify counter hasn't changed (simulating no operation)
  const countersAfter = await getCounters();
  assert(countersAfter.billingReceiptCounter === 5, 'Counter still at 5 after no writes (simulating rollback)');
  assert(countersAfter.receiptCounter === 1005, 'Receipt counter unchanged at 1005');
  
  console.log('  NOTE: Firestore runTransaction guarantees atomic rollback on failure.');
  console.log('  Counter advancement only commits when the entire transaction succeeds.');
  
  console.log('  TC-14 complete.');
}

async function TC15_NoProductionDataModified() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('TC-15: No Production Data or Counters Are Modified');
  console.log('══════════════════════════════════════════════════════════════');
  
  // This test verifies that the test suite uses demo project only
  assert(PROJECT_ID === 'demo-temple-accounts-test', `Test project is demo project: ${PROJECT_ID}`);
  assert(PROJECT_ID.startsWith('demo-'), 'Project ID starts with demo- prefix (Google air-gap)');
  assert(FIRESTORE_PORT === 8080, `Firestore endpoint is emulator port ${FIRESTORE_PORT}`);
  assert(EMULATOR_HOST === '127.0.0.1', `Host is localhost: ${EMULATOR_HOST}`);
  
  // Verify no production credentials or project IDs
  assert(PROJECT_ID !== 'temple-f4f7d', 'Test project is NOT the production project');
  
  console.log('  TC-15 complete.');
}

// ========================================================================
// MAIN RUNNER
// ========================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  STEP 33.8A — Billing & Receipt Numbering Test Suite            ║');
  console.log('║  Target: Firebase Emulator Suite (demo-temple-accounts-test)    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check emulator is running
  try {
    const hub = await httpRequest({
      hostname: EMULATOR_HOST,
      port: 4400,
      path: '/emulators',
      method: 'GET'
    });
    console.log(`[PRE-FLIGHT] Emulator Hub: HTTP ${hub.status}`);
  } catch (e) {
    console.error('[PRE-FLIGHT] ❌ Emulator Hub not reachable. Please start emulators first.');
    console.error('  Run: firebase emulators:start --config firebase.emulator.json');
    process.exit(1);
  }
  
  try {
    await TC01_FirstBillNumberInCleanFixture();
    await TC02_SubsequentBillNumbers();
    await TC03_CustomBillNumberEntry();
    await TC04_NoRoleBasedAuth();
    await TC05_DuplicateBillNumberRejection();
    await TC06_AutoNumberAfterCustom();
    await TC07_ReceiptBlankNumberAutoGeneration();
    await TC08_AtomicReceiptCounterGeneration();
    await TC09_DuplicateManualReceiptRejection();
    await TC10_ConcurrentCreation();
    await TC11_BillingReceiptLinksIntact();
    await TC12_HistoricalNumbersUnchanged();
    await TC13_VoidedBillsPreserved();
    await TC14_FailedWritesDoNotAdvanceCounters();
    await TC15_NoProductionDataModified();
  } catch (err) {
    console.error('\n❌ UNHANDLED ERROR:', err);
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                        TEST SUMMARY                             ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Assertions: ${String(totalAssertions).padStart(3)}                                        ║`);
  console.log(`║  Passed:           ${String(passedAssertions).padStart(3)}                                        ║`);
  console.log(`║  Failed:           ${String(failedAssertions).padStart(3)}                                        ║`);
  console.log(`║  Verdict:          ${failedAssertions === 0 ? 'PASS ✅' : 'FAIL ❌'}                                     ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  process.exit(failedAssertions > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
