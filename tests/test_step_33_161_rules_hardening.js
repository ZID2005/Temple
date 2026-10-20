/**
 * STEP 33.161 — Firestore Security Rules Hardening Test Suite
 *
 * Runs comprehensive automated verification against the local Firestore Emulator
 * testing the proposed rules in firestore.rules.step_33_161_candidate.
 *
 * 100% AIR-GAPPED & COMPLIANT:
 * - Dedicated local port: 8380
 * - Project: demo-step33161-test
 * - Zero production interaction
 * - Covers all 7 required domains, allowed operations, and denial cases.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const JAVA_EXE = 'C:\\Users\\sanal\\.antigravity-ide\\extensions\\redhat.java-1.58.0-win32-x64\\jre\\25.0.4.1-win32-x86_64\\bin\\java.exe';
const JAR_PATH = 'C:\\Users\\sanal\\.cache\\firebase\\emulators\\cloud-firestore-emulator-v1.22.0.jar';
const RULES_PATH = path.resolve('d:/Temple/firestore.rules.step_33_161_candidate');

const EMULATOR_PORT = 8380;
const PROJECT_ID = 'demo-step33161-test';

// UIDs
const ADMIN_UID = 'rFvStQNfiINnPor66OzXuE1O9Lm1'; // vibu@gmail.com
const CLERK_UID = 'clerk_devotee_ops_01';
const OTHER_CLERK_UID = 'clerk_volunteer_99';

function createMockToken(uid, email = 'user@temple.org', claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: Math.floor(Date.now() / 1000),
    user_id: uid,
    sub: uid,
    email: email,
    email_verified: true,
    ...claims
  })).toString('base64url');
  return `${header}.${payload}.`;
}

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
    } else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map(item => typeof item === 'object' ? { mapValue: { fields: toFirestoreFields(item) } } : { stringValue: String(item) }) } };
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

function firestoreRest(method, docPath, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const subPath = docPath.startsWith('/') ? docPath : `/${docPath}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: EMULATOR_PORT,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents${subPath}`,
      method,
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch(e) { parsed = body; }
        resolve({ status: res.statusCode, data: parsed, raw: body });
      });
    });

    req.setTimeout(5000, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);

    if (data) {
      const payload = JSON.stringify(data);
      req.write(payload);
    }
    req.end();
  });
}

async function startEmulator() {
  console.log(`[EMULATOR] Launching Cloud Firestore Emulator on 127.0.0.1:${EMULATOR_PORT}...`);
  console.log(`[EMULATOR] Rules candidate: ${RULES_PATH}`);

  const proc = spawn(JAVA_EXE, [
    '-jar', JAR_PATH,
    '--host', '127.0.0.1',
    '--port', String(EMULATOR_PORT),
    '--rules', RULES_PATH
  ], { stdio: 'pipe' });

  let ready = false;
  proc.stdout.on('data', d => {
    const str = d.toString();
    if (str.includes('Dev App Server is now running')) ready = true;
  });
  proc.stderr.on('data', () => {
    // Continuously drain stderr buffer to prevent OS pipe block
  });

  for (let i = 0; i < 40; i++) {
    if (ready) break;
    await new Promise(r => setTimeout(r, 250));
  }

  if (!ready) {
    proc.kill();
    throw new Error('Firestore Emulator failed to start in time.');
  }

  console.log('[EMULATOR] Emulator is ready.');
  return proc;
}

async function runTestSuite() {
  const tokenClerk = createMockToken(CLERK_UID, 'clerk@temple.org');
  const tokenOtherClerk = createMockToken(OTHER_CLERK_UID, 'other@temple.org');
  const tokenAdminUid = createMockToken(ADMIN_UID, 'vibu@gmail.com');
  const tokenAdminClaim = createMockToken('custom_admin_01', 'trustee@temple.org', { admin: true });

  const results = [];
  let testIdx = 1;

  async function test(name, domain, expectation, fn) {
    const id = `SEC-TEST-${String(testIdx++).padStart(2, '0')}`;
    process.stdout.write(`  Running ${id}: ${name}... `);
    try {
      const outcome = await fn();
      if (outcome.passed) {
        console.log('✅ PASS');
        results.push({ id, name, domain, expectation, outcome: 'PASS', passed: true, details: outcome.details });
      } else {
        console.log(`❌ FAIL (${outcome.details})`);
        results.push({ id, name, domain, expectation, outcome: 'FAIL', passed: false, details: outcome.details });
      }
    } catch (err) {
      console.log(`❌ ERROR (${err.message})`);
      results.push({ id, name, domain, expectation, outcome: 'ERROR', passed: false, details: err.message });
    }
  }

  console.log('\n========================================================================');
  console.log('  STEP 33.161 FIRESTORE RULES VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  // DOMAIN 1: UNAUTHENTICATED CALLS (STRICT DEFAULT-DENY)
  await test('Unauthenticated read of billing records is rejected', 'AUTHENTICATION', 'HTTP 403', async () => {
    const res = await firestoreRest('GET', 'billing/bill_1');
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Unauthenticated write to system counters is rejected', 'AUTHENTICATION', 'HTTP 403', async () => {
    const res = await firestoreRest('PATCH', 'system/counters', { fields: toFirestoreFields({ globalSequenceCounter: 999 }) });
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Unauthenticated read of master settings is rejected', 'AUTHENTICATION', 'HTTP 403', async () => {
    const res = await firestoreRest('GET', 'settings/1');
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  // DOMAIN 2: SEQUENTIAL BILLING & ACCOUNTING RECEIPTS
  await test('Authenticated operator creates bill with caller UID binding', 'BILLING', 'HTTP 200', async () => {
    const billData = {
      id: 1,
      firestoreId: 'bill_1',
      receiptNo: 'BILL-001',
      date: '2026-10-20',
      devoteeName: 'Devotee A',
      totalAmount: 150.0,
      paymentMode: 'Cash',
      voided: false,
      source: 'billing',
      createdBy: CLERK_UID,
      createdAt: Date.now()
    };
    const res = await firestoreRest('PATCH', 'billing/bill_1', { fields: toFirestoreFields(billData) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Authenticated operator creates linked accounting receipt', 'RECEIPTS', 'HTTP 200', async () => {
    const rcptData = {
      id: 1,
      firestoreId: 'rcpt_1',
      receiptNo: 'R-001',
      date: '2026-10-20',
      fund: 'General Temple Fund',
      category: 'Vazhipadu Income',
      amount: 150.0,
      paymentMode: 'Cash',
      voided: false,
      source: 'billing',
      createdBy: CLERK_UID,
      createdAt: Date.now()
    };
    const res = await firestoreRest('PATCH', 'receipts/rcpt_1', { fields: toFirestoreFields(rcptData) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Forging bill with another user UID as creator is rejected', 'BILLING', 'HTTP 403', async () => {
    const forgedBill = {
      id: 2,
      firestoreId: 'bill_2',
      receiptNo: 'BILL-002',
      totalAmount: 50.0,
      createdBy: OTHER_CLERK_UID, // Mismatch with CLERK_UID
      voided: false
    };
    const res = await firestoreRest('PATCH', 'billing/bill_2', { fields: toFirestoreFields(forgedBill) }, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Physical deletion of billing record is strictly denied', 'BILLING', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'billing/bill_1', null, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Physical deletion of accounting receipt is strictly denied', 'RECEIPTS', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'receipts/rcpt_1', null, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Non-destructive atomic voiding transition on bill is permitted', 'BILLING', 'HTTP 200', async () => {
    // Void transition: only voided metadata can be modified
    const voidUpdate = {
      fields: toFirestoreFields({
        voided: true,
        voidReason: 'Mistake in count',
        voidDate: '2026-10-20',
        voidedAt: Date.now(),
        updatedBy: CLERK_UID,
        status: 'voided'
      })
    };
    // Using updateMask to only update void fields
    const res = await firestoreRest('PATCH', 'billing/bill_1?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate&updateMask.fieldPaths=voidedAt&updateMask.fieldPaths=updatedBy&updateMask.fieldPaths=status', voidUpdate, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Tampering with financial amount of existing bill is rejected', 'BILLING', 'HTTP 403', async () => {
    const tamper = {
      fields: toFirestoreFields({
        totalAmount: 0.0 // Tampering attempt
      })
    };
    const res = await firestoreRest('PATCH', 'billing/bill_1?updateMask.fieldPaths=totalAmount', tamper, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  // DOMAIN 3: PHYSICAL P/PU RECEIPTS
  await test('Operator records Physical Puja receipt P600 and reservation', 'PHYSICAL_RECEIPTS', 'HTTP 200', async () => {
    const pRcpt = {
      id: 'rcpt_phys_P600',
      firestoreId: 'rcpt_phys_P600',
      receiptNo: 'P600',
      isPhysical: true,
      physicalType: 'P',
      fund: 'General Temple Fund',
      category: 'Pooja Income',
      amount: 100.0,
      voided: false,
      createdBy: CLERK_UID
    };
    const res1 = await firestoreRest('PATCH', 'receipts/rcpt_phys_P600', { fields: toFirestoreFields(pRcpt) }, tokenClerk);

    const pRes = {
      formattedNo: 'P600',
      type: 'physical_receipt',
      status: 'active',
      voided: false,
      createdBy: CLERK_UID
    };
    const res2 = await firestoreRest('PATCH', 'system/res_phys_P600', { fields: toFirestoreFields(pRes) }, tokenClerk);

    const pOp = {
      operationId: 'op_phys_rcpt_p600',
      type: 'physical_receipt',
      physicalId: 'P600',
      status: 'committed',
      fingerprint: 'fp_p600_test',
      createdBy: CLERK_UID
    };
    const res3 = await firestoreRest('PATCH', 'system/op_phys_rcpt_p600', { fields: toFirestoreFields(pOp) }, tokenClerk);

    const allOk = res1.status === 200 && res2.status === 200 && res3.status === 200;
    return { passed: allOk, details: `Receipt: ${res1.status}, Res: ${res2.status}, Op: ${res3.status}` };
  });

  await test('Operator records Physical Punarudharanam receipt PU1 and reservation', 'PHYSICAL_RECEIPTS', 'HTTP 200', async () => {
    const puRcpt = {
      id: 'rcpt_phys_PU1',
      firestoreId: 'rcpt_phys_PU1',
      receiptNo: 'PU1',
      isPhysical: true,
      physicalType: 'PU',
      fund: 'Punarudharanam Fund',
      category: 'Donation Income',
      amount: 500.0,
      voided: false,
      createdBy: CLERK_UID
    };
    const res1 = await firestoreRest('PATCH', 'receipts/rcpt_phys_PU1', { fields: toFirestoreFields(puRcpt) }, tokenClerk);

    const puRes = {
      formattedNo: 'PU1',
      type: 'physical_receipt',
      status: 'active',
      voided: false,
      createdBy: CLERK_UID
    };
    const res2 = await firestoreRest('PATCH', 'system/res_phys_PU1', { fields: toFirestoreFields(puRes) }, tokenClerk);

    return { passed: res1.status === 200 && res2.status === 200, details: `Receipt: ${res1.status}, Res: ${res2.status}` };
  });

  await test('Voiding physical receipt and physical reservation succeeds', 'PHYSICAL_RECEIPTS', 'HTTP 200', async () => {
    const voidPayload = {
      fields: toFirestoreFields({
        voided: true,
        voidReason: 'Wrong entry',
        voidDate: '2026-10-20',
        voidedAt: Date.now(),
        updatedBy: CLERK_UID,
        status: 'voided'
      })
    };
    const res1 = await firestoreRest('PATCH', 'receipts/rcpt_phys_P600?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate&updateMask.fieldPaths=voidedAt&updateMask.fieldPaths=updatedBy&updateMask.fieldPaths=status', voidPayload, tokenClerk);
    const res2 = await firestoreRest('PATCH', 'system/res_phys_P600?updateMask.fieldPaths=voided&updateMask.fieldPaths=status', {
      fields: toFirestoreFields({ voided: true, status: 'voided' })
    }, tokenClerk);

    return { passed: res1.status === 200 && res2.status === 200, details: `Rcpt: ${res1.status}, Res: ${res2.status}` };
  });

  await test('Physical deletion of physical receipt or reservation is denied', 'PHYSICAL_RECEIPTS', 'HTTP 403', async () => {
    const res1 = await firestoreRest('DELETE', 'receipts/rcpt_phys_P600', null, tokenClerk);
    const res2 = await firestoreRest('DELETE', 'system/res_phys_P600', null, tokenClerk);
    return { passed: res1.status === 403 && res2.status === 403, details: `Rcpt: ${res1.status}, Res: ${res2.status}` };
  });

  // DOMAIN 4: COUNTERS & IDEMPOTENCY
  await test('Operator initializes system counters singleton', 'COUNTERS', 'HTTP 200', async () => {
    const initialCounters = {
      globalSequenceCounter: 0,
      billingReceiptCounter: 0,
      receiptCounter: 1020,
      voucherCounter: 502,
      billingPrefix: 'BILL-',
      receiptPrefix: 'R-',
      voucherPrefix: 'V-'
    };
    const res = await firestoreRest('PATCH', 'system/counters', { fields: toFirestoreFields(initialCounters) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Operator monotonically advances sequence counter (0 -> 1)', 'COUNTERS', 'HTTP 200', async () => {
    const advance = {
      fields: toFirestoreFields({
        globalSequenceCounter: 1,
        billingReceiptCounter: 1
      })
    };
    const res = await firestoreRest('PATCH', 'system/counters?updateMask.fieldPaths=globalSequenceCounter&updateMask.fieldPaths=billingReceiptCounter', advance, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Operator rolling back sequence counter (1 -> 0) is rejected', 'COUNTERS', 'HTTP 403', async () => {
    const rollback = {
      fields: toFirestoreFields({
        globalSequenceCounter: 0
      })
    };
    const res = await firestoreRest('PATCH', 'system/counters?updateMask.fieldPaths=globalSequenceCounter', rollback, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Administrator is authorized to re-commission/reset counters', 'COUNTERS', 'HTTP 200', async () => {
    const commission = {
      fields: toFirestoreFields({
        globalSequenceCounter: 0,
        billingReceiptCounter: 0,
        commissionedBy: ADMIN_UID,
        commissionedAt: Date.now()
      })
    };
    const res = await firestoreRest('PATCH', 'system/counters?updateMask.fieldPaths=globalSequenceCounter&updateMask.fieldPaths=billingReceiptCounter&updateMask.fieldPaths=commissionedBy&updateMask.fieldPaths=commissionedAt', commission, tokenAdminUid);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Physical deletion of system counters is strictly denied', 'COUNTERS', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'system/counters', null, tokenAdminUid);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Idempotency record is strictly immutable (modifications denied)', 'IDEMPOTENCY', 'HTTP 403', async () => {
    const tamper = {
      fields: toFirestoreFields({
        fingerprint: 'tampered_fingerprint'
      })
    };
    const res = await firestoreRest('PATCH', 'system/op_phys_rcpt_p600?updateMask.fieldPaths=fingerprint', tamper, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  // DOMAIN 5: PAYMENTS, TRANSFERS, LOANS, CHITTY
  await test('Operator records payment voucher pmt_503', 'PAYMENTS', 'HTTP 200', async () => {
    const pmt = {
      id: 503,
      voucherNo: 'V-503',
      date: '2026-10-20',
      fund: 'General Temple Fund',
      category: 'Oil',
      amount: 450.0,
      paidTo: 'Store Vendor',
      voided: false
    };
    const res = await firestoreRest('PATCH', 'payments/pmt_503', { fields: toFirestoreFields(pmt) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Physical deletion of payment voucher is strictly denied', 'PAYMENTS', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'payments/pmt_503', null, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Operator records fund transfer and voids it safely', 'TRANSFERS', 'HTTP 200', async () => {
    const trans = {
      id: 'trans_1',
      date: '2026-10-20',
      fromAcc: 'Cash',
      toAcc: 'Bank',
      amount: 5000.0,
      voided: false
    };
    const res1 = await firestoreRest('PATCH', 'transfers/trans_1', { fields: toFirestoreFields(trans) }, tokenClerk);

    const voidRes = await firestoreRest('PATCH', 'transfers/trans_1?updateMask.fieldPaths=voided', {
      fields: toFirestoreFields({ voided: true })
    }, tokenClerk);

    return { passed: res1.status === 200 && voidRes.status === 200, details: `Create: ${res1.status}, Void: ${voidRes.status}` };
  });

  await test('Physical deletion of fund transfer is strictly denied', 'TRANSFERS', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'transfers/trans_1', null, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Physical deletion of Chitty collection / payout is strictly denied', 'CHITTY', 'HTTP 403', async () => {
    const cc = { id: 'cc_1', date: '2026-10-20', memberId: 1, amountReceived: 1000.0, voided: false };
    await firestoreRest('PATCH', 'chittyCollections/cc_1', { fields: toFirestoreFields(cc) }, tokenClerk);
    const res = await firestoreRest('DELETE', 'chittyCollections/cc_1', null, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Operator creates and deletes an unreferenced Chitty member', 'CHITTY', 'HTTP 200', async () => {
    const cm = { id: 'cm_1', name: 'Member Test', phone: '9876543210' };
    const res1 = await firestoreRest('PATCH', 'chittyMembers/cm_1', { fields: toFirestoreFields(cm) }, tokenClerk);
    const res2 = await firestoreRest('DELETE', 'chittyMembers/cm_1', null, tokenClerk);
    return { passed: res1.status === 200 && res2.status === 200, details: `Create: ${res1.status}, Delete: ${res2.status}` };
  });

  // DOMAIN 6: MASTER DATA & SETTINGS ROLE-BASED ACCESS CONTROL
  await test('Ordinary clerk reading settings is allowed', 'MASTER_DATA', 'HTTP 200/404', async () => {
    const res = await firestoreRest('GET', 'settings/1', null, tokenClerk);
    return { passed: res.status === 200 || res.status === 404, details: `Status ${res.status}` };
  });

  await test('Ordinary clerk modifying settings is denied', 'MASTER_DATA', 'HTTP 403', async () => {
    const tamper = { fields: toFirestoreFields({ templeName: 'Tampered Name' }) };
    const res = await firestoreRest('PATCH', 'settings/1', tamper, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Administrator modifying settings is permitted', 'MASTER_DATA', 'HTTP 200', async () => {
    const valid = { fields: toFirestoreFields({ templeName: 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം' }) };
    const res = await firestoreRest('PATCH', 'settings/1', valid, tokenAdminUid);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Physical deletion of settings document is denied even for admin', 'MASTER_DATA', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'settings/1', null, tokenAdminUid);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Ordinary clerk creating/deleting funds is denied', 'MASTER_DATA', 'HTTP 403', async () => {
    const newFund = { fields: toFirestoreFields({ name: 'Clerk Fund' }) };
    const res1 = await firestoreRest('PATCH', 'funds/fund_clerk', newFund, tokenClerk);
    const res2 = await firestoreRest('DELETE', 'funds/fund_clerk', null, tokenClerk);
    return { passed: res1.status === 403 && res2.status === 403, details: `Create: ${res1.status}, Delete: ${res2.status}` };
  });

  await test('Administrator seeds General Temple Fund and creates custom fund', 'MASTER_DATA', 'HTTP 200', async () => {
    const coreFund = { fields: toFirestoreFields({ name: 'General Temple Fund' }) };
    const res1 = await firestoreRest('PATCH', 'funds/fund_core_1', coreFund, tokenAdminUid);

    const customFund = { fields: toFirestoreFields({ name: 'Special Annadhanam Fund' }) };
    const res2 = await firestoreRest('PATCH', 'funds/fund_custom_1', customFund, tokenAdminClaim);

    return { passed: res1.status === 200 && res2.status === 200, details: `Core: ${res1.status}, Custom: ${res2.status}` };
  });

  await test('Deleting protected core fund (General Temple Fund) is denied even for admin', 'MASTER_DATA', 'HTTP 403', async () => {
    const res = await firestoreRest('DELETE', 'funds/fund_core_1', null, tokenAdminUid);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Administrator deleting non-core custom fund is permitted', 'MASTER_DATA', 'HTTP 200', async () => {
    const res = await firestoreRest('DELETE', 'funds/fund_custom_1', null, tokenAdminUid);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Client-side write to /system_admins directory is strictly locked', 'SYSTEM_ADMINS', 'HTTP 403', async () => {
    const fakeAdmin = { fields: toFirestoreFields({ email: 'hacker@bad.org', role: 'admin' }) };
    const res = await firestoreRest('PATCH', 'system_admins/hacker_uid', fakeAdmin, tokenClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  // DOMAIN 7: DISASTER RECOVERY RESTORE WORKFLOW
  await test('Operator initiates restore session tracking in /system/_restoreProgress', 'DISASTER_RECOVERY', 'HTTP 200', async () => {
    const progress = {
      sessionId: 'rst_2026102001',
      status: 'in_progress',
      startedAt: Date.now(),
      currentPhase: 'phase_3_merge',
      completedPhases: ['phase_1_backup', 'phase_2_verify'],
      restoredBy: CLERK_UID
    };
    const res = await firestoreRest('PATCH', 'system/_restoreProgress', { fields: toFirestoreFields(progress) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Under active restore session, historical records with other createdBy are accepted', 'DISASTER_RECOVERY', 'HTTP 200', async () => {
    const histBill = {
      id: 99,
      firestoreId: 'bill_99',
      receiptNo: 'BILL-099',
      totalAmount: 200.0,
      createdBy: 'historical_user_1985', // Preserved historical creator
      _restoredBy: CLERK_UID,
      _restoredAt: '2026-10-20T10:00:00Z',
      voided: false
    };
    const res = await firestoreRest('PATCH', 'billing/bill_99', { fields: toFirestoreFields(histBill) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  await test('Another operator attempting to hijack in-progress restore session is rejected', 'DISASTER_RECOVERY', 'HTTP 403', async () => {
    const hijack = {
      sessionId: 'rst_2026102001',
      status: 'in_progress',
      startedAt: Date.now(),
      currentPhase: 'phase_3_merge',
      completedPhases: [],
      restoredBy: OTHER_CLERK_UID
    };
    const res = await firestoreRest('PATCH', 'system/_restoreProgress', { fields: toFirestoreFields(hijack) }, tokenOtherClerk);
    return { passed: res.status === 403, details: `Status ${res.status}` };
  });

  await test('Initiating operator marks restore session completed', 'DISASTER_RECOVERY', 'HTTP 200', async () => {
    const completed = {
      sessionId: 'rst_2026102001',
      status: 'completed',
      startedAt: Date.now(),
      currentPhase: 'completed',
      completedPhases: ['phase_1', 'phase_2', 'phase_3', 'phase_4'],
      restoredBy: CLERK_UID
    };
    const res = await firestoreRest('PATCH', 'system/_restoreProgress', { fields: toFirestoreFields(completed) }, tokenClerk);
    return { passed: res.status === 200, details: `Status ${res.status}` };
  });

  console.log('\n========================================================================');
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`  TEST RESULTS: ${passCount} Passed, ${failCount} Failed (Total: ${results.length})`);
  console.log('========================================================================\n');

  const summary = {
    step: 'STEP_33_161',
    executionDate: new Date().toISOString(),
    candidateRules: 'firestore.rules.step_33_161_candidate',
    totalTests: results.length,
    passed: passCount,
    failed: failCount,
    verdict: failCount === 0 ? 'ALL_CHECKS_PASSED' : 'FAILURES_DETECTED',
    tests: results
  };

  fs.writeFileSync('tests/step_33_161_rules_test_results.json', JSON.stringify(summary, null, 2), 'utf8');
  console.log('[EVIDENCE] Written to tests/step_33_161_rules_test_results.json');

  return failCount === 0;
}

async function main() {
  let emulatorProc = null;
  try {
    emulatorProc = await startEmulator();
    const success = await runTestSuite();
    if (emulatorProc) {
      console.log('[CLEANUP] Stopping Firestore Emulator...');
      emulatorProc.kill();
    }
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error('[FATAL ERROR]:', err);
    if (emulatorProc) emulatorProc.kill();
    process.exit(1);
  }
}

main();
