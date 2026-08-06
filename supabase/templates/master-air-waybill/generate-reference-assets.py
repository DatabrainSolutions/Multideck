#!/usr/bin/env python3
"""Create clean MAWB form assets from the supplied 12-page reference PDF."""

from __future__ import annotations

from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw
import sys


RENDER_DPI = 240
COPY_LABEL_TOP_POINTS = 774
PDF_HEIGHT_POINTS = 841.886


def points_to_pixels(value: float) -> int:
    return round(value * RENDER_DPI / 72)


def main(reference_pdf: str, asset_directory: str) -> None:
    source = Path(reference_pdf).resolve()
    assets = Path(asset_directory).resolve()
    assets.mkdir(parents=True, exist_ok=True)

    with TemporaryDirectory(prefix="multideck-mawb-reference-") as temporary:
        prefix = Path(temporary) / "page"
        run(
            [
                "pdftoppm",
                "-png",
                "-r",
                str(RENDER_DPI),
                "-f",
                "1",
                "-l",
                "2",
                str(source),
                str(prefix),
            ],
            check=True,
        )

        face = Image.open(f"{prefix}-01.png").convert("RGBA")
        cutoff = round(face.height * COPY_LABEL_TOP_POINTS / PDF_HEIGHT_POINTS)
        pixels = face.load()
        for y in range(face.height):
            for x in range(face.width):
                red, green, blue, _ = pixels[x, y]
                is_reference_red = y < cutoff and red > 130 and red - green > 14 and red - blue > 14
                pixels[x, y] = (red, green, blue, 255) if is_reference_red else (255, 255, 255, 255)

        # The source carries a wrapped "Laser Air Waybill" bleed label down
        # the far-left edge. It is not part of the form and can show through
        # generated values, so restore the nearby grid after covering it.
        cleanup_top = points_to_pixels(550)
        cleanup_bottom = points_to_pixels(760)
        face.paste((255, 255, 255, 255), (0, cleanup_top, points_to_pixels(43.5), cleanup_bottom))
        draw = ImageDraw.Draw(face)
        rule = (255, 56, 56, 255)
        rule_width = max(1, round(RENDER_DPI / 144))
        left_rule = points_to_pixels(43.5)
        draw.line((left_rule, cleanup_top, left_rule, cleanup_bottom), fill=rule, width=rule_width)
        face.save(assets / "mawb-face-form.png", optimize=True)

        conditions = Image.open(f"{prefix}-02.png").convert("RGB")
        conditions.save(assets / "mawb-conditions.png", optimize=True)

        Image.new("RGBA", (2, 2), (255, 255, 255, 0)).save(assets / "barcode-placeholder.png")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: generate-reference-assets.py REFERENCE.pdf ASSET_DIRECTORY")
    main(sys.argv[1], sys.argv[2])
