import os
import hashlib
import base64

HTML_PATH = 'D:/Temple/Temple_Accounts-1.html'
EXPECTED_PRE_HASH = '0F278FAFB369B06EB73D0F1B84015CAF047C9A9AFDF6FBF5642FFC79B0E5EECB'
EXPECTED_PRE_SIZE = 1649155

with open(HTML_PATH, 'rb') as f:
    buf = f.read()

cur_hash = hashlib.sha256(buf).hexdigest().upper()
cur_size = len(buf)

print(f'Checking baseline: Hash={cur_hash}, Size={cur_size}')
if cur_hash != EXPECTED_PRE_HASH or cur_size != EXPECTED_PRE_SIZE:
    raise ValueError(f'Baseline mismatch! Expected {EXPECTED_PRE_HASH} ({EXPECTED_PRE_SIZE}), got {cur_hash} ({cur_size})')

content = buf.decode('utf-8')
if '\r\n' in content:
    content = content.replace('\r\n', '\n')

# 1. Load new Base64 strings
with open('D:/Temple/assets/temple_deity_logo_bw.png', 'rb') as f:
    deity_bw_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

with open('D:/Temple/assets/temple_upi_qr.png', 'rb') as f:
    upi_qr_b64 = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

# 2. Update screen CSS: .th-upi-qr from 28mm to 31mm
target_screen_css = """    .th-upi-qr {
      width: 28mm;
      height: 28mm;
      max-width: 28mm;
      max-height: 28mm;
      aspect-ratio: 1 / 1;
      display: block;
      margin: 0 auto;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }"""

replacement_screen_css = """    .th-upi-qr {
      width: 31mm;
      height: 31mm;
      max-width: 31mm;
      max-height: 31mm;
      aspect-ratio: 1 / 1;
      display: block;
      margin: 0 auto;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }"""

if target_screen_css not in content:
    raise ValueError('Target screen CSS block not found')
content = content.replace(target_screen_css, replacement_screen_css, 1)

# 3. Update print CSS: #print-area.billing-80mm .th-upi-qr from 28mm to 31mm
target_print_css = """      #print-area.billing-80mm .th-upi-qr,
      #print-area.billing-58mm .th-upi-qr {
        width: 28mm !important;
        height: 28mm !important;
        max-width: 28mm !important;
        max-height: 28mm !important;
        aspect-ratio: 1 / 1 !important;
        display: block !important;
        margin: 0 auto !important;
        image-rendering: pixelated !important;
        image-rendering: crisp-edges !important;
      }"""

replacement_print_css = """      #print-area.billing-80mm .th-upi-qr,
      #print-area.billing-58mm .th-upi-qr {
        width: 31mm !important;
        height: 31mm !important;
        max-width: 31mm !important;
        max-height: 31mm !important;
        aspect-ratio: 1 / 1 !important;
        display: block !important;
        margin: 0 auto !important;
        image-rendering: pixelated !important;
        image-rendering: crisp-edges !important;
      }"""

if target_print_css not in content:
    raise ValueError('Target print CSS block not found')
content = content.replace(target_print_css, replacement_print_css, 1)

# 4. Replace TEMPLE_DEITY_LOGO_B64
idx_deity_start = content.find('    const TEMPLE_DEITY_LOGO_B64 = "')
if idx_deity_start == -1:
    raise ValueError('TEMPLE_DEITY_LOGO_B64 start not found')
idx_deity_end = content.find('";\n', idx_deity_start)
if idx_deity_end == -1:
    raise ValueError('TEMPLE_DEITY_LOGO_B64 end not found')

old_deity_line = content[idx_deity_start:idx_deity_end + 3]
new_deity_line = f'    const TEMPLE_DEITY_LOGO_B64 = "{deity_bw_b64}";\n'
content = content.replace(old_deity_line, new_deity_line, 1)

# 5. Replace TEMPLE_UPI_QR_B64
idx_qr_start = content.find('    const TEMPLE_UPI_QR_B64 = "')
if idx_qr_start == -1:
    raise ValueError('TEMPLE_UPI_QR_B64 start not found')
idx_qr_end = content.find('";\n', idx_qr_start)
if idx_qr_end == -1:
    raise ValueError('TEMPLE_UPI_QR_B64 end not found')

old_qr_line = content[idx_qr_start:idx_qr_end + 3]
new_qr_line = f'    const TEMPLE_UPI_QR_B64 = "{upi_qr_b64}";\n'
content = content.replace(old_qr_line, new_qr_line, 1)

# Write out with strict LF
new_buf = content.encode('utf-8')
with open(HTML_PATH, 'wb') as f:
    f.write(new_buf)

post_hash = hashlib.sha256(new_buf).hexdigest().upper()
post_size = len(new_buf)

print(f'Update successful!')
print(f'Pre-change:  {cur_hash} ({cur_size} bytes)')
print(f'Post-change: {post_hash} ({post_size} bytes)')
print(f'Delta: {post_size - cur_size} bytes')
