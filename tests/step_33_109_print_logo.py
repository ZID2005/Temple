from PIL import Image
import numpy as np
img = Image.open(r'D:\\Temple\\step_33_109_receipt_print.png').convert('L')
arr = np.array(img)
logo_crop = arr[45:150, 215:285]
black_pct = np.count_nonzero(logo_crop < 128) / logo_crop.size * 100.0
print(f'{black_pct:.1f}')
