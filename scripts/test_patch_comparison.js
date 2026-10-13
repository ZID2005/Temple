async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result ? res.result.value : undefined;
  }

  console.log('Testing Candidate Optimization in browser...');

  // 1. Measure BEFORE optimization (Baseline)
  await evaluate(`ReceiptPrinter.close();`);
  await evaluate(`ReceiptPrinter.setFeedMode('smooth');`);
  await evaluate(`__startFrameRecording('Baseline Before');`);
  await evaluate(`ReceiptPrinter.startPrinting({
    id: 9993,
    receiptNo: 'BILL-9993',
    date: '12/10/2026',
    time: '11:05 AM',
    devoteeName: 'സുരേഷ് കുമാർ (Suresh)',
    star: 'രോഹിണി',
    category: 'വഴിപാട്',
    item: 'പുഷ്പാഞ്ജലി',
    quantity: 1,
    rate: 30,
    totalAmount: 30,
    paymentMode: 'Cash'
  });`);

  await new Promise(r => setTimeout(r, 2600));
  const beforeResult = await evaluate(`__stopFrameRecording()`);
  await evaluate(`ReceiptPrinter.close();`);
  await new Promise(r => setTimeout(r, 400));

  // 2. Apply patch in browser memory
  const patchCode = `(() => {
    // A. Update CSS keyframe to remove intermediate opacity
    for (const s of Array.from(document.styleSheets)) {
      try {
        for (let i = 0; i < (s.cssRules || []).length; i++) {
          const r = s.cssRules[i];
          if (r.type === CSSRule.KEYFRAMES_RULE && r.name === 'receiptPaperFeedSmooth') {
            s.deleteRule(i);
            s.insertRule(\`@keyframes receiptPaperFeedSmooth {
              0% { transform: translateY(calc(-100% + 2px)); }
              100% { transform: translateY(0%); }
            }\`, i);
            break;
          }
        }
      } catch (e) {}
    }

    // B. Progress bar transform styling
    const pf = document.getElementById('printerProgressFill');
    if (pf) {
      pf.style.transformOrigin = 'left center';
      pf.style.willChange = 'transform';
      pf.style.width = '100%';
      pf.style.transform = 'scaleX(0)';
    }

    // C. Patch ReceiptPrinter methods
    const origStartPrinting = ReceiptPrinter.startPrinting;
    ReceiptPrinter.startPrinting = function(billingRecord) {
      this.init();
      this.state = 'printing';
      this._startTime = performance.now();
      window._printerStartTime = this._startTime;
      this._lastBillRecord = billingRecord || this._lastBillRecord || (typeof currentBillingReceipt !== 'undefined' ? currentBillingReceipt : null);
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      if (this._animEndHandler) {
        const oldSheet = el('printerReceiptSheet');
        if (oldSheet) oldSheet.removeEventListener('animationend', this._animEndHandler);
        this._animEndHandler = null;
      }

      const overlay = el('receiptPrinterOverlay');
      const root = document.querySelector('.receipt-printer-root');
      const chassis = el('receiptPrinterChassis');
      const led = el('printerStatusLed');
      const label = el('printerStatusLabel');
      const subtext = el('printerScreenSubtext');
      const processingPanel = el('printerProcessingPanel');
      const ejector = el('printerPaperEjector');
      const sheet = el('printerReceiptSheet');
      const errorPanel = el('printerErrorPanel');
      const progressFill = el('printerProgressFill');

      if (root) root.dataset.stage = 'printing';

      if (overlay) {
        overlay.style.visibility = 'visible';
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
      }

      if (processingPanel) processingPanel.style.display = 'none';
      if (errorPanel) errorPanel.style.display = 'none';
      if (ejector) ejector.style.display = 'block';

      if (led) led.className = 'printer-status-led printing';
      if (label) label.textContent = 'PRINTING (58mm)';
      if (subtext) subtext.textContent = 'Feeding 58mm thermal receipt paper…';
      if (chassis) chassis.classList.remove('error-state');

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isSmooth = (this.feedMode === 'smooth');
      const feedDuration = prefersReducedMotion ? 50 : (isSmooth ? 2200 : 2400);

      if (sheet) {
        sheet.classList.remove('fed', 'feeding', 'feed-stepped', 'feed-smooth');
        sheet.style.animation = '';
        sheet.style.animationName = '';
        sheet.style.animationDuration = '';
        sheet.style.transform = '';

        // Double rAF ensures CSS engine registers clean class reset without forced offsetWidth reflow
        requestAnimationFrame(() => {
          sheet.classList.add('feeding', isSmooth ? 'feed-smooth' : 'feed-stepped');
          sheet.style.animationDuration = \`\${feedDuration}ms\`;

          const onAnimEnd = (evt) => {
            if (evt && evt.target !== sheet) return;
            sheet.removeEventListener('animationend', onAnimEnd);
            this._animEndHandler = null;
            if (this.state === 'printing') {
              // Yield one frame so compositor draws terminal resting frame before DOM mutation
              requestAnimationFrame(() => {
                this.setReady();
              });
            }
          };
          this._animEndHandler = onAnimEnd;
          sheet.addEventListener('animationend', onAnimEnd, { once: true });
        });
      }

      if (progressFill) {
        progressFill.style.transition = 'none';
        progressFill.style.transform = 'scaleX(0)';
        const progressEase = isSmooth ? 'cubic-bezier(0.33, 0.0, 0.2, 1)' : 'linear';
        requestAnimationFrame(() => {
          progressFill.style.transition = \`transform \${feedDuration}ms \${progressEase}\`;
          requestAnimationFrame(() => {
            progressFill.style.transform = 'scaleX(1)';
          });
        });
      }

      const announcer = el('printerLiveAnnouncer');
      if (announcer) {
        announcer.textContent = 'Transaction saved. Feeding 58mm thermal receipt paper.';
      }

      this._timer = setTimeout(() => {
        if (this.state === 'printing') {
          if (this._animEndHandler && sheet) {
            sheet.removeEventListener('animationend', this._animEndHandler);
            this._animEndHandler = null;
          }
          this.setReady();
        }
      }, feedDuration + 80);
    };
  })()`;

  await evaluate(patchCode);

  // 3. Measure AFTER optimization
  await evaluate(`__startFrameRecording('Optimized After');`);
  await evaluate(`ReceiptPrinter.startPrinting({
    id: 9994,
    receiptNo: 'BILL-9994',
    date: '12/10/2026',
    time: '11:05 AM',
    devoteeName: 'സുരേഷ് കുമാർ (Suresh)',
    star: 'രോഹിണി',
    category: 'വഴിപാട്',
    item: 'പുഷ്പാഞ്ജലി',
    quantity: 1,
    rate: 30,
    totalAmount: 30,
    paymentMode: 'Cash'
  });`);

  await new Promise(r => setTimeout(r, 2600));
  const afterResult = await evaluate(`__stopFrameRecording()`);
  await evaluate(`ReceiptPrinter.close();`);

  console.log('=== BEFORE (Baseline) ===');
  console.log(JSON.stringify(beforeResult, null, 2));

  console.log('\n=== AFTER (Optimized) ===');
  console.log(JSON.stringify(afterResult, null, 2));

  ws.close();
}
main().catch(console.error);
