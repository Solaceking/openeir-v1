#!/usr/bin/env python3
"""Generate a synthetic BP monitor screen image for OCR pipeline testing."""
from PIL import Image, ImageDraw, ImageFont
import sys

W, H = 640, 400
img = Image.new("RGB", (W, H), (18, 24, 38))  # dark LCD background
d = ImageDraw.ImageDraw(img)

# subtle panel
d.rounded_rectangle([10, 10, W - 10, H - 10], radius=24, outline=(40, 52, 74), width=3)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
try:
    big = ImageFont.truetype(FONT, 150)
    small = ImageFont.truetype(FONT, 44)
except Exception:
    big = ImageFont.load_default()
    small = ImageFont.load_default()

green = (66, 245, 120)  # classic LCD green
# "145" "/" "95"
d.text((70, 90), "145", font=big, fill=green)
d.text((300, 100), "/", font=big, fill=green)
d.text((370, 90), "95", font=big, fill=green)
# pulse row
d.text((150, 280), "PUL 72 bpm", font=small, fill=green)

out = "/home/z/my-project/scripts/test-bp-monitor.png"
img.save(out, "PNG")
print(out)
