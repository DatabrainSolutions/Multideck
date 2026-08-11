export type ICustomsEnvironment = "sandbox" | "production";

export type ICustomsConfig = {
  baseUrl: string;
  environment: ICustomsEnvironment;
  apiKey: string;
  apiSecret: string;
};

export type ICustomsResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type ICustomsPublicIssue = {
  code: string;
  message: string;
  explanation: string | null;
  dataElement: string | null;
  elementName: string | null;
  itemNumber: number | null;
};

type Json = Record<string, unknown>;

export type ExportDeclarationItemInput = {
  commodityCode?: unknown;
  description?: unknown;
  dangerousGoodsCode?: unknown;
  taricCode?: unknown;
  nationalCode?: unknown;
  cusCode?: unknown;
  packageKind?: unknown;
  packageMarks?: unknown;
  packageCount?: unknown;
  transactionNature?: unknown;
  nonPreferentialOrigin?: unknown;
  procedureCode?: unknown;
  additionalProcedureCode?: unknown;
  tariffQuantity?: unknown;
  grossMass?: unknown;
  netMass?: unknown;
  itemPrice?: unknown;
  currency?: unknown;
  statisticalValue?: unknown;
  previousDocumentCategory?: unknown;
  previousDocumentType?: unknown;
  previousDocumentReference?: unknown;
  additionalDocumentCategory?: unknown;
  additionalDocumentType?: unknown;
  additionalDocumentId?: unknown;
  additionalDocumentName?: unknown;
  lpcoExemptionCode?: unknown;
  consignee?: unknown;
  destinationCountry?: unknown;
  ucr?: unknown;
  containerId?: unknown;
  customsValuationMethod?: unknown;
  preferenceCode?: unknown;
};

export type ExportDeclarationInput = {
  declarationCategory?: unknown;
  declarationType?: unknown;
  traderReference?: unknown;
  totalAmount?: unknown;
  currency?: unknown;
  totalPackages?: unknown;
  totalGrossMass?: unknown;
  totalNetMass?: unknown;
  exporter?: unknown;
  exporterName?: unknown;
  exporterAddressLine?: unknown;
  exporterCity?: unknown;
  exporterPostcode?: unknown;
  exporterCountry?: unknown;
  importer?: unknown;
  importerName?: unknown;
  importerAddressLine?: unknown;
  importerCity?: unknown;
  importerPostcode?: unknown;
  importerCountry?: unknown;
  seller?: unknown;
  buyer?: unknown;
  consignee?: unknown;
  consigneeName?: unknown;
  consigneeAddressLine?: unknown;
  consigneeCity?: unknown;
  consigneePostcode?: unknown;
  consigneeCountry?: unknown;
  declarant?: unknown;
  declarantName?: unknown;
  declarantAddressLine?: unknown;
  declarantCity?: unknown;
  declarantPostcode?: unknown;
  declarantCountry?: unknown;
  representative?: unknown;
  representationType?: unknown;
  authorisationIdentifier?: unknown;
  authorisationCategory?: unknown;
  exportCountry?: unknown;
  destinationCountry?: unknown;
  borderNationality?: unknown;
  inlandMode?: unknown;
  borderIdentificationNumber?: unknown;
  borderIdentificationType?: unknown;
  borderMode?: unknown;
  departureIdentificationNumber?: unknown;
  departureIdentificationType?: unknown;
  arrivalIdentificationNumber?: unknown;
  arrivalIdentificationType?: unknown;
  goodsLocationType?: unknown;
  goodsLocationName?: unknown;
  goodsLocationIdentifier?: unknown;
  freightPaymentMethod?: unknown;
  isContainerised?: unknown;
  containerId?: unknown;
  sealIdentifier?: unknown;
  routingCountry?: unknown;
  previousDocumentCategory?: unknown;
  previousDocumentType?: unknown;
  previousDocumentReference?: unknown;
  transactionNature?: unknown;
  exchangeRate?: unknown;
  tradeTerms?: unknown;
  customsValuationMethod?: unknown;
  primaryDefermentAccount?: unknown;
  secondaryDefermentAccount?: unknown;
  freightChargeAmount?: unknown;
  freightChargeCurrency?: unknown;
  exitOffice?: unknown;
  supervisingOffice?: unknown;
  presentationOffice?: unknown;
  warehouseType?: unknown;
  warehouseIdentifier?: unknown;
  items?: unknown;
};

export class ICustomsProviderError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "icustoms_provider_error",
    public responseBody: unknown = null,
  ) {
    super(message);
  }
}

function clean(value: unknown, maximum = 280) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function upper(value: unknown, maximum = 40) {
  return clean(value, maximum).toUpperCase();
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roughlyEqual(left: number, right: number, tolerance = 0.005) {
  return Math.abs(left - right) <=
    Math.max(tolerance, Math.abs(left) * 0.00001);
}

function itemInputs(value: unknown): ExportDeclarationItemInput[] {
  return Array.isArray(value)
    ? value.filter((item): item is ExportDeclarationItemInput =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    ).slice(0, 9999)
    : [];
}

function contactMissing(
  input: ExportDeclarationInput,
  prefix: "importer" | "exporter" | "consignee" | "declarant",
) {
  const values = [
    ["Name", input[`${prefix}Name`]],
    ["Street", input[`${prefix}AddressLine`]],
    ["City", input[`${prefix}City`]],
    ["Postcode", input[`${prefix}Postcode`]],
    ["Country", input[`${prefix}Country`]],
  ] as const;
  return values.flatMap(([label, value]) =>
    clean(value, 80) &&
      (label !== "Country" || /^[A-Z]{2}$/.test(upper(value, 2)))
      ? []
      : [label]
  );
}

export function validateICustomsDeclaration(
  input: ExportDeclarationInput,
  direction: "export" | "import" = "export",
) {
  const issues: string[] = [];
  const category = upper(input.declarationCategory, 3);
  const typeCode = upper(input.declarationType, 2);
  const currency = upper(input.currency, 3);
  const totalAmount = positiveNumber(input.totalAmount);
  const totalPackages = positiveNumber(input.totalPackages);
  const totalGrossMass = positiveNumber(input.totalGrossMass);
  const totalNetMass = positiveNumber(input.totalNetMass);
  const items = itemInputs(input.items);

  if (category !== (direction === "import" ? "H1" : "B1")) {
    issues.push(
      direction === "import"
        ? "Only an H1 standard import declaration can be sent through this connected customs path."
        : "Only a B1 standard export declaration can be sent through this connected customs path.",
    );
  }
  if (!/^[A-Z]$/.test(typeCode)) {
    issues.push("Choose a one-letter CDS declaration type.");
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push("Choose a valid three-letter declaration currency.");
  }
  const traderReference = clean(input.traderReference, 80);
  if (!traderReference) {
    issues.push("Add a trader reference number.");
  } else if (!/^[A-Z0-9]{1,19}$/.test(traderReference)) {
    issues.push(
      "Use up to 19 uppercase letters and numbers for the trader reference.",
    );
  }
  if (!totalAmount) {
    issues.push("Enter a declaration amount greater than zero.");
  }
  if (!totalPackages || !Number.isInteger(totalPackages)) {
    issues.push("Enter a whole total package count greater than zero.");
  }
  if (!totalGrossMass) {
    issues.push("Enter a total gross mass greater than zero.");
  }
  if (direction === "export" && !totalNetMass) {
    issues.push("Enter a total net mass greater than zero.");
  }
  if (
    direction === "export" && totalGrossMass && totalNetMass &&
    totalNetMass > totalGrossMass
  ) {
    issues.push("Total net mass cannot exceed total gross mass.");
  }
  if (!clean(input.exporter, 70)) issues.push("Add the exporter name or EORI.");
  if (direction === "import" && !clean(input.importer, 70)) {
    issues.push("Add the importer name or EORI.");
  }
  if (direction === "export" && !clean(input.consignee, 70)) {
    issues.push("Add the consignee name or identifier.");
  }
  const exporterContactMissing = contactMissing(input, "exporter");
  if (exporterContactMissing.length) {
    issues.push(
      `This contact is missing: ${exporterContactMissing.join(", ")}.`,
    );
  }
  const importerContactMissing = contactMissing(input, "importer");
  if (direction === "import" && importerContactMissing.length) {
    issues.push(
      `This contact is missing: ${importerContactMissing.join(", ")}.`,
    );
  }
  const consigneeContactMissing = contactMissing(input, "consignee");
  if (direction === "export" && consigneeContactMissing.length) {
    issues.push(
      `This contact is missing: ${consigneeContactMissing.join(", ")}.`,
    );
  }
  const declarantContactMissing = contactMissing(input, "declarant");
  if (declarantContactMissing.length) {
    issues.push(
      `This contact is missing: ${declarantContactMissing.join(", ")}.`,
    );
  }
  if (!/^[A-Z0-9]{3,17}$/.test(upper(input.declarant, 17))) {
    issues.push(
      "Add the declarant EORI or customs identifier (3 to 17 letters and numbers).",
    );
  }
  if (!/^[A-Z]{2}$/.test(upper(input.exportCountry, 2))) {
    issues.push("Choose a valid export country.");
  }
  if (!/^[A-Z]{2}$/.test(upper(input.destinationCountry, 2))) {
    issues.push("Choose a valid destination country.");
  }
  if (!/^\d$/.test(clean(input.borderMode, 1))) {
    issues.push("Choose the one-digit transport mode at the border.");
  }
  if (
    direction === "export" &&
    !/^[A-Z0-9]{8}$/.test(upper(input.exitOffice, 8))
  ) {
    issues.push("Add the eight-character customs office of exit.");
  }
  if (
    !clean(input.goodsLocationName, 35) &&
    !clean(input.goodsLocationIdentifier, 35)
  ) issues.push("Add the goods location name or identifier.");
  if (!/^[A-Z]$/.test(upper(input.goodsLocationType, 1))) {
    issues.push("Choose the one-letter goods location type.");
  }
  if (!/^\d{1,2}$/.test(clean(input.transactionNature, 2))) {
    issues.push("Choose the nature of transaction.");
  }
  if (direction === "import") {
    if (!/^[23]$/.test(clean(input.representationType, 1))) {
      issues.push("Choose direct or indirect representation.");
    }
    if (!/^[A-Z]{3}$/.test(upper(input.tradeTerms, 3))) {
      issues.push("Add the three-letter trade terms.");
    }
    if (!clean(input.goodsLocationIdentifier, 35)) {
      issues.push(
        "Add the goods location identifier used for the trade terms.",
      );
    }
    const authorisationIdentifier = clean(input.authorisationIdentifier, 35);
    const authorisationCategory = upper(input.authorisationCategory, 3);
    if (authorisationIdentifier || authorisationCategory) {
      if (
        !authorisationIdentifier ||
        !/^[A-Z0-9]{1,3}$/.test(authorisationCategory)
      ) {
        issues.push("Complete both the authorisation identifier and category.");
      }
    }
  } else {
    if (!/^[XYZ]$/.test(upper(input.previousDocumentCategory, 1))) {
      issues.push("Choose a previous document category.");
    }
    if (!/^[A-Z0-9]{1,3}$/.test(upper(input.previousDocumentType, 3))) {
      issues.push("Choose a previous document type.");
    }
    const previousDocumentReference = clean(
      input.previousDocumentReference,
      80,
    );
    if (!previousDocumentReference) {
      issues.push("Add the previous document reference.");
    } else if (!/^[A-Za-z0-9]{1,35}$/.test(previousDocumentReference)) {
      issues.push(
        "Use up to 35 letters and numbers for the previous document reference.",
      );
    }
  }
  if (!items.length) issues.push("Add at least one goods item.");

  let packageSum = 0;
  let grossMassSum = 0;
  let netMassSum = 0;
  let invoiceSum = 0;

  items.forEach((item, index) => {
    const line = `Item ${index + 1}`;
    const commodityCode = upper(item.commodityCode, 10);
    const packageCount = positiveNumber(item.packageCount);
    const grossMass = positiveNumber(item.grossMass);
    const netMass = positiveNumber(item.netMass);
    const itemPrice = positiveNumber(item.itemPrice);
    const statisticalValue = positiveNumber(item.statisticalValue);
    const itemCurrency = upper(item.currency, 3);
    const procedureCode = upper(item.procedureCode, 4);
    const additionalProcedureCode = upper(item.additionalProcedureCode, 3);

    if (!/^\d{10}$/.test(commodityCode)) {
      issues.push(`${line}: enter a 10-digit commodity code.`);
    }
    if (!clean(item.description, 280)) {
      issues.push(`${line}: add a goods description.`);
    }
    if (!/^[A-Z0-9]{1,2}$/.test(upper(item.packageKind, 2))) {
      issues.push(`${line}: choose a package kind.`);
    }
    if (!clean(item.packageMarks, 42)) {
      issues.push(`${line}: add package marks.`);
    }
    if (!packageCount || !Number.isInteger(packageCount)) {
      issues.push(`${line}: enter a whole package count greater than zero.`);
    }
    if (!/^[A-Z]{2}$/.test(upper(item.nonPreferentialOrigin, 2))) {
      issues.push(`${line}: choose a non-preferential origin country.`);
    }
    if (!/^[A-Z0-9]{4}$/.test(procedureCode)) {
      issues.push(`${line}: choose a four-character procedure code.`);
    }
    if (!/^[A-Z0-9]{3}$/.test(additionalProcedureCode)) {
      issues.push(
        `${line}: choose a three-character additional procedure code.`,
      );
    }
    if (!grossMass) {
      issues.push(`${line}: enter a gross mass greater than zero.`);
    }
    if (!netMass) issues.push(`${line}: enter a net mass greater than zero.`);
    if (grossMass && netMass && netMass > grossMass) {
      issues.push(`${line}: net mass cannot exceed gross mass.`);
    }
    if (!itemPrice) {
      issues.push(`${line}: enter an item price greater than zero.`);
    }
    if (!statisticalValue) {
      issues.push(`${line}: enter a statistical value greater than zero.`);
    }
    if (itemCurrency !== currency) {
      issues.push(
        `${line}: use the declaration currency ${
          currency || "selected above"
        } for this connected declaration path.`,
      );
    }
    if (
      direction === "import" &&
      !/^[XYZ]$/.test(upper(item.previousDocumentCategory, 1))
    ) {
      issues.push(`${line}: choose a previous document category.`);
    }
    if (!/^[A-Z0-9]{1,3}$/.test(upper(item.previousDocumentType, 3))) {
      issues.push(`${line}: choose a previous document type.`);
    }
    const itemPreviousDocumentReference = clean(
      item.previousDocumentReference,
      80,
    );
    if (!itemPreviousDocumentReference) {
      issues.push(`${line}: add a previous document reference.`);
    } else if (!/^[A-Za-z0-9]{1,35}$/.test(itemPreviousDocumentReference)) {
      issues.push(
        `${line}: use up to 35 letters and numbers for the previous document reference.`,
      );
    }
    if (
      direction === "export" && (
        clean(item.additionalDocumentCategory, 1) ||
        clean(item.additionalDocumentType, 3) ||
        clean(item.additionalDocumentId, 70) ||
        clean(item.additionalDocumentName, 70) ||
        clean(item.lpcoExemptionCode, 2)
      )
    ) {
      issues.push(
        `${line}: optional additional documents are not supported by this connected declaration flow yet.`,
      );
    }
    if (direction === "import") {
      if (!/^\d$/.test(clean(item.customsValuationMethod, 1))) {
        issues.push(`${line}: add the one-digit customs valuation method.`);
      }
      if (!/^\d{3}$/.test(clean(item.preferenceCode, 3))) {
        issues.push(`${line}: add the three-digit preference code.`);
      }
      const hasAdditionalDocument = Boolean(
        clean(item.additionalDocumentCategory, 1) ||
          clean(item.additionalDocumentType, 3) ||
          clean(item.additionalDocumentId, 70) ||
          clean(item.additionalDocumentName, 70) ||
          clean(item.lpcoExemptionCode, 2),
      );
      if (
        hasAdditionalDocument && (
          !/^[A-Z0-9]$/.test(upper(item.additionalDocumentCategory, 1)) ||
          !/^[A-Z0-9]{1,3}$/.test(upper(item.additionalDocumentType, 3)) ||
          !clean(item.additionalDocumentId, 70)
        )
      ) {
        issues.push(
          `${line}: complete the additional document category, type and ID.`,
        );
      }
    }

    packageSum += packageCount ?? 0;
    grossMassSum += grossMass ?? 0;
    netMassSum += netMass ?? 0;
    invoiceSum += itemPrice ?? 0;
  });

  if (totalPackages && packageSum && totalPackages !== packageSum) {
    issues.push(
      `The declaration package total (${totalPackages}) must match the goods-line total (${packageSum}).`,
    );
  }
  if (
    totalGrossMass && grossMassSum &&
    !roughlyEqual(totalGrossMass, grossMassSum)
  ) {
    issues.push(
      `The declaration gross mass (${totalGrossMass}) must match the goods-line total (${grossMassSum}).`,
    );
  }
  if (
    direction === "export" && totalNetMass && netMassSum &&
    !roughlyEqual(totalNetMass, netMassSum)
  ) {
    issues.push(
      `The declaration net mass (${totalNetMass}) must match the goods-line total (${netMassSum}).`,
    );
  }
  if (
    totalAmount && invoiceSum && !roughlyEqual(totalAmount, invoiceSum, 0.01)
  ) {
    issues.push(
      `The declaration amount (${totalAmount}) must match the goods-line total (${invoiceSum}).`,
    );
  }

  return issues;
}

export function validateICustomsB1Export(input: ExportDeclarationInput) {
  return validateICustomsDeclaration(input, "export");
}

export function validateICustomsH1Import(input: ExportDeclarationInput) {
  return validateICustomsDeclaration(input, "import");
}

export function escapeXml(value: unknown) {
  return clean(value, 4000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function element(
  name: string,
  value: unknown,
  attributes: Record<string, unknown> = {},
) {
  const resolved = clean(value, 4000);
  if (!resolved) return "";
  const attrs = Object.entries(attributes)
    .filter(([, entry]) => clean(entry, 100))
    .map(([key, entry]) => ` ${key}="${escapeXml(entry)}"`)
    .join("");
  return `<${name}${attrs}>${escapeXml(resolved)}</${name}>`;
}

function group(name: string, children: string) {
  return children ? `<${name}>${children}</${name}>` : "";
}

function party(
  name:
    | "Importer"
    | "Exporter"
    | "Consignee"
    | "Declarant"
    | "Seller"
    | "Buyer",
  value: unknown,
  contact?: {
    name?: unknown;
    addressLine?: unknown;
    city?: unknown;
    postcode?: unknown;
    country?: unknown;
  },
) {
  const resolved = upper(value, 70);
  const identifier = /^[A-Z]{2}[A-Z0-9]{3,15}$/.test(resolved) ? resolved : "";
  return group(
    name,
    [
      element("Name", clean(contact?.name, 35) || (!identifier ? value : "")),
      element("ID", identifier),
      group(
        "Address",
        [
          element("CityName", contact?.city),
          element("CountryCode", upper(contact?.country, 2)),
          element("Line", contact?.addressLine),
          element("PostcodeID", contact?.postcode),
        ].join(""),
      ),
    ].join(""),
  );
}

function partyContact(
  input: ExportDeclarationInput,
  prefix: "importer" | "exporter" | "consignee" | "declarant",
) {
  return {
    name: input[`${prefix}Name`],
    addressLine: input[`${prefix}AddressLine`],
    city: input[`${prefix}City`],
    postcode: input[`${prefix}Postcode`],
    country: input[`${prefix}Country`],
  };
}

function decimal(value: unknown, maximumDecimals = 3) {
  const parsed = positiveNumber(value);
  if (!parsed) return "";
  const fixed = parsed.toFixed(maximumDecimals);
  if (maximumDecimals === 0) return fixed;
  return fixed.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function buildICustomsDeclarationXml(
  input: ExportDeclarationInput,
  direction: "export" | "import" = "export",
) {
  const issues = validateICustomsDeclaration(input, direction);
  if (issues.length) {
    throw new ICustomsProviderError(
      422,
      "The declaration is not ready for customs submission.",
      "icustoms_validation_failed",
      { issues },
    );
  }

  const currency = upper(input.currency, 3);
  const destinationCountry = upper(input.destinationCountry, 2);
  const isContainerised = clean(input.isContainerised, 1) === "1";
  const items = itemInputs(input.items);
  const goodsItems = items.map((item, index) => {
    const procedureCode = upper(item.procedureCode, 4);
    const itemDestination = upper(item.destinationCountry, 2) ||
      destinationCountry;
    const itemCurrency = upper(item.currency, 3);
    const classification = [
      element("CommodityCode", upper(item.commodityCode, 10)),
      element("CusCode", upper(item.cusCode, 8)),
      element("AdditionalTaricCode", upper(item.taricCode, 4)),
      element("AdditionalNationalCode", upper(item.nationalCode, 4)),
    ].join("");
    const commodity = group(
      "Commodity",
      [
        element("Description", item.description),
        group("Classification", classification),
        direction === "import"
          ? group(
            "Preferences",
            element("DutyRegimeCode", upper(item.preferenceCode, 3)),
          )
          : "",
        group(
          "GoodsMeasure",
          [
            element("GrossMassMeasure", decimal(item.grossMass), {
              unitCode: "KGM",
            }),
            element("NetNetWeightMeasure", decimal(item.netMass), {
              unitCode: "KGM",
            }),
            element("TariffQuantity", decimal(item.tariffQuantity, 6)),
          ].join(""),
        ),
        group(
          "InvoiceLine",
          element("ItemChargeAmount", decimal(item.itemPrice, 2), {
            currencyID: itemCurrency,
          }),
        ),
      ].join(""),
    );
    const itemConsignee = direction === "export"
      ? party(
        "Consignee",
        clean(item.consignee, 70) || input.consignee,
        partyContact(input, "consignee"),
      )
      : "";
    const additionalDocument = direction === "import"
      ? group(
        "AdditionalDocument",
        [
          element("CategoryCode", upper(item.additionalDocumentCategory, 1)),
          element("ID", item.additionalDocumentId),
          element("Name", item.additionalDocumentName),
          element("TypeCode", upper(item.additionalDocumentType, 3)),
          element("LPCOExemptionCode", upper(item.lpcoExemptionCode, 2)),
        ].join(""),
      )
      : "";
    const itemPreviousDocument = group(
      "PreviousDocument",
      [
        element(
          "CategoryCode",
          upper(item.previousDocumentCategory, 1) ||
            upper(input.previousDocumentCategory, 1),
        ),
        element("ID", item.previousDocumentReference),
        element("TypeCode", upper(item.previousDocumentType, 3)),
        element("LineNumeric", String(index + 1)),
      ].join(""),
    );

    return group(
      "GovernmentAgencyGoodsItem",
      [
        element("SequenceNumeric", String(index + 1)),
        element("StatisticalValueAmount", decimal(item.statisticalValue, 2), {
          currencyID: itemCurrency,
        }),
        direction === "import"
          ? element(
            "TransactionNatureCode",
            clean(item.transactionNature, 2) ||
              clean(input.transactionNature, 2),
          )
          : "",
        additionalDocument,
        commodity,
        direction === "import"
          ? group(
            "CustomsValuation",
            element(
              "MethodCode",
              clean(item.customsValuationMethod, 1) ||
                clean(input.customsValuationMethod, 1),
            ),
          )
          : "",
        itemConsignee,
        direction === "export"
          ? group("Destination", element("CountryCode", itemDestination))
          : "",
        group(
          "GovernmentProcedure",
          [
            element("CurrentCode", procedureCode.slice(0, 2)),
            element("PreviousCode", procedureCode.slice(2, 4)),
          ].join(""),
        ),
        group(
          "GovernmentAdditionalProcedure",
          element("CurrentCode", upper(item.additionalProcedureCode, 3)),
        ),
        group(
          "Origin",
          [
            element("CountryCode", upper(item.nonPreferentialOrigin, 2)),
            element("TypeCode", "2"),
          ].join(""),
        ),
        group(
          "Packaging",
          [
            element("SequenceNumeric", "1"),
            element("MarksNumbersID", item.packageMarks),
            element("QuantityQuantity", decimal(item.packageCount, 0)),
            element("TypeCode", upper(item.packageKind, 2)),
          ].join(""),
        ),
        direction === "export" ? itemPreviousDocument : "",
        direction === "import"
          ? group("ValuationAdjustment", element("AdditionCode", "0000"))
          : "",
      ].join(""),
    );
  }).join("");

  const importPreviousDocuments = direction === "import"
    ? items.map((item, index) =>
      group(
        "PreviousDocument",
        [
          element(
            "CategoryCode",
            upper(item.previousDocumentCategory, 1) ||
              upper(input.previousDocumentCategory, 1),
          ),
          element("ID", item.previousDocumentReference),
          element("TypeCode", upper(item.previousDocumentType, 3)),
          element("LineNumeric", String(index + 1)),
        ].join(""),
      )
    ).join("")
    : "";

  const transportEquipment = isContainerised
    ? group(
      "TransportEquipment",
      [
        element("SequenceNumeric", "1"),
        element("ID", input.containerId),
        clean(input.sealIdentifier, 20)
          ? group(
            "Seal",
            [
              element("SequenceNumeric", "1"),
              element("ID", input.sealIdentifier),
            ].join(""),
          )
          : "",
      ].join(""),
    )
    : "";
  const goodsLocation = group(
    "GoodsLocation",
    [
      element(
        "Name",
        clean(input.goodsLocationName, 35) || input.goodsLocationIdentifier,
      ),
      // For H1, the trade-terms location is sent separately below. iCustoms
      // interprets GoodsLocation.ID as the CDS additional identifier (DE 5/23),
      // which accepts only up to three digits rather than a UN/LOCODE.
      direction === "export"
        ? element("ID", input.goodsLocationIdentifier)
        : "",
      element("TypeCode", upper(input.goodsLocationType, 1)),
      group(
        "Address",
        [
          element("TypeCode", "U"),
          element(
            "CountryCode",
            upper(
              direction === "import"
                ? input.destinationCountry
                : input.exportCountry,
              2,
            ),
          ),
        ].join(""),
      ),
    ].join(""),
  );
  const consignment = group(
    "Consignment",
    [
      element("ContainerCode", isContainerised ? "1" : "0"),
      clean(
          direction === "import"
            ? input.arrivalIdentificationNumber
            : input.departureIdentificationNumber,
          27,
        )
        ? group(
          direction === "import"
            ? "ArrivalTransportMeans"
            : "DepartureTransportMeans",
          [
            element(
              "ID",
              direction === "import"
                ? input.arrivalIdentificationNumber
                : input.departureIdentificationNumber,
            ),
            element(
              "IdentificationTypeCode",
              clean(
                direction === "import"
                  ? input.arrivalIdentificationType
                  : input.departureIdentificationType,
                2,
              ),
            ),
          ].join(""),
        )
        : "",
      goodsLocation,
      transportEquipment,
    ].join(""),
  );
  const borderTransport = group(
    "BorderTransportMeans",
    [
      element("ID", input.borderIdentificationNumber),
      element(
        "IdentificationTypeCode",
        clean(input.borderIdentificationType, 2),
      ),
      element("RegistrationNationalityCode", upper(input.borderNationality, 2)),
      element("ModeCode", clean(input.borderMode, 1)),
    ].join(""),
  );
  const declaration = group(
    "Declaration",
    [
      direction === "export"
        ? element("TotalGrossMass", decimal(input.totalGrossMass))
        : "",
      element("DeclarationCategory", upper(input.declarationCategory, 3)),
      // iCustoms combines the direction (EX or IM) and the additional
      // declaration type (for example A) into one XML value.
      element(
        "TypeCode",
        `${direction === "import" ? "IM" : "EX"}${
          upper(input.declarationType, 1)
        }`,
      ),
      element("GoodsItemQuantity", String(items.length)),
      element("InvoiceAmount", decimal(input.totalAmount, 2), {
        currencyID: currency,
      }),
      element("TotalGrossMassMeasure", decimal(input.totalGrossMass)),
      element("TotalPackageQuantity", decimal(input.totalPackages, 0)),
      direction === "import"
        ? element("AgentFunctionCode", clean(input.representationType, 1))
        : "",
      direction === "import"
        ? group(
          "AuthorisationHolder",
          [
            element("ID", input.authorisationIdentifier),
            element("CategoryCode", upper(input.authorisationCategory, 3)),
          ].join(""),
        )
        : "",
      borderTransport,
      party(
        "Declarant",
        input.declarant,
        partyContact(input, "declarant"),
      ),
      direction === "export"
        ? group("ExitOffice", element("ID", upper(input.exitOffice, 8)))
        : "",
      party("Exporter", input.exporter, partyContact(input, "exporter")),
      group(
        "GoodsShipment",
        [
          direction === "export"
            ? element(
              "TransactionNatureCode",
              clean(input.transactionNature, 2),
            )
            : "",
          direction === "export"
            ? party(
              "Consignee",
              input.consignee,
              partyContact(input, "consignee"),
            )
            : "",
          consignment,
          group("Destination", element("CountryCode", destinationCountry)),
          group("ExportCountry", element("ID", upper(input.exportCountry, 2))),
          goodsItems,
          direction === "import"
            ? party(
              "Importer",
              input.importer,
              partyContact(input, "importer"),
            )
            : "",
          direction === "import" ? importPreviousDocuments : group(
            "PreviousDocument",
            [
              element("CategoryCode", upper(input.previousDocumentCategory, 1)),
              element("ID", input.previousDocumentReference),
              element("TypeCode", upper(input.previousDocumentType, 3)),
            ].join(""),
          ),
          direction === "import"
            ? group(
              "TradeTerms",
              [
                element("ConditionCode", upper(input.tradeTerms, 3)),
                element("LocationID", upper(input.goodsLocationIdentifier, 35)),
              ].join(""),
            )
            : "",
          group(
            "UCR",
            element(
              "TraderAssignedReferenceID",
              upper(input.traderReference, 19),
            ),
          ),
        ].join(""),
      ),
    ].join(""),
  );

  return `<iCustoms>${declaration}</iCustoms>`;
}

export function buildICustomsB1ExportXml(input: ExportDeclarationInput) {
  return buildICustomsDeclarationXml(input, "export");
}

export function buildICustomsH1ImportXml(input: ExportDeclarationInput) {
  return buildICustomsDeclarationXml(input, "import");
}

function allowedBaseUrl(value: string) {
  const normalized = value.replace(/\/+$/, "");
  if (
    !["https://ihub-tdr.customscloud.co", "https://ihub.customscloud.co"]
      .includes(normalized)
  ) {
    throw new ICustomsProviderError(
      503,
      "The configured customs service URL is not approved.",
      "icustoms_base_url_invalid",
    );
  }
  return normalized;
}

export function iCustomsDraftPath(correlationId: string | null | undefined) {
  const resolved = clean(correlationId, 160);
  return resolved
    ? `/api/cds/v1/update/${encodeURIComponent(resolved)}`
    : "/api/cds/v1/draft";
}

export function readICustomsConfig(): ICustomsConfig {
  const baseUrl = allowedBaseUrl(
    Deno.env.get("ICUSTOMS_BASE_URL")?.trim() ||
      "https://ihub-tdr.customscloud.co",
  );
  const apiKey = Deno.env.get("ICUSTOMS_API_KEY")?.trim() || "";
  const apiSecret = Deno.env.get("ICUSTOMS_API_SECRET")?.trim() || "";
  if (!apiKey || !apiSecret) {
    throw new ICustomsProviderError(
      503,
      "The customs submission service is not configured yet.",
      "icustoms_credentials_missing",
    );
  }
  return {
    baseUrl,
    environment: baseUrl.includes("-tdr.") ? "sandbox" : "production",
    apiKey,
    apiSecret,
  };
}

function safeHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  for (
    const name of ["content-type", "date", "x-request-id", "x-correlation-id"]
  ) {
    const value = headers.get(name);
    if (value) result[name] = value.slice(0, 500);
  }
  return result;
}

async function responseBody(response: Response) {
  const text = (await response.text()).slice(0, 100_000);
  if (!text) return {};
  if (
    response.headers.get("content-type")?.includes("json") ||
    /^[\[{]/.test(text.trim())
  ) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return { raw: text };
}

function providerMessage(body: unknown, fallback: string) {
  const neutral = (value: string) =>
    value.replace(/iCustoms/gi, "customs service");
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Json;
    return neutral(
      clean(record.detail, 500) || clean(record.message, 500) ||
        clean(record.error, 500) || fallback,
    );
  }
  return neutral(fallback);
}

export class ICustomsClient {
  private token: string | null = null;

  constructor(
    private config: ICustomsConfig,
    private transport: typeof fetch = fetch,
  ) {}

  private async authenticate() {
    const response = await this.transport(
      `${this.config.baseUrl}/api/auth/v1/access`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: this.config.apiKey,
          api_secret: this.config.apiSecret,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const parsed = await responseBody(response);
    const token = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? clean((parsed as Json).token, 12_000)
      : "";
    if (!response.ok || !token) {
      throw new ICustomsProviderError(
        response.status || 502,
        providerMessage(parsed, "Customs service authentication failed."),
        "icustoms_authentication_failed",
        parsed,
      );
    }
    this.token = token;
    return token;
  }

  async request(
    path: string,
    init: RequestInit = {},
    retryAuthentication = true,
  ): Promise<ICustomsResponse> {
    const token = this.token ?? await this.authenticate();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);
    const response = await this.transport(`${this.config.baseUrl}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(45_000),
    });
    if (response.status === 401 && retryAuthentication) {
      this.token = null;
      await this.authenticate();
      return this.request(path, init, false);
    }
    const parsed = await responseBody(response);
    const result = {
      ok: response.ok,
      status: response.status,
      headers: safeHeaders(response.headers),
      body: parsed,
    };
    if (!response.ok) {
      throw new ICustomsProviderError(
        response.status || 502,
        providerMessage(
          parsed,
          `iCustoms request failed (${response.status}).`,
        ),
        "icustoms_request_failed",
        parsed,
      );
    }
    return result;
  }

  createDraft(xml: string) {
    return this.saveDraft(null, xml);
  }

  updateDraft(correlationId: string, xml: string) {
    return this.saveDraft(correlationId, xml);
  }

  saveDraft(correlationId: string | null, xml: string) {
    return this.request(iCustomsDraftPath(correlationId), {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: xml,
    });
  }

  submit(correlationId: string) {
    return this.request(
      `/api/cds/v1/submit/${encodeURIComponent(correlationId)}`,
      { method: "POST" },
    );
  }

  notifications(correlationId: string) {
    return this.request(
      `/api/cds/v1/notification/${encodeURIComponent(correlationId)}`,
    );
  }
}

export function providerRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : {};
}

function providerRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Json =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    )
    : [];
}

/**
 * Reduces provider/HMRC notification payloads to the safe fields operators need.
 * Raw XML, provider record identifiers and conversation metadata stay server-side.
 */
export function providerIssues(value: unknown): ICustomsPublicIssue[] {
  const body = providerRecord(value);
  const notifications = [
    ...providerRecords(body.notification),
    ...providerRecords(body.notifications),
  ];
  const pointers = notifications.flatMap((notification) => {
    const direct = providerRecords(notification.pointers);
    if (direct.length) return direct;
    const header = providerRecords(notification.header_level_errors);
    const items = Object.values(providerRecord(notification.item_level_errors))
      .flatMap(providerRecords);
    return [...header, ...items];
  });
  const seen = new Set<string>();
  const issues: ICustomsPublicIssue[] = [];

  for (const pointer of pointers) {
    const code = upper(pointer.cds_error ?? pointer.code, 40);
    const message = clean(
      pointer.cds_error_description ?? pointer.message ?? pointer.description,
      700,
    );
    if (!code && !message) continue;
    const dataElement = clean(
      pointer.data_element_no ?? pointer.dataElement,
      20,
    ) || null;
    const elementName = clean(
      pointer.element_name ?? pointer.elementName,
      80,
    ) || null;
    const sequence = Number(
      pointer.sequence_numeric ?? pointer.sequenceNumeric ??
        pointer.item_number,
    );
    const itemNumber = Number.isInteger(sequence) && sequence > 0
      ? sequence
      : null;
    const key = [
      code,
      message,
      dataElement,
      elementName,
      itemNumber ?? "header",
    ]
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      code,
      message: message || "The customs service rejected this field.",
      explanation: clean(
        pointer.cds_error_description_explaination ??
          pointer.cds_error_description_explanation ??
          pointer.explanation,
        1400,
      ) || null,
      dataElement,
      elementName,
      itemNumber,
    });
    if (issues.length >= 100) break;
  }
  return issues;
}

export function providerCorrelationId(value: unknown) {
  const record = providerRecord(value);
  return clean(record.co_relation_id, 160) ||
    clean(record.correlation_id, 160) || clean(record.declaration_id, 160);
}

function allStrings(value: unknown, output: string[] = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) {
    value.forEach((entry) => allStrings(entry, output));
  } else if (value && typeof value === "object") {
    Object.values(value as Json).forEach((entry) => allStrings(entry, output));
  }
  return output;
}

export function inferICustomsStatus(value: unknown, fallback = "acknowledged") {
  const text = allStrings(value).join(" ").toLowerCase();
  for (
    const status of [
      "cancelled",
      "released",
      "cleared",
      "rejected",
      "accepted",
      "submitted",
      "acknowledged",
    ] as const
  ) {
    if (text.includes(status)) return status;
  }
  if (
    text.includes("error") || text.includes("failed") ||
    text.includes("invalid")
  ) return "error";
  return fallback;
}

export function providerReference(value: unknown, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const visit = (input: unknown): string => {
    if (Array.isArray(input)) {
      for (const entry of input) {
        const found = visit(entry);
        if (found) return found;
      }
      return "";
    }
    if (!input || typeof input !== "object") return "";
    for (const [key, entry] of Object.entries(input as Json)) {
      if (wanted.has(key.toLowerCase())) {
        const resolved = clean(entry, 160);
        if (resolved) return resolved;
      }
      const nested = visit(entry);
      if (nested) return nested;
    }
    return "";
  };
  return visit(value);
}
