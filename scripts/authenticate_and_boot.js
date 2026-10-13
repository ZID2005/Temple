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

  console.log('Authenticating and booting...');
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        if (!firebase.auth().currentUser) {
          try {
            await firebase.auth().signInWithEmailAndPassword('test@temple.org', 'password123');
          } catch(e) {
            await firebase.auth().createUserWithEmailAndPassword('test@temple.org', 'password123');
          }
        }
      } catch(e) {
        console.error('Auth error:', e);
      }
      if (!db && typeof boot === 'function') {
        await boot();
      }
      return {
        user: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
        dbReady: !!db,
        appBooted: !!window._appBooted,
        currentView: CURRENT_VIEW
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Result:', res.result ? res.result.value : res);
  ws.close();
}

main().catch(console.error);
