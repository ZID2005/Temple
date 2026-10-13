const http = require('http');

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  if (!appTab) {
    console.error('No tab found!');
    return;
  }
  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const cur = id++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === cur) { ws.removeEventListener('message', h); resolve(d.result); }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  }
  const res = await send('Runtime.evaluate', {
    expression: `(() => ({
      url: window.location.href,
      booted: window._appBooted,
      currentView: typeof CURRENT_VIEW !== 'undefined' ? CURRENT_VIEW : null,
      title: document.title,
      auth: typeof auth !== 'undefined' && auth && auth.currentUser ? auth.currentUser.email : null,
      loginVisible: document.getElementById('loginModal') ? document.getElementById('loginModal').style.display : 'none',
      splashVisible: document.getElementById('splashScreen') ? document.getElementById('splashScreen').style.display : 'none'
    }))()`,
    returnByValue: true
  });
  console.log('Page state:', res);
  ws.close();
}

main().catch(console.error);
