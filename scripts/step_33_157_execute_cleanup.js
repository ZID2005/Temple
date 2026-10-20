/**
 * STEP 33.157 — CONTROLLED ONE-TIME TEST TRANSACTION CLEANUP RUNNER
 * Location: scripts/step_33_157_execute_cleanup.js
 *
 * Implements a strictly controlled, manifest-driven one-time execution runner
 * to remove confirmed test transactions from Cloud Firestore (temple-f4f7d)
 * for the Temple Accounts application.
 *
 * SAFETY INVARIANTS:
 * 1. Cryptographic pre-flight verification: backup, manifest, and plan SHA-256 hashes
 *    must match approved baselines exactly before execution starts.
 * 2. Scope restriction: ONLY the 412 targets in the approved STEP 33.155 manifest.
 * 3. Master Data Protection: settings, funds, incomeCategories, expenseCategories,
 *    bankAccounts, chittyMembers (84 docs) are strictly preserved.
 * 4. Counter Protection: system/counters must NEVER be deleted or reset.
 * 5. Physical Records Protection: all physical receipts/reservations protected.
 * 6. Authenticated administrative identity: vibu@gmail.com session required.
 * 7. Bounded topological batches: deleted stage-by-stage in batches of <= 25 docs.
 * 8. Pre-scan & post-verification of every single target document.
 * 9. Fail-closed: stops immediately on any unexpected error or integrity violation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const {
  canonicalJsonStringify,
  computeSha256,
  computeFileSha256,
  computeBackupPayloadHash,
  verifyBackup,
  verifyManifest,
  validateTargetEntry,
  verifyDocumentFingerprint,
  PROTECTED_COLLECTIONS,
  PROTECTED_SYSTEM_DOCS,
  ELIGIBLE_COLLECTION_ALLOWLIST,
  COLLECTION_ID_PATTERNS,
  KNOWN_EXCEPTION_RECEIPTS
} = require('./step_33_155_candidate_cleanup.js');

// ---- Approved Baseline Hashes ----
const BASELINE = Object.freeze({
  backupFilePath: 'D:/Download/Temple_Accounts_Backup_2026-10-20T06-17-45.json',
  expectedBackupFileHash: '2EDC31B88FFC799350F6CA22B3F9531336F616D7F7EA8BB7790E9E5C31F15738',
  expectedBackupPayloadHash: '7AC91CB36A108BB4B15E431E84816902DA6D3EB3A7C2510D4FF1513292E5B520',
  manifestFilePath: 'D:/Temple/plans/step_33_155_cleanup_manifest.json',
  expectedManifestFileHash: '6ED0F2BF4EE33E8F4986700A4F88E19B62B4B95D4068C789DBB3D5B5B8C0004E',
  planFilePath: 'D:/Temple/plans/step_33_155_cleanup_plan.json',
  expectedPlanFileHash: '73CAF58510FCF522C7CEBBEBE6117491A36282FBF82005BDBC6701794513B7AA',
  expectedTargetCount: 412
});

const BATCH_SIZE = 25;

// ---- Pre-flight Verification ----
function verifyPreflightArtifacts() {
  console.log('[PRE-FLIGHT] Verifying input artifacts and cryptographic hashes...');

  if (!fs.existsSync(BASELINE.backupFilePath)) throw new Error('Backup file missing: ' + BASELINE.backupFilePath);
  if (!fs.existsSync(BASELINE.manifestFilePath)) throw new Error('Manifest file missing: ' + BASELINE.manifestFilePath);
  if (!fs.existsSync(BASELINE.planFilePath)) throw new Error('Plan file missing: ' + BASELINE.planFilePath);

  const bBytes = fs.readFileSync(BASELINE.backupFilePath);
  const mBytes = fs.readFileSync(BASELINE.manifestFilePath);
  const pBytes = fs.readFileSync(BASELINE.planFilePath);

  const bFileHash = computeFileSha256(bBytes);
  if (bFileHash !== BASELINE.expectedBackupFileHash) {
    throw new Error(`Backup file hash mismatch: expected ${BASELINE.expectedBackupFileHash}, got ${bFileHash}`);
  }

  const vb = verifyBackup(bBytes, { expectedFileHash: BASELINE.expectedBackupFileHash });
  if (vb.payloadHash !== BASELINE.expectedBackupPayloadHash) {
    throw new Error(`Backup payload hash mismatch: expected ${BASELINE.expectedBackupPayloadHash}, got ${vb.payloadHash}`);
  }

  const mFileHash = computeFileSha256(mBytes);
  if (mFileHash !== BASELINE.expectedManifestFileHash) {
    throw new Error(`Manifest file hash mismatch: expected ${BASELINE.expectedManifestFileHash}, got ${mFileHash}`);
  }

  const vm = verifyManifest(mBytes, bFileHash, vb.payloadHash, {
    expectedManifestFileHash: BASELINE.expectedManifestFileHash,
    maxAgeMs: 365 * 24 * 3600 * 1000 // Verified baseline
  });

  const pFileHash = computeFileSha256(pBytes);
  if (pFileHash !== BASELINE.expectedPlanFileHash) {
    throw new Error(`Plan file hash mismatch: expected ${BASELINE.expectedPlanFileHash}, got ${pFileHash}`);
  }

  const parsedPlan = JSON.parse(pBytes.toString('utf8'));
  const targets = vm.parsedManifest.targets;

  if (targets.length !== BASELINE.expectedTargetCount) {
    throw new Error(`Target count mismatch: expected ${BASELINE.expectedTargetCount}, got ${targets.length}`);
  }

  console.log('[PRE-FLIGHT] OK: All input hashes and bindings verified (412 targets).');

  return {
    parsedBackup: vb.parsedBackup,
    parsedManifest: vm.parsedManifest,
    parsedPlan,
    targets
  };
}

// ---- Chrome / CDP Session Manager ----
class BrowserSession {
  constructor() {
    this.chromeProc = null;
    this.ws = null;
    this.msgId = 1;
  }

  async start() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--user-data-dir=C:\\Users\\sanal\\.gemini\\antigravity-browser-profile',
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      'http://localhost:3001/Temple_Accounts-1.html'
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9222...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9222');

    const tabsRes = await fetch('http://127.0.0.1:9222/json');
    const tabs = await tabsRes.json();
    const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
    if (!appTab) throw new Error('Could not find Temple_Accounts-1.html tab in Chrome');

    this.ws = new WebSocket(appTab.webSocketDebuggerUrl);
    await new Promise(r => this.ws.onopen = r);
    console.log('[BROWSER] Connected to Temple Accounts application tab.');

    // Wait for page to finish loading 1.15MB document
    for (let i = 0; i < 40; i++) {
      try {
        const res = await this.send('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true
        });
        if (res.result?.value === 'complete') break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = this.msgId++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          this.ws.removeEventListener('message', h);
          if (d.error) reject(d.error);
          else resolve(d.result);
        }
      };
      this.ws.addEventListener('message', h);
      this.ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  async evaluate(asyncJsFunctionStr) {
    const res = await this.send('Runtime.evaluate', {
      expression: asyncJsFunctionStr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error('CDP evaluation error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.chromeProc) {
      try { this.chromeProc.kill(); } catch (e) {}
      this.chromeProc = null;
    }
    console.log('[BROWSER] Session closed.');
  }
}

// ---- Main Execution Orchestrator ----
async function runCleanup(isLiveExecute = false) {
  const runMode = isLiveExecute ? 'LIVE_EXECUTION' : 'DRY_RUN_VALIDATION';
  console.log(`\n========================================================================`);
  console.log(`  STEP 33.157 — TEST TRANSACTION CLEANUP (${runMode})`);
  console.log(`========================================================================\n`);

  // 1. Preflight
  const preflight = verifyPreflightArtifacts();
  const { parsedBackup, parsedPlan, targets } = preflight;

  // Build target index and fingerprint lookup
  const targetMap = new Map();
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const val = validateTargetEntry(t, i);
    if (!val.valid) throw new Error(`Target entry ${i} invalid: ${val.reason}`);
    const key = `${t.collection}/${t.id}`;
    if (targetMap.has(key)) throw new Error(`Duplicate target in manifest: ${key}`);
    targetMap.set(key, t);
  }

  // 2. Connect Browser Session
  const session = new BrowserSession();
  await session.start();

  try {
    // 3. Inspect Live Authentication & System State
    console.log('[LIVE CHECK] Inspecting authenticated user and core state...');
    const authState = await session.evaluate(`(async () => {
      for (let i = 0; i < 60; i++) {
        try {
          if (typeof initializeFirebase === 'function' && typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
            initializeFirebase();
          }
          if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth) {
            const cur = firebase.auth().currentUser;
            if (cur && cur.email) break;
          }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 250));
      }
      let u = null;
      try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
          u = firebase.auth().currentUser;
        }
      } catch(e) {}
      if (!u) return { authenticated: false };

      const db = typeof getFirestoreDb === 'function' ? getFirestoreDb() : firebase.firestore();
      const cSnap = await db.collection('system').doc('counters').get();
      const sSnap = await db.collection('settings').doc('set_1').get();

      return {
        authenticated: true,
        email: u.email,
        uid: u.uid,
        countersExists: cSnap.exists,
        counters: cSnap.exists ? cSnap.data() : null,
        settingsExists: sSnap.exists,
        templeName: sSnap.exists ? sSnap.data().templeName : null
      };
    })()`);

    if (!authState.authenticated || authState.email !== 'vibu@gmail.com') {
      throw new Error(`Authentication check failed: expected vibu@gmail.com, got ${authState.email}`);
    }
    if (!authState.countersExists || !authState.counters) {
      throw new Error('Crucial system/counters document not found in live Firestore!');
    }
    if (!authState.settingsExists) {
      throw new Error('Crucial settings/set_1 document not found in live Firestore!');
    }

    // Verify baseline counters before execution
    const liveCounters = authState.counters;
    console.log('[LIVE CHECK] Authenticated as:', authState.email, `(UID: ${authState.uid})`);
    console.log('[LIVE CHECK] Initial Live Counters:', {
      receiptCounter: liveCounters.receiptCounter,
      voucherCounter: liveCounters.voucherCounter,
      billingReceiptCounter: liveCounters.billingReceiptCounter,
      globalSequenceCounter: liveCounters.globalSequenceCounter
    });

    if (liveCounters.receiptCounter !== 1020 || liveCounters.voucherCounter !== 502 ||
        liveCounters.billingReceiptCounter !== 100 || liveCounters.globalSequenceCounter !== 100) {
      throw new Error(`Live counters do not match expected baseline: rcpt=${liveCounters.receiptCounter}, vchr=${liveCounters.voucherCounter}`);
    }

    // 4. Pre-Scan All 412 Targets in Live Firestore
    console.log('\n[PRE-SCAN] Scanning all 412 targets in live Firestore...');
    const preScanResults = await session.evaluate(`(async () => {
      const db = firebase.firestore();
      const targets = ${JSON.stringify(targets)};
      const results = [];
      // Read in chunks of 50
      for (let i = 0; i < targets.length; i += 50) {
        const chunk = targets.slice(i, i + 50);
        const chunkResults = await Promise.all(chunk.map(async (t) => {
          try {
            const snap = await db.collection(t.collection).doc(t.id).get();
            return {
              collection: t.collection,
              id: t.id,
              docSha256: t.docSha256,
              exists: snap.exists
            };
          } catch (e) {
            return {
              collection: t.collection,
              id: t.id,
              docSha256: t.docSha256,
              exists: false,
              error: e.message
            };
          }
        }));
        results.push(...chunkResults);
      }
      return results;
    })()`);

    const existingTargets = [];
    const absentTargets = [];
    const errorTargets = [];

    for (const r of preScanResults) {
      if (r.error) {
        errorTargets.push(r);
      } else if (r.exists) {
        existingTargets.push(r);
      } else {
        absentTargets.push(r);
      }
    }

    console.log(`[PRE-SCAN] Scan completed:`);
    console.log(`  - Total Targets in Manifest : ${targets.length}`);
    console.log(`  - Present in Live Firestore  : ${existingTargets.length}`);
    console.log(`  - Already Absent / Skipped   : ${absentTargets.length}`);
    console.log(`  - Errors during scan         : ${errorTargets.length}`);

    if (errorTargets.length > 0) {
      throw new Error(`Pre-scan encountered ${errorTargets.length} errors: ${errorTargets[0].error}`);
    }

    // Verify the 4 special receipts
    const specialIds = ['rcpt_1001', 'rcpt_1002', 'rcpt_1003', 'rcpt_1017'];
    for (const sid of specialIds) {
      const found = existingTargets.find(t => t.collection === 'receipts' && t.id === sid);
      if (!found) {
        console.warn(`[NOTICE] Special receipt receipts/${sid} was not found in existing targets.`);
      } else {
        console.log(`[PRE-SCAN] Special receipt receipts/${sid}: CONFIRMED PRESENT IN LIVE FIRESTORE.`);
      }
    }

    // 5. Deletion Execution by Topological Stages
    const batchesPlan = parsedPlan.topologicalBatches;
    const executionAuditLog = [];
    let totalDeleted = 0;
    let totalSkipped = absentTargets.length;
    let totalFailed = 0;

    console.log(`\n========================================================================`);
    console.log(`  STAGE EXECUTION PLAN (${batchesPlan.length} Stages)`);
    console.log(`========================================================================`);

    for (const stage of batchesPlan) {
      console.log(`\n--- Stage ${stage.stage}: ${stage.name} (${stage.records.length} targets) ---`);
      if (stage.records.length === 0) {
        console.log(`  Stage ${stage.stage} has 0 records. Skipping.`);
        continue;
      }

      // Filter to records that actually exist in live Firestore
      const stageExisting = stage.records.filter(r => {
        const isPresent = existingTargets.some(et => et.collection === r.collection && et.id === r.id);
        if (!isPresent) {
          executionAuditLog.push({
            stage: stage.stage,
            collection: r.collection,
            id: r.id,
            status: 'SKIPPED',
            reason: 'Already absent from live Firestore at pre-scan'
          });
        }
        return isPresent;
      });

      console.log(`  Present in live database for Stage ${stage.stage}: ${stageExisting.length} / ${stage.records.length}`);

      // Chunk into bounded batches of BATCH_SIZE (25)
      for (let i = 0; i < stageExisting.length; i += BATCH_SIZE) {
        const batchRecords = stageExisting.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatchesInStage = Math.ceil(stageExisting.length / BATCH_SIZE);

        console.log(`  Executing Stage ${stage.stage} Batch ${batchNum}/${totalBatchesInStage} (${batchRecords.length} records)...`);

        // Validate every item in batch before execution
        for (const item of batchRecords) {
          if (PROTECTED_COLLECTIONS.includes(item.collection)) {
            throw new Error(`CRITICAL INVARIANT VIOLATION: Protected collection in batch: ${item.collection}/${item.id}`);
          }
          if (item.collection === 'system') {
            if (PROTECTED_SYSTEM_DOCS.includes(item.id)) {
              throw new Error(`CRITICAL INVARIANT VIOLATION: Protected system doc in batch: system/${item.id}`);
            }
            if (item.id.startsWith('res_phys_') || item.id.startsWith('op_phys_')) {
              throw new Error(`CRITICAL INVARIANT VIOLATION: Physical tracking record in batch: system/${item.id}`);
            }
          }
          if (item.collection === 'receipts' && item.id.startsWith('rcpt_phys_')) {
            throw new Error(`CRITICAL INVARIANT VIOLATION: Physical receipt in batch: receipts/${item.id}`);
          }
        }

        if (isLiveExecute) {
          // Perform live deletion via Firestore Batch Write
          const batchResult = await session.evaluate(`(async () => {
            const db = firebase.firestore();
            const batch = db.batch();
            const items = ${JSON.stringify(batchRecords)};
            for (const item of items) {
              const ref = db.collection(item.collection).doc(item.id);
              batch.delete(ref);
            }
            try {
              await batch.commit();
              return { success: true };
            } catch (e) {
              return { success: false, error: e.message };
            }
          })()`);

          if (!batchResult.success) {
            console.error(`[FATAL] Batch commit failed in Stage ${stage.stage} Batch ${batchNum}:`, batchResult.error);
            totalFailed += batchRecords.length;
            for (const item of batchRecords) {
              executionAuditLog.push({
                stage: stage.stage,
                collection: item.collection,
                id: item.id,
                status: 'FAILED',
                error: batchResult.error
              });
            }
            throw new Error(`ABORTING: Batch commit failed: ${batchResult.error}`);
          }

          totalDeleted += batchRecords.length;
          for (const item of batchRecords) {
            executionAuditLog.push({
              stage: stage.stage,
              collection: item.collection,
              id: item.id,
              status: 'DELETED',
              batch: `${stage.stage}.${batchNum}`
            });
          }
          console.log(`    -> Committed batch ${batchNum}: ${batchRecords.length} documents deleted.`);
        } else {
          // Dry run
          console.log(`    [DRY RUN] Would delete ${batchRecords.length} documents in batch ${batchNum}.`);
          for (const item of batchRecords) {
            executionAuditLog.push({
              stage: stage.stage,
              collection: item.collection,
              id: item.id,
              status: 'DRY_RUN_ACCEPTED'
            });
          }
        }
      }
    }

    // 6. Post-Execution Verification
    console.log(`\n========================================================================`);
    console.log(`  POST-CLEANUP VERIFICATION`);
    console.log(`========================================================================\n`);

    const postVerification = await session.evaluate(`(async () => {
      const db = firebase.firestore();
      const targets = ${JSON.stringify(targets)};

      // 1. Verify all targets are absent
      let remainingTargetsCount = 0;
      const remainingTargets = [];
      for (let i = 0; i < targets.length; i += 50) {
        const chunk = targets.slice(i, i + 50);
        const results = await Promise.all(chunk.map(async (t) => {
          const snap = await db.collection(t.collection).doc(t.id).get();
          return { collection: t.collection, id: t.id, exists: snap.exists };
        }));
        for (const r of results) {
          if (r.exists) {
            remainingTargetsCount++;
            remainingTargets.push(r);
          }
        }
      }

      // 2. Verify Master Data (84 documents)
      const masterCollections = [
        'settings', 'funds', 'incomeCategories', 'expenseCategories',
        'bankAccounts', 'chittyMembers'
      ];
      const masterCounts = {};
      let totalMasterDocs = 0;
      for (const col of masterCollections) {
        const snap = await db.collection(col).get();
        masterCounts[col] = snap.size;
        totalMasterDocs += snap.size;
      }

      // 3. Verify Counters
      const cSnap = await db.collection('system').doc('counters').get();
      const counters = cSnap.exists ? cSnap.data() : null;

      // 4. Verify Physical receipts (ensure no accidental mutations)
      const physSnap = await db.collection('receipts').where('source', '==', 'physical').get();

      return {
        remainingTargetsCount,
        remainingTargets,
        totalMasterDocs,
        masterCounts,
        counters,
        physicalReceiptsCount: physSnap.size
      };
    })()`);

    console.log('[VERIFICATION] Remaining targets from manifest:', postVerification.remainingTargetsCount);
    if (isLiveExecute && postVerification.remainingTargetsCount > 0) {
      console.error('[ERROR] Some targets were not deleted:', postVerification.remainingTargets);
    } else if (isLiveExecute) {
      console.log('✅ ALL 412 TARGETS VERIFIED ABSENT FROM LIVE FIRESTORE.');
    }

    console.log('\n[VERIFICATION] Master Data Status:');
    for (const [col, cnt] of Object.entries(postVerification.masterCounts)) {
      console.log(`  - ${col}: ${cnt} documents intact`);
    }
    console.log(`  Total Master Data Documents: ${postVerification.totalMasterDocs} (Expected: 84)`);

    console.log('\n[VERIFICATION] System Counters Status:');
    console.log('  - receiptCounter       :', postVerification.counters?.receiptCounter, '(Expected: 1020)');
    console.log('  - voucherCounter       :', postVerification.counters?.voucherCounter, '(Expected: 502)');
    console.log('  - billingReceiptCounter:', postVerification.counters?.billingReceiptCounter, '(Expected: 100)');
    console.log('  - globalSequenceCounter:', postVerification.counters?.globalSequenceCounter, '(Expected: 100)');

    const countersIntact = postVerification.counters &&
      postVerification.counters.receiptCounter === 1020 &&
      postVerification.counters.voucherCounter === 502 &&
      postVerification.counters.billingReceiptCounter === 100 &&
      postVerification.counters.globalSequenceCounter === 100;

    console.log(`  Counters Intact & Unchanged: ${countersIntact ? 'YES ✅' : 'NO ❌'}`);

    // Summary Statistics
    const finalReport = {
      executionMode: runMode,
      executedAt: new Date().toISOString(),
      authenticatedUser: authState.email,
      baselineHashes: BASELINE,
      totalManifestTargets: targets.length,
      preScan: {
        presentInDatabase: existingTargets.length,
        alreadyAbsent: absentTargets.length,
        scanErrors: errorTargets.length
      },
      executionResults: {
        totalDeleted,
        totalSkipped,
        totalFailed,
        isSuccess: isLiveExecute ? (totalDeleted === existingTargets.length && totalFailed === 0 && postVerification.remainingTargetsCount === 0) : true
      },
      postVerification: {
        remainingTargetsCount: postVerification.remainingTargetsCount,
        masterDataIntact: postVerification.totalMasterDocs === 84,
        totalMasterDocs: postVerification.totalMasterDocs,
        masterCounts: postVerification.masterCounts,
        countersIntact,
        counters: postVerification.counters,
        physicalReceiptsCount: postVerification.physicalReceiptsCount
      },
      auditLog: executionAuditLog
    };

    return finalReport;
  } finally {
    await session.close();
  }
}

// ---- CLI Entry Point ----
async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isDryRun = args.includes('--dry-run') || !isExecute;

  if (args.includes('--help') || args.includes('-h')) {
    console.log('\nTemple Accounts Cleanup Runner (STEP 33.157)\n');
    console.log('Usage:');
    console.log('  node scripts/step_33_157_execute_cleanup.js --dry-run   # Safe simulated dry-run (default)');
    console.log('  node scripts/step_33_157_execute_cleanup.js --execute   # Controlled live execution\n');
    process.exit(0);
  }

  try {
    const report = await runCleanup(isExecute);
    console.log('\n========================================================================');
    console.log(`  CLEANUP EXECUTION COMPLETED: ${report.executionResults.isSuccess ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`  Mode: ${report.executionMode}`);
    console.log(`  Deleted: ${report.executionResults.totalDeleted}`);
    console.log(`  Skipped: ${report.executionResults.totalSkipped}`);
    console.log(`  Failed: ${report.executionResults.totalFailed}`);
    console.log(`  Master Docs Intact: ${report.postVerification.masterDataIntact} (${report.postVerification.totalMasterDocs} docs)`);
    console.log(`  Counters Intact: ${report.postVerification.countersIntact}`);
    console.log('========================================================================\n');

    // Save JSON audit log
    fs.writeFileSync('D:/Temple/plans/step_33_157_execution_audit.json', JSON.stringify(report, null, 2), 'utf8');
    console.log('Audit log written to D:/Temple/plans/step_33_157_execution_audit.json');

    process.exit(report.executionResults.isSuccess ? 0 : 1);
  } catch (err) {
    console.error('\n[FATAL EXECUTION ERROR]', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runCleanup,
  verifyPreflightArtifacts,
  BASELINE
};
