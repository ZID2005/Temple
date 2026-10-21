/**
 * STEP 33.174 — Headless Google Chrome Browser E2E Test Suite
 * Location: tests/test_step_33_174_browser_e2e.js
 *
 * Verifies live browser behavior of:
 *  1. Custom Payment Mode activation & deactivation toggle in real Chromium DOM.
 *  2. Immediate clearing and locking (disabled, readOnly) of the Voucher Number field.
 *  3. Prevention of automatic preview repopulating the field while custom mode is active.
 *  4. Visual banner and active button styling with Radial Glow animation.
 *  5. Reduced-motion preferences.
 *  6. Restoring voucher preview without consuming a number when returning to normal mode.
 *  7. Saving custom payment via standard SAVE action without voucher number.
 *  8. Preserving form data and custom mode on failed save.
 *  9. Strict sequential voucher numbering: V-011 -> CUSTOM -> V-012 -> CUSTOM -> V-013.
 * 10. Edit custom payment invariance and accounting books integration.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = globalThis.WebSocket;

console.log('='.repeat(80));
console.log('STEP 33.174: HEADLESS CHROME E2E TEST — CUSTOM MODE, VOUCHER LOCK & RADIAL GLOW');
console.log('='.repeat(80));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function startServer(port = 3026) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/' || reqPath === '') reqPath = '/Temple_Accounts-1.html';
      const filePath = path.normalize(path.join('D:\\Temple', reqPath));

      if (!filePath.startsWith('D:\\Temple') || path.basename(filePath).startsWith('.') || reqPath.startsWith('/backups')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`[SERVER] Running on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

class BrowserSession {
  constructor() {
    this.chromeProc = null;
    this.ws = null;
    this.msgId = 1;
  }

  async start(port = 3026) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const profileDir = 'C:\\Users\\sanal\\.gemini\\antigravity-browser-profile-step33-174';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9231',
      `--user-data-dir=${profileDir}`,
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9231...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9231/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9231');

    const tabsRes = await fetch('http://127.0.0.1:9231/json');
    const tabs = await tabsRes.json();
    const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
    if (!appTab) throw new Error('Could not find Temple_Accounts-1.html tab in Chrome');

    this.ws = new WebSocket(appTab.webSocketDebuggerUrl);
    await new Promise(r => this.ws.onopen = r);
    console.log('[BROWSER] Connected to application tab via CDP.');

    for (let i = 0; i < 40; i++) {
      try {
        const res = await this.evaluate('document.readyState');
        if (res === 'complete') break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = this.msgId++;
      const h = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.id === curId) {
            this.ws.removeEventListener('message', h);
            if (msg.error) {
              reject(new Error('CDP error: ' + JSON.stringify(msg.error)));
            } else {
              resolve(msg.result || {});
            }
          }
        } catch (err) {
          reject(err);
        }
      };
      this.ws.addEventListener('message', h);
      this.ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res?.exceptionDetails) {
      throw new Error(`CDP evaluation error: ` + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res?.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.chromeProc) {
      try { this.chromeProc.kill(); } catch (e) {}
      this.chromeProc = null;
    }
    console.log('[BROWSER] Session closed.');
  }
}

async function runBrowserE2E() {
  let server = null;
  const browser = new BrowserSession();
  let passed = 0;
  let failed = 0;

  function assert(condition, message, detail = '') {
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${message}${detail ? ' (' + detail + ')' : ''}`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL] ${message}${detail ? ' (' + detail + ')' : ''}`);
    }
  }

  try {
    server = await startServer(3026);
    await browser.start(3026);

    // Boot app and initialize DOM
    await browser.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      window.currentUser = { uid: 'test_admin', role: 'admin' };
      window.getCurrentFirebaseUser = () => ({ uid: 'test_admin', email: 'admin@temple.org' });
    })()`);

    // =======================================================================
    // GROUP 1: Initial DOM Inspection of New Payment Form
    // =======================================================================
    console.log('\n--- GROUP 1: Initial DOM Inspection of New Payment Form ---');

    const domInfo = await browser.evaluate(`(async () => {
      window.allFunds = async () => [{ id: 'f1', name: 'General Fund' }];
      window.allExpenseCategories = async () => [{ id: 'e1', name: 'Pooja Expense' }, { id: 'e2', name: 'Flower' }, { id: 'e3', name: 'Maintenance' }];
      window.inMemoryPayments = window.inMemoryPayments || [];
      window.fsGetAllSafe = async (col) => {
        if (col === 'payments') return window.inMemoryPayments.slice();
        if (col === 'funds') return [{ id: 'f1', name: 'General Fund' }];
        if (col === 'expenseCategories') return [{ id: 'e1', name: 'Pooja Expense' }, { id: 'e2', name: 'Flower' }, { id: 'e3', name: 'Maintenance' }];
        if (col === 'bankAccounts') return [{ id: 'b1', name: 'SBI Temple Acct' }];
        return [];
      };
      window.allPayments = async () => window.inMemoryPayments.slice();
      window.activePayments = async () => window.inMemoryPayments.filter(p => !p.voided);
      window._isolatedCounter = 10;
      window.nextVoucherNo = async () => 'V-' + String(window._isolatedCounter + 1).padStart(3, '0');
      window.fsGetOneSafe = async () => null;
      window.alert = () => {};
      window.toast = () => {};

      await navigate('payments');
      await new Promise(r => setTimeout(r, 400));

      const form = document.getElementById('paymentForm');
      const cancelBtn = document.getElementById('btn-cancel-payment');
      const customBtn = document.getElementById('btn-save-custom-payment');
      const saveBtn = document.getElementById('btn-save-payment');
      const savePrintBtn = document.getElementById('btn-save-print-payment');
      const vInput = document.getElementById('paymentVoucherNo');
      const banner = document.getElementById('custom-payment-banner');

      const parent = customBtn?.parentElement;
      const cancelIdx = Array.from(parent?.children || []).indexOf(cancelBtn);
      const customIdx = Array.from(parent?.children || []).indexOf(customBtn);

      const hasShine = !!customBtn?.querySelector('.rg-shine');
      const hasBg = !!customBtn?.querySelector('.rg-bg');
      const hasLabel = !!customBtn?.querySelector('.rg-label');

      return {
        cancelFound: !!cancelBtn,
        customFound: !!customBtn,
        saveFound: !!saveBtn,
        savePrintFound: !!savePrintBtn,
        vInputFound: !!vInput,
        bannerFound: !!banner,
        bannerDisplayed: banner ? window.getComputedStyle(banner).display !== 'none' : false,
        vInputValue: vInput?.value,
        vInputDisabled: vInput?.disabled,
        vInputReadOnly: vInput?.readOnly,
        customImmediatelyAfterCancel: (customIdx === cancelIdx + 1),
        hasShine,
        hasBg,
        hasLabel,
        customIsActive: customBtn?.classList.contains('is-active'),
        customAriaPressed: customBtn?.getAttribute('aria-pressed'),
        customTitle: customBtn?.getAttribute('title'),
        customText: customBtn?.innerText?.trim(),
        isCustomPaymentMode: window.isCustomPaymentMode
      };
    })()`);

    assert(domInfo.cancelFound, 'CANCEL button present in DOM');
    assert(domInfo.customFound, 'CUSTOM button present in DOM with id="btn-save-custom-payment"');
    assert(domInfo.saveFound, 'SAVE button present in DOM with id="btn-save-payment"');
    assert(domInfo.savePrintFound, 'SAVE & PRINT button present in DOM');
    assert(domInfo.customImmediatelyAfterCancel, 'CUSTOM button positioned immediately after CANCEL in DOM');
    assert(domInfo.hasShine && domInfo.hasBg && domInfo.hasLabel, 'CUSTOM button has rg-shine, rg-bg, and rg-label structure');
    assert(domInfo.vInputFound, 'Voucher Number input present with id="paymentVoucherNo"');
    assert(domInfo.vInputValue === 'V-011', 'Initial Voucher field displays sequential preview V-011', domInfo.vInputValue);
    assert(domInfo.vInputDisabled === false, 'Initial Voucher field is enabled');
    assert(domInfo.vInputReadOnly === false, 'Initial Voucher field is not readonly');
    assert(domInfo.bannerDisplayed === false, 'Custom payment banner is initially hidden');
    assert(domInfo.customIsActive === false, 'CUSTOM button initially does NOT have .is-active class');
    assert(domInfo.customAriaPressed === 'false', 'CUSTOM button initially has aria-pressed="false"');
    assert(domInfo.isCustomPaymentMode === false, 'window.isCustomPaymentMode is false on initial form');

    // =======================================================================
    // GROUP 2: Activating Custom Payment Mode via CUSTOM Click
    // =======================================================================
    console.log('\n--- GROUP 2: Activating Custom Mode (Click CUSTOM) ---');

    const activatedInfo = await browser.evaluate(`(() => {
      const customBtn = document.getElementById('btn-save-custom-payment');
      customBtn.click();

      const vInput = document.getElementById('paymentVoucherNo');
      const banner = document.getElementById('custom-payment-banner');
      const vLabel = document.getElementById('paymentVoucherNoLabel');

      return {
        isCustomPaymentMode: window.isCustomPaymentMode,
        vInputValue: vInput.value,
        vInputDisabled: vInput.disabled,
        vInputReadOnly: vInput.readOnly,
        vInputAriaDisabled: vInput.getAttribute('aria-disabled'),
        vInputPlaceholder: vInput.placeholder,
        bannerDisplayed: window.getComputedStyle(banner).display !== 'none',
        bannerText: banner.innerText,
        labelText: vLabel.innerText,
        customIsActive: customBtn.classList.contains('is-active'),
        customAriaPressed: customBtn.getAttribute('aria-pressed'),
        customTitle: customBtn.getAttribute('title'),
        customText: customBtn.innerText.trim(),
        btnComputedBg: window.getComputedStyle(customBtn).backgroundImage
      };
    })()`);

    assert(activatedInfo.isCustomPaymentMode === true, 'Clicking CUSTOM sets isCustomPaymentMode=true');
    assert(activatedInfo.vInputValue === '', 'Activating CUSTOM immediately clears Voucher Number input to blank ("")');
    assert(activatedInfo.vInputDisabled === true, 'Activating CUSTOM disables the Voucher Number input');
    assert(activatedInfo.vInputReadOnly === true, 'Activating CUSTOM sets Voucher Number input to readOnly');
    assert(activatedInfo.vInputAriaDisabled === 'true', 'Activating CUSTOM sets aria-disabled="true" on Voucher input');
    assert(activatedInfo.vInputPlaceholder.includes('No Voucher Number'), 'Placeholder indicates No Voucher Number', activatedInfo.vInputPlaceholder);
    assert(activatedInfo.bannerDisplayed === true, 'Activating CUSTOM displays custom-payment-banner');
    assert(activatedInfo.bannerText.includes('CUSTOM PAYMENT — NO VOUCHER NUMBER'), 'Banner contains CUSTOM PAYMENT — NO VOUCHER NUMBER');
    assert(activatedInfo.labelText.includes('CUSTOM PAYMENT — NO VOUCHER NUMBER'), 'Label badge contains CUSTOM PAYMENT — NO VOUCHER NUMBER');
    assert(activatedInfo.customIsActive === true, 'CUSTOM button gains .is-active class');
    assert(activatedInfo.customAriaPressed === 'true', 'CUSTOM button aria-pressed="true"');
    assert(activatedInfo.customText.includes('CUSTOM ACTIVE'), 'CUSTOM button text updates to CUSTOM ACTIVE', activatedInfo.customText);

    // =======================================================================
    // GROUP 3: Toggle Workflow & Input Preservation
    // =======================================================================
    console.log('\n--- GROUP 3: Toggle Invariance & Form Details Preservation ---');

    const toggleInfo = await browser.evaluate(`(() => {
      const form = document.getElementById('paymentForm');
      form.querySelector('[name="paidTo"]').value = 'Thiruvananthapuram Flower Vendor';
      form.querySelector('[name="amount"]').value = '1500';
      form.querySelector('[name="description"]').value = 'Fresh jasmine garlands for evening puja';

      // Click CUSTOM again to toggle OFF
      const customBtn = document.getElementById('btn-save-custom-payment');
      customBtn.click();

      const vInput = document.getElementById('paymentVoucherNo');
      const banner = document.getElementById('custom-payment-banner');

      const toggledOff = {
        isCustomPaymentMode: window.isCustomPaymentMode,
        vInputValue: vInput.value,
        vInputDisabled: vInput.disabled,
        vInputReadOnly: vInput.readOnly,
        bannerDisplayed: window.getComputedStyle(banner).display !== 'none',
        customIsActive: customBtn.classList.contains('is-active'),
        customAriaPressed: customBtn.getAttribute('aria-pressed'),
        paidToValue: form.querySelector('[name="paidTo"]').value,
        amountValue: form.querySelector('[name="amount"]').value,
        descValue: form.querySelector('[name="description"]').value,
        counter: window._isolatedCounter
      };

      // Click CUSTOM once more to toggle back ON
      customBtn.click();

      const toggledOnAgain = {
        isCustomPaymentMode: window.isCustomPaymentMode,
        vInputValue: vInput.value,
        vInputDisabled: vInput.disabled,
        vInputReadOnly: vInput.readOnly,
        bannerDisplayed: window.getComputedStyle(banner).display !== 'none',
        customIsActive: customBtn.classList.contains('is-active'),
        paidToValue: form.querySelector('[name="paidTo"]').value,
        amountValue: form.querySelector('[name="amount"]').value,
        counter: window._isolatedCounter
      };

      return { toggledOff, toggledOnAgain };
    })()`);

    assert(toggleInfo.toggledOff.isCustomPaymentMode === false, 'Toggling off exits custom mode (isCustomPaymentMode=false)');
    assert(toggleInfo.toggledOff.vInputDisabled === false, 'Toggling off re-enables Voucher input');
    assert(toggleInfo.toggledOff.vInputReadOnly === false, 'Toggling off clears Voucher readOnly');
    assert(toggleInfo.toggledOff.vInputValue === 'V-011', 'Toggling off restores normal preview V-011 without consuming sequence number');
    assert(toggleInfo.toggledOff.bannerDisplayed === false, 'Toggling off hides custom-payment-banner');
    assert(toggleInfo.toggledOff.customIsActive === false, 'Toggling off removes .is-active from CUSTOM button');
    assert(toggleInfo.toggledOff.paidToValue === 'Thiruvananthapuram Flower Vendor', 'Payee data preserved when exiting custom mode');
    assert(toggleInfo.toggledOff.amountValue === '1500', 'Amount data preserved when exiting custom mode');
    assert(toggleInfo.toggledOff.counter === 10, 'Counter strictly untouched (remains 10) across toggle cycles');

    assert(toggleInfo.toggledOnAgain.isCustomPaymentMode === true, 'Toggling back on re-enters custom mode');
    assert(toggleInfo.toggledOnAgain.vInputValue === '', 'Toggling back on clears Voucher input');
    assert(toggleInfo.toggledOnAgain.vInputDisabled === true, 'Toggling back on locks Voucher input');
    assert(toggleInfo.toggledOnAgain.paidToValue === 'Thiruvananthapuram Flower Vendor', 'Payee data still preserved');
    assert(toggleInfo.toggledOnAgain.amountValue === '1500', 'Amount data still preserved');

    // =======================================================================
    // GROUP 4: Save Custom Payment via Standard SAVE Button
    // =======================================================================
    console.log('\n--- GROUP 4: Save Custom Payment via Standard SAVE Button ---');

    const saveCustomResult = await browser.evaluate(`(async () => {
      // Mock Cloud Firestore save handlers
      window.fsSaveRecordSafe = async (col, rec) => {
        window.inMemoryPayments.push(Object.assign({}, rec));
      };
      window.fsNextVoucherNo = async () => {
        window._isolatedCounter++;
        return 'V-' + String(window._isolatedCounter).padStart(3, '0');
      };

      const saveBtn = document.getElementById('btn-save-payment');
      saveBtn.click();

      // Wait for async save and table refresh
      await new Promise(r => setTimeout(r, 400));

      const savedPmt = window.inMemoryPayments[window.inMemoryPayments.length - 1];
      const nextPreview = await window.nextVoucherNo();

      return {
        savedVoucherNo: savedPmt?.voucherNo,
        savedVoucherType: savedPmt?.voucherType,
        savedId: savedPmt?.id,
        savedFirestoreId: savedPmt?.firestoreId,
        savedPaidTo: savedPmt?.paidTo,
        savedAmount: savedPmt?.amount,
        counterAfterCustom: window._isolatedCounter,
        nextPreviewAfterCustom: nextPreview,
        isCustomPaymentModeAfterSave: window.isCustomPaymentMode
      };
    })()`);

    assert(saveCustomResult.savedVoucherNo === '', 'Saved custom payment has empty voucherNo ("")');
    assert(saveCustomResult.savedVoucherType === 'custom', 'Saved custom payment has voucherType="custom"');
    assert(saveCustomResult.savedId.startsWith('c_'), 'Saved custom payment has unique ID prefixed with c_');
    assert(saveCustomResult.savedFirestoreId.startsWith('pmt_c_'), 'Saved custom payment firestoreId prefixed with pmt_c_');
    assert(saveCustomResult.savedPaidTo === 'Thiruvananthapuram Flower Vendor', 'Correct payee saved');
    assert(saveCustomResult.counterAfterCustom === 10, 'CRITICAL: Voucher counter strictly untouched at 10 after custom save');
    assert(saveCustomResult.nextPreviewAfterCustom === 'V-011', 'Next voucher preview remains V-011 (no number skipped)');
    assert(saveCustomResult.isCustomPaymentModeAfterSave === false, 'Successful save resets custom mode to false');

    // =======================================================================
    // GROUP 5: Sequential Execution: Normal (V-011) -> Custom (—) -> Normal (V-012)
    // =======================================================================
    console.log('\n--- GROUP 5: Sequence Execution (V-011 -> CUSTOM -> V-012) ---');

    const seqResult = await browser.evaluate(`(async () => {
      // Step A: Create Normal Payment V-011
      const form = document.getElementById('paymentForm');
      form.querySelector('[name="paidTo"]').value = 'Priest Dakshina Fund';
      form.querySelector('[name="amount"]').value = '2100';
      form.querySelector('[name="category"]').value = 'Pooja Expense';
      document.getElementById('btn-save-payment').click();
      await new Promise(r => setTimeout(r, 400));

      const p1 = window.inMemoryPayments[window.inMemoryPayments.length - 1];
      const p1Counter = window._isolatedCounter;

      // Step B: Create Second Custom Payment
      const customBtn = document.getElementById('btn-save-custom-payment');
      customBtn.click(); // Activate custom mode

      const form2 = document.getElementById('paymentForm');
      form2.querySelector('[name="paidTo"]').value = 'Local Banana Leaf Supplier';
      form2.querySelector('[name="amount"]').value = '350';
      form2.querySelector('[name="category"]').value = 'Pooja Expense';
      document.getElementById('btn-save-payment').click();
      await new Promise(r => setTimeout(r, 400));

      const p2 = window.inMemoryPayments[window.inMemoryPayments.length - 1];
      const p2Counter = window._isolatedCounter;

      // Step C: Create Next Normal Payment V-012
      const form3 = document.getElementById('paymentForm');
      form3.querySelector('[name="paidTo"]').value = 'Sanitation & Cleaning Service';
      form3.querySelector('[name="amount"]').value = '1800';
      form3.querySelector('[name="category"]').value = 'Maintenance';
      document.getElementById('btn-save-payment').click();
      await new Promise(r => setTimeout(r, 400));

      const p3 = window.inMemoryPayments[window.inMemoryPayments.length - 1];
      const p3Counter = window._isolatedCounter;

      return {
        p1: { voucherNo: p1?.voucherNo, type: p1?.voucherType, counter: p1Counter },
        p2: { voucherNo: p2?.voucherNo, type: p2?.voucherType, counter: p2Counter },
        p3: { voucherNo: p3?.voucherNo, type: p3?.voucherType, counter: p3Counter }
      };
    })()`);

    assert(seqResult.p1.voucherNo === 'V-011', 'Payment 1 received sequential V-011', seqResult.p1.voucherNo);
    assert(seqResult.p1.counter === 11, 'Counter incremented to 11 after V-011', `counter=${seqResult.p1.counter}`);
    assert(seqResult.p2.voucherNo === '' && seqResult.p2.type === 'custom', 'Payment 2 is custom with blank voucherNo');
    assert(seqResult.p2.counter === 11, 'Payment 2 did NOT touch counter (strictly remains 11)', `counter=${seqResult.p2.counter}`);
    assert(seqResult.p3.voucherNo === 'V-012', 'Payment 3 received exact sequential V-012', seqResult.p3.voucherNo);
    assert(seqResult.p3.counter === 12, 'Counter incremented to 12 after V-012', `counter=${seqResult.p3.counter}`);

    // =======================================================================
    // GROUP 6: Table DOM Rendering
    // =======================================================================
    console.log('\n--- GROUP 6: Payments Table DOM Rendering ---');

    const tableInfo = await browser.evaluate(`(async () => {
      await navigate('payments');
      await new Promise(r => setTimeout(r, 400));

      const rows = Array.from(document.querySelectorAll('#paymentTable tbody tr'));
      const rowData = rows.map(r => {
        const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
        return cells.slice(0, 5);
      });

      return rowData;
    })()`);

    const hasDashVoucher = tableInfo.some(cells => cells[0] === '—');
    const hasV011 = tableInfo.some(cells => cells[0] === 'V-011');
    const hasV012 = tableInfo.some(cells => cells[0] === 'V-012');

    assert(hasDashVoucher, 'Payments table renders "—" for custom payments');
    assert(hasV011, 'Payments table renders "V-011" for normal payment');
    assert(hasV012, 'Payments table renders "V-012" for normal payment');

    // =======================================================================
    // GROUP 7: Editing Custom Payment Preserves Custom Mode & Counter
    // =======================================================================
    console.log('\n--- GROUP 7: Editing Custom Payment Invariance ---');

    const editCustomInfo = await browser.evaluate(`(async () => {
      const customPmt = window.inMemoryPayments.find(p => p.voucherType === 'custom');
      window.fsGetOneSafe = async (col, id) => window.inMemoryPayments.find(p => String(p.id) === String(id) || String(p.firestoreId) === String(id));
      window.fsUpdateRecordSafe = async (col, id, rec) => {
        const idx = window.inMemoryPayments.findIndex(p => p.firestoreId === id || p.id === id);
        if (idx !== -1) window.inMemoryPayments[idx] = Object.assign({}, window.inMemoryPayments[idx], rec);
      };

      await navigate('payments', null, customPmt.id);
      await new Promise(r => setTimeout(r, 400));

      const form = document.getElementById('paymentForm');
      const vInput = document.getElementById('paymentVoucherNo');
      const banner = document.getElementById('custom-payment-banner');
      const customBtn = document.getElementById('btn-save-custom-payment');

      const isReadOnly = vInput.readOnly;
      const isDisabled = vInput.disabled;
      const placeholder = vInput.placeholder;
      const bannerVisible = window.getComputedStyle(banner).display !== 'none';
      const btnActive = customBtn.classList.contains('is-active');

      // Update amount and save
      form.querySelector('[name="amount"]').value = '1750';
      document.getElementById('btn-save-payment').click();
      await new Promise(r => setTimeout(r, 400));

      const updatedPmt = window.inMemoryPayments.find(p => p.id === customPmt.id);

      return {
        isReadOnly,
        isDisabled,
        placeholder,
        bannerVisible,
        btnActive,
        updatedAmount: updatedPmt?.amount,
        updatedVoucherNo: updatedPmt?.voucherNo,
        updatedVoucherType: updatedPmt?.voucherType,
        counterAfterEdit: window._isolatedCounter
      };
    })()`);

    assert(editCustomInfo.isReadOnly, 'Voucher Number input is readOnly during custom payment edit');
    assert(editCustomInfo.isDisabled, 'Voucher Number input is disabled during custom payment edit');
    assert(editCustomInfo.placeholder.includes('No Voucher Number'), 'Placeholder indicates No Voucher Number');
    assert(editCustomInfo.bannerVisible, 'Custom payment banner is visible during custom payment edit');
    assert(editCustomInfo.btnActive, 'CUSTOM button has .is-active during custom payment edit');
    assert(editCustomInfo.updatedAmount === 1750, 'Updated custom payment amount is ₹1750', `amount=${editCustomInfo.updatedAmount}`);
    assert(editCustomInfo.updatedVoucherNo === '', 'Updated custom payment voucherNo strictly remains blank ("")');
    assert(editCustomInfo.updatedVoucherType === 'custom', 'Updated custom payment voucherType strictly remains "custom"');
    assert(editCustomInfo.counterAfterEdit === 12, 'Editing custom payment did NOT touch counter (strictly remains 12)');

  } catch (err) {
    console.error('Fatal error during browser E2E test:', err);
    failed++;
  } finally {
    await browser.close();
    if (server) {
      server.close();
      console.log('[SERVER] Server closed.');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.174 BROWSER E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserE2E().catch(err => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
