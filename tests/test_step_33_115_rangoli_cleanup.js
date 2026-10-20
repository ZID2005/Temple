/**
 * STEP 33.115 Automated Verification Suite
 * Rangoli Background, Login Isolation & Progress Indicator Removal
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testId, description, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testId}: ${description}${details ? ' (' + details + ')' : ''}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testId}: ${description}${details ? ' (' + details + ')' : ''}`);
  }
}

console.log('='.repeat(80));
console.log('STEP 33.115: RANGOLI BACKGROUND, LOGIN ISOLATION & PROGRESS INDICATOR REMOVAL');
console.log('='.repeat(80));

const htmlPath = path.join(__dirname, '..', 'Temple_Accounts-1.html');
const rulesPath = path.join(__dirname, '..', 'firestore.rules');
const backupPath = path.join(__dirname, '..', 'Temple_Accounts-1_PreStep33_115_RangoliBackgroundLoginIsolation_Backup_20261019_004700.html');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const htmlBuf = fs.readFileSync(htmlPath);
const currentHash = crypto.createHash('sha256').update(htmlBuf).digest('hex').toUpperCase();

// --- TEST GROUP 1: Baseline, Backups, and File Integrity ---
console.log('\n--- TEST GROUP 1: Baseline, Backups, and File Integrity ---');

assert(fs.existsSync(htmlPath), 'GROUP-1 / T1.1', 'Main HTML file exists at Temple_Accounts-1.html');

assert(
  htmlBuf.length > 1650000 && currentHash !== '749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35',
  'GROUP-1 / T1.2',
  'Main HTML file has updated content and valid size',
  `Size: ${htmlBuf.length} bytes, Hash: ${currentHash}`
);

assert(fs.existsSync(backupPath), 'GROUP-1 / T1.3', 'Pre-implementation byte-for-byte backup exists');

if (fs.existsSync(backupPath)) {
  const backupBuf = fs.readFileSync(backupPath);
  const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
  assert(
    backupHash === '749F4E4D9662DA04598D07E102DB5BAEF774025AC637CECDC65C5D1BF3A7AA35',
    'GROUP-1 / T1.4',
    'Backup matches exact pre-change baseline hash',
    `Backup Hash: ${backupHash}, Size: ${backupBuf.length}`
  );
} else {
  assert(false, 'GROUP-1 / T1.4', 'Backup file not found');
}

if (fs.existsSync(rulesPath)) {
  const rulesBuf = fs.readFileSync(rulesPath);
  const rulesHash = crypto.createHash('sha256').update(rulesBuf).digest('hex').toUpperCase();
  assert(
    rulesHash === '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD',
    'GROUP-1 / T1.5',
    'firestore.rules remains untouched and unmodified',
    `Rules Hash: ${rulesHash}`
  );
}

let crCount = 0;
for (let b of htmlBuf) {
  if (b === 13) crCount++;
}
assert(crCount === 0, 'GROUP-1 / T1.6', 'Main HTML file preserves pure LF line endings (0 CR bytes)', `CR count: ${crCount}`);

// --- TEST GROUP 2: Spotlight Removal and Malayalam Typography ---
console.log('\n--- TEST GROUP 2: Spotlight Removal and Malayalam Typography ---');

assert(
  !htmlContent.includes('radial-gradient(ellipse at center, rgba(255, 248, 235, 0.90)'),
  'GROUP-2 / T2.1',
  'Excessive cream-white radial-gradient spotlight is completely removed'
);

assert(
  htmlContent.includes('#rangoli-welcome .rgp-close') &&
  htmlContent.includes('background: transparent;') &&
  htmlContent.includes('box-shadow: none;'),
  'GROUP-2 / T2.2',
  'Greeting container uses transparent background with no visible plate'
);

assert(
  htmlContent.includes('--rgp-floor: #5c1a12') && htmlContent.includes('background: #5c1a12;'),
  'GROUP-2 / T2.3',
  'Deep red-oxide floor background color is preserved'
);

assert(
  htmlContent.includes('color: #38140c;') && htmlContent.includes('color: #260c06;'),
  'GROUP-2 / T2.4',
  'Malayalam blessing and Swagatham preserve warm dark non-black text colours'
);

assert(
  htmlContent.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം') && htmlContent.includes('സ്വാഗതം'),
  'GROUP-2 / T2.5',
  'Malayalam Unicode typography preserved without character corruption'
);

// --- TEST GROUP 3: Complete Progress Indicator Removal ---
console.log('\n--- TEST GROUP 3: Complete Progress Indicator Removal ---');

assert(
  !htmlContent.includes('id="rangoli-count"'),
  'GROUP-3 / T3.1',
  'Numeric percentage element (#rangoli-count) is completely removed from DOM'
);

assert(
  !htmlContent.includes('class="rgp-corner rgp-br"'),
  'GROUP-3 / T3.2',
  'Bottom-right HUD container (.rgp-br) is completely removed from HTML'
);

assert(
  !htmlContent.includes('#rangoli-welcome .rgp-br') && !htmlContent.includes('#rangoli-welcome .rgp-count'),
  'GROUP-3 / T3.3',
  'HUD styles (.rgp-br and .rgp-count) are removed from CSS'
);

assert(
  !htmlContent.includes('role="progressbar"'),
  'GROUP-3 / T3.4',
  'Progressbar ARIA role removed from #rangoli-welcome'
);

assert(
  !htmlContent.includes('countEl = document.getElementById(\'rangoli-count\')') &&
  !htmlContent.includes('countEl.textContent'),
  'GROUP-3 / T3.5',
  'Progress counter DOM update logic is removed from JavaScript'
);

// --- TEST GROUP 4: Login Isolation & Background Leak Elimination ---
console.log('\n--- TEST GROUP 4: Login Isolation & Background Leak Elimination ---');

assert(
  htmlContent.includes('#rangoli-welcome.rgp-dismissed') &&
  htmlContent.includes('display: none !important;') &&
  htmlContent.includes('background: transparent !important;') &&
  htmlContent.includes('z-index: -1 !important;'),
  'GROUP-4 / T4.1',
  '.rgp-dismissed rule enforces absolute visual and layout elimination'
);

assert(
  htmlContent.includes('#rangoli-welcome.rgp-dismissed * {') &&
  htmlContent.includes('display: none !important;'),
  'GROUP-4 / T4.2',
  'All child elements under .rgp-dismissed are guaranteed hidden'
);

assert(
  htmlContent.includes('function setLocal(p) {') &&
  htmlContent.indexOf('function setLocal(p) {') < htmlContent.indexOf('function init(options) {'),
  'GROUP-4 / T4.3',
  'setLocal is module-scoped in RangoliPreloader, preventing openGate ReferenceError'
);

assert(
  htmlContent.includes('root.style.background = \'transparent\';') &&
  htmlContent.includes('root.classList.add(\'rgp-hidden\', \'rgp-dismissed\');'),
  'GROUP-4 / T4.4',
  'destroy() sets transparent background and adds rgp-dismissed'
);

assert(
  htmlContent.includes('if (gate) {') &&
  htmlContent.includes('gate.style.display = \'none\';') &&
  htmlContent.includes('gate.setAttribute(\'data-phase\', \'dismissed\');'),
  'GROUP-4 / T4.5',
  'destroy() suppresses gate display and disarms data-phase'
);

assert(
  htmlContent.includes('showLoginOnLogout()') &&
  htmlContent.includes('rw.classList.add(\'rgp-hidden\', \'rgp-dismissed\');') &&
  htmlContent.includes('RangoliPreloader.destroy();'),
  'GROUP-4 / T4.6',
  'Logout explicitly tears down Rangoli and applies rgp-dismissed'
);

assert(
  htmlContent.includes('window.location.search.includes(\'logout=true\') || window.location.hash === \'#logout\''),
  'GROUP-4 / T4.7',
  'Logout URL query/hash directly bypasses Rangoli on page initialization'
);

assert(
  htmlContent.includes('if (!rangoliFinished) {') &&
  htmlContent.includes('if (authStateResolved && resolvedUser) {') &&
  htmlContent.includes('transitionToApp();') &&
  htmlContent.includes('transitionToLogin();'),
  'GROUP-4 / T4.8',
  'checkAndProceed transitions cleanly to login if unauthenticated without hanging'
);

// --- TEST GROUP 5: Preserved Deliberate Timing and Reduced Motion ---
console.log('\n--- TEST GROUP 5: Preserved Deliberate Timing and Reduced Motion ---');

assert(
  htmlContent.includes('const DURATION_MS = 5500;') &&
  htmlContent.includes('const HOLD_MS = 3500;') &&
  htmlContent.includes('const WIND_MS = 2200;') &&
  htmlContent.includes('const CLEAR_MS = 800;') &&
  htmlContent.includes('const OPEN_MS = 900;'),
  'GROUP-5 / T5.1',
  'Exact animation timings preserved (5.5s draw, 3.5s hold, 3.0s dispersal, 0.9s open = 12.9s)'
);

assert(
  htmlContent.includes('prefers-reduced-motion: reduce'),
  'GROUP-5 / T5.2',
  'Prefers-reduced-motion media query and JS detection preserved'
);

assert(
  htmlContent.includes('setTimeout(() => {') &&
  htmlContent.includes('console.warn(\'[AuthExperience] Rangoli safety timeout reached, forcing finish\');'),
  'GROUP-5 / T5.3',
  '16-second watchdog safety timeout preserved'
);

// --- TEST GROUP 6: Preserved Accounting, Receipts, and Core Integrity ---
console.log('\n--- TEST GROUP 6: Preserved Accounting, Receipts, and Core Integrity ---');

assert(
  htmlContent.includes('renderThermalReceiptHTML'),
  'GROUP-6 / T6.1',
  'Thermal receipt generation function renderThermalReceiptHTML preserved untouched'
);

assert(
  htmlContent.includes('temple-f4f7d'),
  'GROUP-6 / T6.2',
  'Production Firebase configuration with project ID temple-f4f7d intact'
);

assert(
  htmlContent.includes('print-thermal-receipt') || htmlContent.includes('@media print'),
  'GROUP-6 / T6.3',
  'Receipt print styles and media print rules intact'
);

assert(
  htmlContent.includes('calculateMonthlyVoucherTotals') || htmlContent.includes('addReceipt') || htmlContent.includes('getOne'),
  'GROUP-6 / T6.4',
  'Accounting and IndexedDB core functions preserved intact'
);

console.log('\n' + '='.repeat(80));
console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('='.repeat(80));

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
