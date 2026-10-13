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

    // Also copy to artifact directory
    const artifactDir = 'C:\\Users\\sanal\\.gemini\\antigravity-ide\\brain\\ebc5db48-f8e1-41a6-bab2-347eeb99facb';
    if (fs.existsSync(artifactDir)) {
      const artPath = path.join(artifactDir, filename);
      fs.writeFileSync(artPath, buffer);
      console.log(`Copied to artifact dir: ${artPath}`);
    }
  }

  console.log('1. Navigating to billing view...');
  await evaluate(`(async () => { await navigate('billing'); })()`);
  await new Promise(r => setTimeout(r, 600));

  console.log('2. Triggering processing state on ReceiptPrinter...');
  await evaluate(`
    ReceiptPrinter.startProcessing({
      devoteeName: 'ശ്രീധരൻ നമ്പൂതിരി (Sreedharan)',
      star: 'രോഹിണി',
      category: 'വഴിപാട്',
      item: 'നെയ്‌വിളക്ക്',
      qty: 2,
      totalAmount: 80,
      paymentMode: 'Cash'
    });
  `);
  await new Promise(r => setTimeout(r, 400));
  await takeScreenshot('step_33_25_updated_processing.png');

  console.log('3. Triggering printing state on ReceiptPrinter...');
  await evaluate(`
    ReceiptPrinter.startPrinting({
      id: 9999,
      receiptNo: 'BILL-9999',
      date: '11/10/2026',
      time: '08:45 PM',
      devoteeName: 'ശ്രീധരൻ നമ്പൂതിരി (Sreedharan)',
      star: 'രോഹിണി',
      category: 'വഴിപാട്',
      item: 'നെയ്‌വിളക്ക്',
      quantity: 2,
      rate: 40,
      totalAmount: 80,
      paymentMode: 'Cash'
    });
  `);
  await new Promise(r => setTimeout(r, 1200));
  await takeScreenshot('step_33_25_updated_printing.png');

  console.log('4. Waiting for animation completion (ready state)...');
  await new Promise(r => setTimeout(r, 2000));
  await takeScreenshot('step_33_25_updated_ready.png');

  console.log('5. Capturing mobile viewport (375x812)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 500));
  await takeScreenshot('step_33_25_updated_mobile.png');

  // Reset emulation metrics back to desktop
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('Cleared device metrics override.');

  await evaluate(`ReceiptPrinter.close()`);
  console.log('Closed printer overlay. Done!');
  ws.close();
  process.exit(0);
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
