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

  console.log('--- Inspecting Page Details ---');
  await send('Page.bringToFront');

  // Check window focus and visibilityState
  const winState = await send('Runtime.evaluate', {
    expression: `({
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight
    })`,
    returnByValue: true
  });
  console.log('Window State:', winState.result.value);

  // Check animations on the page
  const animations = await send('Runtime.evaluate', {
    expression: `(() => {
      const running = document.getAnimations();
      return running.map(a => ({
        id: a.id,
        playState: a.playState,
        currentTime: a.currentTime,
        effect: a.effect ? {
          target: a.effect.target ? (a.effect.target.tagName + '#' + (a.effect.target.id || '') + '.' + (a.effect.target.className || '')) : null,
          timing: a.effect.getTiming()
        } : null
      }));
    })()`,
    returnByValue: true
  });
  console.log('Running Animations count:', animations.result.value.length);
  console.log('Running Animations:', JSON.stringify(animations.result.value, null, 2));

  // Check sheet element properties
  const sheetProps = await send('Runtime.evaluate', {
    expression: `(() => {
      const sheet = document.getElementById('printerReceiptSheet');
      const ejector = document.getElementById('printerPaperEjector');
      const chassis = document.getElementById('receiptPrinterChassis');
      const overlay = document.getElementById('receiptPrinterOverlay');
      if (!sheet) return null;
      const sStyle = getComputedStyle(sheet);
      const eStyle = getComputedStyle(ejector);
      const cStyle = getComputedStyle(chassis);
      return {
        sheet: {
          willChange: sStyle.willChange,
          transform: sStyle.transform,
          backfaceVisibility: sStyle.backfaceVisibility,
          contain: sStyle.contain,
          clipPath: sStyle.clipPath ? sStyle.clipPath.slice(0, 50) + '...' : null,
          boxShadow: sStyle.boxShadow,
          height: sStyle.height,
          offsetHeight: sheet.offsetHeight,
          scrollHeight: sheet.scrollHeight
        },
        ejector: {
          overflow: eStyle.overflow,
          contain: eStyle.contain,
          willChange: eStyle.willChange,
          transform: eStyle.transform
        },
        chassis: {
          transform: cStyle.transform,
          willChange: cStyle.willChange,
          transition: cStyle.transition
        }
      };
    })()`,
    returnByValue: true
  });
  console.log('Printer DOM & Computed Style:', JSON.stringify(sheetProps.result.value, null, 2));

  ws.close();
}
main().catch(console.error);
