const http = require('http');

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) return console.error('No tab');

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

  await send('Console.enable');
  await send('Runtime.enable');
  ws.addEventListener('message', (e) => {
    const d = JSON.parse(e.data);
    if (d.method === 'Console.messageAdded') {
      console.log('CONSOLE:', d.params.message.text);
    }
    if (d.method === 'Runtime.consoleAPICalled') {
      console.log('CONSOLE API:', d.params.type, d.params.args.map(a => a.value || a.description).join(' '));
    }
  });

  console.log('Calling navigate("billing")...');
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        console.log('Start navigate billing');
        await navigate('billing');
        console.log('Finished navigate billing, current view:', CURRENT_VIEW);
        const btn = document.getElementById('btnCreateBill');
        console.log('btnCreateBill found:', !!btn);
        return {
          view: CURRENT_VIEW,
          btnFound: !!btn,
          mainHtml: document.getElementById('app-main') ? document.getElementById('app-main').innerHTML.slice(0, 300) : null
        };
      } catch (e) {
        console.error('Error navigating to billing:', e.stack || e);
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Nav result:', res.result.value);
  await new Promise(r => setTimeout(r, 1000));
  ws.close();
}

main().catch(console.error);
