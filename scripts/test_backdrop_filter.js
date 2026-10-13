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

  console.log('Testing backdrop-filter effect...');
  // Test with backdrop-filter disabled
  await evaluate(`(() => {
    const b = document.querySelector('.receipt-printer-backdrop');
    if (b) {
      b.style.backdropFilter = 'none';
      b.style.webkitBackdropFilter = 'none';
    }
  })()`);

  const res = await evaluate(`(() => {
    return new Promise(resolve => {
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
        } else {
          const f = window.__frames;
          const avg = f.reduce((a, b) => a + b, 0) / f.length;
          resolve({
            name: 'Backdrop Filter Disabled',
            totalFrames: f.length,
            avgDelta: Number(avg.toFixed(2)),
            avgFPS: Number((1000 / avg).toFixed(1)),
            maxDelta: Number(Math.max(...f).toFixed(2))
          });
        }
      };
      requestAnimationFrame(record);
    });
  })()`);

  console.log('Result without backdrop-filter:');
  console.log(JSON.stringify(res, null, 2));

  await evaluate(`ReceiptPrinter.close();`);
  // Restore backdrop filter
  await evaluate(`(() => {
    const b = document.querySelector('.receipt-printer-backdrop');
    if (b) {
      b.style.backdropFilter = '';
      b.style.webkitBackdropFilter = '';
    }
  })()`);

  ws.close();
}
main().catch(console.error);
