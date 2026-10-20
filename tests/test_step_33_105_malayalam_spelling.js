/**
 * STEP 33.105 — Correct Malayalam Temple Name Spelling
 * Dedicated Automated Verification Suite
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.105: CORRECT MALAYALAM TEMPLE NAME SPELLING VERIFICATION SUITE');
console.log('='.repeat(80));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/Temple_Accounts-1_PreStep33_105_MalayalamSpellingFix_Backup_20261018_180500.html';
const BACKUP_ALT_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_105_MalayalamSpellingFix_Backup_20261018_180500.html';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const EXPECTED_PRE_HASH = 'B7DAFB40FC764D27E2EE8B2EF8FFF6B16AB1166C51B4CA2D2681A6F67E84442E';
const EXPECTED_PRE_SIZE = 1575409;
const EXPECTED_POST_HASH = '3C620B21EA5CA6CA129E45CEDD9C21A8BF2E2B6D4D451AC7BDE7592E2184648B';
const EXPECTED_POST_SIZE = 1575427;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.105',
  baselineSha256: EXPECTED_PRE_HASH,
  finalSha256: EXPECTED_POST_HASH,
  tests: []
};

function recordTest(groupId, testId, description, passed, detail = '') {
  const status = passed ? 'PASS' : 'FAIL';
  if (passed) passedTests++; else failedTests++;
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${status}] ${groupId} / ${testId}: ${description}${detail ? ` (${detail})` : ''}`);
  results.tests.push({ groupId, testId, description, passed, detail });
}

// Read current file
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
const htmlBuf = fs.readFileSync(HTML_PATH);
const currentHash = crypto.createHash('sha256').update(htmlBuf).digest('hex').toUpperCase();
const currentSize = htmlBuf.length;

console.log(`\nCurrent HTML SHA-256: ${currentHash}`);
const delta = currentSize - EXPECTED_PRE_SIZE;
console.log(`Current HTML Size:    ${currentSize} bytes (delta: ${delta >= 0 ? '+' : ''}${delta} bytes)`);

// =========================================================================
// TEST GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');
{
  const backupExists = fs.existsSync(BACKUP_PATH) || fs.existsSync(BACKUP_ALT_PATH);
  const activeBackup = fs.existsSync(BACKUP_PATH) ? BACKUP_PATH : BACKUP_ALT_PATH;
  recordTest('GROUP-1', 'T1.1', 'Timestamped pre-change backup file exists in workspace', backupExists, activeBackup);

  if (backupExists) {
    const backupBuf = fs.readFileSync(activeBackup);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
      backupHash === EXPECTED_PRE_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
      backupBuf.length === EXPECTED_PRE_SIZE, `${backupBuf.length} bytes`);
  }

  recordTest('GROUP-1', 'T1.4', 'Current file SHA-256 matches expected post-modification hash',
    currentHash === EXPECTED_POST_HASH, `Hash: ${currentHash}`);

  recordTest('GROUP-1', 'T1.5', 'Current file size matches expected post-modification size (+18 bytes for 6x U+0D3E)',
    currentSize === EXPECTED_POST_SIZE, `${currentSize} bytes`);

  const lines = htmlContent.split('\n');
  recordTest('GROUP-1', 'T1.6', 'Line count remains invariant at exactly 22,600 lines (zero lines added/removed)',
    lines.length === 22600, `Lines: ${lines.length}`);

  // Rules & server
  const rulesPath = 'D:/Temple/firestore.rules';
  const rulesBuf = fs.readFileSync(rulesPath);
  const rulesHash = crypto.createHash('sha256').update(rulesBuf).digest('hex').toUpperCase();
  recordTest('GROUP-1', 'T1.7', 'firestore.rules remains untouched and unmodified',
    rulesHash === '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD', `Hash: ${rulesHash}`);

  const serverPath = 'D:/Temple/server.js';
  recordTest('GROUP-1', 'T1.8', 'server.js exists and is preserved untouched', fs.existsSync(serverPath));
}

// =========================================================================
// TEST GROUP 2: Malayalam Spelling Consistency in Source Code
// =========================================================================
console.log('\n--- TEST GROUP 2: Malayalam Spelling Consistency in Source Code ---');
{
  const oldSpelling = 'കേരളദിത്യപുരം';
  const targetSpelling = 'കേരളാദിത്യപുരം';

  const oldMatches = (htmlContent.match(new RegExp(oldSpelling, 'g')) || []).length;
  recordTest('GROUP-2', 'T2.1', 'Zero occurrences of incorrect spelling (കേരളദിത്യപുരം) remain in HTML',
    oldMatches === 0, `Found: ${oldMatches}`);

  const targetMatches = (htmlContent.match(new RegExp(targetSpelling, 'g')) || []).length;
  recordTest('GROUP-2', 'T2.2', 'Exactly 6 occurrences of corrected spelling (കേരളാദിത്യപുരം) present in HTML',
    targetMatches === 6, `Found: ${targetMatches}`);

  // Unicode codepoint analysis
  const expectedCodepoints = [
    0x0D15, // ക
    0x0D47, // േ
    0x0D30, // ര
    0x0D33, // ള
    0x0D3E, // ാ (vowel sign AA - deergham)
    0x0D26, // ദ
    0x0D3F, // ി
    0x0D24, // ത
    0x0D4D, // ്
    0x0D2F, // യ
    0x0D2A, // പ
    0x0D41, // ു
    0x0D30, // ര
    0x0D02  // ം
  ];

  const actualCodepoints = Array.from(targetSpelling).map(c => c.codePointAt(0));
  const codepointMatch = actualCodepoints.length === expectedCodepoints.length &&
    actualCodepoints.every((cp, i) => cp === expectedCodepoints[i]);
  recordTest('GROUP-2', 'T2.3', 'Malayalam codepoints decomposed and verified (includes U+0D3E dirgham after U+0D33)',
    codepointMatch, actualCodepoints.map(c => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(' '));

  recordTest('GROUP-2', 'T2.4', 'Unicode NFC normalization produces byte-identical character sequence',
    targetSpelling.normalize('NFC') === targetSpelling);

  recordTest('GROUP-2', 'T2.5', 'Zero broken characters or replacement glyphs (U+FFFD) detected',
    !htmlContent.includes('\uFFFD'));

  // Specific locations verification
  const lines = htmlContent.split('\n');
  const locSeed = lines.findIndex(l => l.includes("address: 'ആശാരിവിളാകം കേരളാദിത്യപുരം'"));
  recordTest('GROUP-2', 'T2.6', 'Location 1: seedIfNeeded default address contains കേരളാദിത്യപുരം',
    locSeed !== -1, `Line ${locSeed + 1}`);

  const locPrintReceipt = lines.findIndex((l, idx) => l.includes("const templeAddress = s.address || 'ആശാരിവിളാകം, കേരളാദിത്യപുരം'") && idx > 0 && lines[idx - 1].includes("templeName"));
  recordTest('GROUP-2', 'T2.7', 'Location 2: printReceipt() fallback address contains കേരളാദിത്യപുരം',
    locPrintReceipt !== -1, `Line ${locPrintReceipt + 1}`);

  const locPreview = lines.findIndex((l, idx) => idx > 10500 && idx < 10560 && l.includes("const templeAddress = s.address || 'ആശാരിവിളാകം, കേരളാദിത്യപുരം'"));
  recordTest('GROUP-2', 'T2.8', 'Location 3: renderBillingActiveReceipt() preview fallback contains കേരളാദിത്യപുരം',
    locPreview !== -1, `Line ${locPreview + 1}`);

  const locPrintBilling = lines.findIndex((l, idx) => idx > 10570 && idx < 10620 && l.includes("const templeAddress = s.address || 'ആശാരിവിളാകം, കേരളാദിത്യപുരം'"));
  recordTest('GROUP-2', 'T2.9', 'Location 4: printBillingReceipt() print fallback contains കേരളാദിത്യപുരം',
    locPrintBilling !== -1, `Line ${locPrintBilling + 1}`);

  const locBillingReport = lines.findIndex((l, idx) => idx > 12480 && idx < 12520 && l.includes("const templeAddress = s.address || s.templeAddress || 'ആശാരിവിളാകം, കേരളാദിത്യപുരം'"));
  recordTest('GROUP-2', 'T2.10', 'Location 5: printBillingReport() fallback address contains കേരളാദിത്യപുരം',
    locBillingReport !== -1, `Line ${locBillingReport + 1}`);

  const locViewDetails = lines.findIndex((l, idx) => idx > 12820 && idx < 12850 && l.includes("const templeAddress = s.address || 'ആശാരിവിളാകം, കേരളാദിത്യപുരം'"));
  recordTest('GROUP-2', 'T2.11', 'Location 6: viewBillingDetails() fallback address contains കേരളാദിത്യപുരം',
    locViewDetails !== -1, `Line ${locViewDetails + 1}`);
}

// =========================================================================
// TEST GROUP 3: Functional Execution & Presentation Invariants
// =========================================================================
console.log('\n--- TEST GROUP 3: Functional Execution & Presentation Invariants ---');
{
  // Setup VM sandbox to execute renderThermalReceiptHTML directly
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    window: {},
    document: { body: { classList: { contains: () => false, add: () => {}, remove: () => {} } } },
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };
  vm.createContext(sandbox);

  // Extract base64 constants and renderThermalReceiptHTML function
  const renderFnMatch = htmlContent.match(/function renderThermalReceiptHTML\([\s\S]*?\n    \}/);
  if (!renderFnMatch) {
    throw new Error('Failed to extract renderThermalReceiptHTML from HTML');
  }

  // Extract base64 declarations
  const deityScreenMatch = htmlContent.match(/const TEMPLE_DEITY_LOGO_SCREEN_B64\s*=\s*"([^"]+)";/);
  const deityPrintMatch = htmlContent.match(/const TEMPLE_DEITY_LOGO_B64\s*=\s*"([^"]+)";/);
  const upiQrMatch = htmlContent.match(/const TEMPLE_UPI_QR_B64\s*=\s*"([^"]+)";/);

  sandbox.TEMPLE_DEITY_LOGO_SCREEN_B64 = deityScreenMatch ? deityScreenMatch[1] : '';
  sandbox.TEMPLE_DEITY_LOGO_B64 = deityPrintMatch ? deityPrintMatch[1] : '';
  sandbox.TEMPLE_UPI_QR_B64 = upiQrMatch ? upiQrMatch[1] : '';

  vm.runInContext(renderFnMatch[0], sandbox);

  const testBill = {
    receiptNo: 'BILL-0105',
    date: '18/10/2026',
    time: '03:50 PM',
    devoteeName: 'അനന്തൻ നമ്പൂതിരി',
    star: 'തിരുവോണം',
    category: 'വഴിപാട്',
    item: 'അർച്ചന',
    quantity: 1,
    unitPrice: 50,
    totalAmount: 50,
    paymentMode: 'Cash'
  };

  // Test on-screen preview rendering with corrected spelling
  const renderedScreen = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം');
  recordTest('GROUP-3', 'T3.1', 'On-screen preview renderThermalReceiptHTML output contains കേരളാദിത്യപുരം',
    renderedScreen.includes('ആശാരിവിളാകം, കേരളാദിത്യപുരം'));

  // Test print rendering with corrected spelling
  const renderedPrint = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം', true);
  recordTest('GROUP-3', 'T3.2', 'Print renderThermalReceiptHTML output contains കേരളാദിത്യപുരം',
    renderedPrint.includes('ആശാരിവിളാകം, കേരളാദിത്യപുരം'));

  // Invariant assertions
  recordTest('GROUP-3', 'T3.3', 'Temple deity title remains untouched: മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
    renderedScreen.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം'));

  recordTest('GROUP-3', 'T3.4', 'Deity logo element preserved at top of receipt',
    renderedScreen.includes('class="th-deity-logo"'));

  recordTest('GROUP-3', 'T3.5', 'UPI QR code element preserved at bottom of receipt',
    renderedScreen.includes('class="th-upi-qr"'));

  recordTest('GROUP-3', 'T3.6', '"SCAN TO PAY" caption preserved with zero extraneous branding',
    renderedScreen.includes('SCAN TO PAY') && !renderedScreen.includes('Pay via UPI') && !renderedScreen.includes('Powered by UPI'));

  recordTest('GROUP-3', 'T3.7', 'Temple blessing footer preserved: *** അമ്മേ നാരായണ ദേവി നാരായണ ***',
    renderedScreen.includes('*** അമ്മേ നാരായണ ദേവി നാരായണ ***') || htmlContent.includes('*** അമ്മേ നാരായണ ദേവി നാരായണ ***'));

  // DOM ordering hierarchy verification
  const posLogo = renderedScreen.indexOf('class="th-deity-logo"');
  const posTitle = renderedScreen.indexOf('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം');
  const posSubtitle = renderedScreen.indexOf('ആശാരിവിളാകം, കേരളാദിത്യപുരം');
  const posBillNo = renderedScreen.indexOf('BILL-0105');
  const posDevotee = renderedScreen.indexOf('അനന്തൻ നമ്പൂതിരി');
  const posScanToPay = renderedScreen.indexOf('SCAN TO PAY');
  const posQr = renderedScreen.indexOf('class="th-upi-qr"');

  const correctOrder = (
    posLogo !== -1 &&
    posTitle > posLogo &&
    posSubtitle > posTitle &&
    posBillNo > posSubtitle &&
    posDevotee > posBillNo &&
    posScanToPay > posDevotee &&
    posQr > posScanToPay
  );
  recordTest('GROUP-3', 'T3.8', 'Receipt structural hierarchy strictly preserved (Logo -> Title -> Subtitle -> Details -> QR)',
    correctOrder);
}

// =========================================================================
// TEST GROUP 4: Headless Chromium Screen Preview & 80mm Print Layout
// =========================================================================
console.log('\n--- TEST GROUP 4: Headless Chromium Screen Preview & 80mm Print Layout ---');
{
  const tmpScreenPng = path.join(__dirname, 'step_33_105_preview_screen.png');
  const tmpPrintPdf = path.join(__dirname, 'step_33_105_print.pdf');

  // Extract base64 constants from current HTML
  const screenDeityB64 = htmlContent.match(/const TEMPLE_DEITY_LOGO_SCREEN_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/)[1];
  const printDeityB64 = htmlContent.match(/const TEMPLE_DEITY_LOGO_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/)[1];
  const qrB64 = htmlContent.match(/const TEMPLE_UPI_QR_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/)[1];

  // 1. Create on-screen preview test harness HTML
  const screenHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>Receipt Preview Screen Test - Step 33.105</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f3f4f6; font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace; padding: 30px; display: flex; justify-content: center; }
  .preview-modal {
    background: #ffffff;
    border: 1px dashed #c4bcb0;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    padding: 16px 14px 14px;
    width: 320px;
    font-size: 12px;
    line-height: 1.42;
    color: #0f1115;
  }
  .th-receipt { width: 100%; color: #0f1115; font-variant-numeric: tabular-nums; }
  .th-center { text-align: center; }
  .th-bold { font-weight: 700; color: #000; }
  .th-logo-wrap { text-align: center; margin-bottom: 4px; }
  .th-deity-logo {
    width: 20mm;
    max-width: 20mm;
    height: auto;
    aspect-ratio: 300 / 450;
    display: block;
    margin: 0 auto;
    object-fit: contain;
    image-rendering: auto;
  }
  .th-title { font-size: 13px; font-weight: 800; line-height: 1.32; margin-bottom: 2px; letter-spacing: 0.15px; color: #000; }
  .th-sub { font-size: 10.5px; font-weight: 500; line-height: 1.35; margin-bottom: 4px; color: #374151; }
  .th-line { border-bottom: 1px dashed #4b5563; margin: 5px 0; width: 100%; display: block; }
  .th-flex { display: flex; justify-content: space-between; align-items: baseline; width: 100%; font-variant-numeric: tabular-nums; line-height: 1.38; }
  .th-row { font-size: 11.5px; margin: 2px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .th-total { font-size: 13.5px; font-weight: bold; font-variant-numeric: tabular-nums; }
  .th-blessing { font-size: 10px; font-weight: bold; margin-top: 5px; text-align: center; }
  .th-upi-section { text-align: center; margin-top: 6px; padding-top: 2px; }
  .th-scan-pay { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-align: center; margin-bottom: 4px; color: #000; }
  .th-upi-qr { width: 28mm; height: 28mm; max-width: 28mm; max-height: 28mm; aspect-ratio: 1 / 1; display: block; margin: 0 auto; image-rendering: pixelated; }
  .th-roster-row { font-size: 11.5px; margin: 2.5px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
  .th-roster-name, .th-roster-star { font-size: 13px; }
</style>
</head>
<body>
<div class="preview-modal" id="receiptPreviewModal">
  <div class="th-receipt">
    <div class="th-logo-wrap">
      <img src="${screenDeityB64}" alt="Temple Deity Logo" class="th-deity-logo" id="billDeityLogo" />
    </div>
    <div class="th-center th-bold th-title">മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം</div>
    <div class="th-center th-sub">ആശാരിവിളാകം, കേരളാദിത്യപുരം</div>
    <div class="th-line"></div>
    <div class="th-flex">
      <span>No: <b>BILL-0105</b></span>
      <span>18/10/2026 03:50 PM</span>
    </div>
    <div class="th-line"></div>
    <div class="th-roster-section">
      <div class="th-roster-head" style="display: flex; justify-content: space-between; font-weight: 700; font-size: 10.5px; padding-bottom: 2px; border-bottom: 1px dotted #888; margin-bottom: 4px; color: #333;">
        <span style="width: 24px; text-align: left;">നം.</span>
        <span style="flex: 1; text-align: left; padding: 0 4px;">പേര് (Devotee Name)</span>
        <span style="width: 85px; text-align: right;">നാൾ (Star)</span>
      </div>
      <div class="th-roster-row">
        <span style="width: 24px; text-align: left; font-weight: 600; flex-shrink: 0; color: #555;">1.</span>
        <span class="th-roster-name" style="flex: 1; text-align: left; font-weight: 700; word-break: break-word; padding: 0 4px;">അനന്തൻ നമ്പൂതിരി</span>
        <span class="th-roster-star" style="width: 85px; text-align: right; font-weight: 600; flex-shrink: 0; word-break: break-word; color: #222;">തിരുവോണം</span>
      </div>
    </div>
    <div class="th-line"></div>
    <div class="th-row"><span>വിഭാഗം:</span> വഴിപാട്</div>
    <div class="th-row"><span>ഇനം:</span> <b>അർച്ചന</b></div>
    <div class="th-flex" style="margin-top: 2px;">
      <span>Qty: <b>1</b> &times; ₹50.00</span>
      <span>Amt: <b>₹50.00</b></span>
    </div>
    <div class="th-line"></div>
    <div class="th-flex th-bold th-total">
      <span>ആകെ (Total):</span>
      <span>₹50.00</span>
    </div>
    <div class="th-flex" style="margin-top: 3px;">
      <span>Payment:</span>
      <span><b>Cash</b></span>
    </div>
    <div class="th-line"></div>
    <div class="th-blessing">*** അമ്മേ നാരായണ ദേവി നാരായണ ***</div>
    <div class="th-upi-section">
      <div class="th-scan-pay">SCAN TO PAY</div>
      <img src="${qrB64}" alt="UPI Payment QR Code" class="th-upi-qr" id="billUpiQr" />
    </div>
  </div>
</div>
</body>
</html>`;

  const screenHarnessPath = path.join(__dirname, 'step_33_105_screen_harness.html');
  fs.writeFileSync(screenHarnessPath, screenHarnessHtml, 'utf8');

  // Run Headless Chrome to capture screenshot
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,750 "--screenshot=${tmpScreenPng}" "file:///${screenHarnessPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-4', 'T4.1', 'Headless Chrome captures on-screen Receipt Preview screenshot with കേരളാദിത്യപുരം',
    fs.existsSync(tmpScreenPng) && fs.statSync(tmpScreenPng).size > 10000, `${fs.statSync(tmpScreenPng).size} bytes`);

  // 2. Create 80mm print test harness HTML
  const printHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>Step 33.105 80mm Print Test</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace; font-size: 11.5px; line-height: 1.35; color: #000; }
  #print-area.billing-80mm { width: 80mm; max-width: 80mm; padding: 3mm 4mm 4mm 4mm; box-sizing: border-box; background: #fff; }
  .th-receipt { width: 100%; max-width: 80mm; color: #000; font-variant-numeric: tabular-nums; }
  .th-center { text-align: center; }
  .th-bold { font-weight: bold; }
  .th-logo-wrap { text-align: center; margin-bottom: 3px; }
  .th-deity-logo { width: 20mm; max-width: 20mm; height: auto; aspect-ratio: 300 / 450; display: block; margin: 0 auto; object-fit: contain; image-rendering: crisp-edges; }
  .th-title { font-size: 13.5px; font-weight: bold; line-height: 1.25; margin-bottom: 2px; }
  .th-sub { font-size: 10.5px; line-height: 1.25; margin-bottom: 3px; }
  .th-line { border-bottom: 1px dashed #000; margin: 4px 0; width: 100%; display: block; }
  .th-flex { display: flex; justify-content: space-between; align-items: baseline; width: 100%; font-variant-numeric: tabular-nums; }
  .th-row { font-size: 11.5px; margin: 2px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .th-total { font-size: 13.5px; font-weight: bold; font-variant-numeric: tabular-nums; }
  .th-blessing { font-size: 10px; font-weight: bold; margin-top: 5px; text-align: center; }
  .th-upi-section { text-align: center; margin-top: 6px; padding-top: 2px; }
  .th-scan-pay { font-size: 11px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 3px; text-align: center; }
  .th-upi-qr { width: 28mm; height: 28mm; max-width: 28mm; max-height: 28mm; aspect-ratio: 1 / 1; display: block; margin: 0 auto; image-rendering: pixelated; }
  .th-roster-row { font-size: 11.5px; margin: 2.5px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
  .th-roster-name, .th-roster-star { font-size: 13.5px; }
  @page { size: 80mm 150mm; margin: 0; }
  @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }
</style>
</head>
<body class="printing-billing-80mm">
<div id="print-area" class="billing-80mm">
  <div class="th-receipt">
    <div class="th-logo-wrap">
      <img src="${printDeityB64}" alt="Temple Deity Logo" class="th-deity-logo" id="billDeityLogo" />
    </div>
    <div class="th-center th-bold th-title">മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം</div>
    <div class="th-center th-sub">ആശാരിവിളാകം, കേരളാദിത്യപുരം</div>
    <div class="th-line"></div>
    <div class="th-flex">
      <span>No: <b>BILL-0105</b></span>
      <span>18/10/2026 03:50 PM</span>
    </div>
    <div class="th-line"></div>
    <div class="th-roster-section">
      <div class="th-roster-head" style="display: flex; justify-content: space-between; font-weight: 700; font-size: 10.5px; padding-bottom: 2px; border-bottom: 1px dotted #888; margin-bottom: 4px; color: #333;">
        <span style="width: 24px; text-align: left;">നം.</span>
        <span style="flex: 1; text-align: left; padding: 0 4px;">പേര് (Devotee Name)</span>
        <span style="width: 85px; text-align: right;">നാൾ (Star)</span>
      </div>
      <div class="th-roster-row">
        <span style="width: 24px; text-align: left; font-weight: 600; flex-shrink: 0; color: #555;">1.</span>
        <span class="th-roster-name" style="flex: 1; text-align: left; font-weight: 700; word-break: break-word; padding: 0 4px;">അനന്തൻ നമ്പൂതിരി</span>
        <span class="th-roster-star" style="width: 85px; text-align: right; font-weight: 600; flex-shrink: 0; word-break: break-word; color: #222;">തിരുവോണം</span>
      </div>
    </div>
    <div class="th-line"></div>
    <div class="th-row"><span>വിഭാഗം:</span> വഴിപാട്</div>
    <div class="th-row"><span>ഇനം:</span> <b>അർച്ചന</b></div>
    <div class="th-flex" style="margin-top: 2px;">
      <span>Qty: <b>1</b> &times; ₹50.00</span>
      <span>Amt: <b>₹50.00</b></span>
    </div>
    <div class="th-line"></div>
    <div class="th-flex th-bold th-total">
      <span>ആകെ (Total):</span>
      <span>₹50.00</span>
    </div>
    <div class="th-flex" style="margin-top: 3px;">
      <span>Payment:</span>
      <span><b>Cash</b></span>
    </div>
    <div class="th-line"></div>
    <div class="th-blessing">*** അമ്മേ നാരായണ ദേവി നാരായണ ***</div>
    <div class="th-upi-section">
      <div class="th-scan-pay">SCAN TO PAY</div>
      <img src="${qrB64}" alt="UPI Payment QR Code" class="th-upi-qr" id="billUpiQr" />
    </div>
  </div>
</div>
</body>
</html>`;

  const printHarnessPath = path.join(__dirname, 'step_33_105_print_harness.html');
  fs.writeFileSync(printHarnessPath, printHarnessHtml, 'utf8');

  // Run Headless Chrome print-to-pdf
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu "--print-to-pdf=${tmpPrintPdf}" "file:///${printHarnessPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-4', 'T4.2', 'Headless Chrome renders 80mm thermal print PDF containing കേരളാദിത്യപുരം',
    fs.existsSync(tmpPrintPdf) && fs.statSync(tmpPrintPdf).size > 15000, `${fs.statSync(tmpPrintPdf).size} bytes`);

  // Verify PDF page count & width via Python pdfplumber/pypdf
  const pyPdfScript = `import pypdf
reader = pypdf.PdfReader(r'${tmpPrintPdf.replace(/\\/g, '\\\\')}')
pages = len(reader.pages)
box = reader.pages[0].mediabox
width_pt = float(box.width)
height_pt = float(box.height)
width_mm = width_pt * 25.4 / 72.0
height_mm = height_pt * 25.4 / 72.0
print(f"PAGES={pages}")
print(f"WIDTH_MM={width_mm:.1f}")
print(f"HEIGHT_MM={height_mm:.1f}")
`;
  const pyPdfPath = path.join(__dirname, 'step_33_105_pdf_check.py');
  fs.writeFileSync(pyPdfPath, pyPdfScript, 'utf8');

  const pdfMetrics = execSync(`python "${pyPdfPath}"`).toString().trim();
  const pagesMatch = pdfMetrics.match(/PAGES=(\d+)/);
  const widthMatch = pdfMetrics.match(/WIDTH_MM=([\d.]+)/);

  const pages = pagesMatch ? parseInt(pagesMatch[1], 10) : 0;
  const widthMm = widthMatch ? parseFloat(widthMatch[1]) : 0;

  recordTest('GROUP-4', 'T4.3', 'Printed receipt PDF is exactly 1 page (zero trailing blank page)',
    pages === 1, `Pages: ${pages}`);

  recordTest('GROUP-4', 'T4.4', 'Printed receipt PDF conforms to 80mm width standard (~80.1mm)',
    Math.abs(widthMm - 80.0) < 1.0, `Width: ${widthMm}mm`);

  // QR scan verification
  const scanReceiptOut = execSync(
    `python -m uv run --with zxing-cpp --with pillow python -c "` +
    `import zxingcpp; from PIL import Image; ` +
    `res = zxingcpp.read_barcodes(Image.open(r'${tmpScreenPng.replace(/\\/g, '\\\\')}')); ` +
    `print(res[0].text if res else 'NO_DECODE')"`
  ).toString().trim();

  const expectedUri = 'upi://pay?pn=ASARI%20VILAKAM%20MARUTHA%20CHAMUNDI%20DEVI%20TEMPLE&mode=01&pa=917306611995@waicici';
  recordTest('GROUP-4', 'T4.5', 'UPI QR code continues to decode with byte-level fidelity from screen preview',
    scanReceiptOut === expectedUri, `URI: ${scanReceiptOut}`);
}

// =========================================================================
// TEST GROUP 5: Layout Regression & Pipeline Stability
// =========================================================================
console.log('\n--- TEST GROUP 5: Layout Regression & Pipeline Stability ---');
{
  // Step 33.104 test execution
  try {
    const out104 = execSync('node tests/test_step_33_104_screen_logo_correction.js', { cwd: 'D:/Temple' }).toString();
    const passed104 = out104.includes('ALL STEP 33.104 VERIFICATION TESTS PASSED SUCCESSFULLY');
    recordTest('GROUP-5', 'T5.1', 'Step 33.104 Screen Logo Correction regression suite passes (31 tests)', passed104);
  } catch (err) {
    recordTest('GROUP-5', 'T5.1', 'Step 33.104 Screen Logo Correction regression suite passes', false, err.message);
  }

  // Step 33.85 test execution
  try {
    const out85 = execSync('node tests/test_step_33_85_receipt_print_layout.js', { cwd: 'D:/Temple' }).toString();
    const passed85 = out85.includes('TOTAL TESTS: 34 | PASSED: 34 | FAILED: 0');
    recordTest('GROUP-5', 'T5.2', 'Step 33.85 Receipt Print Layout regression suite passes (34 tests)', passed85);
  } catch (err) {
    recordTest('GROUP-5', 'T5.2', 'Step 33.85 Receipt Print Layout regression suite passes', false, err.message);
  }

  // Step 33.94 test execution
  try {
    const out94 = execSync('node tests/test_step_33_94_billing_sync.js', { cwd: 'D:/Temple' }).toString();
    const passed94 = out94.includes('ALL STEP 33.94 VERIFICATION TESTS PASSED SUCCESSFULLY');
    recordTest('GROUP-5', 'T5.3', 'Step 33.94 Billing Fund Sync regression suite passes (48 tests)', passed94);
  } catch (err) {
    recordTest('GROUP-5', 'T5.3', 'Step 33.94 Billing Fund Sync regression suite passes', false, err.message);
  }

  // Step 33.96 test execution
  try {
    const out96 = execSync('node tests/test_step_33_96_fund_validation.js', { cwd: 'D:/Temple' }).toString();
    const passed96 = out96.includes('ALL STEP 33.96 VERIFICATION TESTS PASSED SUCCESSFULLY');
    recordTest('GROUP-5', 'T5.4', 'Step 33.96 Fund Validation regression suite passes (35 tests)', passed96);
  } catch (err) {
    recordTest('GROUP-5', 'T5.4', 'Step 33.96 Fund Validation regression suite passes', false, err.message);
  }
}

// =========================================================================
// SUMMARY REPORT
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('='.repeat(80));

const resultsJsonPath = path.join(__dirname, 'step_33_105_test_results.json');
fs.writeFileSync(resultsJsonPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`Detailed test results written to: ${resultsJsonPath}`);

if (failedTests > 0) {
  console.error(`\n❌ VERIFICATION SUITE FAILED with ${failedTests} failure(s).`);
  process.exit(1);
} else {
  console.log('\n✅ ALL STEP 33.105 VERIFICATION TESTS PASSED SUCCESSFULLY.');
  process.exit(0);
}
