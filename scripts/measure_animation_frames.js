const fs = require('fs');
const path = require('path');

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function run() {
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

  console.log('--- Initializing Browser Measurement Session ---');
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Reloading browser tab with latest Temple_Accounts-1.html...');
  loadFired = false;
  await send('Page.reload', { ignoreCache: true });
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

  // Navigate to billing
  console.log('Navigating to billing view...');
  await evaluate(`(async () => {
    if (typeof navigate === 'function') {
      await navigate('billing');
    }
  })()`);
  await new Promise(r => setTimeout(r, 1200));

  // Inject measurement harness into page
  const harnessCode = `(() => {
    window.__perfMeasurements = {
      longTasks: [],
      frames: [],
      events: [],
      recording: false,
      observer: null
    };

    try {
      if (window.__perfObserver) {
        window.__perfObserver.disconnect();
      }
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (window.__perfMeasurements.recording) {
            window.__perfMeasurements.longTasks.push({
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration,
              attribution: entry.attribution ? entry.attribution.map(a => a.name || a.containerType) : []
            });
          }
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
      window.__perfObserver = obs;
    } catch (e) {
      console.warn('LongTask observer not supported:', e);
    }

    window.__startFrameRecording = function(label) {
      window.__perfMeasurements = {
        label,
        longTasks: [],
        frames: [],
        events: [],
        recording: true,
        startTime: performance.now()
      };

      const recordFrame = (now) => {
        if (!window.__perfMeasurements.recording) return;
        const lastFrame = window.__perfMeasurements.frames.length > 0 
          ? window.__perfMeasurements.frames[window.__perfMeasurements.frames.length - 1].time 
          : window.__perfMeasurements.startTime;
        const delta = now - lastFrame;
        const elapsed = now - window.__perfMeasurements.startTime;

        window.__perfMeasurements.frames.push({
          time: now,
          elapsed,
          delta
        });

        requestAnimationFrame(recordFrame);
      };

      requestAnimationFrame(recordFrame);
    };

    window.__stopFrameRecording = function() {
      window.__perfMeasurements.recording = false;
      const m = window.__perfMeasurements;
      const frames = m.frames;
      if (frames.length === 0) return { error: 'No frames recorded' };

      const deltas = frames.map(f => f.delta);
      const totalTime = frames[frames.length - 1].elapsed;
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const maxDelta = Math.max(...deltas);
      const minDelta = Math.min(...deltas);
      const sorted = [...deltas].sort((a, b) => a - b);
      const medianDelta = sorted[Math.floor(sorted.length / 2)];
      const p95Delta = sorted[Math.floor(sorted.length * 0.95)];
      const janks20 = deltas.filter(d => d > 20).length;
      const janks25 = deltas.filter(d => d > 25).length;
      const janks33 = deltas.filter(d => d > 33.3).length;
      const janks50 = deltas.filter(d => d > 50).length;

      // Group frames into phases
      const earlyFrames = frames.filter(f => f.elapsed <= 400);
      const midFrames = frames.filter(f => f.elapsed > 400 && f.elapsed <= 1800);
      const finalFrames = frames.filter(f => f.elapsed > 1800 && f.elapsed <= 2200);
      const readyTransitionFrames = frames.filter(f => f.elapsed > 2200);

      const summarizePhase = (phaseFrames) => {
        if (!phaseFrames.length) return { count: 0, avg: 0, max: 0, median: 0, janks20: 0, janks25: 0, janks33: 0, janks50: 0 };
        const pDeltas = phaseFrames.map(f => f.delta);
        const pSorted = [...pDeltas].sort((a, b) => a - b);
        return {
          count: phaseFrames.length,
          avg: Number((pDeltas.reduce((a, b) => a + b, 0) / pDeltas.length).toFixed(2)),
          median: Number(pSorted[Math.floor(pSorted.length / 2)].toFixed(2)),
          max: Number(Math.max(...pDeltas).toFixed(2)),
          janks20: pDeltas.filter(d => d > 20).length,
          janks25: pDeltas.filter(d => d > 25).length,
          janks33: pDeltas.filter(d => d > 33.3).length,
          janks50: pDeltas.filter(d => d > 50).length,
          spikes: phaseFrames.filter(f => f.delta > 20).map(f => ({ elapsed: Number(f.elapsed.toFixed(1)), delta: Number(f.delta.toFixed(1)) }))
        };
      };

      return {
        label: m.label,
        totalFrames: frames.length,
        totalTime: Number(totalTime.toFixed(2)),
        avgFPS: Number((1000 / avgDelta).toFixed(1)),
        avgDelta: Number(avgDelta.toFixed(2)),
        medianDelta: Number(medianDelta.toFixed(2)),
        p95Delta: Number(p95Delta.toFixed(2)),
        maxDelta: Number(maxDelta.toFixed(2)),
        minDelta: Number(minDelta.toFixed(2)),
        janks20,
        janks25,
        janks33,
        janks50,
        phases: {
          early: summarizePhase(earlyFrames),
          mid: summarizePhase(midFrames),
          finalApproach: summarizePhase(finalFrames),
          readyTransition: summarizePhase(readyTransitionFrames)
        },
        longTasks: m.longTasks,
        events: m.events
      };
    };
  })()`;

  await evaluate(harnessCode);
  console.log('Measurement harness injected.');

  // Test 1: Check ReceiptPrinter defaults and inspect current state
  const printerInfo = await evaluate(`(() => {
    return {
      feedMode: ReceiptPrinter.feedMode,
      state: ReceiptPrinter.state,
      sheetTransform: getComputedStyle(document.getElementById('printerReceiptSheet')).transform,
      sheetWillChange: getComputedStyle(document.getElementById('printerReceiptSheet')).willChange,
      ejectorOverflow: getComputedStyle(document.getElementById('printerPaperEjector')).overflow
    };
  })()`);
  console.log('\n--- ReceiptPrinter Current Setup ---');
  console.log(JSON.stringify(printerInfo, null, 2));

  // Test 2: Measure Replay in Smooth Mode (isolated from form submit)
  console.log('\n--- Measuring Test 1: Standalone Replay in Smooth Mode ---');
  await evaluate(`ReceiptPrinter.setFeedMode('smooth');`);
  await evaluate(`__startFrameRecording('Smooth Replay (Isolated)');`);
  await evaluate(`ReceiptPrinter.startPrinting({
    id: 8881,
    receiptNo: 'BILL-8881',
    date: '12/10/2026',
    time: '10:50 AM',
    devoteeName: 'ആനന്ദൻ നമ്പൂതിരി (Anandan)',
    star: 'അശ്വതി',
    category: 'വഴിപാട്',
    item: 'പുഷ്പാഞ്ജലി',
    quantity: 1,
    rate: 30,
    totalAmount: 30,
    paymentMode: 'Cash'
  });`);

  await new Promise(r => setTimeout(r, 2600));
  const smoothReplayResult = await evaluate(`__stopFrameRecording()`);
  console.log('Smooth Replay Result:');
  console.log(JSON.stringify(smoothReplayResult, null, 2));

  await evaluate(`ReceiptPrinter.close();`);
  await new Promise(r => setTimeout(r, 400));

  // Test 3: Measure Replay in Stepped Mode
  console.log('\n--- Measuring Test 2: Standalone Replay in Stepped Mode ---');
  await evaluate(`ReceiptPrinter.setFeedMode('stepped');`);
  await evaluate(`__startFrameRecording('Stepped Replay (Isolated)');`);
  await evaluate(`ReceiptPrinter.startPrinting({
    id: 8882,
    receiptNo: 'BILL-8882',
    date: '12/10/2026',
    time: '10:50 AM',
    devoteeName: 'ആനന്ദൻ നമ്പൂതിരി (Anandan)',
    star: 'അശ്വതി',
    category: 'വഴിപാട്',
    item: 'പുഷ്പാഞ്ജലി',
    quantity: 1,
    rate: 30,
    totalAmount: 30,
    paymentMode: 'Cash'
  });`);

  await new Promise(r => setTimeout(r, 2800));
  const steppedReplayResult = await evaluate(`__stopFrameRecording()`);
  console.log('Stepped Replay Result:');
  console.log(JSON.stringify(steppedReplayResult, null, 2));

  await evaluate(`ReceiptPrinter.close();`);
  await new Promise(r => setTimeout(r, 400));

  // Test 4: Measure Full Billing Submission Flow with Smooth Feed
  console.log('\n--- Measuring Test 3: Full Bill Creation Flow (Smooth Feed) ---');
  await evaluate(`ReceiptPrinter.setFeedMode('smooth');`);

  // Fill billing form authentically
  await evaluate(`(() => {
    setBillingCategory('വഴിപാട്');
    const itemSel = document.getElementById('itemSelect');
    if (itemSel && itemSel.options.length > 0) {
      itemSel.selectedIndex = 0;
    }
    if (typeof updatePrice === 'function') updatePrice();
    const nameInp = document.getElementById('name');
    if (nameInp) nameInp.value = 'സുരേഷ് കുമാർ (Suresh)';
    const starInp = document.getElementById('star');
    if (starInp) starInp.value = 'രോഹിണി';
    const qtyInp = document.getElementById('qty');
    if (qtyInp) qtyInp.value = '2';
    if (typeof updatePrice === 'function') updatePrice();
    if (typeof setBillingPaymentMode === 'function') setBillingPaymentMode('Cash');
  })()`);
  await new Promise(r => setTimeout(r, 300));

  // Hook refreshBillingHistory timing to see when it runs relative to frames
  await evaluate(`(() => {
    const origRefresh = window.refreshBillingHistory;
    window.__refreshTiming = null;
    window.refreshBillingHistory = async function(...args) {
      const t0 = performance.now();
      const res = await origRefresh.apply(this, args);
      const t1 = performance.now();
      window.__refreshTiming = {
        start: t0,
        end: t1,
        duration: t1 - t0,
        relStart: window.__perfMeasurements.recording ? t0 - window.__perfMeasurements.startTime : null
      };
      return res;
    };
  })()`);

  // Start recording right before form submit
  await evaluate(`__startFrameRecording('Full Billing Flow (Smooth)');`);
  await evaluate(`billingSubmitForm();`);

  // Wait for submission + animation to settle
  await new Promise(r => setTimeout(r, 3500));
  const fullFlowResult = await evaluate(`__stopFrameRecording()`);
  const refreshTiming = await evaluate(`window.__refreshTiming`);
  console.log('Full Billing Flow Result:');
  console.log(JSON.stringify(fullFlowResult, null, 2));
  console.log('Refresh Billing History Timing:');
  console.log(JSON.stringify(refreshTiming, null, 2));

  await evaluate(`ReceiptPrinter.close();`);
  ws.close();
}

run().catch(err => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
