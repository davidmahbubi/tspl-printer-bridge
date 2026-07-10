#!/usr/bin/env python3
"""
Composite the plain logo onto a macOS-style rounded-rect (squircle) background
and rebuild icon.icns. macOS app icons are expected to draw their own
background inside a 1024px canvas: the squircle is ~824px centered, leaving
margin for the system drop shadow.

Usage: python3 scripts/make-macos-icon.py
Outputs: assets/icons/macos/icon.icns (overwritten)
         assets/icons/macos/app-512.png (for the dev dock icon)
"""
import pathlib
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets/icons/macos"

CANVAS = 1024
SQUIRCLE = 824          # Apple icon grid size inside the canvas
RADIUS = 184            # ~22.37% of the squircle size
LOGO_SIZE = 600         # logo footprint inside the squircle
BG_TOP = (255, 255, 255, 255)
BG_BOTTOM = (236, 240, 246, 255)

logo = Image.open(ICONS / "1024x1024.png").convert("RGBA")

# Squircle mask
mask = Image.new("L", (SQUIRCLE, SQUIRCLE), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [0, 0, SQUIRCLE - 1, SQUIRCLE - 1], radius=RADIUS, fill=255
)

# Vertical gradient fill
gradient = Image.new("RGBA", (SQUIRCLE, SQUIRCLE))
for y in range(SQUIRCLE):
    t = y / (SQUIRCLE - 1)
    row = tuple(
        round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(4)
    )
    ImageDraw.Draw(gradient).line([(0, y), (SQUIRCLE, y)], fill=row)

plate = Image.new("RGBA", (SQUIRCLE, SQUIRCLE), (0, 0, 0, 0))
plate.paste(gradient, (0, 0), mask)

canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
offset = (CANVAS - SQUIRCLE) // 2

# Soft drop shadow behind the squircle
shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
shadow_mask = Image.new("L", (CANVAS, CANVAS), 0)
ImageDraw.Draw(shadow_mask).rounded_rectangle(
    [offset, offset + 12, offset + SQUIRCLE - 1, offset + SQUIRCLE + 11],
    radius=RADIUS,
    fill=90,
)
shadow.putalpha(shadow_mask.filter(ImageFilter.GaussianBlur(18)))
canvas.alpha_composite(shadow)

canvas.alpha_composite(plate, (offset, offset))

logo_resized = logo.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)
logo_pos = ((CANVAS - LOGO_SIZE) // 2, (CANVAS - LOGO_SIZE) // 2)
canvas.alpha_composite(logo_resized, logo_pos)

canvas.resize((512, 512), Image.LANCZOS).save(ICONS / "app-512.png")

with tempfile.TemporaryDirectory() as tmp:
    iconset = pathlib.Path(tmp) / "app.iconset"
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        canvas.resize((size, size), Image.LANCZOS).save(
            iconset / f"icon_{size}x{size}.png"
        )
        canvas.resize((size * 2, size * 2), Image.LANCZOS).save(
            iconset / f"icon_{size}x{size}@2x.png"
        )
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(ICONS / "icon.icns")],
        check=True,
    )

print(f"Generated {ICONS / 'icon.icns'} and {ICONS / 'app-512.png'}")
