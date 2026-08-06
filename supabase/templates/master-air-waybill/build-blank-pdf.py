#!/usr/bin/env python3
"""Build a share-ready blank six-copy Master Air Waybill PDF."""

from __future__ import annotations

from pathlib import Path
import sys

from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas


COPY_LABELS = (
    "ORIGINAL 1 (FOR ISSUING CARRIER)",
    "ORIGINAL 2 (FOR CONSIGNEE)",
    "ORIGINAL 3 (FOR SHIPPER)",
    "COPY 4 (DELIVERY RECEIPT)",
    "COPY 5 (FOR AIRPORT OF DESTINATION)",
    "COPY 6 (FOR THIRD CARRIER)",
)


def build(output_path: str) -> None:
    root = Path(__file__).resolve().parent
    assets = root / "assets"
    face = assets / "mawb-face-form.png"
    conditions = assets / "mawb-conditions.png"
    if not face.exists() or not conditions.exists():
        raise SystemExit("Build the Master Air Waybill reference assets first.")

    width, height = A4
    pdf = Canvas(output_path, pagesize=A4, pageCompression=1)
    pdf.setTitle("Blank Master Air Waybill Template")
    pdf.setAuthor("Multideck")

    for label in COPY_LABELS:
        pdf.drawImage(str(face), 0, 0, width=width, height=height, preserveAspectRatio=False, mask="auto")
        pdf.setFillColor(Color(1, 0, 0))
        pdf.setFont("Helvetica", 10)
        label_width = stringWidth(label, "Helvetica", 10)
        pdf.drawString((width - label_width) / 2, 48, label)
        pdf.showPage()

        pdf.drawImage(str(conditions), 0, 0, width=width, height=height, preserveAspectRatio=False, mask="auto")
        pdf.showPage()

    pdf.save()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build-blank-pdf.py OUTPUT.pdf")
    build(sys.argv[1])
