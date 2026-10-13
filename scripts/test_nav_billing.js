const http = require('http');

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) return console.error('No app tab');

  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          ws.removeEventListener('message', h);
          if (d.error) reject(d.error);
          else resolve(d.result);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  // Reload and check
  console.log('Navigating to billing...');
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      if (typeof navigate === 'function') {
        await navigate('billing');
      }
      return {
        view: typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null,
        mainHtmlLength: document.getElementById('app-main') ? document.getElementById('app-main').innerHTML.length : 0,
        billingGrid: !!document.querySelector('.billing-grid'),
        billingExpandedGrid: !!document.querySelector('.billing-expanded-grid'),
        itemSelect: !!document.getElementById('itemSelect'),
        btnCreateBill: !!document.getElementById('btnCreateBill'),
        receiptPrinterOverlay: !!document.getElementById('receiptPrinterOverlay')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Result:', res.result ? res.result.value : res);
  ws.close();
}

main().catch(console.error);
