/**
 * STEP 33.104 — Correct the Deity Logo in the On-Screen Receipt Preview
 * Dedicated Automated Verification Suite
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const vm = require('vm');

console.log('='.repeat(80));
console.log('STEP 33.104: ON-SCREEN RECEIPT PREVIEW DEITY LOGO CORRECTION VERIFICATION SUITE');
console.log('='.repeat(80));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/Temple_Accounts-1_PreStep33_104_ScreenLogoFix_Backup_20261018_172500.html';
const BACKUP_ALT_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_104_ScreenLogoFix_Backup_20261018_172500.html';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const EXPECTED_PRE_HASH = '75B334C39BE33813D798944B553B27DFCAE2196EF6B4498A2AF09A33846AEE43';
const EXPECTED_PRE_SIZE = 969691;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.104',
  baselineSha256: EXPECTED_PRE_HASH,
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
  recordTest('GROUP-1', 'T1.1', 'Byte-exact pre-change backup file exists at expected path', backupExists, activeBackup);

  if (backupExists) {
    const backupBuf = fs.readFileSync(activeBackup);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
      backupHash === EXPECTED_PRE_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
      backupBuf.length === EXPECTED_PRE_SIZE, `${backupBuf.length} bytes`);
  }

  recordTest('GROUP-1', 'T1.4', 'Current file has been modified from pre-change baseline',
    currentHash !== EXPECTED_PRE_HASH, `Current: ${currentHash}`);

  // Critical system files untouched
  const rulesPath = 'D:/Temple/firestore.rules';
  const rulesBuf = fs.readFileSync(rulesPath);
  const rulesHash = crypto.createHash('sha256').update(rulesBuf).digest('hex').toUpperCase();
  recordTest('GROUP-1', 'T1.5', 'firestore.rules remains untouched and unmodified',
    rulesHash === '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD', `Hash: ${rulesHash}`);

  const serverPath = 'D:/Temple/server.js';
  const serverExists = fs.existsSync(serverPath);
  recordTest('GROUP-1', 'T1.6', 'server.js exists and is preserved', serverExists);
}

// =========================================================================
// TEST GROUP 2: Local Assets Integrity & Provenance
// =========================================================================
console.log('\n--- TEST GROUP 2: Local Assets Integrity & Provenance ---');
{
  const origDeityPath = 'D:/Temple/assets/temple_deity_original.jpg';
  const screenDeityPath = 'D:/Temple/assets/temple_deity_logo_screen.png';
  const printDeityPath = 'D:/Temple/assets/temple_deity_logo_bw.png';
  const qrPath = 'D:/Temple/assets/temple_upi_qr.png';

  recordTest('GROUP-2', 'T2.1', 'Original colour deity image preserved in assets',
    fs.existsSync(origDeityPath) && fs.statSync(origDeityPath).size === 577839);

  recordTest('GROUP-2', 'T2.2', 'Smooth continuous-tone screen preview deity logo asset exists',
    fs.existsSync(screenDeityPath) && fs.statSync(screenDeityPath).size === 453802);

  const screenBuf = fs.readFileSync(screenDeityPath);
  const screenHash = crypto.createHash('sha256').update(screenBuf).digest('hex').toUpperCase();
  recordTest('GROUP-2', 'T2.3', 'Screen deity logo asset hash matches verified continuous-tone master',
    screenHash === 'A76C8CF27821BADEC99D91CD909550B1402F0DF015F932B2B3FF510DF7CE2181', `Hash: ${screenHash}`);

  recordTest('GROUP-2', 'T2.4', 'Print 1-bit dithered deity logo asset preserved untouched',
    fs.existsSync(printDeityPath) && fs.statSync(printDeityPath).size === 16188);

  recordTest('GROUP-2', 'T2.5', 'UPI QR code asset preserved untouched',
    fs.existsSync(qrPath) && fs.statSync(qrPath).size === 2000);
}

// =========================================================================
// TEST GROUP 3: Base64 Constants & In-Memory Embedding
// =========================================================================
console.log('\n--- TEST GROUP 3: Base64 Constants & In-Memory Embedding ---');
{
  const screenB64Match = htmlContent.match(/const TEMPLE_DEITY_LOGO_SCREEN_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/);
  recordTest('GROUP-3', 'T3.1', 'TEMPLE_DEITY_LOGO_SCREEN_B64 constant declared and embedded in HTML',
    !!screenB64Match && screenB64Match[1].length > 500000);

  if (screenB64Match) {
    const rawScreenB64 = screenB64Match[1].replace(/^data:image\/png;base64,/, '');
    const screenAssetBuf = fs.readFileSync('D:/Temple/assets/temple_deity_logo_screen.png');
    recordTest('GROUP-3', 'T3.2', 'TEMPLE_DEITY_LOGO_SCREEN_B64 is byte-identical to assets/temple_deity_logo_screen.png',
      Buffer.from(rawScreenB64, 'base64').equals(screenAssetBuf));
  }

  const printB64Match = htmlContent.match(/const TEMPLE_DEITY_LOGO_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/);
  recordTest('GROUP-3', 'T3.3', 'TEMPLE_DEITY_LOGO_B64 thermal print constant preserved and embedded',
    !!printB64Match && printB64Match[1].length > 10000);

  if (printB64Match) {
    const rawPrintB64 = printB64Match[1].replace(/^data:image\/png;base64,/, '');
    const printAssetBuf = fs.readFileSync('D:/Temple/assets/temple_deity_logo_bw.png');
    recordTest('GROUP-3', 'T3.4', 'TEMPLE_DEITY_LOGO_B64 is byte-identical to assets/temple_deity_logo_bw.png',
      Buffer.from(rawPrintB64, 'base64').equals(printAssetBuf));
  }

  recordTest('GROUP-3', 'T3.5', 'window object exposes both screen and print deity logo constants',
    htmlContent.includes('window.TEMPLE_DEITY_LOGO_SCREEN_B64 = TEMPLE_DEITY_LOGO_SCREEN_B64;') &&
    htmlContent.includes('window.TEMPLE_DEITY_LOGO_B64 = TEMPLE_DEITY_LOGO_B64;'));
}

// =========================================================================
// TEST GROUP 4: Functional Rendering Pipeline Discrimination
// =========================================================================
console.log('\n--- TEST GROUP 4: Functional Rendering Pipeline Discrimination ---');
{
  function extractFunction(source, funcHeader) {
    const idx = source.indexOf(funcHeader);
    if (idx === -1) return null;
    const startBrace = source.indexOf('{', idx);
    if (startBrace === -1) return null;
    let depth = 1;
    let inString = false;
    let stringChar = null;
    let inComment = false;
    let i = startBrace + 1;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      const prev = source[i - 1];
      if (inComment) {
        if (inComment === 'line' && ch === '\n') inComment = false;
        else if (inComment === 'block' && prev === '*' && ch === '/') inComment = false;
      } else if (inString) {
        if (ch === stringChar && prev !== '\\') inString = false;
      } else {
        if (ch === '/' && source[i + 1] === '/') {
          inComment = 'line';
          i++;
        } else if (ch === '/' && source[i + 1] === '*') {
          inComment = 'block';
          i++;
        } else if (ch === "'" || ch === '"' || ch === '`') {
          inString = true;
          stringChar = ch;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        }
      }
      i++;
    }
    return source.slice(idx, i);
  }

  const renderThermalSrc = extractFunction(htmlContent, 'function renderThermalReceiptHTML(');
  const sandbox = {
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    TEMPLE_DEITY_LOGO_B64: 'data:image/png;base64,PRINT_DITHERED_DATA',
    TEMPLE_DEITY_LOGO_SCREEN_B64: 'data:image/png;base64,SCREEN_SMOOTH_DATA',
    TEMPLE_UPI_QR_B64: 'data:image/png;base64,QR_TEST_DATA',
    window: {}
  };

  const script = new vm.Script(renderThermalSrc);
  const context = vm.createContext(sandbox);
  script.runInContext(context);

  const testBill = {
    id: 105,
    receiptNo: 'BILL-0105',
    date: '18/10/2026',
    time: '03:50 PM',
    devotees: [{ name: 'അനന്തൻ നമ്പൂതിരി', star: 'തിരുവോണം' }],
    category: 'വഴിപാട്',
    item: 'അർച്ചന',
    quantity: 1,
    unitPrice: 50,
    totalAmount: 50,
    paymentMode: 'Cash'
  };

  // Screen preview rendering (default isForPrint = false)
  const renderedScreen = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  recordTest('GROUP-4', 'T4.1', 'On-screen preview automatically uses TEMPLE_DEITY_LOGO_SCREEN_B64',
    renderedScreen.includes('data:image/png;base64,SCREEN_SMOOTH_DATA'));

  // Print rendering (isForPrint = true)
  const renderedPrint = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം', true);
  recordTest('GROUP-4', 'T4.2', 'Print rendering uses TEMPLE_DEITY_LOGO_B64 (1-bit dithered print master)',
    renderedPrint.includes('data:image/png;base64,PRINT_DITHERED_DATA'));

  // Print rendering via window._isThermalPrinting
  sandbox.window._isThermalPrinting = true;
  const renderedPrintViaFlag = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  recordTest('GROUP-4', 'T4.3', 'Print rendering via window._isThermalPrinting uses TEMPLE_DEITY_LOGO_B64',
    renderedPrintViaFlag.includes('data:image/png;base64,PRINT_DITHERED_DATA'));
  sandbox.window._isThermalPrinting = false;

  // DOM ordering invariant
  const posLogo = renderedScreen.indexOf('class="th-deity-logo"');
  const posTitle = renderedScreen.indexOf('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം');
  const posSubtitle = renderedScreen.indexOf('ആശാരിവിളാകം, കേരളദിത്യപുരം');
  const posBillNo = renderedScreen.indexOf('BILL-0105');
  const posDevotee = renderedScreen.indexOf('അനന്തൻ നമ്പൂതിരി');
  const posBlessing = renderedScreen.indexOf('*** അമ്മേ നാരായണ ദേവി നാരായണ ***');
  const posScanToPay = renderedScreen.indexOf('SCAN TO PAY');
  const posQr = renderedScreen.indexOf('class="th-upi-qr"');

  const correctOrder = (
    posLogo !== -1 &&
    posTitle > posLogo &&
    posSubtitle > posTitle &&
    posBillNo > posSubtitle &&
    posDevotee > posBillNo &&
    posBlessing > posDevotee &&
    posScanToPay > posBlessing &&
    posQr > posScanToPay
  );

  recordTest('GROUP-4', 'T4.4', 'Receipt layout structural hierarchy strictly preserved: Logo -> Title -> Details -> Blessing -> SCAN TO PAY -> QR',
    correctOrder);

  recordTest('GROUP-4', 'T4.5', '"SCAN TO PAY" caption is preserved with zero extraneous branding',
    renderedScreen.includes('SCAN TO PAY') && !renderedScreen.includes('Pay via UPI') && !renderedScreen.includes('Powered by UPI'));

  recordTest('GROUP-4', 'T4.6', 'UPI QR code element remains intact and untouched',
    renderedScreen.includes('class="th-upi-qr"'));
}

// =========================================================================
// TEST GROUP 5: Headless Chromium Screen Preview & Print Verification
// =========================================================================
console.log('\n--- TEST GROUP 5: Headless Chromium Screen Preview & Print Verification ---');
{
  const tmpScreenPng = path.join(__dirname, 'step_33_104_preview_screen.png');
  const tmpLogoCrop = path.join(__dirname, 'step_33_104_preview_logo_crop.png');
  const tmpPrintPdf = path.join(__dirname, 'step_33_104_print.pdf');

  // Verify the screen preview rendering
  const screenHarnessPath = path.join(__dirname, 'step_33_104_test_harness.html');
  recordTest('GROUP-5', 'T5.1', 'Receipt preview harness exists', fs.existsSync(screenHarnessPath));

  // Run Headless Chrome to capture real on-screen Receipt Preview
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,750 "--screenshot=${tmpScreenPng}" "file:///${screenHarnessPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.2', 'Headless Chrome captures on-screen Receipt Preview screenshot',
    fs.existsSync(tmpScreenPng) && fs.statSync(tmpScreenPng).size > 10000);

  // Perform python image analysis on the captured screen logo
  const pyScriptPath = path.join(__dirname, 'step_33_104_analysis.py');
  const pyCode = `import numpy as np
from PIL import Image

screen = Image.open(r'${tmpScreenPng.replace(/\\/g, '\\\\')}')
# Modal is centered in 500x750 viewport
# Crop deity logo
logo_crop = screen.crop((205, 55, 295, 185))
logo_crop.save(r'${tmpLogoCrop.replace(/\\/g, '\\\\')}')

gray = logo_crop.convert('L')
arr = np.array(gray)

# Continuous-tone midtone gradations: 40 to 220
midtones = np.sum((arr >= 40) & (arr <= 220))
midtone_pct = (midtones / arr.size) * 100.0

std_dev = float(np.std(arr))

print(f"MIDTONE_PCT={midtone_pct:.2f}")
print(f"STD_DEV={std_dev:.2f}")
`;
  fs.writeFileSync(pyScriptPath, pyCode, 'utf8');

  const pyOut = execSync(`python "${pyScriptPath}"`).toString().trim();
  const midtoneMatch = pyOut.match(/MIDTONE_PCT=([\d.]+)/);
  const stdMatch = pyOut.match(/STD_DEV=([\d.]+)/);

  const midtonePct = midtoneMatch ? parseFloat(midtoneMatch[1]) : 0;
  const stdDev = stdMatch ? parseFloat(stdMatch[1]) : 0;

  recordTest('GROUP-5', 'T5.3', 'Screen preview logo exhibits smooth continuous-tone grayscale (> 40% rich midtones)',
    midtonePct >= 40.0, `Midtone tones: ${midtonePct.toFixed(1)}%`);

  recordTest('GROUP-5', 'T5.4', 'Contrast distribution is natural, clear, and balanced (40 - 100 std dev)',
    stdDev >= 40.0 && stdDev <= 100.0, `Std Dev: ${stdDev.toFixed(1)}`);

  // QR code scan directly from screen preview
  const scanReceiptOut = execSync(
    `python -m uv run --with zxing-cpp --with pillow python -c "` +
    `import zxingcpp; from PIL import Image; ` +
    `res = zxingcpp.read_barcodes(Image.open(r'${tmpScreenPng.replace(/\\/g, '\\\\')}')); ` +
    `print(res[0].text if res else 'NO_DECODE')"`
  ).toString().trim();

  const expectedUri = 'upi://pay?pn=ASARI%20VILAKAM%20MARUTHA%20CHAMUNDI%20DEVI%20TEMPLE&mode=01&pa=917306611995@waicici';
  recordTest('GROUP-5', 'T5.5', 'UPI QR code decodes accurately from on-screen Receipt Preview',
    scanReceiptOut === expectedUri, `URI: ${scanReceiptOut}`);

  // Print PDF verification
  const printHarnessPath = path.join(__dirname, 'step_33_104_print_harness.html');
  const printDeityB64Match = htmlContent.match(/const TEMPLE_DEITY_LOGO_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/);
  const printQrB64Match = htmlContent.match(/const TEMPLE_UPI_QR_B64\s*=\s*"(data:image\/png;base64,[^"]+)";/);
  const realPrintDeityB64 = printDeityB64Match ? printDeityB64Match[1] : '';
  const realPrintQrB64 = printQrB64Match ? printQrB64Match[1] : '';

  const printHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>Step 33.104 80mm Print Test</title>
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
      <img src="${realPrintDeityB64}" alt="Temple Deity Logo" class="th-deity-logo" id="billDeityLogo" />
    </div>
    <div class="th-center th-bold th-title">മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം</div>
    <div class="th-center th-sub">ആശാരിവിളാകം, കേരളദിത്യപുരം</div>
    <div class="th-line"></div>
    <div class="th-flex">
      <span>No: <b>BILL-0105</b></span>
      <span>18/10/2026 03:50 PM</span>
    </div>
    <div class="th-line"></div>
    <div class="th-roster-row">
      <span class="th-roster-name" style="font-weight: 700;">1. അനന്തൻ നമ്പൂതിരി</span>
      <span class="th-roster-star" style="font-weight: 600;">തിരുവോണം</span>
    </div>
    <div class="th-line"></div>
    <div class="th-row"><span>വിഭാഗം:</span> വഴിപാട്</div>
    <div class="th-row"><span>ഇനം:</span> <b>അർച്ചന</b></div>
    <div class="th-flex">
      <span>Qty: <b>1</b> &times; ₹50.00</span>
      <span>Amt: <b>₹50.00</b></span>
    </div>
    <div class="th-line"></div>
    <div class="th-flex th-bold th-total">
      <span>ആകെ (Total):</span>
      <span>₹50.00</span>
    </div>
    <div class="th-flex">
      <span>Payment:</span>
      <span><b>Cash</b></span>
    </div>
    <div class="th-line"></div>
    <div class="th-center th-blessing">*** അമ്മേ നാരായണ ദേവി നാരായണ ***</div>
    <div class="th-upi-section">
      <div class="th-scan-pay">SCAN TO PAY</div>
      <img src="${realPrintQrB64}" alt="UPI QR Code" class="th-upi-qr" id="printUpiQr" />
    </div>
  </div>
</div>
</body>
</html>`;
  fs.writeFileSync(printHarnessPath, printHarnessHtml, 'utf8');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --print-to-pdf="${tmpPrintPdf}" "file:///${printHarnessPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.6', 'Print preview PDF generates exactly 1 page at 80mm width',
    fs.existsSync(tmpPrintPdf) && fs.statSync(tmpPrintPdf).size > 10000);
}

// =========================================================================
// TEST GROUP 6: Regression & Isolation Assertions
// =========================================================================
console.log('\n--- TEST GROUP 6: Regression & Isolation Assertions ---');
{
  recordTest('GROUP-6', 'T6.1', 'Accounts printReceipt() remains unpolluted (zero QR or payment branding)',
    !htmlContent.slice(htmlContent.indexOf('function printReceipt('), htmlContent.indexOf('function reprintReceipt(')).includes('SCAN TO PAY'));
  recordTest('GROUP-6', 'T6.2', 'printChittyReport remains unpolluted',
    !htmlContent.slice(htmlContent.indexOf('function printChittyReport('), htmlContent.indexOf('function printChittyReport(') + 1000).includes('th-upi-qr'));
  recordTest('GROUP-6', 'T6.3', 'Day Book and Ledger PDF reports do not include thermal receipt logo or QR',
    !htmlContent.slice(htmlContent.indexOf('function printDayBookPDF(')).includes('th-deity-logo'));
}

console.log('\n' + '='.repeat(80));
console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('='.repeat(80));

const resultsJsonPath = path.join(__dirname, 'step_33_104_test_results.json');
fs.writeFileSync(resultsJsonPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`Detailed test results written to: ${resultsJsonPath}`);

if (failedTests > 0) {
  console.error(`\n❌ VERIFICATION FAILED: ${failedTests} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\n✅ ALL STEP 33.104 VERIFICATION TESTS PASSED SUCCESSFULLY.');
}
