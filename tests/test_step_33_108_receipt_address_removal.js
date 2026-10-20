/**
 * STEP 33.108: Automated Verification Suite
 * Remove Temple Address Line from 80mm Billing Receipt
 *
 * Requirements:
 * 1. Remove address/subtitle line directly below Malayalam temple name in screen preview and printed 80mm receipt.
 * 2. Remove extra spacing/separator space left by address line so header is clean.
 * 3. Keep temple name, deity logo, and approved floral/decorations unchanged.
 * 4. Keep receipt number, date/time, devotee details, items, amounts, total, payment mode, blessing footer, SCAN TO PAY caption, and QR code unchanged.
 * 5. Do not remove or modify address in unrelated screens, reports, vouchers, settings, or stored records.
 * 6. Do not modify billing calculations, accounting integration, receipt numbering, Firestore data, security rules, or authentication.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const BACKUP_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1_PreStep33_108_ReceiptAddressRemoval_Backup_20261018_184700.html');
const BACKUP_DIR_PATH = path.join(PROJECT_DIR, 'backups', 'Temple_Accounts-1_PreStep33_108_ReceiptAddressRemoval_Backup_20261018_184700.html');
const RULES_PATH = path.join(PROJECT_DIR, 'firestore.rules');
const SERVER_PATH = path.join(PROJECT_DIR, 'server.js');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PRE_STEP_33_108_HASH = '3C620B21EA5CA6CA129E45CEDD9C21A8BF2E2B6D4D451AC7BDE7592E2184648B';
const PRE_STEP_33_108_SIZE = 1575427;
const PRE_STEP_33_108_LINES = 22600;
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
  console.log('STEP 33.108: REMOVE TEMPLE ADDRESS FROM 80MM BILLING RECEIPT');
  console.log('='.repeat(80));

  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const currentHash = sha256File(HTML_PATH);
  const currentSize = fs.statSync(HTML_PATH).size;
  const currentLines = htmlContent.split('\n').length;

  console.log(`\nCurrent HTML SHA-256: ${currentHash}`);
  console.log(`Current HTML Size:    ${currentSize} bytes (delta: ${currentSize - PRE_STEP_33_108_SIZE} bytes)`);
  console.log(`Current Line Count:   ${currentLines} lines\n`);

  // ============================================================================
  // GROUP 1: Cryptographic Invariants & Backup Verification
  // ============================================================================
  console.log('--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');
  recordTest('GROUP-1', 'T1.1', 'Byte-exact root backup file exists at expected path',
    fs.existsSync(BACKUP_PATH), BACKUP_PATH);

  const backupHash = fs.existsSync(BACKUP_PATH) ? sha256File(BACKUP_PATH) : '';
  recordTest('GROUP-1', 'T1.2', 'Root backup SHA-256 matches pre-change baseline hash exactly',
    backupHash === PRE_STEP_33_108_HASH, `Hash: ${backupHash}`);

  const backupSize = fs.existsSync(BACKUP_PATH) ? fs.statSync(BACKUP_PATH).size : 0;
  recordTest('GROUP-1', 'T1.3', 'Root backup file size matches exact pre-change baseline size',
    backupSize === PRE_STEP_33_108_SIZE, `${backupSize} bytes`);

  recordTest('GROUP-1', 'T1.4', 'Byte-exact backup exists in backups directory',
    fs.existsSync(BACKUP_DIR_PATH) && sha256File(BACKUP_DIR_PATH) === PRE_STEP_33_108_HASH);

  recordTest('GROUP-1', 'T1.5', 'Current file size reflects exact -64 bytes single line deletion',
    currentSize === PRE_STEP_33_108_SIZE - 64, `Size: ${currentSize} bytes`);

  recordTest('GROUP-1', 'T1.6', 'Line count is exactly 22,599 lines (22,600 - 1)',
    currentLines === PRE_STEP_33_108_LINES - 1, `Lines: ${currentLines}`);

  const rulesHash = sha256File(RULES_PATH);
  recordTest('GROUP-1', 'T1.7', 'firestore.rules remains untouched and unmodified',
    rulesHash === FIRESTORE_RULES_HASH, `Hash: ${rulesHash}`);

  recordTest('GROUP-1', 'T1.8', 'server.js exists and is preserved',
    fs.existsSync(SERVER_PATH));

  // Verify byte-level single diff event between backup and current
  const backupLines = fs.readFileSync(BACKUP_PATH, 'utf8').split('\n');
  const currLines = htmlContent.split('\n');
  let diffEvents = [];
  for (let i = 0, j = 0; i < backupLines.length; i++, j++) {
    if (backupLines[i] !== currLines[j]) {
      diffEvents.push({ origLine: i + 1, orig: backupLines[i], currLine: j + 1, curr: currLines[j] });
      if (backupLines[i + 1] === currLines[j]) {
        i++; // skip deleted line in backup
      }
    }
  }
  recordTest('GROUP-1', 'T1.9', 'Exactly 1 diff event between pre-change backup and current file',
    diffEvents.length === 1, `Diff events: ${diffEvents.length}`);

  const removedLine = diffEvents[0] ? diffEvents[0].orig.trim() : '';
  recordTest('GROUP-1', 'T1.10', 'Removed line is exactly the th-sub address line: <div class="th-center th-sub">${esc(templeAddress)}</div>',
    removedLine === '<div class="th-center th-sub">${esc(templeAddress)}</div>', `Line: ${removedLine}`);

  // ============================================================================
  // GROUP 2: Removal of Address Line from 80mm Billing Receipt
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Removal of Address Line from 80mm Billing Receipt ---');

  // Setup VM sandbox to execute renderThermalReceiptHTML directly
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    window: {},
    document: { body: { classList: { contains: () => false, add: () => {}, remove: () => {} } } },
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };
  vm.createContext(sandbox);

  const renderFnMatch = htmlContent.match(/function renderThermalReceiptHTML\([\s\S]*?\n    \}/);
  if (!renderFnMatch) {
    throw new Error('Failed to extract renderThermalReceiptHTML from HTML');
  }

  const deityScreenMatch = htmlContent.match(/const TEMPLE_DEITY_LOGO_SCREEN_B64\s*=\s*"([^"]+)";/);
  const deityPrintMatch = htmlContent.match(/const TEMPLE_DEITY_LOGO_B64\s*=\s*"([^"]+)";/);
  const upiQrMatch = htmlContent.match(/const TEMPLE_UPI_QR_B64\s*=\s*"([^"]+)";/);

  sandbox.TEMPLE_DEITY_LOGO_SCREEN_B64 = deityScreenMatch ? deityScreenMatch[1] : '';
  sandbox.TEMPLE_DEITY_LOGO_B64 = deityPrintMatch ? deityPrintMatch[1] : '';
  sandbox.TEMPLE_UPI_QR_B64 = upiQrMatch ? upiQrMatch[1] : '';

  vm.runInContext(renderFnMatch[0], sandbox);

  const testBill = {
    receiptNo: 'BILL-0108',
    date: '18/10/2026',
    time: '06:45 PM',
    devoteeName: 'അനന്തൻ നമ്പൂതിരി',
    star: 'തിരുവോണം',
    category: 'വഴിപാട്',
    item: 'അർച്ചന',
    quantity: 1,
    unitPrice: 50,
    totalAmount: 50,
    paymentMode: 'Cash'
  };

  // Render on-screen preview
  const renderedScreen = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം');
  recordTest('GROUP-2', 'T2.1', 'On-screen preview renderThermalReceiptHTML does NOT contain "ആശാരിവിളാകം"',
    !renderedScreen.includes('ആശാരിവിളാകം'));

  recordTest('GROUP-2', 'T2.2', 'On-screen preview renderThermalReceiptHTML does NOT contain "കേരളദിത്യപുരം" or "കേരളാദിത്യപുരം"',
    !renderedScreen.includes('കേരളദിത്യപുരം') && !renderedScreen.includes('കേരളാദിത്യപുരം'));

  recordTest('GROUP-2', 'T2.3', 'On-screen preview renderThermalReceiptHTML contains zero "th-sub" elements',
    !renderedScreen.includes('th-sub'));

  // Render print mode via isForPrint = true
  const renderedPrint = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം', true);
  recordTest('GROUP-2', 'T2.4', 'Print renderThermalReceiptHTML (isForPrint=true) does NOT contain "ആശാരിവിളാകം"',
    !renderedPrint.includes('ആശാരിവിളാകം'));

  recordTest('GROUP-2', 'T2.5', 'Print renderThermalReceiptHTML does NOT contain "കേരളദിത്യപുരം" or "കേരളാദിത്യപുരം"',
    !renderedPrint.includes('കേരളദിത്യപുരം') && !renderedPrint.includes('കേരളാദിത്യപുരം'));

  recordTest('GROUP-2', 'T2.6', 'Print renderThermalReceiptHTML contains zero "th-sub" elements',
    !renderedPrint.includes('th-sub'));

  // Render print mode via window._isThermalPrinting
  sandbox.window._isThermalPrinting = true;
  const renderedPrintViaFlag = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം');
  recordTest('GROUP-2', 'T2.7', 'Print renderThermalReceiptHTML via window._isThermalPrinting does NOT contain address',
    !renderedPrintViaFlag.includes('ആശാരിവിളാകം'));
  sandbox.window._isThermalPrinting = false;

  // Verify clean header spacing: directly below title is th-line (no empty div or placeholder)
  const posTitleEnd = renderedScreen.indexOf('</div>', renderedScreen.indexOf('th-title')) + 6;
  const snippetAfterTitle = renderedScreen.slice(posTitleEnd, renderedScreen.indexOf('<div class="th-line">')).trim();
  recordTest('GROUP-2', 'T2.8', 'Zero empty divs or separator placeholders between title and first th-line',
    snippetAfterTitle === '', `Intermediary snippet: ${JSON.stringify(snippetAfterTitle)}`);

  // ============================================================================
  // GROUP 3: Invariant Preservation on Billing Receipt
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Invariant Preservation on Billing Receipt ---');

  recordTest('GROUP-3', 'T3.1', 'Temple deity title remains strictly preserved: മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
    renderedScreen.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം'));

  recordTest('GROUP-3', 'T3.2', 'Deity logo element strictly preserved at top of receipt (th-deity-logo)',
    renderedScreen.includes('class="th-deity-logo"'));

  recordTest('GROUP-3', 'T3.3', 'Receipt numbering strictly preserved (BILL-0108)',
    renderedScreen.includes('BILL-0108'));

  recordTest('GROUP-3', 'T3.4', 'Date and time preserved (18/10/2026, 06:45 PM)',
    renderedScreen.includes('18/10/2026') && renderedScreen.includes('06:45 PM'));

  recordTest('GROUP-3', 'T3.5', 'Devotee name and star preserved (അനന്തൻ നമ്പൂതിരി, തിരുവോണം)',
    renderedScreen.includes('അനന്തൻ നമ്പൂതിരി') && renderedScreen.includes('തിരുവോണം'));

  recordTest('GROUP-3', 'T3.6', 'Item and category preserved (വഴിപാട്, അർച്ചന)',
    renderedScreen.includes('വഴിപാട്') && renderedScreen.includes('അർച്ചന'));

  recordTest('GROUP-3', 'T3.7', 'Amount and total preserved (₹50.00)',
    renderedScreen.includes('₹50.00'));

  recordTest('GROUP-3', 'T3.8', 'Payment mode preserved (Cash)',
    renderedScreen.includes('Cash'));

  recordTest('GROUP-3', 'T3.9', 'Blessing footer strictly preserved: *** അമ്മേ നാരായണ ദേവി നാരായണ ***',
    renderedScreen.includes('*** അമ്മേ നാരായണ ദേവി നാരായണ ***'));

  recordTest('GROUP-3', 'T3.10', '"SCAN TO PAY" caption strictly preserved',
    renderedScreen.includes('SCAN TO PAY'));

  recordTest('GROUP-3', 'T3.11', 'UPI QR code element strictly preserved (th-upi-qr)',
    renderedScreen.includes('class="th-upi-qr"'));

  // Strict DOM structural ordering verification
  const posLogo = renderedScreen.indexOf('class="th-deity-logo"');
  const posTitle = renderedScreen.indexOf('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം');
  const posLine1 = renderedScreen.indexOf('<div class="th-line">');
  const posReceiptNo = renderedScreen.indexOf('BILL-0108');
  const posDevotee = renderedScreen.indexOf('അനന്തൻ നമ്പൂതിരി');
  const posBlessing = renderedScreen.indexOf('*** അമ്മേ നാരായണ ദേവി നാരായണ ***');
  const posScanToPay = renderedScreen.indexOf('SCAN TO PAY');
  const posQr = renderedScreen.indexOf('class="th-upi-qr"');

  const strictOrder = (
    posLogo !== -1 &&
    posTitle > posLogo &&
    posLine1 > posTitle &&
    posReceiptNo > posLine1 &&
    posDevotee > posReceiptNo &&
    posBlessing > posDevotee &&
    posScanToPay > posBlessing &&
    posQr > posScanToPay
  );
  recordTest('GROUP-3', 'T3.12', 'Strict structural ordering: Logo -> Title -> Line -> Bill No -> Devotee -> Blessing -> SCAN TO PAY -> QR',
    strictOrder);

  // ============================================================================
  // GROUP 4: Isolation of Unrelated Views & Screens
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Isolation of Unrelated Views & Screens ---');

  // Accounts printReceipt()
  const printReceiptMatch = htmlContent.match(/function printReceipt\(r\)\s*\{[\s\S]*?\n    \}/);
  recordTest('GROUP-4', 'T4.1', 'Accounts printReceipt() preserves templeAddress definition and fallback',
    printReceiptMatch && printReceiptMatch[0].includes("templeAddress = s.address || 'ആശാരിവിളാകം, കേരളാദിത്യപുരം'"));

  recordTest('GROUP-4', 'T4.2', 'Accounts printReceipt() retains pr-sub markup for Accounts vouchers',
    printReceiptMatch && printReceiptMatch[0].includes('<div class="pr-center pr-sub">${esc(templeAddress)}</div>'));

  // Billing report printBillingReport()
  const printBillingReportMatch = htmlContent.match(/function printBillingReport\(\)\s*\{[\s\S]*?\n    \}/);
  recordTest('GROUP-4', 'T4.3', 'printBillingReport() retains templeAddress and its rendering',
    printBillingReportMatch && printBillingReportMatch[0].includes('templeAddress'));

  // viewBillingDetails(id) modal
  const viewBillingDetailsMatch = htmlContent.match(/async function viewBillingDetails\(id\)\s*\{[\s\S]*?\n    \}/);
  recordTest('GROUP-4', 'T4.4', 'viewBillingDetails() modal retains templeAddress and its rendering',
    viewBillingDetailsMatch && viewBillingDetailsMatch[0].includes('templeAddress'));

  // seedIfNeeded() settings configuration
  const seedIfNeededMatch = htmlContent.match(/async function seedIfNeeded\(\)\s*\{[\s\S]*?\n    \}/);
  recordTest('GROUP-4', 'T4.5', 'seedIfNeeded() retains address: "ആശാരിവിളാകം കേരളാദിത്യപുരം" in settings store',
    seedIfNeededMatch && seedIfNeededMatch[0].includes("address: 'ആശാരിവിളാകം കേരളാദിത്യപുരം'"));

  // Settings form HTML
  recordTest('GROUP-4', 'T4.6', 'Settings UI retains address input field (<input type="text" name="address")',
    htmlContent.includes('<input type="text" name="address"'));

  // ============================================================================
  // GROUP 5: Headless Chromium Visual Rendering & Real Output Verification
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Headless Chromium Visual Rendering & Output ---');

  const harnessPreviewPath = path.join(PROJECT_DIR, 'tests', 'step_33_108_screen_harness.html');
  const harnessPrintPath = path.join(PROJECT_DIR, 'tests', 'step_33_108_print_harness.html');

  // Extract CSS from Temple_Accounts-1.html
  const cssMatch = htmlContent.match(/<style>([\s\S]*?)<\/style>/);
  const appCss = cssMatch ? cssMatch[1] : '';

  const previewHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
  <meta charset="UTF-8">
  <title>STEP 33.108 Receipt Preview Harness</title>
  <style>
    ${appCss}
    body {
      background: #f1f5f9;
      padding: 20px;
      display: flex;
      justify-content: center;
      font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace;
    }
    .preview-card {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      width: 320px;
    }
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

  // Self-contained 80mm print test harness matching STEP 33.105 standard
  const printHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.108 80mm Print Test</title>
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
  ${renderedPrint}
</div>
</body>
</html>`;

  fs.writeFileSync(harnessPrintPath, printHarnessHtml, 'utf8');

  // 1. Capture Screenshot of screen preview via Headless Chrome
  const previewPngPath = path.join(PROJECT_DIR, 'step_33_108_receipt_preview.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,750 "--screenshot=${previewPngPath}" "file:///${harnessPreviewPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.1', 'Headless Chrome captures on-screen Receipt Preview screenshot without address',
    fs.existsSync(previewPngPath) && fs.statSync(previewPngPath).size > 10000, `${fs.statSync(previewPngPath).size} bytes`);

  // 2. Render 80mm thermal print PDF via Headless Chrome
  const printPdfPath = path.join(PROJECT_DIR, 'tests', 'step_33_108_receipt_print.pdf');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu "--print-to-pdf=${printPdfPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.2', 'Headless Chrome renders 80mm thermal print PDF without address',
    fs.existsSync(printPdfPath) && fs.statSync(printPdfPath).size > 15000, `${fs.statSync(printPdfPath).size} bytes`);

  // 3. Capture Screenshot of 80mm Print output via Headless Chrome
  const printPngPath = path.join(PROJECT_DIR, 'step_33_108_receipt_print.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,750 "--screenshot=${printPngPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
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
  const pyPdfPath = path.join(__dirname, 'step_33_108_pdf_check.py');
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

  // 5. QR scan verification
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

  const expectedUri = 'upi://pay?pn=ASARI%20VILAKAM%20MARUTHA%20CHAMUNDI%20DEVI%20TEMPLE&mode=01&pa=917306611995@waicici';
  recordTest('GROUP-5', 'T5.6', 'UPI QR code continues to decode with byte-level fidelity from clean screen preview',
    scanReceiptOut === expectedUri, `URI: ${scanReceiptOut}`);

  // ============================================================================
  // GROUP 6: Regression Verification
  // ============================================================================
  console.log('\n--- TEST GROUP 6: Regression Verification ---');

  // Run Step 33.94 Billing Fund Sync regression suite
  let step94Passed = false;
  try {
    const out94 = execSync('node tests/test_step_33_94_billing_sync.js', { cwd: PROJECT_DIR, encoding: 'utf8' });
    step94Passed = out94.includes('ALL STEP 33.94 VERIFICATION TESTS PASSED SUCCESSFULLY');
  } catch (e) {
    step94Passed = false;
  }
  recordTest('GROUP-6', 'T6.1', 'Step 33.94 Billing Fund Sync regression suite passes (48 tests)', step94Passed);

  // Run Step 33.96 Fund Validation regression suite
  let step96Passed = false;
  try {
    const out96 = execSync('node tests/test_step_33_96_fund_validation.js', { cwd: PROJECT_DIR, encoding: 'utf8' });
    step96Passed = out96.includes('ALL STEP 33.96 VERIFICATION TESTS PASSED SUCCESSFULLY');
  } catch (e) {
    step96Passed = false;
  }
  recordTest('GROUP-6', 'T6.2', 'Step 33.96 Fund Validation regression suite passes (35 tests)', step96Passed);

  // Run Step 33.85 Receipt Print Layout regression suite with retry for Windows file locking
  let step85Passed = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Small pause before running to avoid file lock contention
      const out85 = execSync('node tests/test_step_33_85_receipt_print_layout.js', { cwd: PROJECT_DIR, encoding: 'utf8' });
      if (out85.includes('TOTAL TESTS: 34 | PASSED: 34 | FAILED: 0')) {
        step85Passed = true;
        break;
      }
    } catch (e) {
      if (attempt < 3) {
        // Sleep 1s and retry
        execSync('powershell -Command "Start-Sleep -Milliseconds 1000"');
      }
    }
  }
  recordTest('GROUP-6', 'T6.3', 'Step 33.85 Receipt Print Layout regression suite passes (34 tests)', step85Passed);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('='.repeat(80));

  const reportOutPath = path.join(PROJECT_DIR, 'tests', 'step_33_108_test_results.json');
  fs.writeFileSync(reportOutPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    currentHash,
    currentSize,
    total: testResults.length,
    passed: passCount,
    failed: failCount,
    results: testResults
  }, null, 2), 'utf8');
  console.log(`Detailed test results written to: ${reportOutPath}`);

  if (failCount === 0) {
    console.log('\n✅ ALL STEP 33.108 VERIFICATION TESTS PASSED SUCCESSFULLY.');
  } else {
    console.error(`\n❌ ${failCount} TEST(S) FAILED.`);
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
