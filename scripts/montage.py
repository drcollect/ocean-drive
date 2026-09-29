"""Tile screenshots into one review sheet.

uv run --with pillow scripts/montage.py out.png cols w h img1 img2 ...
"""
import sys
from PIL import Image, ImageDraw

out, cols, w, h, *files = sys.argv[1:]
cols, w, h = int(cols), int(w), int(h)
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im, (x, y))
    d.text((x + 6, y + 4), f.split('/')[-1], fill=(255, 255, 255))
sheet.save(out)
