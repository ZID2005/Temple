import numpy as np
from PIL import Image

screen = Image.open(r'D:\\Temple\\tests\\step_33_104_preview_screen.png')
# Modal is centered in 500x750 viewport
# Crop deity logo
logo_crop = screen.crop((205, 55, 295, 185))
logo_crop.save(r'D:\\Temple\\tests\\step_33_104_preview_logo_crop.png')

gray = logo_crop.convert('L')
arr = np.array(gray)

# Continuous-tone midtone gradations: 40 to 220
midtones = np.sum((arr >= 40) & (arr <= 220))
midtone_pct = (midtones / arr.size) * 100.0

std_dev = float(np.std(arr))

print(f"MIDTONE_PCT={midtone_pct:.2f}")
print(f"STD_DEV={std_dev:.2f}")
