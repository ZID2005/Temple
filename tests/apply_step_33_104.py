import os
import hashlib
import base64

HTML_PATH = 'Temple_Accounts-1.html'
EXPECTED_PRE_HASH = '75B334C39BE33813D798944B553B27DFCAE2196EF6B4498A2AF09A33846AEE43'
EXPECTED_PRE_SIZE = 969691

with open(HTML_PATH, 'rb') as f:
    orig_buf = f.read()

actual_hash = hashlib.sha256(orig_buf).hexdigest().upper()
actual_size = len(orig_buf)

print(f'Initial Check: Hash={actual_hash}, Size={actual_size}')
if actual_hash != EXPECTED_PRE_HASH or actual_size != EXPECTED_PRE_SIZE:
    raise ValueError(f'Baseline mismatch! Expected {EXPECTED_PRE_HASH} ({EXPECTED_PRE_SIZE}), got {actual_hash} ({actual_size})')

content = orig_buf.decode('utf-8')

# Ensure strict LF
if '\r\n' in content:
    content = content.replace('\r\n', '\n')

with open('assets/temple_deity_logo_screen.png', 'rb') as f:
    screen_b64 = base64.b64encode(f.read()).decode('ascii')

print(f'Screen Logo Base64 Length: {len(screen_b64)} chars')

# 1. Add TEMPLE_DEITY_LOGO_SCREEN_B64 constant
target_deity_const_line = '    const TEMPLE_DEITY_LOGO_B64 = "'
idx_deity = content.find(target_deity_const_line)
if idx_deity == -1:
    raise ValueError('Target deity const line not found')

idx_deity_end = content.find('";\n', idx_deity)
if idx_deity_end == -1:
    raise ValueError('Target deity const line end not found')

deity_const_full = content[idx_deity:idx_deity_end + 3]
screen_const_full = f'    const TEMPLE_DEITY_LOGO_SCREEN_B64 = "data:image/png;base64,{screen_b64}";\n'

replacement_constants = deity_const_full + screen_const_full

content = content.replace(deity_const_full, replacement_constants, 1)

# 2. Add window.TEMPLE_DEITY_LOGO_SCREEN_B64 assignment
target_win = '      window.TEMPLE_DEITY_LOGO_B64 = TEMPLE_DEITY_LOGO_B64;\n      window.TEMPLE_UPI_QR_B64 = TEMPLE_UPI_QR_B64;'
replacement_win = '      window.TEMPLE_DEITY_LOGO_B64 = TEMPLE_DEITY_LOGO_B64;\n      window.TEMPLE_DEITY_LOGO_SCREEN_B64 = TEMPLE_DEITY_LOGO_SCREEN_B64;\n      window.TEMPLE_UPI_QR_B64 = TEMPLE_UPI_QR_B64;'

if target_win not in content:
    raise ValueError('Target window assignments not found')
content = content.replace(target_win, replacement_win, 1)

# 3. Update renderThermalReceiptHTML
target_fn_head = '    function renderThermalReceiptHTML(r, templeName, templeAddress) {'
replacement_fn_head = '    function renderThermalReceiptHTML(r, templeName, templeAddress, isForPrint = false) {'

if target_fn_head not in content:
    raise ValueError('Target function header not found')
content = content.replace(target_fn_head, replacement_fn_head, 1)

target_deity_src = '      const deityLogoSrc = (typeof TEMPLE_DEITY_LOGO_B64 !== \'undefined\' && TEMPLE_DEITY_LOGO_B64) ? TEMPLE_DEITY_LOGO_B64 : ((typeof window !== \'undefined\' && window.TEMPLE_DEITY_LOGO_B64) ? window.TEMPLE_DEITY_LOGO_B64 : \'assets/temple_deity_logo_bw.png\');'
replacement_deity_src = (
    '      const isPrint = isForPrint || (typeof window !== \'undefined\' && window._isThermalPrinting) || (typeof document !== \'undefined\' && document.body && document.body.classList && document.body.classList.contains(\'printing-billing-80mm\'));\n'
    '      const deityLogoSrc = (!isPrint && typeof TEMPLE_DEITY_LOGO_SCREEN_B64 !== \'undefined\' && TEMPLE_DEITY_LOGO_SCREEN_B64)\n'
    '        ? TEMPLE_DEITY_LOGO_SCREEN_B64\n'
    '        : ((typeof TEMPLE_DEITY_LOGO_B64 !== \'undefined\' && TEMPLE_DEITY_LOGO_B64)\n'
    '          ? TEMPLE_DEITY_LOGO_B64\n'
    '          : (isPrint ? \'assets/temple_deity_logo_bw.png\' : \'assets/temple_deity_logo_screen.png\'));'
)

if target_deity_src not in content:
    raise ValueError('Target deityLogoSrc line not found')
content = content.replace(target_deity_src, replacement_deity_src, 1)

# 4. Update printBillingReceipt to set window._isThermalPrinting
target_print_block = (
    '      // Populate print area with 80mm receipt markup\n'
    '      printArea.className = \'billing-80mm\';\n'
    '      printArea.innerHTML = renderThermalReceiptHTML(r, templeName, templeAddress);\n'
    '\n'
    '      document.body.classList.add(\'printing-billing-80mm\');'
)

replacement_print_block = (
    '      // Populate print area with 80mm receipt markup\n'
    '      printArea.className = \'billing-80mm\';\n'
    '      window._isThermalPrinting = true;\n'
    '      try {\n'
    '        printArea.innerHTML = renderThermalReceiptHTML(r, templeName, templeAddress);\n'
    '      } finally {\n'
    '        window._isThermalPrinting = false;\n'
    '      }\n'
    '\n'
    '      document.body.classList.add(\'printing-billing-80mm\');'
)

if target_print_block not in content:
    raise ValueError('Target print block not found')
content = content.replace(target_print_block, replacement_print_block, 1)

# Write modified content
new_buf = content.encode('utf-8')
with open(HTML_PATH, 'wb') as f:
    f.write(new_buf)

post_hash = hashlib.sha256(new_buf).hexdigest().upper()
post_size = len(new_buf)
print(f'Successfully applied Step 33.104 changes!')
print(f'Pre-hash:   {EXPECTED_PRE_HASH} ({EXPECTED_PRE_SIZE} bytes)')
print(f'Post-hash:  {post_hash} ({post_size} bytes)')
print(f'Delta:      +{post_size - EXPECTED_PRE_SIZE} bytes')
