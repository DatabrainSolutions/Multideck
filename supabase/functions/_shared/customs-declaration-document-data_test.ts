import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";
import {
  buildCustomsDeclarationDocumentDataset,
  validateCustomsDocumentProvenance,
} from "./customs-declaration-document-data.ts";

const mrn = "26GB123456789ABCDE";

function acceptedSources() {
  const genericPayload = {
    declarationType: "A",
    traderReference: "JENKAR26A",
    totalPackages: "1",
    exporter: "GBEXPORTER",
    exporterName: "Exporter Ltd",
    consignee: "FRCONSIGNEE",
    consigneeName: "Consignee SAS",
    declarant: "GBDECLARANT",
    carrier: "GB CARRIER LTD",
    exportCountry: "GB",
    destinationCountry: "FR",
    departureIdentificationType: "30",
    departureIdentificationNumber: "VSL123",
    borderIdentificationType: "30",
    borderIdentificationNumber: "VSL123",
    borderNationality: "GB",
    borderMode: "1",
    inlandMode: "3",
    totalAmount: "1000",
    currency: "GBP",
    totalGrossMass: "120",
    transactionNature: "11",
    freightPaymentMethod: "A",
    items: [],
  };
  const item = {
    id: "item-1",
    commodityCode: "9403609000",
    description: "Furniture",
    packageCount: "1",
    packageKind: "PK",
    grossMass: "120",
    netMass: "105",
    transactionNature: "11",
    freightPaymentMethod: "A",
    consignor: "GB CONSIGNOR LTD",
    ucr: "UCR-EXACT",
  };
  return {
    declaration: {
      CUST_Direction: "export",
      CUST_LocalReferenceNumber: "MD-LEGACY",
      CUST_GenericPayloadJSON: {
        ...genericPayload,
        traderReference: "MUTATED",
        carrier: "",
      },
    },
    submission: {
      ICUSS_Status: "accepted",
      ICUSS_ProviderStatus: "released",
      ICUSS_MRN: mrn,
      ICUSS_LRN: "LRN-EXACT",
      ICUSS_UpdatedAt: "2026-08-12T22:21:00Z",
      ICUSS_CompletedAt: "2026-08-12T22:21:01Z",
      ICUSS_ResponsePayloadJSON: {
        AcceptanceDateTime: { _2DateTimeString: "20260812222005Z" },
        OfficeOfExport: { ID: "GB000074" },
        SecurityIndicator: "S",
        SpecificCircumstanceIndicator: "A",
      },
      ICUSS_DeclarationSnapshotJSON: {
        schemaVersion: 1,
        declaration: {
          direction: "export",
          localReferenceNumber: "LRN-LOCAL",
          genericPayload,
        },
        items: [{ itemNumber: 1, payload: item }],
      },
    },
    itemRows: [{
      CUSTI_ItemNumber: 1,
      CUSTI_ItemPayloadJSON: {
        ...item,
        description: "MUTATED ITEM",
        consignor: "",
      },
    }],
  };
}

Deno.test("accepted dataset uses immutable snapshot and exact provider fields", () => {
  const sources = acceptedSources();
  const { dataset, provenance, usesAcceptedSnapshot } =
    buildCustomsDeclarationDocumentDataset(
      sources.declaration,
      sources.submission,
      sources.itemRows,
      "production",
    );
  assertEquals(usesAcceptedSnapshot, true);
  assertEquals(dataset.documentMode, "official");
  assertEquals(dataset.mrn, mrn);
  assertEquals(dataset.mrnBarcodeWidth, 253);
  assertEquals(dataset.mrnBarcodeHeight, 46);
  assert(
    String(dataset.mrnBarcodePath).startsWith("M10 0h2v46h-2z"),
  );
  assertEquals(dataset.declarationCode, "EX A");
  assertEquals(dataset.reference, "JENKAR26A");
  assertEquals(dataset.auditSpacerHeight, 45);
  assertEquals(dataset.movementTransport, "30 | VSL123");
  assertEquals(dataset.borderTransport, "30 | VSL123 | GB");
  assertEquals(dataset.lrn, "LRN-EXACT");
  assertEquals(dataset.ucr, "UCR-EXACT");
  assertEquals(dataset.customsOffice, "GB000074");
  assertEquals(dataset.securityIndicator, "S");
  assertEquals(dataset.otherSpecificCircumstance, "A");
  assertEquals(dataset.totalPages, 1);
  assertEquals((dataset.itemListPages as unknown[]).length, 0);
  assertEquals(
    (dataset.status as Record<string, unknown>).acceptedAt,
    "20260812222005Z",
  );
  assertEquals(
    (dataset.status as Record<string, unknown>).label,
    "Released",
  );
  assertEquals(
    (dataset.items[0] as Record<string, unknown>).description,
    "Furniture",
  );
  assertEquals(
    (dataset.items[0] as Record<string, unknown>).freightPaymentMethod,
    "A",
  );
  assertEquals(
    (dataset.items[0] as Record<string, unknown>).transactionNature,
    "11",
  );
  assertEquals(
    (dataset.items[0] as Record<string, unknown>).documentPageNumber,
    1,
  );
  assertEquals(
    (dataset.parties as Record<string, unknown>).secondaryOne,
    "GB CONSIGNOR LTD",
  );
  assertEquals(
    (dataset.parties as Record<string, unknown>).secondaryTwo,
    "GB CARRIER LTD",
  );
  assertEquals(provenance.reference[0].table, "ICUS_Submissions");
});

Deno.test("official EAD data fails closed unless the MRN is exactly 18 characters", () => {
  const sources = acceptedSources();
  (sources.submission as Record<string, unknown>).ICUSS_MRN = "26GBSHORT";
  assertThrows(
    () =>
      buildCustomsDeclarationDocumentDataset(
        sources.declaration,
        sources.submission,
        sources.itemRows,
        "production",
      ),
    Error,
    "valid 18-character MRN",
  );
});

Deno.test("official EAD data fails closed when the accepted response has no office of export", () => {
  const sources = acceptedSources();
  (sources.submission as Record<string, unknown>).ICUSS_ResponsePayloadJSON = {
    AcceptanceDateTime: { _2DateTimeString: "20260812222005Z" },
  };
  assertThrows(
    () =>
      buildCustomsDeclarationDocumentDataset(
        sources.declaration,
        sources.submission,
        sources.itemRows,
        "production",
      ),
    Error,
    "office of export required for an official EAD",
  );
});

Deno.test("additional accepted goods items become consecutively numbered ELoI pages", () => {
  const sources = acceptedSources();
  const snapshot = (sources.submission as Record<string, unknown>)
    .ICUSS_DeclarationSnapshotJSON as Record<string, unknown>;
  const first = (snapshot.items as Array<Record<string, unknown>>)[0];
  snapshot.items = [
    first,
    {
      itemNumber: 2,
      payload: {
        ...(first.payload as Record<string, unknown>),
        id: "item-2",
        description: "Second accepted item",
        ucr: "UCR-SECOND",
      },
    },
  ];
  const { dataset } = buildCustomsDeclarationDocumentDataset(
    sources.declaration,
    sources.submission,
    [],
    "production",
  );
  assertEquals(dataset.totalPages, 2);
  assertEquals((dataset.itemListPages as unknown[]).length, 1);
  assertEquals(
    (dataset.itemListPages as Array<Record<string, unknown>>)[0]
      .documentPageNumber,
    2,
  );
});

Deno.test("sandbox and legacy persisted data remain non-official verification copies", () => {
  const sources = acceptedSources();
  (sources.submission as Record<string, unknown>)
    .ICUSS_DeclarationSnapshotJSON = undefined;
  const { dataset, usesAcceptedSnapshot } =
    buildCustomsDeclarationDocumentDataset(
      sources.declaration,
      sources.submission,
      sources.itemRows,
      "production",
    );
  assertEquals(usesAcceptedSnapshot, false);
  assertEquals(dataset.documentMode, "verification");
  assertEquals(
    (dataset.parties as Record<string, unknown>).secondaryOne,
    "Not supplied on declaration",
  );
  assertEquals(
    (dataset.parties as Record<string, unknown>).secondaryTwo,
    "Not supplied on declaration",
  );

  (sources.submission as Record<string, unknown>)
    .ICUSS_DeclarationSnapshotJSON = acceptedSources().submission
      .ICUSS_DeclarationSnapshotJSON;
  const sandbox = buildCustomsDeclarationDocumentDataset(
    sources.declaration,
    sources.submission,
    sources.itemRows,
    "sandbox",
  );
  assertEquals(sandbox.dataset.documentMode, "verification");
});

Deno.test("accepted export snapshots fail closed when carrier or consignor is missing", () => {
  const missingCarrier = acceptedSources();
  const carrierSnapshot = (missingCarrier.submission as Record<string, unknown>)
    .ICUSS_DeclarationSnapshotJSON as Record<string, unknown>;
  const carrierDeclaration = carrierSnapshot.declaration as Record<
    string,
    unknown
  >;
  (carrierDeclaration.genericPayload as Record<string, unknown>).carrier = "";
  assertThrows(
    () =>
      buildCustomsDeclarationDocumentDataset(
        missingCarrier.declaration,
        missingCarrier.submission,
        missingCarrier.itemRows,
        "production",
      ),
    Error,
    "carrier",
  );

  const missingConsignor = acceptedSources();
  const consignorSnapshot =
    (missingConsignor.submission as Record<string, unknown>)
      .ICUSS_DeclarationSnapshotJSON as Record<string, unknown>;
  const snapshotItems = consignorSnapshot.items as Array<
    Record<string, unknown>
  >;
  (snapshotItems[0].payload as Record<string, unknown>).consignor = "";
  assertThrows(
    () =>
      buildCustomsDeclarationDocumentDataset(
        missingConsignor.declaration,
        missingConsignor.submission,
        missingConsignor.itemRows,
        "production",
      ),
    Error,
    "goods item 1 consignor",
  );
});

Deno.test("import pagination reserves the reference audit position without orphaning it", () => {
  const sources = acceptedSources();
  const snapshot = (sources.submission as Record<string, unknown>)
    .ICUSS_DeclarationSnapshotJSON as Record<string, unknown>;
  const declaration = snapshot.declaration as Record<string, unknown>;
  declaration.direction = "import";
  const payload = declaration.genericPayload as Record<string, unknown>;
  payload.direction = "import";
  const result = buildCustomsDeclarationDocumentDataset(
    sources.declaration,
    sources.submission,
    sources.itemRows,
    "sandbox",
  );
  assertEquals(result.dataset.direction, "import");
  assertEquals(result.dataset.auditSpacerHeight, 138);
});

Deno.test("provenance validation fails closed for an untracked display field", () => {
  assertThrows(
    () =>
      validateCustomsDocumentProvenance({
        direction: "export",
        items: [],
        invented: "value",
      }, {
        direction: [{
          table: "Customs_Declarations",
          fields: ["CUST_Direction"],
        }],
      }),
    Error,
    "invented",
  );
});
