import zxingcpp
from PIL import Image
res = zxingcpp.read_barcodes(Image.open(r'D:\\Temple\\step_33_109_receipt_print.png'))
print(res[0].text if res else 'NO_DECODE')
