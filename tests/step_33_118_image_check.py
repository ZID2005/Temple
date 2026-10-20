from PIL import Image
import numpy as np

# Screen asset check
screen = Image.open(r'D:\\Temple\\assets\\temple_deity_logo_screen.png')
sw, sh = screen.size
s_arr = np.array(screen.convert('L'))
s_bg = np.mean([s_arr[0,0], s_arr[0,-1], s_arr[-1,0], s_arr[-1,-1]])
s_ink = np.count_nonzero(s_arr < 140) / s_arr.size * 100.0

# Print asset check
bw = Image.open(r'D:\\Temple\\assets\\temple_deity_logo_bw.png')
bw_w, bw_h = bw.size
bw_arr = np.array(bw.convert('L'))
bw_bg = np.mean([bw_arr[0,0], bw_arr[0,-1], bw_arr[-1,0], bw_arr[-1,-1]])
bw_ink = np.count_nonzero(bw_arr == 0) / bw_arr.size * 100.0

# Om center check (center 100x100 of 460x460 is [180:280, 180:280])
om_region = bw_arr[180:280, 180:280]
om_ink = np.count_nonzero(om_region == 0) / om_region.size * 100.0

# Outer mandala dots in 4 quadrants
q1 = np.count_nonzero(bw_arr[30:100, 200:260] == 0) # top tip
q2 = np.count_nonzero(bw_arr[360:430, 200:260] == 0) # bottom tip
q3 = np.count_nonzero(bw_arr[200:260, 30:100] == 0) # left tip
q4 = np.count_nonzero(bw_arr[200:260, 360:430] == 0) # right tip

print(f"SCREEN_SIZE={sw}x{sh}")
print(f"SCREEN_BG={s_bg:.1f}")
print(f"SCREEN_INK_PCT={s_ink:.1f}")
print(f"BW_SIZE={bw_w}x{bw_h}")
print(f"BW_BG={bw_bg:.1f}")
print(f"BW_INK_PCT={bw_ink:.1f}")
print(f"OM_INK_PCT={om_ink:.1f}")
print(f"TIPS_ACTIVE={all(q > 20 for q in [q1, q2, q3, q4])}")
