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

  console.log('--- Step 33.30B Final Verification Audit ---');

  // 1. Mobile 375px viewport overflow check
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 400));

  const mobileCheck = await evaluate(`(() => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    const clientW = document.documentElement.clientWidth;
    const chassis = document.getElementById('receiptPrinterChassis');
    const ejector = document.getElementById('printerPaperEjector');
    return {
      docScrollWidth: docW,
      bodyScrollWidth: bodyW,
      clientWidth: clientW,
      noHorizontalOverflow: docW <= clientW && bodyW <= clientW,
      chassisWidth: chassis ? chassis.offsetWidth : null,
      ejectorWidth: ejector ? ejector.offsetWidth : null
    };
  })()`);

  console.log('Mobile 375px Audit:', mobileCheck);

  await send('Emulation.clearDeviceMetricsOverride');
  await new Promise(r => setTimeout(r, 300));

  // 2. Receipt Layout & Typography Preservation Check
  const typographyCheck = await evaluate(`(() => {
    const body = document.querySelector('.printer-receipt-body');
    const sep = document.querySelector('.th-sep');
    const sepDouble = document.querySelector('.th-sep-double');
    const csBody = body ? getComputedStyle(body) : null;
    const csSep = sep ? getComputedStyle(sep) : null;
    const csDouble = sepDouble ? getComputedStyle(sepDouble) : null;
    return {
      fontFamily: csBody ? csBody.fontFamily : null,
      fontSize: csBody ? csBody.fontSize : null,
      lineHeight: csBody ? csBody.lineHeight : null,
      color: csBody ? csBody.color : null,
      fontVariantNumeric: csBody ? csBody.fontVariantNumeric : null,
      sepBorderTop: csSep ? csSep.borderTop : null,
      doubleBorderTop: csDouble ? csDouble.borderTop : null
    };
  })()`);

  console.log('Typography & Receipt Layout Audit:', typographyCheck);

  // 3. Database & Idempotency Guarantee
  const dbCheck = await evaluate(`(async () => {
    const bills = await allBillingRecords();
    const receipts = await allReceipts();
    return {
      totalBills: bills.length,
      totalReceipts: receipts.length,
      lastBill: bills.length > 0 ? bills[bills.length - 1] : null,
      lastReceipt: receipts.length > 0 ? receipts[receipts.length - 1] : null
    };
  })()`);

  console.log('Database Integrity:', {
    totalBills: dbCheck.totalBills,
    totalReceipts: dbCheck.totalReceipts,
    lastBillNo: dbCheck.lastBill ? dbCheck.lastBill.receiptNo : null,
    lastReceiptNo: dbCheck.lastReceipt ? dbCheck.lastReceipt.receiptNo : null
  });

  // 4. Check for console errors
  const consoleErrors = await evaluate(`window.__consoleErrors || []`);
  console.log('Recorded Console Errors:', consoleErrors);

  ws.close();
}
main().catch(console.error);
