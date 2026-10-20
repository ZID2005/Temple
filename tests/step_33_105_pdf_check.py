import pypdf
reader = pypdf.PdfReader(r'D:\\Temple\\tests\\step_33_105_print.pdf')
pages = len(reader.pages)
box = reader.pages[0].mediabox
width_pt = float(box.width)
height_pt = float(box.height)
width_mm = width_pt * 25.4 / 72.0
height_mm = height_pt * 25.4 / 72.0
print(f"PAGES={pages}")
print(f"WIDTH_MM={width_mm:.1f}")
print(f"HEIGHT_MM={height_mm:.1f}")
