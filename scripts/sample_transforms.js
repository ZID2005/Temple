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

  const sampleScript = `(() => {
    window.__transformSamples = [];
    ReceiptPrinter.setFeedMode('smooth');
    ReceiptPrinter.startPrinting({
      id: 9002,
      receiptNo: 'BILL-9002',
      date: '12/10/2026',
      time: '10:55 AM',
      devoteeName: 'രാമചന്ദ്രൻ (Ramachandran)',
      star: 'അശ്വതി',
      category: 'വഴിപാട്',
      item: 'പുഷ്പാഞ്ജലി',
      quantity: 1,
      rate: 30,
      totalAmount: 30,
      paymentMode: 'Cash'
    });

    const sheet = document.getElementById('printerReceiptSheet');
    const startT = performance.now();
    let frameId;

    const sample = (now) => {
      const elapsed = now - startT;
      const comp = getComputedStyle(sheet);
      const matrix = comp.transform;
      // parse translateY from matrix
      let ty = null;
      if (matrix.startsWith('matrix(')) {
        const parts = matrix.slice(7, -1).split(',').map(s => parseFloat(s.trim()));
        ty = parts[5];
      }
      window.__transformSamples.push({
        elapsed: Number(elapsed.toFixed(1)),
        translateY: ty !== null ? Number(ty.toFixed(2)) : null,
        opacity: Number(parseFloat(comp.opacity).toFixed(3)),
        animationPlayState: comp.animationPlayState
      });
      if (elapsed < 2400) {
        frameId = requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  })()`;

  await send('Runtime.evaluate', { expression: sampleScript });
  await new Promise(r => setTimeout(r, 2600));

  const samples = await send('Runtime.evaluate', {
    expression: `(() => {
      const all = window.__transformSamples;
      // Filter to every ~100ms or when velocity changes sharply
      const results = [];
      for (let i = 0; i < all.length; i++) {
        const cur = all[i];
        const prev = i > 0 ? all[i-1] : null;
        const vel = (prev && cur.elapsed > prev.elapsed) ? (cur.translateY - prev.translateY) / (cur.elapsed - prev.elapsed) : 0;
        cur.velocity = Number(vel.toFixed(3)); // px/ms
        if (i % 5 === 0 || i === all.length - 1) {
          results.push(cur);
        }
      }
      return { totalSamples: all.length, samples: results };
    })()`,
    returnByValue: true
  });

  console.log('Sampled Transforms during Smooth Feed:');
  console.log(JSON.stringify(samples.result.value, null, 2));

  await send('Runtime.evaluate', { expression: `ReceiptPrinter.close()` });
  ws.close();
}
main().catch(console.error);
