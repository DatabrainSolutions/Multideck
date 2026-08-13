import type { CustomsDocumentDirection } from "./customs-declaration-template.ts";

type Json = Record<string, unknown>;

export type CustomsDocumentSourceTable =
  | "Customs_Declarations"
  | "Customs_Items"
  | "ICUS_Submissions";

export type CustomsDocumentProvenance = Record<
  string,
  Array<{
    table: CustomsDocumentSourceTable;
    fields: string[];
    itemNumber?: number;
  }>
>;

type ProvenanceEntry = CustomsDocumentProvenance[string][number];

export type CustomsDeclarationDocumentDataset = Record<string, unknown> & {
  direction: CustomsDocumentDirection;
  items: Array<Record<string, unknown>>;
};

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : {};
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, maximum = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maximum)
    : value == null
    ? ""
    : String(value).trim().slice(0, maximum);
}

function join(values: unknown[], separator = " | ") {
  return values.map((value) => text(value)).filter(Boolean).join(separator);
}

function uniqueLines(values: unknown[]) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))].join(
    "\n",
  );
}

function looksLikePartyIdentifier(value: unknown) {
  return /^[A-Z]{2}[A-Z0-9]{3,15}$/.test(text(value, 70).toUpperCase());
}

function partyContact(draft: Json, prefix: string) {
  const identifier = looksLikePartyIdentifier(draft[prefix]);
  return uniqueLines([
    draft[`${prefix}Name`] ?? (identifier ? "" : draft[prefix]),
    draft[`${prefix}AddressLine`],
    join([
      draft[`${prefix}City`],
      draft[`${prefix}Postcode`],
      draft[`${prefix}Country`],
    ], " "),
  ]);
}

function partyIdentifier(value: unknown) {
  return looksLikePartyIdentifier(value) ? text(value, 70).toUpperCase() : "";
}

function standalonePartyContact(value: unknown) {
  return looksLikePartyIdentifier(value) ? "" : text(value, 120);
}

function partyFields(prefix: string) {
  return [
    prefix,
    `${prefix}Name`,
    `${prefix}AddressLine`,
    `${prefix}City`,
    `${prefix}Postcode`,
    `${prefix}Country`,
  ];
}

function codeEntries(value: unknown) {
  return join(list(value).map((entry) => entry.code));
}

function packageLines(item: Json) {
  return [
    join([item.packageCount, item.packageKind, item.packageMarks]),
    ...list(item.additionalPackageDetails).map((entry) =>
      join([entry.count, entry.kind, entry.marks])
    ),
  ].filter(Boolean).join("\n");
}

function previousDocumentLines(item: Json) {
  return [
    join([
      item.previousDocumentCategory,
      item.previousDocumentType,
      item.previousDocumentReference,
    ]),
    ...list(item.additionalPreviousDocuments).map((entry) =>
      join([entry.category, entry.type, entry.reference])
    ),
  ].filter(Boolean).join("\n");
}

function documentLines(item: Json) {
  return [
    join([
      item.additionalDocumentCategory,
      item.additionalDocumentType,
      item.additionalDocumentId,
      item.additionalDocumentName,
    ]),
    ...list(item.additionalDocuments).map((entry) =>
      join([
        entry.category,
        entry.type,
        entry.reference,
        entry.name,
        entry.lpcoExemptionCode,
        entry.validityDate,
      ])
    ),
  ].filter(Boolean).join("\n");
}

function displayMrn(value: string) {
  return value.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ")
    .trim();
}

function titleCase(value: string) {
  return value
    ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
    : "";
}

function providerAcceptanceDateTime(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  for (const [key, entry] of Object.entries(value as Json)) {
    if (/acceptance.?date.?time/i.test(key)) {
      if (typeof entry === "string") return text(entry, 80);
      const nested = record(entry);
      const exact = text(
        nested._2DateTimeString ?? nested.dateTimeString ?? nested.value,
        80,
      );
      if (exact) return exact;
    }
    const nestedMatch = providerAcceptanceDateTime(entry);
    if (nestedMatch) return nestedMatch;
  }
  return "";
}

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      leafPaths(entry, `${prefix}[${index}]`)
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Json).flatMap(([key, entry]) =>
      leafPaths(entry, prefix ? `${prefix}.${key}` : key)
    );
  }
  return prefix ? [prefix] : [];
}

/**
 * Fails closed if a template-bound field has no persisted source pointer. This
 * runs before hashing or sending data to Carbone, so a future template field
 * cannot silently introduce an invented or browser-only value.
 */
export function validateCustomsDocumentProvenance(
  dataset: CustomsDeclarationDocumentDataset,
  provenance: CustomsDocumentProvenance,
) {
  const missing = leafPaths(dataset).filter((path) =>
    !provenance[path]?.length
  );
  const invalid = Object.entries(provenance).flatMap(([path, sources]) => {
    if (!sources.length) return [path];
    return sources.some((source) =>
        !["Customs_Declarations", "Customs_Items", "ICUS_Submissions"].includes(
          source.table,
        ) || !source.fields.length
      )
      ? [path]
      : [];
  });
  if (missing.length || invalid.length) {
    throw new Error(
      `Customs declaration document provenance is incomplete: ${
        [...new Set([...missing, ...invalid])].join(", ")
      }`,
    );
  }
}

export function buildCustomsDeclarationDocumentDataset(
  declaration: Json,
  submission: Json,
  itemRows: Json[],
  providerEnvironment: "sandbox" | "production",
) {
  const acceptedSnapshot = record(submission.ICUSS_DeclarationSnapshotJSON);
  const snapshotDeclaration = record(acceptedSnapshot.declaration);
  const snapshotItems = list(acceptedSnapshot.items);
  const hasAcceptedSnapshot = acceptedSnapshot.schemaVersion === 1 &&
    Object.keys(record(snapshotDeclaration.genericPayload)).length > 0;
  const draft = hasAcceptedSnapshot
    ? record(snapshotDeclaration.genericPayload)
    : record(declaration.CUST_GenericPayloadJSON);
  const directionValue = hasAcceptedSnapshot
    ? snapshotDeclaration.direction
    : declaration.CUST_Direction;
  const direction: CustomsDocumentDirection = directionValue === "import"
    ? "import"
    : "export";
  const isImport = direction === "import";
  const provenance: CustomsDocumentProvenance = {};
  const tracked = <T>(
    path: string,
    value: T,
    sources: CustomsDocumentProvenance[string],
  ): T => {
    provenance[path] = sources;
    return value;
  };
  const declarationSource = (
    ...fields: string[]
  ) => [{ table: "Customs_Declarations" as const, fields }];
  const submissionSource = (
    ...fields: string[]
  ) => [{ table: "ICUS_Submissions" as const, fields }];
  const draftSource = (...fields: string[]) =>
    hasAcceptedSnapshot
      ? submissionSource(
        ...fields.map((field) =>
          `ICUSS_DeclarationSnapshotJSON.declaration.genericPayload.${field}`
        ),
      )
      : declarationSource(
        ...fields.map((field) => `CUST_GenericPayloadJSON.${field}`),
      );
  const localReferenceSource = hasAcceptedSnapshot
    ? submissionSource(
      "ICUSS_DeclarationSnapshotJSON.declaration.localReferenceNumber",
    )
    : declarationSource("CUST_LocalReferenceNumber");
  const directionSource = hasAcceptedSnapshot
    ? submissionSource("ICUSS_DeclarationSnapshotJSON.declaration.direction")
    : declarationSource("CUST_Direction");

  const persistedItemRows = hasAcceptedSnapshot
    ? snapshotItems.map((row, index) => ({
      number: Number(row.itemNumber) || index + 1,
      item: record(row.payload),
      table: "ICUS_Submissions" as const,
    }))
    : itemRows.length
    ? itemRows.map((row, index) => ({
      number: Number(row.CUSTI_ItemNumber) || index + 1,
      item: record(row.CUSTI_ItemPayloadJSON),
      table: "Customs_Items" as const,
    }))
    : list(draft.items).map((item, index) => ({
      number: index + 1,
      item,
      table: "Customs_Declarations" as const,
    }));

  const itemSources = (
    entry: typeof persistedItemRows[number],
    fields: string[],
  ): ProvenanceEntry[] =>
    entry.table === "ICUS_Submissions"
      ? [{
        table: "ICUS_Submissions" as const,
        fields: fields.map((field) =>
          `ICUSS_DeclarationSnapshotJSON.items[itemNumber=${entry.number}].payload.${field}`
        ),
        itemNumber: entry.number,
      }]
      : entry.table === "Customs_Items"
      ? [{
        table: "Customs_Items" as const,
        fields: fields.map((field) => `CUSTI_ItemPayloadJSON.${field}`),
        itemNumber: entry.number,
      }]
      : [{
        table: "Customs_Declarations" as const,
        fields: fields.map((field) =>
          `CUST_GenericPayloadJSON.items[${entry.number - 1}].${field}`
        ),
        itemNumber: entry.number,
      }];

  const items = persistedItemRows.map((entry, index) => {
    const item = entry.item;
    const path = `items[${index}]`;
    const itemField = <T>(name: string, value: T, fields: string[]) =>
      tracked(`${path}.${name}`, value, itemSources(entry, fields));
    return {
      number: tracked(
        `${path}.number`,
        entry.number,
        entry.table === "ICUS_Submissions"
          ? [{
            table: "ICUS_Submissions",
            fields: [
              `ICUSS_DeclarationSnapshotJSON.items[itemNumber=${entry.number}].itemNumber`,
            ],
            itemNumber: entry.number,
          }]
          : entry.table === "Customs_Items"
          ? [{
            table: "Customs_Items",
            fields: ["CUSTI_ItemNumber"],
            itemNumber: entry.number,
          }]
          : itemSources(entry, ["id"]),
      ),
      packages: itemField("packages", packageLines(item), [
        "packageCount",
        "packageKind",
        "packageMarks",
        "additionalPackageDetails",
      ]),
      description: itemField("description", text(item.description), [
        "description",
      ]),
      commodity: itemField(
        "commodity",
        text(item.commodityCode, 10).slice(0, 8),
        ["commodityCode"],
      ),
      taric: itemField(
        "taric",
        text(item.commodityCode, 10).slice(8, 10),
        ["commodityCode"],
      ),
      euCodes: itemField(
        "euCodes",
        join([item.taricCode, codeEntries(item.additionalTaricCodes)]),
        ["taricCode", "additionalTaricCodes"],
      ),
      nationalCodes: itemField(
        "nationalCodes",
        join([item.nationalCode, codeEntries(item.additionalNationalCodes)]),
        ["nationalCode", "additionalNationalCodes"],
      ),
      dangerousGoods: itemField(
        "dangerousGoods",
        text(item.dangerousGoodsCode),
        ["dangerousGoodsCode"],
      ),
      cusCode: itemField(
        "cusCode",
        text(item.cusCode),
        ["cusCode"],
      ),
      procedure: itemField("procedure", text(item.procedureCode), [
        "procedureCode",
      ]),
      additionalProcedures: itemField(
        "additionalProcedures",
        join([
          item.additionalProcedureCode,
          codeEntries(item.additionalProcedureCodes),
        ]),
        ["additionalProcedureCode", "additionalProcedureCodes"],
      ),
      countries: tracked(
        `${path}.countries`,
        join([
          draft.exportCountry,
          item.destinationCountry ?? draft.destinationCountry,
          item.nonPreferentialOrigin,
          item.preferentialOrigin,
        ]),
        [
          ...draftSource("exportCountry", "destinationCountry"),
          ...itemSources(entry, [
            "destinationCountry",
            "nonPreferentialOrigin",
            "preferentialOrigin",
          ]),
        ],
      ),
      dispatchCountry: tracked(
        `${path}.dispatchCountry`,
        text(draft.exportCountry),
        draftSource("exportCountry"),
      ),
      destinationCountry: tracked(
        `${path}.destinationCountry`,
        text(item.destinationCountry ?? draft.destinationCountry),
        [
          ...itemSources(entry, ["destinationCountry"]),
          ...draftSource("destinationCountry"),
        ],
      ),
      originCountry: itemField(
        "originCountry",
        text(item.nonPreferentialOrigin),
        ["nonPreferentialOrigin"],
      ),
      preferentialOrigin: itemField(
        "preferentialOrigin",
        text(item.preferentialOrigin),
        ["preferentialOrigin"],
      ),
      reference: itemField("reference", text(item.ucr), ["ucr"]),
      previousDocuments: itemField(
        "previousDocuments",
        previousDocumentLines(item),
        [
          "previousDocumentCategory",
          "previousDocumentType",
          "previousDocumentReference",
          "additionalPreviousDocuments",
        ],
      ),
      grossMass: itemField("grossMass", text(item.grossMass), ["grossMass"]),
      netMass: itemField("netMass", text(item.netMass), ["netMass"]),
      supplementaryUnits: itemField(
        "supplementaryUnits",
        text(item.tariffQuantity),
        ["tariffQuantity"],
      ),
      statisticalValue: itemField(
        "statisticalValue",
        text(item.statisticalValue),
        ["statisticalValue"],
      ),
      itemPrice: tracked(
        `${path}.itemPrice`,
        join([item.currency ?? draft.currency, item.itemPrice], " "),
        [
          ...itemSources(entry, ["currency", "itemPrice"]),
          ...draftSource("currency"),
        ],
      ),
      valuationMethod: itemField(
        "valuationMethod",
        text(item.customsValuationMethod),
        ["customsValuationMethod"],
      ),
      preference: itemField(
        "preference",
        text(item.preferenceCode),
        ["preferenceCode"],
      ),
      freightPaymentMethod: tracked(
        `${path}.freightPaymentMethod`,
        text(item.freightPaymentMethod || draft.freightPaymentMethod),
        [
          ...itemSources(entry, ["freightPaymentMethod"]),
          ...draftSource("freightPaymentMethod"),
        ],
      ),
      transactionNature: tracked(
        `${path}.transactionNature`,
        text(item.transactionNature || draft.transactionNature),
        [
          ...itemSources(entry, ["transactionNature"]),
          ...draftSource("transactionNature"),
        ],
      ),
      documents: itemField("documents", documentLines(item), [
        "additionalDocumentCategory",
        "additionalDocumentType",
        "additionalDocumentId",
        "additionalDocumentName",
        "additionalDocuments",
      ]),
      additionalInformation: itemField(
        "additionalInformation",
        list(item.additionalInformationStatements).map((statement) =>
          text(statement.statementCode)
        ).filter(Boolean).join("\n"),
        ["additionalInformationStatements"],
      ),
      taxes: itemField(
        "taxes",
        list(item.dutyCalculations).map((calculation) =>
          join([
            calculation.taxType,
            calculation.baseQuantity,
            calculation.unitCode,
            calculation.declaredTax,
            calculation.paymentMethod,
          ])
        ).filter(Boolean).join("\n"),
        ["dutyCalculations"],
      ),
      adjustments: itemField(
        "adjustments",
        list(item.valuationAdjustments).map((adjustment) =>
          join([adjustment.code, adjustment.currency, adjustment.amount])
        ).filter(Boolean).join("\n"),
        ["valuationAdjustments"],
      ),
    };
  });

  const mrn = text(submission.ICUSS_MRN, 64).replace(/\s+/g, "").toUpperCase();
  if (!mrn) throw new Error("The accepted Customs submission has no MRN");
  const lifecycleStatus = text(submission.ICUSS_Status, 40);
  if (
    !["accepted", "released", "cleared"].includes(
      lifecycleStatus.toLowerCase(),
    )
  ) {
    throw new Error("The Customs submission is not accepted");
  }
  const providerStatus = text(
    submission.ICUSS_ProviderStatus ||
      declaration.CUST_iCustomsStatusSnapshot ||
      lifecycleStatus,
    40,
  );
  const providerStatusSource = submission.ICUSS_ProviderStatus
    ? submissionSource("ICUSS_ProviderStatus")
    : declaration.CUST_iCustomsStatusSnapshot
    ? declarationSource("CUST_iCustomsStatusSnapshot")
    : submissionSource("ICUSS_Status");
  const providerAcceptedAt = providerAcceptanceDateTime(
    submission.ICUSS_ResponsePayloadJSON,
  );
  const completedAt = providerAcceptedAt ||
    text(submission.ICUSS_CompletedAt, 80);
  const updatedAt = text(submission.ICUSS_UpdatedAt, 80);
  const exportConsignors = persistedItemRows.map((entry) =>
    entry.item.consignor
  ).map((value) => text(value)).filter(Boolean);
  const exportConsignorSources: ProvenanceEntry[] = persistedItemRows.flatMap((
    entry,
  ) => itemSources(entry, ["consignor"]));
  const exportConsignorContacts = exportConsignors.map(standalonePartyContact)
    .filter(Boolean);
  const exportConsignorIdentifiers = exportConsignors.map(partyIdentifier)
    .filter(Boolean);
  const notSupplied = "Not supplied on declaration";
  if (!isImport && hasAcceptedSnapshot) {
    const missingConsignorItems = persistedItemRows
      .filter((entry) => !text(entry.item.consignor))
      .map((entry) => entry.number);
    if (!text(draft.carrier) || missingConsignorItems.length) {
      const missing = [
        ...(!text(draft.carrier) ? ["carrier"] : []),
        ...missingConsignorItems.map((number) =>
          `goods item ${number} consignor`
        ),
      ];
      throw new Error(
        `The accepted export snapshot is missing required party data: ${
          missing.join(", ")
        }`,
      );
    }
  }

  const dataset: CustomsDeclarationDocumentDataset = {
    direction: tracked("direction", direction, directionSource),
    environment: tracked(
      "environment",
      providerEnvironment,
      submissionSource("ICUSS_ApiConnectionID"),
    ),
    documentMode: tracked(
      "documentMode",
      providerEnvironment === "production" && hasAcceptedSnapshot
        ? "official"
        : "verification",
      submissionSource(
        "ICUSS_ApiConnectionID",
        "ICUSS_DeclarationSnapshotJSON.schemaVersion",
      ),
    ),
    mrnDisplay: tracked(
      "mrnDisplay",
      displayMrn(mrn),
      submissionSource("ICUSS_MRN"),
    ),
    declarationCode: tracked(
      "declarationCode",
      join([isImport ? "IM" : "EX", draft.declarationType], " "),
      [...directionSource, ...draftSource("declarationType")],
    ),
    formNumber: tracked(
      "formNumber",
      1,
      persistedItemRows.length
        ? itemSources(persistedItemRows[0], ["id"])
        : draftSource("items"),
    ),
    formCount: tracked(
      "formCount",
      1,
      persistedItemRows.length
        ? itemSources(persistedItemRows[0], ["id"])
        : draftSource("items"),
    ),
    itemCount: tracked(
      "itemCount",
      items.length,
      persistedItemRows.length
        ? persistedItemRows.flatMap((entry) => itemSources(entry, ["id"]))
        : draftSource("items"),
    ),
    auditSpacerHeight: tracked(
      "auditSpacerHeight",
      Math.max(
        0,
        (isImport ? 138 : 217) -
          Math.max(0, items.length - 1) * (isImport ? 228 : 217) -
          (text(draft.headerAdditionalInformationCode) ||
              text(draft.headerAdditionalInformationDescription)
            ? 11
            : 0),
      ),
      persistedItemRows.length
        ? persistedItemRows.flatMap((entry) => itemSources(entry, ["id"]))
        : draftSource("items"),
    ),
    totalPackages: tracked(
      "totalPackages",
      text(draft.totalPackages),
      draftSource("totalPackages"),
    ),
    reference: tracked(
      "reference",
      text(draft.traderReference) ||
        text(declaration.CUST_LocalReferenceNumber),
      [
        ...draftSource("traderReference"),
        ...localReferenceSource,
      ],
    ),
    parties: {
      exporter: tracked(
        "parties.exporter",
        partyContact(draft, "exporter"),
        draftSource(...partyFields("exporter")),
      ),
      exporterId: tracked(
        "parties.exporterId",
        partyIdentifier(draft.exporter),
        draftSource("exporter"),
      ),
      secondaryOne: tracked(
        "parties.secondaryOne",
        isImport
          ? standalonePartyContact(draft.seller)
          : uniqueLines(exportConsignorContacts) || notSupplied,
        isImport
          ? draftSource("seller")
          : exportConsignorSources.length
          ? exportConsignorSources
          : draftSource("items"),
      ),
      secondaryOneId: tracked(
        "parties.secondaryOneId",
        isImport
          ? partyIdentifier(draft.seller)
          : uniqueLines(exportConsignorIdentifiers),
        isImport
          ? draftSource("seller")
          : exportConsignorSources.length
          ? exportConsignorSources
          : draftSource("items"),
      ),
      primaryTwo: tracked(
        "parties.primaryTwo",
        isImport
          ? partyContact(draft, "importer")
          : partyContact(draft, "consignee"),
        draftSource(...partyFields(isImport ? "importer" : "consignee")),
      ),
      primaryTwoId: tracked(
        "parties.primaryTwoId",
        partyIdentifier(isImport ? draft.importer : draft.consignee),
        draftSource(isImport ? "importer" : "consignee"),
      ),
      secondaryTwo: tracked(
        "parties.secondaryTwo",
        standalonePartyContact(isImport ? draft.buyer : draft.carrier) ||
          (isImport ? "" : notSupplied),
        draftSource(isImport ? "buyer" : "carrier"),
      ),
      secondaryTwoId: tracked(
        "parties.secondaryTwoId",
        partyIdentifier(isImport ? draft.buyer : draft.carrier),
        draftSource(isImport ? "buyer" : "carrier"),
      ),
      declarant: tracked(
        "parties.declarant",
        partyContact(draft, "declarant"),
        draftSource(...partyFields("declarant")),
      ),
      declarantId: tracked(
        "parties.declarantId",
        partyIdentifier(draft.declarant),
        draftSource("declarant"),
      ),
      representative: tracked(
        "parties.representative",
        standalonePartyContact(draft.representative),
        draftSource("representative"),
      ),
      representativeId: tracked(
        "parties.representativeId",
        partyIdentifier(draft.representative),
        draftSource("representative"),
      ),
    },
    dispatchCountry: tracked(
      "dispatchCountry",
      text(draft.exportCountry),
      draftSource("exportCountry"),
    ),
    destinationCountry: tracked(
      "destinationCountry",
      text(draft.destinationCountry),
      draftSource("destinationCountry"),
    ),
    representationType: tracked(
      "representationType",
      text(draft.representationType),
      draftSource("representationType"),
    ),
    movementTransport: tracked(
      "movementTransport",
      join([
        isImport
          ? draft.arrivalIdentificationType
          : draft.departureIdentificationType,
        isImport
          ? draft.arrivalIdentificationNumber
          : draft.departureIdentificationNumber,
      ]),
      draftSource(
        isImport ? "arrivalIdentificationType" : "departureIdentificationType",
        isImport
          ? "arrivalIdentificationNumber"
          : "departureIdentificationNumber",
      ),
    ),
    commercialTerm: tracked(
      "commercialTerm",
      text(isImport ? draft.tradeTerms : draft.routingCountry),
      draftSource(isImport ? "tradeTerms" : "routingCountry"),
    ),
    borderTransport: tracked(
      "borderTransport",
      join([
        draft.borderIdentificationType,
        draft.borderIdentificationNumber,
        draft.borderNationality,
      ]),
      draftSource(
        "borderIdentificationType",
        "borderIdentificationNumber",
        "borderNationality",
      ),
    ),
    containerised: tracked(
      "containerised",
      text(draft.isContainerised),
      draftSource("isContainerised"),
    ),
    invoiceTotal: tracked(
      "invoiceTotal",
      join([draft.totalAmount, draft.currency], " "),
      draftSource("totalAmount", "currency"),
    ),
    borderMode: tracked(
      "borderMode",
      text(draft.borderMode),
      draftSource("borderMode"),
    ),
    inlandMode: tracked(
      "inlandMode",
      text(draft.inlandMode),
      draftSource("inlandMode"),
    ),
    exchangeRate: tracked(
      "exchangeRate",
      text(draft.exchangeRate),
      draftSource("exchangeRate"),
    ),
    transactionNature: tracked(
      "transactionNature",
      text(draft.transactionNature),
      draftSource("transactionNature"),
    ),
    goodsLocation: tracked(
      "goodsLocation",
      join([
        draft.goodsLocationType,
        draft.goodsLocationName,
        draft.goodsLocationIdentifier,
      ]),
      draftSource(
        "goodsLocationType",
        "goodsLocationName",
        "goodsLocationIdentifier",
      ),
    ),
    totalGrossMass: tracked(
      "totalGrossMass",
      text(draft.totalGrossMass),
      draftSource("totalGrossMass"),
    ),
    containerNumbers: tracked(
      "containerNumbers",
      text(draft.containerId),
      draftSource("containerId"),
    ),
    previousDocuments: tracked(
      "previousDocuments",
      join([
        draft.previousDocumentCategory,
        draft.previousDocumentType,
        draft.previousDocumentReference,
      ]),
      draftSource(
        "previousDocumentCategory",
        "previousDocumentType",
        "previousDocumentReference",
      ),
    ),
    auxiliary: tracked(
      "auxiliary",
      text(
        isImport
          ? join([draft.freightChargeAmount, draft.freightChargeCurrency])
          : draft.sealIdentifier,
      ),
      draftSource(
        ...(isImport
          ? ["freightChargeAmount", "freightChargeCurrency"]
          : ["sealIdentifier"]),
      ),
    ),
    authorisations: tracked(
      "authorisations",
      join([draft.authorisationCategory, draft.authorisationIdentifier]),
      draftSource("authorisationCategory", "authorisationIdentifier"),
    ),
    headerAdditionalInformation: tracked(
      "headerAdditionalInformation",
      join([
        draft.headerAdditionalInformationCode,
        draft.headerAdditionalInformationDescription,
      ]),
      draftSource(
        "headerAdditionalInformationCode",
        "headerAdditionalInformationDescription",
      ),
    ),
    fiscalReferences: tracked("fiscalReferences", "", draftSource("items")),
    supplyChainActors: tracked("supplyChainActors", "", draftSource("items")),
    items,
    status: {
      acceptedAt: tracked(
        "status.acceptedAt",
        completedAt,
        submissionSource(
          "ICUSS_ResponsePayloadJSON.AcceptanceDateTime",
          "ICUSS_CompletedAt",
        ),
      ),
      label: tracked(
        "status.label",
        titleCase(providerStatus),
        providerStatusSource,
      ),
      updatedAt: tracked(
        "status.updatedAt",
        updatedAt,
        submissionSource("ICUSS_UpdatedAt"),
      ),
      summary: tracked(
        "status.summary",
        isImport
          ? items.map((item) => text(item.taxes)).filter(Boolean).join("\n")
          : "",
        persistedItemRows.length
          ? persistedItemRows.flatMap((entry) =>
            itemSources(entry, ["dutyCalculations"])
          )
          : draftSource("items"),
      ),
      placeAndDate: tracked(
        "status.placeAndDate",
        completedAt,
        submissionSource(
          "ICUSS_ResponsePayloadJSON.AcceptanceDateTime",
          "ICUSS_CompletedAt",
        ),
      ),
      signatory: tracked(
        "status.signatory",
        text(draft.declarantName || draft.declarant || draft.representative),
        draftSource("declarantName", "declarant", "representative"),
      ),
    },
    lrn: tracked(
      "lrn",
      text(submission.ICUSS_LRN),
      submissionSource("ICUSS_LRN"),
    ),
    exitOffice: tracked(
      "exitOffice",
      text(draft.exitOffice),
      draftSource("exitOffice"),
    ),
    presentationOffice: tracked(
      "presentationOffice",
      text(draft.presentationOffice),
      draftSource("presentationOffice"),
    ),
    supervisingOffice: tracked(
      "supervisingOffice",
      text(draft.supervisingOffice),
      draftSource("supervisingOffice"),
    ),
    deferredOrCircumstance: tracked(
      "deferredOrCircumstance",
      text(isImport ? draft.primaryDefermentAccount : ""),
      draftSource(isImport ? "primaryDefermentAccount" : "declarationType"),
    ),
    guarantee: tracked(
      "guarantee",
      join([
        draft.guaranteeType,
        draft.guaranteeReference,
        draft.guaranteeCurrency,
        draft.guaranteeAmount,
        draft.guaranteeOffice,
      ]),
      draftSource(
        "guaranteeType",
        "guaranteeReference",
        "guaranteeCurrency",
        "guaranteeAmount",
        "guaranteeOffice",
      ),
    ),
    warehouse: tracked(
      "warehouse",
      join([draft.warehouseType, draft.warehouseIdentifier]),
      draftSource("warehouseType", "warehouseIdentifier"),
    ),
    currency: tracked(
      "currency",
      text(draft.currency),
      draftSource("currency"),
    ),
  };

  validateCustomsDocumentProvenance(dataset, provenance);
  return {
    dataset,
    provenance,
    usesAcceptedSnapshot: hasAcceptedSnapshot,
    providerStatus,
  };
}
