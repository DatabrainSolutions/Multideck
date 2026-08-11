#!/usr/bin/env python3
"""Build the fixed-layout two-page MNG Air Waybill Carbone DOCX."""

from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

from docx import Document


COPY_LABEL = "ORIGINAL 2 (FOR CONSIGNEE)"


def load_layout_helpers():
    helper_path = Path(__file__).resolve().parents[1] / "master-air-waybill" / "build-docx.py"
    spec = spec_from_file_location("multideck_mawb_layout", helper_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Word layout helpers from {helper_path}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def add_face(document: Document, assets: Path, layout) -> None:
    anchor = layout.prepare_anchor_paragraph(document, page_break_before=False, marker="[[MNG_AWB_FACE]]")
    layout.add_anchored_image(anchor, assets / "mng-awb-face-form.png", 0, 0, 595.276, 841.89, behind=True)

    # Every variable is constrained to the corresponding box in the supplied
    # form. Narrow boxes use substr/ellipsis so long operational data cannot
    # move neighbouring fields or overlap the permanent artwork.
    fields = [
        ("prefix", 57, 17, 28, 13, ["{d.routing[isMainCarriage=true].masterTransportReference:substr(0,3)}"], 8.2, "left"),
        ("origin-code", 87, 17, 27, 13, ["{d.routing[isMainCarriage=true].origin.unlocode:substr(2,5)}"], 8.2, "center"),
        ("reference-suffix", 117, 17, 70, 13, ["{d.routing[isMainCarriage=true].masterTransportReference:substr(4,12)}"], 8.2, "left"),
        ("reference-right", 496, 17, 82, 13, ["{d.routing[isMainCarriage=true].masterTransportReference:ellipsis(18)}"], 7.0, "right"),
        ("shipper", 45, 52, 219, 68, [
            "{d.shipper.name:ellipsis(48)}",
            "{d.shipper.address.line1:ellipsis(52)}",
            "{d.shipper.address.line2:ellipsis(52)}",
            "{d.shipper.address.city:ellipsis(28)} {d.shipper.address.countyOrState:ellipsis(20)}",
            "{d.shipper.address.postalCode:ellipsis(16)} {d.shipper.address.countryCode:ellipsis(3)}",
        ], 7.1, "left"),
        ("consignee", 45, 122, 219, 68, [
            "{d.consignee.name:ellipsis(48)}",
            "{d.consignee.address.line1:ellipsis(52)}",
            "{d.consignee.address.line2:ellipsis(52)}",
            "{d.consignee.address.city:ellipsis(28)} {d.consignee.address.countyOrState:ellipsis(20)}",
            "{d.consignee.address.postalCode:ellipsis(16)} {d.consignee.address.countryCode:ellipsis(3)}",
        ], 7.1, "left"),
        ("issuer", 383, 36, 188, 52, [
            "MNG AIRLINES",
            "YESILKOY CAD.NO 9 FLORYA",
            "ISTANBUL",
        ], 8.0, "left"),
        ("agent", 49, 186, 205, 45, [
            "{d.job.legalEntityName:ellipsis(46)}",
            "{d.job.origin.name:ellipsis(46)}",
        ], 7.5, "left"),
        ("accounting", 307, 189, 185, 48, [
            "SHP REF: {d.job.period:ellipsis(12)}-{d.job.number:ellipsis(18)}",
            "AGT REF: {d.routing[isMainCarriage=true].houseTransportReference:ellipsis(34)}",
            "BOOKING: {d.routing[isMainCarriage=true].carrierBookingReference:ellipsis(30)}",
        ], 7.0, "left"),
        ("departure", 50, 254, 220, 17, ["{d.routing[isMainCarriage=true].origin.name:ellipsis(52)}"], 7.2, "left"),
        ("route-to", 49, 278, 27, 14, ["{d.routing[isMainCarriage=true].destination.unlocode:substr(2,5)}"], 7.0, "center"),
        ("route-carrier", 78, 278, 116, 14, ["MNG AIRLINES"], 7.0, "left"),
        ("route-flight", 230, 278, 47, 14, ["{d.routing[isMainCarriage=true].flightNumber:ellipsis(10)}"], 6.8, "left"),
        ("destination", 51, 302, 122, 14, ["{d.routing[isMainCarriage=true].destination.name:ellipsis(28)}"], 7.0, "left"),
        ("flight", 178, 302, 65, 14, ["{d.routing[isMainCarriage=true].flightNumber:ellipsis(14)}"], 6.8, "center"),
        ("flight-date", 244, 302, 65, 14, ["{d.routing[isMainCarriage=true].plannedDepartureAt:formatD(DD/MM/YYYY):ellipsis(10)}"], 6.8, "center"),
        ("handling", 51, 321, 368, 48, [
            "SPX  JOB {d.job.period:ellipsis(12)}-{d.job.number:ellipsis(18)}",
            "{d.cargo[].marksAndNumbers:aggStr(' · '):ellipsis(92)}",
        ], 7.0, "left"),
        ("sci", 508, 349, 45, 14, ["X"], 7.0, "center"),
        ("cargo-pieces", 44, 391, 28, 46, ["{d.cargo[0].packageQuantity}"], 7.4, "center"),
        ("cargo-weight", 74, 391, 48, 46, ["{d.cargo[0].grossWeight:formatN(2)}"], 6.0, "right"),
        ("cargo-unit", 123, 391, 12, 46, ["{d.cargo[0].weightUnit:substr(0,1)}"], 7.0, "center"),
        ("cargo-item", 153, 391, 65, 46, ["{d.cargo[0].hsCode:ellipsis(14)}"], 7.0, "left"),
        ("cargo-chargeable", 209, 391, 53, 46, ["{d.cargo[0].grossWeight:formatN(2)}"], 6.0, "right"),
        ("cargo-nature", 431, 391, 143, 82, [
            "{d.cargo[0].commodity:ellipsis(30)}",
            "{d.cargo[0].description:ellipsis(30)}",
            "{d.cargo[0].marksAndNumbers:ellipsis(30)}",
        ], 7.0, "left"),
        ("total-pieces", 44, 534, 28, 14, ["{d.cargo[].packageQuantity:aggSum}"], 7.2, "center"),
        ("total-weight", 74, 534, 48, 14, ["{d.cargo[].grossWeight:aggSum:formatN(2)}"], 6.0, "right"),
        ("total-chargeable", 209, 534, 53, 14, ["{d.cargo[].grossWeight:aggSum:formatN(2)}"], 6.0, "right"),
        ("total-volume", 431, 534, 143, 14, ["{d.cargo[].volume:aggSum:formatN(3)} {d.cargo[0].volumeUnit:ellipsis(3)}"], 7.0, "left"),
        ("charges-description", 260, 565, 178, 48, ["{d.cargo[].description:aggStr(' · '):ellipsis(76)}"], 7.0, "left"),
        ("signature", 261, 660, 296, 38, [
            "{d.job.legalEntityName:ellipsis(42)}",
            "AS AGENTS FOR THE CARRIER MNG AIRLINES",
        ], 7.1, "left"),
        ("issue-detail", 260, 729, 213, 18, [
            "{d.routing[isMainCarriage=true].plannedDepartureAt:formatD(DD/MM/YYYY):ellipsis(10)}  {d.routing[isMainCarriage=true].origin.name:ellipsis(32)}"
        ], 6.9, "left"),
        ("issuer-signature", 454, 732, 120, 15, ["{d.job.legalEntityName:ellipsis(26)}"], 6.8, "center"),
    ]

    for name, left, top, width, height, lines, size, align in fields:
        layout.add_textbox(
            anchor,
            f"mng-awb-{name}",
            left,
            top,
            width,
            height,
            lines,
            font="Arial",
            size=size,
            align=align,
        )

    layout.add_anchored_image(
        anchor,
        assets / "barcode-placeholder.png",
        472,
        767,
        105,
        31,
        behind=False,
        alt_text="{d.routing[isMainCarriage=true].masterTransportReference:barcode(code128,includetext:false,width:105,height:28)}",
    )


def add_conditions(document: Document, assets: Path, layout) -> None:
    anchor = layout.prepare_anchor_paragraph(document, page_break_before=True, marker="[[MNG_AWB_CONDITIONS]]")
    layout.add_anchored_image(anchor, assets / "mng-awb-conditions.png", 0, 0, 595.276, 841.89, behind=True)


def main(output_path: str) -> None:
    root = Path(__file__).resolve().parent
    layout = load_layout_helpers()
    document = Document()
    layout.configure_page(document)
    add_face(document, root / "assets", layout)
    add_conditions(document, root / "assets", layout)

    properties = document.core_properties
    properties.title = "MNG Air Waybill Carbone Template"
    properties.subject = f"Fixed-layout two-page MNG Airlines Air Waybill — {COPY_LABEL}"
    properties.author = "Multideck"
    document.save(output_path)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build-docx.py OUTPUT.docx")
    main(sys.argv[1])
