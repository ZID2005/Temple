import zxingcpp
from PIL import Image
img = Image.open(r'D:\\Temple\\assets\\temple_upi_qr.png')
res = zxingcpp.read_barcodes(img)
text = res[0].text if res else 'NO_DECODE'
print(f'{img.size[0]},{img.size[1]},{text}')
