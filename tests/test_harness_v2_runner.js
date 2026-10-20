const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function testRunner(width = 1280, height = 800, prefix = 'desktop') {
  console.log(`\nStarting test for ${prefix} (${width}x${height})...`);
  const port = 9225;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    `--window-size=${width},${height}`,
    'file:///D:/Temple/tests/test_harness_v2.html'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));
    const targets = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('Target page not found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log(`[${prefix} CONSOLE]`, msg.params.args.map(a => a.value || a.description).join(' '));
      }
    };

    function send(method, params = {}) {
      return new Promise(r => {
        const i = id++;
        callbacks.set(i, r);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    async function snap(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const p = path.join('D:\\Temple\\tests', filename);
      fs.writeFileSync(p, Buffer.from(res.result.data, 'base64'));
      console.log(`Saved screenshot: ${filename} (${fs.statSync(p).size} bytes)`);
    }

    // 1. Drawing phase at 3.0s
    await new Promise(r => setTimeout(r, 2000)); // total ~3.5s from start
    await snap(`${prefix}_3s_drawing.png`);

    // 2. Greeting appearing + blossom at ~5.0s
    await new Promise(r => setTimeout(r, 2000)); // total ~5.5s
    await snap(`${prefix}_5s_blossom.png`);

    // 3. Completed Hold phase with greeting clearly readable at ~7.5s
    await new Promise(r => setTimeout(r, 2500)); // total ~8.0s
    await snap(`${prefix}_8s_hold.png`);

    // 4. Wind sweep phase at ~10.5s
    await new Promise(r => setTimeout(r, 2800)); // total ~10.8s
    await snap(`${prefix}_11s_wind.png`);

    // 5. Final login screen reveal complete at ~14.0s
    await new Promise(r => setTimeout(r, 3500)); // total ~14.3s
    await snap(`${prefix}_14s_revealed_login.png`);

    // Check DOM state
    const evalResult = await send('Runtime.evaluate', {
      expression: `({
        rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
        rwComputed: window.getComputedStyle(document.getElementById('rangoli-welcome')).display,
        rwGatePhase: document.getElementById('rangoli-welcome')?.getAttribute('data-phase'),
        authExpDisplay: window.getComputedStyle(document.getElementById('auth-experience')).display,
        cardVisible: !!document.querySelector('.login-card')
      })`,
      returnByValue: true
    });
    console.log(`${prefix} Final DOM State:`, evalResult.result?.result?.value);

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function main() {
  await testRunner(1280, 800, 'desktop_v2');
  await testRunner(375, 667, 'mobile_v2');
  console.log('\nAll test harness v2 runs completed!');
}

main().catch(console.error);
