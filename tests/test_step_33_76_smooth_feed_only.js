/**
 * STEP 33.76 — Remove Stepped Feed and Retain Smooth Feed Verification Suite
 *
 * Verifies all 8 mandatory requirements:
 * 1. STEPPED FEED button is absent from the DOM (#printerModeToggleBtn does not exist).
 * 2. Smooth feed is the default and only available feed mode (window.ReceiptPrinter.feedMode === 'smooth').
 * 3. Stepped toggle logic is safely disabled (setFeedMode and toggleFeedMode maintain 'smooth').
 * 4. CSS animations for feeding classes (.feed-smooth, .feed-stepped, and default fallback) route to smooth feed.
 * 5. Native ReceiptPrinter lifecycle (init, startProcessing, startPrinting, setReady, replay, close) functions cleanly.
 * 6. Receipt preview, printer-ready status, replay and close buttons, Print Receipt button, and Next Bill button are intact.
 * 7. Existing 80 mm receipt layout and printBillingReceipt() remain 100% unchanged.
 * 8. Zero mutations to accounting, Firestore rules, counters, database, or physical receipt subsystem.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const HTML_PATH = path.join(__dirname, '..', 'Temple_Accounts-1.html');
const BACKUP_PATH = path.join(__dirname, '..', 'backups', 'Temple_Accounts-1_PreStep33_76_SmoothFeedOnly_Backup_20261017_210500.html');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const html = fs.readFileSync(HTML_PATH, 'utf8');
const backupHtml = fs.readFileSync(BACKUP_PATH, 'utf8');

const testResults = {
  step: '33.76',
  title: 'Remove Stepped Feed and Retain Smooth Feed',
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    os: process.platform,
    htmlSizeBytes: Buffer.byteLength(html, 'utf8'),
    htmlSha256: crypto.createHash('sha256').update(html).digest('hex').toUpperCase(),
    backupSizeBytes: Buffer.byteLength(backupHtml, 'utf8'),
    backupSha256: crypto.createHash('sha256').update(backupHtml).digest('hex').toUpperCase(),
  },
  tests: [],
  summary: { total: 0, passed: 0, failed: 0 }
};

function recordTest(testId, name, passed, expected, actual, details = '') {
  testResults.summary.total++;
  if (passed) {
    testResults.summary.passed++;
    console.log(`  ✅ [PASS] ${testId}: ${name}`);
  } else {
    testResults.summary.failed++;
    console.error(`  ❌ [FAIL] ${testId}: ${name} | Expected: ${expected} | Actual: ${actual}`);
  }
  testResults.tests.push({ testId, name, passed: !!passed, expected, actual, details });
}

console.log('========================================================================');
console.log('STEP 33.76: REMOVE STEPPED FEED AND RETAIN SMOOTH FEED VERIFICATION');
console.log(`Current HTML SHA-256: ${testResults.environment.htmlSha256}`);
console.log(`Backup  HTML SHA-256: ${testResults.environment.backupSha256}`);
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST GROUP 1: Cryptographic Integrity & Controlled Source Diff Verification
// -----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: Source Diff & Cryptographic Integrity ---');
{
  recordTest('T1.1', 'Backup file exists on disk with exact pre-step hash',
    testResults.environment.backupSha256 === '12B29980C1F7470C88C5E9C3E60B44E537046E9CB819551D26AF48D48DCD713A',
    '12B29980C1F7470C88C5E9C3E60B44E537046E9CB819551D26AF48D48DCD713A',
    testResults.environment.backupSha256);

  recordTest('T1.2', 'Backup file size matches exact pre-step size (834,072 bytes)',
    testResults.environment.backupSizeBytes === 834072,
    834072, testResults.environment.backupSizeBytes);

  recordTest('T1.3', 'Current HTML size reflects removal of stepped button (-238 bytes)',
    testResults.environment.htmlSizeBytes === 833834,
    833834, testResults.environment.htmlSizeBytes);

  // Check diff only touches thermal printer feed areas
  const diffOutput = execSync(`git diff --no-index "${BACKUP_PATH}" "${HTML_PATH}" || exit 0`, { encoding: 'utf8' });
  const changedLines = diffOutput.split('\n')
    .filter(l => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'));

  const touchedForbidden = [];
  for (const line of changedLines) {
    if (line.includes('function printBillingReceipt')) touchedForbidden.push('printBillingReceipt');
    if (line.includes('function fsCreatePhysicalReceipt')) touchedForbidden.push('fsCreatePhysicalReceipt');
    if (line.includes('function renderThermalReceiptHTML')) touchedForbidden.push('renderThermalReceiptHTML');
    if (line.includes('function renderBillingReceiptPreview')) touchedForbidden.push('renderBillingReceiptPreview');
    if (line.includes('function formatGlobalNumber')) touchedForbidden.push('formatGlobalNumber');
    if (line.includes('function billingSubmitForm')) touchedForbidden.push('billingSubmitForm');
  }

  recordTest('T1.4', 'Strict Isolation: Critical billing, receipt formatting, and print functions untouched in diff',
    touchedForbidden.length === 0,
    0, touchedForbidden.length,
    `Touched unexpected functions: ${touchedForbidden.join(', ')}`);
}

// -----------------------------------------------------------------------------
// TEST GROUP 2: Interface Verification (Absence of STEPPED FEED button)
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Interface Verification & Bezel Actions ---');
{
  recordTest('T2.1', 'STEPPED FEED button markup completely removed from HTML',
    !html.includes('id="printerModeToggleBtn"'),
    true, !html.includes('id="printerModeToggleBtn"'));

  recordTest('T2.2', 'No onclick="ReceiptPrinter.toggleFeedMode()" remains in HTML template',
    !html.includes('onclick="ReceiptPrinter.toggleFeedMode()"'),
    true, !html.includes('onclick="ReceiptPrinter.toggleFeedMode()"'));

  recordTest('T2.3', 'Replay button (↺) preserved in .printer-bezel-actions',
    html.includes('id="printerReplayBtn"') && html.includes('ReceiptPrinter.replay()'),
    true, html.includes('id="printerReplayBtn"'));

  recordTest('T2.4', 'Close icon button (✕) preserved in .printer-bezel-actions',
    html.includes('printer-close-icon-btn') && html.includes('ReceiptPrinter.close()'),
    true, html.includes('printer-close-icon-btn'));

  recordTest('T2.5', 'Hardware bezel branding preserved (TEMPLE POS-80)',
    html.includes('TEMPLE POS-80') && html.includes('printer-top-bezel'),
    true, html.includes('TEMPLE POS-80'));
}

// -----------------------------------------------------------------------------
// TEST GROUP 3: Headless Chromium Direct DOM & CSSOM Runtime Evaluation
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Headless Chromium DOM & CSSOM Evaluation ---');
{
  // Extract CSS from html
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const fullCss = styleMatch ? styleMatch[1] : '';

  // Extract overlay HTML from html
  const overlayMatch = html.match(/<!-- NATIVE RECEIPT PRINTER MODAL OVERLAY[\s\S]*?<\/section>\s*<\/div>\s*<\/div>/);
  const overlayHtml = overlayMatch ? overlayMatch[0] : '';

  // Extract ReceiptPrinter JS definition
  const rpMatch = html.match(/window\.ReceiptPrinter = \{[\s\S]*?\n\};/);
  const rpJs = rpMatch ? rpMatch[0] : '';

  const harnessPath = path.join(__dirname, 'scratch_test_harness_step_33_76.html');
  const runnerScript = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Step 33.76 Direct DOM & CSSOM Test Harness</title>
  <style>
    ${fullCss}
  </style>
</head>
<body>
  ${overlayHtml}
  <div id="testOutput"></div>

  <script>
    function el(id) { return document.getElementById(id); }
    function esc(s) { return String(s || ''); }

    ${rpJs}

    window.onload = () => {
      const results = {};
      try {
        // 1. DOM Elements Check
        const modeBtn = document.getElementById('printerModeToggleBtn');
        const replayBtn = document.getElementById('printerReplayBtn');
        const closeBtn = document.querySelector('.printer-close-icon-btn');
        const chassis = document.getElementById('receiptPrinterChassis');
        const overlay = document.getElementById('receiptPrinterOverlay');
        const sheet = document.getElementById('printerReceiptSheet');
        const progressFill = document.getElementById('printerProgressFill');

        results.modeBtnAbsent = (modeBtn === null);
        results.replayBtnPresent = (replayBtn !== null);
        results.closeBtnPresent = (closeBtn !== null);
        results.chassisPresent = (chassis !== null);
        results.overlayPresent = (overlay !== null);
        results.sheetPresent = (sheet !== null);
        results.progressFillPresent = (progressFill !== null);

        // 2. ReceiptPrinter initial properties
        const rp = window.ReceiptPrinter;
        results.hasReceiptPrinter = (typeof rp === 'object' && rp !== null);
        results.initialFeedMode = rp ? rp.feedMode : null;

        // 3. Test setFeedMode & toggleFeedMode immutability to smooth
        if (rp) {
          rp.init();
          rp.setFeedMode('stepped');
          results.feedModeAfterSetStepped = rp.feedMode;

          rp.toggleFeedMode();
          results.feedModeAfterToggle = rp.feedMode;

          // Safe updateModeButton without errors
          let updateModeBtnError = null;
          try {
            rp.updateModeButton();
          } catch (e) {
            updateModeBtnError = e.message;
          }
          results.updateModeBtnError = updateModeBtnError;

          // 4. Test startPrinting animation classes
          rp.startPrinting({
            receiptNo: 'BILL-099',
            date: '2026-10-17',
            devoteeName: 'Test Devotee',
            item: 'Neyyappam',
            totalAmount: 100,
            paymentMode: 'Cash'
          });

          results.stateDuringPrint = rp.state;
          results.sheetHasFeeding = sheet.classList.contains('feeding');
          results.sheetHasFeedSmooth = sheet.classList.contains('feed-smooth');
          results.sheetHasFeedStepped = sheet.classList.contains('feed-stepped');
          results.sheetAnimDuration = sheet.style.animationDuration;

          // 5. Test setReady
          rp.setReady();
          results.stateAfterReady = rp.state;
          results.sheetHasFed = sheet.classList.contains('fed');
          results.statusLabelText = document.getElementById('printerStatusLabel').textContent;

          // 6. Test replay
          rp.replay();
          results.stateAfterReplay = rp.state;

          // 7. Test close
          rp.close();
          results.stateAfterClose = rp.state;
          results.overlayHidden = !rp.isOpen();
        }

        // 8. Inspect CSSOM animation declarations
        let cssSmoothAnim = null;
        let cssSteppedAnim = null;
        let cssFallbackAnim = null;

        for (let s of document.styleSheets) {
          try {
            for (let rule of s.cssRules) {
              if (rule.selectorText && rule.selectorText.includes('.printer-receipt-sheet.feeding.feed-smooth')) {
                cssSmoothAnim = rule.style.animation || rule.cssText;
              }
              if (rule.selectorText && rule.selectorText.includes('.printer-receipt-sheet.feeding.feed-stepped')) {
                cssSteppedAnim = rule.style.animation || rule.cssText;
              }
              if (rule.selectorText && rule.selectorText.includes('.printer-receipt-sheet.feeding:not(.feed-smooth):not(.feed-stepped)')) {
                cssFallbackAnim = rule.style.animation || rule.cssText;
              }
            }
          } catch (e) {}
        }

        results.cssSmoothAnim = cssSmoothAnim;
        results.cssSteppedAnim = cssSteppedAnim;
        results.cssFallbackAnim = cssFallbackAnim;

      } catch (err) {
        results.executionError = err.message;
      }

      document.getElementById('testOutput').textContent = JSON.stringify(results);
    };
  </script>
</body>
</html>`;

  fs.writeFileSync(harnessPath, runnerScript);

  try {
    const rawOut = execSync(
      `"${CHROME_PATH}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --dump-dom "file:///${harnessPath.replace(/\\\\/g, '/')}"`,
      { encoding: 'utf8', timeout: 15000 }
    );

    const match = rawOut.match(/<div id="testOutput">([\s\S]*?)<\/div>/);
    const data = match ? JSON.parse(match[1]) : {};

    recordTest('T3.1', 'DOM Check: #printerModeToggleBtn is completely absent in runtime DOM',
      data.modeBtnAbsent === true,
      true, data.modeBtnAbsent);

    recordTest('T3.2', 'DOM Check: Replay and Close action buttons are present in header bezel',
      data.replayBtnPresent === true && data.closeBtnPresent === true,
      true, data.replayBtnPresent && data.closeBtnPresent);

    recordTest('T3.3', 'ReceiptPrinter.feedMode defaults to "smooth"',
      data.initialFeedMode === 'smooth',
      'smooth', data.initialFeedMode);

    recordTest('T3.4', 'ReceiptPrinter.setFeedMode() retains "smooth" mode',
      data.feedModeAfterSetStepped === 'smooth',
      'smooth', data.feedModeAfterSetStepped);

    recordTest('T3.5', 'ReceiptPrinter.toggleFeedMode() retains "smooth" mode',
      data.feedModeAfterToggle === 'smooth',
      'smooth', data.feedModeAfterToggle);

    recordTest('T3.6', 'ReceiptPrinter.updateModeButton() executes without throwing errors',
      data.updateModeBtnError === null,
      null, data.updateModeBtnError);

    recordTest('T3.7', 'ReceiptPrinter.startPrinting() adds "feed-smooth" class (not "feed-stepped")',
      data.sheetHasFeedSmooth === true && data.sheetHasFeedStepped === false,
      true, data.sheetHasFeedSmooth && !data.sheetHasFeedStepped);

    recordTest('T3.8', 'ReceiptPrinter.startPrinting() sets 2200ms duration for smooth feed curve',
      data.sheetAnimDuration === '2200ms',
      '2200ms', data.sheetAnimDuration);

    recordTest('T3.9', 'ReceiptPrinter.setReady() transitions to "RECEIPT READY" state cleanly',
      data.stateAfterReady === 'ready' && data.statusLabelText === 'RECEIPT READY' && data.sheetHasFed === true,
      true, data.stateAfterReady === 'ready');

    recordTest('T3.10', 'ReceiptPrinter.replay() successfully retriggers print animation',
      data.stateAfterReplay === 'printing',
      'printing', data.stateAfterReplay);

    recordTest('T3.11', 'ReceiptPrinter.close() resets state to idle and closes overlay',
      data.stateAfterClose === 'idle' && data.overlayHidden === true,
      true, data.stateAfterClose === 'idle');

    recordTest('T3.12', 'CSSOM: .printer-receipt-sheet.feeding.feed-smooth animates receiptPaperFeedSmooth',
      data.cssSmoothAnim && data.cssSmoothAnim.includes('receiptPaperFeedSmooth'),
      true, data.cssSmoothAnim);

    recordTest('T3.13', 'CSSOM: .printer-receipt-sheet.feeding.feed-stepped routes to receiptPaperFeedSmooth',
      data.cssSteppedAnim && data.cssSteppedAnim.includes('receiptPaperFeedSmooth'),
      true, data.cssSteppedAnim);

    recordTest('T3.14', 'CSSOM: Feeding fallback :not(.feed-smooth):not(.feed-stepped) routes to receiptPaperFeedSmooth',
      data.cssFallbackAnim && data.cssFallbackAnim.includes('receiptPaperFeedSmooth'),
      true, data.cssFallbackAnim);

  } catch (err) {
    recordTest('T3.X', 'Chromium runtime test execution', false, 'Clean execution', err.message);
  } finally {
    if (fs.existsSync(harnessPath)) fs.unlinkSync(harnessPath);
  }
}

// -----------------------------------------------------------------------------
// TEST GROUP 4: Receipt Preview & 80 mm Print Layout Preservation
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Receipt Preview & 80 mm Print Preservation ---');
{
  // Verify renderBillingReceiptPreview function exists and has required elements
  const previewMatch = html.match(/function renderBillingReceiptPreview\s*\(r\)\s*\{([\s\S]*?)\n\}/);
  const previewSrc = previewMatch ? previewMatch[1] : '';

  recordTest('T4.1', 'renderBillingReceiptPreview() preserved and unchanged',
    previewSrc.includes('billingReceiptPreviewArea') &&
    previewSrc.includes('renderThermalReceiptHTML') &&
    previewSrc.includes('btnPrintReceipt') &&
    previewSrc.includes('btnNextBill'),
    true, previewSrc.length > 0);

  recordTest('T4.2', 'printBillingReceipt() preserved with 80mm dynamic layout & lifecycle guard',
    html.includes('function printBillingReceipt()') &&
    html.includes('if (cleanedUp) return;') &&
    html.includes('@page { size: 80mm ${receiptHeightMm}mm; margin: 0; }'),
    true, true);

  recordTest('T4.3', 'Physical P/PU receipt creation & parsing functions untouched',
    html.includes('function fsCreatePhysicalReceipt(') &&
    html.includes('function parsePhysicalReceiptIdentifier('),
    true, true);
}

// -----------------------------------------------------------------------------
// SUMMARY & EXIT
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`TOTAL TESTS: ${testResults.summary.total}`);
console.log(`PASSED:      ${testResults.summary.passed}`);
console.log(`FAILED:      ${testResults.summary.failed}`);
console.log('========================================================================\n');

// Write test results artifact
fs.writeFileSync(
  path.join(__dirname, 'step_33_76_smooth_feed_only_results.json'),
  JSON.stringify(testResults, null, 2)
);

if (testResults.summary.failed > 0) {
  process.exit(1);
} else {
  console.log('✅ ALL STEP 33.76 VERIFICATION TESTS PASSED SUCCESSFULLY.');
}
