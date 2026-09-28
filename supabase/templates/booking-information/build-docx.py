"""Build the unpublished Carbone Booking information Word template.

The data contract is document_api.prepare_booking_confirmation in the
20260924133000 migration. Run this script with the bundled Python runtime.
"""

from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Mm, Pt, RGBColor


DESTINATION = Path(__file__).with_name("Booking_Information_Carbone_Template.docx")
doc = Document()
section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Inches(0.72)
section.bottom_margin = Inches(0.72)
section.left_margin = Inches(0.72)
section.right_margin = Inches(0.72)

styles = doc.styles
styles["Normal"].font.name = "Aptos"
styles["Normal"].font.size = Pt(9.5)
styles["Normal"].font.color.rgb = RGBColor(41, 41, 41)
styles["Normal"].paragraph_format.space_after = Pt(6)
for name, size in (("Title", 18), ("Heading 1", 11)):
    styles[name].font.name = "Aptos"
    styles[name].font.size = Pt(size)
    styles[name].font.bold = True
    styles[name].font.color.rgb = RGBColor(0, 0, 0)
    styles[name].paragraph_format.space_before = Pt(12 if name == "Heading 1" else 0)
    styles[name].paragraph_format.space_after = Pt(5)
    title_borders = styles[name].element.get_or_add_pPr().find(qn("w:pBdr"))
    if title_borders is not None:
        styles[name].element.get_or_add_pPr().remove(title_borders)


def heading(text):
    doc.add_paragraph(text, style="Heading 1")


def label_value(label, value):
    para = doc.add_paragraph()
    para.add_run(f"{label}  ").bold = True
    para.add_run(value)


def table(headers, first_row, marker):
    result = doc.add_table(rows=1, cols=len(headers))
    result.style = "Table Grid"
    header_properties = result.rows[0]._tr.get_or_add_trPr()
    repeat_header = OxmlElement("w:tblHeader")
    repeat_header.set(qn("w:val"), "true")
    header_properties.append(repeat_header)
    for cell, title in zip(result.rows[0].cells, headers):
        cell.text = title
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for run in cell.paragraphs[0].runs:
            run.bold = True
            run.font.size = Pt(8)
    cells = result.add_row().cells
    for cell, value in zip(cells, first_row):
        cell.text = value
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    # Carbone's next-index row closes and removes the repeated row block.
    end = result.add_row().cells
    end[0].text = marker
    for cell in end[1:]:
        cell.text = ""
    for row in result.rows:
        for cell in row.cells:
            for para in cell.paragraphs:
                para.paragraph_format.space_after = Pt(2)
                for run in para.runs:
                    run.font.size = Pt(8)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


doc.add_paragraph("Booking confirmation", style="Title")
doc.add_paragraph("{d.bookingConfirmation.provisional:ifEQ(true):show('Provisional—not confirmed'):elseShow('')}")
label_value("Booking reference", "{d.bookingConfirmation.bookingReference}")
label_value("Direction", "{d.bookingConfirmation.direction}")
label_value("Customer", "{d.customer.name}")
label_value("Customer reference", "{d.bookingConfirmation.customerReference}")
label_value("Prepared by", "{d.bookingConfirmation.preparedBy}")
doc.add_paragraph("This document records only the transport services shown below and the information available when this version was prepared.")

doc.add_paragraph("{d.bookingConfirmation.shipper.name:ifNEM():showBegin}")
heading("Shipper")
label_value("Name", "{d.bookingConfirmation.shipper.name}")
label_value("Address", "{d.bookingConfirmation.shipper.address}")
doc.add_paragraph("{d.bookingConfirmation.shipper.name:showEnd}")

doc.add_paragraph("{d.bookingConfirmation.consignee.name:ifNEM():showBegin}")
heading("Consignee")
label_value("Name", "{d.bookingConfirmation.consignee.name}")
label_value("Address", "{d.bookingConfirmation.consignee.address}")
doc.add_paragraph("{d.bookingConfirmation.consignee.name:showEnd}")

doc.add_paragraph("{d.bookingConfirmation.scope.collection:ifEQ(true):showBegin}")
heading("Collection")
label_value("Collection address", "{d.bookingConfirmation.collection.address}")
label_value("Planned collection", "{d.bookingConfirmation.collection.plannedAtLabel}")
label_value("Collection remarks", "{d.bookingConfirmation.collection.remarks}")
doc.add_paragraph("{d.bookingConfirmation.scope.collection:showEnd}")

doc.add_paragraph("{d.bookingConfirmation.scope.mainTransport:ifEQ(true):showBegin}")
heading("Main transport")
table(
    ["Mode", "From", "To", "Planned departure (UTC)", "Planned arrival (UTC)"],
    [
        "{d.bookingConfirmation.mainTransport[i].mode}",
        "{d.bookingConfirmation.mainTransport[i].origin}",
        "{d.bookingConfirmation.mainTransport[i].destination}",
        "{d.bookingConfirmation.mainTransport[i].plannedDepartureAt:formatD('DD MMM YYYY HH:mm')}",
        "{d.bookingConfirmation.mainTransport[i].plannedArrivalAt:formatD('DD MMM YYYY HH:mm')}",
    ],
    "{d.bookingConfirmation.mainTransport[i+1]}",
)
doc.add_paragraph("{d.bookingConfirmation.scope.mainTransport:showEnd}")

doc.add_paragraph("{d.bookingConfirmation.scope.delivery:ifEQ(true):showBegin}")
heading("Delivery")
label_value("Delivery address", "{d.bookingConfirmation.delivery.address}")
label_value("Planned delivery", "{d.bookingConfirmation.delivery.plannedAtLabel}")
label_value("Delivery remarks", "{d.bookingConfirmation.delivery.remarks}")
doc.add_paragraph("{d.bookingConfirmation.scope.delivery:showEnd}")

heading("Goods")
table(
    ["Description", "Marks and numbers", "Packages", "Type", "Gross weight kg"],
    [
        "{d.bookingConfirmation.cargo[i].description}",
        "{d.bookingConfirmation.cargo[i].marksAndNumbers}",
        "{d.bookingConfirmation.cargo[i].packages}",
        "{d.bookingConfirmation.cargo[i].packageType}",
        "{d.bookingConfirmation.cargo[i].grossWeightKg}",
    ],
    "{d.bookingConfirmation.cargo[i+1]}",
)
label_value("Special instructions", "{d.bookingConfirmation.specialInstructions}")

heading("Customer selling charges")
doc.add_paragraph("{d.bookingConfirmation.priceStatus:ifNE('confirmed'):show('Price to be confirmed'):elseShow('')}")
doc.add_paragraph("{d.bookingConfirmation.priceStatus:ifEQ('confirmed'):showBegin}")
table(
    ["Charge", "Currency", "Selling price"],
    [
        "{d.bookingConfirmation.chargeLines[i].description}",
        "{d.bookingConfirmation.chargeLines[i].currency}",
        "{d.bookingConfirmation.chargeLines[i].sellAmount:formatN(2)}",
    ],
    "{d.bookingConfirmation.chargeLines[i+1]}",
)
table(
    ["Total currency", "Customer total"],
    [
        "{d.bookingConfirmation.chargeTotals[i].currency}",
        "{d.bookingConfirmation.chargeTotals[i].amount:formatN(2)}",
    ],
    "{d.bookingConfirmation.chargeTotals[i+1]}",
)
doc.add_paragraph("{d.bookingConfirmation.priceStatus:showEnd}")

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
footer.add_run("Booking confirmation · {d.bookingConfirmation.bookingReference}")
doc.save(DESTINATION)
print(DESTINATION)
