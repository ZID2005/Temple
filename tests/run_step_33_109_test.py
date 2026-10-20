import os
import subprocess
import base64
import json
import pypdf
from PIL import Image
import zxingcpp
import numpy as np

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
OUTPUT_DIR = r'D:\Temple\tests\step_33_109_eval'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Load Assets
with open(r'D:\Temple\tests\candidates_eval\cand_C2.png', 'rb') as f:
    logo_bw_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open(r'D:\Temple\assets\temple_deity_logo_screen.png', 'rb') as f:
    logo_screen_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open(r'D:\Temple\assets\temple_upi_qr_clean.png', 'rb') as f:
    qr_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open(r'D:\Temple\assets\temple_receipt_top_decor.png', 'rb') as f:
    top_decor_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open(r'D:\Temple\assets\temple_receipt_bot_decor.png', 'rb') as f:
    bot_decor_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

# Baseline print logo b64 for comparison
with open(r'D:\Temple\assets\temple_deity_logo_bw.png', 'rb') as f:
    logo_bw_baseline_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

# Baseline QR b64 for comparison
with open(r'D:\Temple\assets\temple_upi_qr.png', 'rb') as f:
    qr_baseline_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')


def generate_receipt_html(logo_src, qr_src, qr_size_mm=31, is_print=True):
    return f"""<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<title>Step 33.109 Test Receipt</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: #fff;
    font-family: 'Consolas', 'Courier New', 'Noto Sans Malayalam', 'Segoe UI', monospace;
    font-size: 11.5px;
    line-height: 1.35;
    color: #000;
  }}
  #print-area.billing-80mm {{
    width: 80mm;
    max-width: 80mm;
    padding: 3mm 4mm 4mm 4mm;
    box-sizing: border-box;
    background: #fff;
    margin: 0 auto;
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
    width: {qr_size_mm}mm !important;
    height: {qr_size_mm}mm !important;
    max-width: {qr_size_mm}mm !important;
    max-height: {qr_size_mm}mm !important;
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
    html, body {{
      width: 80mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }}
  }}
</style>
</head>
<body class="{"printing-billing-80mm" if is_print else ""}">
<div id="print-area" class="billing-80mm">
  <div class="th-receipt">
    <div class="th-logo-wrap">
      <div class="th-top-frame">
        <img src="{top_decor_b64}" alt="Top Floral Decoration" class="th-top-decor" id="billTopDecor" />
        <img src="{logo_src}" alt="Temple Deity Logo" class="th-deity-logo" id="billDeityLogo" />
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
      <img src="{qr_src}" alt="UPI QR Code" class="th-upi-qr" id="billUpiQr" />
    </div>
    <img src="{bot_decor_b64}" alt="Bottom Floral Decoration" class="th-bot-decor" id="billBotDecor" />
  </div>
</div>
</body>
</html>"""

# Test cases:
# 1. Baseline (old dark logo + 28mm old QR)
# 2. Candidate 1 (cand_C2 logo + 31mm clean QR)
# 3. Candidate 2 (cand_C2 logo + 32mm clean QR)
# 4. Candidate 3 (cand_C1 logo + 31mm clean QR)

test_configs = [
    ('baseline_28mm', logo_bw_baseline_b64, qr_baseline_b64, 28),
    ('candidate_C2_31mm', logo_bw_b64, qr_b64, 31),
    ('candidate_C2_32mm', logo_bw_b64, qr_b64, 32),
]

results = []

for name, l_src, q_src, q_size in test_configs:
    html_content = generate_receipt_html(l_src, q_src, qr_size_mm=q_size, is_print=True)
    html_path = os.path.join(OUTPUT_DIR, f'{name}.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    # 1. Render PDF
    pdf_path = os.path.join(OUTPUT_DIR, f'{name}.pdf')
    cmd_pdf = f'"{CHROME}" --headless=new --disable-gpu "--print-to-pdf={pdf_path}" "file:///{html_path.replace(os.sep, "/")}"'
    subprocess.run(cmd_pdf, shell=True, check=True)
    
    # 2. Render Screenshot (viewport 500x800)
    png_path = os.path.join(OUTPUT_DIR, f'{name}.png')
    cmd_png = f'"{CHROME}" --headless=new --disable-gpu --window-size=500,800 "--screenshot={png_path}" "file:///{html_path.replace(os.sep, "/")}"'
    subprocess.run(cmd_png, shell=True, check=True)
    
    # 3. Analyze PDF
    reader = pypdf.PdfReader(pdf_path)
    page_count = len(reader.pages)
    box = reader.pages[0].mediabox
    width_mm = float(box.width) * 25.4 / 72.0
    height_mm = float(box.height) * 25.4 / 72.0
    
    # 4. Decode QR from rendered PNG
    img_screen = Image.open(png_path)
    # Decode full screenshot
    res = zxingcpp.read_barcodes(img_screen)
    qr_text = res[0].text if res else 'NO_DECODE'
    
    # Also decode QR crop
    arr = np.array(img_screen.convert('L'))
    # QR is in lower half
    h_img = arr.shape[0]
    qr_crop = img_screen.crop((100, int(h_img * 0.45), 400, h_img))
    res_crop = zxingcpp.read_barcodes(qr_crop)
    qr_crop_text = res_crop[0].text if res_crop else 'NO_DECODE'
    
    # 5. Logo darkness measurement from rendered PNG
    # Logo is in upper half (between y=15 and y=150)
    logo_crop = img_screen.crop((215, 45, 285, 150))
    logo_crop.save(os.path.join(OUTPUT_DIR, f'{name}_logo_crop.png'))
    arr_l = np.array(logo_crop.convert('L'))
    logo_black_pct = np.count_nonzero(arr_l < 128) / arr_l.size * 100.0
    
    # 6. QR darkness and quiet zone in rendered PNG
    # Find QR bounding box in lower half
    res_info = f'{res[0].position}' if res else 'N/A'
    
    results.append({
        'name': name,
        'qr_size_mm': q_size,
        'page_count': page_count,
        'width_mm': round(width_mm, 1),
        'height_mm': round(height_mm, 1),
        'qr_decoded': qr_text.startswith('upi://pay'),
        'qr_crop_decoded': qr_crop_text.startswith('upi://pay'),
        'qr_payload': qr_text,
        'logo_black_pct': round(logo_black_pct, 1),
        'png_size': os.path.getsize(png_path),
        'pdf_size': os.path.getsize(pdf_path)
    })

print(json.dumps(results, indent=2))
