// Automated Test Suite for STEP 33.23: DynamicButton Billing Integration
const http = require('http');

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function runTests() {
  console.log('================================================================');
  console.log('STEP 33.23 AUTOMATED VERIFICATION SUITE');
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

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  console.log('\n3. Verifying DynamicButton Global Helper...');
  const helperExists = await evaluate(`typeof window.DynamicButton === 'object' && window.DynamicButton !== null`);
  assert('window.DynamicButton object exists', helperExists);

  const helperMethods = await evaluate(`
    ['init', 'setState', 'getState', 'syncWidth', 'destroy'].every(m => typeof window.DynamicButton[m] === 'function')
  `);
  assert('window.DynamicButton exposes required methods', helperMethods);

  console.log('\n4. Navigating to Billing view...');
  await evaluate(`(async () => { await navigate('billing'); })()`);
  await new Promise(r => setTimeout(r, 1200));

  console.log('\n5. Visual and Interaction Tests (Geometry & Styling)...');
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
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        hasPrimaryClass: btn.classList.contains('dynamic-btn-primary'),
        hasDynamicClass: btn.classList.contains('dynamic-btn'),
        width: btn.offsetWidth
      };
    })()
  `);

  assert('btnCreateBill exists', btnCreateBillInfo && btnCreateBillInfo.exists);
  assert('btnCreateBill height is 28px', btnCreateBillInfo && btnCreateBillInfo.height === '28px', `got ${btnCreateBillInfo?.height}`);
  assert('btnCreateBill border radius is 8px', btnCreateBillInfo && btnCreateBillInfo.borderRadius === '8px', `got ${btnCreateBillInfo?.borderRadius}`);
  assert('btnCreateBill has class dynamic-btn', btnCreateBillInfo && btnCreateBillInfo.hasDynamicClass);
  assert('btnCreateBill has class dynamic-btn-primary', btnCreateBillInfo && btnCreateBillInfo.hasPrimaryClass);
  assert('btnCreateBill font size is 14px', btnCreateBillInfo && btnCreateBillInfo.fontSize === '14px', `got ${btnCreateBillInfo?.fontSize}`);
  assert('btnCreateBill font weight is 500', btnCreateBillInfo && btnCreateBillInfo.fontWeight === '500', `got ${btnCreateBillInfo?.fontWeight}`);
  assert('btnCreateBill text color is white', btnCreateBillInfo && (btnCreateBillInfo.color === 'rgb(255, 255, 255)' || btnCreateBillInfo.color === '#ffffff'));
  assert('btnCreateBill white-space is nowrap', btnCreateBillInfo && btnCreateBillInfo.whiteSpace === 'nowrap');

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
        backgroundColor: cs.backgroundColor,
        width: btn.offsetWidth
      };
    })()
  `);

  assert('billing-reset-btn exists', btnResetInfo && btnResetInfo.exists);
  assert('billing-reset-btn height is 28px', btnResetInfo && btnResetInfo.height === '28px', `got ${btnResetInfo?.height}`);
  assert('billing-reset-btn border radius is 8px', btnResetInfo && btnResetInfo.borderRadius === '8px', `got ${btnResetInfo?.borderRadius}`);
  assert('billing-reset-btn has class dynamic-btn-secondary', btnResetInfo && btnResetInfo.hasSecondaryClass);

  console.log('\n6. Testing Internal Slot Architecture & Measurement Element...');
  const slotInfo = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const visible = btn.querySelector('.dynamic-btn-visible');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const measure = btn.querySelector('.dynamic-btn-measure');
      const measureIcon = btn.querySelector('.dynamic-btn-measure-icon');
      const measureLabel = btn.querySelector('.dynamic-btn-measure-label');

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

  assert('has visible wrapper', slotInfo.hasVisible);
  assert('has 15x15 icon slot', slotInfo.hasIconSlot);
  assert('has label slot', slotInfo.hasLabelSlot);
  assert('has measurement element', slotInfo.hasMeasure);
  assert('measurement element is aria-hidden="true"', slotInfo.measureAriaHidden === 'true');
  assert('measurement element is opacity: 0', slotInfo.measureOpacity === '0');
  assert('measurement element is visibility: hidden', slotInfo.measureVisibility === 'hidden');
  assert('idle label contains Malayalam', slotInfo.currentLabel && slotInfo.currentLabel.includes('ബിൽ'));

  console.log('\n7. Testing DynamicButton Width Transition & State Changes...');
  const idleWidth = btnCreateBillInfo.width;
  console.log(`  Initial idle width: ${idleWidth}px`);

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

  const debugInfo = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const measure = btn.querySelector('.dynamic-btn-measure');
      return {
        styleWidth: btn.style.width,
        offsetWidth: btn.offsetWidth,
        computedWidth: window.getComputedStyle(btn).width,
        measureScrollWidth: measure ? measure.scrollWidth : null,
        datasetWidth: btn.dataset.dynamicWidth
      };
    })()
  `);
  console.log('  Debug Submitting state info:', debugInfo);
  const submittingWidth = debugInfo.offsetWidth;
  const submittingLabel = await evaluate(`
    (() => {
      const activeLabel = document.getElementById('btnCreateBill').querySelector('.dynamic-btn-label-item:not(.dynamic-btn-exiting)');
      return activeLabel ? activeLabel.textContent.trim() : '';
    })()
  `);
  console.log(`  Submitting width: ${submittingWidth}px (label: "${submittingLabel}")`);

  assert('width changed dynamically on state change', submittingWidth !== idleWidth && submittingWidth < idleWidth, `idle: ${idleWidth}px -> submitting: ${submittingWidth}px`);
  assert('submitting label is "Creating Bill…"', submittingLabel === 'Creating Bill…');

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
  console.log(`  Success width: ${successWidth}px (label: "${successLabel}")`);
  assert('success label is "Bill Created ✓"', successLabel === 'Bill Created ✓');

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
  console.log(`  Restored idle width: ${restoredWidth}px`);
  assert('width restored to idle width', Math.abs(restoredWidth - idleWidth) <= 2, `restored: ${restoredWidth}px vs original: ${idleWidth}px`);

  console.log('\n8. Testing stateKey-Driven Icon Transition Without Label Change...');
  const iconChangeResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');

      const initialLabelChildren = Array.from(labelSlot.children).filter(c => !c.classList.contains('dynamic-btn-exiting'));
      const initialIconText = iconSlot.textContent.trim();

      // Change stateKey and icon only, leave text identical
      window.DynamicButton.setState(btn, {
        stateKey: 'key_changed_123',
        icon: '✨'
      });

      const midLabelChildren = Array.from(labelSlot.children).filter(c => !c.classList.contains('dynamic-btn-exiting'));
      const newIconText = iconSlot.textContent.trim();

      return {
        labelCountRemainedOne: initialLabelChildren.length === 1 && midLabelChildren.length === 1,
        iconUpdated: newIconText.includes('✨'),
        initialIconText,
        newIconText
      };
    })()
  `);

  assert('label was untouched when only stateKey/icon changed', iconChangeResult.labelCountRemainedOne);
  assert('icon updated when stateKey changed', iconChangeResult.iconUpdated);

  // Restore idle icon
  await evaluate(`
    window.DynamicButton.setState(document.getElementById('btnCreateBill'), {
      stateKey: 'idle',
      icon: '🧾'
    });
  `);
  await new Promise(r => setTimeout(r, 400));

  console.log('\n9. Testing Rapid Successive State Changes (Node Cleanup)...');
  const rapidResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      // Rapid fire 10 state changes with zero delay
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
        labelChildrenCount: labelSlot.children.length,
        iconChildrenCount: iconSlot.children.length
      };
    })()
  `);
  // Allow transitions to settle
  await new Promise(r => setTimeout(r, 500));

  const settledResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      const iconSlot = btn.querySelector('.dynamic-btn-icon-slot');
      return {
        labelChildrenCount: labelSlot.children.length,
        iconChildrenCount: iconSlot.children.length,
        finalText: labelSlot.textContent.trim()
      };
    })()
  `);

  assert('rapid updates did not accumulate excess nodes during burst', rapidResult.labelChildrenCount <= 2);
  assert('settled state has exactly 1 label node', settledResult.labelChildrenCount === 1, `got ${settledResult.labelChildrenCount}`);
  assert('settled state has exactly 1 icon node', settledResult.iconChildrenCount === 1, `got ${settledResult.iconChildrenCount}`);
  assert('settled text is the final update', settledResult.finalText === 'Rapid Label 9');

  // Restore idle
  await evaluate(`
    window.DynamicButton.setState(document.getElementById('btnCreateBill'), {
      text: 'GENERATE BILL / ബിൽ രേഖപ്പെടുത്തുക',
      icon: '🧾',
      stateKey: 'idle'
    });
  `);
  await new Promise(r => setTimeout(r, 400));

  console.log('\n10. Testing Reduced Motion Behavior...');
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

        // Under reduced motion, width should update immediately without transition delay
        const nextWidth = btn.offsetWidth;
        const measure = btn.querySelector('.dynamic-btn-measure');

        return {
          widthUpdated: nextWidth !== prevWidth,
          measureText: measure.textContent.trim()
        };
      } finally {
        window.matchMedia = origMatchMedia;
      }
    })()
  `);

  assert('reduced motion updates state safely', reducedMotionResult.widthUpdated);

  // Restore idle
  await evaluate(`
    window.DynamicButton.setState(document.getElementById('btnCreateBill'), {
      text: 'GENERATE BILL / ബിൽ രേഖപ്പെടുത്തുക',
      icon: '🧾',
      stateKey: 'idle'
    });
  `);
  await new Promise(r => setTimeout(r, 400));

  console.log('\n11. Testing Print Layout Protection (@media print)...');
  const printCssProtected = await evaluate(`
    (() => {
      // Find rules affecting .dynamic-btn and .dynamic-btn-measure in media print
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
  assert('@media print explicitly sets display: none on dynamic button elements', printCssProtected);

  console.log('\n12. Testing Billing Regression: Validation & Form Reset...');
  // Trigger submission on empty form (should fail validation and restore button)
  const validationTest = await evaluate(`
    (async () => {
      // Clear devotee name and qty
      const nameInput = document.getElementById('name');
      if (nameInput) nameInput.value = '';

      const btn = document.getElementById('btnCreateBill');
      const prevSaving = window.isBillingSaving;

      // Submit
      await billingSubmitForm();

      const postSaving = window.isBillingSaving;
      const btnDisabled = btn.disabled;
      const feedback = document.getElementById('billingFeedback');
      const hasBadFeedback = feedback && feedback.classList.contains('bad');

      return {
        prevSaving,
        postSaving,
        btnDisabled,
        hasBadFeedback,
        feedbackText: feedback ? feedback.textContent : ''
      };
    })()
  `);

  assert('validation failed as expected on empty form', validationTest.hasBadFeedback);
  assert('window.isBillingSaving remains false after validation failure', !validationTest.postSaving);
  assert('button is NOT disabled after validation failure', !validationTest.btnDisabled);

  // Test billingResetForm
  await evaluate(`billingResetForm()`);
  await new Promise(r => setTimeout(r, 300));

  const resetResult = await evaluate(`
    (() => {
      const btn = document.getElementById('btnCreateBill');
      const labelSlot = btn.querySelector('.dynamic-btn-label-slot');
      return {
        disabled: btn.disabled,
        text: labelSlot.textContent.trim(),
        isIdle: labelSlot.textContent.includes('GENERATE BILL')
      };
    })()
  `);

  assert('billingResetForm restores button to enabled idle state', !resetResult.disabled && resetResult.isIdle);

  console.log('\n13. Testing Receipt Preview Dynamic Buttons...');
  const previewButtonsResult = await evaluate(`
    (() => {
      // Render sample receipt preview
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
        printExists: !!printBtn,
        printHeight: printBtn ? window.getComputedStyle(printBtn).height : null,
        printRadius: printBtn ? window.getComputedStyle(printBtn).borderRadius : null,
        printHasDynamicClass: printBtn ? printBtn.classList.contains('dynamic-btn') : false,
        printHasPrimaryClass: printBtn ? printBtn.classList.contains('dynamic-btn-primary') : false,
        nextExists: !!nextBtn,
        nextHeight: nextBtn ? window.getComputedStyle(nextBtn).height : null,
        nextRadius: nextBtn ? window.getComputedStyle(nextBtn).borderRadius : null,
        nextHasDynamicClass: nextBtn ? nextBtn.classList.contains('dynamic-btn') : false,
        nextHasSecondaryClass: nextBtn ? nextBtn.classList.contains('dynamic-btn-secondary') : false
      };
    })()
  `);

  assert('btnPrintReceipt has height 28px', previewButtonsResult.printHeight === '28px', `got ${previewButtonsResult.printHeight}`);
  assert('btnPrintReceipt has radius 8px', previewButtonsResult.printRadius === '8px', `got ${previewButtonsResult.printRadius}`);
  assert('btnPrintReceipt has dynamic-btn-primary', previewButtonsResult.printHasPrimaryClass);
  assert('btnNextBill has height 28px', previewButtonsResult.nextHeight === '28px', `got ${previewButtonsResult.nextHeight}`);
  assert('btnNextBill has radius 8px', previewButtonsResult.nextRadius === '8px', `got ${previewButtonsResult.nextRadius}`);
  assert('btnNextBill has dynamic-btn-secondary', previewButtonsResult.nextHasSecondaryClass);

  // Test voided receipt preview button style
  const voidedButtonsResult = await evaluate(`
    (() => {
      const voidedRec = {
        id: 9999,
        receiptNo: 'BILL-9999',
        date: '11/10/2026',
        voided: true,
        voidReason: 'Test Void',
        category: 'വഴിപാട്',
        item: 'പുഷ്പാഞ്ജലി',
        quantity: 1,
        totalAmount: 50,
        paymentMode: 'Cash'
      };
      renderBillingReceiptPreview(voidedRec);

      const printBtn = document.getElementById('btnPrintReceipt');
      return {
        hasDangerClass: printBtn ? printBtn.classList.contains('dynamic-btn-danger') : false,
        text: printBtn ? printBtn.textContent : ''
      };
    })()
  `);

  assert('voided receipt print button has dynamic-btn-danger class', voidedButtonsResult.hasDangerClass);
  assert('voided receipt print button label is "PRINT VOIDED RECEIPT"', voidedButtonsResult.text.includes('PRINT VOIDED RECEIPT'));

  // Clean preview back to null
  await evaluate(`renderBillingReceiptPreview(null)`);

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  ws.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
