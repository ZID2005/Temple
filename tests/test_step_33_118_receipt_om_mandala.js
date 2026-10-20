/**
 * STEP 33.118: Verification Suite
 * Replace Existing Deity Image in Billing Receipt with Om Mandala
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const PROJECT_DIR = 'D:\\Temple';
const HTML_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1.html');
const BACKUP_PATH = path.join(PROJECT_DIR, 'Temple_Accounts-1_PreStep33_118_OmMandala_Backup_20261019_115500.html');
const BACKUP_DIR_PATH = path.join(PROJECT_DIR, 'backups', 'Temple_Accounts-1_PreStep33_118_OmMandala_Backup_20261019_115500.html');
const RULES_PATH = path.join(PROJECT_DIR, 'firestore.rules');
const SERVER_PATH = path.join(PROJECT_DIR, 'server.js');
const ASSETS_DIR = path.join(PROJECT_DIR, 'assets');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PRE_STEP_33_118_HASH = '4373AA358523DA8C504A8F772C3BFC61195CE4BB4A7376317625D9EB43C9DE9C';
const PRE_STEP_33_118_SIZE = 1653965;
const FIRESTORE_RULES_HASH = '7BFEF0B0F4C31A5DAFC6FB29C8C4BBD55CBAD3A8A590EFC34BD87F4600CF90BD';

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
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
  console.log('STEP 33.118: REPLACE EXISTING DEITY IMAGE IN BILLING RECEIPT WITH OM MANDALA');
  console.log('='.repeat(80));

  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const currentHash = sha256File(HTML_PATH);
  const currentSize = fs.statSync(HTML_PATH).size;
  const currentLines = htmlContent.split('\n').length;

  console.log(`\nCurrent HTML SHA-256: ${currentHash}`);
  console.log(`Current HTML Size:    ${currentSize} bytes (delta: ${currentSize - PRE_STEP_33_118_SIZE} bytes)`);
  console.log(`Current Line Count:   ${currentLines} lines\n`);

  // ============================================================================
  // GROUP 1: Cryptographic Invariants & Backup Verification
  // ============================================================================
  console.log('--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');

  recordTest('GROUP-1', 'T1.1', 'Byte-exact root backup file exists at expected path',
    fs.existsSync(BACKUP_PATH), BACKUP_PATH);

  const backupHash = fs.existsSync(BACKUP_PATH) ? sha256File(BACKUP_PATH) : '';
  recordTest('GROUP-1', 'T1.2', 'Root backup SHA-256 matches pre-change baseline hash exactly',
    backupHash === PRE_STEP_33_118_HASH, `Hash: ${backupHash}`);

  const backupSize = fs.existsSync(BACKUP_PATH) ? fs.statSync(BACKUP_PATH).size : 0;
  recordTest('GROUP-1', 'T1.3', 'Root backup file size matches exact pre-change baseline size',
    backupSize === PRE_STEP_33_118_SIZE, `${backupSize} bytes`);

  recordTest('GROUP-1', 'T1.4', 'Byte-exact backup exists in backups directory',
    fs.existsSync(BACKUP_DIR_PATH) && sha256File(BACKUP_DIR_PATH) === PRE_STEP_33_118_HASH);

  recordTest('GROUP-1', 'T1.5', 'Temple_Accounts-1.html has updated hash reflecting Step 33.118 edits',
    currentHash !== PRE_STEP_33_118_HASH, `Current: ${currentHash}`);

  recordTest('GROUP-1', 'T1.6', 'Temple_Accounts-1.html maintains exact line count (23,507 lines)',
    currentLines === 23507, `Lines: ${currentLines}`);

  const rulesHash = sha256File(RULES_PATH);
  recordTest('GROUP-1', 'T1.7', 'firestore.rules remains untouched and unmodified',
    rulesHash === FIRESTORE_RULES_HASH, `Hash: ${rulesHash}`);

  recordTest('GROUP-1', 'T1.8', 'server.js exists and is preserved',
    fs.existsSync(SERVER_PATH));

  // ============================================================================
  // GROUP 2: Om Mandala Image Assets Integrity & Provenance
  // ============================================================================
  console.log('\n--- TEST GROUP 2: Om Mandala Image Assets Integrity & Provenance ---');

  const origMandalaPath = path.join(ASSETS_DIR, 'temple_om_mandala_original.jpg');
  const screenLogoPath = path.join(ASSETS_DIR, 'temple_deity_logo_screen.png');
  const bwLogoPath = path.join(ASSETS_DIR, 'temple_deity_logo_bw.png');

  recordTest('GROUP-2', 'T2.1', 'Authoritative Om mandala image preserved in assets (temple_om_mandala_original.jpg)',
    fs.existsSync(origMandalaPath) && fs.statSync(origMandalaPath).size === 63432, `${fs.statSync(origMandalaPath).size} bytes`);

  recordTest('GROUP-2', 'T2.2', 'Smooth continuous-tone screen asset exists (temple_deity_logo_screen.png)',
    fs.existsSync(screenLogoPath) && fs.statSync(screenLogoPath).size > 20000, `${fs.statSync(screenLogoPath).size} bytes`);

  recordTest('GROUP-2', 'T2.3', '1-bit monochrome thermal print asset exists (temple_deity_logo_bw.png)',
    fs.existsSync(bwLogoPath) && fs.statSync(bwLogoPath).size > 4000, `${fs.statSync(bwLogoPath).size} bytes`);

  // Verify Base64 embedding in Temple_Accounts-1.html
  const screenB64Match = htmlContent.match(/const TEMPLE_DEITY_LOGO_SCREEN_B64\s*=\s*"([^"]+)";/);
  recordTest('GROUP-2', 'T2.4', 'TEMPLE_DEITY_LOGO_SCREEN_B64 constant declared and embedded in HTML',
    screenB64Match && screenB64Match[1].startsWith('data:image/png;base64,') && screenB64Match[1].length > 20000);

  const screenAssetBuf = fs.readFileSync(screenLogoPath);
  const embeddedScreenBuf = screenB64Match ? Buffer.from(screenB64Match[1].replace('data:image/png;base64,', ''), 'base64') : Buffer.alloc(0);
  recordTest('GROUP-2', 'T2.5', 'TEMPLE_DEITY_LOGO_SCREEN_B64 is byte-identical to assets/temple_deity_logo_screen.png',
    sha256Buf(screenAssetBuf) === sha256Buf(embeddedScreenBuf), `Hash: ${sha256Buf(embeddedScreenBuf)}`);

  const printB64Match = htmlContent.match(/const TEMPLE_DEITY_LOGO_B64\s*=\s*"([^"]+)";/);
  recordTest('GROUP-2', 'T2.6', 'TEMPLE_DEITY_LOGO_B64 constant declared and embedded in HTML',
    printB64Match && printB64Match[1].startsWith('data:image/png;base64,') && printB64Match[1].length > 4000);

  const printAssetBuf = fs.readFileSync(bwLogoPath);
  const embeddedPrintBuf = printB64Match ? Buffer.from(printB64Match[1].replace('data:image/png;base64,', ''), 'base64') : Buffer.alloc(0);
  recordTest('GROUP-2', 'T2.7', 'TEMPLE_DEITY_LOGO_B64 is byte-identical to assets/temple_deity_logo_bw.png',
    sha256Buf(printAssetBuf) === sha256Buf(embeddedPrintBuf), `Hash: ${sha256Buf(embeddedPrintBuf)}`);

  recordTest('GROUP-2', 'T2.8', 'Both constants globally exposed on window object',
    htmlContent.includes('window.TEMPLE_DEITY_LOGO_B64 = TEMPLE_DEITY_LOGO_B64;') &&
    htmlContent.includes('window.TEMPLE_DEITY_LOGO_SCREEN_B64 = TEMPLE_DEITY_LOGO_SCREEN_B64;'));

  // Verify old deity photograph is completely expunged from the file
  const oldPhotoFragment = 'iVBORw0KGgoAAAANSUhEUgAAASwAAAHCAQAAAAB9SMkq';
  recordTest('GROUP-2', 'T2.9', 'Old deity photograph Base64 is completely expunged from Temple_Accounts-1.html',
    !htmlContent.includes(oldPhotoFragment));

  // ============================================================================
  // GROUP 3: Image Geometry, Inversion & Thermal Print Readiness
  // ============================================================================
  console.log('\n--- TEST GROUP 3: Image Geometry & Print Readiness ---');

  const pyCheckScript = `from PIL import Image
import numpy as np

# Screen asset check
screen = Image.open(r'${screenLogoPath.replace(/\\/g, '\\\\')}')
sw, sh = screen.size
s_arr = np.array(screen.convert('L'))
s_bg = np.mean([s_arr[0,0], s_arr[0,-1], s_arr[-1,0], s_arr[-1,-1]])
s_ink = np.count_nonzero(s_arr < 140) / s_arr.size * 100.0

# Print asset check
bw = Image.open(r'${bwLogoPath.replace(/\\/g, '\\\\')}')
bw_w, bw_h = bw.size
bw_arr = np.array(bw.convert('L'))
bw_bg = np.mean([bw_arr[0,0], bw_arr[0,-1], bw_arr[-1,0], bw_arr[-1,-1]])
bw_ink = np.count_nonzero(bw_arr == 0) / bw_arr.size * 100.0

# Om center check (center 100x100 of 460x460 is [180:280, 180:280])
om_region = bw_arr[180:280, 180:280]
om_ink = np.count_nonzero(om_region == 0) / om_region.size * 100.0

# Outer mandala dots in 4 quadrants
q1 = np.count_nonzero(bw_arr[30:100, 200:260] == 0) # top tip
q2 = np.count_nonzero(bw_arr[360:430, 200:260] == 0) # bottom tip
q3 = np.count_nonzero(bw_arr[200:260, 30:100] == 0) # left tip
q4 = np.count_nonzero(bw_arr[200:260, 360:430] == 0) # right tip

print(f"SCREEN_SIZE={sw}x{sh}")
print(f"SCREEN_BG={s_bg:.1f}")
print(f"SCREEN_INK_PCT={s_ink:.1f}")
print(f"BW_SIZE={bw_w}x{bw_h}")
print(f"BW_BG={bw_bg:.1f}")
print(f"BW_INK_PCT={bw_ink:.1f}")
print(f"OM_INK_PCT={om_ink:.1f}")
print(f"TIPS_ACTIVE={all(q > 20 for q in [q1, q2, q3, q4])}")
`;
  const pyCheckPath = path.join(__dirname, 'step_33_118_image_check.py');
  fs.writeFileSync(pyCheckPath, pyCheckScript, 'utf8');

  const imgMetrics = execSync(`python "${pyCheckPath}"`).toString().trim();
  const getMetric = (name) => {
    const m = imgMetrics.match(new RegExp(`${name}=([^\\r\\n]+)`));
    return m ? m[1] : '';
  };

  const screenDim = getMetric('SCREEN_SIZE');
  const screenBg = parseFloat(getMetric('SCREEN_BG') || '0');
  const screenInk = parseFloat(getMetric('SCREEN_INK_PCT') || '0');
  const bwDim = getMetric('BW_SIZE');
  const bwBg = parseFloat(getMetric('BW_BG') || '0');
  const bwInk = parseFloat(getMetric('BW_INK_PCT') || '0');
  const omInk = parseFloat(getMetric('OM_INK_PCT') || '0');
  const tipsActive = getMetric('TIPS_ACTIVE') === 'True';

  recordTest('GROUP-3', 'T3.1', 'Screen asset maintains strict 1:1 square aspect ratio (460x460)',
    screenDim === '460x460', screenDim);

  recordTest('GROUP-3', 'T3.2', 'Screen asset background converted to pure white paper',
    screenBg >= 250, `Brightness: ${screenBg}`);

  recordTest('GROUP-3', 'T3.3', 'Screen asset artwork inverted to clean black ink (~15% coverage)',
    screenInk >= 10 && screenInk <= 25, `Coverage: ${screenInk}%`);

  recordTest('GROUP-3', 'T3.4', 'Thermal print asset maintains strict 1:1 square aspect ratio (460x460)',
    bwDim === '460x460', bwDim);

  recordTest('GROUP-3', 'T3.5', 'Thermal print asset background is pure white (255)',
    bwBg === 255.0, `Brightness: ${bwBg}`);

  recordTest('GROUP-3', 'T3.6', 'Thermal print ink coverage prevents printhead burnout (~15.5%)',
    bwInk >= 12 && bwInk <= 22, `Coverage: ${bwInk}%`);

  recordTest('GROUP-3', 'T3.7', 'Central sacred Om symbol is preserved with rich detail',
    omInk >= 15, `Om region coverage: ${omInk}%`);

  recordTest('GROUP-3', 'T3.8', 'Ornate mandala tips and flourishes preserved in all quadrants',
    tipsActive, 'Tips preserved: top, bottom, left, right');

  // ============================================================================
  // GROUP 4: Receipt DOM Rendering & Invariant Preservation
  // ============================================================================
  console.log('\n--- TEST GROUP 4: Receipt DOM Rendering & Invariants ---');

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    window: {},
    document: { body: { classList: { contains: () => false, add: () => {}, remove: () => {} } } },
    esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  };
  vm.createContext(sandbox);

  const assetsMatch = htmlContent.match(/\/\* ===================== STEP 33\.102: 80MM THERMAL RECEIPT ASSETS ===================== \*\/([\s\S]*?)(?=function renderThermalReceiptHTML)/);
  if (!assetsMatch) throw new Error('Failed to extract asset block from HTML');
  vm.runInContext(assetsMatch[1], sandbox);

  sandbox.TEMPLE_DEITY_LOGO_B64 = sandbox.window.TEMPLE_DEITY_LOGO_B64;
  sandbox.TEMPLE_DEITY_LOGO_SCREEN_B64 = sandbox.window.TEMPLE_DEITY_LOGO_SCREEN_B64;
  sandbox.TEMPLE_UPI_QR_B64 = sandbox.window.TEMPLE_UPI_QR_B64;
  sandbox.TEMPLE_RECEIPT_TOP_DECOR_B64 = sandbox.window.TEMPLE_RECEIPT_TOP_DECOR_B64;
  sandbox.TEMPLE_RECEIPT_BOT_DECOR_B64 = sandbox.window.TEMPLE_RECEIPT_BOT_DECOR_B64;

  const renderFnMatch = htmlContent.match(/function renderThermalReceiptHTML\([\s\S]*?\n    \}/);
  if (!renderFnMatch) throw new Error('Failed to extract renderThermalReceiptHTML from HTML');
  vm.runInContext(renderFnMatch[0], sandbox);

  const testBill = {
    receiptNo: 'BILL-0118',
    date: '19/10/2026',
    time: '11:45 AM',
    devoteeName: 'അനന്തൻ നമ്പൂതിരി',
    star: 'തിരുവോണം',
    category: 'വഴിപാട്',
    item: 'പുഷ്പാഞ്ജലി',
    quantity: 1,
    unitPrice: 30,
    totalAmount: 30,
    paymentMode: 'UPI'
  };

  const renderedPreview = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം');
  const renderedPrint = sandbox.renderThermalReceiptHTML(testBill, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളാദിത്യപുരം', true);

  recordTest('GROUP-4', 'T4.1', 'Screen preview loads smooth Om mandala asset (TEMPLE_DEITY_LOGO_SCREEN_B64)',
    renderedPreview.includes(sandbox.TEMPLE_DEITY_LOGO_SCREEN_B64));

  recordTest('GROUP-4', 'T4.2', 'Print rendering loads 1-bit monochrome Om mandala (TEMPLE_DEITY_LOGO_B64)',
    renderedPrint.includes(sandbox.TEMPLE_DEITY_LOGO_B64));

  recordTest('GROUP-4', 'T4.3', 'Receipt logo element has id="billDeityLogo" and class="th-deity-logo"',
    renderedPreview.includes('id="billDeityLogo"') && renderedPreview.includes('class="th-deity-logo"'));

  recordTest('GROUP-4', 'T4.4', 'Receipt logo sits inside th-top-frame container with top floral decoration',
    renderedPreview.includes('class="th-top-frame"') && renderedPreview.includes('id="billTopDecor"'));

  recordTest('GROUP-4', 'T4.5', 'Temple name strictly preserved: മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം',
    renderedPreview.includes('മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം'));

  recordTest('GROUP-4', 'T4.6', 'No temple address appears on receipt (Step 33.108 removal preserved)',
    !renderedPreview.includes('ആശാരിവിളാകം') && !renderedPreview.includes('th-sub'));

  recordTest('GROUP-4', 'T4.7', 'Receipt number, date, time strictly preserved',
    renderedPreview.includes('BILL-0118') && renderedPreview.includes('19/10/2026') && renderedPreview.includes('11:45 AM'));

  recordTest('GROUP-4', 'T4.8', 'Devotee name, star, item, and total strictly preserved',
    renderedPreview.includes('അനന്തൻ നമ്പൂതിരി') && renderedPreview.includes('തിരുവോണം') &&
    renderedPreview.includes('പുഷ്പാഞ്ജലി') && renderedPreview.includes('₹30.00'));

  recordTest('GROUP-4', 'T4.9', 'Blessing footer strictly preserved: *** അമ്മേ നാരായണ ദേവി നാരായണ ***',
    renderedPreview.includes('*** അമ്മേ നാരായണ ദേവി നാരായണ ***'));

  recordTest('GROUP-4', 'T4.10', 'UPI QR code strictly preserved with id="billUpiQr" and class="th-upi-qr"',
    renderedPreview.includes('id="billUpiQr"') && renderedPreview.includes('class="th-upi-qr"'));

  recordTest('GROUP-4', 'T4.11', '"SCAN TO PAY" caption strictly preserved',
    renderedPreview.includes('SCAN TO PAY'));

  recordTest('GROUP-4', 'T4.12', 'Bottom floral decoration strictly preserved with id="billBotDecor"',
    renderedPreview.includes('id="billBotDecor"') && renderedPreview.includes('class="th-bot-decor"'));

  // ============================================================================
  // GROUP 5: Headless Chrome Rendering & QR Scanning Verification
  // ============================================================================
  console.log('\n--- TEST GROUP 5: Headless Chrome Rendering & Verification ---');

  // Preview test harness
  const previewHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.118 Receipt Preview Test</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #4a5568; padding: 15px; font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace; font-size: 11.5px; line-height: 1.35; color: #111; }
  .modal-box { background: #fff; width: 80mm; max-width: 80mm; margin: 0 auto; padding: 3mm 4mm 4mm 4mm; border-radius: 4px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
  .th-receipt { width: 100%; max-width: 80mm; color: #111; font-variant-numeric: tabular-nums; }
  .th-center { text-align: center; }
  .th-bold { font-weight: bold; }
  .th-logo-wrap { text-align: center; margin-bottom: 4px; }
  .th-top-frame { position: relative; width: 100%; margin: 0 auto; line-height: 0; }
  .th-top-decor { width: 100%; height: auto; display: block; margin: 0 auto; image-rendering: auto; }
  .th-top-frame .th-deity-logo { position: absolute; left: 50%; transform: translateX(-50%); bottom: 0; width: 23.16%; height: auto; aspect-ratio: 300 / 450; object-fit: contain; display: block; margin: 0; }
  .th-deity-logo { width: 20mm; max-width: 20mm; height: auto; aspect-ratio: 300 / 450; display: block; margin: 0 auto; object-fit: contain; image-rendering: auto; }
  .th-title { font-size: 13px; font-weight: 800; line-height: 1.32; margin-bottom: 2px; letter-spacing: 0.15px; color: #000; text-align: center; }
  .th-line { border-bottom: 1px dashed #444; margin: 4px 0; width: 100%; display: block; }
  .th-flex { display: flex; justify-content: space-between; align-items: baseline; width: 100%; font-variant-numeric: tabular-nums; }
  .th-row { font-size: 11.5px; margin: 2px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .th-total { font-size: 13.5px; font-weight: bold; font-variant-numeric: tabular-nums; }
  .th-blessing { font-size: 10px; font-weight: 700; margin-top: 5px; text-align: center; color: #374151; }
  .th-upi-section { text-align: center; margin-top: 6px; padding-top: 2px; }
  .th-scan-pay { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 3px; color: #111; text-align: center; }
  .th-upi-qr { width: 28mm; height: 28mm; max-width: 28mm; max-height: 28mm; aspect-ratio: 1 / 1; display: block; margin: 0 auto; image-rendering: pixelated; }
  .th-bot-decor { width: 100%; height: auto; display: block; margin: 6px auto 2px auto; image-rendering: auto; }
  .th-roster-row { font-size: 11.5px; margin: 2.5px 0; line-height: 1.35; display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
  .th-roster-name, .th-roster-star { font-size: 13.5px; }
</style>
</head>
<body>
<div class="modal-box">
  ${renderedPreview}
</div>
</body>
</html>`;

  const harnessPreviewPath = path.join(PROJECT_DIR, 'scratch', 'step_33_118_preview_harness.html');
  fs.writeFileSync(harnessPreviewPath, previewHarnessHtml, 'utf8');

  // Print test harness
  const printHarnessHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.118 80mm Print Test</title>
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

  const harnessPrintPath = path.join(PROJECT_DIR, 'scratch', 'step_33_118_print_harness.html');
  fs.writeFileSync(harnessPrintPath, printHarnessHtml, 'utf8');

  // 1. Capture Screenshot of screen preview via Headless Chrome
  const previewPngPath = path.join(PROJECT_DIR, 'step_33_118_receipt_preview.png');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu --window-size=500,850 "--screenshot=${previewPngPath}" "file:///${harnessPreviewPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.1', 'Headless Chrome captures on-screen Receipt Preview screenshot with Om mandala',
    fs.existsSync(previewPngPath) && fs.statSync(previewPngPath).size > 15000, `${fs.statSync(previewPngPath).size} bytes`);

  // 2. Render 80mm thermal print PDF via Headless Chrome
  const printPdfPath = path.join(PROJECT_DIR, 'step_33_118_receipt_print.pdf');
  execSync(`"${CHROME_PATH}" --headless=new --disable-gpu "--print-to-pdf=${printPdfPath}" "file:///${harnessPrintPath.replace(/\\/g, '/')}"`);
  recordTest('GROUP-5', 'T5.2', 'Headless Chrome renders 80mm thermal print PDF with Om mandala',
    fs.existsSync(printPdfPath) && fs.statSync(printPdfPath).size > 15000, `${fs.statSync(printPdfPath).size} bytes`);

  // 3. Capture Screenshot of 80mm Print output via Headless Chrome
  const printPngPath = path.join(PROJECT_DIR, 'step_33_118_receipt_print.png');
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
  const pyPdfPath = path.join(PROJECT_DIR, 'scratch', 'step_33_118_pdf_check.py');
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
  recordTest('GROUP-5', 'T5.6', 'UPI QR code decodes successfully from Receipt Preview with Om mandala',
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

  // Step 33.85 Receipt Print Layout regression suite
  let reg85Passed = false;
  try {
    const reg85Output = execSync('node tests/test_step_33_85_receipt_print_layout.js', { cwd: PROJECT_DIR, timeout: 30000 }).toString();
    reg85Passed = reg85Output.includes('ALL 34 TESTS PASSED') || reg85Output.includes('PASSED: 34');
  } catch (e) {
    reg85Passed = false;
  }
  recordTest('GROUP-6', 'T6.2', 'Step 33.85 Receipt Print Layout regression suite passes (34 tests)', reg85Passed);

  console.log('\n' + '='.repeat(80));
  console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('='.repeat(80));

  const jsonResultsPath = path.join(PROJECT_DIR, 'tests', 'step_33_118_test_results.json');
  fs.writeFileSync(jsonResultsPath, JSON.stringify(testResults, null, 2), 'utf8');
  console.log(`Detailed test results written to: ${jsonResultsPath}`);

  if (failCount === 0) {
    console.log('\n✅ ALL STEP 33.118 VERIFICATION TESTS PASSED SUCCESSFULLY.');
  } else {
    console.error(`\n❌ ${failCount} VERIFICATION TESTS FAILED.`);
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
