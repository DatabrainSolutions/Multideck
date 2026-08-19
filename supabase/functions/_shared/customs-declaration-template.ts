export type CustomsDocumentDirection = "import" | "export";

function importItem(path: string) {
  return `<table class="goods"><tr><td style="width:50%"><span class="label">[31] Packages - number [6/10], kind [6/9] and shipping marks [6/11]</span><span class="value">{${path}.packages}</span></td><td><span class="label">[31] Description of goods [6/8]</span><span class="value">{${path}.description}</span></td></tr></table>
  <table class="commodity-row"><tr><td style="width:16%"><span class="label">[33] Commodity [6/14]</span><span class="value-inline"> {${path}.commodity}</span></td><td style="width:7%"><span class="label">TARIC [6/15]</span><span class="value-inline"> {${path}.taric}</span></td><td style="width:14%"><span class="label">EU add. code(s) [6/16]</span><span class="value-inline"> {${path}.euCodes}</span></td><td style="width:14%"><span class="label">National add. code(s) [6/17]</span><span class="value-inline"> {${path}.nationalCodes}</span></td><td style="width:7%"><span class="label">UNDG [6/12]</span><span class="value-inline"> {${path}.dangerousGoods}</span></td><td style="width:7%"><span class="label">CUS [6/13]</span><span class="value-inline"> {${path}.cusCode}</span></td><td><span class="label">[15a] Dispatch [5/14]</span><span class="value-inline"> {${path}.dispatchCountry}</span></td><td><span class="label">[17a] Destination [5/8]</span><span class="value-inline"> {${path}.destinationCountry}</span></td></tr></table>
  <table class="procedure-row"><tr><td style="width:12%"><span class="label">[37] Procedure [1/10]</span><span class="value-inline"> {${path}.procedure}</span></td><td style="width:13%"><span class="label">Add. procedure code(s) [1/11]</span><span class="value-inline"> {${path}.additionalProcedures}</span></td><td style="width:25%"><span class="label">[40] Previous documents [2/1]</span><span class="value-inline"> {${path}.previousDocuments}</span></td><td><span class="label">[34a] Origin [5/15]</span><span class="value-inline"> {${path}.originCountry}</span></td><td><span class="label">[34b] Pref. origin [5/16]</span><span class="value-inline"> {${path}.preferentialOrigin}</span></td><td><span class="label">[36] Preference [4/17]</span><span class="value-inline"> {${path}.preference}</span></td></tr></table>
  <table class="measure-row"><tr><td><span class="label">[35] Gross mass [6/5]</span><span class="value-inline"> {${path}.grossMass}</span></td><td><span class="label">[38] Net mass [6/1]</span><span class="value-inline"> {${path}.netMass}</span></td><td><span class="label">[41] Suppl. Units [6/2]</span><span class="value-inline"> {${path}.supplementaryUnits}</span></td><td><span class="label">[46] Statistical value [8/6]</span><span class="value-inline"> {${path}.statisticalValue}</span></td></tr></table>
  <table class="value-row"><tr><td><span class="label">[42] Item price [4/14]</span><span class="value-inline"> {${path}.itemPrice}</span></td><td><span class="label">[43] Valn. Method [4/16]</span><span class="value-inline"> {${path}.valuationMethod}</span></td><td><span class="label">[24] Nature of transaction [8/5]</span><span class="value-inline"> {${path}.transactionNature}</span></td></tr></table>
  <table class="lists"><tr><td><span class="label">[44] Documents, certificates and authorisations [2/3]</span><span class="value">{${path}.documents}</span></td><td><span class="label">[44] Additional information [2/2]</span><span class="value">{${path}.additionalInformation}</span></td></tr></table>
  <table class="lists"><tr><td><span class="label">[47] Calculation of taxes [4/3]</span><span class="value">{${path}.taxes}</span></td><td><span class="label">[45] Additions and deductions [4/9]</span><span class="value">{${path}.adjustments}</span></td></tr></table>`;
}

function exportItem(path: string) {
  return `<table class="goods"><tr><td style="width:50%"><span class="label">[31] Number and kind of packages, pieces, marks and numbers of packages [6/10][6/9][6/11]</span><span class="value">{${path}.packages}</span></td><td style="width:25%"><span class="label">[31] Description of goods [6/8]</span><span class="value">{${path}.description}</span></td><td><span class="label">CUS code [6/13]</span><span class="value">{${path}.cusCode}</span></td></tr></table>
  <table class="commodity-row"><tr><td style="width:30%"><span class="label">[33] Commodity code [6/14]</span><span class="value-inline"> {${path}.commodity}</span></td><td><span class="label">EU add. code(s) [6/16]</span><span class="value-inline"> {${path}.euCodes}</span></td><td><span class="label">National add. code(s) [6/17]</span><span class="value-inline"> {${path}.nationalCodes}</span></td><td><span class="label">UNDG [6/12]</span><span class="value-inline"> {${path}.dangerousGoods}</span></td></tr></table>
  <table class="procedure-row"><tr><td style="width:12%"><span class="label">[37] Procedure [1/10]</span><span class="value-inline"> {${path}.procedure}</span></td><td style="width:18%"><span class="label">Add. procedure code(s) [1/11]</span><span class="value-inline"> {${path}.additionalProcedures}</span></td><td><span class="label">[7] Unique consignment reference number [2/4]</span><span class="value-inline"> {${path}.reference}</span></td></tr></table>
  <table class="measure-row"><tr><td style="width:50%"><span class="label">[40] Summary declaration/Previous document [2/1]</span><span class="value">{${path}.previousDocuments}</span></td><td><span class="label">[15a] C. Exp. [5/14]</span><span class="value-inline"> {${path}.dispatchCountry}</span></td><td><span class="label">[17a] C. Dest. [5/8]</span><span class="value-inline"> {${path}.destinationCountry}</span></td><td><span class="label">Origin [5/15]</span><span class="value-inline"> {${path}.originCountry}</span></td><td><span class="label">Pref. origin [5/16]</span><span class="value-inline"> {${path}.preferentialOrigin}</span></td></tr></table>
  <table class="value-row"><tr><td><span class="label">[35] Gross mass (kg) [6/5]</span><span class="value-inline"> {${path}.grossMass}</span></td><td><span class="label">[38] Net mass (kg) [6/1]</span><span class="value-inline"> {${path}.netMass}</span></td><td><span class="label">[41] Suppl. Units [6/2]</span><span class="value-inline"> {${path}.supplementaryUnits}</span></td><td><span class="label">[46] Statistical value [8/6]</span><span class="value-inline"> {${path}.statisticalValue}</span></td><td><span class="label">[S29] Transport charges method of payment code [4/2]</span><span class="value-inline"> {${path}.freightPaymentMethod}</span></td><td><span class="label">[24] Declaration type [8/5]</span><span class="value-inline"> {${path}.transactionNature}</span></td></tr></table>
  <table class="lists"><tr><td><span class="label">[44] Produced documents / certificates [2/3]</span><span class="value">{${path}.documents}</span></td></tr></table>
  <table class="lists"><tr><td><span class="label">[44] Special mentions [2/2]</span><span class="value">{${path}.additionalInformation}</span></td></tr></table>`;
}

function eadItem(path: string) {
  return `<table class="ead-item">
    <tr><td class="item-no"><span class="ead-label">32 Item No</span><span class="ead-value">{${path}.number}</span></td><td colspan="5"><span class="ead-label">Number and kind of packages, pieces, marks and numbers of packages (31/1)</span><span class="ead-value">{${path}.packages}</span></td><td colspan="4"><span class="ead-label">Description of goods (31/2)</span><span class="ead-value">{${path}.description}</span></td></tr>
    <tr><td colspan="6"><span class="ead-label">Consignor/Exporter (2)</span><span class="ead-value">{d.parties.exporter}</span></td><td colspan="4"><span class="ead-label">Consignee (8)</span><span class="ead-value">{d.parties.primaryTwo}</span></td></tr>
    <tr><td colspan="6"><span class="ead-label">Identity of means of transport at departure (18)</span><span class="ead-value">{d.movementTransport}</span></td><td colspan="4"><span class="ead-label">Commodity Code (33)</span><span class="ead-value">{${path}.commodity}</span></td></tr>
    <tr><td colspan="6"><span class="ead-label">Unique consignment reference number (7)</span><span class="ead-value">{${path}.reference}</span></td><td colspan="4"><span class="ead-label">Summary declaration/Previous document (40)</span><span class="ead-value">{${path}.previousDocuments}</span></td></tr>
    <tr><td colspan="6"><span class="ead-label">Produced documents / certificates (44/1)</span><span class="ead-value">{${path}.documents}</span></td><td colspan="2"><span class="ead-label">Container numbers (31/3)</span><span class="ead-value">{d.containerNumbers}</span></td><td colspan="2"><span class="ead-label">Seal Number (S28)</span><span class="ead-value">{d.auxiliary}</span></td></tr>
    <tr><td colspan="6"><span class="ead-label">Special mentions (44/2)</span><span class="ead-value">{${path}.additionalInformation}</span></td><td><span class="ead-label">Procedure (37)</span><span class="ead-value">{${path}.procedure}</span></td><td><span class="ead-label">C. Exp. (15a)</span><span class="ead-value">{${path}.dispatchCountry}</span></td><td><span class="ead-label">C. Dest. (17a)</span><span class="ead-value">{${path}.destinationCountry}</span></td><td><span class="ead-label">Gross mass (kg) (35)</span><span class="ead-value">{${path}.grossMass}</span></td></tr>
    <tr><td colspan="2"><span class="ead-label">UNDG (44/4)</span><span class="ead-value">{${path}.dangerousGoods}</span></td><td colspan="2"><span class="ead-label">Transport charges method of payment code (S29)</span><span class="ead-value">{${path}.freightPaymentMethod}</span></td><td colspan="2"><span class="ead-label">Declaration type (1)</span><span class="ead-value">{d.declarationCode}</span></td><td colspan="2"><span class="ead-label">Statistical value (46)</span><span class="ead-value">{${path}.statisticalValue}</span></td><td colspan="2"><span class="ead-label">Net mass (kg) (38)</span><span class="ead-value">{${path}.netMass}</span></td></tr>
  </table>`;
}

function exportAccompanyingDocumentTemplate() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@page { size: A4 portrait; margin: 5.5mm 6mm 5mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #000; background: #fff; font-family: "Arial Narrow", Arial, sans-serif; }
body { font-size: 7pt; line-height: 1.08; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td { border: .65pt solid #000; padding: 1.2pt 1.8pt; vertical-align: top; font-weight: 400; overflow-wrap: anywhere; word-break: break-word; }
.ead-page { position: relative; width: 100%; min-height: 286mm; break-after: page; page-break-after: always; }
.ead-page:last-of-type { break-after: auto; page-break-after: auto; }
.ead-label { display: block; font-size: 6.3pt; line-height: 1.04; }
.ead-value { display: block; margin-top: 1pt; font-size: 7pt; line-height: 1.08; white-space: pre-line; }
.ead-top { display: grid; grid-template-columns: 11mm minmax(0, 1fr); }
.ead-vertical-title { border: .8pt solid #000; border-right: 0; display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl; font-size: 10pt; font-weight: 700; letter-spacing: .25pt; }
.ead-header td { height: 14mm; }
.ead-heading { font-size: 10pt; font-weight: 700; vertical-align: middle; }
.ead-barcode-cell { padding: 1.5pt 3pt; vertical-align: middle; }
.ead-barcode { display: block; width: 100%; height: 9mm; }
.ead-mrn { font-size: 8pt; font-weight: 700; white-space: nowrap; vertical-align: middle; }
.ead-mrn strong { font-size: 10pt; letter-spacing: .45pt; }
.ead-meta td { height: 9mm; }
.ead-party td { height: 21mm; }
.ead-transport td { height: 12mm; }
.ead-movement td { height: 10mm; }
.ead-office td { height: 13mm; }
.ead-declaration-goods td { height: 24mm; }
.ead-item td { height: 8.5mm; }
.ead-item tr:first-child td { height: 15mm; }
.ead-item .item-no { width: 10%; }
.ead-controls { position: absolute; left: 0; right: 0; bottom: 8mm; }
.ead-controls td { height: 28mm; }
.ead-page-number { position: absolute; right: 0; bottom: 3mm; font-size: 7pt; }
.eloi-head td { height: 15mm; vertical-align: middle; }
.eloi-title { width: 46%; font-size: 11pt; font-weight: 700; }
.eloi-mrn { width: 37%; font-size: 8pt; white-space: nowrap; }
.eloi-page-number { text-align: right; white-space: nowrap; }
.eloi-item { margin-top: 4mm; }
</style></head><body>
<carbone-pdf-options paper-size="A4" margin-top="0" margin-bottom="0" margin-left="0" margin-right="0" print-background="true" prefer-css-page-size="true" generate-tagged-pdf="true" />
<main class="ead-page">
  <div class="ead-top">
    <div class="ead-vertical-title">EXPORT ACCOMPANYING DOCUMENT</div>
    <div>
      <table class="ead-header"><tr><td class="ead-heading" style="width:26%">EUROPEAN COMMUNITY</td><td class="ead-barcode-cell" style="width:32%"><svg class="ead-barcode" viewBox="0 0 {d.mrnBarcodeWidth} {d.mrnBarcodeHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Code 128 B barcode containing MRN {d.mrn}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="{d.mrnBarcodePath}" fill="#000"/></svg></td><td style="width:16%"><span class="ead-label">DECLARATION TYPE (1)</span><span class="ead-value">{d.declarationCode}</span></td><td class="ead-mrn"><span class="ead-label">MRN</span><strong>{d.mrn}</strong></td></tr></table>
      <table class="ead-meta"><tr><td><span class="ead-label">Forms (3)</span><span class="ead-value">001</span></td><td><span class="ead-label">Items (5)</span><span class="ead-value">{d.itemCount}</span></td><td><span class="ead-label">Total packages (6)</span><span class="ead-value">{d.totalPackages}</span></td><td><span class="ead-label">Sec. Decl. (S00)</span><span class="ead-value">{d.securityIndicator}</span></td><td><span class="ead-label">Other SCI (S32)</span><span class="ead-value">{d.otherSpecificCircumstance}</span></td><td><span class="ead-label">Issuing date</span><span class="ead-value">{d.issuingDate}</span></td><td><span class="ead-label">Customs office</span><span class="ead-value">{d.customsOffice}</span></td></tr></table>
      <table class="ead-party"><tr><td style="width:42%"><span class="ead-label">Consignor/Exporter (2)</span><span class="ead-value">{d.parties.exporter}</span></td><td style="width:12%"><span class="ead-label">No</span><span class="ead-value">{d.parties.exporterId}</span></td><td><span class="ead-label">Reference numbers (7) - LRN and/or UCR</span><span class="ead-value">{d.lrn}\n{d.ucr}</span></td></tr><tr><td><span class="ead-label">Consignee (8)</span><span class="ead-value">{d.parties.primaryTwo}</span></td><td><span class="ead-label">No</span><span class="ead-value">{d.parties.primaryTwoId}</span></td><td><span class="ead-label">Countr(ies) of routing codes (S13)</span><span class="ead-value">{d.commercialTerm}</span></td></tr><tr><td><span class="ead-label">Declarant/Representative (14)</span><span class="ead-value">{d.parties.declarant}\n{d.parties.representative}</span></td><td><span class="ead-label">No</span><span class="ead-value">{d.parties.declarantId}\n{d.parties.representativeId}</span></td><td><span class="ead-label">Representative of person lodging summary declaration (14b)</span></td></tr></table>
      <table class="ead-transport"><tr><td style="width:54%"><span class="ead-label">Transport charges method of payment code (S29)</span><span class="ead-value">{d.items[0].freightPaymentMethod}</span></td><td><span class="ead-label">C. disp./exp. Code (15)</span><span class="ead-value">{d.dispatchCountry}</span></td><td><span class="ead-label">Country destination Code (17)</span><span class="ead-value">{d.destinationCountry}</span></td></tr></table>
      <table class="ead-movement"><tr><td style="width:72%"><span class="ead-label">Identity of means of transport at departure (18)</span><span class="ead-value">{d.movementTransport}</span></td><td><span class="ead-label">Gross mass (kg) (35)</span><span class="ead-value">{d.totalGrossMass}</span></td></tr><tr><td><span class="ead-label">Mode of transport at the border (25)</span><span class="ead-value">{d.borderMode}</span></td><td rowspan="2"><span class="ead-label">Seal Number (S28)</span><span class="ead-value">{d.auxiliary}</span></td></tr><tr><td><span class="ead-label">Location of goods (30)</span><span class="ead-value">{d.goodsLocation}</span></td></tr></table>
      <table class="ead-office"><tr><td><span class="ead-label">Office of exit (29)</span><span class="ead-value">{d.exitOffice}</span></td><td><span class="ead-label">Marks and numbers - Container No(s) - Number and kind (31)</span><span class="ead-value">{d.containerNumbers}</span></td></tr></table>
      <table class="ead-declaration-goods"><tr><td><span class="ead-label">Packages and description of goods (31)</span><span class="ead-value">{d.items[0].packages}\n{d.items[0].description}</span></td></tr></table>
    </div>
  </div>
  ${eadItem("d.items[0]")}
  <table class="ead-controls"><tr><td><span class="ead-label">CONTROL BY OFFICE OF DISPATCH/EXPORT (E)</span><span class="ead-value">Result:\n\nSeals affixed: Number:                 identity:\n\nTime limit (date):</span></td><td><span class="ead-label">CONTROL BY OFFICE OF EXIT (K)</span><span class="ead-value">Date of arrival:\n\nExamination of seals:\n\nRemarks:</span></td></tr></table>
  <div class="ead-page-number">Page 1 of {d.totalPages}</div>
</main>
<section class="ead-page">
  <table class="eloi-head"><tr><td class="eloi-title">EXPORT LIST OF ITEMS</td><td class="eloi-mrn">MRN: {d.mrn}</td><td class="eloi-page-number">Page {d.itemListPages[i].documentPageNumber} of {d.totalPages}</td></tr></table>
  <div class="eloi-item">${eadItem("d.itemListPages[i]")}</div>
</section><div class="item-end">{d.itemListPages[i+1]}</div>
</body></html>`;
}

/**
 * A4 Carbone HTML source modelled on HMRC's prescribed EAD/ELoI boxes and the
 * accepted CDS declaration copies supplied by Jenkar. It stays unbranded and
 * vector/text based so printed copies remain sharp and auditable.
 */
export function customsDeclarationTemplate(
  direction: CustomsDocumentDirection,
) {
  if (direction === "export") return exportAccompanyingDocumentTemplate();
  const isImport = direction === "import";
  const partyOneRight = isImport ? "Seller" : "Consignor";
  const partyTwoLeft = isImport ? "Importer" : "Consignee";
  const partyTwoRight = isImport ? "Buyer" : "Carrier";
  const movementLabel = isImport
    ? "Arrival transport"
    : "Identity of means of transport at departure";
  const movementElement = isImport ? "7/9" : "7/7";
  const commercialLabel = isImport
    ? "Delivery terms"
    : "Countr(ies) of routing codes";
  const commercialElement = isImport ? "4/1" : "5/18";
  const countryLabel = isImport
    ? "Border transport nationality"
    : "Border transport";
  const countryElement = isImport ? "7/15" : "7/14";
  const previousLabel = isImport
    ? "Summary declaration/Previous documents"
    : "Summary declaration/Previous document";
  const auxiliaryLabel = isImport ? "Additions and deductions" : "Seal Number";
  const auxiliaryElement = isImport ? "4/9" : "S28";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@page { size: A4 portrait; margin: 6.9mm 6mm 5mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #000; background: #fff; font-family: Arial Narrow, Arial, sans-serif; }
body { font-size: 6pt; line-height: 1.08; }
.page { width: 100%; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td, th { border: .6pt solid #000; padding: 1.2pt 1.6pt; vertical-align: top; font-weight: 400; }
.label { font-size: 5.5pt; line-height: 1.05; }
.value { display: block; margin-top: 1.2pt; font-size: 7.1pt; line-height: 1.12; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; }
.value-inline { font-size: 7.1pt; }
.head { height: 30pt; }
.box-six { width: 24pt; text-align: center; font-size: 14pt; padding-top: 6pt; }
.title { width: ${
    isImport ? "130pt" : "128pt"
  }; padding: 6pt 2pt 0 7pt; font-size: ${
    isImport ? "13pt" : "7.2pt"
  }; font-weight: 700; white-space: nowrap; }
.barcode-cell { width: 158pt; padding: 1.5pt 4pt; text-align: center; vertical-align: middle; }
.barcode { display: block; width: 150pt; height: 24pt; object-fit: fill; }
.declaration { width: 94pt; padding-top: 5pt; white-space: nowrap; }
.mrn { padding: 4pt 2pt 0 5pt; white-space: nowrap; }
.mrn b { font-size: 7pt; }
.mrn span { font-size: 9.6pt; letter-spacing: .7pt; font-weight: 700; }
.summary td, .ead-meta td { height: 13pt; }
.party-primary td { height: 54pt; }
.party-secondary td { height: 46pt; }
.party td:nth-child(odd) { width: 38%; }
.party td:nth-child(even) { width: 12%; }
.dense td { height: 11pt; }
.three-way td { height: 34pt; }
.authorisations td { height: 22pt; }
.item-number td { height: 14pt; font-size: 7pt; }
.item { break-inside: avoid-page; page-break-inside: avoid; margin-top: 0; }
.item .goods td { min-height: 22pt; height: 22pt; }
.import .item .commodity-row td { height: 28pt; }
.import .item .procedure-row td { height: 24pt; }
.import .item .measure-row td, .import .item .value-row td { height: 18pt; }
.import .item .lists td { min-height: 52pt; height: 52pt; }
.export .item .goods td { min-height: 30pt; height: 30pt; }
.export .item .commodity-row td { height: 18pt; }
.export .item .procedure-row td { height: 16pt; }
.export .item .measure-row td { height: 18pt; }
.export .item .value-row td { height: 18pt; }
.export .item .lists td { min-height: 24pt; height: 24pt; }
.item-end { display: none; }
.audit-spacer { height: 0; }
.audit-block, .audit, .signature, .signature tr, .signature td { break-inside: avoid-page; page-break-inside: avoid; }
.audit td { height: 11pt; }
.audit .status-cell { height: 46pt; }
.signature td { height: 56pt; }
.page-break { break-before: page; page-break-before: always; }
.page-number { text-align: right; font-size: 6pt; padding: 2pt 0 3pt; }
.loi-head td { height: 27pt; vertical-align: middle; }
.loi-title { width: 48%; font-size: 11pt; font-weight: 700; }
.loi-mrn { width: 34%; font-size: 8pt; white-space: nowrap; }
.loi-page { text-align: right; font-size: 7pt; white-space: nowrap; }
.exchange-note { padding-top: 7mm; text-align: center; font-size: 8pt; }
.exchange { margin: 3pt 0 0 0; width: 185pt; font-size: 6pt; text-align: center; }
.exchange td { height: 12pt; }
</style></head><body class="${isImport ? "import" : "export"}">
<carbone-pdf-options paper-size="A4" margin-top="0" margin-bottom="0" margin-left="0" margin-right="0" print-background="true" prefer-css-page-size="true" generate-tagged-pdf="true" />
<main class="page">
  <table><tr class="head">
    <td class="box-six">6</td><td class="title">${
    isImport ? "CDS Import" : "EXPORT ACCOMPANYING DOCUMENT"
  }</td>
    ${
    isImport
      ? ""
      : `<td class="barcode-cell"><svg class="barcode" viewBox="0 0 {d.mrnBarcodeWidth} {d.mrnBarcodeHeight}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Code 128 B barcode containing MRN {d.mrn}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="{d.mrnBarcodePath}" fill="#000"/></svg></td>`
  }
    <td class="declaration"><span class="label">[1] Declaration [1/1] | [1/2]</span> <span class="value-inline">{d.declarationCode}</span></td>
    <td class="mrn"><b>MRN:</b> <span>{d.mrn}</span></td>
  </tr></table>
  <table class="summary"><tr>
    <td><span class="label">[3] Forms [1/4]</span><span class="value-inline"> {d.formNumber} {d.formCount}</span></td>
    <td><span class="label">[5] Items [1/9]</span><span class="value-inline"> {d.itemCount}</span></td>
    <td><span class="label">[6] Total packages [6/18]</span><span class="value-inline"> {d.totalPackages}</span></td>
    <td><span class="label">[7] Reference [2/4]</span><span class="value-inline"> {d.reference}</span></td>
  </tr></table>
  ${
    isImport
      ? ""
      : `<table class="ead-meta"><tr><td><span class="label">Sec. Decl. (S00)</span><span class="value-inline"> {d.securityIndicator}</span></td><td><span class="label">Other SCI (S32)</span><span class="value-inline"> {d.otherSpecificCircumstance}</span></td><td><span class="label">Issuing date</span><span class="value-inline"> {d.issuingDate}</span></td><td><span class="label">Customs office</span><span class="value-inline"> {d.customsOffice}</span></td><td><span class="label">Reference numbers (7) - LRN / UCR</span><span class="value-inline"> {d.lrn} / {d.ucr}</span></td></tr></table>`
  }
  <table class="party party-primary"><tr><td><span class="label">[2] Exporter [3/1]</span><span class="value">{d.parties.exporter}</span></td><td><span class="label">No [3/2]</span><span class="value">{d.parties.exporterId}</span></td><td><span class="label">[2] ${partyOneRight} [3/24]</span><span class="value">{d.parties.secondaryOne}</span></td><td><span class="label">No [3/25]</span><span class="value">{d.parties.secondaryOneId}</span></td></tr></table>
  <table class="party party-secondary"><tr><td><span class="label">[8] ${partyTwoLeft} [3/${
    isImport ? "15" : "9"
  }]</span><span class="value">{d.parties.primaryTwo}</span></td><td><span class="label">No [3/${
    isImport ? "16" : "10"
  }]</span><span class="value">{d.parties.primaryTwoId}</span></td><td><span class="label">[8] ${partyTwoRight} [3/${
    isImport ? "26" : "31"
  }]</span><span class="value">{d.parties.secondaryTwo}</span></td><td><span class="label">No [3/${
    isImport ? "27" : "32"
  }]</span><span class="value">{d.parties.secondaryTwoId}</span></td></tr></table>
  <table class="party party-secondary"><tr><td><span class="label">[14] Declarant [3/17]</span><span class="value">{d.parties.declarant}</span></td><td><span class="label">No [3/18]</span><span class="value">{d.parties.declarantId}</span></td><td><span class="label">[14] Representative [3/19]</span><span class="value">{d.parties.representative}</span></td><td><span class="label">No [3/20]</span><span class="value">{d.parties.representativeId}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[15a] Dispatch country [5/14]</span><span class="value-inline"> {d.dispatchCountry}</span></td><td><span class="label">[17a] Destination country [5/8]</span><span class="value-inline"> {d.destinationCountry}</span></td><td><span class="label">[14] Representative status [3/21]</span><span class="value-inline"> {d.representationType}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[18] ${movementLabel} [${movementElement}]</span><span class="value-inline"> {d.movementTransport}</span></td><td><span class="label">${commercialLabel} [${commercialElement}]</span><span class="value-inline"> {d.commercialTerm}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[21] ${countryLabel} [${countryElement}]</span><span class="value-inline"> {d.borderTransport}</span></td><td><span class="label">[19] Ctr [7/2]</span><span class="value-inline"> {d.containerised}</span></td><td><span class="label">[22] Invoice total [4/10][4/11]</span><span class="value-inline"> {d.invoiceTotal}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[25] Mode of transport at the border [7/4]</span><span class="value-inline"> {d.borderMode}</span></td><td><span class="label">[26] Inland transport mode [7/5]</span><span class="value-inline"> {d.inlandMode}</span></td><td><span class="label">[23] Exchange rate [4/15]</span><span class="value-inline"> {d.exchangeRate}</span></td><td><span class="label">[24] Nature of transaction [8/5]</span><span class="value-inline"> {d.transactionNature}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[30] Location of goods [5/23]</span><span class="value-inline"> {d.goodsLocation}</span></td><td><span class="label">[35] Gross mass (kg) [6/5]</span><span class="value-inline"> {d.totalGrossMass}</span></td></tr></table>
  <table class="three-way"><tr><td><span class="label">[31] Container numbers [7/10]</span><span class="value">{d.containerNumbers}</span></td><td><span class="label">[40] ${previousLabel} [2/1]</span><span class="value">{d.previousDocuments}</span></td><td><span class="label">[${
    isImport ? "45" : "S28"
  }] ${auxiliaryLabel} [${auxiliaryElement}]</span><span class="value">{d.auxiliary}</span></td></tr></table>
  <table class="authorisations"><tr><td><span class="label">[44] Authorisation Holders [3/39]</span><span class="value-inline"> {d.authorisations}</span></td><td><span class="label">[44] Additional Fiscal Reference [3/40]</span><span class="value-inline"> {d.fiscalReferences}</span></td><td><span class="label">[44] Additional Supply Chain Actors [3/37]</span><span class="value-inline"> {d.supplyChainActors}</span></td></tr></table>
  {d.headerAdditionalInformation:ifEM:hideBegin}<table class="dense"><tr><td><span class="label">[44] Additional information [2/2]</span><span class="value-inline"> {d.headerAdditionalInformation}</span></td></tr></table>{d.headerAdditionalInformation:ifEM:hideEnd}

  <section class="item">
    <table class="item-number"><tr><td><b>[32] Item No [1/6]</b> <span class="value-inline">{d.items[${
    isImport ? "i" : "0"
  }].number}</span></td></tr></table>
    ${isImport ? importItem("d.items[i]") : exportItem("d.items[0]")}
  </section>${isImport ? `<div class="item-end">{d.items[i+1]}</div>` : ""}

  <div class="audit-spacer" style="height:{d.auditSpacerHeight}pt"></div>
  <section class="audit-block"><table class="audit"><tr><td class="status-cell"><span class="label">Acceptance date/time</span><span class="value">{d.status.acceptedAt}</span><span class="label">Declaration status</span><span class="value">{d.status.label}</span><span class="label">Status date/time</span><span class="value">{d.status.updatedAt}</span></td><td class="status-cell"><span class="label">${
    isImport ? "Tax summary" : "Departure date/time"
  }</span><span class="value">{d.status.summary}</span></td></tr></table>
  <table class="audit"><tr><td><span class="label">${
    isImport ? "" : "[29] Office of exit [5/12]"
  }</span><span class="value-inline">${
    isImport ? "" : "{d.exitOffice}"
  }</span></td><td><span class="label">LRN [2/5]</span><span class="value-inline"> {d.lrn}</span></td></tr></table>
  <table class="audit"><tr><td><span class="label">[44] Office of presentation [5/26]</span><span class="value-inline"> {d.presentationOffice}</span></td><td><span class="label">[44] Supervising office [5/27]</span><span class="value-inline"> {d.supervisingOffice}</span></td><td><span class="label">${
    isImport
      ? "[48] Deferred payment [2/6]"
      : "Other specific circumstance indicator (S32)"
  }</span><span class="value-inline"> ${
    isImport ? "{d.deferredOrCircumstance}" : "{d.otherSpecificCircumstance}"
  }</span></td></tr></table>
  <table class="signature"><tr><td><span class="label">[52] Guarantee Type [8/2] | Reference [8/3] | Amount | Office</span><span class="value">{d.guarantee}</span></td><td><span class="label">[49] Identification of warehouse [2/7]</span><span class="value-inline"> {d.warehouse}</span><br><span class="label">[54] Place and date</span><span class="value">{d.status.placeAndDate}</span><span class="label">Signature and name of declarant/representative [1/8]</span><span class="value">{d.status.signatory}</span></td></tr></table></section>
  ${isImport ? "" : `<div class="page-number">Page 1 of {d.totalPages}</div>`}
</main>
${
    isImport
      ? `{d.exchangeRate:ifEM:hideBegin}<section class="page page-break"><p class="exchange-note">These exchange rates are only estimates, real exchange rates used by CDS may be different!</p><table class="exchange"><tr><td>Currency</td><td>{d.currency}</td></tr><tr><td>Exchange Rate:<br>(for 1 GBP)</td><td>{d.exchangeRate}</td></tr></table></section>{d.exchangeRate:ifEM:hideEnd}`
      : `<section class="page page-break item-list-page"><table class="loi-head"><tr><td class="loi-title">EXPORT LIST OF ITEMS</td><td class="loi-mrn">MRN: {d.mrn}</td><td class="loi-page">Page {d.items[i,i>0].documentPageNumber} of {d.totalPages}</td></tr></table><section class="item"><table class="item-number"><tr><td><b>[32] Item No</b> <span class="value-inline">{d.items[i].number}</span></td></tr></table>${
        exportItem("d.items[i]")
      }</section></section><div class="item-end">{d.items[i+1,i>0]}</div>`
  }
</body></html>`;
}
