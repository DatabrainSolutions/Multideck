export type CustomsDocumentDirection = "import" | "export";

// ISO/IEC 15417 Code 128 symbol patterns, indexed by symbol value. Each digit
// is the width of the next alternating bar/space; stop (106) has seven runs.
const code128Patterns = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

function svgBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  }
  return btoa(binary);
}

/**
 * Builds a self-contained Code 128B SVG. We deliberately generate the bars on
 * the server instead of using Carbone's `:barcode` formatter in an HTML `src`:
 * that formatter replaces an image element and is not a string-producing
 * formatter, so using it as an attribute value can render a broken image.
 */
export function code128BSvg(rawValue: string) {
  const value = rawValue.replace(/\s+/g, "").toUpperCase();
  if (!value || !/^[\x20-\x7e]+$/.test(value)) {
    throw new Error("Code 128B value must contain printable ASCII characters");
  }

  const symbols = [
    104,
    ...Array.from(value, (character) => character.charCodeAt(0) - 32),
  ];
  const checksum = symbols.reduce(
    (total, symbol, index) => total + symbol * (index === 0 ? 1 : index),
    0,
  ) % 103;
  symbols.push(checksum, 106);

  const quietZone = 10;
  const moduleHeight = 40;
  let cursor = quietZone;
  const bars: string[] = [];
  for (const symbol of symbols) {
    const pattern = code128Patterns[symbol];
    if (!pattern) throw new Error(`Unsupported Code 128B symbol ${symbol}`);
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) {
        bars.push(
          `<rect x="${cursor}" y="0" width="${width}" height="${moduleHeight}"/>`,
        );
      }
      cursor += width;
    }
  }
  const totalWidth = cursor + quietZone;
  const escapedTitle = value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${moduleHeight}" width="100%" height="100%" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="MRN ${escapedTitle}"><title>${escapedTitle}</title><desc>Code 128B MRN barcode</desc><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${
      bars.join("")
    }</g></svg>`;
}

export function code128BDataUrl(rawValue: string) {
  return `data:image/svg+xml;base64,${svgBase64(code128BSvg(rawValue))}`;
}

/**
 * A4 Carbone HTML source modelled on the accepted CDS declaration copies used
 * by Jenkar. It stays vector/text based so printed copies remain sharp.
 */
export function customsDeclarationTemplate(
  direction: CustomsDocumentDirection,
) {
  const isImport = direction === "import";
  const partyOneRight = isImport ? "Seller" : "Consignor";
  const partyTwoLeft = isImport ? "Importer" : "Consignee";
  const partyTwoRight = isImport ? "Buyer" : "Carrier";
  const movementLabel = isImport ? "Arrival transport" : "Departure transport";
  const movementElement = isImport ? "7/9" : "7/7";
  const commercialLabel = isImport ? "Delivery terms" : "Countries of routing";
  const commercialElement = isImport ? "4/1" : "5/18";
  const countryLabel = isImport
    ? "Border transport nationality"
    : "Border transport";
  const countryElement = isImport ? "7/15" : "7/14";
  const previousLabel = isImport
    ? "Summary declaration/Previous documents"
    : "Simplified declaration/Previous documents";
  const auxiliaryLabel = isImport ? "Additions and deductions" : "Seals";
  const auxiliaryElement = isImport ? "4/9" : "7/18";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@page { size: A4 portrait; margin: 5.5mm 5.5mm 5mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #000; background: #fff; font-family: "Times New Roman", Times, serif; }
body { font-size: 6pt; line-height: 1.08; }
.page { width: 100%; }
.test-watermark { position: fixed; inset: 43% auto auto 50%; z-index: 20; width: 170mm; transform: translate(-50%, -50%) rotate(-27deg); color: rgba(150, 0, 0, .13); font-family: Arial, sans-serif; font-size: 24pt; font-weight: 700; letter-spacing: 1.5pt; text-align: center; pointer-events: none; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td, th { border: .42pt solid #000; padding: 1.2pt 1.6pt; vertical-align: top; font-weight: 400; }
.label { font-size: 5.5pt; line-height: 1.05; }
.value { display: block; margin-top: 1.2pt; font-size: 7.3pt; font-style: italic; line-height: 1.12; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; }
.value-inline { font-size: 7.3pt; font-style: italic; }
.head { height: 25pt; }
.box-six { width: 24pt; text-align: center; font-size: 14pt; padding-top: 4pt; }
.title { width: 178pt; padding: 5.5pt 0 0 9pt; font-size: 14pt; font-weight: 700; white-space: nowrap; }
.declaration { width: 158pt; padding-top: 5pt; white-space: nowrap; }
.mrn { padding: 4pt 2pt 0 7pt; white-space: nowrap; }
.mrn b { font-size: 8pt; font-style: italic; }
.mrn span { font-family: Arial, sans-serif; font-size: 11.4pt; letter-spacing: 1.25pt; }
.summary td { height: 11pt; }
.party td { height: 47pt; }
.dense td { height: 11pt; }
.three-way td { height: 30pt; }
.item-number td { height: 13pt; font-size: 7pt; }
.item { break-inside: avoid-page; page-break-inside: avoid; margin-top: 0; }
.item .goods td { min-height: 24pt; height: 24pt; }
.item .lists td { min-height: 24pt; height: 24pt; }
.item-end { display: none; }
.audit-spacer { height: 0; }
.audit-block { break-inside: avoid-page; page-break-inside: avoid; }
.audit { break-inside: avoid; page-break-inside: avoid; }
.audit td { height: 11pt; }
.audit .status-cell { height: 46pt; }
.signature, .signature tr, .signature td { break-inside: avoid; page-break-inside: avoid; }
.signature td { height: 56pt; }
.plain-lines { white-space: pre-line; }
.page-break { break-before: page; page-break-before: always; }
.exchange-note { padding-top: 7mm; text-align: center; font-size: 8pt; }
.exchange { margin: 3pt 0 0 0; width: 185pt; font-size: 6pt; text-align: center; }
.exchange td { height: 12pt; }
</style></head><body>
<carbone-pdf-options paper-size="A4" margin-top="0" margin-bottom="0" margin-left="0" margin-right="0" print-background="true" prefer-css-page-size="true" generate-tagged-pdf="true" />
{d.documentMode:ifEQ('verification'):showBegin}<div class="test-watermark">TEST MODE — NOT AN OFFICIAL CUSTOMS DOCUMENT</div>{d.documentMode:showEnd}
<main class="page">
  <table><tr class="head">
    <td class="box-six">6</td><td class="title">CDS ${
    isImport ? "Import" : "Export"
  }</td>
    <td class="declaration"><span class="label">[1] Declaration [1/1] | [1/2]</span> <span class="value-inline">{d.declarationCode}</span></td>
    <td class="mrn"><b>MRN:</b> <span>{d.mrnDisplay}</span></td>
  </tr></table>
  <table class="summary"><tr>
    <td><span class="label">[3] Forms [1/4]</span><span class="value-inline"> {d.formNumber} {d.formCount}</span></td>
    <td><span class="label">[5] Items [1/9]</span><span class="value-inline"> {d.itemCount}</span></td>
    <td><span class="label">[6] Total packages [6/18]</span><span class="value-inline"> {d.totalPackages}</span></td>
    <td><span class="label">[7] Reference [2/4]</span><span class="value-inline"> {d.reference}</span></td>
  </tr></table>
  <table class="party"><tr><td><span class="label">[2] Exporter [3/1]</span><span class="value">{d.parties.exporter}</span></td><td><span class="label">${partyOneRight}</span><span class="value">{d.parties.secondaryOne}</span></td></tr></table>
  <table class="party"><tr><td><span class="label">[8] ${partyTwoLeft} [3/${
    isImport ? "15" : "9"
  }]</span><span class="value">{d.parties.primaryTwo}</span></td><td><span class="label">${partyTwoRight}</span><span class="value">{d.parties.secondaryTwo}</span></td></tr></table>
  <table class="party"><tr><td><span class="label">[14] Declarant [3/17]</span><span class="value">{d.parties.declarant}</span></td><td><span class="label">[14] Representative [3/19]</span><span class="value">{d.parties.representative}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[15a] Dispatch country [5/14]</span><span class="value-inline"> {d.dispatchCountry}</span></td><td><span class="label">[17a] Destination country [5/8]</span><span class="value-inline"> {d.destinationCountry}</span></td><td><span class="label">[14] Representative status [3/21]</span><span class="value-inline"> {d.representationType}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[18] ${movementLabel} [${movementElement}]</span><span class="value-inline"> {d.movementTransport}</span></td><td><span class="label">${commercialLabel} [${commercialElement}]</span><span class="value-inline"> {d.commercialTerm}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[21] ${countryLabel} [${countryElement}]</span><span class="value-inline"> {d.borderTransport}</span></td><td><span class="label">[19] Ctr [7/2]</span><span class="value-inline"> {d.containerised}</span></td><td><span class="label">[22] Invoice total [4/10][4/11]</span><span class="value-inline"> {d.invoiceTotal}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[25] Border transport mode [7/4]</span><span class="value-inline"> {d.borderMode}</span></td><td><span class="label">[26] Inland trp mode [7/5]</span><span class="value-inline"> {d.inlandMode}</span></td><td><span class="label">[23] Exchange rate [4/15]</span><span class="value-inline"> {d.exchangeRate}</span></td><td><span class="label">[24] Nature of transaction [8/5]</span><span class="value-inline"> {d.transactionNature}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[30] Location of goods [5/23]</span><span class="value-inline"> {d.goodsLocation}</span></td><td><span class="label">[35] Gross mass [6/5]</span><span class="value-inline"> {d.totalGrossMass}</span></td></tr></table>
  <table class="three-way"><tr><td><span class="label">[31] Container numbers [7/10]</span><span class="value">{d.containerNumbers}</span></td><td><span class="label">[40] ${previousLabel} [2/1]</span><span class="value">{d.previousDocuments}</span></td><td><span class="label">[${
    isImport ? "45" : "D"
  }] ${auxiliaryLabel} [${auxiliaryElement}]</span><span class="value">{d.auxiliary}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[44] Authorisation Holders [3/39]</span><span class="value-inline"> {d.authorisations}</span></td><td><span class="label">[44] Additional Fiscal Reference [3/40]</span><span class="value-inline"> {d.fiscalReferences}</span></td><td><span class="label">[44] Additional Supply Chain Actors [3/37]</span><span class="value-inline"> {d.supplyChainActors}</span></td></tr></table>
  <table class="dense"><tr><td><span class="label">[44] Additional information [2/2]</span><span class="value-inline"> {d.headerAdditionalInformation}</span></td></tr></table>

  <section class="item">
    <table class="item-number"><tr><td><b>[32] Item No [1/6]</b> <span class="value-inline">{d.items[i].number}</span></td></tr></table>
    <table class="goods"><tr><td><span class="label">[31] Packages - number [6/10], kind [6/9] and shipping marks [6/11]</span><span class="value">{d.items[i].packages}</span></td><td><span class="label">[31] Description of goods [6/8]</span><span class="value">{d.items[i].description}</span></td></tr></table>
    <table class="dense"><tr><td><span class="label">[33] Commodity [6/14]</span><span class="value-inline"> {d.items[i].commodity}</span></td><td><span class="label">EU add. code(s) [6/16]</span><span class="value-inline"> {d.items[i].euCodes}</span></td><td><span class="label">National add. code(s) [6/17]</span><span class="value-inline"> {d.items[i].nationalCodes}</span></td><td><span class="label">UNDG / CUS [6/12][6/13]</span><span class="value-inline"> {d.items[i].dangerousAndCus}</span></td></tr></table>
    <table class="dense"><tr><td><span class="label">[37] Procedure [1/10]</span><span class="value-inline"> {d.items[i].procedure}</span></td><td><span class="label">Add. procedure code(s) [1/11]</span><span class="value-inline"> {d.items[i].additionalProcedures}</span></td><td><span class="label">Dispatch / destination / origin [5/14][5/8][5/15]</span><span class="value-inline"> {d.items[i].countries}</span></td></tr></table>
    <table class="dense"><tr><td><span class="label">[40] Previous documents [2/1]</span><span class="value-inline"> {d.items[i].previousDocuments}</span></td><td><span class="label">[35] Gross mass [6/5]</span><span class="value-inline"> {d.items[i].grossMass}</span></td><td><span class="label">[38] Net mass [6/1]</span><span class="value-inline"> {d.items[i].netMass}</span></td></tr></table>
    <table class="dense"><tr><td><span class="label">[41] Suppl. Units [6/2]</span><span class="value-inline"> {d.items[i].supplementaryUnits}</span></td><td><span class="label">[46] Statistical value [8/6]</span><span class="value-inline"> {d.items[i].statisticalValue}</span></td><td><span class="label">[42] Item price [4/14]</span><span class="value-inline"> {d.items[i].itemPrice}</span></td>${
    isImport
      ? `<td><span class="label">[43] Valn. Method [4/16]</span><span class="value-inline"> {d.items[i].valuationMethod}</span></td>`
      : `<td><span class="label">Transport charges method [4/2]</span><span class="value-inline"> {d.items[i].freightPaymentMethod}</span></td><td><span class="label">[24] Nature of transaction [8/5]</span><span class="value-inline"> {d.items[i].transactionNature}</span></td>`
  }</tr></table>
    <table class="lists"><tr><td><span class="label">[44] Documents, certificates and authorisations [2/3]</span><span class="value">{d.items[i].documents}</span></td><td><span class="label">[44] Additional information [2/2]</span><span class="value">{d.items[i].additionalInformation}</span></td></tr></table>
    ${
    isImport
      ? `<table class="lists"><tr><td><span class="label">[47] Calculation of taxes [4/3]</span><span class="value">{d.items[i].taxes}</span></td><td><span class="label">[45] Additions and deductions [4/9]</span><span class="value">{d.items[i].adjustments}</span></td></tr></table>`
      : ""
  }
  </section><div class="item-end">{d.items[i+1].number}</div>

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
      : "Specific circumstance indicator [1/7]"
  }</span><span class="value-inline"> {d.deferredOrCircumstance}</span></td></tr></table>
  <table class="signature"><tr><td><span class="label">[52] Guarantee Type [8/2] | Reference [8/3] | Amount | Office</span><span class="value">{d.guarantee}</span></td><td><span class="label">[49] Identification of warehouse [2/7]</span><span class="value-inline"> {d.warehouse}</span><br><span class="label">[54] Place and date</span><span class="value">{d.status.placeAndDate}</span><span class="label">Signature and name of declarant/representative [1/8]</span><span class="value">{d.status.signatory}</span></td></tr></table></section>
</main>
${
    isImport
      ? `{d.exchangeRate:ifEM:hideBegin}<section class="page page-break"><p class="exchange-note">These exchange rates are only estimates, real exchange rates used by CDS may be different!</p><table class="exchange"><tr><td>Currency</td><td>{d.currency}</td></tr><tr><td>Exchange Rate:<br>(for 1 GBP)</td><td>{d.exchangeRate}</td></tr></table></section>{d.exchangeRate:ifEM:hideEnd}`
      : ""
  }
</body></html>`;
}
