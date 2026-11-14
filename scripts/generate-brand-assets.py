#!/usr/bin/env python3
"""Regenerate the DA Works brand assets (Android icons/splashes + Windows .ico).

Usage:
    python3 -m pip install pillow
    python3 scripts/generate-brand-assets.py

Everything is drawn from code so the artwork stays in sync with the app's
carbon/red palette; no binary source files are needed. Run it from the repo
root (or anywhere - paths are resolved relative to this file).
"""
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
ELECTRON = ROOT / "assets" / "electron"
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

CARBON = (11, 12, 14)
CARBON_LIGHT = (24, 24, 27)
RED = (232, 52, 59)
RED_DEEP = (169, 31, 39)
SCALE = 4  # supersampling factor


def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


def carbon_background(size, radius=0):
    """Dark diagonal-weave plate, optionally rounded."""
    w, h = size
    image = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(int(CARBON_LIGHT[i] + (CARBON[i] - CARBON_LIGHT[i]) * t) for i in range(3)) + (255,)
        draw.line([(0, y), (w, y)], fill=row)

    weave = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    weave_draw = ImageDraw.Draw(weave)
    step = max(6, int(min(w, h) * 0.055))
    for offset in range(-h, w + h, step):
        weave_draw.line([(offset, 0), (offset + h, h)], fill=(255, 255, 255, 7), width=max(1, step // 6))
    image = Image.alpha_composite(image, weave)

    if radius:
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
        image.putalpha(mask)
    return image


def draw_monogram(image, scale=1.0, color=RED, tracking=-0.10):
    """Centered 'DA' monogram with tight tracking, matching the in-app brand mark."""
    w, h = image.size
    draw = ImageDraw.Draw(image)
    size = int(min(w, h) * 0.46 * scale)
    face = font(size)
    letters = "DA"
    gap = int(size * tracking)
    widths = [draw.textbbox((0, 0), ch, font=face)[2] - draw.textbbox((0, 0), ch, font=face)[0] for ch in letters]
    total = sum(widths) + gap * (len(letters) - 1)
    box = draw.textbbox((0, 0), letters, font=face)
    x = (w - total) / 2
    y = (h - (box[3] - box[1])) / 2 - box[1]
    for ch, width in zip(letters, widths):
        draw.text((x, y), ch, font=face, fill=color)
        x += width + gap
    return image


def render(size, radius_ratio=0.22, mark_scale=1.0, plate=True):
    big = (size[0] * SCALE, size[1] * SCALE)
    image = carbon_background(big, radius=int(min(big) * radius_ratio)) if plate else Image.new("RGBA", big, (0, 0, 0, 0))
    draw_monogram(image, scale=mark_scale)
    if plate:
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle(
            [1, 1, big[0] - 2, big[1] - 2],
            radius=int(min(big) * radius_ratio),
            outline=(58, 58, 63, 255),
            width=max(1, SCALE),
        )
    return image.resize(size, Image.LANCZOS)


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
    print(f"  {path.relative_to(ROOT)}")


def main():
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

    print("Android launcher icons")
    for name, factor in densities.items():
        side = int(48 * factor)
        save(render((side, side)), RES / f"mipmap-{name}" / "ic_launcher.png")

        round_big = render((side * SCALE, side * SCALE))
        mask = Image.new("L", round_big.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, round_big.size[0] - 1, round_big.size[1] - 1], fill=255)
        round_big.putalpha(mask)
        save(round_big.resize((side, side), Image.LANCZOS), RES / f"mipmap-{name}" / "ic_launcher_round.png")

        # Adaptive foreground: artboard is 108dp, the safe zone is the middle 66%.
        foreground = int(108 * factor)
        save(render((foreground, foreground), plate=False, mark_scale=0.62),
             RES / f"mipmap-{name}" / "ic_launcher_foreground.png")

    print("Android splash screens")
    splash_sizes = {
        "drawable": (480, 320),
        "drawable-land-mdpi": (480, 320),
        "drawable-land-hdpi": (800, 480),
        "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1600, 960),
        "drawable-land-xxxhdpi": (1920, 1280),
        "drawable-port-mdpi": (320, 480),
        "drawable-port-hdpi": (480, 800),
        "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (960, 1600),
        "drawable-port-xxxhdpi": (1280, 1920),
    }
    for folder, size in splash_sizes.items():
        big = (size[0] * 2, size[1] * 2)
        image = carbon_background(big)
        draw = ImageDraw.Draw(image)
        # Soft red glow behind the mark.
        glow = Image.new("RGBA", big, (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        cx, cy = big[0] / 2, big[1] / 2
        max_radius = min(big) * 0.42
        for step in range(28, 0, -1):
            radius = max_radius * step / 28
            alpha = int(2 + 12 * (1 - step / 28) ** 2)
            glow_draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(*RED_DEEP, alpha))
        image = Image.alpha_composite(image, glow)
        mark = Image.new("RGBA", big, (0, 0, 0, 0))
        draw_monogram(mark, scale=0.42)
        image = Image.alpha_composite(image, mark)
        save(image.resize(size, Image.LANCZOS).convert("RGB"), RES / folder / "splash.png")

    save(render((512, 512), plate=False, mark_scale=0.66), RES / "drawable" / "splash_logo.png")

    print("Desktop / store artwork")
    master = render((1024, 1024))
    save(master, ROOT / "assets" / "da-works-icon.png")
    save(master.resize((512, 512), Image.LANCZOS), ELECTRON / "icon.png")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(ELECTRON / "icon.ico", sizes=ico_sizes)
    print(f"  {ELECTRON.relative_to(ROOT) / 'icon.ico'}")


if __name__ == "__main__":
    main()
