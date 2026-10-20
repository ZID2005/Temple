import base64

with open('D:/Temple/assets/temple_deity_logo_bw.png', 'rb') as f:
    logo_bw_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open('D:/Temple/assets/temple_upi_qr.png', 'rb') as f:
    qr_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open('D:/Temple/assets/temple_receipt_top_decor.png', 'rb') as f:
    top_decor_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open('D:/Temple/assets/temple_receipt_bot_decor.png', 'rb') as f:
    bot_decor_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

html = f"""<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>STEP 33.109 Thermal Print Test Slip (80mm)</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: #e2e8f0;
    font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace;
    font-size: 11.5px;
    line-height: 1.35;
    color: #000;
    padding: 20px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }}
  .no-print-bar {{
    background: #800000;
    color: #fff;
    padding: 10px 18px;
    border-radius: 6px;
    margin-bottom: 16px;
    font-family: sans-serif;
    font-size: 13px;
    display: flex;
    gap: 12px;
    align-items: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  }}
  .print-btn {{
    background: #fff;
    color: #800000;
    border: none;
    font-weight: bold;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }}
  .print-btn:hover {{
    background: #fef08a;
  }}
  #print-area.billing-80mm {{
    width: 80mm;
    max-width: 80mm;
    padding: 3mm 4mm 4mm 4mm;
    box-sizing: border-box;
    background: #fff;
    margin: 0 auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }}
  .th-receipt {{
    width: 100%;
    max-width: 80mm;
    color: #000;
    font-variant-numeric: tabular-nums;
  }}
  .th-center {{ text-align: center; }}
  .th-bold {{ font-weight: bold; }}
  .th-logo-wrap {{
    text-align: center;
    margin-bottom: 3px;
  }}
  .th-top-frame {{
    position: relative !important;
    width: 100% !important;
    margin: 0 auto !important;
    line-height: 0 !important;
  }}
  .th-top-decor {{
    width: 100% !important;
    height: auto !important;
    display: block !important;
    margin: 0 auto !important;
    image-rendering: -webkit-optimize-contrast !important;
    image-rendering: crisp-edges !important;
  }}
  .th-top-frame .th-deity-logo {{
    position: absolute !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    bottom: 0 !important;
    width: 23.16% !important;
    height: auto !important;
    aspect-ratio: 300 / 450 !important;
    display: block !important;
    margin: 0 !important;
    object-fit: contain !important;
    image-rendering: -webkit-optimize-contrast !important;
    image-rendering: crisp-edges !important;
  }}
  .th-deity-logo {{
    width: 20mm !important;
    max-width: 20mm !important;
    height: auto !important;
    aspect-ratio: 300 / 450 !important;
    display: block !important;
    margin: 0 auto !important;
    object-fit: contain !important;
    image-rendering: -webkit-optimize-contrast !important;
    image-rendering: crisp-edges !important;
  }}
  .th-title {{
    font-size: 13.5px;
    font-weight: bold;
    line-height: 1.25;
    margin-bottom: 2px;
  }}
  .th-line {{
    border-bottom: 1px dashed #000;
    margin: 4px 0;
    width: 100%;
    display: block;
  }}
  .th-flex {{
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    font-variant-numeric: tabular-nums;
  }}
  .th-row {{
    font-size: 11.5px;
    margin: 2px 0;
    line-height: 1.35;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
  }}
  .th-total {{
    font-size: 13.5px;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
  }}
  .th-blessing {{
    font-size: 10px;
    font-weight: bold;
    margin-top: 5px;
    text-align: center;
  }}
  .th-upi-section {{
    text-align: center;
    margin-top: 6px;
    padding-top: 2px;
  }}
  .th-scan-pay {{
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
    text-align: center;
  }}
  .th-upi-qr {{
    width: 31mm !important;
    height: 31mm !important;
    max-width: 31mm !important;
    max-height: 31mm !important;
    aspect-ratio: 1 / 1 !important;
    display: block !important;
    margin: 0 auto !important;
    image-rendering: pixelated !important;
    image-rendering: crisp-edges !important;
  }}
  .th-bot-decor {{
    width: 100% !important;
    height: auto !important;
    display: block !important;
    margin: 6px auto 2px auto !important;
    image-rendering: -webkit-optimize-contrast !important;
    image-rendering: crisp-edges !important;
  }}
  .th-roster-row {{
    font-size: 11.5px;
    margin: 2.5px 0;
    line-height: 1.35;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 4px;
  }}
  .th-roster-name, .th-roster-star {{
    font-size: 13.5px;
  }}
  @page {{
    size: 80mm 165mm;
    margin: 0;
  }}
  @media print {{
    .no-print-bar {{ display: none !important; }}
    body {{
      background: #fff !important;
      padding: 0 !important;
      margin: 0 !important;
    }}
    #print-area.billing-80mm {{
      box-shadow: none !important;
      width: 80mm !important;
      margin: 0 !important;
      padding: 3mm 4mm 4mm 4mm !important;
    }}
  }}
</style>
</head>
<body class="printing-billing-80mm">
<div class="no-print-bar">
  <span><strong>STEP 33.109 Manual Thermal Slip Test:</strong> Balanced Logo & 31mm High-Res QR</span>
  <button class="print-btn" onclick="window.print()">Print to Thermal Printer</button>
</div>
<div id="print-area" class="billing-80mm">
  <div class="th-receipt">
    <div class="th-logo-wrap">
      <div class="th-top-frame">
        <img src="{top_decor_b64}" alt="Top Floral Decoration" class="th-top-decor" id="billTopDecor" />
        <img src="{logo_bw_b64}" alt="Temple Deity Logo" class="th-deity-logo" id="billDeityLogo" />
      </div>
    </div>
    <div class="th-center th-bold th-title">മറുതാ ചാമുണ്ഡി ദേവി ക്ഷേത്രം</div>
    <div class="th-line"></div>
    <div class="th-flex th-row">
      <span class="th-bold">No: BILL-0105</span>
      <span>18/10/2026 03:50 PM</span>
    </div>
    <div class="th-line"></div>
    <div class="th-roster-row th-bold">
      <span style="flex: 0 0 16px;">നം.</span>
      <span style="flex: 1 1 auto;">പേര് (Devotee Name)</span>
      <span style="flex: 0 0 95px; text-align: right;">നാൾ (Star)</span>
    </div>
    <div class="th-roster-row">
      <span style="flex: 0 0 16px;">1.</span>
      <span class="th-bold th-roster-name" style="flex: 1 1 auto;">അനന്തൻ നമ്പൂതിരി</span>
      <span class="th-roster-star" style="flex: 0 0 95px; text-align: right;">തിരുവോണം</span>
    </div>
    <div class="th-line"></div>
    <div class="th-row">
      <span>വിഭാഗം: വഴിപാട്</span>
    </div>
    <div class="th-row">
      <span class="th-bold">ഇനം: അർച്ചന</span>
    </div>
    <div class="th-row">
      <span>Qty: 1 × ₹50.00</span>
      <span class="th-bold">Amt: ₹50.00</span>
    </div>
    <div class="th-line"></div>
    <div class="th-flex th-row th-total">
      <span>ആകെ (Total):</span>
      <span>₹50.00</span>
    </div>
    <div class="th-flex th-row">
      <span>Payment:</span>
      <span class="th-bold">Cash</span>
    </div>
    <div class="th-line"></div>
    <div class="th-center th-blessing">*** അമ്മേ നാരായണ ദേവി നാരായണ ***</div>
    <div class="th-upi-section">
      <div class="th-scan-pay">SCAN TO PAY</div>
      <img src="{qr_b64}" alt="UPI QR Code" class="th-upi-qr" id="billUpiQr" />
    </div>
    <img src="{bot_decor_b64}" alt="Bottom Floral Decoration" class="th-bot-decor" id="billBotDecor" />
  </div>
</div>
</body>
</html>"""

with open('D:/Temple/step_33_109_thermal_test_print.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Saved D:/Temple/step_33_109_thermal_test_print.html')
