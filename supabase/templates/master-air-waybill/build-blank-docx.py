#!/usr/bin/env python3
"""Build a share-ready blank six-copy Master Air Waybill DOCX."""

from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

from docx import Document


COPY_LABELS = (
    "ORIGINAL 1 (FOR ISSUING CARRIER)",
    "ORIGINAL 2 (FOR CONSIGNEE)",
    "ORIGINAL 3 (FOR SHIPPER)",
    "COPY 4 (DELIVERY RECEIPT)",
    "COPY 5 (FOR AIRPORT OF DESTINATION)",
    "COPY 6 (FOR THIRD CARRIER)",
)


def load_layout_helpers(root: Path):
    spec = spec_from_file_location("multideck_mawb_layout", root / "build-docx.py")
    if spec is None or spec.loader is None:
        raise SystemExit("The Master Air Waybill layout builder could not be loaded.")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build(output_path: str) -> None:
    root = Path(__file__).resolve().parent
    assets = root / "assets"
    layout = load_layout_helpers(root)
    document = Document()
    layout.configure_page(document)

    for index, label in enumerate(COPY_LABELS):
        face_anchor = layout.prepare_anchor_paragraph(
            document,
            page_break_before=index > 0,
            marker="",
        )
        layout.add_anchored_image(
            face_anchor,
            assets / "mawb-face-form.png",
            0,
            0,
            595.276,
            841.89,
            behind=True,
        )
        layout.add_textbox(
            face_anchor,
            f"blank-mawb-{index}-copy-label",
            180,
            777,
            235,
            18,
            [label],
            font="Arial",
            size=10,
            color="FF0000",
            align="center",
            line_height=11,
        )

        terms_anchor = layout.prepare_anchor_paragraph(
            document,
            page_break_before=True,
            marker="",
        )
        layout.add_anchored_image(
            terms_anchor,
            assets / "mawb-conditions.png",
            0,
            0,
            595.276,
            841.89,
            behind=True,
        )

    properties = document.core_properties
    properties.title = "Blank Master Air Waybill Template"
    properties.subject = "Blank six-copy, 12-page Master Air Waybill"
    properties.author = "Multideck"
    document.save(output_path)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build-blank-docx.py OUTPUT.docx")
    build(sys.argv[1])
