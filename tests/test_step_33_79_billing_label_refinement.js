/**
 * STEP 33.79 VERIFICATION SUITE: MALAYALAM LABEL REFINEMENT FOR BILLING FORM & RECEIPTS
 * 
 * Verifies:
 * 1. Devotee Name label replaced from 'ഭക്തന്റെ പേര്' to 'പേര്' across:
 *    - Billing form static input placeholder
 *    - Billing form dynamic row generator (renderDevoteeRows)
 *    - 80mm thermal receipt preview and print template (renderThermalReceiptHTML)
 * 2. Payment label updated to English 'Payment' across:
 *    - Billing form payment mode label ('Payment Mode *')
 *    - 80mm thermal receipt preview and print template ('Payment:')
 * 3. Preservation of Cash and UPI payment mode values.
 * 4. Preservation of other Malayalam labels, validation messages, and report headers.
 * 5. Preservation of 80mm thermal receipt layout, dynamic @page sizing, and print lifecycle.
 * 6. Cryptographic invariants, byte diff precision, and zero regression across accounting/physical receipts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

console.log('='.repeat(72));
console.log('STEP 33.79: MALAYALAM LABEL REFINEMENT FOR BILLING & RECEIPTS');
console.log('='.repeat(72));

const HTML_PATH = 'D:/Temple/Temple_Accounts-1.html';
const BACKUP_PATH = 'D:/Temple/backups/Temple_Accounts-1_PreStep33_79_BillingLabelRefinement_Backup_20261017_215000.html';

const EXPECTED_PRE_HASH = 'B6A6B10EF68678AC5ABFBE682EC40F77517DC08A6F07980FAE5F785F6136AAB4';
const EXPECTED_PRE_SIZE = 832675;

let passedTests = 0;
let failedTests = 0;
const results = {
  timestamp: new Date().toISOString(),
  step: 'STEP 33.79',
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

// Read files
const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
const htmlBuf = fs.readFileSync(HTML_PATH);
const currentHash = crypto.createHash('sha256').update(htmlBuf).digest('hex').toUpperCase();
const currentSize = htmlBuf.length;

console.log(`\nCurrent HTML SHA-256: ${currentHash}`);
console.log(`Current HTML Size:    ${currentSize} bytes`);

// =========================================================================
// TEST GROUP 1: Backup & Cryptographic Invariants
// =========================================================================
console.log('\n--- TEST GROUP 1: Backup & Cryptographic Invariants ---');
{
  const backupExists = fs.existsSync(BACKUP_PATH);
  recordTest('GROUP-1', 'T1.1', 'Byte-exact backup file exists at expected path', backupExists);

  if (backupExists) {
    const backupBuf = fs.readFileSync(BACKUP_PATH);
    const backupHash = crypto.createHash('sha256').update(backupBuf).digest('hex').toUpperCase();
    recordTest('GROUP-1', 'T1.2', 'Backup SHA-256 matches baseline hash exactly',
      backupHash === EXPECTED_PRE_HASH, `Hash: ${backupHash}`);
    recordTest('GROUP-1', 'T1.3', 'Backup file size matches exact baseline size',
      backupBuf.length === EXPECTED_PRE_SIZE, `${backupBuf.length} bytes`);
  }

  const expectedDelta = 160; // Exact UTF-8 byte reduction
  const actualDelta = EXPECTED_PRE_SIZE - currentSize;
  recordTest('GROUP-1', 'T1.4', 'Current file size reflects exact 160-byte reduction',
    actualDelta === expectedDelta, `Delta: -${actualDelta} bytes`);

  // Verify that only the intended lines differ between backup and current
  if (backupExists) {
    const backupContent = fs.readFileSync(BACKUP_PATH, 'utf8');
    const backupLines = backupContent.split('\n');
    const currentLines = htmlContent.split('\n');

    recordTest('GROUP-1', 'T1.5', 'Total line count preserved identically',
      backupLines.length === currentLines.length, `${currentLines.length} lines`);

    const diffLines = [];
    for (let i = 0; i < backupLines.length; i++) {
      if (backupLines[i] !== currentLines[i]) {
        diffLines.push({ lineNo: i + 1, oldLine: backupLines[i].trim(), newLine: currentLines[i].trim() });
      }
    }

    recordTest('GROUP-1', 'T1.6', 'Exactly 5 lines modified in the entire file',
      diffLines.length === 5, `Modified lines: ${diffLines.map(d => d.lineNo).join(', ')}`);
  }
}

// =========================================================================
// TEST GROUP 2: Devotee Name Label Verification
// =========================================================================
console.log('\n--- TEST GROUP 2: Devotee Name Label Verification ---');
{
  // 1. Static HTML row 0 placeholder
  const staticPlaceholderMatch = htmlContent.includes('placeholder="പേര് / Name *"');
  recordTest('GROUP-2', 'T2.1', 'Static HTML devotee row uses "പേര് / Name *" placeholder',
    staticPlaceholderMatch);

  // 2. Dynamic row generator placeholder
  const dynamicRowMatch = htmlContent.includes('class="devotee-name-input" ${nameAttr} value="${esc(entry.name || \'\')}" placeholder="പേര് / Name *"');
  recordTest('GROUP-2', 'T2.2', 'Dynamic renderDevoteeRows template uses "പേര് / Name *" placeholder',
    dynamicRowMatch);

  // 3. Receipt roster column heading
  const receiptRosterHeaderMatch = htmlContent.includes('<span style="flex: 1; text-align: left; padding: 0 4px;">പേര് (Devotee Name)</span>');
  recordTest('GROUP-2', 'T2.3', '80mm thermal receipt template header displays "പേര് (Devotee Name)"',
    receiptRosterHeaderMatch);

  // 4. Obsolete label removed from inputs and receipt
  const obsoleteInReceiptOrInputs = htmlContent.includes('placeholder="ഭക്തന്റെ പേര്') ||
    htmlContent.includes('ഭക്തന്റെ പേര് (Devotee Name)');
  recordTest('GROUP-2', 'T2.4', 'Obsolete label "ഭക്തന്റെ പേര്" completely removed from inputs and receipt header',
    !obsoleteInReceiptOrInputs);

  // 5. Preserved Malayalam strings
  const devoteeGroupHeaderPreserved = htmlContent.includes('👥 ഭക്തരുടെ വിവരങ്ങൾ (Devotees) *');
  recordTest('GROUP-2', 'T2.5', 'Devotee container header "👥 ഭക്തരുടെ വിവരങ്ങൾ (Devotees) *" is preserved',
    devoteeGroupHeaderPreserved);

  const addDevoteeBtnPreserved = htmlContent.includes('Add Devotee / ഭക്തനെ ചേർക്കുക');
  recordTest('GROUP-2', 'T2.6', 'Add devotee button text "Add Devotee / ഭക്തനെ ചേർക്കുക" is preserved',
    addDevoteeBtnPreserved);

  const validationMsgPreserved = htmlContent.includes('⚠️ ഭക്തന്റെ പേര് നൽകുക (Please enter the devotee name for row');
  recordTest('GROUP-2', 'T2.7', 'Validation error message "⚠️ ഭക്തന്റെ പേര് നൽകുക" is preserved',
    validationMsgPreserved);
}

// =========================================================================
// TEST GROUP 3: Payment Label Verification
// =========================================================================
console.log('\n--- TEST GROUP 3: Payment Label Verification ---');
{
  // 1. Billing form payment mode label
  const billingPaymentLabelMatch = htmlContent.includes('<label style="font-weight: 700; font-size: 13px; color: var(--text);">Payment Mode *</label>');
  recordTest('GROUP-3', 'T3.1', 'Billing form displays English "Payment Mode *" label',
    billingPaymentLabelMatch);

  // 2. Receipt payment label
  const receiptPaymentLabelMatch = htmlContent.includes('<span>Payment:</span>\n        <span><b>${esc(paymentMode)}</b></span>') ||
    htmlContent.includes('<span>Payment:</span>');
  recordTest('GROUP-3', 'T3.2', '80mm receipt displays English "Payment:" label',
    receiptPaymentLabelMatch);

  // 3. Obsolete Malayalam payment label removed from billing form and receipt
  const obsoleteFormLabel = htmlContent.includes('പേയ്‌മെന്റ് മോഡ് (Payment Mode)');
  const obsoleteReceiptLabel = htmlContent.includes('പേയ്‌മെന്റ് (Payment):');
  recordTest('GROUP-3', 'T3.3', 'Obsolete Malayalam "പേയ്‌മെന്റ് മോഡ് (Payment Mode)" removed from Billing form',
    !obsoleteFormLabel);
  recordTest('GROUP-3', 'T3.4', 'Obsolete Malayalam "പേയ്‌മെന്റ് (Payment):" removed from 80mm receipt template',
    !obsoleteReceiptLabel);

  // 4. Preservation of Cash and UPI values and buttons
  const cashButtonMatch = htmlContent.includes('data-mode="Cash"') && htmlContent.includes('setBillingPaymentMode(\'Cash\')');
  const upiButtonMatch = htmlContent.includes('data-mode="UPI"') && htmlContent.includes('setBillingPaymentMode(\'UPI\')');
  recordTest('GROUP-3', 'T3.5', 'Cash payment mode button and handlers strictly preserved',
    cashButtonMatch);
  recordTest('GROUP-3', 'T3.6', 'UPI payment mode button and handlers strictly preserved',
    upiButtonMatch);

  // 5. Preservation of Analytics & Reporting Malayalam payment labels
  const reportHeaderPreserved = htmlContent.includes('Payment Mode Summary / പേയ്‌മെന്റ് രീതി');
  recordTest('GROUP-3', 'T3.7', 'Reporting header "Payment Mode Summary / പേയ്‌മെന്റ് രീതി" is preserved',
    reportHeaderPreserved);
}

// =========================================================================
// TEST GROUP 4: Functional Runtime Verification via VM Sandbox
// =========================================================================
console.log('\n--- TEST GROUP 4: Functional Runtime Verification via VM Sandbox ---');
{
  // Create minimal VM sandbox with esc function and renderThermalReceiptHTML
  const escFnDef = `function esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }`;
  
  // Extract renderThermalReceiptHTML cleanly up to its closing brace
  const startIdx = htmlContent.indexOf('function renderThermalReceiptHTML(');
  const nextFnIdx = htmlContent.indexOf('\n/* ===================== STEP 33.25', startIdx);
  const renderThermalReceiptHTMLCode = htmlContent.slice(startIdx, nextFnIdx !== -1 ? nextFnIdx : startIdx + 3000);

  const sandbox = { console, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(escFnDef, sandbox);
  vm.runInContext(renderThermalReceiptHTMLCode, sandbox);

  // Test 1: Single Devotee Cash Receipt
  const singleRec = {
    receiptNo: 'BILL-101',
    date: '17/10/2026',
    time: '09:30 AM',
    category: 'വഴിപാട്',
    item: 'നെയ്യ് വിളക്ക്',
    quantity: 1,
    unitPrice: 30,
    totalAmount: 30,
    paymentMode: 'Cash',
    devotees: [{ name: 'അനന്തപദ്മനാഭൻ', star: 'തിരുവോണം' }],
    voided: false
  };

  const singleHtml = sandbox.renderThermalReceiptHTML(singleRec, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  recordTest('GROUP-4', 'T4.1', 'Single devotee receipt renders "പേര് (Devotee Name)" column header',
    singleHtml.includes('പേര് (Devotee Name)'));
  recordTest('GROUP-4', 'T4.2', 'Single devotee receipt renders "Payment:" with value "Cash"',
    singleHtml.includes('<span>Payment:</span>') && singleHtml.includes('<span><b>Cash</b></span>'));
  recordTest('GROUP-4', 'T4.3', 'Devotee name "അനന്തപദ്മനാഭൻ" and star "തിരുവോണം" preserved intact',
    singleHtml.includes('അനന്തപദ്മനാഭൻ') && singleHtml.includes('തിരുവോണം'));
  recordTest('GROUP-4', 'T4.4', 'Receipt total amount ₹30.00 preserved intact',
    singleHtml.includes('₹30.00'));

  // Test 2: Multi-Devotee UPI Receipt
  const multiRec = {
    receiptNo: 'BILL-102',
    date: '17/10/2026',
    time: '10:15 AM',
    category: 'വഴിപാട്',
    item: 'അർച്ചന',
    quantity: 3,
    unitPrice: 20,
    totalAmount: 60,
    paymentMode: 'UPI',
    devotees: [
      { name: 'രാധാകൃഷ്ണൻ', star: 'രോഹിണി' },
      { name: 'സുമതി', star: 'മകം' },
      { name: 'വിഷ്ണു', star: 'അശ്വതി' }
    ],
    voided: false
  };

  const multiHtml = sandbox.renderThermalReceiptHTML(multiRec, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  recordTest('GROUP-4', 'T4.5', 'Multi-devotee receipt renders "Payment:" with value "UPI"',
    multiHtml.includes('<span>Payment:</span>') && multiHtml.includes('<span><b>UPI</b></span>'));
  recordTest('GROUP-4', 'T4.6', 'All 3 devotee names and stars rendered without truncation',
    multiHtml.includes('രാധാകൃഷ്ണൻ') && multiHtml.includes('സുമതി') && multiHtml.includes('വിഷ്ണു'));
  recordTest('GROUP-4', 'T4.7', 'Quantity 3 × ₹20.00 and Total ₹60.00 preserved intact',
    multiHtml.includes('Qty: <b>3</b> &times; ₹20.00') && multiHtml.includes('₹60.00'));

  // Test 3: Voided Receipt retains headers and Payment label
  const voidedRec = {
    ...multiRec,
    receiptNo: 'BILL-102',
    voided: true,
    voidReason: 'Wrong Star Entered',
    voidDate: '17/10/2026 10:20 AM'
  };
  const voidedHtml = sandbox.renderThermalReceiptHTML(voidedRec, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');
  recordTest('GROUP-4', 'T4.8', 'Voided receipt retains "പേര് (Devotee Name)" and "Payment:"',
    voidedHtml.includes('പേര് (Devotee Name)') && voidedHtml.includes('<span>Payment:</span>'));
  recordTest('GROUP-4', 'T4.9', 'Voided banner and void reason rendered prominently',
    voidedHtml.includes('*** VOIDED / റദ്ദാക്കിയത് ***') && voidedHtml.includes('Reason: Wrong Star Entered'));
}

// =========================================================================
// TEST GROUP 5: 80 mm Print & Sizing Preservation
// =========================================================================
console.log('\n--- TEST GROUP 5: 80 mm Print & Sizing Preservation ---');
{
  // 1. Dynamic @page rule generation in printBillingReceipt
  const dynamicPageRulePresent = htmlContent.includes('@page { size: 80mm ${receiptHeightMm}mm; margin: 0; }');
  recordTest('GROUP-5', 'T5.1', 'Dynamic @page rule with measured height preserved',
    dynamicPageRulePresent);

  // 2. Pixel to mm conversion formula with 5mm safety allowance
  const formulaPresent = htmlContent.includes('const rawMm = measuredPx > 0 ? Math.ceil((measuredPx * 25.4) / 96) + 5 : 120;');
  recordTest('GROUP-5', 'T5.2', 'Accurate px-to-mm conversion with 5mm safety allowance preserved',
    formulaPresent);

  // 3. Print container and body classes
  const containerClassPresent = htmlContent.includes("printArea.className = 'billing-80mm';");
  const printBodyClassPresent = htmlContent.includes("document.body.classList.add('printing-billing-80mm');");
  recordTest('GROUP-5', 'T5.3', 'Print container and body classes (.billing-80mm, printing-billing-80mm) preserved',
    containerClassPresent && printBodyClassPresent);

  // 4. Lifecycle cleanup listeners
  const afterprintPresent = htmlContent.includes("window.addEventListener('afterprint', finishPrint);");
  recordTest('GROUP-5', 'T5.4', 'Native afterprint lifecycle event listener preserved',
    afterprintPresent);
}

// =========================================================================
// TEST GROUP 6: Strict Isolation & Untouched Subsystems
// =========================================================================
console.log('\n--- TEST GROUP 6: Strict Isolation & Untouched Subsystems ---');
{
  const backupContent = fs.readFileSync(BACKUP_PATH, 'utf8');

  // Helper to extract function body
  function extractFn(src, fnName) {
    const idx = src.indexOf(`function ${fnName}`);
    if (idx === -1) return null;
    const nextFn = src.indexOf('\nfunction ', idx + 10);
    const nextAsyncFn = src.indexOf('\nasync function ', idx + 10);
    const end = Math.min(
      nextFn === -1 ? src.length : nextFn,
      nextAsyncFn === -1 ? src.length : nextAsyncFn
    );
    return src.slice(idx, end).trim();
  }

  // 1. Physical receipt creation
  const currPhys = extractFn(htmlContent, 'fsCreatePhysicalReceipt');
  const backPhys = extractFn(backupContent, 'fsCreatePhysicalReceipt');
  recordTest('GROUP-6', 'T6.1', 'fsCreatePhysicalReceipt is 100% byte-identical to backup',
    currPhys && currPhys === backPhys);

  // 2. Physical receipt parser
  const currParser = extractFn(htmlContent, 'parsePhysicalReceiptIdentifier');
  const backParser = extractFn(backupContent, 'parsePhysicalReceiptIdentifier');
  recordTest('GROUP-6', 'T6.2', 'parsePhysicalReceiptIdentifier is 100% byte-identical to backup',
    currParser && currParser === backParser);

  // 3. Billing atomic creation with accounting
  const currTx = extractFn(htmlContent, 'fsCreateBillingWithAccounting');
  const backTx = extractFn(backupContent, 'fsCreateBillingWithAccounting');
  recordTest('GROUP-6', 'T6.3', 'fsCreateBillingWithAccounting is 100% byte-identical to backup',
    currTx && currTx === backTx);

  // 4. Billing fingerprint computation
  const currFp = extractFn(htmlContent, 'computeBillingFingerprint');
  const backFp = extractFn(backupContent, 'computeBillingFingerprint');
  recordTest('GROUP-6', 'T6.4', 'computeBillingFingerprint is 100% byte-identical to backup',
    currFp && currFp === backFp);

  // 5. Default billing items (14 Vazhipadu items)
  const currItems = htmlContent.indexOf('const BILLING_DEFAULT_ITEMS = [');
  const backItems = backupContent.indexOf('const BILLING_DEFAULT_ITEMS = [');
  const currItemsSlice = htmlContent.slice(currItems, currItems + 1500);
  const backItemsSlice = backupContent.slice(backItems, backItems + 1500);
  recordTest('GROUP-6', 'T6.5', 'BILLING_DEFAULT_ITEMS master catalog is 100% byte-identical to backup',
    currItemsSlice === backItemsSlice);
}

// =========================================================================
// TEST GROUP 7: Real Chromium Headless DOM & Interaction Verification
// =========================================================================
console.log('\n--- TEST GROUP 7: Real Chromium Headless DOM & Interaction Verification ---');
{
  const { execSync } = require('child_process');
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const harnessPath = path.join(__dirname, 'step_33_79_chrome_harness.html');

  // Extract billing form section from HTML
  const formStart = htmlContent.indexOf('<!-- Right Column: Devotee & Transaction Details -->');
  const formEnd = htmlContent.indexOf('<!-- Manual Bill Number Override');
  const billingFormFragment = htmlContent.slice(formStart, formEnd);

  // Extract JS functions
  function getCodeBetween(startMarker, endMarker) {
    const s = htmlContent.indexOf(startMarker);
    const e = htmlContent.indexOf(endMarker, s);
    return htmlContent.slice(s, e);
  }

  const renderDevoteeRowsCode = getCodeBetween('function renderDevoteeRows(', 'function updatePrice(');
  const sMode = htmlContent.indexOf('function setBillingPaymentMode(');
  const eSync = htmlContent.indexOf('function syncPaymentModeUI(', sMode);
  const eMode = htmlContent.indexOf('\nfunction ', eSync + 10);
  const setPaymentModeCode = htmlContent.slice(sMode, eMode);
  const renderThermalReceiptHTMLCode = getCodeBetween('function renderThermalReceiptHTML(', '/* ===================== STEP 33.25');

  const harnessHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>STEP 33.79 Chromium Verification</title>
</head>
<body>
  <div id="billingRoot">
    ${billingFormFragment}
  </div>
  <div id="receiptPreview"></div>
  <div id="testOutput"></div>

  <script>
    function el(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    ${renderDevoteeRowsCode}
    ${setPaymentModeCode}
    ${renderThermalReceiptHTMLCode}

    // Run immediately during DOM parsing so --dump-dom captures results
    (function runTests() {
      const results = {};
      try {
        // 1. Initial Devotee Name input placeholder
        const initialNameInp = document.getElementById('name');
        results.initialNamePlaceholder = initialNameInp ? initialNameInp.getAttribute('placeholder') : null;

        // 2. Dynamic row generation placeholder
        renderDevoteeRows([{ name: 'ഭക്തൻ 1', star: 'അശ്വതി' }, { name: '', star: '' }]);
        const dynRows = document.querySelectorAll('.devotee-entry-row');
        results.dynRowCount = dynRows.length;
        const dynNameInps = document.querySelectorAll('.devotee-name-input');
        results.dynPlaceholder0 = dynNameInps[0] ? dynNameInps[0].getAttribute('placeholder') : null;
        results.dynPlaceholder1 = dynNameInps[1] ? dynNameInps[1].getAttribute('placeholder') : null;

        // 3. Billing form payment label
        const paymentModesWrap = document.getElementById('billingPaymentModes');
        const paymentLabel = paymentModesWrap ? paymentModesWrap.parentElement.querySelector('label') : null;
        results.billingPaymentLabel = paymentLabel ? paymentLabel.textContent.trim() : null;

        // 4. Payment mode interaction (Cash & UPI)
        const cashBtn = document.querySelector('.payment-mode-btn[data-mode="Cash"]');
        const upiBtn = document.querySelector('.payment-mode-btn[data-mode="UPI"]');
        const selectEl = document.getElementById('paymentMode');

        setBillingPaymentMode('UPI');
        results.modeAfterUpi = selectEl ? selectEl.value : null;
        results.upiBtnActive = upiBtn ? upiBtn.classList.contains('active') : false;
        results.cashBtnInactiveAfterUpi = cashBtn ? !cashBtn.classList.contains('active') : false;

        setBillingPaymentMode('Cash');
        results.modeAfterCash = selectEl ? selectEl.value : null;
        results.cashBtnActive = cashBtn ? cashBtn.classList.contains('active') : false;
        results.upiBtnInactiveAfterCash = upiBtn ? !upiBtn.classList.contains('active') : false;

        // 5. Thermal Receipt Preview / Print output
        const receiptHtml = renderThermalReceiptHTML({
          receiptNo: 'BILL-888',
          date: '17/10/2026',
          time: '01:00 PM',
          category: 'വഴിപാട്',
          item: 'അർച്ചന',
          qty: 2,
          unitPrice: 20,
          totalAmount: 40,
          paymentMode: 'Cash',
          devotees: [
            { name: 'സുബ്രഹ്മണ്യൻ', star: 'കാർത്തിക' },
            { name: 'കല്യാണി', star: 'രോഹിണി' }
          ]
        }, 'മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം', 'ആശാരിവിളാകം, കേരളദിത്യപുരം');

        document.getElementById('receiptPreview').innerHTML = receiptHtml;

        results.receiptHasDevoteeHeader = receiptHtml.includes('പേര് (Devotee Name)');
        results.receiptHasObsoleteDevoteeHeader = receiptHtml.includes('ഭക്തന്റെ പേര്');
        results.receiptHasPaymentLabel = receiptHtml.includes('<span>Payment:</span>');
        results.receiptHasObsoletePaymentLabel = receiptHtml.includes('പേയ്‌മെന്റ് (Payment):') || receiptHtml.includes('പേയ്മെന്റ് (Payment):');
        results.receiptHasPaymentModeValue = receiptHtml.includes('<span><b>Cash</b></span>');
        results.receiptDevotee1 = receiptHtml.includes('സുബ്രഹ്മണ്യൻ');
        results.receiptDevotee2 = receiptHtml.includes('കല്യാണി');
      } catch (err) {
        results.error = err.message;
      }
      document.getElementById('testOutput').textContent = JSON.stringify(results);
    })();
  </script>
</body>
</html>`;

  fs.writeFileSync(harnessPath, harnessHtml, 'utf8');

  try {
    const rawOut = execSync(
      `"${CHROME_PATH}" --headless=new --disable-gpu --run-all-compositor-stages-before-draw --dump-dom "file:///${harnessPath.replace(/\\/g, '/')}"`,
      { encoding: 'utf8', timeout: 15000 }
    );

    const match = rawOut.match(/<div id="testOutput">([\s\S]*?)<\/div>/);
    if (!match || !match[1].trim()) {
      recordTest('GROUP-7', 'T7.0', 'Chromium headless executed and returned output', false, 'testOutput empty or missing: ' + (match ? match[0] : 'no match'));
    } else {
      let cr;
      try {
        cr = JSON.parse(match[1]);
      } catch (pe) {
        console.error('JSON parse error on raw content:', match[1]);
        throw pe;
      }
      recordTest('GROUP-7', 'T7.1', 'Initial devotee name placeholder is "പേര് / Name *"',
        cr.initialNamePlaceholder === 'പേര് / Name *', cr.initialNamePlaceholder);
      recordTest('GROUP-7', 'T7.2', 'Dynamically generated row 0 placeholder is "പേര് / Name *"',
        cr.dynPlaceholder0 === 'പേര് / Name *', cr.dynPlaceholder0);
      recordTest('GROUP-7', 'T7.3', 'Dynamically generated row 1 placeholder is "പേര് / Name *"',
        cr.dynPlaceholder1 === 'പേര് / Name *', cr.dynPlaceholder1);
      recordTest('GROUP-7', 'T7.4', 'Billing form displays English label "Payment Mode *"',
        cr.billingPaymentLabel === 'Payment Mode *', cr.billingPaymentLabel);
      recordTest('GROUP-7', 'T7.5', 'UPI mode activation sets select to "UPI" and updates button active state',
        cr.modeAfterUpi === 'UPI' && cr.upiBtnActive && cr.cashBtnInactiveAfterUpi);
      recordTest('GROUP-7', 'T7.6', 'Cash mode activation sets select to "Cash" and updates button active state',
        cr.modeAfterCash === 'Cash' && cr.cashBtnActive && cr.upiBtnInactiveAfterCash);
      recordTest('GROUP-7', 'T7.7', 'Receipt in real Chromium renders "പേര് (Devotee Name)" header',
        cr.receiptHasDevoteeHeader);
      recordTest('GROUP-7', 'T7.8', 'Receipt in real Chromium renders "Payment:" label and "Cash" mode',
        cr.receiptHasPaymentLabel && cr.receiptHasPaymentModeValue);
      recordTest('GROUP-7', 'T7.9', 'Receipt in real Chromium contains zero obsolete devotee/payment Malayalam labels',
        !cr.receiptHasObsoleteDevoteeHeader && !cr.receiptHasObsoletePaymentLabel);
      recordTest('GROUP-7', 'T7.10', 'Receipt preserves multiple Malayalam devotee names with 100% fidelity',
        cr.receiptDevotee1 && cr.receiptDevotee2);
    }
  } catch (e) {
    recordTest('GROUP-7', 'T7.0', 'Chromium execution succeeded without timeout', false, e.message);
  } finally {
    try { fs.unlinkSync(harnessPath); } catch (e) {}
  }
}

// Summary
console.log('\n' + '='.repeat(72));
console.log(`TOTAL TESTS:  ${passedTests + failedTests}`);
console.log(`PASSED:       ${passedTests}`);
console.log(`FAILED:       ${failedTests}`);
console.log('='.repeat(72));

results.summary = {
  total: passedTests + failedTests,
  passed: passedTests,
  failed: failedTests,
  currentHash,
  currentSize
};

fs.writeFileSync('D:/Temple/tests/step_33_79_test_results.json', JSON.stringify(results, null, 2), 'utf8');
console.log('Detailed results written to D:/Temple/tests/step_33_79_test_results.json');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n✅ ALL STEP 33.79 VERIFICATION TESTS PASSED SUCCESSFULLY.');
}
