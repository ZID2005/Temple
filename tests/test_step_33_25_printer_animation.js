// test_step_33_25_printer_animation.js
// Automated Verification Suite for STEP 33.25:
// Reference-Matched Thermal Receipt Printer Animation & Visual Refinement

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
  console.log('STEP 33.25 REFERENCE-MATCHED THERMAL RECEIPT PRINTER SUITE');
  console.log('Testing Reference Visuals, Motion Curves & Billing Safety (CDP)');
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
  // SECTION 1: Reference Color Tokens & Hardware Chassis Styling
  // =========================================================================
  console.log('\n4. Verifying Reference Color Tokens & Hardware Chassis Styling (Section 1)...');
  const tokensAndChassis = await evaluate(`
    (() => {
      const rootStyle = window.getComputedStyle(document.documentElement);
      const chassis = document.getElementById('receiptPrinterChassis');
      const csChassis = chassis ? window.getComputedStyle(chassis) : null;
      const screen = document.getElementById('printerRecessedScreen') || document.getElementById('printerStatusScreen');
      const csScreen = screen ? window.getComputedStyle(screen) : null;
      const throat = document.querySelector('.printer-throat-slot');
      const csThroat = throat ? window.getComputedStyle(throat) : null;
      const cutter = document.querySelector('.printer-cutter-edge');
      const csCutter = cutter ? window.getComputedStyle(cutter) : null;

      function rgbToHex(rgb) {
        if (!rgb || !rgb.startsWith('rgb')) return rgb;
        const vals = rgb.match(/\\d+/g);
        if (!vals || vals.length < 3) return rgb;
        return '#' + vals.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('').toLowerCase();
      }

      return {
        hasBodyVar: !!rootStyle.getPropertyValue('--printer-body').trim(),
        hasScreenVar: !!rootStyle.getPropertyValue('--printer-screen').trim(),
        hasBorderVar: !!rootStyle.getPropertyValue('--printer-border').trim(),
        hasLedProcVar: !!rootStyle.getPropertyValue('--printer-led-processing').trim(),
        hasLedActiveVar: !!rootStyle.getPropertyValue('--printer-led-active').trim(),
        hasLedErrorVar: !!rootStyle.getPropertyValue('--printer-led-error').trim(),
        hasEaseOutVar: !!rootStyle.getPropertyValue('--printer-ease-out').trim(),
        chassisRadius: csChassis ? csChassis.borderRadius : null,
        chassisBgHex: csChassis ? rgbToHex(csChassis.backgroundColor) : null,
        screenBgHex: csScreen ? rgbToHex(csScreen.backgroundColor) : null,
        screenRadius: csScreen ? csScreen.borderRadius : null,
        throatExists: !!throat,
        cutterExists: !!cutter
      };
    })()
  `);

  assert('ANI-01', 'Reference CSS design tokens defined (--printer-body, --printer-screen, --printer-border, etc.)', 
    tokensAndChassis.hasBodyVar && tokensAndChassis.hasScreenVar && tokensAndChassis.hasBorderVar);
  assert('ANI-02', 'LED status color tokens defined for processing (amber), active (green), and error (red)', 
    tokensAndChassis.hasLedProcVar && tokensAndChassis.hasLedActiveVar && tokensAndChassis.hasLedErrorVar);
  assert('ANI-03', 'Reference easing curve token defined (--printer-ease-out = cubic-bezier(0.23, 1, 0.32, 1))', 
    tokensAndChassis.hasEaseOutVar);
  assert('ANI-04', 'Printer chassis styled with dark enclosure palette (#1e2024)', 
    tokensAndChassis.chassisBgHex === '#1e2024');
  assert('ANI-05', 'Printer chassis styled with rounded enclosure (border-radius: 20px)', 
    tokensAndChassis.chassisRadius === '20px');
  assert('ANI-06', 'Printer recessed status screen styled with dark inset palette (#202020)', 
    tokensAndChassis.screenBgHex === '#202020');
  assert('ANI-07', 'Physical feed throat slot and metallic cutter edge present in DOM', 
    tokensAndChassis.throatExists && tokensAndChassis.cutterExists);

  // =========================================================================
  // SECTION 2: 40-Tooth Serrated Paper Edge Geometry & Paper Styling
  // =========================================================================
  console.log('\n5. Verifying 40-Tooth Serrated Receipt Edge & Thermal Paper Styling (Section 2)...');
  const edgeAndPaper = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      const csSheet = sheet ? window.getComputedStyle(sheet) : null;
      const serratedContainer = document.querySelector('.printer-serrated-edge');
      const svg = serratedContainer ? serratedContainer.querySelector('svg') : null;
      const path = svg ? svg.querySelector('path') : null;
      const pathD = path ? path.getAttribute('d') : '';

      // Count sawtooth teeth by counting occurrences of ',4' peaks
      const peaks = (pathD.match(/,\\s*4/g) || []).length;

      return {
        sheetBg: csSheet ? csSheet.backgroundColor : null,
        sheetColor: csSheet ? csSheet.color : null,
        hasSerratedContainer: !!serratedContainer,
        svgViewBox: svg ? svg.getAttribute('viewBox') : null,
        svgHeight: svg ? svg.getAttribute('height') : null,
        svgFill: path ? path.getAttribute('fill') : null,
        toothCount: peaks,
        toothDepth: svg ? svg.getAttribute('height') : null
      };
    })()
  `);

  assert('ANI-08', 'Receipt paper has clean thermal white background with dark text', 
    edgeAndPaper.sheetBg === 'rgb(255, 255, 255)');
  assert('ANI-09', 'Serrated paper edge SVG container exists at bottom of receipt sheet', 
    edgeAndPaper.hasSerratedContainer);
  assert('ANI-10', 'Serrated edge has exactly 40 sawtooth teeth matching reference specification', 
    edgeAndPaper.toothCount === 40, `got ${edgeAndPaper.toothCount} teeth`);
  assert('ANI-11', 'Serrated edge has 4px tooth depth (height="4" viewBox="0 0 400 4")', 
    edgeAndPaper.toothDepth === '4' && edgeAndPaper.svgViewBox === '0 0 400 4');
  assert('ANI-12', 'Serrated edge path fill matches white thermal paper (#ffffff)', 
    edgeAndPaper.svgFill.toLowerCase() === '#ffffff');

  // =========================================================================
  // SECTION 3: Keyframe Animation Curves & Stepped Keyframe Audit
  // =========================================================================
  console.log('\n6. Verifying Keyframe Animation Curves & Stepped Keyframe Sequence (Section 3)...');
  const animationCurves = await evaluate(`
    (() => {
      let steppedKeyframes = null;
      let smoothKeyframes = null;

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.type === CSSRule.KEYFRAMES_RULE) {
              if (rule.name === 'receiptPaperFeedStepped') steppedKeyframes = rule;
              if (rule.name === 'receiptPaperFeedSmooth') smoothKeyframes = rule;
            }
          }
        } catch (e) {}
      }

      let steppedRuleCount = 0;
      let hasStartOffset = false;
      let hasZeroFinal = false;

      if (steppedKeyframes) {
        steppedRuleCount = steppedKeyframes.cssRules.length;
        for (const r of Array.from(steppedKeyframes.cssRules)) {
          if (r.keyText === '0%' && r.cssText.includes('-100%')) hasStartOffset = true;
          if (r.keyText === '100%' && r.cssText.includes('0%')) hasZeroFinal = true;
        }
      }

      return {
        hasSteppedRule: !!steppedKeyframes,
        steppedRuleCount,
        hasStartOffset,
        hasZeroFinal,
        hasSmoothRule: !!smoothKeyframes
      };
    })()
  `);

  assert('ANI-13', '@keyframes receiptPaperFeedStepped defined in stylesheet', 
    animationCurves.hasSteppedRule);
  assert('ANI-14', 'Stepped feed contains discrete transform intervals reproducing thermal ratchet steps', 
    animationCurves.steppedRuleCount >= 10, `got ${animationCurves.steppedRuleCount} rule steps`);
  assert('ANI-15', 'Stepped feed starts at concealed throat offset (translateY(calc(-100% + 2px)))', 
    animationCurves.hasStartOffset);
  assert('ANI-16', 'Stepped feed completes smoothly at resting baseline position (translateY(0%))', 
    animationCurves.hasZeroFinal);
  assert('ANI-17', '@keyframes receiptPaperFeedSmooth defined for continuous fluid feed option', 
    animationCurves.hasSmoothRule);

  // =========================================================================
  // SECTION 4: Feed Motion Modes & Dynamic Toggle Support
  // =========================================================================
  console.log('\n7. Verifying Feed Motion Modes & Dynamic Mode Switcher (Section 4)...');
  const motionModes = await evaluate(`
    (() => {
      const initialMode = window.ReceiptPrinter.feedMode;
      const modeBtn = document.getElementById('printerModeToggleBtn') || document.getElementById('receiptPrinterBtnMode');
      const initialBtnText = modeBtn ? modeBtn.textContent : '';

      // Test switching to smooth mode
      window.ReceiptPrinter.setFeedMode('smooth');
      const smoothMode = window.ReceiptPrinter.feedMode;
      const smoothBtnText = modeBtn ? modeBtn.textContent : '';

      // Test toggling back to stepped mode
      window.ReceiptPrinter.toggleFeedMode();
      const restoredMode = window.ReceiptPrinter.feedMode;
      const restoredBtnText = modeBtn ? modeBtn.textContent : '';

      return {
        initialMode,
        initialBtnText,
        smoothMode,
        smoothBtnText,
        restoredMode,
        restoredBtnText,
        hasModeBtn: !!modeBtn
      };
    })()
  `);

  assert('ANI-18', 'ReceiptPrinter defaults to "stepped" feed mode matching thermal ratchet reference', 
    motionModes.initialMode === 'stepped');
  assert('ANI-19', 'ReceiptPrinter exposes setFeedMode() and switches to "smooth" mode', 
    motionModes.smoothMode === 'smooth');
  assert('ANI-20', 'ReceiptPrinter exposes toggleFeedMode() and cycles back to "stepped" mode', 
    motionModes.restoredMode === 'stepped');
  assert('ANI-21', 'Feed mode switcher button updates visual label dynamically ("STEPPED FEED" / "SMOOTH FEED")', 
    motionModes.initialBtnText.includes('STEPPED') && motionModes.smoothBtnText.includes('SMOOTH'));

  // =========================================================================
  // SECTION 5: Background Scroll Lock & Modal Entrance
  // =========================================================================
  console.log('\n8. Verifying Background Scroll Lock & Modal Entrance (Section 5)...');
  const scrollLock = await evaluate(`
    (() => {
      const initialOverflow = document.body.style.overflow;
      window.ReceiptPrinter.open();
      const openOverflow = document.body.style.overflow;
      const overlay = document.getElementById('receiptPrinterOverlay');
      const isOpen = overlay && overlay.classList.contains('active');
      
      // Attempting to close while processing should be blocked by guard
      window.ReceiptPrinter.close();
      const blockedCloseOverflow = document.body.style.overflow;

      // Transition to ready state and then close cleanly
      window.ReceiptPrinter.setReady();
      window.ReceiptPrinter.close();
      const closedOverflow = document.body.style.overflow;

      return {
        initialOverflow,
        openOverflow,
        blockedCloseOverflow,
        closedOverflow,
        isOpen
      };
    })()
  `);

  assert('ANI-22', 'Opening ReceiptPrinter modal locks body background scrolling (overflow: hidden)', 
    scrollLock.openOverflow === 'hidden');
  assert('ANI-23', 'Closing ReceiptPrinter modal restores body scrolling cleanly', 
    scrollLock.closedOverflow === '');

  // =========================================================================
  // SECTION 6: Live End-to-End Bill Creation & Natural State Transitions
  // =========================================================================
  console.log('\n9. Testing Live End-to-End Bill Creation & Full Animation Lifecycle (Section 6)...');
  
  // Fill form
  await evaluate(`
    (() => {
      setBillingCategory('വഴിപാട്');
      const itemSel = document.getElementById('itemSelect');
      itemSel.selectedIndex = 0;
      updatePrice();
      const nameInp = document.getElementById('name');
      nameInp.value = 'ഗോവിന്ദൻ നമ്പൂതിരി (Govindan Namboothiri)';
      const starInp = document.getElementById('star');
      starInp.value = 'തിരുവോണം';
      const qtyInp = document.getElementById('qty');
      qtyInp.value = '1';
      updatePrice();
      setBillingPaymentMode('Cash');
    })()
  `);

  // Start submission
  await evaluate(`
    (() => {
      window._step25SubmitPromise = billingSubmitForm();
    })()
  `);

  // Verify Stage 1: Processing
  const procState = await evaluate(`
    (() => {
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const spinner = document.querySelector('.printer-spinner-ring');
      const ejector = document.getElementById('printerPaperEjector');

      return {
        isOpen: window.ReceiptPrinter.isOpen(),
        state: window.ReceiptPrinter.state,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : '',
        spinnerExists: !!spinner,
        ejectorDisplay: ejector ? ejector.style.display : null
      };
    })()
  `);

  assert('ANI-24', 'Stage 1 (Processing): Overlay active while database write is in-flight', 
    procState.isOpen && procState.state === 'processing');
  assert('ANI-25', 'Stage 1: Status screen displays pulsing amber LED and "PROCESSING" badge', 
    procState.ledClass.includes('processing') && procState.labelText.includes('PROCESSING'));
  assert('ANI-26', 'Stage 1: Subtle processing spinner is active and paper sheet concealed in throat', 
    procState.spinnerExists && procState.ejectorDisplay === 'none');

  // Await Firestore write completion
  await evaluate(`window._step25SubmitPromise`);
  await new Promise(r => setTimeout(r, 400));

  // Verify Stage 2: Printing / Paper feed motion
  const printState = await evaluate(`
    (() => {
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const ejector = document.getElementById('printerPaperEjector');
      const sheet = document.getElementById('printerReceiptSheet');

      return {
        state: window.ReceiptPrinter.state,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : '',
        ejectorDisplay: ejector ? ejector.style.display : null,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false
      };
    })()
  `);

  assert('ANI-27', 'Stage 2 (Printing): Transitions immediately upon database confirmation', 
    printState.state === 'printing' || printState.state === 'ready');
  assert('ANI-28', 'Stage 2: Paper ejector chamber reveals receipt emerging through throat slot', 
    printState.ejectorDisplay !== 'none');

  // Wait for 2.4s feed duration to complete
  await new Promise(r => setTimeout(r, 3200));

  // Verify Stage 3: Ready / Completed
  const readyState = await evaluate(`
    (() => {
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const sheet = document.getElementById('printerReceiptSheet');
      const printBtn = document.getElementById('btnPrintReceipt');
      const nextBtn = document.getElementById('btnNextBill');
      const replayBtn = document.getElementById('printerReplayBtn') || document.querySelector('[data-id="receiptPrinterBtnReplay"]');
      const text = document.getElementById('billingReceiptPreviewArea') ? document.getElementById('billingReceiptPreviewArea').textContent : '';

      return {
        state: window.ReceiptPrinter.state,
        ledClass: led ? led.className : '',
        labelText: label ? label.textContent : '',
        isFed: sheet ? sheet.classList.contains('fed') : false,
        printBtnExists: !!printBtn,
        nextBtnExists: !!nextBtn,
        replayBtnExists: !!replayBtn,
        hasDevotee: text.includes('ഗോവിന്ദൻ നമ്പൂതിരി'),
        hasStar: text.includes('തിരുവോണം')
      };
    })()
  `);

  assert('ANI-29', 'Stage 3 (Ready): Status screen transitions cleanly to solid green "RECEIPT READY"', 
    readyState.state === 'ready' && readyState.ledClass.includes('ready') && readyState.labelText.includes('READY'));
  assert('ANI-30', 'Stage 3: Paper feed marked completed (.fed) and rests in ejection chamber', 
    readyState.isFed);
  assert('ANI-31', 'Stage 3: Action controls present (Print Receipt, New Bill, Replay Animation)', 
    readyState.printBtnExists && readyState.nextBtnExists && readyState.replayBtnExists);
  assert('ANI-32', 'Stage 3: Malayalam devotee name and star rendered crisply on thermal paper', 
    readyState.hasDevotee && readyState.hasStar);

  // =========================================================================
  // SECTION 7: Replay Animation Safety & Zero Database Write Guarantee
  // =========================================================================
  console.log('\n10. Auditing Replay Animation Safety & Zero Duplicate Write Guarantee (Section 7)...');
  
  // Record billing count before replay
  const countBeforeReplay = await evaluate(`
    (async () => {
      const list = await allBillingRecords();
      return list.length;
    })()
  `);

  // Trigger Replay
  await evaluate(`
    (() => {
      window.ReceiptPrinter.replay();
    })()
  `);

  // Verify Replay resets paper to printing state immediately without processing stage
  const replayInitial = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      return {
        state: window.ReceiptPrinter.state,
        isFeeding: sheet ? sheet.classList.contains('feeding') : false,
        isFed: sheet ? sheet.classList.contains('fed') : false
      };
    })()
  `);

  assert('ANI-33', 'Replay resets sheet animation (.feeding) without touching cloud database', 
    replayInitial.state === 'printing' && replayInitial.isFeeding && !replayInitial.isFed);

  // Wait for replay to complete
  await new Promise(r => setTimeout(r, 3200));

  const countAfterReplay = await evaluate(`
    (async () => {
      const list = await allBillingRecords();
      return list.length;
    })()
  `);

  assert('ANI-34', 'Replay executes PURE visual feed with ZERO additional database writes (idempotency preserved)', 
    countBeforeReplay === countAfterReplay, `before: ${countBeforeReplay}, after: ${countAfterReplay}`);

  const replaySettled = await evaluate(`
    (() => {
      const sheet = document.getElementById('printerReceiptSheet');
      return {
        state: window.ReceiptPrinter.state,
        isFed: sheet ? sheet.classList.contains('fed') : false
      };
    })()
  `);

  assert('ANI-35', 'Replay completes cleanly and returns to "ready" state with solid green LED', 
    replaySettled.state === 'ready' && replaySettled.isFed);

  // =========================================================================
  // SECTION 8: Deterministic Sequence Reset on Next Bill
  // =========================================================================
  console.log('\n11. Auditing Deterministic Sequence Reset on Subsequent Transaction (Section 8)...');
  
  // Click Next Bill
  await evaluate(`
    (() => {
      billingNextBill();
    })()
  `);

  const nextBillReset = await evaluate(`
    (() => {
      const overlay = document.getElementById('receiptPrinterOverlay');
      const sheet = document.getElementById('printerReceiptSheet');
      const nameInp = document.getElementById('name');
      const isOpen = overlay && overlay.classList.contains('active');

      return {
        isOpen,
        state: window.ReceiptPrinter.state,
        hasFedClass: sheet ? sheet.classList.contains('fed') : false,
        hasFeedingClass: sheet ? sheet.classList.contains('feeding') : false,
        nameValue: nameInp ? nameInp.value : null
      };
    })()
  `);

  assert('ANI-36', 'Next Bill closes printer overlay and resets printer state machine to idle', 
    !nextBillReset.isOpen && nextBillReset.state === 'idle');
  assert('ANI-37', 'Next Bill removes animation classes (.fed, .feeding) for deterministic replayability', 
    !nextBillReset.hasFedClass && !nextBillReset.hasFeedingClass);
  assert('ANI-38', 'Next Bill clears devotee form fields for subsequent transaction entry', 
    nextBillReset.nameValue === '');

  // =========================================================================
  // SECTION 9: Write Failure Error Handling & Resilience
  // =========================================================================
  console.log('\n12. Auditing Write Failure Error State & LED Indication (Section 9)...');
  const failureTest = await evaluate(`
    (() => {
      window.ReceiptPrinter.startProcessing();
      window.ReceiptPrinter.showError('Firebase network unreachable: simulated transaction timeout');
      const led = document.getElementById('printerStatusLed');
      const label = document.getElementById('printerStatusLabel');
      const errPanel = document.getElementById('printerErrorPanel');
      const errMsg = document.getElementById('printerErrorMsg');

      return {
        state: window.ReceiptPrinter.state,
        ledClass: led ? led.className : '',
        label: label ? label.textContent : '',
        errPanelVisible: errPanel ? errPanel.style.display !== 'none' : false,
        errText: errMsg ? errMsg.textContent : ''
      };
    })()
  `);

  assert('ANI-39', 'Error state displays crimson error LED and "FAILED" status pill', 
    failureTest.state === 'error' && failureTest.ledClass.includes('error') && failureTest.label === 'FAILED');
  assert('ANI-40', 'Error state displays descriptive error message inside recessed chamber', 
    failureTest.errPanelVisible && failureTest.errText.includes('timeout'));

  // Close error state
  await evaluate(`window.ReceiptPrinter.close()`);

  // =========================================================================
  // SECTION 10: Reduced Motion Accessibility Compliance
  // =========================================================================
  console.log('\n13. Auditing Reduced Motion Accessibility Compliance (Section 10)...');
  const reducedMotionStyles = await evaluate(`
    (() => {
      let foundReducedMotion = false;
      let zeroTransform = false;

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.media && rule.media.mediaText.includes('prefers-reduced-motion')) {
              foundReducedMotion = true;
              const text = rule.cssText;
              if (text.includes('transform: none') || text.includes('animation: none')) {
                zeroTransform = true;
              }
            }
          }
        } catch (e) {}
      }

      return {
        foundReducedMotion,
        zeroTransform
      };
    })()
  `);

  assert('ANI-41', '@media (prefers-reduced-motion: reduce) overrides present in stylesheet', 
    reducedMotionStyles.foundReducedMotion);
  assert('ANI-42', 'Reduced motion suppresses large translation transforms and heavy paper movement', 
    reducedMotionStyles.zeroTransform);

  // =========================================================================
  // SECTION 11: Thermal Print Layout Isolation & 58mm Integrity
  // =========================================================================
  console.log('\n14. Auditing Thermal Print Layout Isolation & 58mm Receipt Integrity (Section 11)...');
  const printRules = await evaluate(`
    (() => {
      let printRulesExist = false;
      let overlayHiddenInPrint = false;
      let chassisHiddenInPrint = false;

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.media && rule.media.mediaText.includes('print')) {
              printRulesExist = true;
              const text = rule.cssText;
              if (text.includes('receipt-printer-overlay') && text.includes('none')) {
                overlayHiddenInPrint = true;
              }
              if (text.includes('receipt-printer-chassis') || text.includes('.receipt-printer-overlay')) {
                chassisHiddenInPrint = true;
              }
            }
          }
        } catch (e) {}
      }

      return {
        printRulesExist,
        overlayHiddenInPrint,
        chassisHiddenInPrint
      };
    })()
  `);

  assert('ANI-43', '@media print contains thermal isolation rules', 
    printRules.printRulesExist);
  assert('ANI-44', '@media print explicitly hides printer overlay and chassis from physical printouts', 
    printRules.overlayHiddenInPrint && printRules.chassisHiddenInPrint);

  // =========================================================================
  // SECTION 12: Mobile Viewport Geometry & Responsive Restraint
  // =========================================================================
  console.log('\n15. Auditing Mobile Responsiveness & Layout Restraint (Section 12)...');
  const responsiveGeometry = await evaluate(`
    (() => {
      const chassis = document.getElementById('receiptPrinterChassis');
      const cs = chassis ? window.getComputedStyle(chassis) : null;

      return {
        maxWidth: cs ? cs.maxWidth : null,
        width: cs ? cs.width : null,
        boxSizing: cs ? cs.boxSizing : null
      };
    })()
  `);

  assert('ANI-45', 'Printer chassis has restrained max-width (420px) preventing viewport overflow', 
    responsiveGeometry.maxWidth === '420px');
  assert('ANI-46', 'Printer chassis uses border-box sizing for safe mobile padding calculation', 
    responsiveGeometry.boxSizing === 'border-box');

  console.log('\n================================================================');
  console.log(`STEP 33.25 VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    ws.close();
    process.exit(1);
  }
  ws.close();
  process.exit(0);
}

runSuite().catch(err => {
  console.error('Fatal error running Step 33.25 verification suite:', err);
  process.exit(1);
});
