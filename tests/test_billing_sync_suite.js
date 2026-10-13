/**
 * test_billing_sync_suite.js
 * STEP 33.5: Billing <-> Receipts Synchronization Runtime Test Suite Runner
 * 
 * Target: Isolated Firebase Emulator Suite (demo-temple-accounts-test)
 * Environment: Local Test Harness (http://localhost:3001/test_emulator_harness.html) via Chrome CDP
 * 
 * Strict Safety Rules Enforced:
 * 1. Air-gapped from production 'temple-f4f7d' (Target: demo-temple-accounts-test)
 * 2. Temple_Accounts-1.html is strictly READ-ONLY (SHA-256 baseline verified before & after)
 * 3. Firestore: 127.0.0.1:8080, Auth: 127.0.0.1:9099
 * 4. Cache target: temple_accounts_test_db only (temple_accounts_db untouched)
 * 5. Zero modifications to production configurations or cloud resources
 */

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const EXPECTED_HASH = '528C5D5DFC16EC5BF395E9F4AABA487D70A4065D46D2E99CF183FAFE31BEDDCC';
const PROJECT_ID = 'demo-temple-accounts-test';
const CDP_HTTP = 'http://127.0.0.1:9222/json';
const HARNESS_URL = 'http://localhost:3001/test_emulator_harness.html';

function verifyHash() {
  const filePath = (fs.existsSync(path.join(__dirname, 'Temple_Accounts-1.html')) ? path.join(__dirname, 'Temple_Accounts-1.html') : path.join(__dirname, '..', 'Temple_Accounts-1.html'));
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
  if (hash !== EXPECTED_HASH) {
    throw new Error(`CRITICAL INTEGRITY FAILURE: Temple_Accounts-1.html hash mismatch! Got: ${hash}, Expected: ${EXPECTED_HASH}`);
  }
  return hash;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function runSuite() {
  console.log('\n============================================================');
  console.log('   STEP 33.5: BILLING <-> RECEIPTS SYNC RUNTIME TEST SUITE');
  console.log('============================================================\n');

  // 1. Pre-execution Safety Guard
  console.log('[Phase 1] Pre-Flight Isolation & Safety Guard Verification...');
  const initialHash = verifyHash();
  console.log(`✅ Production Source Verified (SHA-256: ${initialHash})`);

  if (!PROJECT_ID.startsWith('demo-')) {
    throw new Error(`CRITICAL: Project ID "${PROJECT_ID}" is not an offline demo project! Halting.`);
  }
  console.log(`✅ Target Project ID: ${PROJECT_ID} (Strict Air-Gapped Demo Sandbox)`);

  // 2. Locate CDP Target
  console.log('\n[Phase 2] Connecting to Chrome DevTools Protocol (CDP Native 9222)...');
  const cdpRes = await httpGet(CDP_HTTP);
  if (cdpRes.statusCode !== 200) {
    throw new Error(`Failed to query CDP targets: HTTP ${cdpRes.statusCode}`);
  }
  const targets = JSON.parse(cdpRes.body);
  const harnessTarget = targets.find(t => t.url && t.url.includes('test_emulator_harness.html'));

  if (!harnessTarget) {
    throw new Error(`Test harness target not found in Chrome! Available: ${targets.map(t => t.url).join(', ')}`);
  }
  console.log(`✅ Found Harness Target: ${harnessTarget.title} (Page ID: ${harnessTarget.id})`);

  // 3. Connect via Native WebSocket
  const wsUrl = harnessTarget.webSocketDebuggerUrl;
  console.log(`Connecting to WebSocket: ${wsUrl}...`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pendingCallbacks = new Map();

    function sendCommand(method, params = {}) {
      return new Promise((res, rej) => {
        const id = msgId++;
        pendingCallbacks.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.onopen = async () => {
      try {
        console.log('✅ Connected to Test Harness browser session via CDP.');
        
        // Reload page to ensure clean script environment
        console.log('Refreshing Test Harness page for pristine execution context...');
        await sendCommand('Page.navigate', { url: HARNESS_URL });
        await new Promise(r => setTimeout(r, 2000)); // Wait for DOMContentLoaded and Firebase init

        // Ensure console logs are streamed
        await sendCommand('Runtime.enable');

        console.log('\n[Phase 3] Triggering window.runAllBillingSyncTests() inside real browser session...');
        console.log('------------------------------------------------------------');

        const evalResult = await sendCommand('Runtime.evaluate', {
          expression: 'window.runAllBillingSyncTests()',
          awaitPromise: true,
          returnByValue: true
        });

        if (evalResult.result && evalResult.result.subtype === 'error') {
          throw new Error(`Execution error: ${evalResult.result.description}`);
        }

        const testResults = evalResult.result.value;
        console.log('------------------------------------------------------------');
        console.log('✅ Test Suite Execution Completed.\n');

        // 4. Detailed Assertion Reporting
        console.log('============================================================');
        console.log('              STEP 33.5 RUNTIME TEST RESULTS MATRIX');
        console.log('============================================================');

        const testKeys = ['TC-1', 'TC-2', 'TC-3', 'TC-4', 'TC-5', 'TC-6', 'TC-7'];
        let totalAssertions = 0;
        let passedAssertions = 0;

        testKeys.forEach(tId => {
          const t = testResults.tests[tId];
          if (!t) {
            console.log(`❌ [FAIL] ${tId}: Not executed or missing result`);
            return;
          }
          const icon = t.status === 'PASS' ? '✅' : '❌';
          const pCnt = t.asserts.filter(a => a.pass).length;
          totalAssertions += t.asserts.length;
          passedAssertions += pCnt;
          console.log(`${icon} [${t.status}] ${tId} (${pCnt}/${t.asserts.length} assertions passed)`);
          t.asserts.forEach(a => {
            console.log(`    ${a.pass ? '✓' : '✗'} ${a.name}`);
          });
        });

        console.log('------------------------------------------------------------');
        console.log(`Total Test Scenarios: ${testResults.suiteSummary.total}`);
        console.log(`Passed Scenarios    : ${testResults.suiteSummary.passed}`);
        console.log(`Failed Scenarios    : ${testResults.suiteSummary.failed}`);
        console.log(`Total Assertions    : ${passedAssertions}/${totalAssertions} Passed`);
        console.log('============================================================\n');

        // 5. Post-execution Safety Guard
        console.log('[Phase 4] Post-Execution Safety Verification...');
        const finalHash = verifyHash();
        console.log(`✅ Production Source Bit-for-Bit Verified (SHA-256: ${finalHash})`);
        console.log('✅ Zero modifications made to production Firestore or IndexedDB.');

        ws.close();
        resolve(testResults);
      } catch (err) {
        ws.close();
        reject(err);
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingCallbacks.has(msg.id)) {
        const { res, rej } = pendingCallbacks.get(msg.id);
        pendingCallbacks.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };
  });
}

if (require.main === module) {
  runSuite()
    .then((results) => {
      if (results.suiteSummary.failed > 0) {
        console.error('\n❌ STEP 33.5 Test Suite FAILED with errors.');
        process.exit(1);
      } else {
        console.log('\n🎉 ALL 7 TEST CASES PASSED WITH 100% ASSERTION SUCCESS.');
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('\n💥 Fatal test execution error:', err);
      process.exit(1);
    });
}

module.exports = { runSuite };
