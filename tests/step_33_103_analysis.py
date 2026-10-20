import os
import numpy as np
from PIL import Image

screen_img = Image.open(r'D:\\Temple\\tests\\step_33_103_preview_screen.png')
screen_arr = np.array(screen_img)

white_mask = (screen_arr[:, :, 0] > 250) & (screen_arr[:, :, 1] > 250) & (screen_arr[:, :, 2] > 250)
y_indices, x_indices = np.where(white_mask)
min_y, max_y = y_indices.min(), y_indices.max()
min_x, max_x = x_indices.min(), x_indices.max()

receipt_crop = screen_img.crop((min_x, min_y, max_x, max_y))
rw, rh = receipt_crop.size

logo_crop = receipt_crop.crop((int(rw * 0.25), int(rh * 0.02), int(rw * 0.75), int(rh * 0.28)))
logo_path = r'D:\\Temple\\tests\\step_33_103_preview_logo_crop.png'
logo_crop.save(logo_path)

logo_gray = logo_crop.convert('L')
logo_arr = np.array(logo_gray)

mid_tones = np.sum((logo_arr > 30) & (logo_arr < 225))
total_pixels = logo_arr.size
mid_tone_pct = (mid_tones / total_pixels) * 100

std_dev = float(np.std(logo_arr))

print(f"MIDTONE_PCT={mid_tone_pct:.2f}")
print(f"STD_DEV={std_dev:.2f}")
