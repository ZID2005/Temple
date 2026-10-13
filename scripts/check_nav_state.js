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

  // Check state
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        view: typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null,
        btnCreateBill: !!document.getElementById('btnCreateBill'),
        htmlLength: document.body.innerHTML.length,
        appMain: document.getElementById('app-main') ? document.getElementById('app-main').innerHTML.slice(0, 200) : null
      };
    })()`,
    returnByValue: true
  });
  console.log('State:', res.result.value);
  ws.close();
}

main().catch(console.error);
