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

  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  console.log('Testing animation frame rate with focus enabled...');
  await evaluate(`(() => {
    window.__frames = [];
    let start = performance.now();
    ReceiptPrinter.setFeedMode('smooth');
    ReceiptPrinter.startPrinting({
      id: 9991,
      receiptNo: 'BILL-9991',
      date: '12/10/2026',
      time: '11:00 AM',
      devoteeName: 'സുരേഷ് കുമാർ (Suresh)',
      star: 'രോഹിണി',
      category: 'വഴിപാട്',
      item: 'പുഷ്പാഞ്ജലി',
      quantity: 1,
      rate: 30,
      totalAmount: 30,
      paymentMode: 'Cash'
    });

    const record = (now) => {
      window.__frames.push(now - start);
      start = now;
      if (ReceiptPrinter.state === 'printing') {
        requestAnimationFrame(record);
      }
    };
    requestAnimationFrame(record);
  })()`);

  await new Promise(r => setTimeout(r, 2600));

  const stats = await evaluate(`(() => {
    const f = window.__frames;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const spikes = f.filter(d => d > 25);
    return {
      totalFrames: f.length,
      avgDelta: Number(avg.toFixed(2)),
      avgFPS: Number((1000 / avg).toFixed(1)),
      maxDelta: Number(Math.max(...f).toFixed(2)),
      spikes: spikes.map(s => Number(s.toFixed(1))),
      first10: f.slice(0, 10).map(s => Number(s.toFixed(1))),
      last10: f.slice(-10).map(s => Number(s.toFixed(1)))
    };
  })()`);

  console.log('Stats:', stats);
  await evaluate(`ReceiptPrinter.close()`);
  ws.close();
}
main().catch(console.error);
