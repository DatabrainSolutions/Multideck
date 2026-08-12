import {
  assert,
  assertEquals,
  assertThrows,
} from "jsr:@std/assert@1.0.14";
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
    carrier: "",
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
    consignor: "",
  };
  return {
    declaration: {
      CUST_Direction: "export",
      CUST_LocalReferenceNumber: "MD-LEGACY",
      CUST_GenericPayloadJSON: {
        ...genericPayload,
        traderReference: "MUTATED",
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
      CUSTI_ItemPayloadJSON: { ...item, description: "MUTATED ITEM" },
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
  assertEquals(dataset.declarationCode, "EX A");
  assertEquals(dataset.reference, "JENKAR26A");
  assertEquals(dataset.auditSpacerHeight, 271);
  assertEquals(dataset.movementTransport, "30 | VSL123");
  assertEquals(dataset.borderTransport, "30 | VSL123 | GB");
  assertEquals(dataset.lrn, "LRN-EXACT");
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
  assertEquals((dataset.parties as Record<string, unknown>).secondaryOne, "");
  assertEquals((dataset.parties as Record<string, unknown>).secondaryTwo, "");
  assertEquals(provenance.reference[0].table, "ICUS_Submissions");
});

Deno.test("sandbox and legacy persisted data are watermarked verification copies", () => {
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
