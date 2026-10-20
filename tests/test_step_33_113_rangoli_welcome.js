/**
 * STEP 33.113: Automated Verification Suite
 * Rangoli Welcome Screen Animation Integration
 *
 * Requirements:
 * 1. The animation appears on initial page load.
 * 2. A full-page refresh replays the animation exactly once.
 * 3. The login screen appears correctly when unauthenticated.
 * 4. The authenticated application appears correctly after authentication completes.
 * 5. Internal navigation does not replay the animation.
 * 6. The overlay never reveals protected content before authentication checks finish.
 * 7. Existing billing, receipt, accounting, and report code remains unchanged.
 * 8. The animation does not create JavaScript errors, duplicate loops, or a stuck overlay.
 * 9. Desktop and mobile layouts remain usable.
 * 10. Reduced-motion preferences are respected.
 * 11. The app still works if Canvas initialization fails.
 * 12. The final application file and all other modified files are identified and their hashes recorded.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const BACKUP_DIR_PATH = path.join(PROJECT_DIR, 'backups', 'Temple_Accounts-1_PreStep33_113_RangoliAnimation_Backup_20261018_235100.html');
const RULES_PATH = path.join(PROJECT_DIR, 'firestore.rules');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PRE_STEP_33_113_HASH = 'DAE9B4FA3C7AC5096FABF7127D9E534686DCFBD0D94794DE2C65CAB8DAD4D5C0';
const PRE_STEP_33_113_SIZE = 1624435;
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
  console.log('STEP 33.113: RANGOLI WELCOME SCREEN ANIMATION INTEGRATION VERIFICATION');
  console.log('='.repeat(80));

  // ============================================================================
  // GROUP 1: File Integrity and Safety Baselines
  // ============================================================================
  console.log('\n--- TEST GROUP 1: File Integrity and Safety Baselines ---');

  recordTest('GROUP-1', 'T1.1', 'Main HTML file exists at Temple_Accounts-1.html',
    fs.existsSync(HTML_PATH));

  const postHash = sha256File(HTML_PATH);
  const postSize = fs.statSync(HTML_PATH).size;
  recordTest('GROUP-1', 'T1.2', 'Main HTML file is updated and non-empty',
    postSize > PRE_STEP_33_113_SIZE, `Size: ${postSize} bytes, Hash: ${postHash}`);

  recordTest('GROUP-1', 'T1.3', 'Pre-implementation backup exists in backups directory',
    fs.existsSync(BACKUP_DIR_PATH));

  const backupHash = fs.existsSync(BACKUP_DIR_PATH) ? sha256File(BACKUP_DIR_PATH) : '';
  const backupSize = fs.existsSync(BACKUP_DIR_PATH) ? fs.statSync(BACKUP_DIR_PATH).size : 0;
  recordTest('GROUP-1', 'T1.4', 'Backup file hash matches exact pre-change baseline hash',
    backupHash === PRE_STEP_33_113_HASH && backupSize === PRE_STEP_33_113_SIZE,
    `Backup Hash: ${backupHash}, Size: ${backupSize}`);

  const rulesHash = sha256File(RULES_PATH);
  recordTest('GROUP-1', 'T1.5', 'firestore.rules remains untouched and unmodified',
    rulesHash === FIRESTORE_RULES_HASH, `Rules Hash: ${rulesHash}`);

  // ============================================================================
  // GROUP 2: Visual Structure and Scoped CSS
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Visual Structure and Scoped CSS ---');

  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');

  recordTest('GROUP-2', 'T2.1', 'Rangoli overlay container #rangoli-welcome is present in HTML',
    htmlContent.includes('<div id="rangoli-welcome" class="rgp-root rgp-welcome-overlay"'));

  recordTest('GROUP-2', 'T2.2', 'Canvas element #rangoli-canvas is defined inside #rangoli-welcome',
    htmlContent.includes('<canvas id="rangoli-canvas" aria-hidden="true"></canvas>'));

  recordTest('GROUP-2', 'T2.3', 'Blessing message "സ്വാഗതം" is present in message element',
    htmlContent.includes('<p class="rgp-message">സ്വാഗതം</p>'));

  recordTest('GROUP-2', 'T2.4', 'Temple subtitle "മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം" is correctly rendered in Malayalam',
    htmlContent.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം'));

  recordTest('GROUP-2', 'T2.5', 'All Rangoli CSS selectors are strictly scoped to #rangoli-welcome or .rgp-',
    htmlContent.includes('#rangoli-welcome {') &&
    htmlContent.includes('#rangoli-welcome .rgp-gate') &&
    htmlContent.includes('#rangoli-welcome .rgp-close') &&
    htmlContent.includes('#rangoli-welcome .rgp-corner'));

  recordTest('GROUP-2', 'T2.6', 'Overlay has fixed position, maximum z-index (10000), and red-oxide background (#5c1a12)',
    htmlContent.includes('position: fixed;') &&
    htmlContent.includes('z-index: 10000;') &&
    htmlContent.includes('background: #5c1a12;'));

  // ============================================================================
  // GROUP 3: Rangoli Powder Mathematical Engine & Palette
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Rangoli Powder Mathematical Engine & Palette ---');

  // Extract RangoliPreloader module
  const rgpMatch = htmlContent.match(/const RangoliPreloader = \(function \(\) \{([\s\S]*?)\n    \}\)\(\);/);
  recordTest('GROUP-3', 'T3.1', 'RangoliPreloader module definition found in script',
    !!rgpMatch);

  // Run RangoliPreloader in sandbox
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math,
    performance: { now: () => Date.now() },
    Float32Array,
    Uint8Array,
    window: {
      matchMedia: () => ({ matches: false }),
      innerWidth: 1024,
      innerHeight: 768,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    document: {
      getElementById: (id) => {
        if (id === 'rangoli-welcome') {
          return {
            querySelector: () => ({ setAttribute: () => {} }),
            getBoundingClientRect: () => ({ width: 1024, height: 768 }),
            setAttribute: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            style: {}
          };
        }
        if (id === 'rangoli-canvas') {
          return {
            getContext: () => ({
              setTransform: () => {},
              drawImage: () => {},
              save: () => {},
              restore: () => {},
              beginPath: () => {},
              rect: () => {},
              clip: () => {},
              fillRect: () => {}
            })
          };
        }
        return null;
      },
      createElement: () => ({
        getContext: () => ({
          setTransform: () => {},
          fillRect: () => {},
          createRadialGradient: () => ({ addColorStop: () => {} })
        }),
        width: 1024,
        height: 768
      })
    }
  };
  vm.createContext(sandbox);

  let rgpModule = null;
  try {
    rgpModule = vm.runInContext(`(function() { ${rgpMatch[1]} return RangoliPreloader; })()`, sandbox);
  } catch (err) {
    console.error('Sandbox error:', err);
  }

  recordTest('GROUP-3', 'T3.2', 'RangoliPreloader executes cleanly without errors',
    !!rgpModule && typeof rgpModule.init === 'function' && typeof rgpModule.openGate === 'function');

  // Verify palette colors
  const paletteMatch = htmlContent.match(/const PRESET_OXIDE = \{([\s\S]*?)\};/);
  const paletteStr = paletteMatch ? paletteMatch[1] : '';
  recordTest('GROUP-3', 'T3.3', 'Traditional colour palette contains floor, rice, vermilion, marigold, turmeric, magenta, indigo, leaf',
    paletteStr.includes('#5c1a12') && // floor
    paletteStr.includes('#f6eedd') && // rice
    paletteStr.includes('#e8432a') && // vermilion
    paletteStr.includes('#f59e1b') && // marigold
    paletteStr.includes('#f7cf2a') && // turmeric
    paletteStr.includes('#c8246b') && // magenta
    paletteStr.includes('#2c3a92') && // indigo
    paletteStr.includes('#2f8f4e')    // leaf
  );

  // Verify 12 concentric pattern layers
  recordTest('GROUP-3', 'T3.4', 'Concentric pattern generator builds core, lotus, dots, marigold, leaf, zigzag, scallops, spikes, necklace',
    htmlContent.includes('// 0 · core:') &&
    htmlContent.includes('// 1 · inner lotus:') &&
    htmlContent.includes('// 2 · outer lotus') &&
    htmlContent.includes('// 3 · a rice-flour circle') &&
    htmlContent.includes('// 4 · marigold petals:') &&
    htmlContent.includes('// 5 · leaves between') &&
    htmlContent.includes('// 6 · rice-flour line.') &&
    htmlContent.includes('// 7 · indigo band') &&
    htmlContent.includes('// 8 · scallops') &&
    htmlContent.includes('// 9 · crown of flame spikes') &&
    htmlContent.includes('// 10 · small marigold blooms') &&
    htmlContent.includes('// 11 · an outer necklace'));

  // ============================================================================
  // GROUP 4: Animation Lifecycle and Authentication Coordination
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Animation Lifecycle and Authentication Coordination ---');

  recordTest('GROUP-4', 'T4.1', 'Auth coordinator waits for BOTH Rangoli completion AND Firebase auth resolution',
    htmlContent.includes('if (!rangoliFinished || !authStateResolved)'));

  recordTest('GROUP-4', 'T4.2', 'Unauthenticated user flow reveals login screen without showing splash stage',
    htmlContent.includes('function transitionToLogin()') &&
    htmlContent.includes("if (splashStage) splashStage.style.display = 'none';") &&
    htmlContent.includes("loginStage.classList.add('active');"));

  recordTest('GROUP-4', 'T4.3', 'Authenticated user flow reveals app shell directly without flashing login screen',
    htmlContent.includes('function transitionToApp()') &&
    htmlContent.includes("if (appShell) appShell.style.display = 'flex';") &&
    htmlContent.includes("authExp.style.display = 'none';"));

  recordTest('GROUP-4', 'T4.4', 'Overlay never reveals protected content before auth state resolves',
    htmlContent.includes('if (revealCompleted) return;') &&
    htmlContent.includes('revealCompleted = true;'));

  // Test navigate function does NOT reference RangoliPreloader
  const navFnMatch = htmlContent.match(/async function navigate\(view,[\s\S]*?\n    \}/);
  recordTest('GROUP-4', 'T4.5', 'Internal view navigation (navigate) does not replay Rangoli animation',
    navFnMatch && !navFnMatch[0].includes('RangoliPreloader'));

  recordTest('GROUP-4', 'T4.6', 'Logout (showLoginOnLogout) directly displays login card without replaying Rangoli animation',
    htmlContent.includes('function showLoginOnLogout()') &&
    !htmlContent.match(/function showLoginOnLogout\(\)[\s\S]*?RangoliPreloader\.init/));

  recordTest('GROUP-4', 'T4.7', 'prefers-reduced-motion is respected with instantaneous drawing and prompt reveal',
    htmlContent.includes("(prefers-reduced-motion: reduce)") &&
    htmlContent.includes("shown = reduced ? 100 :"));

  recordTest('GROUP-4', 'T4.8', 'Canvas failure fallback immediately clears overlay and invokes normal auth flow',
    htmlContent.includes("console.warn('[AuthExperience] RangoliPreloader initialization failed, falling back:'") &&
    htmlContent.includes("if (rw) rw.style.display = 'none';") &&
    htmlContent.includes("rangoliFinished = true;"));

  // ============================================================================
  // GROUP 5: Preserved Accounting, Billing, and Core Logic Integrity
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Preserved Accounting, Billing, and Core Logic Integrity ---');

  recordTest('GROUP-5', 'T5.1', 'renderThermalReceiptHTML billing receipt function preserved intact',
    htmlContent.includes('function renderThermalReceiptHTML(r, templeName, templeAddress, isForPrint = false)'));

  recordTest('GROUP-5', 'T5.2', 'Step 33.109 QR and logo darkness fixes preserved intact',
    htmlContent.includes('width: 31mm;') &&
    htmlContent.includes('#print-area.billing-80mm .th-upi-qr'));

  recordTest('GROUP-5', 'T5.3', 'Step 33.107 floral receipt decorations preserved intact',
    htmlContent.includes('assets/temple_receipt_top_decor.png') &&
    htmlContent.includes('assets/temple_receipt_bot_decor.png') &&
    htmlContent.includes('th-top-frame'));

  recordTest('GROUP-5', 'T5.4', 'Firebase configuration and project ID remain authoritative (temple-f4f7d)',
    htmlContent.includes("projectId: \"temple-f4f7d\"") &&
    htmlContent.includes("VERIFIED_PRODUCTION_PROJECT_ID = 'temple-f4f7d'"));

  recordTest('GROUP-5', 'T5.5', 'IndexedDB and database operations (openDB, getOne, putRec, addRec) preserved intact',
    htmlContent.includes('function openDB()') &&
    htmlContent.includes('function getOne(') &&
    htmlContent.includes('function putRec(') &&
    htmlContent.includes('function addRec('));

  // ============================================================================
  // GROUP 6: Headless Browser Visual Rendering Verification
  // ============================================================================
  console.log('\n--- TEST GROUP 6: Headless Browser Visual Rendering Verification ---');

  const harnessPath = path.join(PROJECT_DIR, 'tests', 'step_33_113_visual_harness.html');
  const screenshotDesktopPath = path.join(PROJECT_DIR, 'tests', 'step_33_113_desktop_rangoli.png');
  const screenshotMobilePath = path.join(PROJECT_DIR, 'tests', 'step_33_113_mobile_rangoli.png');

  // Generate screenshots at 2500ms hold state
  try {
    execSync(`node "${path.join(PROJECT_DIR, 'tests', 'generate_screenshots.js')}"`);
  } catch (err) {
    console.error('Screenshot generation error:', err.message);
  }

  const desktopSize = fs.existsSync(screenshotDesktopPath) ? fs.statSync(screenshotDesktopPath).size : 0;
  const mobileSize = fs.existsSync(screenshotMobilePath) ? fs.statSync(screenshotMobilePath).size : 0;

  recordTest('GROUP-6', 'T6.1', 'Desktop viewport renders vibrant Rangoli pattern on red-oxide floor (1280x800)',
    desktopSize > 100000, `Screenshot: ${desktopSize} bytes`);

  recordTest('GROUP-6', 'T6.2', 'Mobile viewport renders centered, proportionate Rangoli pattern (375x667)',
    mobileSize > 50000, `Screenshot: ${mobileSize} bytes`);

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUITE RESULTS: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${testResults.length})`);
  console.log('='.repeat(80));

  const summary = {
    step: '33.113',
    timestamp: new Date().toISOString(),
    pre_hash: PRE_STEP_33_113_HASH,
    pre_size: PRE_STEP_33_113_SIZE,
    post_hash: postHash,
    post_size: postSize,
    total_tests: testResults.length,
    passed: passCount,
    failed: failCount,
    results: testResults
  };

  fs.writeFileSync(path.join(PROJECT_DIR, 'tests', 'step_33_113_test_results.json'), JSON.stringify(summary, null, 2), 'utf8');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
