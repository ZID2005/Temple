async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const appTab = tabs.find(t => t.url && t.url.includes('Temple_Accounts-1.html'));
  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result ? res.result.value : undefined;
  }

  async function testConfig(name, setupCode) {
    await evaluate(`ReceiptPrinter.close();`);
    await new Promise(r => setTimeout(r, 200));

    if (setupCode) {
      await evaluate(setupCode);
    }

    const res = await evaluate(`(() => {
      return new Promise(resolve => {
        window.__frames = [];
        let start = performance.now();
        ReceiptPrinter.setFeedMode('smooth');
        ReceiptPrinter.startPrinting({
          id: 9991,
          receiptNo: 'BILL-9991',
          date: '12/10/2026',
          time: '11:00 AM',
          devoteeName: 'സുരേഷ് കുമാർ (Suresh)',
          star: 'രോഹിണി',
          category: 'വഴിപാട്',
          item: 'പുഷ്പാഞ്ജലി',
          quantity: 1,
          rate: 30,
          totalAmount: 30,
          paymentMode: 'Cash'
        });

        const record = (now) => {
          window.__frames.push(now - start);
          start = now;
          if (ReceiptPrinter.state === 'printing') {
            requestAnimationFrame(record);
          } else {
            const f = window.__frames;
            const avg = f.reduce((a, b) => a + b, 0) / f.length;
            resolve({
              name: '${name}',
              totalFrames: f.length,
              avgDelta: Number(avg.toFixed(2)),
              avgFPS: Number((1000 / avg).toFixed(1)),
              maxDelta: Number(Math.max(...f).toFixed(2))
            });
          }
        };
        requestAnimationFrame(record);
      });
    })()`);

    console.log(JSON.stringify(res));
    await evaluate(`ReceiptPrinter.close();`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('--- Diagnosing Animation Bottlenecks ---');

  // Baseline
  await testConfig('Baseline (Current Code)');

  // Test 1: Remove progress fill transition
  await testConfig('Disable progressFill transition', `(() => {
    const pf = document.getElementById('printerProgressFill');
    if (pf) pf.style.display = 'none';
  })()`);

  // Test 2: Remove blur shadow on throat
  await testConfig('Disable throat blur shadow', `(() => {
    const sh = document.querySelector('.printer-throat-ejection-shadow');
    if (sh) sh.style.display = 'none';
  })()`);

  // Test 3: Remove complex clip-path on sheet
  await testConfig('Disable sheet 82-point clip-path', `(() => {
    const sheet = document.getElementById('printerReceiptSheet');
    if (sheet) sheet.style.clipPath = 'none';
  })()`);

  // Test 4: Remove box-shadow on sheet
  await testConfig('Disable sheet box-shadow', `(() => {
    const sheet = document.getElementById('printerReceiptSheet');
    if (sheet) sheet.style.boxShadow = 'none';
  })()`);

  // Test 5: Combine all 4 optimizations
  await testConfig('Combine All 4 (no progressFill width, no blur, no clip-path, no shadow)', `(() => {
    const pf = document.getElementById('printerProgressFill');
    if (pf) pf.style.display = 'none';
    const sh = document.querySelector('.printer-throat-ejection-shadow');
    if (sh) sh.style.display = 'none';
    const sheet = document.getElementById('printerReceiptSheet');
    if (sheet) {
      sheet.style.clipPath = 'none';
      sheet.style.boxShadow = 'none';
    }
  })()`);

  ws.close();
}
main().catch(console.error);
