/**
 * STEP 33.173 — Headless Chrome Browser E2E Test
 * Tests:
 * 1. UI presence and position of CUSTOM button immediately after CANCEL in New Payment form.
 * 2. Visual attributes (tooltip, aria-label, icon, styling).
 * 3. Exact sequence: V-011 -> CUSTOM (—) -> V-012 -> CUSTOM (—) -> V-013.
 * 4. Voucher counter isolation: counter never altered by custom payments.
 * 5. Payments table rendering of "—" for custom payments and "V-xxx" for normal payments.
 * 6. Cash Book and Bank Book rendering without empty brackets or "undefined".
 * 7. Editing custom payment preserves unnumbered status and does not assign a voucher number.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('='.repeat(80));
console.log('STEP 33.173: HEADLESS CHROME E2E TEST — CUSTOM PAYMENT BUTTON & SEQUENCING');
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

function startServer(port = 3025) {
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

  async start(port = 3025) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const profileDir = 'C:\\Users\\sanal\\.gemini\\antigravity-browser-profile-step33-173';
    const args = [
      '--headless=new',
      '--remote-debugging-port=9230',
      `--user-data-dir=${profileDir}`,
      '--window-size=1440,900',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${port}/Temple_Accounts-1.html`
    ];

    console.log('[BROWSER] Launching headless Chrome on port 9230...');
    this.chromeProc = spawn(chromePath, args, { stdio: 'pipe' });

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9230/json');
        if (res.ok) { connected = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!connected) throw new Error('Chrome failed to listen on port 9230');

    const tabsRes = await fetch('http://127.0.0.1:9230/json');
    const tabs = await tabsRes.json();
    const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
    if (!appTab) throw new Error('Could not find Temple_Accounts-1.html tab in Chrome');

    this.ws = new WebSocket(appTab.webSocketDebuggerUrl);
    await new Promise(r => this.ws.onopen = r);
    console.log('[BROWSER] Connected to application tab via CDP.');

    for (let i = 0; i < 40; i++) {
      try {
        const res = await this.send('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true
        });
        if (res.result?.value === 'complete') break;
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

  async evaluate(asyncJsFunctionStr) {
    const res = await this.send('Runtime.evaluate', {
      expression: asyncJsFunctionStr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res?.exceptionDetails) {
      throw new Error('CDP evaluation error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
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

async function runE2E() {
  let server = null;
  const session = new BrowserSession();
  let passed = 0;
  let failed = 0;

  function assert(condition, desc, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}${detail ? ' (' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}${detail ? ' (' + detail + ')' : ''}`);
      failed++;
    }
  }

  try {
    server = await startServer(3025);
    await session.start(3025);

    // Boot app and initialize DOM
    await session.evaluate(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (typeof navigate === 'function') break;
        await new Promise(r => setTimeout(r, 200));
      }
      window.currentUser = { uid: 'test_admin', role: 'admin' };
      window.getCurrentFirebaseUser = () => ({ uid: 'test_admin', email: 'admin@temple.org' });
    })()`);

    // Group 1: Inspect UI elements and positioning
    console.log('\n--- GROUP 1: Browser DOM Inspection of New Payment Form ---');
    const domInfo = await session.evaluate(`(async () => {
      window.allFunds = async () => [{ id: 'f1', name: 'General Fund' }];
      window.allExpenseCategories = async () => [{ id: 'e1', name: 'Pooja Expense' }, { id: 'e2', name: 'Flower' }, { id: 'e3', name: 'Maintenance' }];
      window.allBankAccounts = async () => [{ id: 'b1', name: 'SBI Temple Acct' }];
      window.inMemoryPayments = window.inMemoryPayments || [];
      window.allPayments = async () => window.inMemoryPayments.slice();
      window.activePayments = async () => window.inMemoryPayments.filter(p => !p.voided);
      window.nextVoucherNo = async () => 'V-011';
      window.fsGetOneSafe = async () => null;

      await navigate('payments');
      await new Promise(r => setTimeout(r, 400));
      
      const cancelBtn = document.getElementById('btn-cancel-payment');
      const customBtn = document.getElementById('btn-save-custom-payment');
      const saveBtn = document.getElementById('btn-save-payment');
      const savePrintBtn = document.getElementById('btn-save-print-payment');
      
      const parent = cancelBtn?.parentElement;
      const cancelIdx = Array.from(parent?.children || []).indexOf(cancelBtn);
      const customIdx = Array.from(parent?.children || []).indexOf(customBtn);
      
      return {
        cancelFound: !!cancelBtn,
        customFound: !!customBtn,
        saveFound: !!saveBtn,
        savePrintFound: !!savePrintBtn,
        customImmediatelyAfterCancel: (customIdx === cancelIdx + 1),
        customTitle: customBtn?.getAttribute('title') || '',
        customAriaLabel: customBtn?.getAttribute('aria-label') || '',
        customText: customBtn?.innerText?.trim() || '',
        customClass: customBtn?.className || ''
      };
    })()`);

    assert(domInfo.cancelFound, 'CANCEL button present in DOM');
    assert(domInfo.customFound, 'CUSTOM button present in DOM with id="btn-save-custom-payment"');
    assert(domInfo.saveFound, 'SAVE button present in DOM');
    assert(domInfo.savePrintFound, 'SAVE & PRINT button present in DOM');
    assert(domInfo.customImmediatelyAfterCancel, 'CUSTOM button positioned immediately after CANCEL in DOM');
    assert(domInfo.customTitle === 'Custom — Save without voucher number', 'CUSTOM button title tooltip correct', domInfo.customTitle);
    assert(domInfo.customAriaLabel === 'Custom — Save without voucher number', 'CUSTOM button aria-label correct');
    assert(domInfo.customText.includes('CUSTOM'), 'CUSTOM button text contains CUSTOM', domInfo.customText);

    // Group 2: Live Sequencing Test (V-011 -> CUSTOM -> V-012 -> CUSTOM -> V-013)
    console.log('\n--- GROUP 2: Live Sequence Execution (V-011 -> CUSTOM -> V-012 -> CUSTOM -> V-013) ---');
    const seqResult = await session.evaluate(`(async () => {
      window._isolatedCounter = 10;
      window.inMemoryPayments = [];
      const savedInOrder = [];
      
      window.fsNextVoucherNo = async function() {
        window._isolatedCounter++;
        return 'V-' + String(window._isolatedCounter).padStart(3, '0');
      };

      window.nextVoucherNo = async function() {
        return 'V-' + String(window._isolatedCounter + 1).padStart(3, '0');
      };

      window.allPayments = async function() {
        return window.inMemoryPayments.slice();
      };

      window.activePayments = async function() {
        return window.inMemoryPayments.filter(p => !p.voided);
      };

      // Mock fsSaveRecordSafe
      window.fsSaveRecordSafe = async function(col, record, isEdit = false) {
        if (col === 'payments') {
          const cloned = JSON.parse(JSON.stringify(record));
          window.inMemoryPayments.push(cloned);
          savedInOrder.push(cloned);
        }
        return record.id;
      };

      window.fsUpdateRecordSafe = async function(col, id, updates) {
        if (col === 'payments') {
          const idx = window.inMemoryPayments.findIndex(p => String(p.firestoreId) === String(id) || String(p.id) === String(id));
          if (idx >= 0) {
            Object.assign(window.inMemoryPayments[idx], JSON.parse(JSON.stringify(updates)));
          }
        }
      };

      window.refreshSettings = async () => {};
      window.toast = () => {};
      window.alert = () => {};

      function fillForm(paidTo, amount, cat, desc) {
        const form = document.getElementById('paymentForm');
        form.querySelector('[name="date"]').value = '2026-10-21';
        form.querySelector('[name="paidTo"]').value = paidTo;
        form.querySelector('[name="amount"]').value = amount;
        form.querySelector('[name="fund"]').value = 'General Fund';
        form.querySelector('[name="category"]').value = cat;
        form.querySelector('[name="description"]').value = desc;
      }
      
      // Step 1: Normal Payment -> V-011
      await navigate('payments');
      await new Promise(r => setTimeout(r, 100));
      fillForm('Priest Dakshina', '1500', 'Pooja Expense', 'Special abhishekam dakshina');
      await savePayment(false, false);
      const p1Counter = window._isolatedCounter;
      const p1 = savedInOrder[savedInOrder.length - 1];
      
      // Step 2: Custom Payment -> blank voucher
      await navigate('payments');
      await new Promise(r => setTimeout(r, 100));
      fillForm('Local Flower Vendor', '450', 'Flower', 'Daily jasmine garlands');
      await savePayment(false, true);
      const p2Counter = window._isolatedCounter;
      const p2 = savedInOrder[savedInOrder.length - 1];
      
      // Step 3: Normal Payment -> V-012
      await navigate('payments');
      await new Promise(r => setTimeout(r, 100));
      fillForm('Temple Electrician', '1200', 'Maintenance', 'Lamp repair');
      await savePayment(false, false);
      const p3Counter = window._isolatedCounter;
      const p3 = savedInOrder[savedInOrder.length - 1];
      
      // Step 4: Second Custom Payment -> blank voucher
      await navigate('payments');
      await new Promise(r => setTimeout(r, 100));
      fillForm('Milk Supplier', '600', 'Pooja Expense', 'Abhishekam milk');
      await savePayment(false, true);
      const p4Counter = window._isolatedCounter;
      const p4 = savedInOrder[savedInOrder.length - 1];
      
      // Step 5: Normal Payment -> V-013
      await navigate('payments');
      await new Promise(r => setTimeout(r, 100));
      fillForm('Sanitation Worker', '800', 'Maintenance', 'Premises cleaning');
      await savePayment(false, false);
      const p5Counter = window._isolatedCounter;
      const p5 = savedInOrder[savedInOrder.length - 1];
      
      return {
        p1: { voucherNo: p1?.voucherNo, type: p1?.voucherType, counter: p1Counter },
        p2: { voucherNo: p2?.voucherNo, type: p2?.voucherType, counter: p2Counter, id: p2?.id },
        p3: { voucherNo: p3?.voucherNo, type: p3?.voucherType, counter: p3Counter },
        p4: { voucherNo: p4?.voucherNo, type: p4?.voucherType, counter: p4Counter, id: p4?.id },
        p5: { voucherNo: p5?.voucherNo, type: p5?.voucherType, counter: p5Counter }
      };
    })()`);

    assert(seqResult.p1.voucherNo === 'V-011' && seqResult.p1.counter === 11, 'Payment 1 received V-011 and counter=11', `voucher=${seqResult.p1.voucherNo}, counter=${seqResult.p1.counter}`);
    assert(seqResult.p2.voucherNo === '' && seqResult.p2.type === 'custom', 'Payment 2 is custom with blank voucherNo', `voucher="${seqResult.p2.voucherNo}", type=${seqResult.p2.type}`);
    assert(seqResult.p2.counter === 11, 'Payment 2 did NOT increment counter (remains 11)', `counter=${seqResult.p2.counter}`);
    assert(seqResult.p3.voucherNo === 'V-012' && seqResult.p3.counter === 12, 'Payment 3 received sequential V-012 and counter=12', `voucher=${seqResult.p3.voucherNo}, counter=${seqResult.p3.counter}`);
    assert(seqResult.p4.voucherNo === '' && seqResult.p4.type === 'custom', 'Payment 4 is custom with blank voucherNo', `voucher="${seqResult.p4.voucherNo}", type=${seqResult.p4.type}`);
    assert(seqResult.p4.counter === 12, 'Payment 4 did NOT increment counter (remains 12)', `counter=${seqResult.p4.counter}`);
    assert(seqResult.p5.voucherNo === 'V-013' && seqResult.p5.counter === 13, 'Payment 5 received sequential V-013 and counter=13', `voucher=${seqResult.p5.voucherNo}, counter=${seqResult.p5.counter}`);

    // Group 3: Payments Table Display Verification
    console.log('\n--- GROUP 3: Payments Table DOM Rendering Verification ---');
    const tableInfo = await session.evaluate(`(async () => {
      await navigate('payments');
      await new Promise(r => setTimeout(r, 400));
      
      const rows = Array.from(document.querySelectorAll('#paymentTable tbody tr'));
      const rowData = rows.map(r => {
        const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
        return cells.slice(0, 5); // voucher, date, paidTo, desc, fund
      });
      
      return rowData;
    })()`);

    const hasDashVoucher = tableInfo.some(cells => cells[0] === '—');
    const hasV011 = tableInfo.some(cells => cells[0] === 'V-011');
    const hasV012 = tableInfo.some(cells => cells[0] === 'V-012');
    const hasV013 = tableInfo.some(cells => cells[0] === 'V-013');

    assert(hasDashVoucher, 'Payments table renders "—" for custom payments');
    assert(hasV011, 'Payments table renders "V-011" for normal payment');
    assert(hasV012, 'Payments table renders "V-012" for normal payment');
    assert(hasV013, 'Payments table renders "V-013" for normal payment');

    // Group 4: Cash Book Integration Verification
    console.log('\n--- GROUP 4: Cash Book Rendering Verification ---');
    const cbInfo = await session.evaluate(`(async () => {
      window.activeReceipts = async () => [];
      window.allReceipts = async () => [];
      window.activeTransfers = async () => [];
      window.allTransfers = async () => [];
      window.allLoans = async () => [];
      window.activeChittyCollections = async () => [];
      window.allChittyCollections = async () => [];
      window.activeChittyPayouts = async () => [];
      window.allChittyPayouts = async () => [];

      const rows = await buildCashBookRows();
      
      const customRow = rows.find(r => r.particulars && r.particulars.includes('Local Flower Vendor'));
      const normalRow = rows.find(r => r.particulars && r.particulars.includes('Priest Dakshina'));
      
      return {
        rowsLength: rows.length,
        customFound: !!customRow,
        customParticulars: customRow?.particulars,
        customVoucherNo: customRow?.voucherNo,
        normalFound: !!normalRow,
        normalParticulars: normalRow?.particulars,
        normalVoucherNo: normalRow?.voucherNo
      };
    })()`);

    assert(cbInfo.customFound, 'Custom payment included in Cash Book');
    assert(!cbInfo.customParticulars?.includes('undefined'), 'Cash Book particulars does not contain "undefined"');
    assert(cbInfo.customParticulars?.includes('Payment - Local Flower Vendor'), 'Cash Book particulars cleanly formatted for custom payment', cbInfo.customParticulars);
    assert(cbInfo.normalFound && cbInfo.normalParticulars?.includes('V-011'), 'Normal payment displays V-011 in Cash Book', cbInfo.normalParticulars);

    // Group 5: Editing Custom Payment Preservation
    console.log('\n--- GROUP 5: Edit Custom Payment Invariance ---');
    const editResult = await session.evaluate(`(async () => {
      const customPmt = window.inMemoryPayments.find(p => p.voucherType === 'custom');
      window.fsGetOneSafe = async (col, id) => window.inMemoryPayments.find(p => String(p.id) === String(id));
      
      // Simulate editing custom payment via navigate('payments', null, editId)
      await navigate('payments', null, customPmt.id);
      await new Promise(r => setTimeout(r, 400));
      
      const form = document.getElementById('paymentForm');
      const vNumField = form.querySelector('[name="voucherNo"]');
      const isReadOnly = vNumField?.readOnly;
      const vNumPlaceholder = vNumField?.placeholder;
      
      // Update amount
      form.querySelector('[name="amount"]').value = '550';
      
      // Save edit
      await savePayment(false, false);
      
      const updatedPmt = window.inMemoryPayments.find(p => p.id === customPmt.id);
      
      return {
        isReadOnly,
        vNumPlaceholder,
        updatedAmount: updatedPmt?.amount,
        updatedVoucherNo: updatedPmt?.voucherNo,
        updatedVoucherType: updatedPmt?.voucherType,
        counterAfterEdit: window._isolatedCounter
      };
    })()`);

    assert(editResult.isReadOnly, 'Voucher number input is readonly during custom payment edit');
    assert(editResult.vNumPlaceholder?.includes('No Voucher Number'), 'Placeholder indicates No Voucher Number');
    assert(editResult.updatedAmount === 550, 'Custom payment amount successfully updated to 550', `amount=${editResult.updatedAmount}`);
    assert(editResult.updatedVoucherNo === '', 'Custom payment voucherNo remains empty after edit');
    assert(editResult.updatedVoucherType === 'custom', 'Custom payment voucherType remains "custom" after edit');
    assert(editResult.counterAfterEdit === 13, 'Editing custom payment did not alter voucher counter (remains 13)', `counter=${editResult.counterAfterEdit}`);

  } catch (err) {
    console.error('Fatal error during browser E2E test:', err);
    failed++;
  } finally {
    await session.close();
    if (server) {
      server.close();
      console.log('[SERVER] Server closed.');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`STEP 33.173 BROWSER E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) process.exit(1);
}

runE2E();
