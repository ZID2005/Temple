const http = require('http');
const fs = require('fs');
const path = require('path');

async function getBrowserWs() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) throw new Error('App tab not found on port 9222');
  return new WebSocket(appTab.webSocketDebuggerUrl);
}

async function capture() {
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

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
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
    const outPath = path.join(__dirname, '..', filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot to ${outPath} (${buffer.length} bytes)`);
  }

  console.log('Navigating to billing...');
  await evaluate(`(async () => { await navigate('billing'); })()`);
  await new Promise(r => setTimeout(r, 600));

  console.log('Triggering processing state on ReceiptPrinter...');
  await evaluate(`
    ReceiptPrinter.startProcessing({
      devoteeName: 'അനന്തപദ്മനാഭൻ (Baseline)',
      star: 'അശ്വതി',
      category: 'വഴിപാട്',
      item: 'പുഷ്പാഞ്ജലി',
      qty: 2,
      totalAmount: 100,
      paymentMode: 'Cash'
    });
  `);
  await new Promise(r => setTimeout(r, 400));
  await takeScreenshot('step_33_25_baseline_processing.png');

  console.log('Triggering printing state on ReceiptPrinter...');
  await evaluate(`
    ReceiptPrinter.startPrinting({
      id: 8888,
      receiptNo: 'BILL-8888',
      date: '11/10/2026',
      time: '08:30 PM',
      devoteeName: 'അനന്തപദ്മനാഭൻ (Baseline)',
      star: 'അശ്വതി',
      category: 'വഴിപാട്',
      item: 'പുഷ്പാഞ്ജലി',
      quantity: 2,
      rate: 50,
      totalAmount: 100,
      paymentMode: 'Cash'
    });
  `);
  await new Promise(r => setTimeout(r, 1200));
  await takeScreenshot('step_33_25_baseline_printing.png');

  console.log('Waiting for animation completion (ready state)...');
  await new Promise(r => setTimeout(r, 2500));
  await takeScreenshot('step_33_25_baseline_ready.png');

  await evaluate(`ReceiptPrinter.close();`);
  ws.close();
  console.log('Baseline capture complete.');
}

capture().catch(console.error);
