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

test("import and export templates keep the requested CDS structure and repeat items", async () => {
  const source = await read(
    "../functions/_shared/customs-declaration-template.ts",
  );
  assert.match(source, /isImport \? "Import" : "Export"/);
  assert.doesNotMatch(source, /class=\\"barcode\\"|MULTIDECK_MRN_BARCODE/);
  assert.match(source, /\{d\.items\[i\]\.number\}/);
  assert.match(source, /\{d\.items\[i\+1\]\.number\}/);
  assert.match(source, /Calculation of taxes/);
  assert.match(source, /exchange rates are only estimates/);
  assert.match(source, /paper-size="A4"/);
  assert.match(source, /audit-block/);
  assert.match(source, /auditSpacerHeight/);
  assert.match(source, /page-break-inside: avoid/);
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
    /pdfBusy \? "Preparing PDF" : pdfLoadError \? "Retry PDF" : "PDF"/,
  );
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
