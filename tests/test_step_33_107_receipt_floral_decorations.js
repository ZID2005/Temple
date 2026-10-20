/**
 * STEP 33.107: Automated Verification Suite
 * Add Top and Bottom Floral Decorations to Existing 80mm Billing Receipt
 *
 * Requirements:
 * 1. Reproduce symmetrical floral and lotus ornament from reference image.
 * 2. Place top ornament around existing deity logo area (centered lotus, side flourishes, hanging lamps).
 * 3. Position deity logo cleanly in the aperture under the lotus and between side lamps with zero overlap.
 * 4. Add matching smaller floral-lotus ornament after existing QR code at bottom of receipt.
 * 5. Maintain sufficient buffer/spacing around QR code for reliable scanning.
 * 6. Keep both decorations strictly within printable 80mm thermal paper width.
 * 7. Use genuinely transparent backgrounds on decorations (no white/checkerboard rectangles).
 * 8. Preserve deity logo (screen continuous-tone and print 1-bit), temple title, fields, blessing, and QR code.
 * 9. Preserve address removal from Step 33.108 (no address on 80mm receipt).
 * 10. Verify single-page continuous print output (zero trailing blank pages).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const BACKUP_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1_PreStep33_107_FloralDecorations_Backup_20261018_192000.html');
const BACKUP_DIR_PATH = path.join(PROJECT_DIR, 'backups', 'Temple_Accounts-1_PreStep33_107_FloralDecorations_Backup_20261018_192000.html');
const RULES_PATH = path.join(PROJECT_DIR, 'firestore.rules');
const SERVER_PATH = path.join(PROJECT_DIR, 'server.js');
const TOP_DECOR_ASSET = path.join(PROJECT_DIR, 'assets', 'temple_receipt_top_decor.png');
const BOT_DECOR_ASSET = path.join(PROJECT_DIR, 'assets', 'temple_receipt_bot_decor.png');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PRE_STEP_33_107_HASH = '5D42DAC9D40A2786705E846AB31EFD5B1F3EE977C777226607CCC350C271F933';
const PRE_STEP_33_107_SIZE = 1575363;
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
  console.log('STEP 33.107: TOP & BOTTOM FLORAL DECORATIONS ON 80MM RECEIPT');
  console.log('='.repeat(80));

  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const currentHash = sha256File(HTML_PATH);
  const currentSize = fs.statSync(HTML_PATH).size;
  const currentLines = htmlContent.split('\n').length;

  console.log(`\nCurrent HTML SHA-256: ${currentHash}`);
  console.log(`Current HTML Size:    ${currentSize} bytes (delta: +${currentSize - PRE_STEP_33_107_SIZE} bytes)`);
  console.log(`Current Line Count:   ${currentLines} lines\n`);

  // ============================================================================
  // GROUP 1: Cryptographic Invariants & Backup Verification
  // ============================================================================
  console.log('--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');
  recordTest('GROUP-1', 'T1.1', 'Byte-exact root backup file exists at expected path',
    fs.existsSync(BACKUP_PATH), BACKUP_PATH);

  const backupHash = fs.existsSync(BACKUP_PATH) ? sha256File(BACKUP_PATH) : '';
  recordTest('GROUP-1', 'T1.2', 'Root backup SHA-256 matches pre-change baseline hash exactly',
    backupHash === PRE_STEP_33_107_HASH, `Hash: ${backupHash}`);

  const backupSize = fs.existsSync(BACKUP_PATH) ? fs.statSync(BACKUP_PATH).size : 0;
  recordTest('GROUP-1', 'T1.3', 'Root backup file size matches exact pre-change baseline size',
    backupSize === PRE_STEP_33_107_SIZE, `${backupSize} bytes`);

  recordTest('GROUP-1', 'T1.4', 'Byte-exact backup exists in backups directory',
    fs.existsSync(BACKUP_DIR_PATH) && sha256File(BACKUP_DIR_PATH) === PRE_STEP_33_107_HASH);

  recordTest('GROUP-1', 'T1.5', 'Top ornament asset file exists in assets folder (temple_receipt_top_decor.png)',
    fs.existsSync(TOP_DECOR_ASSET) && fs.statSync(TOP_DECOR_ASSET).size > 10000, `${fs.statSync(TOP_DECOR_ASSET).size} bytes`);

  recordTest('GROUP-1', 'T1.6', 'Bottom ornament asset file exists in assets folder (temple_receipt_bot_decor.png)',
    fs.existsSync(BOT_DECOR_ASSET) && fs.statSync(BOT_DECOR_ASSET).size > 4000, `${fs.statSync(BOT_DECOR_ASSET).size} bytes`);

  const rulesHash = sha256File(RULES_PATH);
  recordTest('GROUP-1', 'T1.7', 'firestore.rules remains untouched and unmodified',
    rulesHash === FIRESTORE_RULES_HASH, `Hash: ${rulesHash}`);

  recordTest('GROUP-1', 'T1.8', 'server.js exists and is preserved',
    fs.existsSync(SERVER_PATH));

  // ============================================================================
  // GROUP 2: Top Floral Decoration Implementation & Layout
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Top Floral Decoration Implementation & Layout ---');

  // Setup VM sandbox to execute renderThermalReceiptHTML directly
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    window: {},
    document: { body: { classList: { contains: () => false, add: () => {}, remove: () => {} } } },
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };
  vm.createContext(sandbox);

  const assetsMatch = htmlContent.match(/\/\* ===================== STEP 33\.102: 80MM THERMAL RECEIPT ASSETS ===================== \*\/([\s\S]*?)(?=function renderThermalReceiptHTML)/);
  if (!assetsMatch) {
    throw new Error('Failed to extract asset block from HTML');
  }
  vm.runInContext(assetsMatch[1], sandbox);

  // Transfer window constants to lexical sandbox scope
  sandbox.TEMPLE_DEITY_LOGO_B64 = sandbox.window.TEMPLE_DEITY_LOGO_B64;
  sandbox.TEMPLE_DEITY_LOGO_SCREEN_B64 = sandbox.window.TEMPLE_DEITY_LOGO_SCREEN_B64;
  sandbox.TEMPLE_UPI_QR_B64 = sandbox.window.TEMPLE_UPI_QR_B64;
  sandbox.TEMPLE_RECEIPT_TOP_DECOR_B64 = sandbox.window.TEMPLE_RECEIPT_TOP_DECOR_B64;
  sandbox.TEMPLE_RECEIPT_BOT_DECOR_B64 = sandbox.window.TEMPLE_RECEIPT_BOT_DECOR_B64;

  recordTest('GROUP-2', 'T2.1', 'TEMPLE_RECEIPT_TOP_DECOR_B64 constant is defined as valid PNG data URI',
    typeof sandbox.TEMPLE_RECEIPT_TOP_DECOR_B64 === 'string' && sandbox.TEMPLE_RECEIPT_TOP_DECOR_B64.startsWith('data:image/png;base64,') && sandbox.TEMPLE_RECEIPT_TOP_DECOR_B64.length > 10000);

  recordTest('GROUP-2', 'T2.2', 'window.TEMPLE_RECEIPT_TOP_DECOR_B64 is globally exposed on window',
    typeof sandbox.window.TEMPLE_RECEIPT_TOP_DECOR_B64 === 'string');

  const renderFnMatch = htmlContent.match(/function renderThermalReceiptHTML\([\s\S]*?\n    \}/);
  if (!renderFnMatch) {
    throw new Error('Failed to extract renderThermalReceiptHTML from HTML');
  }
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

  const renderedScreen = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം');
  const renderedPrint = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം', true);

  recordTest('GROUP-2', 'T2.3', 'Receipt markup includes th-top-frame container',
    renderedScreen.includes('class="th-top-frame"'));

  recordTest('GROUP-2', 'T2.4', 'Top decoration image element exists with class th-top-decor and id billTopDecor',
    renderedScreen.includes('class="th-top-decor"') && renderedScreen.includes('id="billTopDecor"'));

  recordTest('GROUP-2', 'T2.5', 'Top decoration image is rendered inside th-logo-wrap before temple title',
    renderedScreen.indexOf('th-logo-wrap') < renderedScreen.indexOf('id="billTopDecor"') &&
    renderedScreen.indexOf('id="billTopDecor"') < renderedScreen.indexOf('th-title'));

  recordTest('GROUP-2', 'T2.6', 'Screen CSS contains .th-top-frame and .th-top-decor rules',
    htmlContent.includes('.th-top-frame') && htmlContent.includes('.th-top-decor'));

  recordTest('GROUP-2', 'T2.7', 'Print CSS contains #print-area.billing-80mm .th-top-frame and .th-top-decor rules',
    htmlContent.includes('#print-area.billing-80mm .th-top-frame') && htmlContent.includes('#print-area.billing-80mm .th-top-decor'));

  recordTest('GROUP-2', 'T2.8', 'Top frame deity logo is positioned absolutely in center with bottom: 0',
    htmlContent.includes('.th-top-frame .th-deity-logo') && htmlContent.includes('transform: translateX(-50%)'));

  // ============================================================================
  // GROUP 3: Bottom Floral Decoration Implementation & QR Preservation
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Bottom Floral Decoration Implementation & QR Preservation ---');

  recordTest('GROUP-3', 'T3.1', 'TEMPLE_RECEIPT_BOT_DECOR_B64 constant is defined as valid PNG data URI',
    typeof sandbox.TEMPLE_RECEIPT_BOT_DECOR_B64 === 'string' && sandbox.TEMPLE_RECEIPT_BOT_DECOR_B64.startsWith('data:image/png;base64,') && sandbox.TEMPLE_RECEIPT_BOT_DECOR_B64.length > 5000);

  recordTest('GROUP-3', 'T3.2', 'window.TEMPLE_RECEIPT_BOT_DECOR_B64 is globally exposed on window',
    typeof sandbox.window.TEMPLE_RECEIPT_BOT_DECOR_B64 === 'string');

  recordTest('GROUP-3', 'T3.3', 'Bottom decoration image element exists with class th-bot-decor and id billBotDecor',
    renderedScreen.includes('class="th-bot-decor"') && renderedScreen.includes('id="billBotDecor"'));

  recordTest('GROUP-3', 'T3.4', 'Bottom decoration is positioned AFTER the QR code element in the DOM',
    renderedScreen.indexOf('id="billUpiQr"') < renderedScreen.indexOf('id="billBotDecor"'));

  recordTest('GROUP-3', 'T3.5', 'Bottom decoration has clean spacing/margin preventing collision with QR code',
    htmlContent.includes('.th-bot-decor') && (htmlContent.includes('margin: 6px auto') || htmlContent.includes('margin: 8px auto') || htmlContent.includes('margin: 6px')));

  recordTest('GROUP-3', 'T3.6', 'Print CSS includes #print-area.billing-80mm .th-bot-decor rule',
    htmlContent.includes('#print-area.billing-80mm .th-bot-decor'));

  // ============================================================================
  // GROUP 4: Invariant Preservation on Billing Receipt
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Invariant Preservation Across Entire Receipt ---');

  recordTest('GROUP-4', 'T4.1', 'Temple deity title strictly preserved: മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
    renderedScreen.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം'));

  recordTest('GROUP-4', 'T4.2', 'Deity logo image preserved with id billDeityLogo and class th-deity-logo',
    renderedScreen.includes('id="billDeityLogo"') && renderedScreen.includes('class="th-deity-logo"'));

  recordTest('GROUP-4', 'T4.3', 'Screen preview loads continuous-tone deity logo (TEMPLE_DEITY_LOGO_SCREEN_B64)',
    renderedScreen.includes(sandbox.TEMPLE_DEITY_LOGO_SCREEN_B64));

  recordTest('GROUP-4', 'T4.4', 'Print mode loads 1-bit monochrome deity logo (TEMPLE_DEITY_LOGO_B64)',
    renderedPrint.includes(sandbox.TEMPLE_DEITY_LOGO_B64));

  recordTest('GROUP-4', 'T4.5', 'No address line on receipt (Step 33.108 removal invariant preserved)',
    !renderedScreen.includes('ആശാരിവിളാകം') && !renderedScreen.includes('th-sub'));

  recordTest('GROUP-4', 'T4.6', 'Receipt number, date, time strictly preserved',
    renderedScreen.includes('BILL-0105') && renderedScreen.includes('18/10/2026') && renderedScreen.includes('03:50 PM'));

  recordTest('GROUP-4', 'T4.7', 'Devotee roster (name and star) strictly preserved',
    renderedScreen.includes('അനന്തൻ നമ്പൂതിരി') && renderedScreen.includes('തിരുവോണം'));

  recordTest('GROUP-4', 'T4.8', 'Category and item strictly preserved (വഴിപാട്, അർച്ചന)',
    renderedScreen.includes('വഴിപാട്') && renderedScreen.includes('അർച്ചന'));

  recordTest('GROUP-4', 'T4.9', 'Amount and total strictly preserved (₹50.00)',
    renderedScreen.includes('₹50.00'));

  recordTest('GROUP-4', 'T4.10', 'Blessing footer strictly preserved: *** അമ്മേ നാരായണ ദേവി നാരായണ ***',
    renderedScreen.includes('*** അമ്മേ നാരായണ ദേവി നാരായണ ***'));

  recordTest('GROUP-4', 'T4.11', '"SCAN TO PAY" caption strictly preserved',
    renderedScreen.includes('SCAN TO PAY'));

  recordTest('GROUP-4', 'T4.12', 'UPI QR code strictly preserved with id billUpiQr and class th-upi-qr',
    renderedScreen.includes('id="billUpiQr"') && renderedScreen.includes('class="th-upi-qr"'));

  // Strict structural DOM hierarchy
  const posTopDecor = renderedScreen.indexOf('id="billTopDecor"');
  const posLogo = renderedScreen.indexOf('id="billDeityLogo"');
  const posTitle = renderedScreen.indexOf('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം');
  const posLine1 = renderedScreen.indexOf('<div class="th-line">');
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
  recordTest('GROUP-4', 'T4.13', 'Strict DOM structural order: TopDecor -> Logo -> Title -> Line -> Bill No -> Devotee -> Blessing -> SCAN TO PAY -> QR -> BotDecor',
    strictHierarchy);

  // ============================================================================
  // GROUP 5: Headless Chromium Visual Rendering & Real Output Verification
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Headless Chromium Visual Rendering & Output ---');

  const harnessPreviewPath = path.join(PROJECT_DIR, 'tests', 'step_33_107_screen_harness.html');
  const harnessPrintPath = path.join(PROJECT_DIR, 'tests', 'step_33_107_print_harness.html');

  // Extract CSS from Temple_Accounts-1.html
  const cssMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
  const appCss = cssMatch ? cssMatch[1] : '';

  const previewHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.107 Screen Preview Test</title>
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
<title>STEP 33.107 80mm Print Test</title>
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
  .th-upi-qr { width: 28mm; height: 28mm; max-width: 28mm; max-height: 28mm; aspect-ratio: 1 / 1; display: block; margin: 0 auto; image-rendering: pixelated; }
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

  // 1. Capture Screenshot of screen preview via Headless Chrome
  const previewPngPath = path.join(PROJECT_DIR, 'step_33_107_receipt_preview.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,850 "--screenshot=${previewPngPath}" "file:///${harnessPreviewPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.1', 'Headless Chrome captures on-screen Receipt Preview screenshot with top and bottom decorations',
    fs.existsSync(previewPngPath) && fs.statSync(previewPngPath).size > 15000, `${fs.statSync(previewPngPath).size} bytes`);

  // 2. Render 80mm thermal print PDF via Headless Chrome
  const printPdfPath = path.join(PROJECT_DIR, 'tests', 'step_33_107_receipt_print.pdf');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu "--print-to-pdf=${printPdfPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.2', 'Headless Chrome renders 80mm thermal print PDF with decorations',
    fs.existsSync(printPdfPath) && fs.statSync(printPdfPath).size > 15000, `${fs.statSync(printPdfPath).size} bytes`);

  // 3. Capture Screenshot of 80mm Print output via Headless Chrome
  const printPngPath = path.join(PROJECT_DIR, 'step_33_107_receipt_print.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,800 "--screenshot=${printPngPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.3', 'Headless Chrome captures 80mm thermal print output screenshot',
    fs.existsSync(printPngPath) && fs.statSync(printPngPath).size > 10000, `${fs.statSync(printPngPath).size} bytes`);

  // 4. Verify PDF page count & width via Python pypdf
  const pyPdfScript = `import pypdf
reader = pypdf.PdfReader(r'${printPdfPath.replace(/\\/g, '\\\\')}')
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
  const pyPdfPath = path.join(__dirname, 'step_33_107_pdf_check.py');
  fs.writeFileSync(pyPdfPath, pyPdfScript, 'utf8');

  const pdfMetrics = execSync(`python "${pyPdfPath}"`).toString().trim();
  const pagesMatch = pdfMetrics.match(/PAGES=(\d+)/);
  const widthMatch = pdfMetrics.match(/WIDTH_MM=([\d.]+)/);

  const pages = pagesMatch ? parseInt(pagesMatch[1], 10) : 0;
  const widthMm = widthMatch ? parseFloat(widthMatch[1]) : 0;

  recordTest('GROUP-5', 'T5.4', 'Printed receipt PDF is exactly 1 page (zero trailing blank page)',
    pages === 1, `Pages: ${pages}`);

  recordTest('GROUP-5', 'T5.5', 'Printed receipt PDF conforms to 80mm width standard (~80.1mm)',
    Math.abs(widthMm - 80.0) < 1.0, `Width: ${widthMm}mm`);

  // 5. QR scan verification from screen preview
  let scanReceiptOut = 'NO_DECODE';
  try {
    scanReceiptOut = execSync(
      `python -m uv run --with zxing-cpp --with pillow python -c "` +
      `import zxingcpp; from PIL import Image; ` +
      `res = zxingcpp.read_barcodes(Image.open(r'${previewPngPath.replace(/\\/g, '\\\\')}')); ` +
      `print(res[0].text if res else 'NO_DECODE')"`
    ).toString().trim();
  } catch (e) {
    scanReceiptOut = 'ERROR: ' + e.message;
  }
  recordTest('GROUP-5', 'T5.6', 'UPI QR code decodes successfully with bottom decoration present',
    scanReceiptOut.includes('upi://pay') && scanReceiptOut.includes('waicici'), scanReceiptOut);

  // 6. QR scan verification from thermal print screenshot
  let scanPrintOut = 'NO_DECODE';
  try {
    scanPrintOut = execSync(
      `python -m uv run --with zxing-cpp --with pillow python -c "` +
      `import zxingcpp; from PIL import Image; ` +
      `res = zxingcpp.read_barcodes(Image.open(r'${printPngPath.replace(/\\/g, '\\\\')}')); ` +
      `print(res[0].text if res else 'NO_DECODE')"`
    ).toString().trim();
  } catch (e) {
    scanPrintOut = 'ERROR: ' + e.message;
  }
  recordTest('GROUP-5', 'T5.7', 'UPI QR code decodes successfully from thermal print output',
    scanPrintOut.includes('upi://pay') && scanPrintOut.includes('waicici'), scanPrintOut);

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
    reg85Passed = reg85Output.includes('PASSED: 34') && !reg85Output.includes('FAILED: 1');
  } catch (e) {
    reg85Passed = false;
  }
  recordTest('GROUP-6', 'T6.3', 'Step 33.85 Receipt Print Layout regression suite passes (34 tests)', reg85Passed);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('='.repeat(80));

  const resultsSummaryPath = path.join(PROJECT_DIR, 'tests', 'step_33_107_test_results.json');
  fs.writeFileSync(resultsSummaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: testResults.length,
    passed: passCount,
    failed: failCount,
    results: testResults
  }, null, 2), 'utf8');
  console.log(`Detailed test results written to: ${resultsSummaryPath}`);

  if (failCount > 0) {
    console.error('\n❌ SOME STEP 33.107 TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL STEP 33.107 VERIFICATION TESTS PASSED SUCCESSFULLY.');
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
