from PIL import Image
import numpy as np
img = Image.open(r'D:\\Temple\\assets\\temple_deity_logo_bw.png')
arr = np.array(img.convert('L'))
tot = np.count_nonzero(arr == 0) / arr.size * 100.0
face = arr[140:210, 110:190]
face_pct = np.count_nonzero(face == 0) / face.size * 100.0
border = np.concatenate([arr[0:20, :].ravel(), arr[:, 0:20].ravel(), arr[:, -20:].ravel()])
border_pct = np.count_nonzero(border == 0) / border.size * 100.0
print(f'{img.size[0]},{img.size[1]},{tot:.2f},{face_pct:.2f},{border_pct:.2f}')
