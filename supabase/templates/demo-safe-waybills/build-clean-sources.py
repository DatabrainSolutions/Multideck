#!/usr/bin/env python3
"""Clean draft sources; never alter the retained originals or issued files."""
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec
import base64
import hashlib
import json
import re
import sys
import zipfile

import pdfplumber
from docx import Document
from docx.oxml import parse_xml

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent


def clean_air(source, target):
    # Keep artwork, page geometry, six-copy ordering and all existing mappings.
    substitutions = {
        "AS AGENTS FOR THE CARRIER MNG AIRLINES": "AS AGENTS FOR THE CARRIER {d.routing[isMainCarriage=true].carrierName:ellipsis(28)}",
        "MNG AIRLINES": "{d.routing[isMainCarriage=true].carrierName:ellipsis(28)}",
        "YESILKOY CAD.NO 9 FLORYA": "{d.routing[isMainCarriage=true].carrierAddressLine1:ellipsis(34)}",
        "ISTANBUL": "{d.routing[isMainCarriage=true].carrierAddressCity:ellipsis(28)}",
    }
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as dst:
        for part in src.infolist():
            data = src.read(part.filename)
            if part.filename == "word/document.xml":
                text = data.decode()
                for old, new in substitutions.items():
                    assert old in text, f"Expected carrier slot missing: {old}"
                    text = text.replace(old, new)
                data = text.encode()
            elif part.filename == "docProps/core.xml":
                text = data.decode()
                for field, value in (("dc:creator", "Multideck"), ("cp:lastModifiedBy", "Multideck"), ("dc:description", "")):
                    text = re.sub(rf"<{field}>.*?</{field}>", f"<{field}>{value}</{field}>", text)
                data = text.encode()
            dst.writestr(part, data)
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(target) as dst:
        for name in src.namelist():
            if name not in ("word/document.xml", "docProps/core.xml"):
                assert src.read(name) == dst.read(name), f"Unexpected changed part: {name}"


def layout_helpers():
    path = ROOT / "supabase/templates/master-air-waybill/build-docx.py"
    spec = spec_from_file_location("waybill_layout", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def add_rule(anchor, index, x, y, width, height):
    # Only form rules survive; source images and customer text are never copied.
    xml = f'''<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml">
      <w:pict><v:rect id="fiata-rule-{index}" style="position:absolute;margin-left:{x}pt;margin-top:{y}pt;width:{width}pt;height:{height}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;mso-wrap-style:none" fillcolor="#000000" stroked="f"/></w:pict></w:r>'''
    anchor._p.append(parse_xml(xml))


def build_fiata(reference):
    assert hashlib.sha256(reference.read_bytes()).hexdigest() == "49da9d563b46fb26dff7336c102b80e6fe43bb327cb4de23dedbc842b5405e01", "Only the inspected reference may be used"
    layout = layout_helpers()
    document = Document()
    layout.configure_page(document)
    anchor = layout.prepare_anchor_paragraph(document, page_break_before=False, marker="")
    with pdfplumber.open(reference) as pdf:
        assert len(pdf.pages) == 1, "The retained waybill must be the inspected one-page reference"
        page = pdf.pages[0]
        # A strict geometry filter excludes highlights and image bounding boxes.
        for index, rect in enumerate(page.rects):
            if min(rect["width"], rect["height"]) < 1.1:
                add_rule(anchor, index, rect["x0"], rect["top"], max(rect["width"], .15), max(rect["height"], .15))
        # Labels are the 6pt form furniture and the reviewed heading at the top.
        for line_index, line in enumerate(page.extract_text_lines()):
            chars = [c for c in line["chars"] if abs(c["size"] - 6) < .05 or c["top"] < 69]
            if not chars:
                continue
            groups = []
            for char in chars:
                if not groups or char["x0"] - groups[-1][-1]["x1"] > 5 or abs(char["size"] - groups[-1][-1]["size"]) > .1:
                    groups.append([])
                groups[-1].append(char)
            for group_index, group in enumerate(groups):
                text = pdfplumber.utils.extract_text(group, x_tolerance=1, y_tolerance=3)
                # The issuer is data, not an immutable part of this form.
                if text.startswith("For and on behalf of"):
                    text = "For and on behalf of the issuing company"
                label_top = min(c["top"] for c in group)
                label_size = group[0]["size"]
                if group[0]["x0"] > 350 and label_top < 69:
                    label_top = 20 + round((label_top - 19.8) / 8.15) * 7
                    label_size = 5.5  # Six legal-heading lines stay clear of the top rule.
                layout.add_textbox(anchor, f"label-{line_index}-{group_index}", group[0]["x0"], label_top, max(30,group[-1]["x1"]-group[0]["x0"]+3), 24, [text], size=label_size, line_height=label_size*1.2)

    def field(name, x, y, width, height, tags, size=9, align="left"):
        layout.add_textbox(anchor, name, x, y, width, height, tags, size=size, align=align, line_height=size*1.2)

    field("shipper",46,82,245,64,["{d.waybill.shipper.name:ellipsis(38)}","{d.waybill.shipper.line1:ellipsis(42)}","{d.waybill.shipper.line2:ellipsis(42)}","{d.waybill.shipper.city:ellipsis(42)}","{d.waybill.shipper.country:ellipsis(42)}"])
    for role,y in (("consignee",162),("notify",242)):
        field(role,46,y,245,64,[f"{{d.waybill.{role}.{key}:ellipsis(42)}}" for key in ("name","line1","line2","city","country")])
    for name,x,y,w,h,size in (
        ("customsReference",301,82,260,12,8), ("shipperReference",301,108,260,12,8),
        ("billNumber",301,136,128,13,9),("forwarderReference",438,136,126,13,9),
        ("departureDate",301,162,128,13,9),("arrivalDate",438,162,126,13,9),
        ("bookingReference",301,190,260,12,9), ("carrierName",305,292,258,22,16),
        ("placeOfReceipt",46,323,120,13,8),("portOfLoading",174,323,118,13,8),
        ("vesselVoyage",46,351,245,13,8),("portOfDischarge",46,378,120,13,8),
        ("destination",174,378,118,13,8),("billType",325,365,212,23,18),
        ("containerNumber",43,442,109,12,8),("seal",155,442,64,12,8),
        ("equipmentType",222,442,57,12,8),("grossWeight",284,442,79,12,8),
        ("volume",368,442,67,12,8),("packages",442,442,120,12,8),
        ("marks",43,411,163,15,8),("packageDescription",215,411,205,15,8),
        ("totalPackages",43,512,250,13,9),("onBoardDate",185,690,70,10,8),
        ("originals",46,715,118,13,9),("freightTerms",176,715,120,13,9),
        ("issuePlaceDate",311,715,250,13,9),
    ):
        field(name,x,y,w,h,[f"{{d.waybill.{name}}}"],size)
    field("goods",213,463,345,110,["{d.waybill.goodsLine1:ellipsis(62)}", "{d.waybill.goodsLine2:ellipsis(62)}", "{d.waybill.goodsLine3:ellipsis(62)}"],8)
    field("service",213,578,345,14,["{d.waybill.serviceMode}"],8)
    field("agent",43,744,257,59,[f"{{d.waybill.deliveryAgent.{key}:ellipsis(44)}}" for key in ("name","line1","line2","city","country")],8)
    field("issuer",311,744,250,54,["{d.waybill.issuerName:ellipsis(44)}","AS AGENTS FOR THE CARRIER","{d.waybill.carrierName:ellipsis(44)}"],8)
    field("demo-signoff",311,788,250,13,["{d.waybill.signingNote}"],8)
    field("container-labels",43,430,523,12,["Container                         Seal              Type            Weight            Volume       Packages"],8)
    field("on-board-label",43,690,140,10,["SHIPPED ON BOARD"],8)
    field("declaration",260,690,300,10,["according to the declaration of the consignor"],7)
    layout.add_anchored_image(anchor,ROOT / "supabase/templates/fiata-bill-of-lading/assets/bifa.png",309,18,57,28,behind=False)
    # The replaceable image contains only the reviewed Multideck artwork.
    registry = json.loads((ROOT / "supabase/functions/_shared/template-preview-catalogue.json").read_text())
    sample = registry["cb6d7212191158897fab217ac32c46e2f1144a13638c3f649e3b1e97a08d65ce"]["sampleData"]
    logo = base64.b64decode(sample["company"]["logoDataUri"].split(",",1)[1])
    logo_path = OUT / "multideck-logo.png"
    logo_path.write_bytes(logo)
    layout.add_anchored_image(anchor,logo_path,319,210,205,54,behind=False,alt_text="{d.company.logoDataUri:imageFit(contain)} {d.company.logoDataUri:ifEM():drop(img)}")
    document.core_properties.title = "FIATA Waybill Template"
    document.core_properties.author = "Multideck"
    document.core_properties.last_modified_by = "Multideck"
    document.core_properties.subject = "Clean editable form with no customer text or signature"
    document.save(OUT / "FIATA_Waybill_demo_safe.docx")


if __name__ == "__main__":
    clean_air(ROOT / "supabase/templates/master-air-waybill/Master_Air_Waybill_Carbone_Template.docx", OUT / "Master_Air_Waybill_demo_safe.docx")
    clean_air(ROOT / "supabase/templates/mng-air-waybill/MNG_Air_Waybill_Carbone_Template.docx", OUT / "MNG_Air_Waybill_demo_safe.docx")
    build_fiata(Path(sys.argv[1]))
    print("Created three clean draft sources; retained originals unchanged")
