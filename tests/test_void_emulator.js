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

async function testVoid() {
  console.log('--- 1. Auth test user ---');
  const signUpRes = await httpRequest({
    host: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: `tester_void_${Date.now()}@temple-test.local`,
    password: 'Password123!',
    returnSecureToken: true
  });
  const uid = signUpRes.data.localId;
  const token = signUpRes.data.idToken;

  console.log('--- 2. Create test transfer ---');
  const txId = `tx_${Date.now()}`;
  await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${txId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    fields: {
      amount: { doubleValue: 1200 },
      date: { stringValue: '2026-10-11' },
      fromAcc: { stringValue: 'Cash' },
      toAcc: { stringValue: 'Bank' },
      mode: { stringValue: 'Cash' },
      firestoreId: { stringValue: txId },
      id: { stringValue: txId },
      createdAt: { integerValue: String(Date.now()) },
      createdBy: { stringValue: uid },
      updatedBy: { stringValue: uid }
    }
  });
  console.log('Created transfer', txId);

  console.log('--- 3. Void transfer via PATCH (merge) like fsVoidRecordSafe ---');
  const voidRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${txId}?updateMask.fieldPaths=voided&updateMask.fieldPaths=voidReason&updateMask.fieldPaths=voidDate&updateMask.fieldPaths=updatedBy`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    fields: {
      voided: { booleanValue: true },
      voidReason: { stringValue: 'Deleted by user' },
      voidDate: { stringValue: '2026-10-11' },
      updatedBy: { stringValue: uid }
    }
  });
  console.log('Void status:', voidRes.status);

  console.log('--- 4. Verify voided document ---');
  const getRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${txId}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('voided field:', getRes.data.fields.voided.booleanValue);
  console.log('amount field:', getRes.data.fields.amount.doubleValue);

  console.log('--- 5. Clean up ---');
  await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${txId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  await httpRequest({
    host: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { idToken: token, localId: uid });
  console.log('Cleanup complete.');
}

testVoid().catch(console.error);
