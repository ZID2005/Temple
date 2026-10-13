/**
 * test_diagnose_transfer_delete.js
 * Diagnose deleteRecord and fsDeleteRecordSafe behavior for transfers against local emulator
 */
const http = require('http');

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const PROJECT_ID = 'demo-temple-accounts-test';

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  console.log('=== Step 1: Check Emulator Health ===');
  const health = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: '/',
    method: 'GET'
  });
  console.log('Firestore emulator health:', health.status, health.raw.trim());

  console.log('\n=== Step 2: Create a Synthetic User in Auth Emulator ===');
  const signUpRes = await httpRequest({
    host: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: 'tester_diag@temple-test.local',
    password: 'Password123!',
    returnSecureToken: true
  });
  console.log('Auth signUp status:', signUpRes.status, 'UID:', signUpRes.data.localId);
  const idToken = signUpRes.data.idToken;

  console.log('\n=== Step 3: Insert a Test Transfer Document into Firestore Emulator ===');
  const testDocId = `tx_${Date.now()}`;
  const transferData = {
    fields: {
      amount: { doubleValue: 1500.00 },
      date: { stringValue: '2026-10-11' },
      fromAcc: { stringValue: 'Cash' },
      toAcc: { stringValue: 'Bank' },
      mode: { stringValue: 'Cash' },
      reason: { stringValue: 'Diagnosis Test' },
      refNo: { stringValue: 'DIAG-01' },
      createdAt: { integerValue: String(Date.now()) },
      firestoreId: { stringValue: testDocId },
      id: { stringValue: testDocId },
      createdBy: { stringValue: signUpRes.data.localId },
      updatedBy: { stringValue: signUpRes.data.localId },
      source: { stringValue: 'firestore' }
    }
  };

  const createRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${testDocId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    }
  }, transferData);
  console.log('Create doc status:', createRes.status, createRes.data.name ? 'Created' : createRes.raw);

  console.log('\n=== Step 4: Verify Transfer Document Exists ===');
  const getRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${testDocId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });
  console.log('Get doc status:', getRes.status, getRes.data.fields ? 'Exists' : 'Not found');

  console.log('\n=== Step 5: Test Delete via REST (Simulating fsDeleteRecordSafe) ===');
  const delRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${testDocId}`,
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });
  console.log('Delete doc status:', delRes.status);

  console.log('\n=== Step 6: Verify Transfer Document is Deleted ===');
  const getAfterDel = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${testDocId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });
  console.log('Get after delete status (404 expected):', getAfterDel.status);

  console.log('\n=== Step 7: Clean up test user ===');
  await httpRequest({
    host: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    idToken: idToken,
    localId: signUpRes.data.localId
  });
  console.log('Synthetic test user cleaned up.');
}

main().catch(console.error);
