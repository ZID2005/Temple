import os
import subprocess
from PIL import Image
import zxingcpp

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
html_path = r'D:\Temple\tests\step_33_109_eval\candidate_C2_31mm_screen.html'

with open(r'D:\Temple\tests\step_33_109_eval\candidate_C2_31mm.html', 'r', encoding='utf-8') as f:
    print_html = f.read()

screen_html = print_html.replace(
    'body class="printing-billing-80mm"',
    'body style="background: #f1f5f9; padding: 20px; display: flex; justify-content: center;"'
).replace(
    '<div id="print-area" class="billing-80mm">',
    '<div style="width: 380px; background: #fff; padding: 12px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">'
)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(screen_html)

png_path = r'D:\Temple\tests\step_33_109_eval\preview_screen_31mm.png'
cmd = f'"{CHROME}" --headless=new --disable-gpu --window-size=500,850 "--screenshot={png_path}" "file:///{html_path.replace(os.sep, "/")}"'
subprocess.run(cmd, shell=True, check=True)

res = zxingcpp.read_barcodes(Image.open(png_path))
print('Screen preview QR decode:', res[0].text if res else 'NO_DECODE')
