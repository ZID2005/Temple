import os
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
import numpy as np

screen = Image.open('D:/Temple/assets/temple_deity_logo_screen.png') # 600x900
orig = Image.open('D:/Temple/assets/temple_deity_original.jpg') # 682x1024

os.makedirs('D:/Temple/tests/candidates_eval', exist_ok=True)

candidates = []

# Baseline
cur = Image.open('D:/Temple/assets/temple_deity_logo_bw.png')
candidates.append(('00_baseline_bw', cur))

# Candidate A: Power tone curve (Gamma 0.28) + Unsharp Mask + Floyd-Steinberg
arr_s = np.array(screen, dtype=float) / 255.0
arr_a = np.power(arr_s, 0.28)
img_a = Image.fromarray(np.uint8(arr_a * 255.0), mode='L')
img_a = ImageEnhance.Sharpness(img_a).enhance(2.2)
cand_a = img_a.resize((300, 450), Image.Resampling.LANCZOS).convert('1', dither=Image.Dither.FLOYDSTEINBERG)
candidates.append(('cand_A_gamma28_fs', cand_a))

# Candidate B: Gamma 0.25 + Edge Boost + Floyd-Steinberg
blur = np.array(screen.filter(ImageFilter.GaussianBlur(radius=2)), dtype=float) / 255.0
arr_b = np.power(arr_s, 0.25)
detail = arr_b - np.power(blur, 0.25)
arr_b = np.clip(arr_b + detail * 1.8, 0.0, 1.0)
img_b = Image.fromarray(np.uint8(arr_b * 255.0), mode='L')
img_b = ImageEnhance.Sharpness(img_b).enhance(2.0)
cand_b = img_b.resize((300, 450), Image.Resampling.LANCZOS).convert('1', dither=Image.Dither.FLOYDSTEINBERG)
candidates.append(('cand_B_gamma25_edge_fs', cand_b))

# Candidate C: Tone curve with soft edge vignette (fades outer borders smoothly to white)
h, w = 900, 600
y_idx, x_idx = np.indices((h, w))
dx = np.abs(x_idx - w/2.0) / (w/2.0)
dy = np.abs(y_idx - h/2.0) / (h/2.0)
dist = np.maximum(dx, dy)
vig = np.clip((1.0 - dist) / 0.35, 0.0, 1.0)
arr_c = arr_b * vig + (1.0 - vig) * 1.0
img_c = Image.fromarray(np.uint8(arr_c * 255.0), mode='L')
cand_c = img_c.resize((300, 450), Image.Resampling.LANCZOS).convert('1', dither=Image.Dither.FLOYDSTEINBERG)
candidates.append(('cand_C_edge_vignette_fs', cand_c))

# Candidate D: Processed from original color image (custom luminance weighting)
arr_orig = np.array(orig, dtype=float)
lum_orig = (0.45 * arr_orig[:,:,0] + 0.45 * arr_orig[:,:,1] + 0.10 * arr_orig[:,:,2]) / 255.0
lum_d = np.power(lum_orig, 0.30)
blur_d = np.array(Image.fromarray(np.uint8(lum_d*255.0)).filter(ImageFilter.GaussianBlur(radius=2)), dtype=float) / 255.0
detail_d = lum_d - blur_d
lum_d = np.clip(lum_d + detail_d * 2.0, 0.0, 1.0)
img_d = Image.fromarray(np.uint8(lum_d * 255.0), mode='L').resize((300, 450), Image.Resampling.LANCZOS)
img_d = ImageEnhance.Sharpness(img_d).enhance(2.2)
cand_d = img_d.convert('1', dither=Image.Dither.FLOYDSTEINBERG)
candidates.append(('cand_D_orig_color_fs', cand_d))

# Candidate E: Gamma 0.32 with Atkinson dithering
arr_e = np.power(arr_s, 0.32)
img_e = Image.fromarray(np.uint8(arr_e * 255.0), mode='L')
img_e = ImageEnhance.Sharpness(img_e).enhance(2.2).resize((300, 450), Image.Resampling.LANCZOS)

def atkinson_dither(img_gray):
    arr = np.array(img_gray, dtype=float)
    h, w = arr.shape
    padded = np.pad(arr, ((0, 2), (0, 2)), mode='edge')
    out = np.zeros((h, w), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            old_val = padded[y, x]
            new_val = 255.0 if old_val >= 128.0 else 0.0
            out[y, x] = int(new_val)
            err = (old_val - new_val) / 8.0
            padded[y, x+1] += err
            padded[y, x+2] += err
            padded[y+1, x-1] += err
            padded[y+1, x] += err
            padded[y+1, x+1] += err
            padded[y+2, x] += err
    return Image.fromarray(out, mode='L').convert('1')

cand_e = atkinson_dither(img_e)
candidates.append(('cand_E_atkinson_g32', cand_e))

# Candidate F: Atkinson with soft vignette
cand_f = atkinson_dither(img_c.resize((300, 450), Image.Resampling.LANCZOS))
candidates.append(('cand_F_atkinson_vignette', cand_f))

# Candidate G: Balanced Thermal Master (Tone mapping, high-pass detail preservation, moderate shadow lift to ~33% black)
# Gamma curve: shadows lifted to prevent solid blocks, but dark lines remain dark
arr_g = np.array(screen, dtype=float) / 255.0
# Custom tone curve: y = x^0.35 * 0.85 + x^1.5 * 0.15
curve_g = np.power(arr_g, 0.28)
# Add unsharp mask
blur_g = np.array(screen.filter(ImageFilter.GaussianBlur(radius=1.5)), dtype=float) / 255.0
sharp_g = curve_g + (arr_g - blur_g) * 2.0
sharp_g = np.clip(sharp_g, 0.0, 1.0)
img_g = Image.fromarray(np.uint8(sharp_g * 255.0), mode='L').resize((300, 450), Image.Resampling.LANCZOS)
img_g = ImageEnhance.Sharpness(img_g).enhance(1.8)
cand_g = img_g.convert('1', dither=Image.Dither.FLOYDSTEINBERG)
candidates.append(('cand_G_balanced_sharp_fs', cand_g))

print("%-26s | %-12s | %-11s | %-13s" % ("Candidate", "Total Black%", "Face Black%", "Border Black%"))
print("-" * 70)
for name, img in candidates:
    arr = np.array(img.convert('L'))
    total_pct = np.count_nonzero(arr == 0) / arr.size * 100.0
    face_arr = arr[140:210, 110:190]
    face_pct = np.count_nonzero(face_arr == 0) / face_arr.size * 100.0
    border = np.concatenate([arr[0:20, :].ravel(), arr[:, 0:20].ravel(), arr[:, -20:].ravel()])
    border_pct = np.count_nonzero(border == 0) / border.size * 100.0
    img.save(f'D:/Temple/tests/candidates_eval/{name}.png')
    print("%-26s | %10.1f%% | %9.1f%% | %11.1f%%" % (name, total_pct, face_pct, border_pct))
