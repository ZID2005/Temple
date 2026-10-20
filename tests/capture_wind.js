const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function captureWindPhase() {
  const port = 9240;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--window-size=1280,800',
    'file:///D:/Temple/Temple_Accounts-1.html'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1800));
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const pageTarget = targets.find(t => t.type === 'page');
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function send(method, params = {}) {
      return new Promise(r => {
        const i = id++;
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === i) r(msg);
        };
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    // Wait until t = 11.0s (during active wind sweep)
    console.log('Waiting for active wind sweep (t ~11.0s)...');
    await new Promise(r => setTimeout(r, 9200));
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join('D:\\Temple\\tests', 'step33_116_app_desktop_04_wind_dispersal.png');
    fs.writeFileSync(p, Buffer.from(res.result.data, 'base64'));
    console.log(`Saved wind phase screenshot: (${fs.statSync(p).size} bytes)`);

    ws.close();
  } finally {
    chrome.kill();
  }
}

captureWindPhase().catch(console.error);
