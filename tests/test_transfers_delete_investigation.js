/**
 * test_transfers_delete_investigation.js
 * Comprehensive diagnostic script investigating Fund Transfer deletion against emulator
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

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

async function run() {
  console.log('--- 1. Authenticate synthetic user in emulator ---');
  const signUpRes = await httpRequest({
    host: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: `tester_${Date.now()}@temple-test.local`,
    password: 'Password123!',
    returnSecureToken: true
  });
  const uid = signUpRes.data.localId;
  const token = signUpRes.data.idToken;
  console.log('User UID:', uid);

  console.log('\n--- 2. Inspect how saveTransfer creates records ---');
  // In saveTransfer:
  // rec.createdAt = Date.now();
  // rec.firestoreId = 'tx_' + Date.now();
  // await fsSaveRecordSafe('transfers', rec, false);
  const now = Date.now();
  const txId = `tx_${now}`;
  const transferDoc = {
    fields: {
      date: { stringValue: '2026-10-11' },
      fromAcc: { stringValue: 'Cash' },
      toAcc: { stringValue: 'Bank' },
      mode: { stringValue: 'Cash' },
      amount: { doubleValue: 2500.00 },
      reason: { stringValue: 'Test Transfer' },
      refNo: { stringValue: 'REF-001' },
      createdAt: { integerValue: String(now) },
      firestoreId: { stringValue: txId },
      id: { stringValue: txId },
      createdBy: { stringValue: uid },
      updatedBy: { stringValue: uid },
      source: { stringValue: 'firestore' }
    }
  };

  const putRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${txId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, transferDoc);
  console.log('Inserted transfer:', txId, 'status:', putRes.status);

  console.log('\n--- 3. Check what fsGetAllSafe returns ---');
  const listRes = await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const docs = (listRes.data.documents || []).map(d => {
    const f = d.fields;
    const nameParts = d.name.split('/');
    const docId = nameParts[nameParts.length - 1];
    return {
      docId,
      amount: f.amount ? (f.amount.doubleValue || f.amount.integerValue) : 0,
      fromAcc: f.fromAcc ? f.fromAcc.stringValue : '',
      toAcc: f.toAcc ? f.toAcc.stringValue : '',
      voided: f.voided ? f.voided.booleanValue : false
    };
  });
  console.log('Documents in transfers collection:', docs);

  console.log('\n--- 4. Clean up test document ---');
  await httpRequest({
    host: EMULATOR_HOST,
    port: FIRESTORE_PORT,
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/transfers/${txId}`,
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Cleaned up test document.');

  // Clean up user
  await httpRequest({
    host: EMULATOR_HOST,
    port: AUTH_PORT,
    path: `/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-key`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { idToken: token, localId: uid });
  console.log('Cleaned up test user.');
}

run().catch(console.error);
