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

  console.log('--- Logging Animation Lifecycle Events ---');
  await send('Page.bringToFront');

  const setupHarness = `(() => {
    window.__lifecycleEvents = [];
    const sheet = document.getElementById('printerReceiptSheet');
    
    ['animationstart', 'animationend', 'animationcancel', 'transitionend'].forEach(type => {
      sheet.addEventListener(type, (e) => {
        window.__lifecycleEvents.push({
          type,
          animationName: e.animationName || e.propertyName,
          elapsedTime: e.elapsedTime,
          time: performance.now(),
          transform: getComputedStyle(sheet).transform
        });
      });
    });

    const origSetReady = window.ReceiptPrinter.setReady;
    window.ReceiptPrinter.setReady = function(...args) {
      window.__lifecycleEvents.push({
        type: 'setReady_called',
        time: performance.now(),
        transform: getComputedStyle(sheet).transform,
        caller: new Error().stack.split('\\n')[2]
      });
      return origSetReady.apply(this, args);
    };
  })()`;

  await send('Runtime.evaluate', { expression: setupHarness });

  // Run smooth printing
  await send('Runtime.evaluate', {
    expression: `(() => {
      ReceiptPrinter.setFeedMode('smooth');
      ReceiptPrinter.startPrinting({
        id: 9001,
        receiptNo: 'BILL-9001',
        date: '12/10/2026',
        time: '10:55 AM',
        devoteeName: 'രാമചന്ദ്രൻ (Ramachandran)',
        star: 'അശ്വതി',
        category: 'വഴിപാട്',
        item: 'പുഷ്പാഞ്ജലി',
        quantity: 1,
        rate: 30,
        totalAmount: 30,
        paymentMode: 'Cash'
      });
    })()`
  });

  await new Promise(r => setTimeout(r, 2600));

  const events = await send('Runtime.evaluate', {
    expression: `window.__lifecycleEvents.map(e => ({
      ...e,
      relTime: e.time - window._printerStartTime
    }))`,
    returnByValue: true
  });

  console.log('Events:');
  console.log(JSON.stringify(events.result.value, null, 2));

  await send('Runtime.evaluate', { expression: `ReceiptPrinter.close()` });
  ws.close();
}
main().catch(console.error);
