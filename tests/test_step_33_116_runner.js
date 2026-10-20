const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runSession(harnessFile, width, height, isMobile, prefix) {
  console.log(`\n================================================================`);
  console.log(`Starting Visual Test: ${prefix} (${width}x${height})...`);
  console.log(`================================================================`);
  const port = isMobile ? 9228 : 9227;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    `--window-size=${width},${height}`,
    `file:///D:/Temple/tests/${harnessFile}`
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
      console.log(`Saved screenshot: ${filename} (${fs.statSync(p).size} bytes)`);
    }

    if (!isMobile) {
      // Desktop sequence:
      // 1. Early drawing phase (at ~3.0s total elapsed)
      console.log('1. Capturing early drawing phase (~3.0s)...');
      await new Promise(r => setTimeout(r, 1500));
      await snap(`${prefix}_01_early_drawing_3.0s.png`);

      // 2. Greeting fade-in phase (at ~5.8s total elapsed)
      console.log('2. Capturing greeting fade-in phase (~5.8s)...');
      await new Promise(r => setTimeout(r, 2800));
      await snap(`${prefix}_02_greeting_fadein_5.8s.png`);

      // 3. Fully drawn Rangoli & hold greeting (at ~8.0s total elapsed)
      console.log('3. Capturing hold phase with complete greeting (~8.0s)...');
      await new Promise(r => setTimeout(r, 2200));
      let evalResult = await send('Runtime.evaluate', {
        expression: `({
          closeBg: window.getComputedStyle(document.querySelector('.rgp-close')).background,
          blessingColor: window.getComputedStyle(document.querySelector('.rgp-blessing')).color,
          messageColor: window.getComputedStyle(document.querySelector('.rgp-message')).color,
          subnoteColor: window.getComputedStyle(document.querySelector('.rgp-subnote')).color,
          closeVisible: document.querySelector('.rgp-close').classList.contains('rgp-visible')
        })`,
        returnByValue: true
      });
      console.log('Greeting Computed Styles at 8.0s:', evalResult.result?.result?.value);
      await snap(`${prefix}_03_hold_greeting_8.0s.png`);

      // 4. Wind & dispersal phase (at ~11.0s total elapsed)
      console.log('4. Capturing wind/dispersal phase (~11.0s)...');
      await new Promise(r => setTimeout(r, 3000));
      await snap(`${prefix}_04_wind_dispersal_11.0s.png`);

      // 5. Revealed login screen (at ~14.5s total elapsed)
      console.log('5. Capturing login screen after animation finishes (~14.5s)...');
      await new Promise(r => setTimeout(r, 3500));
      let loginCheck = await send('Runtime.evaluate', {
        expression: `({
          rwDisplay: document.getElementById('rangoli-welcome')?.style?.display,
          rwDismissed: document.getElementById('rangoli-welcome')?.classList.contains('rgp-dismissed'),
          loginCardVisible: !!document.querySelector('.login-card')
        })`,
        returnByValue: true
      });
      console.log('Login DOM check at 14.5s:', loginCheck.result?.result?.value);
      await snap(`${prefix}_05_login_revealed_14.5s.png`);
    } else {
      // Mobile sequence: capture hold phase (~8.0s) and login screen (~14.5s)
      console.log('Mobile: Capturing hold phase (~8.0s)...');
      await new Promise(r => setTimeout(r, 6500));
      await snap(`${prefix}_01_hold_greeting_8.0s.png`);

      console.log('Mobile: Capturing login screen (~14.5s)...');
      await new Promise(r => setTimeout(r, 6500));
      await snap(`${prefix}_02_login_revealed_14.5s.png`);
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

async function main() {
  const harness = 'test_harness_step33_116.html';
  console.log('================================================================');
  console.log('STEP 33.116 VISUAL VERIFICATION RUNNER');
  console.log('================================================================');
  await runSession(harness, 1280, 800, false, 'step33_116_desktop');
  await runSession(harness, 390, 844, true, 'step33_116_mobile');
  console.log('\nAll Visual Harness Tests Completed Successfully.');
}

main().catch(err => {
  console.error('Fatal visual test error:', err);
  process.exit(1);
});
