/**
 * tests/test_step_33_40_production_isolation.js
 *
 * Automated Verification Suite for STEP 33.40:
 * Production Isolation, Clean Build & Local Deployment Verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const {
  validateConfig,
  generateConfigContent,
  generateFirebaseConfig
} = require('../scripts/generate-firebase-config');

console.log('================================================================');
console.log('STEP 33.40 VERIFICATION SUITE: PRODUCTION ISOLATION & CLEAN BUILD');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

const htmlPath = path.resolve(__dirname, '../Temple_Accounts-1.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// ====================================================================
// GROUP 1: PREFLIGHT & RELEASE FREEZE INTEGRITY
// ====================================================================
console.log('--- TEST GROUP 1: Preflight & Release Freeze Integrity ---');

const EXPECTED_FROZEN_RC_HASH = '5D80B5840F934A6794A22B5D4BFC8A01C86D41EDB6E3C68B7B47475801E01891';
const EXPECTED_FROZEN_CAND_RULES_HASH = 'B11D865A7A7D8FFE1435BBC9D115463DA5F6039830E5A9A9F33EBBFBD6F1728C';
// Authoritative candidate rules updated in STEP 33.51 (SEC-01 dual-path restore authorization & SEC-04 deletion lockdown)
const EXPECTED_CURRENT_CAND_RULES_HASH = 'E0D2F9D11DE6E92644339A3332566B16CD0A58360598EF70E60279B890DA902D';
const EXPECTED_ACTIVE_RULES_HASH = '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD';

const frozenRcPath = path.resolve(__dirname, '../backups/step_33_36_release_freeze_20261012/Temple_Accounts-1_v1.0.0_ReleaseCandidate_20261012.html');
assert(fs.existsSync(frozenRcPath), 'Frozen release candidate HTML exists in backup directory');
const actualFrozenRcHash = sha256File(frozenRcPath);
assert(actualFrozenRcHash === EXPECTED_FROZEN_RC_HASH, `Frozen release candidate SHA-256 remains intact: ${actualFrozenRcHash}`);

const frozenCandRulesPath = path.resolve(__dirname, '../backups/step_33_36_release_freeze_20261012/firestore.rules.candidate_hardened_20261012.rules');
assert(fs.existsSync(frozenCandRulesPath), 'Frozen candidate rules exist in backup directory');
const actualCandHash = sha256File(frozenCandRulesPath);
assert(actualCandHash === EXPECTED_FROZEN_CAND_RULES_HASH, `Frozen candidate rules SHA-256 matches: ${actualCandHash}`);

const frozenActiveRulesPath = path.resolve(__dirname, '../backups/step_33_36_release_freeze_20261012/firestore.rules.active_production_reference_20261012.rules');
assert(fs.existsSync(frozenActiveRulesPath), 'Frozen active rules reference exists in backup directory');
const actualActiveHash = sha256File(frozenActiveRulesPath);
assert(actualActiveHash === EXPECTED_ACTIVE_RULES_HASH, `Frozen active rules SHA-256 matches: ${actualActiveHash}`);

const activeRulesPath = path.resolve(__dirname, '../firestore.rules');
const activeRulesHash = sha256File(activeRulesPath);
assert(activeRulesHash === EXPECTED_ACTIVE_RULES_HASH, `Active firestore.rules untouched: ${activeRulesHash}`);

const activeCandRulesPath = path.resolve(__dirname, '../firestore.rules.candidate');
const activeCandRulesHash = sha256File(activeCandRulesPath);
assert(activeCandRulesHash === EXPECTED_CURRENT_CAND_RULES_HASH, `Active firestore.rules.candidate matches STEP 33.51 remediated rules: ${activeCandRulesHash}`);

const workingHtmlHash = sha256File(htmlPath);
assert(workingHtmlHash !== EXPECTED_FROZEN_RC_HASH, `Working HTML hash evolved for production isolation: ${workingHtmlHash}`);

// ====================================================================
// GROUP 2: PUBLIC VERCEL HOST EMULATOR LOCKOUT
// ====================================================================
console.log('\n--- TEST GROUP 2: Public Vercel Host Emulator Lockout ---');

// Extract isLocalEnvironment and isEmulatorModeActive functions from HTML
const envHelperMatch = htmlContent.match(/function isLocalEnvironment\(\) \{[\s\S]*?^}/m);
assert(!!envHelperMatch, 'isLocalEnvironment function found in Temple_Accounts-1.html');

const emuHelperMatch = htmlContent.match(/function isEmulatorModeActive\(\) \{[\s\S]*?^}/m);
assert(!!emuHelperMatch, 'isEmulatorModeActive function found in Temple_Accounts-1.html');

// Create sandbox to test environment helpers
function createEnvSandbox(hostname, search, protocol = 'https:') {
  const sandbox = {
    window: {
      location: {
        hostname,
        search,
        protocol
      }
    },
    console: {
      warn: (msg) => { sandbox._lastWarn = msg; },
      log: () => {},
      error: () => {}
    },
    _lastWarn: null
  };
  vm.createContext(sandbox);
  vm.runInContext(envHelperMatch[0], sandbox);
  vm.runInContext(emuHelperMatch[0], sandbox);
  return sandbox;
}

// 2.1 Public Vercel domain with ?emulator=true
const vercelSandbox = createEnvSandbox('temple-accounts.vercel.app', '?emulator=true');
const vercelIsLocal = vm.runInContext('isLocalEnvironment()', vercelSandbox);
const vercelIsEmu = vm.runInContext('isEmulatorModeActive()', vercelSandbox);
assert(vercelIsLocal === false, 'Public Vercel hostname (temple-accounts.vercel.app) is NOT detected as local environment');
assert(vercelIsEmu === false, 'Public Vercel deployment CANNOT enable emulator mode through ?emulator=true');
assert(vercelSandbox._lastWarn && vercelSandbox._lastWarn.includes('strictly disabled'), 'Security warning logged when emulator attempted on public host');

// 2.2 Custom production domain with ?emulator=true
const prodSandbox = createEnvSandbox('templeaccounts.org', '?emulator=true');
assert(vm.runInContext('isLocalEnvironment()', prodSandbox) === false, 'Production custom domain is NOT local');
assert(vm.runInContext('isEmulatorModeActive()', prodSandbox) === false, 'Production custom domain strictly rejects ?emulator=true');

// 2.3 Localhost with ?emulator=true
const localSandbox = createEnvSandbox('localhost', '?emulator=true', 'http:');
assert(vm.runInContext('isLocalEnvironment()', localSandbox) === true, 'localhost is recognized as local environment');
assert(vm.runInContext('isEmulatorModeActive()', localSandbox) === true, 'localhost allows ?emulator=true for testing workflows');

// 2.4 127.0.0.1 with ?emulator=true
const loopbackSandbox = createEnvSandbox('127.0.0.1', '?emulator=true', 'http:');
assert(vm.runInContext('isLocalEnvironment()', loopbackSandbox) === true, '127.0.0.1 is recognized as local environment');
assert(vm.runInContext('isEmulatorModeActive()', loopbackSandbox) === true, '127.0.0.1 allows ?emulator=true for testing workflows');

// 2.5 Localhost without ?emulator=true
const localNoEmuSandbox = createEnvSandbox('localhost', '', 'http:');
assert(vm.runInContext('isEmulatorModeActive()', localNoEmuSandbox) === false, 'localhost without ?emulator=true runs standard mode');

// 2.6 DB_NAME evaluates correctly on public host
assert(htmlContent.includes("const DB_NAME = isEmulatorModeActive() ? 'temple_accounts_test_db' : 'temple_accounts_db';"), 'DB_NAME utilizes isEmulatorModeActive()');
const dbNameVercel = vm.runInContext("isEmulatorModeActive() ? 'temple_accounts_test_db' : 'temple_accounts_db'", vercelSandbox);
assert(dbNameVercel === 'temple_accounts_db', 'DB_NAME on Vercel deployment resolves to production "temple_accounts_db" even with ?emulator=true');

// ====================================================================
// GROUP 3: PRODUCTION FIREBASE INITIALIZATION & PROJECT VERIFICATION
// ====================================================================
console.log('\n--- TEST GROUP 3: Authoritative Project Verification ---');

assert(htmlContent.includes("const VERIFIED_PRODUCTION_PROJECT_ID = 'temple-f4f7d';"), 'VERIFIED_PRODUCTION_PROJECT_ID constant declared in Temple_Accounts-1.html');

// Test initializeFirebase sandbox
function testFirebaseInit(cfg, isEmulator = false) {
  let initAppCalled = null;
  const sandbox = {
    window: {
      location: {
        hostname: isEmulator ? 'localhost' : 'temple-accounts.vercel.app',
        search: isEmulator ? '?emulator=true' : '',
        protocol: isEmulator ? 'http:' : 'https:'
      },
      FIREBASE_CONFIG: cfg
    },
    firebase: {
      apps: [],
      initializeApp: (config) => { initAppCalled = config; sandbox.firebase.apps.push(config); },
      auth: () => ({ useEmulator: () => {} }),
      firestore: () => ({ useEmulator: () => {} })
    },
    console: {
      log: () => {},
      warn: (msg) => { sandbox._lastWarn = msg; },
      error: (msg) => { sandbox._lastError = msg; }
    },
    _lastWarn: null,
    _lastError: null,
    initializeFirestore: () => {}
  };

  vm.createContext(sandbox);
  vm.runInContext(envHelperMatch[0], sandbox);
  vm.runInContext(emuHelperMatch[0], sandbox);

  // Extract initializeFirebase function from HTML
  const initFnMatch = htmlContent.match(/function initializeFirebase\(\) \{[\s\S]*?^}/m);
  vm.runInContext("const defaultFirebaseConfig = { apiKey: 'YOUR_FIREBASE_API_KEY', authDomain: 'temple-f4f7d.firebaseapp.com', projectId: 'temple-f4f7d', storageBucket: 'temple-f4f7d.firebasestorage.app', messagingSenderId: '769327766170', appId: '1:769327766170:web:deeb79f8bf804cab8e9d23' };", sandbox);
  vm.runInContext("const VERIFIED_PRODUCTION_PROJECT_ID = 'temple-f4f7d';", sandbox);
  vm.runInContext("const firebaseConfig = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) ? window.FIREBASE_CONFIG : defaultFirebaseConfig;", sandbox);
  vm.runInContext(initFnMatch[0], sandbox);

  const res = vm.runInContext('initializeFirebase()', sandbox);
  return { result: res, app: initAppCalled, warn: sandbox._lastWarn, error: sandbox._lastError };
}

// 3.1 Valid production config initialized
const validProdConfig = {
  apiKey: 'AIzaSyValidDummyKeyForTestVerificationOnly123',
  authDomain: 'temple-f4f7d.firebaseapp.com',
  projectId: 'temple-f4f7d',
  storageBucket: 'temple-f4f7d.firebasestorage.app',
  messagingSenderId: '769327766170',
  appId: '1:769327766170:web:deeb79f8bf804cab8e9d23'
};
const initValid = testFirebaseInit(validProdConfig, false);
assert(initValid.result !== null, 'Production initialization succeeds with verified project temple-f4f7d');
assert(initValid.app && initValid.app.projectId === 'temple-f4f7d', 'Initialized Firebase app uses verified project temple-f4f7d');

// 3.2 Unverified project ID rejected
const unverifiedConfig = {
  ...validProdConfig,
  projectId: 'attacker-unverified-project'
};
const initUnverified = testFirebaseInit(unverifiedConfig, false);
assert(initUnverified.result === null, 'Production initialization aborts when project ID is unverified');
assert(initUnverified.error && initUnverified.error.includes('Unverified Firebase project'), 'Logged security error identifying unverified project');
assert(initUnverified.app === null, 'No Firebase app initialized for unverified project');

// 3.3 Missing or placeholder API key rejected safely
const placeholderConfig = {
  ...validProdConfig,
  apiKey: 'YOUR_FIREBASE_API_KEY'
};
const initPlaceholder = testFirebaseInit(placeholderConfig, false);
assert(initPlaceholder.result === null, 'Production initialization safely aborts on placeholder API key');
assert(initPlaceholder.warn && initPlaceholder.warn.includes('Cloud synchronization disabled'), 'Warning logged and cloud synchronization disabled');

// 3.4 Build generator enforces temple-f4f7d
const validGenResult = validateConfig({
  apiKey: 'AIzaSyTestKey123',
  authDomain: 'temple-f4f7d.firebaseapp.com',
  projectId: 'temple-f4f7d',
  storageBucket: 'temple-f4f7d.firebasestorage.app',
  messagingSenderId: '769327766170',
  appId: '1:769327766170:web:test'
});
assert(validGenResult.valid === true, 'validateConfig accepts verified project temple-f4f7d');

const invalidProjResult = validateConfig({
  apiKey: 'AIzaSyTestKey123',
  authDomain: 'temple-f4f7d.firebaseapp.com',
  projectId: 'random-project-456',
  storageBucket: 'temple-f4f7d.firebasestorage.app',
  messagingSenderId: '769327766170',
  appId: '1:769327766170:web:test'
});
assert(invalidProjResult.valid === false, 'validateConfig rejects non-authoritative project ID');
assert(invalidProjResult.missing.some(m => m.includes('must match verified project "temple-f4f7d"')), 'Identified project mismatch in error report');

// ====================================================================
// GROUP 4: DIAGNOSTIC FUNCTIONS DISABLED IN PRODUCTION
// ====================================================================
console.log('\n--- TEST GROUP 4: Diagnostic Utilities Disabled in Production ---');

// Extract fsRunDiagnostics from HTML
const diagMatch = htmlContent.match(/async function fsRunDiagnostics\(\) \{[\s\S]*?^}/m);
assert(!!diagMatch, 'fsRunDiagnostics function found in Temple_Accounts-1.html');

async function testDiagExecution(hostname, isEmulator = false) {
  let docWritten = false;
  let docDeleted = false;
  let txRan = false;

  const sandbox = {
    window: {
      location: {
        hostname,
        search: isEmulator ? '?emulator=true' : '',
        protocol: isEmulator ? 'http:' : 'https:'
      },
      APP_SETTINGS: { templeName: 'Test' }
    },
    DB_VERSION: 3,
    firebase: {
      firestore: () => {}
    },
    getFirestoreDb: () => ({
      collection: (col) => ({
        doc: (id) => ({
          set: async () => { docWritten = true; },
          get: async () => ({ exists: true, data: () => ({ test: true }) }),
          delete: async () => { docDeleted = true; }
        })
      }),
      runTransaction: async (fn) => {
        txRan = true;
        return fn({
          get: async () => ({ exists: false }),
          set: () => {}
        });
      }
    }),
    getCurrentFirebaseUser: () => ({ uid: 'user123', email: 'test@example.com' }),
    console: {
      log: () => {},
      warn: (msg) => { sandbox._lastWarn = msg; },
      error: () => {}
    },
    _lastWarn: null
  };

  vm.createContext(sandbox);
  vm.runInContext(envHelperMatch[0], sandbox);
  vm.runInContext(emuHelperMatch[0], sandbox);
  vm.runInContext(diagMatch[0], sandbox);

  const report = await vm.runInContext('fsRunDiagnostics()', sandbox);
  return { report, docWritten, docDeleted, txRan, warn: sandbox._lastWarn };
}

(async () => {
  // 4.1 Production environment execution
  const prodDiag = await testDiagExecution('temple-accounts.vercel.app', false);
  assert(prodDiag.docWritten === false, 'Zero diagnostic documents written on production host');
  assert(prodDiag.docDeleted === false, 'Zero diagnostic documents deleted on production host');
  assert(prodDiag.txRan === false, 'Zero diagnostic transactions executed on production host');
  assert(prodDiag.report.testDocWriteReadDelete === false, 'testDocWriteReadDelete is false in production report');
  assert(prodDiag.report.counterTransactionTest === false, 'counterTransactionTest is false in production report');
  assert(prodDiag.report.errors.some(e => e.includes('disabled in production')), 'Security message recorded in report errors');
  assert(prodDiag.report.sdkLoaded === true, 'Read-only SDK presence check succeeded');
  assert(prodDiag.report.initialized === true, 'Read-only DB instance check succeeded');
  assert(prodDiag.report.authDetected === true, 'Read-only Auth presence check succeeded');
  assert(prodDiag.report.indexedDbIntact === true, 'Read-only IndexedDB integrity check succeeded');

  // 4.2 Local emulator execution
  const localDiag = await testDiagExecution('localhost', true);
  assert(localDiag.docWritten === true, 'Diagnostic write allowed in local emulator environment');
  assert(localDiag.docDeleted === true, 'Diagnostic delete allowed in local emulator environment');
  assert(localDiag.txRan === true, 'Diagnostic transaction allowed in local emulator environment');
  assert(localDiag.report.testDocWriteReadDelete === true, 'testDocWriteReadDelete succeeded in local emulator');

  // ====================================================================
  // GROUP 5: TEST CONFIRMATION BYPASS GUARD IN PRODUCTION
  // ====================================================================
  console.log('\n--- TEST GROUP 5: Test Hook Confirmation Bypass Guard ---');

  // Check deleteTransfer confirmation guard
  assert(htmlContent.includes('const isMockedConfirm = typeof window.confirm === \'function\' && !window.confirm.toString().includes(\'[native code]\');'), 'isMockedConfirm detects non-native window.confirm');
  assert(htmlContent.includes('if (isMockedConfirm && isLocalEnvironment()) {'), 'Mocked confirm bypass strictly requires isLocalEnvironment()');

  async function testDeleteConfirmGuard(hostname) {
    let modalOpened = false;
    let confirmCalled = false;

    const sandbox = {
      window: {
        location: {
          hostname,
          search: '',
          protocol: 'https:'
        },
        confirm: (msg) => { confirmCalled = true; return true; },
        isTransferDeleting: false
      },
      confirm: (msg) => { confirmCalled = true; return true; },
      getCurrentFirebaseUser: () => ({ uid: 'u1' }),
      fsGetOneSafe: async () => ({ id: 'tx_123', amount: 100, date: '2026-10-12', fromAcc: 'Cash', toAcc: 'Bank' }),
      fsVoidRecordSafe: async () => {},
      fmtMoney: (amt) => '₹' + amt,
      fmtDate: (d) => d,
      showDeleteTransferModal: () => { modalOpened = true; },
      navigate: async () => {},
      alert: () => {},
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };

    vm.createContext(sandbox);
    vm.runInContext(envHelperMatch[0], sandbox);

    // Extract deleteTransfer function from HTML
    const delFnMatch = htmlContent.match(/async function deleteTransfer\(id\) \{[\s\S]*?^}/m);
    vm.runInContext(delFnMatch[0], sandbox);

    // Execute deleteTransfer without second argument and await resolution
    await vm.runInContext('deleteTransfer("tx_123")', sandbox);
    return { modalOpened, confirmCalled };
  }

  // 5.1 On production host with mocked window.confirm: modal is displayed, bypass rejected
  const prodGuard = await testDeleteConfirmGuard('temple-accounts.vercel.app');
  assert(prodGuard.confirmCalled === false, 'Mocked window.confirm is NOT called on production host');
  assert(prodGuard.modalOpened === true, 'Confirmation modal showDeleteTransferModal() is enforced in production');

  // 5.2 On localhost with mocked window.confirm: test runner bypass permitted
  const localGuard = await testDeleteConfirmGuard('localhost');
  assert(localGuard.confirmCalled === true, 'Mocked window.confirm is permitted in isolated local test runner');
  assert(localGuard.modalOpened === false, 'Modal bypassed for automated local test runner');

  // ====================================================================
  // GROUP 6: MIGRATION SUBSYSTEM INTEGRITY
  // ====================================================================
  console.log('\n--- TEST GROUP 6: Migration Subsystem Integrity ---');

  assert(htmlContent.includes('const TempleMigration = (function() {'), 'TempleMigration module is intact in Temple_Accounts-1.html');
  assert(htmlContent.includes('window.TempleMigration = TempleMigration;'), 'window.TempleMigration is exposed');
  assert(htmlContent.includes('window.runMigrationDryRun = TempleMigration.runMigrationDryRun;'), 'window.runMigrationDryRun is exposed');
  assert(htmlContent.includes('window.runMigrationStaging = TempleMigration.runMigrationStaging;'), 'window.runMigrationStaging is exposed');
  assert(htmlContent.includes('window.validateMigrationStaging = TempleMigration.validateMigrationStaging;'), 'window.validateMigrationStaging is exposed');

  // Count lines in TempleMigration section
  const migrMatch = htmlContent.match(/const TempleMigration = \(function\(\) \{[\s\S]*?\}\)\(\);/);
  assert(!!migrMatch, 'TempleMigration IIFE extracted successfully');
  const migrLines = migrMatch[0].split('\n').length;
  assert(migrLines > 700, `TempleMigration preserves full legacy migration subsystem (${migrLines} lines)`);

  // ====================================================================
  // GROUP 7: BUILD & CONFIGURATION DELIVERY VERIFICATION
  // ====================================================================
  console.log('\n--- TEST GROUP 7: Build & Configuration Verification ---');

  // 7.1 Verify .gitignore shielding
  const gitignoreContent = fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf8');
  assert(gitignoreContent.includes('firebase-config.js'), '.gitignore includes firebase-config.js');
  assert(gitignoreContent.includes('.env'), '.gitignore includes .env');
  assert(gitignoreContent.includes('.vercel'), '.gitignore includes .vercel');
  assert(gitignoreContent.includes('backups/'), '.gitignore includes backups/');

  // 7.2 Run build with dummy non-secret values
  const dummyBuildPath = path.resolve(__dirname, '../scratch/dummy_build_config.js');
  const buildResult = generateFirebaseConfig({
    envSource: {
      FIREBASE_API_KEY: 'AIzaSyDummyTestKeyForBuildVerificationOnly',
      FIREBASE_AUTH_DOMAIN: 'temple-f4f7d.firebaseapp.com',
      FIREBASE_PROJECT_ID: 'temple-f4f7d',
      FIREBASE_STORAGE_BUCKET: 'temple-f4f7d.firebasestorage.app',
      FIREBASE_MESSAGING_SENDER_ID: '769327766170',
      FIREBASE_APP_ID: '1:769327766170:web:dummy'
    },
    localEnvPath: 'nonexistent.env',
    outputPath: dummyBuildPath,
    silentFail: true
  });
  assert(buildResult.success === true, 'Build generator succeeded with dummy configuration');
  assert(fs.existsSync(dummyBuildPath), 'Generated configuration file exists');
  const dummyFileContent = fs.readFileSync(dummyBuildPath, 'utf8');
  assert(dummyFileContent.includes('window.FIREBASE_CONFIG = {'), 'Generated file exports window.FIREBASE_CONFIG interface');
  assert(dummyFileContent.includes('"projectId": "temple-f4f7d"'), 'Configured projectId is temple-f4f7d');

  // 7.3 Redaction verification
  assert(!dummyFileContent.includes('process.env'), 'No raw process.env references in output');

  // 7.4 Required static assets presence
  assert(fs.existsSync(path.resolve(__dirname, '../Temple_Accounts-1.html')), 'Temple_Accounts-1.html exists in root');
  assert(fs.existsSync(path.resolve(__dirname, '../ogl.esm.js')), 'ogl.esm.js WebGL library exists in root');
  assert(fs.existsSync(path.resolve(__dirname, '../vercel.json')), 'vercel.json exists in root');
  assert(fs.existsSync(path.resolve(__dirname, '../package.json')), 'package.json exists in root');

  // ====================================================================
  // GROUP 8: VERCEL ROUTING & SHIELDING VERIFICATION
  // ====================================================================
  console.log('\n--- TEST GROUP 8: Vercel Routing & Shielding Local Simulation ---');

  const vercelRaw = fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8');
  const vercelConfig = JSON.parse(vercelRaw);

  function simulateVercelRequest(requestPath) {
    for (const rw of vercelConfig.rewrites) {
      const regex = new RegExp(`^${rw.source}$`);
      if (regex.test(requestPath)) {
        return {
          rewrittenTo: rw.destination,
          statusCode: rw.statusCode || 200
        };
      }
    }
    return {
      rewrittenTo: requestPath,
      statusCode: 200
    };
  }

  // 8.1 App serving routes
  assert(simulateVercelRequest('/').statusCode === 200, 'Root / returns 200');
  assert(simulateVercelRequest('/').rewrittenTo === '/Temple_Accounts-1.html', 'Root / rewrites to /Temple_Accounts-1.html');
  assert(simulateVercelRequest('/ogl.esm.js').statusCode === 200, '/ogl.esm.js is accessible (200)');
  assert(simulateVercelRequest('/firebase-config.js').statusCode === 200, '/firebase-config.js is accessible (200)');

  // 8.2 Shielded routes return 404
  const shieldedPaths = [
    '/backups/step_33_36_release_freeze_20261012/RELEASE_MANIFEST.md',
    '/tests/test_step_33_40_production_isolation.js',
    '/scripts/generate-firebase-config.js',
    '/reports/STEP_14_FIRESTORE_PRODUCTION_FOUNDATION_REPORT.md',
    '/logs/firebase-debug.log',
    '/scratch/test.js',
    '/.vscode/settings.json',
    '/.chrome_profile/data',
    '/firestore.rules',
    '/firestore.rules.candidate',
    '/.env',
    '/.env.example',
    '/firebase-config.example.js',
    '/server.js',
    '/.gitignore',
    '/package.json',
    '/firebase.json',
    '/firebase.emulator.json',
    '/README.md',
    '/STEP_33_39_VERCEL_CONFIGURATION_IMPLEMENTATION_REPORT.md'
  ];

  for (const sPath of shieldedPaths) {
    const res = simulateVercelRequest(sPath);
    assert(res.statusCode === 404, `Sensitive path "${sPath}" is shielded (HTTP 404)`);
  }

  // 8.3 Security Headers
  const headerRule = vercelConfig.headers.find(h => h.source === '/(.*)');
  assert(!!headerRule, 'Global security header rule exists');
  const getHeader = (name) => headerRule.headers.find(h => h.key === name);
  assert(getHeader('X-Frame-Options').value === 'DENY', 'X-Frame-Options is DENY');
  assert(getHeader('X-Content-Type-Options').value === 'nosniff', 'X-Content-Type-Options is nosniff');
  assert(getHeader('Referrer-Policy').value === 'strict-origin-when-cross-origin', 'Referrer-Policy is strict-origin-when-cross-origin');
  assert(getHeader('Content-Security-Policy').value.includes("frame-ancestors 'none'"), 'CSP enforces frame-ancestors none');
  assert(getHeader('Content-Security-Policy').value.includes("https://temple-f4f7d.firebaseapp.com"), 'CSP allows authoritative Firebase auth domain');

  // ====================================================================
  // SUMMARY
  // ====================================================================
  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    console.error('❌ SOME TESTS FAILED!');
    process.exit(1);
  } else {
    console.log('✨ ALL STEP 33.40 VERIFICATION TESTS PASSED SUCCESSFULLY! ✨\n');
  }
})();
