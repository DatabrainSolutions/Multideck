import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/harryphillips/Databrain/GitHub/Multideck/outputs/019fa7da-0971-7000-b1b7-f89ff1643a9f";

const fields = [
  ["Declaration header", "Status", "Declaration header", "Image 2"],
  ["Declaration header", "MRN", "Declaration header", "Image 2"],
  ["Declaration header", "Declaration category", "Declaration header", "Image 2"],
  ["Declaration header", "Job reference", "Declaration header", "Image 2"],
  ["Declaration header", "DUCR – part", "Declaration header", "Image 2"],
  ["Declaration header", "Declaration type", "Declaration header", "Image 2"],
  ["Declaration header", "DUCR part item number", "Declaration header", "Image 2"],
  ["Declaration header", "Acceptance date / time", "Declaration header", "Image 2"],
  ["Declaration header", "Badge", "Declaration header", "Image 2"],
  ["Declaration header", "LRN", "Declaration header", "Image 2"],
  ["Declaration header", "Declarant’s reference", "Declaration header", "Image 2"],
  ["Declaration header", "MUCR / UCN", "Declaration header", "Image 2"],
  ["Parties", "Consignor", "Declaration header", "Image 2"],
  ["Parties", "Consignee", "Declaration header", "Image 2"],
  ["Parties", "Declarant", "Declaration header", "Image 2"],
  ["Parties", "Representative", "Declaration header", "Image 2"],
  ["Parties", "Declarant representation", "Declaration header", "Image 2"],
  ["Parties", "DAN 1", "Declaration header", "Image 2"],
  ["Parties", "DAN 2", "Declaration header", "Image 2"],
  ["Transport", "Total packages", "Transport details", "Image 3"],
  ["Transport", "Transport mode", "Transport details", "Image 3"],
  ["Transport", "Arrival transport ID", "Transport details", "Image 3"],
  ["Transport", "Destination country", "Transport details", "Image 3"],
  ["Transport", "AWB / BOL", "Transport details", "Image 3"],
  ["Transport", "Border nationality", "Transport details", "Image 3"],
  ["Transport", "Border transport mode", "Transport details", "Image 3"],
  ["Transport", "Dispatch country", "Transport details", "Image 3"],
  ["Transport", "HAWB", "Transport details", "Image 3"],
  ["Transport", "Total gross mass", "Transport details", "Image 3"],
  ["Transport", "Arrival transport ID type", "Transport details", "Image 3"],
  ["Transport", "Container", "Containers", "Image 3"],
  ["Additional information", "Statement code", "Additional information", "Image 3"],
  ["Additions & deductions", "Airport of loading", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "Freight charge", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "Air transport charge", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "Insurance", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "VAT adjustment", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "Freight charge currency", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "Air transport charge currency", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "Insurance currency", "Additions and deductions", "Image 4"],
  ["Additions & deductions", "VAT adjustment currency", "Additions and deductions", "Image 4"],
  ["Invoice & goods", "Invoice currency", "Invoices and goods", "Image 4"],
  ["Invoice & goods", "Nature of transaction", "Invoices and goods", "Image 4"],
  ["Invoice & goods", "Terms of delivery", "Invoices and goods", "Image 4"],
  ["Invoice & goods", "Incoterms UN/LOCODE", "Invoices and goods", "Image 4"],
  ["Locations", "Country", "Offices and locations", "Image 4"],
  ["Locations", "Port code", "Offices and locations", "Image 4"],
  ["Locations", "Warehouse ID", "Offices and locations", "Image 4"],
  ["Locations", "Goods location", "Offices and locations", "Image 4"],
  ["Locations", "Supervising office", "Offices and locations", "Image 4"],
  ["Locations", "Presentation office", "Offices and locations", "Image 4"],
  ["Locations", "Airport of origin", "Offices and locations", "Image 4"],
  ["Locations", "Airport of destination", "Offices and locations", "Image 4"],
  ["Item", "Commodity code", "Item identification", "Image 7"],
  ["Item", "Country of origin", "Item identification", "Image 7"],
  ["Item", "Procedure", "Item identification", "Image 7"],
  ["Item", "Goods description", "Item identification", "Image 7"],
  ["Item", "Invoice number", "Item identification", "Image 7"],
  ["Item", "Product", "Item identification", "Image 7"],
  ["Item", "Taric additional code", "Item identification", "Image 7"],
  ["Item", "Preference", "Item identification", "Image 7"],
  ["Item", "Additional procedure", "Item identification", "Image 7"],
  ["Item", "National additional code", "Item identification", "Image 7"],
  ["Item", "Country of preferential origin", "Item identification", "Image 7"],
  ["Item", "Quota", "Item identification", "Image 7"],
  ["Item", "Net mass", "Measurements", "Image 7"],
  ["Item", "Gross mass", "Measurements", "Image 7"],
  ["Item", "Supplementary units", "Measurements", "Image 7"],
  ["Item", "Value", "Measurements", "Image 7"],
  ["Item", "Statistical value", "Measurements", "Image 7"],
  ["Item", "Valuation method", "Valuation", "Image 7"],
  ["Item documents", "Previous document code statements", "Documents", "Image 7"],
  ["Item documents", "AI statements", "Documents", "Image 7"],
  ["Packaging", "Marks and packages", "Packaging", "Image 8"],
  ["Packaging", "Quantity", "Marks and packages", "Image 8"],
  ["Packaging", "Kind of package(s)", "Marks and packages", "Image 8"],
  ["Packaging", "Marks and numbers", "Marks and packages", "Image 8"],
  ["Tax", "Tax lines", "Tax lines", "Image 8"],
  ["Tax", "Tax type", "Tax lines", "Image 8"],
  ["Tax", "MOP", "Tax lines", "Image 8"],
  ["Tax", "Base quantity", "Tax lines", "Image 8"],
  ["Tax", "Unit code", "Tax lines", "Image 8"],
  ["Legacy CargoWise reference", "Customs exporter", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "Transport details", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "Vessel", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "Nationality", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "House bill", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "UCC 5/4 origin", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "UCC 5/8 destination", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "Shipment type", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "UCC 1/1 declaration type", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "Transport mode", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "Message", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "DUCR", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "Profile", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "Customs offices", "Shipment details", "Image 1"],
  ["Legacy CargoWise reference", "UCC 5/27 supervising", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "UCC 3/18 declarant", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "UCC 3/20 representative", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "UCC 3/24 seller", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "UCC 3/31 manufacturer", "Shipment declaration", "Image 1"],
  ["Legacy CargoWise reference", "UCC 6/8 goods description", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 5/15, 16 CR of preferential origin", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 6/17 VAT", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 6/4 & 6/5 commodity and TARIC", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 6/16 & 6/17 additional code", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 4/1 preferential code", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 6/1 customs quantity", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 8/1 quota", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 4/16 valuation method", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 1/10 & 1/11 procedure", "Line details", "Image 6"],
  ["Legacy CargoWise reference", "UCC 1/11 further additional procedures", "Line details", "Image 6"],
  ["Green-highlighted reference", "Invoice value", "Legacy declaration grid", "Image 6"],
  ["Green-highlighted reference", "Total value", "Legacy declaration grid", "Image 6"],
  ["Green-highlighted reference", "UCC 5/15, 16 – country of preferential origin", "Line details", "Image 6"],
  ["Green-highlighted reference", "UCC 6/17 – VAT", "Line details", "Image 6"],
  ["Green-highlighted reference", "UCC 4/1 – preferential code", "Line details", "Image 6"],
  ["Green-highlighted reference", "Item value", "Line calculations", "Image 6"],
  ["Green-highlighted reference", "VAT amount", "Line calculations", "Image 6"],
  ["Green-highlighted reference", "Duty", "Line calculations", "Image 6"],
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Customs fields");
sheet.showGridLines = false;
sheet.getRange("A1:D1").merge();
sheet.getRange("A1").values = [["Customs fields highlighted by Mark"]];
sheet.getRange("A2:D2").merge();
sheet.getRange("A2").values = [["Extracted from ‘DECLARATION HEADER PAGE’ – yellow- and green-highlighted fields. Legacy CargoWise references are kept separate for mapping." ]];
sheet.getRange(`A4:D${fields.length + 4}`).values = [["Area", "Field", "Screen section", "Source"], ...fields];
sheet.getRange("A1:D1").format = { fill: "#0E7D74", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "left", verticalAlignment: "center" };
sheet.getRange("A2:D2").format = { fill: "#EAF5F3", font: { color: "#395B57", italic: true }, wrapText: true, verticalAlignment: "center" };
sheet.getRange("A4:D4").format = { fill: "#292929", font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
sheet.getRange(`A5:D${fields.length + 4}`).format = { verticalAlignment: "center", wrapText: true };
sheet.getRange(`A5:D${fields.length + 4}`).format.borders = { insideHorizontal: { style: "thin", color: "#E5E7EB" }, bottom: { style: "thin", color: "#E5E7EB" } };
sheet.getRange(`A5:B${fields.length + 4}`).format.fill = "#FFFBE6";
sheet.getRange(`A5:A${fields.length + 4}`).format.font = { bold: true, color: "#292929" };
sheet.getRange(`D5:D${fields.length + 4}`).format.font = { color: "#5D5D5D" };
sheet.getRange("A:A").format.columnWidth = 28;
sheet.getRange("B:B").format.columnWidth = 38;
sheet.getRange("C:C").format.columnWidth = 26;
sheet.getRange("D:D").format.columnWidth = 14;
sheet.getRange("1:1").format.rowHeight = 30;
sheet.getRange("2:2").format.rowHeight = 28;
sheet.getRange("4:4").format.rowHeight = 22;
sheet.freezePanes.freezeRows(4);

const source = workbook.worksheets.add("Read me");
source.showGridLines = false;
source.getRange("A1:D1").merge();
source.getRange("A1").values = [["Customs field extraction notes"]];
source.getRange("A3:B7").values = [
  ["Source document", "DECLARATION HEADER PAGE .docx"],
  ["Sender", "Mark Subritzky"],
  ["Method", "Reviewed every supplied screenshot and transcribed labels or operational values shown with yellow or green highlighting."],
  ["Structure", "Operational Descartes/CDS fields are listed first; the final group preserves highlighted CargoWise/UCC labels for cross-system mapping."],
  ["Use", "Filter by Area to work through header, party, transport, item, packaging, tax, and mapping fields."],
];
source.getRange("A1:D1").format = { fill: "#0E7D74", font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
source.getRange("A3:A7").format = { fill: "#F2F2F2", font: { bold: true, color: "#292929" }, verticalAlignment: "top" };
source.getRange("B3:B7").format = { wrapText: true, verticalAlignment: "top" };
source.getRange("A3:B7").format.borders = { preset: "outside", style: "thin", color: "#D9D9D9" };
source.getRange("A:A").format.columnWidth = 24;
source.getRange("B:B").format.columnWidth = 86;
source.getRange("1:1").format.rowHeight = 30;
source.getRange("5:7").format.rowHeight = 42;

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/customs-fields.xlsx`);

const preview = await workbook.render({ sheetName: "Customs fields", range: `A1:D${Math.min(fields.length + 4, 42)}`, scale: 1.5 });
await fs.writeFile(`${outputDir}/customs-fields-preview.png`, new Uint8Array(await preview.arrayBuffer()));
const check = await workbook.inspect({ kind: "table", range: "Customs fields!A1:D16", include: "values", tableMaxRows: 16, tableMaxCols: 4 });
console.log(check.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "formula error scan" });
console.log(errors.ndjson);
