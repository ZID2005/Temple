import pypdf
reader = pypdf.PdfReader(r'D:\\Temple\\tests\\step_33_109_receipt_print.pdf')
pages = len(reader.pages)
box = reader.pages[0].mediabox
width_mm = float(box.width) * 25.4 / 72.0
height_mm = float(box.height) * 25.4 / 72.0
print(f'{pages},{width_mm:.1f},{height_mm:.1f}')
