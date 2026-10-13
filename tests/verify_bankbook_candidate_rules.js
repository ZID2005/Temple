const http = require('http');
const fs = require('fs');
const path = require('path');

const HUB_PORT = 4400;
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;
const PROJECT_ID = 'demo-temple-accounts-test';

function httpJsonRequest(port, reqPath, method, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch(e) { body = raw; }
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('========================================================================');
  console.log('BANK BOOK COMPATIBILITY AUDIT: CANDIDATE RULES READ ACCESS VERIFICATION');
  console.log('========================================================================\n');

  // 1. Load Candidate Rules into Emulator
  const candidateRules = fs.readFileSync((fs.existsSync(path.join(__dirname, 'firestore.rules.candidate')) ? path.join(__dirname, 'firestore.rules.candidate') : path.join(__dirname, '..', 'firestore.rules.candidate')), 'utf8');
  const putRes = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: FIRESTORE_PORT,
      path: `/emulator/v1/projects/${PROJECT_ID}:securityRules`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, res => resolve({ statusCode: res.statusCode }));
    req.on('error', reject);
    req.write(JSON.stringify({ rules: { files: [{ content: candidateRules, name: 'firestore.rules' }] } }));
    req.end();
  });
  console.log('Candidate rules loaded into emulator memory (Status:', putRes.statusCode, ')');

  // 2. Create synthetic test user in Auth Emulator
  const email = `audit_bankbook_${Date.now()}@example.com`;
  const authRes = await httpJsonRequest(AUTH_PORT, '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-test-key', 'POST', {
    email, password: 'Password123!', returnSecureToken: true
  });
  const token = authRes.body.idToken;
  console.log('Synthetic authenticated user created:', email);

  // Collections required by buildBankBookRows() and App Settings
  const collections = [
    { name: 'receipts', desc: 'Active Receipts (Cash/Bank/UPI)' },
    { name: 'payments', desc: 'Active Payments (Cash/Bank/UPI)' },
    { name: 'transfers', desc: 'Fund Transfers (Cash/Bank)' },
    { name: 'loans', desc: 'Loans & Repayments' },
    { name: 'chittyCollections', desc: 'Chitty Collections' },
    { name: 'chittyPayouts', desc: 'Chitty Payouts' },
    { name: 'settings', desc: 'Application Settings (Opening Balances)' }
  ];

  console.log('\n--- Evaluating Candidate Rules for Bank Book Collections ---');

  for (const col of collections) {
    const docPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${col.name}/audit_check_doc`;

    // A. Unauthenticated read test (Must be DENIED)
    const unauthRes = await httpJsonRequest(FIRESTORE_PORT, docPath, 'GET');
    const unauthPass = (unauthRes.statusCode === 403);

    // B. Authenticated read test (Must be ALLOWED - 404 document not found is allowed by security rule, 403 is denied)
    const authReadRes = await httpJsonRequest(FIRESTORE_PORT, docPath, 'GET', null, {
      'Authorization': `Bearer ${token}`
    });
    const authPass = (authReadRes.statusCode === 200 || authReadRes.statusCode === 404);

    console.log(`Collection [${col.name}] (${col.desc}):`);
    console.log(`  Unauthenticated Read: Status ${unauthRes.statusCode} -> ${unauthPass ? 'PASS (DENIED)' : 'FAIL'}`);
    console.log(`  Authenticated Read:   Status ${authReadRes.statusCode} -> ${authPass ? 'PASS (AUTHORIZED)' : 'FAIL'}`);

    if (!unauthPass || !authPass) {
      console.error(`ERROR: Compatibility failed on collection ${col.name}`);
      process.exit(1);
    }
  }

  console.log('\n========================================================================');
  console.log('ALL BANK BOOK COLLECTIONS FULLY COMPATIBLE WITH CANDIDATE RULES!');
  console.log('========================================================================');
}

run().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
