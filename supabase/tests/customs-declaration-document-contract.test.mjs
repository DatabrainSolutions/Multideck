import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("accepted declaration PDFs use a private server-owned Carbone boundary", async () => {
  const source = await read(
    "../functions/customs-declaration-document/index.ts",
  );
  assert.match(source, /authenticateRequest\(request\)/);
  assert.match(source, /CUST_CreatedBy.*context\.userId/s);
  assert.match(source, /ICUSS_Status === "accepted"/);
  assert.match(source, /ICUSS_MRN/);
  assert.match(source, /buildCustomsDeclarationDocumentDataset/);
  assert.match(source, /ICUSC_Environment/);
  assert.match(source, /templateHash/);
  assert.match(
    source,
    /providerEnvironment === "production"\s*&&\s*usesAcceptedSnapshot/,
  );
  assert.match(source, /\/render\/template\?download=true/);
  assert.match(source, /converter: "C"/);
  assert.match(
    source,
    /new TextDecoder\(\)\.decode\(bytes\.slice\(0, 5\)\) !== "%PDF-"/,
  );
  assert.match(source, /createSignedUrl/);
  assert.doesNotMatch(source, /input\.(draft|items|declarationData)/);
});

test("official declaration documents are immutable and retained for seven years", async () => {
  const migration = await read(
    "../migrations/20260812214215_customs_declaration_documents.sql",
  );
  assert.match(migration, /CUSTD_IsOfficial/);
  assert.match(migration, /CUSTD_SourceSHA256/);
  assert.match(migration, /CUSTD_RetainUntil/);
  assert.match(migration, /"CUSTD_RetainUntil" timestamptz not null/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /declaration\."CUST_CreatedBy" = auth\.uid\(\)/);
  assert.doesNotMatch(
    migration,
    /policy[\s\S]+for (insert|update|delete)[\s\S]+to authenticated/i,
  );

  const source = await read(
    "../functions/customs-declaration-document/index.ts",
  );
  assert.match(
    source,
    /retainUntil\.setUTCFullYear\(retainUntil\.getUTCFullYear\(\) \+ 7\)/,
  );
  assert.match(source, /CUSTD_RetainUntil: retainUntil\.toISOString\(\)/);
  assert.match(source, /upsert: false/);
});

test("the export template preserves the prescribed EAD and item-list particulars", async () => {
  const source = await read(
    "../functions/_shared/customs-declaration-template.ts",
  );
  const { customsDeclarationTemplate } = await import(
    "../functions/_shared/customs-declaration-template.ts"
  );
  const exportTemplate = customsDeclarationTemplate("export");
  const importTemplate = customsDeclarationTemplate("import");
  assert.match(exportTemplate, /EXPORT ACCOMPANYING DOCUMENT/);
  assert.match(exportTemplate, /<svg class="ead-barcode"/);
  assert.match(exportTemplate, /viewBox="0 0 \{d\.mrnBarcodeWidth\} \{d\.mrnBarcodeHeight\}"/);
  assert.match(exportTemplate, /<path d="\{d\.mrnBarcodePath\}" fill="#000"\/>/);
  assert.doesNotMatch(exportTemplate, /mrnBarcodeSvg/);
  assert.match(exportTemplate, /Code 128 B barcode containing MRN \{d\.mrn\}/);
  assert.match(exportTemplate, /DECLARATION TYPE \(1\)/);
  assert.match(exportTemplate, /Sec\. Decl\. \(S00\)/);
  assert.match(exportTemplate, /Other SCI \(S32\)/);
  assert.match(exportTemplate, /Customs office/);
  assert.match(exportTemplate, /Reference numbers \(7\) - LRN and\/or UCR/);
  assert.match(exportTemplate, /CONTROL BY OFFICE OF DISPATCH\/EXPORT \(E\)/);
  assert.match(exportTemplate, /CONTROL BY OFFICE OF EXIT \(K\)/);
  assert.match(exportTemplate, /EXPORT LIST OF ITEMS/);
  assert.match(exportTemplate, /MRN: \{d\.mrn\}/);
  assert.match(exportTemplate, /Page 1 of \{d\.totalPages\}/);
  assert.match(exportTemplate, /\{d\.itemListPages\[i\]\.documentPageNumber\}/);
  assert.match(exportTemplate, /\{d\.itemListPages\[i\+1\]\}/);
  assert.match(exportTemplate, /\{d\.items\[0\]\.number\}/);
  assert.match(exportTemplate, /paper-size="A4"/);
  assert.doesNotMatch(
    exportTemplate,
    /Acceptance date\/time|Declaration status|Tax summary/,
  );
  assert.match(importTemplate, /Calculation of taxes/);
  assert.match(importTemplate, /exchange rates are only estimates/);
  assert.match(importTemplate, /\{d\.items\[i\+1\]\}/);
  assert.doesNotMatch(source, /test-watermark|TEST MODE/);
});

test("document dataset validates provenance and exact accepted-snapshot sources", async () => {
  const source = await read(
    "../functions/_shared/customs-declaration-document-data.ts",
  );
  const provider = await read("../functions/icustoms-api/index.ts");
  const migration = await read(
    "../migrations/20260812231500_customs_submission_accepted_snapshot.sql",
  );

  assert.match(source, /validateCustomsDocumentProvenance/);
  assert.match(source, /leafPaths\(dataset\)/);
  assert.match(source, /ICUSS_DeclarationSnapshotJSON/);
  assert.match(source, /ICUSS_ResponsePayloadJSON\.AcceptanceDateTime/);
  assert.match(source, /valid 18-character MRN/);
  assert.match(source, /providerCustomsOffice/);
  assert.match(source, /securityIndicator/);
  assert.match(source, /otherSpecificCircumstance/);
  assert.match(source, /documentPageNumber/);
  assert.match(source, /code128BBarcode/);
  assert.match(source, /const startB = 104/);
  assert.match(source, /code128Patterns\[symbol\]/);
  assert.match(
    source,
    /join\(\[isImport \? "IM" : "EX", draft\.declarationType\]/,
  );
  assert.match(source, /departureIdentificationType/);
  assert.match(source, /borderIdentificationType/);
  assert.match(source, /freightPaymentMethod/);
  assert.match(source, /transactionNature/);
  assert.match(provider, /declarationSnapshot/);
  assert.match(provider, /ICUSS_DeclarationSnapshotJSON: declarationSnapshot/);
  assert.match(provider, /ICUSS_ProviderStatus: providerStatus/);
  assert.match(
    migration,
    /add column if not exists "ICUSS_DeclarationSnapshotJSON" jsonb/,
  );
  assert.match(
    migration,
    /add column if not exists "ICUSS_ProviderStatus" text/,
  );
  assert.match(
    migration,
    /jsonb_typeof\("ICUSS_DeclarationSnapshotJSON" -> 'schemaVersion'\) = 'number'/,
  );
  assert.doesNotMatch(migration, /schemaVersion'\)::integer/);
});

test("the Multideck UI owns PDF availability and the download state machine", async () => {
  const page = await read(
    "../../multideck.client/src/pages/customs-declarations-page.tsx",
  );
  const viewer = await read(
    "../../multideck.client/src/components/multideck/pdf-document-viewer-dialog.tsx",
  );
  assert.match(page, /View declaration PDF/);
  assert.ok(page.indexOf("View declaration PDF") < page.indexOf("View in"));
  assert.match(
    page,
    /Boolean\(declarationId && iCustomsState\?\.declaration\.provider\?\.mrn && \["accepted", "released", "cleared"\]\.includes\(customsStatus\)\)/,
  );
  assert.match(page, /\{pdfAvailable \? <Button[\s\S]*?"View declaration PDF"[\s\S]*?: null\}/);
  assert.doesNotMatch(page, /PDF available after acceptance/);
  assert.match(viewer, /"idle" \| "downloading" \| "done"/);
  assert.match(viewer, /t\("Downloading"\)/);
  assert.match(viewer, /t\("Done"\)/);
  assert.match(viewer, /backdrop-blur-\[18px\]/);
  assert.match(viewer, /renderPdfPageImages/);
  assert.match(viewer, /!bg-transparent/);
  assert.match(viewer, /availableHeight \* \(page\.width \/ page\.height\)/);
  assert.match(viewer, /overflow-auto overscroll-contain/);
  assert.match(viewer, /pages\.map\(\(page\)/);
  assert.match(viewer, /backdrop-blur-xl/);
  assert.match(viewer, /t\("Fit page"\)/);
  assert.match(viewer, /aria-live="polite"/);
});
