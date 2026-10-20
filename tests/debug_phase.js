const http = require('http');
const { spawn } = require('child_process');

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9231',
    'file:///D:/Temple/tests/test_harness_step33_116.html'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));
    const targets = await new Promise(r => {
      http.get('http://127.0.0.1:9231/json', res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => r(JSON.parse(d)));
      });
    });

    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        cb(msg);
      }
    };

    function send(m, p = {}) {
      return new Promise(r => {
        const i = id++;
        callbacks.set(i, r);
        ws.send(JSON.stringify({ id: i, method: m, params: p }));
      });
    }

    for (let s = 2; s <= 16; s += 2) {
      await new Promise(r => setTimeout(r, 2000));
      const res = await send('Runtime.evaluate', {
        expression: `({
          timeSec: Math.round(performance.now() / 100) / 10,
          phase: document.querySelector('.rgp-gate')?.getAttribute('data-phase'),
          rootDisplay: document.getElementById('rangoli-welcome')?.style.display,
          rootDismissed: document.getElementById('rangoli-welcome')?.classList.contains('rgp-dismissed'),
          loginCardVisible: !!document.querySelector('.login-card')
        })`,
        returnByValue: true
      });
      console.log(`[t = ${s}s]`, res.result?.result?.value);
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

test().catch(console.error);
