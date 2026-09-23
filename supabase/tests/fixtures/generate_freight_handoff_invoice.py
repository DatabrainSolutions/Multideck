"""Clearly fictional document for the authorised Booking handover test only."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

output = Path('output/pdf/internal-test-je0991147-invoice.pdf')
output.parent.mkdir(parents=True, exist_ok=True)
pdf = canvas.Canvas(str(output), pagesize=A4)
pdf.setTitle('INTERNAL TEST ONLY - JE0991147 commercial invoice')
pdf.setFont('Helvetica-Bold', 17)
pdf.drawString(45, 790, 'INTERNAL TEST ONLY - NOT FOR SUBMISSION')
pdf.setFont('Helvetica', 11)
lines = [
    'Commercial invoice fixture: TEST-JE0991147-20260922',
    'Date: 22 September 2026',
    'Booking: JE0991147 | Source Quote: JQ20029 V2',
    '',
    'Seller / exporter: Demo Organisation 035',
    'Buyer / consignee: Demo Organisation 009',
    'These are existing internal demo accounts, not a real transaction.',
    '',
    'Goods: ANIMAL FAT (copied from the internal test Booking)',
    'Packages: 450 cartons | Gross weight: 15,000 kg',
    'Declared test value: GBP 60,000.00',
    '',
    'Purpose: verify document upload, readiness and internal declaration handover.',
    'No payment is due. This is not a tax invoice or legal commercial document.',
    'No tariff classification, origin or regulatory validity is asserted.',
    'Do not send this fixture to customers, authorities or external providers.',
]
for index, line in enumerate(lines):
    pdf.drawString(45, 752-index*25, line)
pdf.showPage()
pdf.save()
print(output.resolve())
