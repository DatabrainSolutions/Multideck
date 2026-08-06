#!/usr/bin/env python3
"""Create clean two-page MNG Air Waybill artwork from the supplied PDF."""

from __future__ import annotations

from pathlib import Path
from subprocess import run
from tempfile import TemporaryDirectory
from PIL import Image, ImageDraw
import sys


RENDER_DPI = 240


def points_to_pixels(value: float) -> int:
    return round(value * RENDER_DPI / 72)


def main(reference_pdf: str, asset_directory: str) -> None:
    source = Path(reference_pdf).resolve()
    assets = Path(asset_directory).resolve()
    assets.mkdir(parents=True, exist_ok=True)

    with TemporaryDirectory(prefix="multideck-mng-awb-reference-") as temporary:
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

        # The supplied face uses red for the permanent form and black for the
        # completed shipment. Retaining only the red channel yields a clean,
        # carrier-authentic source without copying the sample shipment data.
        rendered_pages = sorted(Path(temporary).glob("page-*.png"))
        if len(rendered_pages) != 2:
            raise RuntimeError(f"Expected two rendered pages, found {len(rendered_pages)}")

        face = Image.open(rendered_pages[0]).convert("RGBA")
        pixels = face.load()
        for y in range(face.height):
            for x in range(face.width):
                red, green, blue, _ = pixels[x, y]
                is_reference_red = red > 126 and red - green > 12 and red - blue > 12
                pixels[x, y] = (red, green, blue, 255) if is_reference_red else (255, 255, 255, 255)

        # The supplied PDF contains a malformed printer-driver label in the
        # left bleed area ("Laser Air Waybill") that wraps across four lines.
        # It is not part of the AWB form and would otherwise collide with the
        # charges section, so remove only that narrow bleed-area fragment.
        cleanup_top = points_to_pixels(550)
        cleanup_bottom = points_to_pixels(640)
        face.paste(
            (255, 255, 255, 255),
            (0, cleanup_top, points_to_pixels(46), cleanup_bottom),
        )
        ImageDraw.Draw(face).line(
            (
                points_to_pixels(43.5),
                cleanup_top,
                points_to_pixels(43.5),
                cleanup_bottom,
            ),
            fill=(255, 0, 0, 255),
            width=max(1, points_to_pixels(0.5)),
        )
        form_draw = ImageDraw.Draw(face)
        for horizontal_y in (558, 581.7, 605.75, 629.8):
            form_draw.line(
                (
                    points_to_pixels(43.5),
                    points_to_pixels(horizontal_y),
                    points_to_pixels(46),
                    points_to_pixels(horizontal_y),
                ),
                fill=(255, 0, 0, 255),
                width=max(1, points_to_pixels(0.5)),
            )
        face.save(assets / "mng-awb-face-form.png", optimize=True)

        # Page two contains the complete MNG contract conditions. It is static
        # legal artwork and is preserved as supplied, at print resolution.
        conditions = Image.open(rendered_pages[1]).convert("RGB")
        conditions.save(assets / "mng-awb-conditions.png", optimize=True)

        Image.new("RGBA", (2, 2), (255, 255, 255, 0)).save(assets / "barcode-placeholder.png")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: generate-reference-assets.py REFERENCE.pdf ASSET_DIRECTORY")
    main(sys.argv[1], sys.argv[2])
