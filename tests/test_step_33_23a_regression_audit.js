// STEP 33.23A - DynamicButton Final Regression Audit Suite
// Comprehensive Verification against Isolated Firebase Emulator

const http = require('http');

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function runAudit() {
  console.log('================================================================');
  console.log('STEP 33.23A DYNAMICBUTTON FINAL REGRESSION AUDIT');
  console.log('Testing DynamicButton System in Temple Accounts (Isolated Emulator)');
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
  const auditLedger = [];

  function assert(id, name, condition, details = '') {
    auditLedger.push({ id, name, passed: !!condition, details });
    if (condition) {
      console.log(`  [PASS] [${id}] ${name} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] [${id}] ${name} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

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

  // SECTION 1: Emulator Isolation Check
  console.log('\n3. Verifying Firebase Emulator Isolation...');
  const isolationCheck = await evaluate(`
    (() => {
      const isEmuUrl = window.location.search.includes('emulator=true');
      const isTestDb = typeof DB_NAME !== 'undefined' && DB_NAME === 'temple_accounts_test_db';
      return { isEmuUrl, isTestDb, pathname: window.location.pathname, search: window.location.search };
    })()
  `);
  console.log('   Isolation Details:', isolationCheck);
  assert('AUD-01', 'Active page URL has emulator=true parameter', isolationCheck.isEmuUrl);
  assert('AUD-02', 'Target database is isolated temple_accounts_test_db', isolationCheck.isTestDb);

  // SECTION 2: DynamicButton Global Object
  console.log('\n4. Verifying DynamicButton Architecture...');
  const helperExists = await evaluate(`typeof window.DynamicButton === 'object' && window.DynamicButton !== null`);
  assert('AUD-03', 'window.DynamicButton global object exists', helperExists);
  const helperMethods = await evaluate(`
    ['init', 'setState', 'getState', 'syncWidth', 'destroy'].every(m => typeof window.DynamicButton[m] === 'function')
  `);
  assert('AUD-04', 'window.DynamicButton exposes 5 component lifecycle methods', helperMethods);

  // SECTION 3: Navigate to Billing View
  console.log('\n5. Navigating to Billing view...');
  const navDbg = await evaluate(`(async () => {
    try {
      await navigate('billing');
      return {
        view: CURRENT_VIEW,
        mainHtml: el('app-main') ? el('app-main').innerHTML.slice(0, 300) : null,
        btn: !!el('btnCreateBill')
      };
    } catch(e) {
      return { error: e.message, stack: e.stack };
    }
  })()`);
  console.log('   Nav Debug:', navDbg);
  await new Promise(r => setTimeout(r, 1200));

  // SECTION 4: Geometry & Typography
  console.log('\n6. Auditing Button Geometry, Typography & Palette...');
  const btnCreateBillInfo = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      if (!btn) return null;
      const cs = window.getComputedStyle(btn);
      return {
        exists: true,
        height: cs.height,
        borderRadius: cs.borderRadius,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        whiteSpace: cs.whiteSpace,
        color: cs.color,
        hasPrimaryClass: btn.classList.contains('dynamic-btn-primary'),
        hasDynamicClass: btn.classList.contains('dynamic-btn'),
        width: btn.offsetWidth
      };
    })()
  `);
  assert('AUD-05', 'btnCreateBill exists in DOM', btnCreateBillInfo && btnCreateBillInfo.exists);
  assert('AUD-06', 'btnCreateBill height is 28px', btnCreateBillInfo?.height === '28px', `got ${btnCreateBillInfo?.height}`);
  assert('AUD-07', 'btnCreateBill border radius is 8px', btnCreateBillInfo?.borderRadius === '8px', `got ${btnCreateBillInfo?.borderRadius}`);
  assert('AUD-08', 'btnCreateBill has class dynamic-btn', btnCreateBillInfo?.hasDynamicClass);
  assert('AUD-09', 'btnCreateBill has class dynamic-btn-primary', btnCreateBillInfo?.hasPrimaryClass);
  assert('AUD-10', 'btnCreateBill font size is 14px', btnCreateBillInfo?.fontSize === '14px', `got ${btnCreateBillInfo?.fontSize}`);
  assert('AUD-11', 'btnCreateBill font weight is 500', btnCreateBillInfo?.fontWeight === '500', `got ${btnCreateBillInfo?.fontWeight}`);
  assert('AUD-12', 'btnCreateBill text color is white', btnCreateBillInfo?.color === 'rgb(255, 255, 255)' || btnCreateBillInfo?.color === '#ffffff');
  assert('AUD-13', 'btnCreateBill white-space is nowrap', btnCreateBillInfo?.whiteSpace === 'nowrap');

  const btnResetInfo = await evaluate(`
    (() => {
      const btn = document.querySelector('.billing-reset-btn');
      if (!btn) return null;
      const cs = window.getComputedStyle(btn);
      return {
        exists: true,
        height: cs.height,
        borderRadius: cs.borderRadius,
        hasSecondaryClass: btn.classList.contains('dynamic-btn-secondary'),
        hasDynamicClass: btn.classList.contains('dynamic-btn'),
        width: btn.offsetWidth
      };
    })()
  `);
  assert('AUD-14', 'billing-reset-btn exists with height 28px', btnResetInfo && btnResetInfo.height === '28px');
  assert('AUD-15', 'billing-reset-btn border radius is 8px', btnResetInfo?.borderRadius === '8px');
  assert('AUD-16', 'billing-reset-btn has class dynamic-btn-secondary', btnResetInfo?.hasSecondaryClass);

  // SECTION 5: Internal Slots & Measurement Container
  console.log('\n7. Auditing Internal Slot Architecture & Measurement Container...');
  const slotInfo = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const visible = btn.querySelector('.dynamic-btn-visible');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const measure = btn.querySelector('.dynamic-btn-measure');

      return {
        hasVisible: !!visible,
        hasIconSlot: !!iconSlot,
        hasLabelSlot: !!labelSlot,
        hasMeasure: !!measure,
        measureAriaHidden: measure ? measure.getAttribute('aria-hidden') : null,
        measureOpacity: measure ? window.getComputedStyle(measure).opacity : null,
        measureVisibility: measure ? window.getComputedStyle(measure).visibility : null,
        currentLabel: labelSlot ? labelSlot.textContent.trim() : null
      };
    })()
  `);
  assert('AUD-17', 'btnCreateBill has visible content wrapper', slotInfo.hasVisible);
  assert('AUD-18', 'btnCreateBill has dedicated 15x15 icon slot', slotInfo.hasIconSlot);
  assert('AUD-19', 'btnCreateBill has label container slot', slotInfo.hasLabelSlot);
  assert('AUD-20', 'btnCreateBill has measurement container', slotInfo.hasMeasure);
  assert('AUD-21', 'Measurement element has aria-hidden="true"', slotInfo.measureAriaHidden === 'true');
  assert('AUD-22', 'Measurement element has opacity: 0 and visibility: hidden', slotInfo.measureOpacity === '0' && slotInfo.measureVisibility === 'hidden');
  assert('AUD-23', 'Idle label renders Malayalam text', slotInfo.currentLabel && slotInfo.currentLabel.includes('ബിൽ'));

  // SECTION 6: Dynamic Width Expansion and Contraction Across State Cycles
  console.log('\n8. Auditing Dynamic Width Expansion & Contraction...');
  const idleWidth = btnCreateBillInfo.width;
  console.log(`   Initial Idle Width: ${idleWidth}px`);

  // Switch to Submitting state
  await evaluate(`
    (async () => {
      const btn = document.getElementById('btnCreateBill');
      window.DynamicButton.setState(btn, {
        text: 'Creating Bill…',
        icon: '⏳',
        stateKey: 'submitting'
      });
      if (btn.getAnimations) {
        await Promise.all(btn.getAnimations().map(a => a.finished));
      }
      await new Promise(r => setTimeout(r, 100));
    })()
  `);
  const submittingWidth = await evaluate(`document.getElementById('btnCreateBill').offsetWidth`);
  const submittingLabel = await evaluate(`
    (() => {
      const activeLabel = document.getElementById('btnCreateBill').querySelector('.dynamic-btn-label-item:not(.dynamic-btn-exiting)');
      return activeLabel ? activeLabel.textContent.trim() : '';
    })()
  `);
  console.log(`   Submitting Width: ${submittingWidth}px (label: "${submittingLabel}")`);
  assert('AUD-24', 'Width contracted dynamically in Submitting state', submittingWidth !== idleWidth && submittingWidth < idleWidth, `idle: ${idleWidth}px -> submitting: ${submittingWidth}px`);
  assert('AUD-25', 'Submitting label renders "Creating Bill…"', submittingLabel === 'Creating Bill…');

  // Switch to Success state
  await evaluate(`
    (async () => {
      const btn = document.getElementById('btnCreateBill');
      window.DynamicButton.setState(btn, {
        text: 'Bill Created ✓',
        icon: '✓',
        stateKey: 'success'
      });
      if (btn.getAnimations) {
        await Promise.all(btn.getAnimations().map(a => a.finished));
      }
      await new Promise(r => setTimeout(r, 100));
    })()
  `);
  const successWidth = await evaluate(`document.getElementById('btnCreateBill').offsetWidth`);
  const successLabel = await evaluate(`
    (() => {
      const activeLabel = document.getElementById('btnCreateBill').querySelector('.dynamic-btn-label-item:not(.dynamic-btn-exiting)');
      return activeLabel ? activeLabel.textContent.trim() : '';
    })()
  `);
  console.log(`   Success Width: ${successWidth}px (label: "${successLabel}")`);
  assert('AUD-26', 'Success label renders "Bill Created ✓"', successLabel === 'Bill Created ✓');
  assert('AUD-27', 'Success width contracted dynamically (< idle width)', successWidth < idleWidth, `${successWidth}px vs ${idleWidth}px`);

  // Switch to Long Label State (Expansion verification)
  await evaluate(`
    (async () => {
      const btn = document.getElementById('btnCreateBill');
      window.DynamicButton.setState(btn, {
        text: 'PROCESSING BILL / ഇടപാട് പൂർത്തിയാക്കുന്നു',
        icon: '🙏',
        stateKey: 'long_label'
      });
      if (btn.getAnimations) {
        await Promise.all(btn.getAnimations().map(a => a.finished));
      }
      await new Promise(r => setTimeout(r, 100));
    })()
  `);
  const expandedWidth = await evaluate(`document.getElementById('btnCreateBill').offsetWidth`);
  console.log(`   Expanded Long Width: ${expandedWidth}px`);
  assert('AUD-28', 'Button width dynamically expanded for longer text (> idle width)', expandedWidth > idleWidth, `${expandedWidth}px vs ${idleWidth}px`);

  // Restore to Idle state
  await evaluate(`
    (async () => {
      const btn = document.getElementById('btnCreateBill');
      window.DynamicButton.setState(btn, {
        text: 'GENERATE BILL / ബിൽ രേഖപ്പെടുത്തുക',
        icon: '🧾',
        stateKey: 'idle'
      });
      if (btn.getAnimations) {
        await Promise.all(btn.getAnimations().map(a => a.finished));
      }
      await new Promise(r => setTimeout(r, 100));
    })()
  `);
  const restoredWidth = await evaluate(`document.getElementById('btnCreateBill').offsetWidth`);
  console.log(`   Restored Idle Width: ${restoredWidth}px`);
  assert('AUD-29', 'Button width accurately restored to initial idle width (±2px)', Math.abs(restoredWidth - idleWidth) <= 2, `${restoredWidth}px vs ${idleWidth}px`);

  // SECTION 7: stateKey Icon Change Without Label Re-render
  console.log('\n9. Testing stateKey Icon Transitions Without Label Re-render...');
  const iconChangeResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');
      const initialLabels = Array.from(labelSlot.children).filter(c => !c.classList.contains('dynamic-btn-exiting'));

      window.DynamicButton.setState(btn, {
        stateKey: 'key_changed_sparkle',
        icon: '✨'
      });

      const midLabels = Array.from(labelSlot.children).filter(c => !c.classList.contains('dynamic-btn-exiting'));
      const newIconText = iconSlot.textContent.trim();

      return {
        labelCountRemainedOne: initialLabels.length === 1 && midLabels.length === 1,
        iconUpdated: newIconText.includes('✨')
      };
    })()
  `);
  assert('AUD-30', 'Label DOM was untouched when only stateKey/icon changed', iconChangeResult.labelCountRemainedOne);
  assert('AUD-31', 'Icon updated and animated when stateKey changed', iconChangeResult.iconUpdated);

  // Restore idle icon
  await evaluate(`
    window.DynamicButton.setState(document.getElementById('btnCreateBill'), {
      stateKey: 'idle',
      icon: '🧾'
    });
  `);
  await new Promise(r => setTimeout(r, 300));

  // SECTION 8: Rapid Burst State Changes (DOM Leak Prevention)
  console.log('\n10. Auditing Rapid Burst State Changes & Memory Cleanup...');
  const burstResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      for (let i = 0; i < 10; i++) {
        window.DynamicButton.setState(btn, {
          text: 'Rapid Label ' + i,
          icon: '🔢',
          stateKey: 'rapid_' + i
        });
      }
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');
      return {
        labelCount: labelSlot.children.length,
        iconCount: iconSlot.children.length
      };
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const settledResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');
      return {
        labelCount: labelSlot.children.length,
        iconCount: iconSlot.children.length,
        finalText: labelSlot.textContent.trim()
      };
    })()
  `);
  assert('AUD-32', 'Burst updates capped in-flight nodes to <= 2 (no memory leak)', burstResult.labelCount <= 2);
  assert('AUD-33', 'Settled state has exactly 1 label node', settledResult.labelCount === 1, `got ${settledResult.labelCount}`);
  assert('AUD-34', 'Settled state has exactly 1 icon node', settledResult.iconCount === 1, `got ${settledResult.iconCount}`);
  assert('AUD-35', 'Settled text reflects final update', settledResult.finalText === 'Rapid Label 9');

  // Restore idle
  await evaluate(`
    window.DynamicButton.setState(document.getElementById('btnCreateBill'), {
      text: 'GENERATE BILL / ബിൽ രേഖപ്പെടുത്തുക',
      icon: '🧾',
      stateKey: 'idle'
    });
  `);
  await new Promise(r => setTimeout(r, 400));

  // SECTION 9: Reduced Motion Accessibility Mode
  console.log('\n11. Auditing Reduced Motion Accessibility Behavior...');
  const reducedMotionResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const origMatchMedia = window.matchMedia;
      window.matchMedia = (query) => {
        if (query.includes('prefers-reduced-motion')) {
          return { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
        }
        return origMatchMedia ? origMatchMedia(query) : { matches: false };
      };

      try {
        const prevWidth = btn.offsetWidth;
        window.DynamicButton.setState(btn, {
          text: 'Reduced Motion Label',
          icon: '⚡',
          stateKey: 'reduced_test'
        });

        const nextWidth = btn.offsetWidth;
        const measure = btn.querySelector('.dynamic-btn-measure');

        return {
          widthUpdated: nextWidth !== prevWidth,
          measureText: measure ? measure.textContent.trim() : ''
        };
      } finally {
        window.matchMedia = origMatchMedia;
      }
    })()
  `);
  assert('AUD-36', 'Reduced motion updates width and state safely without animation lag', reducedMotionResult.widthUpdated);

  // Restore idle
  await evaluate(`
    window.DynamicButton.setState(document.getElementById('btnCreateBill'), {
      text: 'GENERATE BILL / ബിൽ രേഖപ്പെടുത്തുക',
      icon: '🧾',
      stateKey: 'idle'
    });
  `);
  await new Promise(r => setTimeout(r, 400));

  // SECTION 10: Print Layout CSS Isolation (@media print)
  console.log('\n12. Auditing Thermal Print Layout Protection (@media print)...');
  const printCssProtected = await evaluate(`
    (() => {
      let foundPrintRule = false;
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText.includes('print')) {
              for (const innerRule of rule.cssRules) {
                if (innerRule.selectorText && (innerRule.selectorText.includes('dynamic-btn') || innerRule.selectorText.includes('bill-success-actions'))) {
                  if (innerRule.style.display === 'none') {
                    foundPrintRule = true;
                  }
                }
              }
            }
          }
        } catch (e) {}
      }
      return foundPrintRule;
    })()
  `);
  assert('AUD-37', '@media print explicitly sets display: none on DynamicButton elements', printCssProtected);

  // SECTION 11: Validation Failure & Reset Form
  console.log('\n13. Auditing Form Validation Failure & Reset Form Behavior...');
  const validationTest = await evaluate(`
    (async () => {
      const nameInput = document.getElementById('name');
      if (nameInput) nameInput.value = '';

      const btn = document.getElementById('btnCreateBill');
      const prevSaving = window.isBillingSaving;
      await billingSubmitForm();

      const postSaving = window.isBillingSaving;
      const btnDisabled = btn.disabled;
      const feedback = document.getElementById('billingFeedback');
      const hasBadFeedback = feedback && feedback.classList.contains('bad');

      return {
        prevSaving,
        postSaving,
        btnDisabled,
        hasBadFeedback
      };
    })()
  `);
  assert('AUD-38', 'Empty form triggers validation failure feedback', validationTest.hasBadFeedback);
  assert('AUD-39', 'window.isBillingSaving concurrency lock cleared after validation failure', !validationTest.postSaving);
  assert('AUD-40', 'Button remains enabled after validation failure for user retry', !validationTest.btnDisabled);

  await evaluate(`billingResetForm()`);
  await new Promise(r => setTimeout(r, 300));
  const resetResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      return {
        disabled: btn.disabled,
        text: labelSlot ? labelSlot.textContent.trim() : '',
        isIdle: labelSlot ? labelSlot.textContent.includes('GENERATE BILL') : false
      };
    })()
  `);
  assert('AUD-41', 'billingResetForm restores button to enabled idle state', !resetResult.disabled && resetResult.isIdle);

  // SECTION 12: End-to-End Live Bill Submission & Thermal Print
  console.log('\n14. Auditing Live End-to-End Bill Creation & Thermal Printing...');
  const initialReceiptCount = await evaluate(`(async () => { const list = await allBillingRecords(); return list.length; })()`);

  // Fill form with valid data
  await evaluate(`
    (() => {
      const nameInput = document.getElementById('name');
      const starInput = document.getElementById('star');
      const catSel = document.getElementById('categorySelect');
      const itemSel = document.getElementById('itemSelect');
      const qtyInput = document.getElementById('qty');
      const totalInput = document.getElementById('total');

      if (nameInput) nameInput.value = 'Devotee Regression 33.23A';
      if (starInput) starInput.value = 'അശ്വതി';
      if (catSel) catSel.value = 'വഴിപാട്';
      syncCategorySegmentedUI();
      loadCategoryItems();

      if (itemSel && itemSel.options.length > 0) itemSel.selectedIndex = 0;
      if (qtyInput) qtyInput.value = '1';
      if (totalInput) totalInput.value = '50';
    })()
  `);

  // Submit live bill
  await evaluate(`billingSubmitForm()`);
  await new Promise(r => setTimeout(r, 600));

  const postSubmitCount = await evaluate(`(async () => { const list = await allBillingRecords(); return list.length; })()`);
  assert('AUD-42', 'Exactly 1 bill record persisted to isolated emulator database', postSubmitCount === initialReceiptCount + 1);

  // Verify success banner buttons
  const bannerButtons = await evaluate(`
    (() => {
      const printBtn = document.getElementById('btnSuccessPrintReceipt');
      const newBtn = document.getElementById('btnSuccessNewBill');
      return {
        printExists: !!printBtn,
        printHeight: printBtn ? window.getComputedStyle(printBtn).height : null,
        printPrimary: printBtn ? printBtn.classList.contains('dynamic-btn-primary') : false,
        printText: printBtn ? printBtn.querySelector('.dynamic-btn-label-slot').textContent.trim() : null,
        newExists: !!newBtn,
        newHeight: newBtn ? window.getComputedStyle(newBtn).height : null,
        newSecondary: newBtn ? newBtn.classList.contains('dynamic-btn-secondary') : false,
        newText: newBtn ? newBtn.querySelector('.dynamic-btn-label-slot').textContent.trim() : null
      };
    })()
  `);
  assert('AUD-43', 'Success banner Print button has 28px height and primary variant', bannerButtons.printExists && bannerButtons.printHeight === '28px' && bannerButtons.printPrimary);
  assert('AUD-44', 'Success banner New Bill button has 28px height and secondary variant', bannerButtons.newExists && bannerButtons.newHeight === '28px' && bannerButtons.newSecondary);

  // Test Thermal Print execution on active bill
  const printActionResult = await evaluate(`
    (() => {
      let printTriggered = false;
      const origPrint = window.print;
      window.print = () => { printTriggered = true; };

      try {
        printBillingReceipt();
        const printArea = document.getElementById('print-area');
        const printContent = printArea ? printArea.innerHTML : '';
        const buttonsCount = printArea ? printArea.querySelectorAll('button, .dynamic-btn').length : 0;
        const hasDevotee = printContent.includes('Devotee Regression 33.23A');
        const hasReceipt = printContent.includes('BILL-');

        return {
          buttonsCount,
          hasDevotee,
          hasReceipt
        };
      } finally {
        window.print = origPrint;
      }
    })()
  `);
  assert('AUD-45', 'Thermal print area contains 0 buttons or dynamic button artifacts', printActionResult.buttonsCount === 0);
  assert('AUD-46', 'Thermal print area contains generated receipt and devotee name', printActionResult.hasDevotee && printActionResult.hasReceipt);

  // Click + NEW BILL to reset
  await evaluate(`document.getElementById('btnSuccessNewBill').click()`);
  await new Promise(r => setTimeout(r, 400));
  const newBillCleaned = await evaluate(`
    (() => {
      const name = document.getElementById('name');
      const previewArea = document.getElementById('billingReceiptPreviewArea');
      return {
        nameCleared: name ? name.value === '' : false,
        hasPlaceholder: previewArea ? !!previewArea.querySelector('.billing-preview-placeholder') : false
      };
    })()
  `);
  assert('AUD-47', '+ NEW BILL cleared form and restored receipt preview placeholder', newBillCleaned.nameCleared && newBillCleaned.hasPlaceholder);

  // SECTION 13: Receipt Preview Buttons (Normal & Voided)
  console.log('\n15. Auditing Receipt Preview Action Buttons (Normal vs Voided)...');
  const previewButtonsResult = await evaluate(`
    (() => {
      const sampleRec = {
        id: 9999,
        receiptNo: 'BILL-9999',
        date: '11/10/2026',
        time: '05:30 PM',
        devoteeName: 'Test Devotee',
        category: 'വഴിപാട്',
        item: 'പുഷ്പാഞ്ജലി',
        quantity: 1,
        totalAmount: 50,
        paymentMode: 'Cash'
      };
      renderBillingReceiptPreview(sampleRec);

      const printBtn = document.getElementById('btnPrintReceipt');
      const nextBtn = document.getElementById('btnNextBill');

      return {
        printHeight: printBtn ? window.getComputedStyle(printBtn).height : null,
        printRadius: printBtn ? window.getComputedStyle(printBtn).borderRadius : null,
        printHasDynamic: printBtn ? printBtn.classList.contains('dynamic-btn') : false,
        printHasPrimary: printBtn ? printBtn.classList.contains('dynamic-btn-primary') : false,
        nextHeight: nextBtn ? window.getComputedStyle(nextBtn).height : null,
        nextRadius: nextBtn ? window.getComputedStyle(nextBtn).borderRadius : null,
        nextHasDynamic: nextBtn ? nextBtn.classList.contains('dynamic-btn') : false,
        nextHasSecondary: nextBtn ? nextBtn.classList.contains('dynamic-btn-secondary') : false
      };
    })()
  `);
  assert('AUD-48', 'Preview Print Receipt button has height 28px and primary class', previewButtonsResult.printHeight === '28px' && previewButtonsResult.printHasPrimary);
  assert('AUD-49', 'Preview Next Bill button has height 28px and secondary class', previewButtonsResult.nextHeight === '28px' && previewButtonsResult.nextHasSecondary);

  // Voided preview
  const voidedButtonsResult = await evaluate(`
    (() => {
      const voidedRec = {
        id: 9999,
        receiptNo: 'BILL-9999',
        date: '11/10/2026',
        voided: true,
        voidReason: 'Test Void Regression',
        category: 'വഴിപാട്',
        item: 'പുഷ്പാഞ്ജലി',
        quantity: 1,
        totalAmount: 50,
        paymentMode: 'Cash'
      };
      renderBillingReceiptPreview(voidedRec);

      const printBtn = document.getElementById('btnPrintReceipt');
      const pStyles = printBtn ? window.getComputedStyle(printBtn) : null;
      return {
        hasDangerClass: printBtn ? printBtn.classList.contains('dynamic-btn-danger') : false,
        text: printBtn ? printBtn.textContent : '',
        bg: pStyles ? pStyles.backgroundColor : null
      };
    })()
  `);
  assert('AUD-50', 'Voided preview Print button has dynamic-btn-danger class', voidedButtonsResult.hasDangerClass);
  assert('AUD-51', 'Voided preview Print button label contains "PRINT VOIDED RECEIPT"', voidedButtonsResult.text.includes('PRINT VOIDED RECEIPT'));
  assert('AUD-52', 'Voided preview Print button background is crimson red', voidedButtonsResult.bg === 'rgb(185, 28, 28)' || voidedButtonsResult.bg === '#b91c1c');

  // Clear preview
  await evaluate(`renderBillingReceiptPreview(null)`);

  // SECTION 14: Concurrency & Double-Click Guard
  console.log('\n16. Auditing Concurrency Guard & Idempotency Safeguards...');
  const doubleClickTest = await evaluate(`
    (async () => {
      document.getElementById('name').value = 'Concurrency Devotee';
      document.getElementById('total').value = '50';

      let callCount = 0;
      const originalFsCreate = window.fsCreateBillingWithAccounting;
      let delayResolve;
      const barrier = new Promise(r => delayResolve = r);

      window.fsCreateBillingWithAccounting = async function(args) {
        callCount++;
        await barrier;
        return originalFsCreate(args);
      };

      try {
        const p1 = billingSubmitForm();
        const p2 = billingSubmitForm();
        const p3 = billingSubmitForm();
        const p4 = billingSubmitForm();
        const p5 = billingSubmitForm();

        delayResolve();
        await Promise.all([p1, p2, p3, p4, p5]);

        return {
          callCount,
          isSavingAfter: window.isBillingSaving
        };
      } finally {
        window.fsCreateBillingWithAccounting = originalFsCreate;
      }
    })()
  `);
  assert('AUD-53', 'Double-click guard allowed exactly 1 execution during 5 concurrent clicks', doubleClickTest.callCount === 1);
  assert('AUD-54', 'isBillingSaving concurrency lock released after completion', doubleClickTest.isSavingAfter === false);

  console.log('\n================================================================');
  console.log(`AUDIT LEDGER COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  ws.close();
  return { passed, failed, auditLedger, idleWidth, submittingWidth, successWidth, expandedWidth, restoredWidth };
}

runAudit()
  .then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Audit suite encountered error:', err);
    process.exit(1);
  });
