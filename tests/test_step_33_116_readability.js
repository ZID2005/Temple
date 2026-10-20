/**
 * STEP 33.116 Automated Verification Suite
 * Rangoli Greeting Text Readability & Quiet Backing Correction
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
console.log('STEP 33.116: RANGOLI GREETING TEXT READABILITY CORRECTION VERIFICATION');
console.log('='.repeat(80));

const htmlPath = path.join(__dirname, '..', 'Temple_Accounts-1.html');
const rulesPath = path.join(__dirname, '..', 'firestore.rules');
const backupPath = path.join(__dirname, '..', 'Temple_Accounts-1_PreStep33_116_RangoliGreetingReadability_Backup_20261019_104600.html');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const htmlBuf = fs.readFileSync(htmlPath);
const currentHash = crypto.createHash('sha256').update(htmlBuf).digest('hex').toUpperCase();

// --- TEST GROUP 1: Baseline, Backups, and File Integrity ---
console.log('\n--- TEST GROUP 1: Baseline, Backups, and File Integrity ---');

assert(fs.existsSync(htmlPath), 'GROUP-1 / T1.1', 'Main HTML file exists at Temple_Accounts-1.html');

assert(
  htmlBuf.length > 1650000 && currentHash !== '985909723BAFC070C624CDC0ADB5A998CD5025370F2BB79CB083E0F55BD10F28',
  'GROUP-1 / T1.2',
  'Main HTML file has updated content and valid size',
  `Size: ${htmlBuf.length} bytes, Hash: ${currentHash}`
);

assert(fs.existsSync(backupPath), 'GROUP-1 / T1.3', 'Pre-implementation byte-for-byte backup exists');

if (fs.existsSync(backupPath)) {
  const backupBuf = fs.readFileSync(backupPath);
  const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
  assert(
    backupHash === '985909723BAFC070C624CDC0ADB5A998CD5025370F2BB79CB083E0F55BD10F28',
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

// --- TEST GROUP 2: Quiet Red-Oxide Text Backing ---
console.log('\n--- TEST GROUP 2: Quiet Red-Oxide Text Backing ---');

assert(
  !htmlContent.includes('radial-gradient(ellipse at center, rgba(255, 248, 235, 0.90)'),
  'GROUP-2 / T2.1',
  'Cream-white radial spotlight is completely absent'
);

assert(
  htmlContent.includes('#rangoli-welcome .rgp-close') &&
  htmlContent.includes('radial-gradient(ellipse closest-side at center') &&
  htmlContent.includes('rgba(92, 26, 18, 0.94) 0%') &&
  htmlContent.includes('rgba(92, 26, 18, 0) 100%'),
  'GROUP-2 / T2.2',
  'Greeting container uses soft feathered red-oxide backing blending with #5c1a12 floor'
);

assert(
  htmlContent.includes('#rangoli-welcome .rgp-close') &&
  htmlContent.includes('box-shadow: none;'),
  'GROUP-2 / T2.3',
  'Backing eliminates rectangular/card shadow plate for seamless organic blend'
);

assert(
  htmlContent.includes('--rgp-floor: #5c1a12') && htmlContent.includes('background: #5c1a12;'),
  'GROUP-2 / T2.4',
  'Deep red-oxide floor background color is preserved'
);

// --- TEST GROUP 3: Typography and Contrast ---
console.log('\n--- TEST GROUP 3: Typography and Contrast ---');

assert(
  htmlContent.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം') &&
  htmlContent.includes('സ്വാഗതം') &&
  htmlContent.includes('TEMPLE ACCOUNTS &amp; MANAGEMENT'),
  'GROUP-3 / T3.1',
  'Exact Unicode Malayalam strings and English subtitle preserved without alteration'
);

assert(
  htmlContent.includes('#rangoli-welcome .rgp-blessing') &&
  htmlContent.includes('color: #f7eed8;'),
  'GROUP-3 / T3.2',
  'Temple blessing uses readable warm ivory / soft rice-flour tone (#f7eed8)'
);

assert(
  htmlContent.includes('#rangoli-welcome .rgp-message') &&
  htmlContent.includes('color: #fffaf0;') &&
  htmlContent.includes('font-weight: 700;'),
  'GROUP-3 / T3.3',
  'Swagatham greeting is dominant text in clear warm ivory (#fffaf0) with bold weight'
);

assert(
  htmlContent.includes('#rangoli-welcome .rgp-subnote') &&
  htmlContent.includes('color: rgba(253, 243, 224, 0.85);') &&
  htmlContent.includes('letter-spacing: .24em;'),
  'GROUP-3 / T3.4',
  'English subtitle uses muted warm ivory with high letter spacing'
);

assert(
  htmlContent.includes('--rgp-serif: "Gayathri", "Manjari", "Noto Serif Malayalam"') &&
  htmlContent.includes('font-family: var(--rgp-serif);'),
  'GROUP-3 / T3.5',
  'Malayalam-capable typography stack uses existing application fonts without new dependencies'
);

// --- TEST GROUP 4: Correct Layering & Overlay Lifecycle ---
console.log('\n--- TEST GROUP 4: Correct Layering & Overlay Lifecycle ---');

assert(
  htmlContent.includes('#rangoli-welcome .rgp-close') &&
  htmlContent.includes('z-index: 10;') &&
  htmlContent.includes('#rangoli-welcome .rgp-gate'),
  'GROUP-4 / T4.1',
  'Greeting card sits on z-index: 10 above Rangoli artwork canvas'
);

assert(
  htmlContent.includes('#rangoli-welcome.rgp-dismissed {') &&
  htmlContent.includes('display: none !important;') &&
  htmlContent.includes('background: transparent !important;'),
  'GROUP-4 / T4.2',
  '.rgp-dismissed rule enforces absolute dismissal and zero residual layers'
);

assert(
  htmlContent.includes("root.classList.add('rgp-hidden', 'rgp-dismissed');") &&
  htmlContent.includes("root.style.background = 'transparent';"),
  'GROUP-4 / T4.3',
  'destroy() sets transparent background and adds rgp-dismissed'
);

assert(
  htmlContent.includes('#auth-experience {') &&
  htmlContent.includes('background: #0d0b0e;'),
  'GROUP-4 / T4.4',
  'Original dark purple/black WebGL login screen (#0d0b0e) preserved untouched'
);

// --- TEST GROUP 5: Preserved Timings & Progress HUD Removal ---
console.log('\n--- TEST GROUP 5: Preserved Timings & Progress HUD Removal ---');

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
  !htmlContent.includes('id="rangoli-count"') &&
  !htmlContent.includes('class="rgp-corner rgp-br"'),
  'GROUP-5 / T5.2',
  'Numeric percentage HUD (#rangoli-count) remains completely removed'
);

assert(
  htmlContent.includes('prefers-reduced-motion: reduce'),
  'GROUP-5 / T5.3',
  'prefers-reduced-motion accessibility media query preserved'
);

// --- TEST GROUP 6: Preserved Accounting, Receipts, and Core Integrity ---
console.log('\n--- TEST GROUP 6: Preserved Accounting, Receipts, and Core Integrity ---');

assert(
  htmlContent.includes('function renderThermalReceiptHTML(r, templeName, templeAddress, isForPrint = false)'),
  'GROUP-6 / T6.1',
  'Thermal receipt generation function renderThermalReceiptHTML preserved untouched'
);

assert(
  htmlContent.includes('projectId: "temple-f4f7d"') &&
  htmlContent.includes("VERIFIED_PRODUCTION_PROJECT_ID = 'temple-f4f7d'"),
  'GROUP-6 / T6.2',
  'Production Firebase configuration with project ID temple-f4f7d intact'
);

assert(
  htmlContent.includes('#print-area.billing-80mm') &&
  htmlContent.includes('assets/temple_receipt_top_decor.png'),
  'GROUP-6 / T6.3',
  'Receipt print styles and media print rules intact'
);

assert(
  htmlContent.includes('function openDB()') &&
  htmlContent.includes('function putRec(') &&
  htmlContent.includes('function addRec('),
  'GROUP-6 / T6.4',
  'Accounting and IndexedDB core functions preserved intact'
);

console.log('\n' + '='.repeat(80));
console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
console.log('='.repeat(80));

if (failedTests > 0) {
  process.exit(1);
}
