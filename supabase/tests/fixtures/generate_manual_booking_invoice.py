"""Fictional manual-booking handover fixture. Never submit externally."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

output = Path('output/pdf/internal-test-je0991148-invoice.pdf')
output.parent.mkdir(parents=True, exist_ok=True)
pdf = canvas.Canvas(str(output), pagesize=A4)
pdf.setTitle('INTERNAL TEST ONLY - JE0991148')
pdf.setFont('Helvetica-Bold', 16)
pdf.drawString(40, 790, 'INTERNAL TEST ONLY - NOT FOR SUBMISSION')
pdf.setFont('Helvetica', 11)
lines = [
    'Commercial invoice fixture: TEST-JE0991148-20260922',
    'Date: 22 September 2026 | Manual Booking: JE0991148',
    'Seller / shipper: Demo Organisation 009, Bristol, GB',
    'Buyer / consignee: Demo Organisation 035, Karachi, PK',
    'Billing customer: Demo Organisation 027',
    '',
    'Description: INTERNAL TEST goods - no physical shipment',
    'Quantity: 10 cartons | Unit value: GBP 100 | Total: GBP 1,000',
    'Gross weight: 100 kg | Net weight: 90 kg',
    'Test commodity code: 123456 (placeholder, NOT a classification)',
    'Test route: GBFXT to PKKHI | Test Incoterm: FCA Felixstowe',
    '',
    'No payment is due. This is not a tax invoice or legal commercial document.',
    'Purpose: test internal field mapping, document retention and handover only.',
    'The commodity code and shipment quantities are synthetic test values.',
    'Do not send to customers, authorities or external providers.',
]
for index, line in enumerate(lines):
    pdf.drawString(40, 750 - index * 28, line)
pdf.showPage()
pdf.save()
print(output.resolve())
