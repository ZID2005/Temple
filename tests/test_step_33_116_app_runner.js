const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function capturePhases(url, width, height, isMobile, prefix) {
  console.log(`\n================================================================`);
  console.log(`Starting Phase Capture for: ${prefix} (${width}x${height})`);
  console.log(`Target: ${url}`);
  console.log(`================================================================`);

  const port = isMobile ? 9238 : 9237;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    `--window-size=${width},${height}`,
    url
  ]);

  try {
    // Wait for Chrome to initialize remote debugging port
    await new Promise(r => setTimeout(r, 2200));
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
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        cb(msg);
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
      console.log(`📸 Saved screenshot: ${filename} (${fs.statSync(p).size} bytes)`);
    }

    async function evaluate(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return res.result?.result?.value;
    }

    if (!isMobile) {
      // 1. Early drawing phase (wait 2000ms after load -> elapsed ~2.0s)
      console.log('1. Capturing early drawing phase (t ~2.0s)...');
      await new Promise(r => setTimeout(r, 2000));
      await snap(`${prefix}_01_early_drawing.png`);

      // 2. Greeting fade-in phase (wait 1800ms -> elapsed ~4.6s, blossom begins)
      console.log('2. Capturing greeting fade-in phase (t ~4.6s)...');
      await new Promise(r => setTimeout(r, 1800));
      await snap(`${prefix}_02_greeting_fadein.png`);

      // 3. Fully drawn Rangoli & hold greeting (wait 2200ms -> elapsed ~7.6s, hold phase)
      console.log('3. Capturing hold phase with complete greeting (t ~7.6s)...');
      await new Promise(r => setTimeout(r, 2200));
      const styles = await evaluate(`({
        closeBg: window.getComputedStyle(document.querySelector('.rgp-close')).background,
        blessingColor: window.getComputedStyle(document.querySelector('.rgp-blessing')).color,
        messageColor: window.getComputedStyle(document.querySelector('.rgp-message')).color,
        subnoteColor: window.getComputedStyle(document.querySelector('.rgp-subnote')).color,
        closeVisible: document.querySelector('.rgp-close')?.classList.contains('rgp-visible')
      })`);
      console.log('Greeting Computed Styles at hold phase:', styles);
      await snap(`${prefix}_03_hold_greeting.png`);

      // 4. Wind & dispersal phase (wait 2600ms -> elapsed ~11.0s, wind phase)
      console.log('4. Capturing wind/dispersal phase (t ~11.0s)...');
      await new Promise(r => setTimeout(r, 2600));
      await snap(`${prefix}_04_wind_dispersal.png`);

      // 5. Revealed login screen (wait 3600ms -> elapsed ~15.4s, revealed)
      console.log('5. Capturing revealed login screen (t ~15.4s)...');
      await new Promise(r => setTimeout(r, 3600));
      const loginCheck = await evaluate(`({
        rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
        rwDismissed: document.getElementById('rangoli-welcome')?.classList.contains('rgp-dismissed'),
        loginCardPresent: !!document.querySelector('.login-card'),
        splashDisplay: document.getElementById('splash-stage')?.style?.display
      })`);
      console.log('Login DOM state at 15.4s:', loginCheck);
      await snap(`${prefix}_05_login_revealed.png`);
    } else {
      // Mobile sequence
      // Wait for hold greeting phase (elapsed ~7.5s)
      console.log('Mobile: Waiting for hold greeting phase (t ~7.5s)...');
      await new Promise(r => setTimeout(r, 5200));
      await snap(`${prefix}_01_hold_greeting.png`);

      // Wait for revealed login screen (elapsed ~15.0s)
      console.log('Mobile: Waiting for revealed login screen (t ~15.0s)...');
      await new Promise(r => setTimeout(r, 7500));
      await snap(`${prefix}_02_login_revealed.png`);
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function main() {
  const appUrl = 'file:///D:/Temple/Temple_Accounts-1.html';
  console.log('================================================================');
  console.log('STEP 33.116 VISUAL VERIFICATION: DIRECT APP VERIFICATION');
  console.log('================================================================');
  await capturePhases(appUrl, 1280, 800, false, 'step33_116_app_desktop');
  // Small pause between runs so Chrome port releases cleanly
  await new Promise(r => setTimeout(r, 1500));
  await capturePhases(appUrl, 390, 844, true, 'step33_116_app_mobile');
  console.log('\nAll Visual Verifications Completed Successfully.');
}

main().catch(err => {
  console.error('Visual harness execution error:', err);
  process.exit(1);
});
