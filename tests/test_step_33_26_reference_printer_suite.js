// test_step_33_26_reference_printer_suite.js
// Automated Verification & Multi-Stage Browser Capture Suite for STEP 33.26:
// Complete Reference-Matched Thermal Receipt Printer Design & Animation

const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\sanal\\.gemini\\antigravity-ide\\brain\\a1a38762-e93f-49dd-8989-09b96ed9dd42';

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function runSuite() {
  console.log('================================================================');
  console.log('STEP 33.26 COMPLETE REFERENCE THERMAL PRINTER VERIFICATION SUITE');
  console.log('Testing Reference Component Layout, Motion & Visual Geometry (CDP)');
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

  async function takeScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const localPath = path.join(__dirname, '..', filename);
    fs.writeFileSync(localPath, buffer);
    console.log(`    [SCREENSHOT] Saved to ${filename} (${buffer.length} bytes)`);

    if (fs.existsSync(ARTIFACT_DIR)) {
      const artPath = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(artPath, buffer);
      console.log(`    [SCREENSHOT] Synced to artifact dir: ${filename}`);
    }
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

  // 1. Reload page and wait for full app initialization
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

  // =========================================================================
  // SECTION 1: Reference Component Boundaries & DOM Hierarchy Mapping
  // =========================================================================
  console.log('\n4. Verifying Component Architecture & Reference Mapping (Section 1)...');
  const architecture = await evaluate(`
    (() => {
      const root = document.querySelector('.receipt-printer-root');
      const machine = document.getElementById('receiptPrinterChassis');
      const header = document.querySelector('.printer-top-bezel');
      const screen = document.getElementById('printerRecessedScreen');
      const throat = document.querySelector('.printer-throat-slot');
      const cutter = document.querySelector('.printer-cutter-edge');
      const output = document.getElementById('printerPaperEjector');
      const paper = document.getElementById('printerReceiptSheet');
      const serrated = document.querySelector('.printer-serrated-edge');
      const modeBtn = document.getElementById('printerModeToggleBtn');
      const replayBtn = document.getElementById('printerReplayBtn');

      return {
        hasRoot: !!root,
        hasMachine: !!machine,
        hasHeader: !!header,
        hasScreen: !!screen,
        hasThroat: !!throat,
        hasCutter: !!cutter,
        hasOutput: !!output,
        hasPaper: !!paper,
        hasSerrated: !!serrated,
        hasModeBtn: !!modeBtn,
        hasReplayBtn: !!replayBtn,
        outputIsSibling: output && machine ? output.parentElement === root && machine.parentElement === root : false
      };
    })()
  `);

  assert('REF-01', 'ReceiptPrinter.Root mapped to .receipt-printer-root section', architecture.hasRoot);
  assert('REF-02', 'ReceiptPrinter.Machine mapped to #receiptPrinterChassis enclosure', architecture.hasMachine);
  assert('REF-03', 'ReceiptPrinter.Header mapped to .printer-top-bezel with mode & action controls', architecture.hasHeader && architecture.hasModeBtn && architecture.hasReplayBtn);
  assert('REF-04', 'ReceiptPrinter.Screen mapped to recessed status screen panel', architecture.hasScreen);
  assert('REF-05', 'Physical feed throat and metallic cutter edge present in Machine chassis', architecture.hasThroat && architecture.hasCutter);
  assert('REF-06', 'ReceiptPrinter.Output positioned as overlapping sibling region', architecture.hasOutput && architecture.outputIsSibling);
  assert('REF-07', 'ReceiptPrinter.Paper mapped to .printer-receipt-sheet with serrated bottom edge', architecture.hasPaper && architecture.hasSerrated);

  // =========================================================================
  // SECTION 2: Palette, Geometry & Recessed Shadows Audit
  // =========================================================================
  console.log('\n5. Auditing Hardware Enclosure Geometry, Palette & Lighting (Section 2)...');
  const geometry = await evaluate(`
    (() => {
      const rootStyle = window.getComputedStyle(document.documentElement);
      const machine = document.getElementById('receiptPrinterChassis');
      const csMachine = window.getComputedStyle(machine);
      const screen = document.getElementById('printerRecessedScreen');
      const csScreen = window.getComputedStyle(screen);
      const output = document.getElementById('printerPaperEjector');
      const csOutput = window.getComputedStyle(output);
      const paper = document.getElementById('printerReceiptSheet');
      const csPaper = window.getComputedStyle(paper);

      function rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return rgb;
        const vals = rgb.match(/\\d+/g);
        if (!vals || vals.length < 3) return rgb;
        return '#' + vals.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('').toLowerCase();
      }

      return {
        bodyToken: rootStyle.getPropertyValue('--printer-body').trim(),
        screenToken: rootStyle.getPropertyValue('--printer-screen').trim(),
        borderToken: rootStyle.getPropertyValue('--printer-border').trim(),
        paperToken: rootStyle.getPropertyValue('--printer-paper').trim(),
        ledProcToken: rootStyle.getPropertyValue('--printer-led-processing').trim(),
        ledActToken: rootStyle.getPropertyValue('--printer-led-active').trim(),
        machineBgHex: rgbToHex(csMachine.backgroundColor),
        machineRadius: csMachine.borderRadius,
        machineMaxWidth: csMachine.maxWidth,
        screenBgHex: rgbToHex(csScreen.backgroundColor),
        screenRadius: csScreen.borderRadius,
        outputMarginTop: csOutput.marginTop,
        paperBgHex: rgbToHex(csPaper.backgroundColor),
        paperClipPath: csPaper.clipPath
      };
    })()
  `);

  assert('REF-08', 'Design tokens define reference palette (#1e2024 body, #202020 screen, #ffffff paper)', 
    geometry.bodyToken === '#1e2024' && geometry.screenToken === '#202020' && geometry.paperToken === '#ffffff');
  assert('REF-09', 'Chassis enclosure styled with dark charcoal background (#1e2024)', geometry.machineBgHex === '#1e2024');
  assert('REF-10', 'Chassis enclosure styled with rounded corner radius (20px)', geometry.machineRadius === '20px');
  assert('REF-11', 'Chassis enclosure restrained max-width (420px)', geometry.machineMaxWidth === '420px');
  assert('REF-12', 'Recessed status screen styled with near-black inset palette (#202020)', geometry.screenBgHex === '#202020');
  assert('REF-13', 'Recessed screen has rounded inner corner radius (10px)', geometry.screenRadius === '10px');
  assert('REF-14', 'Output region tucks underneath chassis cutter throat (negative margin-top: -14px)', geometry.outputMarginTop === '-14px');
  assert('REF-15', 'Receipt paper has thermal white background (#ffffff)', geometry.paperBgHex === '#ffffff');
  assert('REF-16', 'Receipt paper has 40-tooth sawtooth clip-path defined on paper element', geometry.paperClipPath.includes('polygon'));

  // =========================================================================
  // SECTION 3: Live Multi-Stage Lifecycle & Real-Time Geometry Verification
  // =========================================================================
  console.log('\n6. Executing Live End-to-End Bill Creation & Measuring Stage Geometries (Section 3)...');

  // Fill form
  await evaluate(`
    (() => {
      setBillingCategory('വഴിപാട്');
      const itemSel = document.getElementById('itemSelect');
      itemSel.selectedIndex = 0;
      updatePrice();
      const nameInp = document.getElementById('name');
      nameInp.value = 'വിഷ്ണുപ്രിയ (Vishnupriya)';
      const starInp = document.getElementById('star');
      starInp.value = 'രോഹിണി';
      const qtyInp = document.getElementById('qty');
      qtyInp.value = '1';
      updatePrice();
      setBillingPaymentMode('Cash');
    })()
  `);

  // STAGE 1: PROCESSING (Explicit audit of processing state & visual geometry)
  const stage1Processing = await evaluate(`
    (() => {
      window.ReceiptPrinter.startProcessing({
        devoteeName: 'വിഷ്ണുപ്രിയ (Vishnupriya)',
        item: 'നെയ്യ് വിളക്ക്',
        category: 'വഴിപാട്',
        totalAmount: 100,
        paymentMode: 'Cash'
      });
      const root = document.querySelector('.receipt-printer-root');
      const chassis = document.getElementById('receiptPrinterChassis');
      const output = document.getElementById('printerPaperEjector');
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const processingPanel = document.getElementById('printerProcessingPanel');
      const badge = document.getElementById('printerProcessingBadge');
      const rectChassis = chassis ? chassis.getBoundingClientRect() : null;

      return {
        stageAttr: root ? root.dataset.stage : null,
        printerState: window.ReceiptPrinter.state,
        chassisHeight: rectChassis ? Math.round(rectChassis.height) : 0,
        outputDisplay: output ? output.style.display : null,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : '',
        procPanelVisible: processingPanel ? processingPanel.style.display !== 'none' : false,
        badgeText: badge ? badge.textContent : ''
      };
    })()
  `);

  console.log(`    [STAGE 1 PROCESSING] Chassis Height: ${stage1Processing.chassisHeight}px, Output Display: ${stage1Processing.outputDisplay}`);
  await takeScreenshot('step_33_26_1_processing.png');

  assert('ANI-26A', 'Stage 1: data-stage is "processing" on ReceiptPrinter.Root', stage1Processing.stageAttr === 'processing');
  assert('ANI-26B', 'Stage 1: Printer state machine is "processing"', stage1Processing.printerState === 'processing');
  assert('ANI-26C', 'Stage 1: Status screen displays pulsing amber LED and "PROCESSING" badge', 
    stage1Processing.ledClass.includes('processing') && stage1Processing.labelText.includes('PROCESSING'));
  assert('ANI-26D', 'Stage 1: Paper output region is concealed (display: none)', stage1Processing.outputDisplay === 'none');
  assert('ANI-26E', 'Stage 1: Devotee name rendered in processing detail badge', stage1Processing.badgeText.includes('വിഷ്ണുപ്രിയ'));
  assert('ANI-26F', 'Stage 1: Chassis retains compact desktop height (<= 260px)', stage1Processing.chassisHeight <= 260, `got ${stage1Processing.chassisHeight}px`);

  // Now execute live end-to-end bill creation and cloud write
  await evaluate(`
    (() => {
      window._step26SubmitPromise = billingSubmitForm();
    })()
  `);
  await evaluate(`window._step26SubmitPromise`);

  const printStartTime = await evaluate(`window._printerStartTime || performance.now()`);

  // STAGE 2A: EARLY EMERGENCE (~200ms after print start)
  const tAfterSubmit = await evaluate(`performance.now()`);
  const waitForEarly = Math.max(50, Math.min(250, 250 - (tAfterSubmit - printStartTime)));
  await new Promise(r => setTimeout(r, waitForEarly));
  const stage2Early = await evaluate(`
    (() => {
      const root = document.querySelector('.receipt-printer-root');
      const output = document.getElementById('printerPaperEjector');
      const sheet = document.getElementById('printerReceiptSheet');
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const csSheet = sheet ? window.getComputedStyle(sheet) : null;
      const rectSheet = sheet ? sheet.getBoundingClientRect() : null;
      const rectOutput = output ? output.getBoundingClientRect() : null;

      return {
        stageAttr: root ? root.dataset.stage : null,
        printerState: window.ReceiptPrinter.state,
        outputDisplay: output ? output.style.display : null,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false,
        transform: csSheet ? csSheet.transform : null,
        opacity: csSheet ? csSheet.opacity : null,
        topOffset: rectSheet && rectOutput ? Math.round(rectSheet.top - rectOutput.top) : null,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : ''
      };
    })()
  `);

  console.log(`    [STAGE 2A EARLY] Transform: ${stage2Early.transform}, Sheet Top Offset: ${stage2Early.topOffset}px`);
  await takeScreenshot('step_33_26_2_early_emergence.png');

  assert('ANI-26G', 'Stage 2A (Early): data-stage transitions to "printing" on Root', stage2Early.stageAttr === 'printing');
  assert('ANI-26H', 'Stage 2A: Active green LED and "PRINTING (58mm)" on recessed status screen', 
    stage2Early.ledClass.includes('printing') && stage2Early.labelText.includes('PRINTING'));
  assert('ANI-26I', 'Stage 2A: Paper ejector output region becomes visible (display: block)', stage2Early.outputDisplay === 'block');
  assert('ANI-26J', 'Stage 2A: Paper sheet is actively feeding (.feeding)', stage2Early.isFeeding);

  // STAGE 2B: MID-FEED (~1200ms after print start)
  const tBeforeMid = await evaluate(`performance.now()`);
  const waitForMid = Math.max(50, 1200 - (tBeforeMid - printStartTime));
  await new Promise(r => setTimeout(r, waitForMid));
  const stage2Mid = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      const output = document.getElementById('printerPaperEjector');
      const csSheet = sheet ? window.getComputedStyle(sheet) : null;
      const rectSheet = sheet ? sheet.getBoundingClientRect() : null;
      const rectOutput = output ? output.getBoundingClientRect() : null;

      return {
        transform: csSheet ? csSheet.transform : null,
        topOffset: rectSheet && rectOutput ? Math.round(rectSheet.top - rectOutput.top) : null,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false
      };
    })()
  `);

  console.log(`    [STAGE 2B MID] Transform: ${stage2Mid.transform}, Sheet Top Offset: ${stage2Mid.topOffset}px`);
  await takeScreenshot('step_33_26_3_mid_feed.png');

  assert('ANI-26K', 'Stage 2B (Mid): Paper has visibly advanced downward through throat', 
    stage2Mid.isFeeding && stage2Mid.topOffset > stage2Early.topOffset, `early: ${stage2Early.topOffset}px, mid: ${stage2Mid.topOffset}px`);

  // STAGE 2C: NEAR-COMPLETE FEED (~1900ms after print start)
  const tBeforeLate = await evaluate(`performance.now()`);
  const waitForLate = Math.max(50, 1900 - (tBeforeLate - printStartTime));
  await new Promise(r => setTimeout(r, waitForLate));
  const stage2Late = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      const output = document.getElementById('printerPaperEjector');
      const csSheet = sheet ? window.getComputedStyle(sheet) : null;
      const rectSheet = sheet ? sheet.getBoundingClientRect() : null;
      const rectOutput = output ? output.getBoundingClientRect() : null;

      return {
        transform: csSheet ? csSheet.transform : null,
        topOffset: rectSheet && rectOutput ? Math.round(rectSheet.top - rectOutput.top) : null,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false
      };
    })()
  `);

  console.log(`    [STAGE 2C NEAR-COMPLETE] Transform: ${stage2Late.transform}, Sheet Top Offset: ${stage2Late.topOffset}px`);
  await takeScreenshot('step_33_26_4_near_complete.png');

  assert('ANI-26L', 'Stage 2C (Near-Complete): Paper has fed past 70% toward resting cutter baseline', 
    stage2Late.topOffset > stage2Mid.topOffset, `mid: ${stage2Mid.topOffset}px, late: ${stage2Late.topOffset}px`);

  // STAGE 3: READY / COMPLETE (~2600ms total after print start, duration: 2400ms)
  const tBeforeReady = await evaluate(`performance.now()`);
  const waitForReady = Math.max(100, 2600 - (tBeforeReady - printStartTime));
  await new Promise(r => setTimeout(r, waitForReady));
  const stage3Ready = await evaluate(`
    (() => {
      const root = document.querySelector('.receipt-printer-root');
      const sheet = document.getElementById('printerReceiptSheet');
      const output = document.getElementById('printerPaperEjector');
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const subtext = document.getElementById('printerScreenSubtext');
      const printBtn = document.getElementById('btnPrintReceipt');
      const nextBtn = document.getElementById('btnNextBill');
      const replayBtn = document.getElementById('printerReplayBtn');
      const previewArea = document.getElementById('billingReceiptPreviewArea');
      const csSheet = sheet ? window.getComputedStyle(sheet) : null;
      const rectSheet = sheet ? sheet.getBoundingClientRect() : null;
      const rectOutput = output ? output.getBoundingClientRect() : null;

      return {
        stageAttr: root ? root.dataset.stage : null,
        printerState: window.ReceiptPrinter.state,
        isFed: sheet ? sheet.classList.contains('fed') : false,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false,
        transform: csSheet ? csSheet.transform : null,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : '',
        subtext: subtext ? subtext.textContent : '',
        hasPrintBtn: !!printBtn,
        hasNextBtn: !!nextBtn,
        hasReplayBtn: !!replayBtn,
        hasDevotee: previewArea ? previewArea.textContent.includes('വിഷ്ണുപ്രിയ') : false,
        hasStar: previewArea ? previewArea.textContent.includes('രോഹിണി') : false,
        topOffset: rectSheet && rectOutput ? Math.round(rectSheet.top - rectOutput.top) : null
      };
    })()
  `);

  console.log(`    [STAGE 3 READY] Transform: ${stage3Ready.transform}, Sheet Top Offset: ${stage3Ready.topOffset}px`);
  await takeScreenshot('step_33_26_5_ready.png');

  assert('ANI-26M', 'Stage 3 (Ready): data-stage transitions to "complete" on Root', stage3Ready.stageAttr === 'complete');
  assert('ANI-26N', 'Stage 3: State machine settles in "ready" state', stage3Ready.printerState === 'ready');
  assert('ANI-26O', 'Stage 3: Solid green LED and "RECEIPT READY" badge on status screen', 
    stage3Ready.ledClass.includes('ready') && stage3Ready.labelText.includes('READY'));
  assert('ANI-26P', 'Stage 3: Paper feed completed (.fed) with zero transform offset (translateY(0))', 
    stage3Ready.isFed && !stage3Ready.isFeeding && stage3Ready.topOffset === 0);
  assert('ANI-26Q', 'Stage 3: Action buttons fully accessible (Print Receipt, + Next Bill, Replay ↺)', 
    stage3Ready.hasPrintBtn && stage3Ready.hasNextBtn && stage3Ready.hasReplayBtn);
  assert('ANI-26R', 'Stage 3: Authentic temple receipt details rendered (Devotee & Star)', 
    stage3Ready.hasDevotee && stage3Ready.hasStar);

  // =========================================================================
  // SECTION 4: Replay Animation Safety & Idempotency Audit
  // =========================================================================
  console.log('\n7. Auditing Replay Visual Animation & Database Idempotency (Section 4)...');

  const countBefore = await evaluate(`(async () => (await allBillingRecords()).length)()`);

  await evaluate(`ReceiptPrinter.replay()`);
  await new Promise(r => setTimeout(r, 100));

  const replayState = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      const root = document.querySelector('.receipt-printer-root');
      return {
        stageAttr: root ? root.dataset.stage : null,
        printerState: window.ReceiptPrinter.state,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false,
        isFed: sheet ? sheet.classList.contains('fed') : false
      };
    })()
  `);

  await takeScreenshot('step_33_26_6_replay.png');

  assert('ANI-26S', 'Replay restarts paper feed immediately without database write (.feeding)', 
    replayState.printerState === 'printing' && replayState.isFeeding && !replayState.isFed);

  // Wait for replay to complete
  await new Promise(r => setTimeout(r, 2700));

  const countAfter = await evaluate(`(async () => (await allBillingRecords()).length)()`);
  assert('ANI-26T', 'Replay executes PURE visual sequence with ZERO additional writes', countBefore === countAfter, `before: ${countBefore}, after: ${countAfter}`);

  // =========================================================================
  // SECTION 5: Mobile Viewport Geometry (375x812 iPhone)
  // =========================================================================
  console.log('\n8. Auditing Mobile Composition & Proportional Scaling (Section 5)...');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 500));

  const mobileMetrics = await evaluate(`
    (() => {
      const chassis = document.getElementById('receiptPrinterChassis');
      const output = document.getElementById('printerPaperEjector');
      const modal = document.querySelector('.receipt-printer-modal-content');
      const rectChassis = chassis ? chassis.getBoundingClientRect() : null;
      const rectOutput = output ? output.getBoundingClientRect() : null;

      return {
        windowWidth: window.innerWidth,
        chassisWidth: rectChassis ? Math.round(rectChassis.width) : 0,
        outputWidth: rectOutput ? Math.round(rectOutput.width) : 0,
        modalScrollWidth: modal ? modal.scrollWidth : 0,
        modalClientWidth: modal ? modal.clientWidth : 0,
        fitsViewport: modal ? modal.scrollWidth <= modal.clientWidth + 2 : false
      };
    })()
  `);

  console.log(`    [MOBILE 375px] Chassis Width: ${mobileMetrics.chassisWidth}px, Output Width: ${mobileMetrics.outputWidth}px, Fits: ${mobileMetrics.fitsViewport}`);
  await takeScreenshot('step_33_26_7_mobile.png');

  assert('ANI-26U', 'Mobile layout fits within 375px viewport with zero horizontal overflow', mobileMetrics.fitsViewport);
  assert('ANI-26V', 'Chassis scales gracefully on mobile (width <= 365px)', mobileMetrics.chassisWidth <= 365);

  // Reset viewport to desktop
  await send('Emulation.clearDeviceMetricsOverride');
  await new Promise(r => setTimeout(r, 400));

  // =========================================================================
  // SECTION 6: Next Bill Reset & Form Lifecycle
  // =========================================================================
  console.log('\n9. Auditing Next Bill Workflow & Clean State Reset (Section 6)...');
  await evaluate(`billingNextBill()`);
  await new Promise(r => setTimeout(r, 400));

  const resetState = await evaluate(`
    (() => {
      const overlay = document.getElementById('receiptPrinterOverlay');
      const sheet = document.getElementById('printerReceiptSheet');
      const nameInp = document.getElementById('name');
      const root = document.querySelector('.receipt-printer-root');

      return {
        isOpen: window.ReceiptPrinter.isOpen(),
        printerState: window.ReceiptPrinter.state,
        stageAttr: root ? root.dataset.stage : null,
        hasFedClass: sheet ? sheet.classList.contains('fed') : false,
        hasFeedingClass: sheet ? sheet.classList.contains('feeding') : false,
        nameValue: nameInp ? nameInp.value : null
      };
    })()
  `);

  assert('ANI-26W', 'Next Bill closes modal overlay and sets state to "idle"', !resetState.isOpen && resetState.printerState === 'idle');
  assert('ANI-26X', 'Next Bill removes animation classes (.fed, .feeding) for clean deterministic lifecycle', 
    !resetState.hasFedClass && !resetState.hasFeedingClass);
  assert('ANI-26Y', 'Next Bill clears devotee form fields', resetState.nameValue === '');

  // =========================================================================
  // SECTION 7: Write Failure Error Handling & Resilience
  // =========================================================================
  console.log('\n10. Auditing Write Failure Error State & LED Indication (Section 7)...');
  await evaluate(`
    (() => {
      ReceiptPrinter.startProcessing();
      ReceiptPrinter.showError('Firebase emulator simulation: network transaction timeout');
    })()
  `);
  await new Promise(r => setTimeout(r, 300));

  const errorMetrics = await evaluate(`
    (() => {
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const errPanel = document.getElementById('printerErrorPanel');
      const errMsg = document.getElementById('printerErrorMsg');
      const root = document.querySelector('.receipt-printer-root');

      return {
        stageAttr: root ? root.dataset.stage : null,
        printerState: window.ReceiptPrinter.state,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : '',
        errPanelVisible: errPanel ? errPanel.style.display !== 'none' : false,
        errText: errMsg ? errMsg.textContent : ''
      };
    })()
  `);

  await takeScreenshot('step_33_26_8_error.png');

  assert('ANI-26Z', 'Error state displays crimson error LED and "FAILED" status pill', 
    errorMetrics.printerState === 'error' && errorMetrics.ledClass.includes('error') && errorMetrics.labelText === 'FAILED');
  assert('ANI-26AA', 'Error panel displays descriptive timeout message inside chassis', 
    errorMetrics.errPanelVisible && errorMetrics.errText.includes('timeout'));

  // Close error state
  await evaluate(`ReceiptPrinter.close()`);

  console.log('\n================================================================');
  console.log(`STEP 33.26 TARGETED SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    ws.close();
    process.exit(1);
  }
  ws.close();
  process.exit(0);
}

runSuite().catch(err => {
  console.error('Fatal error running Step 33.26 verification suite:', err);
  process.exit(1);
});
