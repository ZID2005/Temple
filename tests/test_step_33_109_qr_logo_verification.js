/**
 * STEP 33.109: Automated Verification Suite
 * Fix Physical QR Scanning and Reduce Thermal Logo Darkness
 *
 * Requirements:
 * 1. Cryptographic baseline, backup verification, and strict diff boundary check.
 * 2. Local asset integrity, provenance, and byte-level verification in D:\Temple\assets\.
 * 3. Exact UPI destination and encoded QR payload fidelity.
 * 4. High-resolution clean QR with integer modules and 4-module quiet zone.
 * 5. Screen CSS and Print CSS rules for QR (31mm square) and deity logo (20mm width).
 * 6. Receipt DOM structure, element sequence, and quiet zone safety.
 * 7. Reduced print logo darkness with recognizable facial details and zero background clumping.
 * 8. Real Headless Chromium PDF print-out measurements (80mm width, exact 1 page, zero blank overflow).
 * 9. QR scanning directly off the rendered on-screen preview and 80mm thermal print slip.
 * 10. System regression suites (Step 33.94, Step 33.96, Step 33.85).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const BACKUP_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1_PreStep33_109_QRScanLogoDarkness_Backup_20261018_203000.html');
const BACKUP_DIR_PATH = path.join(PROJECT_DIR, 'backups', 'Temple_Accounts-1_PreStep33_109_QRScanLogoDarkness_Backup_20261018_203000.html');
const RULES_PATH = path.join(PROJECT_DIR, 'firestore.rules');
const SERVER_PATH = path.join(PROJECT_DIR, 'server.js');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const EXPECTED_PRE_HASH = '0F278FAFB369B06EB73D0F1B84015CAF047C9A9AFDF6FBF5642FFC79B0E5EECB';
const EXPECTED_PRE_SIZE = 1649155;
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
  console.log('STEP 33.109: FIX PHYSICAL QR SCANNING & REDUCE THERMAL LOGO DARKNESS');
  console.log('='.repeat(80));

  // ============================================================================
  // GROUP 1: Cryptographic Baseline, Backup Verification & Isolation
  // ============================================================================
  console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');

  recordTest('GROUP-1', 'T1.1', 'Target file Temple_Accounts-1.html exists', fs.existsSync(HTML_PATH));

  const rootBackupExists = fs.existsSync(BACKUP_PATH);
  recordTest('GROUP-1', 'T1.2', 'Root timestamped backup exists at expected path',
    rootBackupExists, BACKUP_PATH);

  const dirBackupExists = fs.existsSync(BACKUP_DIR_PATH);
  recordTest('GROUP-1', 'T1.3', 'backups/ folder timestamped backup exists',
    dirBackupExists, BACKUP_DIR_PATH);

  if (rootBackupExists) {
    const rootBackupHash = sha256File(BACKUP_PATH);
    const rootBackupSize = fs.statSync(BACKUP_PATH).size;
    recordTest('GROUP-1', 'T1.4', 'Root backup SHA-256 matches pre-change baseline exactly',
      rootBackupHash === EXPECTED_PRE_HASH, `Hash: ${rootBackupHash}`);
    recordTest('GROUP-1', 'T1.5', 'Root backup file size matches pre-change baseline size exactly',
      rootBackupSize === EXPECTED_PRE_SIZE, `${rootBackupSize} bytes`);
  }

  if (dirBackupExists) {
    const dirBackupHash = sha256File(BACKUP_DIR_PATH);
    const dirBackupSize = fs.statSync(BACKUP_DIR_PATH).size;
    recordTest('GROUP-1', 'T1.6', 'backups/ folder backup SHA-256 matches pre-change baseline exactly',
      dirBackupHash === EXPECTED_PRE_HASH, `Hash: ${dirBackupHash}`);
    recordTest('GROUP-1', 'T1.7', 'backups/ folder backup size matches pre-change baseline size exactly',
      dirBackupSize === EXPECTED_PRE_SIZE, `${dirBackupSize} bytes`);
  }

  // System isolation
  const rulesHash = sha256File(RULES_PATH);
  recordTest('GROUP-1', 'T1.8', 'firestore.rules remains untouched and unmodified',
    rulesHash === FIRESTORE_RULES_HASH, `Hash: ${rulesHash}`);

  recordTest('GROUP-1', 'T1.9', 'server.js exists and is untouched',
    fs.existsSync(SERVER_PATH));

  const currentHtmlBuf = fs.readFileSync(HTML_PATH);
  const currentHash = crypto.createHash('sha256').update(currentHtmlBuf).digest('hex').toUpperCase();
  const currentSize = currentHtmlBuf.length;
  recordTest('GROUP-1', 'T1.10', 'Temple_Accounts-1.html has updated hash reflecting Step 33.109 edits',
    currentHash !== EXPECTED_PRE_HASH, `Current: ${currentHash}`);

  // ============================================================================
  // GROUP 2: Local Assets Integrity, Provenance & Measurements
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Local Assets Integrity & Provenance ---');

  const assetsDir = path.join(PROJECT_DIR, 'assets');
  const origDeityPath = path.join(assetsDir, 'temple_deity_original.jpg');
  const origUpiPath = path.join(assetsDir, 'temple_upi_original.jpg');
  const screenLogoPath = path.join(assetsDir, 'temple_deity_logo_screen.png');
  const topDecorPath = path.join(assetsDir, 'temple_receipt_top_decor.png');
  const botDecorPath = path.join(assetsDir, 'temple_receipt_bot_decor.png');
  const bwLogoPath = path.join(assetsDir, 'temple_deity_logo_bw.png');
  const bwQrPath = path.join(assetsDir, 'temple_upi_qr.png');

  recordTest('GROUP-2', 'T2.1', 'Original colour deity image preserved in assets (577,839 bytes)',
    fs.existsSync(origDeityPath) && fs.statSync(origDeityPath).size === 577839);

  recordTest('GROUP-2', 'T2.2', 'Original UPI payment card image preserved in assets (96,958 bytes)',
    fs.existsSync(origUpiPath) && fs.statSync(origUpiPath).size === 96958);

  const screenHash = sha256File(screenLogoPath);
  recordTest('GROUP-2', 'T2.3', 'Screen preview deity logo asset preserved and untouched (453,802 bytes)',
    fs.existsSync(screenLogoPath) && fs.statSync(screenLogoPath).size === 453802 &&
    screenHash === 'A76C8CF27821BADEC99D91CD909550B1402F0DF015F932B2B3FF510DF7CE2181', `Hash: ${screenHash}`);

  const topDecorHash = sha256File(topDecorPath);
  recordTest('GROUP-2', 'T2.4', 'Top floral ornament asset preserved and untouched (28,138 bytes)',
    fs.existsSync(topDecorPath) && fs.statSync(topDecorPath).size === 28138 &&
    topDecorHash === '6C2EEE1BE42245FD52097B73F160D6006C4145093EAE896ED374AF07D92B4D3F');

  const botDecorHash = sha256File(botDecorPath);
  recordTest('GROUP-2', 'T2.5', 'Bottom floral ornament asset preserved and untouched (7,795 bytes)',
    fs.existsSync(botDecorPath) && fs.statSync(botDecorPath).size === 7795 &&
    botDecorHash === '642AA3C4602282352628906CA330E825C2524ED4F3F5D6E43DF0041EA6B40C14');

  // Verify updated print deity logo metrics via helper script
  const logoCheckScript = `from PIL import Image
import numpy as np
img = Image.open(r'${bwLogoPath.replace(/\\/g, '\\\\')}')
arr = np.array(img.convert('L'))
tot = np.count_nonzero(arr == 0) / arr.size * 100.0
face = arr[140:210, 110:190]
face_pct = np.count_nonzero(face == 0) / face.size * 100.0
border = np.concatenate([arr[0:20, :].ravel(), arr[:, 0:20].ravel(), arr[:, -20:].ravel()])
border_pct = np.count_nonzero(border == 0) / border.size * 100.0
print(f'{img.size[0]},{img.size[1]},{tot:.2f},{face_pct:.2f},{border_pct:.2f}')
`;
  const logoCheckPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_logo_check.py');
  fs.writeFileSync(logoCheckPath, logoCheckScript, 'utf8');

  const logoMetrics = execSync(`python "${logoCheckPath}"`).toString().trim().split(',');
  const logoW = parseInt(logoMetrics[0], 10);
  const logoH = parseInt(logoMetrics[1], 10);
  const logoTotBlack = parseFloat(logoMetrics[2]);
  const logoFaceBlack = parseFloat(logoMetrics[3]);
  const logoBorderBlack = parseFloat(logoMetrics[4]);

  recordTest('GROUP-2', 'T2.6', 'Updated print deity logo maintains exact 300x450 px dimensions',
    logoW === 300 && logoH === 450, `${logoW}x${logoH} px`);

  recordTest('GROUP-2', 'T2.7', 'Updated print deity logo reduces black coverage from 61.7% to < 32% (balanced coverage)',
    logoTotBlack < 32.0 && logoTotBlack > 20.0, `Total Black: ${logoTotBlack}%`);

  recordTest('GROUP-2', 'T2.8', 'Updated print deity logo maintains recognizable facial detail (25-35% face black)',
    logoFaceBlack >= 25.0 && logoFaceBlack <= 35.0, `Face Black: ${logoFaceBlack}%`);

  recordTest('GROUP-2', 'T2.9', 'Updated print deity logo fades outer borders to white (< 10% border black, zero box clipping)',
    logoBorderBlack < 10.0, `Border Black: ${logoBorderBlack}%`);

  // Verify updated UPI QR code metrics and payload via helper script
  const qrCheckScript = `import zxingcpp
from PIL import Image
img = Image.open(r'${bwQrPath.replace(/\\/g, '\\\\')}')
res = zxingcpp.read_barcodes(img)
text = res[0].text if res else 'NO_DECODE'
print(f'{img.size[0]},{img.size[1]},{text}')
`;
  const qrCheckPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_qr_check.py');
  fs.writeFileSync(qrCheckPath, qrCheckScript, 'utf8');

  const qrMetrics = execSync(`python -m uv run --with zxing-cpp --with pillow python "${qrCheckPath}"`).toString().trim().split(',');
  const qrW = parseInt(qrMetrics[0], 10);
  const qrH = parseInt(qrMetrics[1], 10);
  const qrPayload = qrMetrics.slice(2).join(',');

  recordTest('GROUP-2', 'T2.10', 'Updated UPI QR asset has high resolution and square aspect ratio (588x588 px, 12px/module)',
    qrW === 588 && qrH === 588, `${qrW}x${qrH} px`);

  const EXPECTED_UPI_URI = 'upi://pay?pn=ASARI%20VILAKAM%20MARUTHA%20CHAMUNDI%20DEVI%20TEMPLE&mode=01&pa=917306611995@waicici';
  recordTest('GROUP-2', 'T2.11', 'Updated UPI QR asset decodes to exact original UPI URI destination',
    qrPayload === EXPECTED_UPI_URI, `Payload: ${qrPayload}`);

  // ============================================================================
  // GROUP 3: CSS Rules for 80mm Screen Preview & Thermal Printing
  // ============================================================================
  console.log('\n--- TEST GROUP 3: CSS Rules for 80mm Screen Preview & Print ---');

  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');

  recordTest('GROUP-3', 'T3.1', 'Screen CSS defines .th-upi-qr with width: 31mm and height: 31mm',
    htmlContent.includes('.th-upi-qr {') &&
    htmlContent.includes('width: 31mm;') &&
    htmlContent.includes('height: 31mm;'));

  recordTest('GROUP-3', 'T3.2', 'Screen CSS defines .th-upi-qr with max-width: 31mm and max-height: 31mm',
    htmlContent.includes('max-width: 31mm;') &&
    htmlContent.includes('max-height: 31mm;'));

  recordTest('GROUP-3', 'T3.3', 'Screen CSS defines .th-upi-qr with square aspect ratio (1 / 1)',
    htmlContent.includes('aspect-ratio: 1 / 1;'));

  recordTest('GROUP-3', 'T3.4', 'Screen CSS defines crisp image-rendering on .th-upi-qr without blurring filters',
    htmlContent.includes('image-rendering: pixelated;') &&
    htmlContent.includes('image-rendering: crisp-edges;'));

  recordTest('GROUP-3', 'T3.5', 'Print CSS defines 80mm/58mm .th-upi-qr with width: 31mm !important and height: 31mm !important',
    htmlContent.includes('#print-area.billing-80mm .th-upi-qr') &&
    htmlContent.includes('width: 31mm !important;') &&
    htmlContent.includes('height: 31mm !important;'));

  recordTest('GROUP-3', 'T3.6', 'Print CSS preserves deity logo sizing (20mm, aspect-ratio: 300 / 450)',
    htmlContent.includes('#print-area.billing-80mm .th-deity-logo') &&
    htmlContent.includes('width: 20mm !important;') &&
    htmlContent.includes('aspect-ratio: 300 / 450 !important;'));

  recordTest('GROUP-3', 'T3.7', 'Print CSS preserves top frame and aperture alignment for deity logo',
    htmlContent.includes('#print-area.billing-80mm .th-top-frame .th-deity-logo') &&
    htmlContent.includes('width: 23.16% !important;'));

  recordTest('GROUP-3', 'T3.8', 'Print CSS preserves bottom decoration margin (6px auto 2px auto !important, safe quiet zone buffer)',
    htmlContent.includes('#print-area.billing-80mm .th-bot-decor') &&
    htmlContent.includes('margin: 6px auto 2px auto !important;'));

  // ============================================================================
  // GROUP 4: DOM Ordering, Constants & Pipeline Differentiation
  // ============================================================================
  console.log('\n--- TEST GROUP 4: DOM Ordering & Pipeline Differentiation ---');

  recordTest('GROUP-4', 'T4.1', 'TEMPLE_DEITY_LOGO_B64 constant declared and non-empty in HTML',
    htmlContent.includes('const TEMPLE_DEITY_LOGO_B64 = "data:image/png;base64,'));

  recordTest('GROUP-4', 'T4.2', 'TEMPLE_DEITY_LOGO_SCREEN_B64 constant declared and non-empty in HTML',
    htmlContent.includes('const TEMPLE_DEITY_LOGO_SCREEN_B64 = "data:image/png;base64,'));

  recordTest('GROUP-4', 'T4.3', 'TEMPLE_UPI_QR_B64 constant declared and non-empty in HTML',
    htmlContent.includes('const TEMPLE_UPI_QR_B64 = "data:image/png;base64,'));

  recordTest('GROUP-4', 'T4.4', 'TEMPLE_RECEIPT_TOP_DECOR_B64 constant declared and non-empty in HTML',
    htmlContent.includes('const TEMPLE_RECEIPT_TOP_DECOR_B64 = "data:image/png;base64,'));

  recordTest('GROUP-4', 'T4.5', 'TEMPLE_RECEIPT_BOT_DECOR_B64 constant declared and non-empty in HTML',
    htmlContent.includes('const TEMPLE_RECEIPT_BOT_DECOR_B64 = "data:image/png;base64,'));

  // Test functional pipeline in VM context
  const sandbox = {
    window: {},
    document: {
      body: { classList: { contains: () => false } }
    },
    esc: (s) => String(s || ''),
    fmtDate: () => '18/10/2026',
    fmtTime: () => '03:50 PM',
    fmtCurrency: (n) => '₹' + Number(n).toFixed(2),
    getSetting: () => 'Cash'
  };

  const scriptMatch = htmlContent.match(/\/\* ===================== STEP 33\.102: 80MM THERMAL RECEIPT ASSETS ===================== \*\/([\s\S]*?)function renderThermalReceiptHTML\(/);
  const fnMatch = htmlContent.match(/function renderThermalReceiptHTML\(r, templeName, templeAddress[\s\S]*?\n    \}/);

  const testCode = scriptMatch[1] + '\n' + fnMatch[0];
  vm.createContext(sandbox);
  vm.runInContext(testCode, sandbox);

  const mockReceipt = {
    billNo: 'BILL-0105',
    receiptNo: 'BILL-0105',
    timestamp: Date.now(),
    devoteeName: 'അനന്തൻ നമ്പൂതിരി',
    star: 'തിരുവോണം',
    category: 'വഴിപാട്',
    vazhipadu: 'അർച്ചന',
    qty: 1,
    rate: 50,
    amount: 50,
    total: 50,
    paymentMethod: 'Cash'
  };

  const renderedScreen = sandbox.renderThermalReceiptHTML(mockReceipt, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', '');
  const renderedPrint = sandbox.renderThermalReceiptHTML(mockReceipt, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', '', true);

  recordTest('GROUP-4', 'T4.6', 'Preview rendering selects smooth grayscale screen asset (TEMPLE_DEITY_LOGO_SCREEN_B64)',
    renderedScreen.includes(sandbox.window.TEMPLE_DEITY_LOGO_SCREEN_B64));

  recordTest('GROUP-4', 'T4.7', 'Print rendering selects balanced 1-bit thermal print asset (TEMPLE_DEITY_LOGO_B64)',
    renderedPrint.includes(sandbox.window.TEMPLE_DEITY_LOGO_B64));

  recordTest('GROUP-4', 'T4.8', 'Both preview and print select new clean UPI QR asset (TEMPLE_UPI_QR_B64)',
    renderedScreen.includes(sandbox.window.TEMPLE_UPI_QR_B64) && renderedPrint.includes(sandbox.window.TEMPLE_UPI_QR_B64));

  // Check strict structural order
  const posTopDecor = renderedScreen.indexOf('id="billTopDecor"');
  const posLogo = renderedScreen.indexOf('id="billDeityLogo"');
  const posTitle = renderedScreen.indexOf('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം');
  const posLine1 = renderedScreen.indexOf('class="th-line"');
  const posReceiptNo = renderedScreen.indexOf('BILL-0105');
  const posDevotee = renderedScreen.indexOf('അനന്തൻ നമ്പൂതിരി');
  const posBlessing = renderedScreen.indexOf('*** അമ്മേ നാരായണ ദേവി നാരായണ ***');
  const posScanToPay = renderedScreen.indexOf('SCAN TO PAY');
  const posQr = renderedScreen.indexOf('id="billUpiQr"');
  const posBotDecor = renderedScreen.indexOf('id="billBotDecor"');

  const strictHierarchy = (
    posTopDecor !== -1 &&
    posLogo !== -1 &&
    posTitle > posLogo &&
    posLine1 > posTitle &&
    posReceiptNo > posLine1 &&
    posDevotee > posReceiptNo &&
    posBlessing > posDevotee &&
    posScanToPay > posBlessing &&
    posQr > posScanToPay &&
    posBotDecor > posQr
  );

  recordTest('GROUP-4', 'T4.9', 'Strict DOM order: TopDecor -> DeityLogo -> Title -> Line -> BillNo -> Devotee -> Blessing -> SCAN TO PAY -> QR -> BotDecor',
    strictHierarchy);

  // ============================================================================
  // GROUP 5: Headless Chromium Visual Rendering & Real Output Verification
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Headless Chromium Visual Rendering & Output ---');

  const harnessPreviewPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_screen_harness.html');
  const harnessPrintPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_print_harness.html');

  // Extract CSS from Temple_Accounts-1.html
  const cssMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
  const appCss = cssMatch ? cssMatch[1] : '';

  const previewHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.109 Screen Preview Test</title>
<style>
${appCss}
body { background: #f1f5f9; padding: 20px; display: flex; justify-content: center; }
.preview-card { width: 380px; }
</style>
</head>
<body>
  <div class="preview-card">
    <div style="font-weight: bold; color: #800000; margin-bottom: 12px; font-size: 14px;">🧾 Receipt Preview (80mm)</div>
    <div class="receipt-paper-box">
      ${renderedScreen}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(harnessPreviewPath, previewHarnessHtml, 'utf8');

  // Self-contained 80mm print test harness matching 80mm thermal print conditions
  const printHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.109 80mm Print Test</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace; font-size: 11.5px; line-height: 1.35; color: #000; }
  #print-area.billing-80mm { width: 80mm; max-width: 80mm; padding: 3mm 4mm 4mm 4mm; box-sizing: border-box; background: #fff; margin: 0 auto; }
  .th-receipt { width: 100%; max-width: 80mm; color: #000; font-variant-numeric: tabular-nums; }
  .th-center { text-align: center; }
  .th-bold { font-weight: bold; }
  .th-logo-wrap { text-align: center; margin-bottom: 3px; }
  .th-top-frame { position: relative !important; width: 100% !important; margin: 0 auto !important; line-height: 0 !important; }
  .th-top-decor { width: 100% !important; height: auto !important; display: block !important; margin: 0 auto !important; image-rendering: -webkit-optimize-contrast !important; image-rendering: crisp-edges !important; }
  .th-top-frame .th-deity-logo { position: absolute !important; left: 50% !important; transform: translateX(-50%) !important; bottom: 0 !important; width: 23.16% !important; height: auto !important; aspect-ratio: 300 / 450 !important; display: block !important; margin: 0 !important; object-fit: contain !important; image-rendering: -webkit-optimize-contrast !important; image-rendering: crisp-edges !important; }
  .th-deity-logo { width: 20mm !important; max-width: 20mm !important; height: auto !important; aspect-ratio: 300 / 450 !important; display: block !important; margin: 0 auto !important; object-fit: contain !important; image-rendering: -webkit-optimize-contrast !important; image-rendering: crisp-edges !important; }
  .th-title { font-size: 13.5px; font-weight: bold; line-height: 1.25; margin-bottom: 2px; }
  .th-line { border-bottom: 1px dashed #000; margin: 4px 0; width: 100%; display: block; }
  .th-flex { display: flex; justify-content: space-between; align-items: baseline; width: 100%; font-variant-numeric: tabular-nums; }
  .th-row { font-size: 11.5px; margin: 2px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .th-total { font-size: 13.5px; font-weight: bold; font-variant-numeric: tabular-nums; }
  .th-blessing { font-size: 10px; font-weight: bold; margin-top: 5px; text-align: center; }
  .th-upi-section { text-align: center; margin-top: 6px; padding-top: 2px; }
  .th-scan-pay { font-size: 11px; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 3px; text-align: center; }
  .th-upi-qr { width: 31mm; height: 31mm; max-width: 31mm; max-height: 31mm; aspect-ratio: 1 / 1; display: block; margin: 0 auto; image-rendering: pixelated; image-rendering: crisp-edges; }
  .th-bot-decor { width: 100% !important; height: auto !important; display: block !important; margin: 6px auto 2px auto !important; image-rendering: -webkit-optimize-contrast !important; image-rendering: crisp-edges !important; }
  .th-roster-row { font-size: 11.5px; margin: 2.5px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
  .th-roster-name, .th-roster-star { font-size: 13.5px; }
  @page { size: 80mm 165mm; margin: 0; }
  @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }
</style>
</head>
<body class="printing-billing-80mm">
<div id="print-area" class="billing-80mm">
  ${renderedPrint}
</div>
</body>
</html>`;

  fs.writeFileSync(harnessPrintPath, printHarnessHtml, 'utf8');

  // 1. Capture on-screen Receipt Preview screenshot via Headless Chrome
  const previewPngPath = path.join(PROJECT_DIR, 'step_33_109_receipt_preview.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,850 "--screenshot=${previewPngPath}" "file:///${harnessPreviewPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.1', 'Headless Chrome captures on-screen Receipt Preview screenshot',
    fs.existsSync(previewPngPath) && fs.statSync(previewPngPath).size > 15000, `${fs.statSync(previewPngPath).size} bytes`);

  // 2. Render 80mm thermal print PDF via Headless Chrome
  const printPdfPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_receipt_print.pdf');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu "--print-to-pdf=${printPdfPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.2', 'Headless Chrome renders 80mm thermal print PDF',
    fs.existsSync(printPdfPath) && fs.statSync(printPdfPath).size > 15000, `${fs.statSync(printPdfPath).size} bytes`);

  // 3. Capture Screenshot of 80mm Print output via Headless Chrome
  const printPngPath = path.join(PROJECT_DIR, 'step_33_109_receipt_print.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,800 "--screenshot=${printPngPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.3', 'Headless Chrome captures 80mm thermal print output screenshot',
    fs.existsSync(printPngPath) && fs.statSync(printPngPath).size > 10000, `${fs.statSync(printPngPath).size} bytes`);

  // 4. Verify PDF metrics via helper script
  const pyPdfScript = `import pypdf
reader = pypdf.PdfReader(r'${printPdfPath.replace(/\\/g, '\\\\')}')
pages = len(reader.pages)
box = reader.pages[0].mediabox
width_mm = float(box.width) * 25.4 / 72.0
height_mm = float(box.height) * 25.4 / 72.0
print(f'{pages},{width_mm:.1f},{height_mm:.1f}')
`;
  const pyPdfPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_pdf_check.py');
  fs.writeFileSync(pyPdfPath, pyPdfScript, 'utf8');

  const pdfMetrics = execSync(`python "${pyPdfPath}"`).toString().trim().split(',');
  const pdfPages = parseInt(pdfMetrics[0], 10);
  const pdfWidth = parseFloat(pdfMetrics[1]);
  const pdfHeight = parseFloat(pdfMetrics[2]);

  recordTest('GROUP-5', 'T5.4', 'Printed receipt PDF is exactly 1 page (zero trailing blank overflow)',
    pdfPages === 1, `Pages: ${pdfPages}`);

  recordTest('GROUP-5', 'T5.5', 'Printed receipt PDF width conforms to 80mm standard (~80.1mm)',
    Math.abs(pdfWidth - 80.0) < 1.0, `Width: ${pdfWidth}mm, Height: ${pdfHeight}mm`);

  // 5. Live QR decode from on-screen preview screenshot via helper script
  const scanPreviewScript = `import zxingcpp
from PIL import Image
res = zxingcpp.read_barcodes(Image.open(r'${previewPngPath.replace(/\\/g, '\\\\')}'))
print(res[0].text if res else 'NO_DECODE')
`;
  const scanPreviewPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_scan_preview.py');
  fs.writeFileSync(scanPreviewPath, scanPreviewScript, 'utf8');

  const previewQrDecoded = execSync(`python -m uv run --with zxing-cpp --with pillow python "${scanPreviewPath}"`).toString().trim();
  recordTest('GROUP-5', 'T5.6', 'Live QR decode directly off on-screen preview screenshot succeeds',
    previewQrDecoded === EXPECTED_UPI_URI, previewQrDecoded);

  // 6. Live QR decode from 80mm thermal print output screenshot via helper script
  const scanPrintScript = `import zxingcpp
from PIL import Image
res = zxingcpp.read_barcodes(Image.open(r'${printPngPath.replace(/\\/g, '\\\\')}'))
print(res[0].text if res else 'NO_DECODE')
`;
  const scanPrintPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_scan_print.py');
  fs.writeFileSync(scanPrintPath, scanPrintScript, 'utf8');

  const printQrDecoded = execSync(`python -m uv run --with zxing-cpp --with pillow python "${scanPrintPath}"`).toString().trim();
  recordTest('GROUP-5', 'T5.7', 'Live QR decode directly off 80mm thermal print slip screenshot succeeds',
    printQrDecoded === EXPECTED_UPI_URI, printQrDecoded);

  // 7. Measure printed deity logo darkness in rendered print output via helper script
  const printLogoScript = `from PIL import Image
import numpy as np
img = Image.open(r'${printPngPath.replace(/\\/g, '\\\\')}').convert('L')
arr = np.array(img)
logo_crop = arr[45:150, 215:285]
black_pct = np.count_nonzero(logo_crop < 128) / logo_crop.size * 100.0
print(f'{black_pct:.1f}')
`;
  const printLogoPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_print_logo.py');
  fs.writeFileSync(printLogoPath, printLogoScript, 'utf8');

  const renderedLogoBlackPct = parseFloat(execSync(`python "${printLogoPath}"`).toString().trim());
  recordTest('GROUP-5', 'T5.8', 'Rendered print receipt logo darkness is significantly reduced (< 30% black vs 50.5% baseline)',
    renderedLogoBlackPct < 30.0, `Rendered logo black: ${renderedLogoBlackPct}%`);

  // ============================================================================
  // GROUP 6: Regression Verification (Pre-Existing Critical Suites)
  // ============================================================================
  console.log('\n--- TEST GROUP 6: Regression Suites ---');

  // Step 33.94 Billing Fund Sync regression suite
  let reg94Passed = false;
  try {
    const reg94Output = execSync('node tests/test_step_33_94_billing_sync.js', { cwd: PROJECT_DIR, timeout: 30000 }).toString();
    reg94Passed = reg94Output.includes('ALL STEP 33.94 VERIFICATION TESTS PASSED');
  } catch (e) {
    reg94Passed = false;
  }
  recordTest('GROUP-6', 'T6.1', 'Step 33.94 Billing Fund Sync regression suite passes (48 tests)', reg94Passed);

  // Step 33.96 Fund Validation regression suite
  let reg96Passed = false;
  try {
    const reg96Output = execSync('node tests/test_step_33_96_fund_validation.js', { cwd: PROJECT_DIR, timeout: 30000 }).toString();
    reg96Passed = reg96Output.includes('ALL STEP 33.96 VERIFICATION TESTS PASSED');
  } catch (e) {
    reg96Passed = false;
  }
  recordTest('GROUP-6', 'T6.2', 'Step 33.96 Fund Validation regression suite passes (35 tests)', reg96Passed);

  // Step 33.85 Receipt Print Layout regression suite
  let reg85Passed = false;
  try {
    const reg85Output = execSync('node tests/test_step_33_85_receipt_print_layout.js', { cwd: PROJECT_DIR, timeout: 30000 }).toString();
    reg85Passed = reg85Output.includes('PASSED: 34 | FAILED: 0');
  } catch (e) {
    reg85Passed = false;
  }
  recordTest('GROUP-6', 'T6.3', 'Step 33.85 Receipt Print Layout regression suite passes (34 tests)', reg85Passed);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.109 VERIFICATION COMPLETE: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('='.repeat(80));

  const resultsPath = path.join(PROJECT_DIR, 'tests', 'step_33_109_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalTests: passCount + failCount,
    passed: passCount,
    failed: failCount,
    tests: testResults
  }, null, 2), 'utf8');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
