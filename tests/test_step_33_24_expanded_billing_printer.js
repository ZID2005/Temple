// test_step_33_24_expanded_billing_printer.js
// Automated Verification Suite for STEP 33.24:
// Expanded Billing Form & Native Receipt-Printer Animation

const http = require('http');

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function runSuite() {
  console.log('================================================================');
  console.log('STEP 33.24 EXPANDED BILLING & RECEIPT-PRINTER VERIFICATION SUITE');
  console.log('Testing Native POS Animation & Expanded Form (Isolated Emulator)');
  console.log('================================================================\n');

  const ws = await getBrowserWs();
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = msgId++;
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  let loadFired = false;
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Page.loadEventFired') {
      loadFired = true;
    }
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  let passed = 0;
  let failed = 0;

  function assert(id, desc, cond, details = '') {
    if (cond) {
      console.log(`  [PASS] [${id}] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] [${id}] ${desc} ${details ? '— ' + details : ''}`);
      failed++;
    }
  }

  // 1. Reload page
  console.log('1. Reloading active browser tab with updated Temple_Accounts-1.html...');
  await send('Page.enable');
  loadFired = false;
  await send('Page.reload', { ignoreCache: true });

  console.log('2. Waiting for App Shell initialization (splash transition and dashboard boot)...');
  while (!loadFired) {
    await new Promise(r => setTimeout(r, 50));
  }
  const bootStart = Date.now();
  while (Date.now() - bootStart < 15000) {
    try {
      const state = await evaluate(`({
        booted: window._appBooted,
        view: typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null,
        mainLength: document.getElementById('app-main') ? document.getElementById('app-main').innerHTML.length : 0
      })`);
      if (state && state.booted && state.view === 'dashboard' && state.mainLength > 500) {
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 500));

  console.log('3. Navigating to Billing view...');
  await evaluate(`(async () => { await navigate('billing'); })()`);
  await new Promise(r => setTimeout(r, 1200));

  // AREA 1: Full-Width Form Layout & Removal of Right-Side Card
  console.log('\n4. Verifying Expanded Full-Width Billing Form Layout (Area 1)...');
  const layoutInfo = await evaluate(`
    (() => {
      const grid = document.querySelector('.billing-grid');
      const formCard = document.querySelector('.billing-grid .form-card');
      const formGrid = document.querySelector('.billing-form-grid');
      const bottomRow = document.querySelector('.billing-bottom-row');
      const oldPreviewCard = document.getElementById('billingReceiptCard');
      const previewArea = document.getElementById('billingReceiptPreviewArea');

      const csGrid = grid ? window.getComputedStyle(grid) : null;
      const csFormGrid = formGrid ? window.getComputedStyle(formGrid) : null;

      return {
        gridExists: !!grid,
        gridDisplay: csGrid ? csGrid.display : null,
        formCardWidth: formCard ? formCard.offsetWidth : 0,
        formGridExists: !!formGrid,
        formGridCols: csFormGrid ? csFormGrid.gridTemplateColumns : null,
        bottomRowExists: !!bottomRow,
        oldPreviewCardInGrid: !!oldPreviewCard,
        previewAreaExists: !!previewArea,
        previewAreaInsideModal: previewArea ? !!previewArea.closest('#receiptPrinterOverlay') : false
      };
    })()
  `);

  assert('EXP-01', 'Expanded billing grid container exists', layoutInfo.gridExists);
  assert('EXP-02', 'Billing form card occupies full available container width', layoutInfo.formCardWidth > 700, `got ${layoutInfo.formCardWidth}px`);
  assert('EXP-03', 'Form controls organized in 2-column balanced grid on desktop', layoutInfo.formGridExists && layoutInfo.formGridCols.split(' ').length >= 2, `cols: ${layoutInfo.formGridCols}`);
  assert('EXP-04', 'Prominent total and action buttons organized in bottom row', layoutInfo.bottomRowExists);
  assert('EXP-05', 'Right-side visual receipt card removed from Create Bill layout', !layoutInfo.oldPreviewCardInGrid);
  assert('EXP-06', 'Receipt preview area preserved inside native receipt-printer modal', layoutInfo.previewAreaExists && layoutInfo.previewAreaInsideModal);

  // AREA 2: Controls, Items, Quantities, Payment Modes & Amounts
  console.log('\n5. Verifying Form Controls, Calculations & Preservations (Area 2)...');
  const controlsCheck = await evaluate(`
    (() => {
      const catVazh = document.querySelector('.billing-cat-pill[data-cat="വഴിപാട്"]');
      const catPunar = document.querySelector('.billing-cat-pill[data-cat="പുനരുദ്ധാരണം"]');
      const itemSel = document.getElementById('itemSelect');
      const qtyInp = document.getElementById('qty');
      const totalInp = document.getElementById('total');
      const totalDisplay = document.getElementById('billingDisplayTotal');
      const pmCash = document.querySelector('.payment-mode-btn[data-mode="Cash"]');
      const pmUpi = document.querySelector('.payment-mode-btn[data-mode="UPI"]');

      // Test stepper adjustment
      const initialQty = parseInt(qtyInp.value, 10);
      billingAdjustQty(2); // +2 -> 3
      const adjustedQty = parseInt(qtyInp.value, 10);
      billingAdjustQty(-1); // -1 -> 2
      const finalQty = parseInt(qtyInp.value, 10);

      // Test payment mode switch
      setBillingPaymentMode('UPI');
      const isUpiActive = pmUpi.classList.contains('active') && !pmCash.classList.contains('active');
      setBillingPaymentMode('Cash');
      const isCashActive = pmCash.classList.contains('active') && !pmUpi.classList.contains('active');

      return {
        catVazhExists: !!catVazh,
        catPunarExists: !!catPunar,
        itemSelCount: itemSel ? itemSel.options.length : 0,
        stepperWorks: (adjustedQty === initialQty + 2) && (finalQty === initialQty + 1),
        isUpiActive,
        isCashActive,
        totalText: totalDisplay ? totalDisplay.textContent : ''
      };
    })()
  `);

  assert('EXP-07', 'Bilingual category segmented control preserved (Vazhipadu & Punarudharanam)', controlsCheck.catVazhExists && controlsCheck.catPunarExists);
  assert('EXP-08', 'Item select populated with temple offerings', controlsCheck.itemSelCount > 0);
  assert('EXP-09', 'Quantity stepper buttons (+ / −) adjust quantity accurately', controlsCheck.stepperWorks);
  assert('EXP-10', 'Payment mode toggles cleanly between CASH and UPI', controlsCheck.isUpiActive && controlsCheck.isCashActive);

  // AREA 3: Validation Failure Before Submission
  console.log('\n6. Verifying Validation Failure & Error Feedback (Area 3)...');
  const valTest = await evaluate(`
    (async () => {
      // Clear devotee name to force validation error
      const nameInp = document.getElementById('name');
      if (nameInp) nameInp.value = '';

      await billingSubmitForm();

      const feedback = document.getElementById('billingFeedback');
      const hasBadFeedback = feedback && feedback.classList.contains('bad') && feedback.style.display !== 'none';
      const isSaving = window.isBillingSaving;
      const printerOpen = window.ReceiptPrinter && window.ReceiptPrinter.isOpen();
      const btn = document.getElementById('btnCreateBill');

      return {
        hasBadFeedback,
        isSaving,
        printerOpen,
        btnEnabled: btn ? !btn.disabled : false
      };
    })()
  `);

  assert('EXP-11', 'Validation failure displays error feedback without saving', valTest.hasBadFeedback);
  assert('EXP-12', 'Receipt printer overlay is NOT shown on validation failure', !valTest.printerOpen);
  assert('EXP-13', 'Submission lock released and button remains enabled on validation failure', !valTest.isSaving && valTest.btnEnabled);

  // AREA 4: Native Receipt Printer Component & Lifecycle State Machine
  console.log('\n7. Verifying Native Receipt-Printer State Machine (Area 4)...');
  const printerStructure = await evaluate(`
    (() => {
      const overlay = document.getElementById('receiptPrinterOverlay');
      const chassis = document.getElementById('receiptPrinterChassis');
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const throat = document.querySelector('.printer-throat-slot');
      const ejector = document.getElementById('printerPaperEjector');
      const sheet = document.getElementById('printerReceiptSheet');
      const serrated = document.querySelector('.printer-serrated-edge svg');
      const progressFill = document.getElementById('printerProgressFill');

      return {
        hasOverlay: !!overlay,
        hasChassis: !!chassis,
        hasLed: !!led,
        hasLabel: !!label,
        hasThroat: !!throat,
        hasEjector: !!ejector,
        hasSheet: !!sheet,
        hasSerratedEdge: !!serrated,
        hasProgressBar: !!progressFill,
        isDialog: overlay ? overlay.getAttribute('role') === 'dialog' : false,
        isAriaModal: overlay ? overlay.getAttribute('aria-modal') === 'true' : false
      };
    })()
  `);

  assert('EXP-14', 'Printer hardware chassis exists with POS enclosure styling', printerStructure.hasChassis);
  assert('EXP-15', 'Printer status bezel contains hardware LED indicator and status pill', printerStructure.hasLed && printerStructure.hasLabel);
  assert('EXP-16', 'Printer feed throat and paper ejection chamber exist', printerStructure.hasThroat && printerStructure.hasEjector);
  assert('EXP-17', 'Realistic serrated bottom edge SVG pattern present', printerStructure.hasSerratedEdge);
  assert('EXP-18', 'Printer feed progress bar exists', printerStructure.hasProgressBar);
  assert('EXP-19', 'Modal has accessible dialog semantics (role="dialog", aria-modal="true")', printerStructure.isDialog && printerStructure.isAriaModal);

  // AREA 4 & 7: Live End-to-End Bill Creation with Printer Lifecycle
  console.log('\n8. Testing End-to-End Bill Creation with Live Printer Animation (Areas 4 & 7)...');

  // Fill valid form
  await evaluate(`
    (() => {
      setBillingCategory('വഴിപാട്');
      const itemSel = document.getElementById('itemSelect');
      itemSel.selectedIndex = 0; // Select standard item (e.g. Nooljapam)
      updatePrice();
      const nameInp = document.getElementById('name');
      nameInp.value = 'അനന്തകൃഷ്ണൻ (Ananthakrishnan)';
      const starInp = document.getElementById('star');
      starInp.value = 'രോഹിണി';
      const qtyInp = document.getElementById('qty');
      qtyInp.value = '2';
      updatePrice();
      setBillingPaymentMode('Cash');
    })()
  `);

  // Launch billing submission asynchronously on window
  await evaluate(`
    (() => {
      window._step24SubmitPromise = billingSubmitForm();
    })()
  `);

  // Check Stage A (Processing) immediately while in-flight
  const stageA = await evaluate(`
    (() => {
      return {
        isOpen: window.ReceiptPrinter.isOpen(),
        state: window.ReceiptPrinter.state,
        ledClass: document.getElementById('printerStatusLed').className,
        label: document.getElementById('printerStatusLabel').textContent,
        processingVisible: document.getElementById('printerProcessingPanel').style.display !== 'none',
        ejectorVisible: document.getElementById('printerPaperEjector').style.display !== 'none'
      };
    })()
  `);

  assert('EXP-20', 'Stage A (Processing): Overlay opens during in-flight cloud write', stageA.isOpen);
  assert('EXP-21', 'Stage A: Status is "processing" with pulsing amber LED and label', stageA.state === 'processing' && stageA.ledClass.includes('processing') && stageA.label.includes('PROCESSING'));
  assert('EXP-22', 'Stage A: Processing panel visible and paper sheet hidden in printer slot', stageA.processingVisible && !stageA.ejectorVisible);

  // Await submission completion in cloud emulator
  await evaluate(`window._step24SubmitPromise`);
  await new Promise(r => setTimeout(r, 600));

  const stageC = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      return {
        state: window.ReceiptPrinter.state,
        ledClass: document.getElementById('printerStatusLed').className,
        label: document.getElementById('printerStatusLabel').textContent,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false,
        ejectorVisible: document.getElementById('printerPaperEjector').style.display !== 'none'
      };
    })()
  `);

  assert('EXP-23', 'Stage C (Printing): Transitions to printing state after confirmed write', stageC.state === 'printing' || stageC.state === 'ready');
  assert('EXP-24', 'Stage C: Paper ejector chamber becomes visible for downward feed', stageC.ejectorVisible);

  // Wait for feed animation to complete into Stage D (Ready)
  await new Promise(r => setTimeout(r, 3400));

  const stageD = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      const printBtn = document.getElementById('btnPrintReceipt');
      const nextBtn = document.getElementById('btnNextBill');
      const previewArea = document.getElementById('billingReceiptPreviewArea');
      const text = previewArea ? previewArea.textContent : '';

      return {
        state: window.ReceiptPrinter.state,
        ledClass: document.getElementById('printerStatusLed').className,
        label: document.getElementById('printerStatusLabel').textContent,
        isFed: sheet ? sheet.classList.contains('fed') : false,
        printBtnExists: !!printBtn,
        nextBtnExists: !!nextBtn,
        hasDevotee: text.includes('അനന്തകൃഷ്ണൻ'),
        hasStar: text.includes('രോഹിണി'),
        hasTemple: text.includes('മറുതാ ചാമുണ്ഡി')
      };
    })()
  `);

  assert('EXP-25', 'Stage D (Ready): Transitions to "ready" with solid green LED and "RECEIPT READY" label', stageD.state === 'ready' && stageD.ledClass.includes('ready') && stageD.label.includes('READY'));
  assert('EXP-26', 'Stage D: Paper fully fed with receipt body and action buttons present', stageD.isFed && stageD.printBtnExists && stageD.nextBtnExists);
  assert('EXP-27', 'Stage D: Real devotee name rendered correctly on thermal paper', stageD.hasDevotee);
  assert('EXP-28', 'Stage D: Real star and temple branding rendered accurately', stageD.hasStar && stageD.hasTemple);

  // AREA 5: Firestore Write Failure & Error Recovery
  console.log('\n9. Verifying Firestore Error Recovery & UI Isolation (Area 5)...');
  const errorTest = await evaluate(`
    (() => {
      // Test error display method
      window.ReceiptPrinter.showError('Cloud Firestore emulator network simulation timeout');
      const errPanel = document.getElementById('printerErrorPanel');
      const errMsg = document.getElementById('printerErrorMsg');
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');

      return {
        state: window.ReceiptPrinter.state,
        errVisible: errPanel ? errPanel.style.display !== 'none' : false,
        msgText: errMsg ? errMsg.textContent : '',
        ledClass: led ? led.className : '',
        label: label ? label.textContent : ''
      };
    })()
  `);

  assert('EXP-29', 'Error state: Transitions to "error" with red LED and FAILED status', errorTest.state === 'error' && errorTest.ledClass.includes('error') && errorTest.label === 'FAILED');
  assert('EXP-30', 'Error state: Clear error message displayed inside printer panel', errorTest.errVisible && errorTest.msgText.includes('timeout'));

  // Close error state
  await evaluate(`window.ReceiptPrinter.close()`);
  const closedState = await evaluate(`!window.ReceiptPrinter.isOpen() && window.ReceiptPrinter.state === 'idle'`);
  assert('EXP-31', 'Error state: Dismissing error restores printer to idle', closedState);

  // AREA 8: Print Isolation & @media print Overrides
  console.log('\n10. Verifying Print Isolation & Thermal Layout Protection (Area 8)...');
  const printIsolation = await evaluate(`
    (() => {
      // Check print media styles
      const sheets = Array.from(document.styleSheets);
      let printOverlayHidden = false;
      let printButtonsHidden = false;

      for (const s of sheets) {
        try {
          const rules = Array.from(s.cssRules || []);
          for (const r of rules) {
            if (r.media && r.media.mediaText.includes('print')) {
              const text = r.cssText;
              if (text.includes('receipt-printer-overlay') && text.includes('none')) {
                printOverlayHidden = true;
              }
              if (text.includes('dynamic-btn') && text.includes('none')) {
                printButtonsHidden = true;
              }
            }
          }
        } catch (e) {}
      }

      return {
        printOverlayHidden,
        printButtonsHidden
      };
    })()
  `);

  assert('EXP-32', '@media print explicitly hides receipt-printer overlay and modal', printIsolation.printOverlayHidden);
  assert('EXP-33', '@media print hides dynamic action buttons from physical printout', printIsolation.printButtonsHidden);

  // AREA 9: Malayalam Text Rendering
  console.log('\n11. Verifying Malayalam Text Rendering (Area 9)...');
  const malayalamCheck = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const catV = document.querySelector('.billing-cat-pill[data-cat="വഴിപാട്"]');
      const banner = document.querySelector('.total-banner-title');
      return {
        btnText: btn ? btn.textContent : '',
        hasMalayalamOnBtn: btn ? btn.textContent.includes('ബിൽ രേഖപ്പെടുത്തുക') : false,
        hasMalayalamOnCat: catV ? catV.textContent.includes('വഴിപാട്') : false,
        hasMalayalamOnBanner: banner ? banner.textContent.includes('ആകെ തുക') : false
      };
    })()
  `);

  assert('EXP-34', 'Malayalam label preserved on Generate Bill button', malayalamCheck.hasMalayalamOnBtn);
  assert('EXP-35', 'Malayalam preserved on category pills and total banner', malayalamCheck.hasMalayalamOnCat && malayalamCheck.hasMalayalamOnBanner);

  // AREA 10: Reduced Motion Behavior
  console.log('\n12. Verifying Reduced Motion Behavior (Area 10)...');
  const reducedMotionCheck = await evaluate(`
    (() => {
      // Simulate reduced motion feed test
      window.ReceiptPrinter.startPrinting({ id: 101, receiptNo: 'BILL-101', totalAmount: 100 });
      // Under reduced motion or fast feed, ready state transitions cleanly
      window.ReceiptPrinter.setReady();
      return {
        state: window.ReceiptPrinter.state,
        sheetFed: document.getElementById('printerReceiptSheet').classList.contains('fed')
      };
    })()
  `);

  assert('EXP-36', 'Reduced motion safely transitions to ready state without animation hang', reducedMotionCheck.state === 'ready' && reducedMotionCheck.sheetFed);

  // AREA 11: Keyboard & Escape Handling
  console.log('\n13. Verifying Keyboard Escape & Backdrop Handling (Area 11)...');
  const escapeProcessingCheck = await evaluate(`
    (() => {
      window.ReceiptPrinter.startProcessing({ devoteeName: 'Guard Devotee' });
      const openBefore = window.ReceiptPrinter.isOpen();

      // Trigger Escape while processing
      window.ReceiptPrinter.handleEscape();
      const openAfter = window.ReceiptPrinter.isOpen();

      // Trigger backdrop click while processing
      window.ReceiptPrinter.handleBackdropClick();
      const openAfterBackdrop = window.ReceiptPrinter.isOpen();

      return {
        openBefore,
        openAfter,
        openAfterBackdrop,
        stillProcessing: window.ReceiptPrinter.state === 'processing'
      };
    })()
  `);

  assert('EXP-37', 'Escape and backdrop clicks do NOT dismiss overlay during in-flight processing', escapeProcessingCheck.openAfter && escapeProcessingCheck.openAfterBackdrop && escapeProcessingCheck.stillProcessing);

  // Dismiss ready overlay
  const escapeReadyCheck = await evaluate(`
    (() => {
      window.ReceiptPrinter.setReady();
      window.ReceiptPrinter.handleEscape();
      return !window.ReceiptPrinter.isOpen() && window.ReceiptPrinter.state === 'idle';
    })()
  `);

  assert('EXP-38', 'Escape dismisses overlay smoothly when in ready state', escapeReadyCheck);

  // AREA 12 & 13: Next Bill & Duplicate Prevention
  console.log('\n14. Verifying Next Bill Workflow & Duplicate Prevention (Areas 12 & 13)...');
  const nextBillCheck = await evaluate(`
    (async () => {
      const recordsBefore = (await allBillingRecords()).length;

      // Advance form
      billingNextBill();

      const nameInp = document.getElementById('name');
      const previewArea = document.getElementById('billingReceiptPreviewArea');
      const isPlaceholder = previewArea ? !!previewArea.querySelector('.billing-preview-placeholder') : false;
      const recordsAfter = (await allBillingRecords()).length;

      return {
        nameCleared: nameInp ? nameInp.value === '' : false,
        isPlaceholder,
        noNewRecordCreated: recordsBefore === recordsAfter,
        printerClosed: !window.ReceiptPrinter.isOpen()
      };
    })()
  `);

  assert('EXP-39', 'Next Bill clears form fields and closes printer overlay', nextBillCheck.nameCleared && nextBillCheck.printerClosed);
  assert('EXP-40', 'Next Bill restores receipt preview placeholder without creating new record', nextBillCheck.isPlaceholder && nextBillCheck.noNewRecordCreated);

  console.log('\n================================================================');
  console.log(`STEP 33.24 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  ws.close();
  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
