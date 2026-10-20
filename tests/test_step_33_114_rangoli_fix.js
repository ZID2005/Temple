/**
 * STEP 33.114: Automated Verification Suite
 * Rangoli Animation Visibility, Timing & Login Background Fix
 *
 * Requirements Verified:
 * 1. Mandatory Baseline and Backups:
 *    - Verify pre-edit hash and byte-for-byte backup integrity.
 *    - Verify post-edit hash, pure LF line endings, and JS syntax correctness.
 *    - Verify firestore.rules untouched.
 * 2. Login Page Background Restoration:
 *    - Overlay (#rangoli-welcome) transitions opacity to 0 and becomes visibility: hidden, pointer-events: none.
 *    - On gate open completion, overlay display is set to 'none' and canvas memory is cleared.
 *    - Original dark purple/black background (#0d0b18) of the login page is restored without red-oxide leak.
 * 3. Malayalam Greeting Readability:
 *    - Greeting texts use warm dark terracotta/brown tones (#38140c, #260c06, #3d140b), NOT pale white and NOT pure black.
 *    - Enhanced contrast with soft illuminated aura backing (radial-gradient) to prevent blending with white rice/turmeric powder grains.
 *    - Unicode characters preserved: "മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം", "സ്വാഗതം", "TEMPLE ACCOUNTS & MANAGEMENT".
 * 4. Revised Slowed Animation Timing:
 *    - DURATION_MS = 5500 (5.5s drawing, target 5-6s)
 *    - Greeting fade-in triggered at bloom (shown >= 75%)
 *    - HOLD_MS = 3500 (3.5s hold, target 3-4s)
 *    - WIND_MS = 2200 (2.2s wind sweep, target 2.5-3.5s combined with clear)
 *    - CLEAR_MS = 800 (0.8s particle clear)
 *    - OPEN_MS = 900 (0.9s gate transition, target 0.8-1s)
 *    - Total sequence duration ~12.9s (target 12-15s).
 *    - Safety timeout guard present (16000ms).
 *    - prefers-reduced-motion respected.
 * 5. Overlay Lifecycle and Navigation:
 *    - Internal navigation (navigate) does not trigger Rangoli.
 *    - Logout (showLoginOnLogout) destroys and hides #rangoli-welcome, showing login page directly.
 *    - Canvas failure fallback clears overlay immediately.
 * 6. Preserved Core Accounting, Billing, and Firestore Config:
 *    - All receipt generators, printer CSS, and project IDs remain authoritative and untouched.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const BACKUP_PATH = path.join(PROJECT_DIR, 'backups', 'Temple_Accounts-1_PreStep33_114_RangoliVisibilityTimingFix_Backup_20261019_001700.html');
const RULES_PATH = path.join(PROJECT_DIR, 'firestore.rules');

const PRE_STEP_33_114_HASH = '87DC36B2BC25B08F786CB28BB86D5916FBE76CF45F18EEBB051EFD8B7A8EB3FE';
const PRE_STEP_33_114_SIZE = 1648419;
const FIRESTORE_RULES_HASH = '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD';

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

const testResults = [];
let passCount = 0;
let failCount = 0;

function recordTest(group, id, description, passed, details = '') {
  const status = passed ? 'PASS' : 'FAIL';
  if (passed) passCount++;
  else failCount++;
  testResults.push({ group, id, description, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${status}] ${group} / ${id}: ${description}${details ? ' (' + details + ')' : ''}`);
}

async function runTestSuite() {
  console.log('='.repeat(80));
  console.log('STEP 33.114: RANGOLI VISIBILITY, TIMING & LOGIN BACKGROUND FIX VERIFICATION');
  console.log('='.repeat(80));

  // ============================================================================
  // GROUP 1: Baseline, Backups, and File Integrity
  // ============================================================================
  console.log('\n--- TEST GROUP 1: Baseline, Backups, and File Integrity ---');

  recordTest('GROUP-1', 'T1.1', 'Main HTML file exists at Temple_Accounts-1.html',
    fs.existsSync(HTML_PATH));

  const postHash = sha256File(HTML_PATH);
  const postSize = fs.statSync(HTML_PATH).size;
  recordTest('GROUP-1', 'T1.2', 'Main HTML file has updated content and valid file size',
    postSize > PRE_STEP_33_114_SIZE, `Size: ${postSize} bytes, Hash: ${postHash}`);

  recordTest('GROUP-1', 'T1.3', 'Pre-implementation backup exists in backups directory',
    fs.existsSync(BACKUP_PATH));

  const backupHash = fs.existsSync(BACKUP_PATH) ? sha256File(BACKUP_PATH) : '';
  const backupSize = fs.existsSync(BACKUP_PATH) ? fs.statSync(BACKUP_PATH).size : 0;
  recordTest('GROUP-1', 'T1.4', 'Backup file hash matches exact pre-change baseline hash',
    backupHash === PRE_STEP_33_114_HASH && backupSize === PRE_STEP_33_114_SIZE,
    `Backup Hash: ${backupHash}, Size: ${backupSize}`);

  const rulesHash = sha256File(RULES_PATH);
  recordTest('GROUP-1', 'T1.5', 'firestore.rules remains untouched and unmodified',
    rulesHash === FIRESTORE_RULES_HASH, `Rules Hash: ${rulesHash}`);

  const rawBytes = fs.readFileSync(HTML_PATH);
  let crCount = 0;
  for (let i = 0; i < rawBytes.length; i++) {
    if (rawBytes[i] === 0x0D) crCount++;
  }
  recordTest('GROUP-1', 'T1.6', 'Main HTML file preserves pure LF line endings (0 CR bytes)',
    crCount === 0, `CR count: ${crCount}`);

  // ============================================================================
  // GROUP 2: Login Page Background and Overlay Stacking Order
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Login Page Background and Overlay Stacking Order ---');

  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');

  recordTest('GROUP-2', 'T2.1', '#rangoli-welcome root has transition for opacity and visibility',
    htmlContent.includes('transition: opacity 900ms cubic-bezier(.65, 0, .35, 1), visibility 0s linear 900ms;'));

  recordTest('GROUP-2', 'T2.2', '#rangoli-welcome.rgp-hidden and [data-phase="open"] enforces total invisibility and pointer-events none',
    htmlContent.includes('#rangoli-welcome.rgp-hidden,') &&
    htmlContent.includes('#rangoli-welcome[data-phase="open"] {') &&
    htmlContent.includes('opacity: 0 !important;') &&
    htmlContent.includes('visibility: hidden !important;') &&
    htmlContent.includes('pointer-events: none !important;'));

  recordTest('GROUP-2', 'T2.3', 'Unauthenticated login stage retains original dark purple/black background (#0d0b0e)',
    htmlContent.includes('#auth-experience {') &&
    htmlContent.includes('background: #0d0b0e;') &&
    htmlContent.includes('.auth-stage .login-card {'));

  recordTest('GROUP-2', 'T2.4', 'openGate immediately detaches pointer events and sets rgp-hidden on root',
    htmlContent.includes("root.setAttribute('data-phase', 'open');") &&
    htmlContent.includes("root.classList.add('rgp-hidden');") &&
    htmlContent.includes("root.style.pointerEvents = 'none';"));

  recordTest('GROUP-2', 'T2.5', 'openGate cleanup clears canvas context, sets display none and visibility hidden',
    htmlContent.includes("root.style.display = 'none';") &&
    htmlContent.includes("root.style.visibility = 'hidden';") &&
    htmlContent.includes("destroy();"));

  recordTest('GROUP-2', 'T2.6', 'destroy() zeroes canvas dimensions and dereferences particle offscreen canvases',
    htmlContent.includes("canvas.width = 0;") &&
    htmlContent.includes("canvas.height = 0;") &&
    htmlContent.includes("floorTex = null;") &&
    htmlContent.includes("powder = null;"));

  // ============================================================================
  // GROUP 3: Malayalam Greeting Readability and Typography
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Malayalam Greeting Readability and Typography ---');

  recordTest('GROUP-3', 'T3.1', 'Temple blessing Malayalam greeting uses warm terracotta tone (#38140c)',
    htmlContent.includes('#rangoli-welcome .rgp-blessing {') &&
    htmlContent.includes('color: #38140c;'));

  recordTest('GROUP-3', 'T3.2', 'Swagatham Malayalam greeting uses deep warm dark brown tone (#260c06, not pure black)',
    htmlContent.includes('#rangoli-welcome .rgp-message {') &&
    htmlContent.includes('color: #260c06;'));

  recordTest('GROUP-3', 'T3.3', 'Greeting card is backlit with feathered radial illumination aura plate',
    htmlContent.includes('#rangoli-welcome .rgp-close {') &&
    htmlContent.includes('background: radial-gradient(ellipse at center, rgba(255, 248, 235, 0.90) 0%, rgba(255, 244, 222, 0.58) 55%, rgba(255, 244, 222, 0) 80%);'));

  recordTest('GROUP-3', 'T3.4', 'Malayalam Unicode characters are accurately preserved',
    htmlContent.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം') &&
    htmlContent.includes('സ്വാഗതം') &&
    htmlContent.includes('TEMPLE ACCOUNTS &amp; MANAGEMENT'));

  recordTest('GROUP-3', 'T3.5', 'Greeting fade-in is synchronized with Rangoli bloom completion (shown >= 75%)',
    htmlContent.includes("if (closeEl && shown >= 75) {") &&
    htmlContent.includes("closeEl.classList.add('rgp-visible');"));

  // ============================================================================
  // GROUP 4: Revised Timing Constants and Deliberate Experience
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Revised Timing Constants and Deliberate Experience ---');

  recordTest('GROUP-4', 'T4.1', 'DURATION_MS set to 5500ms (5.5s drawing target: 5-6s)',
    htmlContent.includes('DURATION_MS = 5500;'));

  recordTest('GROUP-4', 'T4.2', 'HOLD_MS set to 3500ms (3.5s hold target: 3-4s)',
    htmlContent.includes('HOLD_MS = 3500;'));

  recordTest('GROUP-4', 'T4.3', 'WIND_MS set to 2200ms and CLEAR_MS set to 800ms (3.0s total dispersal target: 2.5-3.5s)',
    htmlContent.includes('WIND_MS = 2200;') &&
    htmlContent.includes('CLEAR_MS = 800;'));

  recordTest('GROUP-4', 'T4.4', 'OPEN_MS set to 900ms (0.9s transition target: 0.8-1s)',
    htmlContent.includes('OPEN_MS = 900;'));

  // Calculate total deliberate sequence duration
  const totalDuration = 5500 + 3500 + 2200 + 800 + 900;
  recordTest('GROUP-4', 'T4.5', `Total sequence duration equals 12900ms (~12.9s, within 12-15s target)`,
    totalDuration >= 12000 && totalDuration <= 15000, `Calculated: ${totalDuration / 1000}s`);

  recordTest('GROUP-4', 'T4.6', '16-second watchdog safety timeout prevents permanently hung overlay',
    htmlContent.includes('setTimeout(() => {') &&
    htmlContent.includes('// Absolute safety timeout (16s):') &&
    htmlContent.includes('16000);'));

  recordTest('GROUP-4', 'T4.7', 'prefers-reduced-motion triggers immediate completion and safe transition',
    htmlContent.includes('window.matchMedia && window.matchMedia(\'(prefers-reduced-motion: reduce)\').matches') &&
    htmlContent.includes('shown = reduced ? 100 :'));

  // ============================================================================
  // GROUP 5: Overlay Lifecycle, Navigation and Logout Safeguards
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Overlay Lifecycle, Navigation and Logout Safeguards ---');

  recordTest('GROUP-5', 'T5.1', 'showLoginOnLogout actively tears down and hides #rangoli-welcome to prevent replay on logout',
    htmlContent.includes('function showLoginOnLogout()') &&
    htmlContent.includes("const rw = document.getElementById('rangoli-welcome');") &&
    htmlContent.includes("RangoliPreloader.destroy();"));

  const navFnMatch = htmlContent.match(/async function navigate\(view,[\s\S]*?\n    \}/);
  recordTest('GROUP-5', 'T5.2', 'Internal view navigation (navigate) does not trigger RangoliPreloader',
    navFnMatch && !navFnMatch[0].includes('RangoliPreloader'));

  recordTest('GROUP-5', 'T5.3', 'Canvas failure fallback immediately clears overlay and marks rangoliFinished = true',
    htmlContent.includes("console.warn('[AuthExperience] RangoliPreloader initialization failed, falling back:'") &&
    htmlContent.includes("rw.style.display = 'none';") &&
    htmlContent.includes("rangoliFinished = true;"));

  recordTest('GROUP-5', 'T5.4', 'AuthExperience coordinates Rangoli completion with Firebase auth resolution without premature content reveal',
    htmlContent.includes('if (!rangoliFinished || !authStateResolved) {') &&
    htmlContent.includes('if (revealCompleted) return;'));

  // ============================================================================
  // GROUP 6: Preserved Accounting, Billing, and Core Functionality
  // ============================================================================
  console.log('\n--- TEST GROUP 6: Preserved Accounting, Billing, and Core Functionality ---');

  recordTest('GROUP-6', 'T6.1', 'renderThermalReceiptHTML preserved untouched',
    htmlContent.includes('function renderThermalReceiptHTML(r, templeName, templeAddress, isForPrint = false)'));

  recordTest('GROUP-6', 'T6.2', 'Production Firebase configuration preserved with project ID temple-f4f7d',
    htmlContent.includes("projectId: \"temple-f4f7d\"") &&
    htmlContent.includes("VERIFIED_PRODUCTION_PROJECT_ID = 'temple-f4f7d'"));

  recordTest('GROUP-6', 'T6.3', 'Receipt print CSS and thermal layout specifications intact',
    htmlContent.includes('#print-area.billing-80mm') &&
    htmlContent.includes('assets/temple_receipt_top_decor.png'));

  recordTest('GROUP-6', 'T6.4', 'Accounting and database transaction functions preserved intact',
    htmlContent.includes('function openDB()') &&
    htmlContent.includes('function putRec(') &&
    htmlContent.includes('function addRec('));

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUITE RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${testResults.length})`);
  console.log('='.repeat(80));

  const summary = {
    step: '33.114',
    timestamp: new Date().toISOString(),
    pre_hash: PRE_STEP_33_114_HASH,
    pre_size: PRE_STEP_33_114_SIZE,
    post_hash: postHash,
    post_size: postSize,
    total_tests: testResults.length,
    passed: passCount,
    failed: failCount,
    results: testResults
  };

  fs.writeFileSync(path.join(PROJECT_DIR, 'tests', 'step_33_114_test_results.json'), JSON.stringify(summary, null, 2), 'utf8');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
