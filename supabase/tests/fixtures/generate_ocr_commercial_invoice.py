"""Synthetic, tabular invoice for the approved JE0991148 OCR review test."""
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4

target = Path(__file__).resolve().parents[3] / "output/pdf/internal-test-ocr-commercial-invoice.pdf"
target.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles['Normal'].fontSize = 10
story = [Paragraph('COMMERCIAL INVOICE', styles['Title']),
         Paragraph('SYNTHETIC INTERNAL TEST - NOT FOR PAYMENT OR CUSTOMS SUBMISSION', styles['Normal']),
         Spacer(1, 18)]
for line in [
    'Invoice number: QA-OCR-20260922-B | Invoice date: 22 September 2026',
    'Seller / shipper: Demo Organisation 009, Bristol, United Kingdom (GB)',
    'Buyer / consignee: Demo Organisation 035, Karachi, Pakistan (PK)',
    'Booking: JE0991148 | Currency: GBP | Incoterms: FCA Felixstowe',
]:
    story.extend([Paragraph(line, styles['Normal']), Spacer(1, 8)])
rows = [['Item', 'Description', 'Quantity', 'Unit price GBP', 'Line total GBP'],
        ['1', 'Steel brackets', '10', '60.00', '600.00'],
        ['2', 'Rubber seals', '20', '20.00', '400.00']]
table = Table(rows, colWidths=[32, 166, 65, 112, 112])
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E8F1EF')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 10),
    ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
    ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#98AEAA')),
]))
story.extend([Spacer(1, 14), table, Spacer(1, 18)])
for line in [
    'Invoice total: GBP 1,000.00. Freight, tax and discounts: none.',
    'Item 1: 2 cartons; gross weight 55 kg; net weight 50 kg; country of origin GB.',
    'Item 2: 8 cartons; gross weight 45 kg; net weight 40 kg; country of origin GB.',
    'Shipment totals: 10 cartons; gross weight 100 kg; net weight 90 kg.',
    'Commodity codes are not supplied. Customs classification requires operator review.',
    'All names, goods and amounts are synthetic test data. No real shipment or payment.',
]:
    story.extend([Paragraph(line, styles['Normal']), Spacer(1, 10)])
SimpleDocTemplate(str(target), pagesize=A4, rightMargin=45, leftMargin=45, topMargin=40, bottomMargin=40).build(story)
print(target)
