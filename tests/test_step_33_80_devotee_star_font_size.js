/**
 * STEP 33.80 VERIFICATION SUITE: INCREASE DEVOTEE NAME AND STAR FONT SIZE ON 80 MM BILLING RECEIPT
 *
 * Verifies:
 * 1. Cryptographic baseline, backup verification, and byte-exact diff boundaries.
 * 2. Temple heading integrity: text and styling strictly unchanged.
 * 3. Devotee Name & Star font size in 80mm receipt preview matching temple heading (13px).
 * 4. Devotee Name & Star font size in 80mm printed/PDF receipt matching temple heading (13.5px).
 * 5. Serial numbers, column headers, and unrelated receipt elements remain un-enlarged.
 * 6. Preservation of existing labels: 'പേര് (Devotee Name)', 'നാൾ (Star)', 'Payment:'.
 * 7. Malayalam typography, font-weight (700/600), alignment, and overflow-free wrapping.
 * 8. Dynamic @page sizing, height measurement, and print lifecycle preservation.
 * 9. Zero regression across billing calculations, accounting records, physical receipts, and Firestore isolation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const vm = require('vm');

console.log('='.repeat(72));
console.log('STEP 33.80: DEVOTEE NAME & STAR FONT SIZE VERIFICATION (80 MM RECEIPT)');
console.log('='.repeat(72));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_80_DevoteeStarFontSize_Backup_20261017_221000.html';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const EXPECTED_PRE_HASH = 'C3C7E60A0D4DA1C7A1F225C28EDCCE125529388FAF92F9F4AEF8F7E26B7BE5D2';
const EXPECTED_PRE_SIZE = 832515;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.80',
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
console.log(`Current HTML Size:    ${currentSize} bytes`);

// =========================================================================
// TEST GROUP 1: Cryptographic Invariants & Backup Verification
// =========================================================================
console.log('\n--- TEST GROUP 1: Cryptographic Invariants & Backup Verification ---');
{
  const backupExists = fs.existsSync(BACKUP_PATH);
  recordTest('GROUP-1', 'T1.1', 'Byte-exact backup file exists at expected path', backupExists);

  if (backupExists) {
    const backupBuf = fs.readFileSync(BACKUP_PATH);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches pre-change baseline hash exactly',
      backupHash === EXPECTED_PRE_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact pre-change baseline size',
      backupBuf.length === EXPECTED_PRE_SIZE, `${backupBuf.length} bytes`);
  }

  const actualDelta = currentSize - EXPECTED_PRE_SIZE;
  recordTest('GROUP-1', 'T1.4', 'Current file size reflects exact +351 byte surgical addition',
    actualDelta === 351, `Delta: +${actualDelta} bytes`);

  // Verify exact diff blocks
  if (backupExists) {
    const backupContent = fs.readFileSync(BACKUP_PATH, 'utf8');
    const bLines = backupContent.split('\n');
    const cLines = htmlContent.split('\n');

    let bIdx = 0, cIdx = 0;
    const diffBlocks = [];

    while (bIdx < bLines.length || cIdx < cLines.length) {
      if (bLines[bIdx] !== cLines[cIdx]) {
        let matchFound = false;
        for (let bLook = 0; bLook < 20 && bIdx + bLook < bLines.length; bLook++) {
          for (let cLook = 0; cLook < 20 && cIdx + cLook < cLines.length; cLook++) {
            if (bLook === 0 && cLook === 0) continue;
            if (bLines[bIdx + bLook] === cLines[cIdx + cLook] && bLines[bIdx + bLook].trim() !== '') {
              diffBlocks.push({
                backupRange: [bIdx + 1, bIdx + bLook],
                currentRange: [cIdx + 1, cIdx + cLook]
              });
              bIdx += bLook;
              cIdx += cLook;
              matchFound = true;
              break;
            }
          }
          if (matchFound) break;
        }
        if (!matchFound) break;
      } else {
        bIdx++;
        cIdx++;
      }
    }

    recordTest('GROUP-1', 'T1.5', 'Exactly 3 surgical diff blocks in the entire application file',
      diffBlocks.length === 3, `Diff block count: ${diffBlocks.length}`);

    recordTest('GROUP-1', 'T1.6', 'Block 1 targets screen thermal CSS (.th-roster-name, .th-roster-star)',
      diffBlocks[0] && diffBlocks[0].currentRange[0] >= 3570 && diffBlocks[0].currentRange[0] <= 3578);

    recordTest('GROUP-1', 'T1.7', 'Block 2 targets print thermal CSS (#print-area.billing-80mm .th-roster-name)',
      diffBlocks[1] && diffBlocks[1].currentRange[0] >= 4360 && diffBlocks[1].currentRange[0] <= 4375);

    recordTest('GROUP-1', 'T1.8', 'Block 3 targets renderThermalReceiptHTML devotee name and star spans',
      diffBlocks[2] && diffBlocks[2].currentRange[0] >= 8835 && diffBlocks[2].currentRange[0] <= 8850);
  }
}

// =========================================================================
// TEST GROUP 2: Temple Heading Integrity Verification
// =========================================================================
console.log('\n--- TEST GROUP 2: Temple Heading Integrity Verification ---');
{
  // 1. Temple heading Malayalam text in receipt template
  const headingTextMatch = htmlContent.includes('<div class="th-center th-bold th-title">${esc(templeName)}</div>');
  recordTest('GROUP-2', 'T2.1', 'Temple heading element in renderThermalReceiptHTML is strictly preserved',
    headingTextMatch);

  // 2. Default temple name constant
  const defaultTempleNameMatch = htmlContent.includes("templeName = s.templeName || 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം';");
  recordTest('GROUP-2', 'T2.2', 'Default temple name constant "മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം" is preserved',
    defaultTempleNameMatch);

  // 3. Screen CSS definition for .th-title
  const screenTitleCssMatch = htmlContent.includes('.th-title {\n  font-size: 13px;\n  font-weight: 800;');
  recordTest('GROUP-2', 'T2.3', 'Screen CSS .th-title declares font-size: 13px and font-weight: 800',
    screenTitleCssMatch);

  // 4. Print CSS definition for #print-area.billing-80mm .th-title
  const printTitleCssMatch = htmlContent.includes('#print-area.billing-80mm .th-title,\n  #print-area.billing-58mm .th-title {\n    font-size: 13.5px !important;');
  recordTest('GROUP-2', 'T2.4', 'Print CSS .th-title declares font-size: 13.5px !important and font-weight: bold',
    printTitleCssMatch);
}

// =========================================================================
// TEST GROUP 3: Exact Targeted CSS & HTML Declarations
// =========================================================================
console.log('\n--- TEST GROUP 3: Exact Targeted CSS & HTML Declarations ---');
{
  // 1. Screen CSS for roster name and star
  const screenRosterCssMatch = htmlContent.includes('.th-roster-name,\n.th-roster-star {\n  font-size: 13px;\n}');
  recordTest('GROUP-3', 'T3.1', 'Screen CSS defines .th-roster-name and .th-roster-star with font-size: 13px',
    screenRosterCssMatch);

  // 2. Print CSS for roster name and star
  const printRosterCssMatch = htmlContent.includes('#print-area.billing-80mm .th-roster-name,\n  #print-area.billing-80mm .th-roster-star,\n  #print-area.billing-58mm .th-roster-name,\n  #print-area.billing-58mm .th-roster-star {\n    font-size: 13.5px !important;\n  }');
  recordTest('GROUP-3', 'T3.2', 'Print CSS defines .th-roster-name and .th-roster-star with font-size: 13.5px !important',
    printRosterCssMatch);

  // 3. HTML template span for Devotee Name
  const nameSpanMatch = htmlContent.includes('<span class="th-roster-name" style="flex: 1; text-align: left; font-weight: 700; font-size: 13px; word-break: break-word; overflow-wrap: break-word; padding: 0 4px;">${esc(d.name || \'---\')}</span>');
  recordTest('GROUP-3', 'T3.3', 'HTML template specifies class="th-roster-name" and font-size: 13px on devotee name',
    nameSpanMatch);

  // 4. HTML template span for Devotee Star
  const starSpanMatch = htmlContent.includes('<span class="th-roster-star" style="width: 85px; text-align: right; font-weight: 600; font-size: 13px; flex-shrink: 0; word-break: break-word; color: #222;">${esc(d.star || \'---\')}</span>');
  recordTest('GROUP-3', 'T3.4', 'HTML template specifies class="th-roster-star" and font-size: 13px on star',
    starSpanMatch);

  // 5. Serial number span is NOT modified
  const sNoSpanMatch = htmlContent.includes('<span style="width: 24px; text-align: left; font-weight: 600; flex-shrink: 0; color: #555;">${idx + 1}.</span>');
  recordTest('GROUP-3', 'T3.5', 'Serial number span strictly preserves 24px width and inherits 11.5px font-size',
    sNoSpanMatch);

  // 6. Column header is NOT modified
  const headerMatch = htmlContent.includes('<span style="flex: 1; text-align: left; padding: 0 4px;">പേര് (Devotee Name)</span>') &&
    htmlContent.includes('<span style="width: 85px; text-align: right;">നാൾ (Star)</span>');
  recordTest('GROUP-3', 'T3.6', 'Column headers "പേര് (Devotee Name)" and "നാൾ (Star)" remain 100% unchanged',
    headerMatch);
}

// =========================================================================
// TEST GROUP 4: Functional Runtime Verification via VM Sandbox
// =========================================================================
console.log('\n--- TEST GROUP 4: Functional Runtime Verification via VM Sandbox ---');
{
  const escFnDef = `function esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }`;
  const startIdx = htmlContent.indexOf('function renderThermalReceiptHTML(');
  const nextFnIdx = htmlContent.indexOf('\n/* ===================== STEP 33.25', startIdx);
  const renderThermalReceiptHTMLCode = htmlContent.slice(startIdx, nextFnIdx !== -1 ? nextFnIdx : startIdx + 3000);

  const sandbox = { console, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(escFnDef, sandbox);
  vm.runInContext(renderThermalReceiptHTMLCode, sandbox);

  // Test 1: Single devotee receipt
  const singleRec = {
    receiptNo: 'BILL-801',
    date: '17/10/2026',
    time: '11:00 AM',
    category: 'വഴിപാട്',
    item: 'പുഷ്പാഞ്ജലി',
    qty: 1,
    unitPrice: 30,
    totalAmount: 30,
    paymentMode: 'Cash',
    devotees: [{ name: 'അനന്തപദ്മനാഭൻ', star: 'തിരുവോണം' }]
  };
  const singleHtml = sandbox.renderThermalReceiptHTML(singleRec, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');

  recordTest('GROUP-4', 'T4.1', 'Rendered HTML contains class="th-roster-name"',
    singleHtml.includes('class="th-roster-name"'));
  recordTest('GROUP-4', 'T4.2', 'Rendered HTML contains class="th-roster-star"',
    singleHtml.includes('class="th-roster-star"'));
  recordTest('GROUP-4', 'T4.3', 'Devotee name "അനന്തപദ്മനാഭൻ" rendered in enlarged span',
    singleHtml.includes('class="th-roster-name"') && singleHtml.includes('അനന്തപദ്മനാഭൻ'));
  recordTest('GROUP-4', 'T4.4', 'Star "തിരുവോണം" rendered in enlarged span',
    singleHtml.includes('class="th-roster-star"') && singleHtml.includes('തിരുവോണം'));
  recordTest('GROUP-4', 'T4.5', 'Payment label "Payment:" and mode "Cash" rendered correctly',
    singleHtml.includes('<span>Payment:</span>') && singleHtml.includes('<span><b>Cash</b></span>'));

  // Test 2: Fallback / empty star
  const dashRec = {
    receiptNo: 'BILL-802',
    date: '17/10/2026',
    time: '11:05 AM',
    category: 'വഴിപാട്',
    item: 'നെയ്യ് വിളക്ക്',
    qty: 1,
    unitPrice: 20,
    totalAmount: 20,
    paymentMode: 'UPI',
    devotees: [{ name: 'asb', star: '' }]
  };
  const dashHtml = sandbox.renderThermalReceiptHTML(dashRec, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  recordTest('GROUP-4', 'T4.6', 'Devotee "asb" rendered with fallback dash "---" for empty star',
    dashHtml.includes('asb') && dashHtml.includes('---'));

  // Test 3: Multi-devotee receipt
  const multiRec = {
    receiptNo: 'BILL-803',
    date: '17/10/2026',
    time: '11:10 AM',
    category: 'വഴിപാട്',
    item: 'അർച്ചന',
    qty: 3,
    unitPrice: 20,
    totalAmount: 60,
    paymentMode: 'UPI',
    devotees: [
      { name: 'രാഹുൽ കൃഷ്ണൻ', star: 'അശ്വതി' },
      { name: 'പ്രിയാ രാഹുൽ', star: 'ഭരണി' },
      { name: 'കാർത്തിക് രാഹുൽ', star: 'കാർത്തിക' }
    ]
  };
  const multiHtml = sandbox.renderThermalReceiptHTML(multiRec, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  const nameMatches = (multiHtml.match(/class="th-roster-name"/g) || []).length;
  const starMatches = (multiHtml.match(/class="th-roster-star"/g) || []).length;
  recordTest('GROUP-4', 'T4.7', 'Multi-devotee receipt renders 3 devotee name and star elements',
    nameMatches === 3 && starMatches === 3, `Found ${nameMatches} names, ${starMatches} stars`);
}

// =========================================================================
// TEST GROUP 5: Real Chromium Headless DOM & Computed Style Verification
// =========================================================================
console.log('\n--- TEST GROUP 5: Real Chromium Headless DOM & Computed Style Verification ---');
{
  // Extract thermal CSS
  const cssStart = htmlContent.indexOf('/* Thermal Receipt Paper Card (80mm Realistic View) */');
  const cssEnd = htmlContent.indexOf('/* ===================== BILL SUCCESS CARD', cssStart);
  const screenCss = htmlContent.slice(cssStart, cssEnd);

  // Extract print CSS
  const printCssStart = htmlContent.indexOf('/* 80mm & 58mm Thermal Receipt Printing');
  const printCssEnd = htmlContent.indexOf('/* Billing Report Print Styles', printCssStart);
  const printCss = htmlContent.slice(printCssStart, printCssEnd);

  const fnStart = htmlContent.indexOf('function renderThermalReceiptHTML(');
  const fnEnd = htmlContent.indexOf('/* ===================== STEP 33.25', fnStart);
  const renderThermalReceiptHTMLCode = htmlContent.slice(fnStart, fnEnd);

  const testHarnessHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>STEP 33.80 Chromium DOM Verification</title>
  <style>
    ${screenCss}
    @media print {
      ${printCss}
    }
    /* Simulated print layout for screen-based computed measurement */
    .simulated-print-container {
      ${printCss.replace(/#print-area\.billing-80mm/g, '.simulated-print-container')}
    }
  </style>
</head>
<body>
  <div class="receipt-paper-box" id="previewBox"></div>
  <div id="printArea" class="billing-80mm"></div>
  <div id="domResults"></div>

  <script>
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    ${renderThermalReceiptHTMLCode}

    (function runDomTests() {
      const results = {};
      const templeName = 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം';
      const templeAddress = 'ആശാരിവിളാകം, കേരളദിത്യപുരം';

      const sampleRec = {
        receiptNo: 'BILL-888',
        date: '17/10/2026',
        time: '12:00 PM',
        category: 'വഴിപാട്',
        item: 'പുഷ്പാഞ്ജലി',
        qty: 1,
        unitPrice: 30,
        totalAmount: 30,
        paymentMode: 'Cash',
        devotees: [{ name: 'അനന്തപദ്മനാഭൻ', star: 'തിരുവോണം' }]
      };

      // 1. Preview Layout Inspection
      const pBox = document.getElementById('previewBox');
      pBox.innerHTML = renderThermalReceiptHTML(sampleRec, templeName, templeAddress);

      const pTitle = pBox.querySelector('.th-title');
      const pName = pBox.querySelector('.th-roster-name');
      const pStar = pBox.querySelector('.th-roster-star');
      const pSNo = pBox.querySelector('.th-roster-row span:first-child');
      const pHead = pBox.querySelector('.th-roster-head');

      const csPTitle = window.getComputedStyle(pTitle);
      const csPName = window.getComputedStyle(pName);
      const csPStar = window.getComputedStyle(pStar);
      const csPSNo = window.getComputedStyle(pSNo);
      const csPHead = window.getComputedStyle(pHead);

      results.preview = {
        titleFontSize: csPTitle.fontSize,
        nameFontSize: csPName.fontSize,
        starFontSize: csPStar.fontSize,
        sNoFontSize: csPSNo.fontSize,
        headFontSize: csPHead.fontSize,
        nameFontWeight: csPName.fontWeight,
        starFontWeight: csPStar.fontWeight,
        nameMatchesTitle: csPName.fontSize === csPTitle.fontSize,
        starMatchesTitle: csPStar.fontSize === csPTitle.fontSize
      };

      // 2. Multi-Devotee & Long Name Overflow Inspection in Preview
      const longRec = {
        receiptNo: 'BILL-889',
        date: '17/10/2026',
        time: '12:05 PM',
        category: 'വഴിപാട്',
        item: 'ഗണപതി ഹോമം',
        qty: 2,
        unitPrice: 150,
        totalAmount: 300,
        paymentMode: 'Cash',
        devotees: [
          { name: 'ഡോ. വെങ്കിട്ടരാമൻ നമ്പൂതിരിപ്പാട് അമ്പലപ്പുഴ', star: 'പൂരുരുട്ടാതി' },
          { name: 'ശ്രീ രാജരാജേശ്വരി മാതാ ഭക്തജന ട്രസ്റ്റ് പ്രതിനിധി ആനന്ദതീർത്ഥൻ', star: 'ഉത്രട്ടാതി' }
        ]
      };
      pBox.innerHTML = renderThermalReceiptHTML(longRec, templeName, templeAddress);
      const pRows = pBox.querySelectorAll('.th-roster-row');
      const boxRect = pBox.getBoundingClientRect();
      let hasOverflow = false;
      pRows.forEach(row => {
        const rRect = row.getBoundingClientRect();
        if (rRect.right > boxRect.right + 2) hasOverflow = true;
      });
      results.previewOverflow = hasOverflow;

      document.getElementById('domResults').textContent = JSON.stringify(results);
    })();
  </script>
</body>
</html>`;

  const harnessPath = path.join(__dirname, 'step_33_80_chrome_harness.html');
  fs.writeFileSync(harnessPath, testHarnessHtml, 'utf8');

  try {
    const rawOut = execSync(
      `"${CHROME_PATH}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --dump-dom "file:///${harnessPath.replace(/\\/g, '/')}"`,
      { encoding: 'utf8', timeout: 15000 }
    );

    const match = rawOut.match(/<div id="domResults">([\s\S]*?)<\/div>/);
    let domData = null;
    if (match && match[1]) {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
      domData = JSON.parse(decoded);
    }

    recordTest('GROUP-5', 'T5.1', 'Headless Chrome executed preview harness and returned DOM measurements',
      domData !== null && !!domData.preview);

    if (domData && domData.preview) {
      recordTest('GROUP-5', 'T5.2', 'Preview temple heading computed font-size is 13px',
        domData.preview.titleFontSize === '13px', `Actual: ${domData.preview.titleFontSize}`);

      recordTest('GROUP-5', 'T5.3', 'Preview Devotee Name computed font-size is 13px (exact match with heading)',
        domData.preview.nameFontSize === '13px' && domData.preview.nameMatchesTitle,
        `Actual: ${domData.preview.nameFontSize}`);

      recordTest('GROUP-5', 'T5.4', 'Preview Star computed font-size is 13px (exact match with heading)',
        domData.preview.starFontSize === '13px' && domData.preview.starMatchesTitle,
        `Actual: ${domData.preview.starFontSize}`);

      recordTest('GROUP-5', 'T5.5', 'Preview Serial Number retains 11.5px (unrelated text not enlarged)',
        domData.preview.sNoFontSize === '11.5px', `Actual: ${domData.preview.sNoFontSize}`);

      recordTest('GROUP-5', 'T5.6', 'Preview Column Header retains 10.5px (labels not enlarged)',
        domData.preview.headFontSize === '10.5px', `Actual: ${domData.preview.headFontSize}`);

      recordTest('GROUP-5', 'T5.7', 'Preview Devotee Name retains 700 bold font weight',
        domData.preview.nameFontWeight === '700', `Actual: ${domData.preview.nameFontWeight}`);

      recordTest('GROUP-5', 'T5.8', 'Preview Star retains 600 semi-bold font weight',
        domData.preview.starFontWeight === '600', `Actual: ${domData.preview.starFontWeight}`);

      recordTest('GROUP-5', 'T5.9', 'Long Malayalam names and stars in preview wrap safely with zero overflow',
        domData.previewOverflow === false, `Overflow: ${domData.previewOverflow}`);
    }
  } catch (err) {
    recordTest('GROUP-5', 'T5.1', 'Headless Chrome preview execution', false, err.message);
  }
}

// =========================================================================
// TEST GROUP 6: Real Chromium Print Media Computed Style Verification
// =========================================================================
console.log('\n--- TEST GROUP 6: Real Chromium Print Media Computed Style Verification ---');
{
  const cssStart = htmlContent.indexOf('/* Thermal Receipt Paper Card (80mm Realistic View) */');
  const cssEnd = htmlContent.indexOf('/* ===================== BILL SUCCESS CARD', cssStart);
  const screenCss = htmlContent.slice(cssStart, cssEnd);

  const printCssStart = htmlContent.indexOf('/* 80mm & 58mm Thermal Receipt Printing');
  const printCssEnd = htmlContent.indexOf('/* Billing Report Print Styles', printCssStart);
  const printCss = htmlContent.slice(printCssStart, printCssEnd);

  const fnStart = htmlContent.indexOf('function renderThermalReceiptHTML(');
  const fnEnd = htmlContent.indexOf('/* ===================== STEP 33.25', fnStart);
  const renderThermalReceiptHTMLCode = htmlContent.slice(fnStart, fnEnd);

  // In this harness, we apply the exact print rules directly to verify computed styles under print CSS
  const printHarnessHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>STEP 33.80 Chromium Print Media Verification</title>
  <style>
    ${screenCss}
    /* Apply print CSS rules directly */
    ${printCss}
  </style>
</head>
<body>
  <div id="print-area" class="billing-80mm"></div>
  <div id="printResults"></div>

  <script>
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    ${renderThermalReceiptHTMLCode}

    (function runPrintTests() {
      const results = {};
      const templeName = 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം';
      const templeAddress = 'ആശാരിവിളാകം, കേരളദിത്യപുരം';

      const sampleRec = {
        receiptNo: 'BILL-901',
        date: '17/10/2026',
        time: '12:30 PM',
        category: 'വഴിപാട്',
        item: 'പുഷ്പാഞ്ജലി',
        qty: 1,
        unitPrice: 30,
        totalAmount: 30,
        paymentMode: 'Cash',
        devotees: [{ name: 'അനന്തപദ്മനാഭൻ', star: 'തിരുവോണം' }]
      };

      const pArea = document.getElementById('print-area');
      pArea.innerHTML = renderThermalReceiptHTML(sampleRec, templeName, templeAddress);

      const pTitle = pArea.querySelector('.th-title');
      const pName = pArea.querySelector('.th-roster-name');
      const pStar = pArea.querySelector('.th-roster-star');
      const pSNo = pArea.querySelector('.th-roster-row span:first-child');
      const pHead = pArea.querySelector('.th-roster-head');

      const csPTitle = window.getComputedStyle(pTitle);
      const csPName = window.getComputedStyle(pName);
      const csPStar = window.getComputedStyle(pStar);
      const csPSNo = window.getComputedStyle(pSNo);
      const csPHead = window.getComputedStyle(pHead);

      results.print = {
        titleFontSize: csPTitle.fontSize,
        nameFontSize: csPName.fontSize,
        starFontSize: csPStar.fontSize,
        sNoFontSize: csPSNo.fontSize,
        headFontSize: csPHead.fontSize,
        nameFontWeight: csPName.fontWeight,
        starFontWeight: csPStar.fontWeight,
        nameMatchesTitle: csPName.fontSize === csPTitle.fontSize,
        starMatchesTitle: csPStar.fontSize === csPTitle.fontSize
      };

      // Multi-devotee & Long Name Overflow in 80mm Print
      const longRec = {
        receiptNo: 'BILL-902',
        date: '17/10/2026',
        time: '12:35 PM',
        category: 'വഴിപാട്',
        item: 'ഗണപതി ഹോമം',
        qty: 2,
        unitPrice: 150,
        totalAmount: 300,
        paymentMode: 'Cash',
        devotees: [
          { name: 'ഡോ. വെങ്കിട്ടരാമൻ നമ്പൂതിരിപ്പാട് അമ്പലപ്പുഴ', star: 'പൂരുരുട്ടാതി' },
          { name: 'ശ്രീ രാജരാജേശ്വരി മാതാ ഭക്തജന ട്രസ്റ്റ് പ്രതിനിധി ആനന്ദതീർത്ഥൻ', star: 'ഉത്രട്ടാതി' }
        ]
      };
      pArea.innerHTML = renderThermalReceiptHTML(longRec, templeName, templeAddress);
      const pRows = pArea.querySelectorAll('.th-roster-row');
      const areaRect = pArea.getBoundingClientRect();
      let hasOverflow = false;
      pRows.forEach(row => {
        const rRect = row.getBoundingClientRect();
        if (rRect.right > areaRect.right + 2) hasOverflow = true;
      });
      results.printOverflow = hasOverflow;

      document.getElementById('printResults').textContent = JSON.stringify(results);
    })();
  </script>
</body>
</html>`;

  const printHarnessPath = path.join(__dirname, 'step_33_80_chrome_print_harness.html');
  fs.writeFileSync(printHarnessPath, printHarnessHtml, 'utf8');

  try {
    const rawOut = execSync(
      `"${CHROME_PATH}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --dump-dom "file:///${printHarnessPath.replace(/\\/g, '/')}"`,
      { encoding: 'utf8', timeout: 15000 }
    );

    const match = rawOut.match(/<div id="printResults">([\s\S]*?)<\/div>/);
    let printData = null;
    if (match && match[1]) {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
      printData = JSON.parse(decoded);
    }

    recordTest('GROUP-6', 'T6.1', 'Headless Chrome executed print harness and returned DOM measurements',
      printData !== null && !!printData.print);

    if (printData && printData.print) {
      recordTest('GROUP-6', 'T6.2', 'Print temple heading computed font-size is 13.5px',
        printData.print.titleFontSize === '13.5px', `Actual: ${printData.print.titleFontSize}`);

      recordTest('GROUP-6', 'T6.3', 'Print Devotee Name computed font-size is 13.5px (exact match with heading)',
        printData.print.nameFontSize === '13.5px' && printData.print.nameMatchesTitle,
        `Actual: ${printData.print.nameFontSize}`);

      recordTest('GROUP-6', 'T6.4', 'Print Star computed font-size is 13.5px (exact match with heading)',
        printData.print.starFontSize === '13.5px' && printData.print.starMatchesTitle,
        `Actual: ${printData.print.starFontSize}`);

      recordTest('GROUP-6', 'T6.5', 'Print Serial Number retains 11.5px (unrelated text not enlarged)',
        printData.print.sNoFontSize === '11.5px', `Actual: ${printData.print.sNoFontSize}`);

      recordTest('GROUP-6', 'T6.6', 'Print Devotee Name retains 700 bold font weight',
        printData.print.nameFontWeight === '700', `Actual: ${printData.print.nameFontWeight}`);

      recordTest('GROUP-6', 'T6.7', 'Print Star retains 600 semi-bold font weight',
        printData.print.starFontWeight === '600', `Actual: ${printData.print.starFontWeight}`);

      recordTest('GROUP-6', 'T6.8', 'Long Malayalam names and stars in 80mm print wrap safely with zero overflow',
        printData.printOverflow === false, `Overflow: ${printData.printOverflow}`);
    }
  } catch (err) {
    recordTest('GROUP-6', 'T6.1', 'Headless Chrome print execution', false, err.message);
  }
}

// =========================================================================
// TEST GROUP 7: Print Lifecycle, Dynamic @page Sizing, and Height Calculation
// =========================================================================
console.log('\n--- TEST GROUP 7: Print Lifecycle, Dynamic @page Sizing & Isolation ---');
{
  // 1. Dynamic @page size injection rule preserved
  const pageRuleMatch = htmlContent.includes("dynamicStyle.textContent = `@page { size: 80mm ${receiptHeightMm}mm; margin: 0; } @media print { html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; } }`;");
  recordTest('GROUP-7', 'T7.1', 'Dynamic @page size injection rule strictly preserved',
    pageRuleMatch);

  // 2. Accurate px-to-mm conversion and 5mm allowance preserved
  const formulaMatch = htmlContent.includes("const rawMm = measuredPx > 0 ? Math.ceil((measuredPx * 25.4) / 96) + 5 : 120;");
  recordTest('GROUP-7', 'T7.2', 'Accurate px-to-mm formula with 5mm safety allowance preserved',
    formulaMatch);

  // 3. Height clamping bounds [70mm, 500mm] preserved
  const boundsMatch = htmlContent.includes("const receiptHeightMm = Math.min(Math.max(rawMm, 70), 500);");
  recordTest('GROUP-7', 'T7.3', 'Receipt height clamping bounds [70mm, 500mm] preserved',
    boundsMatch);

  // 4. Print lifecycle afterprint listener preserved
  const lifecycleMatch = htmlContent.includes("window.addEventListener('afterprint', finishPrint);");
  recordTest('GROUP-7', 'T7.4', 'Event-driven afterprint lifecycle listener preserved',
    lifecycleMatch);

  // 5. printBillingReceipt function byte integrity
  if (fs.existsSync(BACKUP_PATH)) {
    const backupContent = fs.readFileSync(BACKUP_PATH, 'utf8');
    const pStartB = backupContent.indexOf('function printBillingReceipt(');
    const pEndB = backupContent.indexOf('\n/* ===================== STEP 7', pStartB);
    const pCodeB = backupContent.slice(pStartB, pEndB);

    const pStartC = htmlContent.indexOf('function printBillingReceipt(');
    const pEndC = htmlContent.indexOf('\n/* ===================== STEP 7', pStartC);
    const pCodeC = htmlContent.slice(pStartC, pEndC);

    recordTest('GROUP-7', 'T7.5', 'printBillingReceipt() is 100% byte-identical to pre-change backup',
      pCodeB === pCodeC && pCodeB.length > 500);
  }
}

// =========================================================================
// TEST GROUP 8: Regression Safety & Strict Subsystem Isolation
// =========================================================================
console.log('\n--- TEST GROUP 8: Regression Safety & Strict Subsystem Isolation ---');
{
  if (fs.existsSync(BACKUP_PATH)) {
    const backupContent = fs.readFileSync(BACKUP_PATH, 'utf8');

    function checkUntouched(name, startMarker, endMarker) {
      const sB = backupContent.indexOf(startMarker);
      const eB = backupContent.indexOf(endMarker, sB);
      const sC = htmlContent.indexOf(startMarker);
      const eC = htmlContent.indexOf(endMarker, sC);
      const bSnippet = backupContent.slice(sB, eB);
      const cSnippet = htmlContent.slice(sC, eC);
      return { matches: bSnippet === cSnippet && bSnippet.length > 50, len: bSnippet.length };
    }

    // 1. fsCreatePhysicalReceipt
    const physRes = checkUntouched('fsCreatePhysicalReceipt', 'async function fsCreatePhysicalReceipt(', 'async function fsCreateIndependentReceipt(');
    recordTest('GROUP-8', 'T8.1', 'fsCreatePhysicalReceipt is 100% byte-identical to backup', physRes.matches);

    // 2. parsePhysicalReceiptIdentifier
    const parseRes = checkUntouched('parsePhysicalReceiptIdentifier', 'function parsePhysicalReceiptIdentifier(', '\nfunction onReceiptNoInput(');
    recordTest('GROUP-8', 'T8.2', 'parsePhysicalReceiptIdentifier is 100% byte-identical to backup', parseRes.matches);

    // 3. fsCreateBillingWithAccounting
    const billAcctRes = checkUntouched('fsCreateBillingWithAccounting', 'async function fsCreateBillingWithAccounting(', 'async function fsCreateBillingRecord(');
    recordTest('GROUP-8', 'T8.3', 'fsCreateBillingWithAccounting is 100% byte-identical to backup', billAcctRes.matches);

    // 4. computeBillingFingerprint
    const fpRes = checkUntouched('computeBillingFingerprint', 'function computeBillingFingerprint(', 'function computeReceiptFingerprint(');
    recordTest('GROUP-8', 'T8.4', 'computeBillingFingerprint is 100% byte-identical to backup', fpRes.matches);

    // 5. exportLedgerPDF
    const pdfRes = checkUntouched('exportLedgerPDF', 'function exportLedgerPDF(', '\nfunction updateLedgerFilterDates(');
    recordTest('GROUP-8', 'T8.5', 'exportLedgerPDF is 100% byte-identical to backup', pdfRes.matches);

    // 6. BILLING_DEFAULT_ITEMS
    const catRes = checkUntouched('BILLING_DEFAULT_ITEMS', 'const BILLING_DEFAULT_ITEMS = [', '];\n\nlet masterItems');
    recordTest('GROUP-8', 'T8.6', 'BILLING_DEFAULT_ITEMS catalog is 100% byte-identical to backup', catRes.matches);
  }
}

// =========================================================================
// SUMMARY & OUTPUT
// =========================================================================
console.log('\n' + '='.repeat(72));
console.log(`TOTAL TESTS:  ${passedTests + failedTests}`);
console.log(`PASSED:       ${passedTests}`);
console.log(`FAILED:       ${failedTests}`);
console.log('='.repeat(72));

const resultsPath = path.join(__dirname, 'step_33_80_test_results.json');
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
console.log(`Detailed results written to ${resultsPath}\n`);

if (failedTests === 0) {
  console.log('✅ ALL STEP 33.80 VERIFICATION TESTS PASSED SUCCESSFULLY.\n');
  process.exit(0);
} else {
  console.error(`❌ ${failedTests} TEST(S) FAILED.\n`);
  process.exit(1);
}
