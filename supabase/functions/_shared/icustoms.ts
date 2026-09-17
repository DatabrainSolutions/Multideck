import { customsInvoiceErrors, customsInvoiceProjectionErrors, resolveCustomsInvoiceDeclaration } from "./customs-invoices.mts";
import { ducrFormatError } from "./customs-ducr.mts";
import { commodityQuotas, type CommodityQuota } from "./customs-commodity-quotas.mts";
import { quotaClaimIssues } from "./customs-quota-claim.mts";
import { adjustmentUsesMass, importAdjustmentErrors, importAdjustmentsForDraft, isCustomsTradeTerm, isFreightAdjustment, isPercentageAdjustment } from "./customs-import-terms.mts";
import { importDetailsErrors, importFiscalParties } from "./customs-import-details.mts";
import { obsoleteImportVatStatementIssue } from "./customs-tax-submission-validation.mts";
import { niPreferenceCodes } from "./customs-ni-preference-codes.mts";
import { processingReleaseFilingIssues } from "./customs-processing-filing.mts";
import { guaranteeErrors, guaranteesForDraft, hasGuaranteeValues } from "./customs-guarantees.mts";

import { importDefermentIssues } from "./customs-importer-profile.ts";
import { additionalCustomsPartyIssues } from "./customs-parties.mts";

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

export type ICustomsCommoditySuggestion = {
  code: string;
  description: string;
  confidence: number | null;
};

export type ICustomsCommodityCertificate = {
  code: string;
  category: string;
  type: string;
  description: string;
  guidance: string;
  statement: string | null;
  referenceRequired: boolean;
  action: string | null;
};

export type ICustomsCommodityDetail = {
  quotas: CommodityQuota[];
  code: string;
  description: string;
  declarable: boolean;
  validFrom: string | null;
  validTo: string | null;
  dutyRate: string | null;
  vatOptions: Array<{ code: string; label: string; rate: string | null }>;
  certificates: ICustomsCommodityCertificate[];
};

type Json = Record<string, unknown>;

export type ExportDeclarationItemInput = {
  commodityCode?: unknown;
  description?: unknown;
  dangerousGoodsCode?: unknown;
  taricCode?: unknown;
  additionalTaricCodes?: unknown;
  nationalCode?: unknown;
  additionalNationalCodes?: unknown;
  cusCode?: unknown;
  packageKind?: unknown;
  packageMarks?: unknown;
  packageCount?: unknown;
  additionalPackageDetails?: unknown;
  transactionNature?: unknown;
  nonPreferentialOrigin?: unknown;
  procedureCode?: unknown;
  additionalProcedureCode?: unknown;
  additionalProcedureCodes?: unknown;
  tariffQuantity?: unknown;
  grossMass?: unknown;
  netMass?: unknown;
  itemPrice?: unknown;
  currency?: unknown;
  statisticalValue?: unknown;
  previousDocumentCategory?: unknown;
  previousDocumentType?: unknown;
  previousDocumentReference?: unknown;
  additionalPreviousDocuments?: unknown;
  additionalDocumentCategory?: unknown;
  additionalDocumentType?: unknown;
  additionalDocumentId?: unknown;
  additionalDocumentName?: unknown;
  lpcoExemptionCode?: unknown;
  additionalDocumentWriteOff?: unknown;
  additionalDocumentValidityDate?: unknown;
  additionalDocuments?: unknown;
  additionalInformationStatements?: unknown;
  dutyCalculations?: unknown;
  valuationAdjustments?: unknown;
  itemExporters?: unknown;
  itemSellers?: unknown;
  itemBuyers?: unknown;
  domesticDutyTaxParties?: unknown;
  mutualRecognitionParties?: unknown;
  consignee?: unknown;
  consignor?: unknown;
  destinationCountry?: unknown;
  ucr?: unknown;
  containerId?: unknown;
  customsValuationMethod?: unknown;
  preferenceCode?: unknown;
  quotaOrderNumber?: unknown;
};

export type ExportDeclarationInput = {
  dutyCalculationSetup?: { jurisdiction?: unknown; movement?: unknown };
  invoiceHeaders?: unknown;
  customsConversionDate?: unknown;
  declarationCategory?: unknown;
  declarationType?: unknown;
  traderReference?: unknown;
  internalReference?: unknown;
  jobReference?: unknown;
  ducr?: unknown;
  ucn?: unknown;
  badgeId?: unknown;
  declarantReference?: unknown;
  agentReference?: unknown;
  totalAmount?: unknown;
  currency?: unknown;
  totalPackages?: unknown;
  totalGrossMass?: unknown;
  totalNetMass?: unknown;
  exporter?: unknown;
  exporterEori?: unknown;
  exporterName?: unknown;
  exporterAddressLine?: unknown;
  exporterCity?: unknown;
  exporterPostcode?: unknown;
  exporterCountry?: unknown;
  importer?: unknown;
  importerEori?: unknown;
  importerName?: unknown;
  importerAddressLine?: unknown;
  importerCity?: unknown;
  importerPostcode?: unknown;
  importerCountry?: unknown;
  seller?: unknown;
  sellerName?: unknown;
  sellerAddressLine?: unknown;
  sellerCity?: unknown;
  sellerPostcode?: unknown;
  sellerCountry?: unknown;
  sellerEori?: unknown;
  buyerName?: unknown;
  buyerAddressLine?: unknown;
  buyerCity?: unknown;
  buyerPostcode?: unknown;
  buyerCountry?: unknown;
  buyerEori?: unknown;
  representativeName?: unknown;
  representativeAddressLine?: unknown;
  representativeCity?: unknown;
  representativePostcode?: unknown;
  representativeCountry?: unknown;
  representativeEori?: unknown;
  buyer?: unknown;
  consignee?: unknown;
  consigneeName?: unknown;
  consigneeAddressLine?: unknown;
  consigneeCity?: unknown;
  consigneePostcode?: unknown;
  consigneeCountry?: unknown;
  carrier?: unknown;
  carrierIdentifier?: unknown;
  declarant?: unknown;
  declarantEori?: unknown;
  declarantName?: unknown;
  declarantAddressLine?: unknown;
  declarantCity?: unknown;
  declarantPostcode?: unknown;
  declarantCountry?: unknown;
  representative?: unknown;
  representationType?: unknown;
  authorisationIdentifier?: unknown;
  authorisationCategory?: unknown;
  additionalAuthorisationHolders?: unknown;
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
  loadingLocationId?: unknown;
  goodsAddressType?: unknown;
  goodsLocationCountry?: unknown;
  goodsLocationAdditionalIdentifier?: unknown;
  additionalContainerIds?: unknown;
  gvmsCode?: unknown;
  gvmsValue?: unknown;
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
  headerAdditionalInformationCode?: unknown;
  headerAdditionalInformationDescription?: unknown;
  transactionNature?: unknown;
  exchangeRate?: unknown;
  tradeTerms?: unknown;
  tradeTermsLocation?: unknown;
  importerVatNumber?: unknown;
  guarantees?: unknown;
  guaranteeType?: unknown;
  guaranteeReference?: unknown;
  guaranteeAccessCode?: unknown;
  guaranteeOffice?: unknown;
  guaranteeAmount?: unknown;
  guaranteeCurrency?: unknown;
  domesticDutyTaxParties?: unknown;
  importAdjustments?: unknown;
  customsValuationMethod?: unknown;
  primaryDefermentAccount?: unknown;
  secondaryDefermentAccount?: unknown;
  freightChargeAmount?: unknown;
  freightChargeCurrency?: unknown;
  freightChargeApportionment?: unknown;
  vatValueAdjustmentAmount?: unknown;
  vatValueAdjustmentCurrency?: unknown;
  vatValueAdjustmentApportionment?: unknown;
  insuranceCostAmount?: unknown;
  insuranceCostCurrency?: unknown;
  containerPackingCostAmount?: unknown;
  containerPackingCostCurrency?: unknown;
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

function validPreviousDocumentReference(reference: string, type: unknown) {
  if (upper(type, 3) === "DCR") {
    return /^\d[A-Z]{2}[A-Z0-9]{12}-[A-Z0-9]{1,18}$/.test(
      reference.toUpperCase(),
    );
  }
  return /^[A-Za-z0-9]{1,35}$/.test(reference);
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const transactionNatureCodes = new Set([
  "11",
  "12",
  "13",
  "14",
  "19",
  "21",
  "22",
  "23",
  "29",
  "3",
  "41",
  "42",
  "51",
  "52",
  "7",
  "8",
  "91",
  "99",
]);

type ImportCostAdjustment = {
  code: string;
  currency: string;
  amount: string;
};

function costApportionment(value: unknown): "value" | "gross_mass" {
  return clean(value, 20) === "gross_mass" ? "gross_mass" : "value";
}

function allocatedAmounts(
  total: number,
  items: ExportDeclarationItemInput[],
  basis: "value" | "gross_mass",
) {
  const totalMinorUnits = Math.round(total * 100);
  const weights = items.map((item) =>
    positiveNumber(basis === "gross_mass" ? item.grossMass : item.itemPrice) ??
      0
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const resolvedWeights = weightTotal > 0 ? weights : items.map(() => 1);
  const resolvedTotal = resolvedWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const minorUnits = resolvedWeights.map((weight) =>
    Math.floor((totalMinorUnits * weight) / resolvedTotal)
  );
  let remainder = totalMinorUnits -
    minorUnits.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % minorUnits.length) {
    minorUnits[index] += 1;
    remainder -= 1;
  }
  return minorUnits.map((amount) => (amount / 100).toFixed(2));
}

function importCostAdjustmentsByItem(
  input: ExportDeclarationInput,
  items: ExportDeclarationItemInput[],
): ImportCostAdjustment[][] {
  const result = items.map((): ImportCostAdjustment[] => []);
  if (!items.length) return result;

  const append = (
    amountValue: unknown,
    currencyValue: unknown,
    code: string,
    basis: "value" | "gross_mass" = "value",
  ) => {
    const amount = positiveNumber(amountValue);
    const currency = upper(currencyValue, 3);
    if (!amount || !currency) return;
    allocatedAmounts(amount, items, basis).forEach((allocated, index) => {
      if (Number(allocated) > 0) {
        result[index].push({ code, currency, amount: allocated });
      }
    });
  };

  if (Array.isArray(input.importAdjustments)) {
    for (const entry of importAdjustmentsForDraft(input)) {
      if (isPercentageAdjustment(entry.code)) {
        if (positiveNumber(entry.amount)) result.forEach((rows) => rows.push({ code: entry.code, currency: "", amount: entry.amount }));
      } else {
        append(entry.amount, entry.currency, entry.code, adjustmentUsesMass(entry.code) ? "gross_mass" : "value");
      }
    }
    return result;
  }
  const freightBasis = costApportionment(input.freightChargeApportionment);
  append(
    input.freightChargeAmount,
    input.freightChargeCurrency,
    freightBasis === "gross_mass" ? "AQ" : "AP",
    freightBasis,
  );
  const vatBasis = costApportionment(input.vatValueAdjustmentApportionment);
  append(
    input.vatValueAdjustmentAmount,
    input.vatValueAdjustmentCurrency,
    vatBasis === "gross_mass" ? "AW" : "AV",
    vatBasis,
  );
  append(input.insuranceCostAmount, input.insuranceCostCurrency, "AK");
  append(
    input.containerPackingCostAmount,
    input.containerPackingCostCurrency,
    "AD",
  );
  return result;
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

function repeatableInputs(value: unknown, maximum = 99): Json[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Json =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    ).slice(0, maximum)
    : [];
}

function hasAnyValue(entry: Json, keys: string[]) {
  return keys.some((key) => clean(entry[key]));
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
  input = resolveCustomsInvoiceDeclaration(input);
  const issues: string[] = [...customsInvoiceErrors(input), ...customsInvoiceProjectionErrors(input)].map(issue => issue.message);
  const category = upper(input.declarationCategory, 3);
  const typeCode = upper(input.declarationType, 2);
  const currency = upper(input.currency, 3);
  const totalAmount = positiveNumber(input.totalAmount);
  const totalPackages = positiveNumber(input.totalPackages);
  const totalGrossMass = positiveNumber(input.totalGrossMass);
  const totalNetMass = positiveNumber(input.totalNetMass);
  const items = itemInputs(input.items);
  if (direction === "import") {
    const headerIssue = obsoleteImportVatStatementIssue(input.headerAdditionalInformationCode);
    if (headerIssue) issues.push(headerIssue);
    items.forEach((item, index) => {
      issues.push(...processingReleaseFilingIssues(item, { code: input.headerAdditionalInformationCode, description: input.headerAdditionalInformationDescription }).map(issue => `Item ${index + 1}: ${issue.message}`));
      issues.push(...niPreferenceCodes({ ...item, headerAdditionalInformationCode: input.headerAdditionalInformationCode, jurisdiction: input.dutyCalculationSetup?.jurisdiction ?? "NI" }).issues.map(issue => `Item ${index + 1}: ${issue}`));
      repeatableInputs(item.additionalInformationStatements).forEach((entry, entryIndex) => {
      const issue = obsoleteImportVatStatementIssue(entry.statementCode);
      if (issue) issues.push(`Item ${index + 1}, additional information ${entryIndex + 1}: ${issue}`);
      if (entry.statementDescription !== undefined && typeof entry.statementDescription !== "string") issues.push(`Item ${index + 1}: additional information text must be text.`);
      if (typeof entry.statementDescription === "string" && entry.statementDescription.length > 512) issues.push(`Item ${index + 1}: keep additional information text within 512 characters.`);
      if (clean(entry.statementDescription) && !clean(entry.statementCode)) issues.push(`Item ${index + 1}: add a statement code for the additional information text.`);
      });
    });
  }

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
  if (direction === "export" && !clean(input.internalReference, 80)) {
    issues.push("Add an internal reference.");
  }
  const traderReference = clean(input.traderReference, 80);
  if (direction === "import") {
    if (String(input.jobReference ?? "").trim().length > 35) {
      issues.push("Use up to 35 characters for the job reference.");
    }
    if (clean(input.ducr, 80) && ducrFormatError(String(input.ducr))) {
      issues.push(ducrFormatError(String(input.ducr))!);
    }
    if (clean(input.ucn, 80) && !/^[A-Z0-9()\-/]{1,35}$/i.test(clean(input.ucn, 80))) {
      issues.push("Use up to 35 letters, numbers, parentheses, hyphens or slashes for MUCR / UCN.");
    }
    for (const [field, label] of [["badgeId", "Badge code"], ["declarantReference", "Declarant’s reference"], ["agentReference", "Agent’s reference"]] as const) {
      if (clean(input[field], 200)) issues.push(`${label} cannot yet be sent through the connected iCustoms API. Its provider mapping must be confirmed before this declaration can be sent.`);
    }
  }
  if (traderReference && !/^[A-Z0-9]{1,19}$/.test(traderReference)) {
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
  if (direction === "import") issues.push(...additionalCustomsPartyIssues(input as Record<string, unknown>).map(issue => issue.message));
  if (clean(input.exporterEori) && !/^[A-Z]{2}[A-Z0-9]{3,15}$/.test(String(input.exporterEori).trim())) issues.push("Enter a valid exporter EORI: two country letters followed by up to 15 letters or numbers.");
  if (direction === "import" && !clean(input.importer, 70)) {
    issues.push("Add the importer name or EORI.");
  }
  if (direction === "export" && !clean(input.consignee, 70)) {
    issues.push("Add the consignee name or identifier.");
  }
  if (direction === "export" && !clean(input.carrier, 120)) {
    issues.push("Add the carrier name.");
  }
  if (direction === "export" && !clean(input.carrierIdentifier, 17)) {
    issues.push("Add the carrier identifier (EORI).");
  }
  if (
    direction === "export" && upper(input.declarationCategory, 3) !== "B1"
  ) {
    items.forEach((item, index) => {
      if (!clean(item.consignor, 120)) {
        issues.push(`Add the consignor for goods item ${index + 1}.`);
      }
    });
  }
  const exporterContactMissing = contactMissing(input, "exporter");
  if (exporterContactMissing.length) {
    issues.push(
      `This contact is missing: ${exporterContactMissing.join(", ")}.`,
    );
  }
  const importerContactMissing = contactMissing(input, "importer");
  if (direction === "import" && clean(input.importerEori, 100) && !/^[A-Z]{2}[A-Z0-9]{3,15}$/.test(upper(input.importerEori, 100))) {
    issues.push("Check the importer EORI number in the company Customs tab.");
  }
  if (direction === "import") {
    issues.push(...importDefermentIssues(input).map(issue => issue.message));
    for (const entry of repeatableInputs(input.additionalAuthorisationHolders)) {
      if (!/^[A-Z0-9]{1,4}$/.test(upper(entry.category, 100)) || !/^[A-Z]{2}[A-Z0-9]{3,15}$/.test(upper(entry.identifier, 100))) issues.push("Complete every additional authorisation category and holder EORI.");
    }
    for (const account of [input.primaryDefermentAccount, input.secondaryDefermentAccount]) {
      if (clean(account, 100) && !/^\d{7}$/.test(clean(account, 100))) issues.push("Use the seven-digit deferment account number.");
    }
  }
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
  if (!/^[A-Z0-9]{3,17}$/.test(upper(input.declarantEori ?? input.declarant, 18))) {
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
  if (direction === "import") {
    if (!clean(input.inlandMode)) issues.push("Select the inland transport mode.");
    if (!clean(input.borderNationality)) issues.push("Select the border transport nationality.");
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
  if (!transactionNatureCodes.has(clean(input.transactionNature, 2))) {
    issues.push("Choose the nature of transaction.");
  }
  if (direction === "import") {
    if (!/^[23]$/.test(clean(input.representationType, 1))) {
      issues.push("Choose direct or indirect representation.");
    }
    if (!isCustomsTradeTerm(upper(input.tradeTerms, 3))) {
      issues.push("Add the three-letter trade terms.");
    }
    issues.push(...importDetailsErrors(input).map((error) => error.message));
    issues.push(...guaranteeErrors(input).map((error) => error.message));
    if (!clean(input.tradeTermsLocation, 35) && !clean(input.goodsLocationIdentifier, 35)) {
      issues.push(
        "Add the Incoterms location or UN/LOCODE.",
      );
    }
    if (Array.isArray(input.importAdjustments)) {
      for (const error of importAdjustmentErrors(importAdjustmentsForDraft(input))) {
        issues.push(`Addition or deduction ${error.index + 1}: ${error.message}`);
      }
      if (importAdjustmentsForDraft(input).some((row) => ["AR", "AS", "BR", "BS"].includes(row.code) && positiveNumber(row.amount)) && !clean(input.loadingLocationId, 35)) {
        issues.push("Add the airport of loading in Transport for the air freight adjustment.");
      }
    } else {
    const importCosts = [
      [input.freightChargeAmount, input.freightChargeCurrency, "freight costs"],
      [
        input.vatValueAdjustmentAmount,
        input.vatValueAdjustmentCurrency,
        "VAT value adjustment",
      ],
      [
        input.insuranceCostAmount,
        input.insuranceCostCurrency,
        "insurance costs",
      ],
      [
        input.containerPackingCostAmount,
        input.containerPackingCostCurrency,
        "container and packing costs",
      ],
    ] as const;
    for (const [amountValue, currencyValue, label] of importCosts) {
      const hasAmount = Boolean(clean(amountValue, 40));
      const hasCurrency = Boolean(clean(currencyValue, 3));
      if (
        (hasAmount || hasCurrency) &&
        (!positiveNumber(amountValue) ||
          !/^[A-Z]{3}$/.test(upper(currencyValue, 3)))
      ) {
        issues.push(
          `Enter a positive amount and three-letter currency for ${label}.`,
        );
      }
    }
    }
    if (
      clean(input.tradeTerms, 3).toUpperCase() === "EXW" &&
      !importAdjustmentsForDraft(input).some((entry) => isFreightAdjustment(entry.code) && positiveNumber(entry.amount))
    ) {
      issues.push("EXW imports require freight costs for CDS valuation.");
    }
    const authorisationIdentifier = clean(input.authorisationIdentifier, 35);
    const authorisationCategory = upper(input.authorisationCategory, 4);
    if (authorisationIdentifier || authorisationCategory) {
      if (
        !authorisationIdentifier ||
        !/^[A-Z0-9]{1,4}$/.test(authorisationCategory)
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
    } else if (
      !validPreviousDocumentReference(
        previousDocumentReference,
        input.previousDocumentType,
      )
    ) {
      issues.push(
        upper(input.previousDocumentType, 3) === "DCR"
          ? "Use the DUCR format: year, country, 12-character EORI, hyphen and unique reference."
          : "Use up to 35 letters and numbers for the previous document reference.",
      );
    }
  }
  const headerAdditionalInformationCode = upper(
    input.headerAdditionalInformationCode,
    5,
  );
  if ((clean(input.gvmsCode, 5) || clean(input.gvmsValue, 512)) && (input.gvmsCode !== "RRS01" || !clean(input.gvmsValue, 512))) {
    issues.push("Select RRS01 and enter the haulier EORI or name for GVMS.");
  }
  if (clean(input.goodsLocationAdditionalIdentifier, 35) && !/^\d{1,3}$/.test(String(input.goodsLocationAdditionalIdentifier))) {
    issues.push("Goods location additional identifier must contain up to three digits.");
  }
  const headerAdditionalInformationDescription = clean(
    input.headerAdditionalInformationDescription,
    512,
  );
  if (
    headerAdditionalInformationCode || headerAdditionalInformationDescription
  ) {
    if (
      !/^[A-Z0-9]{1,5}$/.test(headerAdditionalInformationCode) ||
      !headerAdditionalInformationDescription
    ) {
      issues.push(
        "Complete both the additional information code and description.",
      );
    }
  }
  if (!items.length) issues.push("Add at least one goods item.");

  let packageSum = 0;
  let grossMassSum = 0;
  let netMassSum = 0;
  let invoiceSum = 0;
  const headerImportCosts = direction === "import"
    ? importCostAdjustmentsByItem(input, items)
    : items.map((): ImportCostAdjustment[] => []);

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
    const extraPackages = repeatableInputs(item.additionalPackageDetails);
    const extraPreviousDocuments = repeatableInputs(
      item.additionalPreviousDocuments,
    );
    const additionalDocuments = repeatableInputs(item.additionalDocuments);

    const commodityCodeLength = direction === "export" ? 8 : 10;
    if (!new RegExp(`^\\d{${commodityCodeLength}}$`).test(commodityCode)) {
      issues.push(
        `${line}: enter ${
          commodityCodeLength === 8 ? "an" : "a"
        } ${commodityCodeLength}-digit commodity code.`,
      );
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
    } else if (
      !validPreviousDocumentReference(
        itemPreviousDocumentReference,
        item.previousDocumentType,
      )
    ) {
      issues.push(
        `${line}: ${
          upper(item.previousDocumentType, 3) === "DCR"
            ? "use the DUCR format: year, country, 12-character EORI, hyphen and unique reference"
            : "use up to 35 letters and numbers for the previous document reference"
        }.`,
      );
    }
    repeatableInputs(item.additionalTaricCodes).forEach((entry, entryIndex) => {
      if (
        hasAnyValue(entry, ["code"]) &&
        !/^[A-Z0-9]{1,4}$/.test(upper(entry.code, 4))
      ) {
        issues.push(
          `${line}, TARIC code ${
            entryIndex + 2
          }: use up to four letters and numbers.`,
        );
      }
    });
    repeatableInputs(item.additionalNationalCodes).forEach(
      (entry, entryIndex) => {
        if (
          hasAnyValue(entry, ["code"]) &&
          !/^[A-Z0-9]{1,4}$/.test(upper(entry.code, 4))
        ) {
          issues.push(
            `${line}, national code ${
              entryIndex + 2
            }: use up to four letters and numbers.`,
          );
        }
      },
    );
    extraPackages.forEach((entry, entryIndex) => {
      const count = positiveNumber(entry.count);
      if (!hasAnyValue(entry, ["kind", "marks", "count"])) return;
      if (
        !/^[A-Z0-9]{1,2}$/.test(upper(entry.kind, 2)) ||
        !clean(entry.marks, 42) || !count || !Number.isInteger(count)
      ) {
        issues.push(
          `${line}, package detail ${
            entryIndex + 2
          }: complete kind, marks and a whole package count.`,
        );
      }
    });
    repeatableInputs(item.additionalProcedureCodes).forEach(
      (entry, entryIndex) => {
        if (
          hasAnyValue(entry, ["code"]) &&
          !/^[A-Z0-9]{3}$/.test(upper(entry.code, 3))
        ) {
          issues.push(
            `${line}, additional procedure ${
              entryIndex + 2
            }: use a three-character code.`,
          );
        }
      },
    );
    extraPreviousDocuments.forEach((entry, entryIndex) => {
      if (!hasAnyValue(entry, ["category", "type", "reference"])) return;
      if (
        (direction === "import" && !/^[XYZ]$/.test(upper(entry.category, 1))) ||
        !/^[A-Z0-9]{1,3}$/.test(upper(entry.type, 3)) ||
        !validPreviousDocumentReference(clean(entry.reference, 35), entry.type)
      ) {
        issues.push(
          `${line}, previous document ${
            entryIndex + 2
          }: complete a valid category, type and reference.`,
        );
      }
    });
    if (direction === "import") {
      if (!/^\d$/.test(clean(item.customsValuationMethod, 1))) {
        issues.push(`${line}: add the one-digit customs valuation method.`);
      }
      if (!/^\d{3}$/.test(clean(item.preferenceCode, 3))) {
        issues.push(`${line}: add the three-digit preference code.`);
      }
      issues.push(...quotaClaimIssues(item.quotaOrderNumber, item.preferenceCode, input.dutyCalculationSetup ?? {}).map(message => `${line}: ${message}`));
    }

    const primaryAdditionalDocument = {
      category: item.additionalDocumentCategory,
      type: item.additionalDocumentType,
      reference: item.additionalDocumentId,
      name: item.additionalDocumentName,
      lpcoExemptionCode: item.lpcoExemptionCode,
      writeOff: item.additionalDocumentWriteOff,
      validityDate: item.additionalDocumentValidityDate,
    };
    [primaryAdditionalDocument, ...additionalDocuments].forEach(
      (entry, entryIndex) => {
        if (
          !hasAnyValue(entry, [
            "category",
            "type",
            "reference",
            "name",
            "lpcoExemptionCode",
            "writeOff",
            "validityDate",
          ])
        ) return;
        if (
          !/^[A-Z0-9]$/.test(upper(entry.category, 1)) ||
          !/^[A-Z0-9]{1,3}$/.test(upper(entry.type, 3)) ||
          (!clean(entry.reference, 70) && !clean(entry.name, 120))
        ) {
          issues.push(
            `${line}, additional document ${
              entryIndex + 1
            }: complete the category, type and either the ID or declaration statement.`,
          );
        }
      },
    );

    repeatableInputs(item.dutyCalculations).forEach((entry, entryIndex) => {
      if (
        !hasAnyValue(entry, [
          "taxType",
          "paymentMethod",
          "baseQuantity",
          "unitCode",
          "declaredTax",
        ])
      ) return;
      if (
        !clean(entry.taxType, 3) || !clean(entry.unitCode, 4) ||
        !positiveNumber(entry.baseQuantity)
      ) {
        issues.push(
          `${line}, duty calculation ${
            entryIndex + 1
          }: complete tax type, base quantity and unit code.`,
        );
      }
    });
    const headerCostCodes = new Set(
      (headerImportCosts[index] ?? []).map((entry) => entry.code),
    );
    repeatableInputs(item.valuationAdjustments).forEach((entry, entryIndex) => {
      if (!hasAnyValue(entry, ["code", "currency", "amount"])) return;
      if (
        !clean(entry.code, 4) || !/^[A-Z]{3}$/.test(upper(entry.currency, 3)) ||
        !positiveNumber(entry.amount)
      ) {
        issues.push(
          `${line}, addition or deduction ${
            entryIndex + 1
          }: complete code, currency and amount.`,
        );
      }
      if (headerCostCodes.has(upper(entry.code, 4))) {
        issues.push(
          `${line}, addition or deduction ${
            entryIndex + 1
          }: remove the duplicate cost already entered in Import costs.`,
        );
      }
    });
    repeatableInputs(item.domesticDutyTaxParties).forEach(
      (entry, entryIndex) => {
        if (!hasAnyValue(entry, ["partyId", "roleCode"])) return;
        if (
          !clean(entry.partyId, 17) ||
          !/^(?:FR[1-5]|FR7)$/.test(upper(entry.roleCode, 3))
        ) {
          issues.push(
            `${line}, domestic duty tax party ${
              entryIndex + 1
            }: complete the party ID and role code.`,
          );
        }
      },
    );

    packageSum += (packageCount ?? 0) +
      extraPackages.reduce(
        (sum, entry) => sum + (positiveNumber(entry.count) ?? 0),
        0,
      );
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
    | "Consignor"
    | "Carrier"
    | "Declarant"
    | "Agent"
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
  prefix: "importer" | "exporter" | "consignee" | "declarant" | "seller" | "buyer" | "representative",
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
  input = resolveCustomsInvoiceDeclaration(input);
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
  // iCustoms expands a header consignee onto every goods line for multi-item
  // exports, which makes CDS see the party at both levels and reject the entry
  // with CDS12071. Use the documented item-level alternative when every line
  // already carries a consignee; single-item declarations keep the simpler
  // header-level shape used by the reference declaration.
  const useItemLevelConsignees = direction === "export" && items.length > 1 &&
    items.every((item) => clean(item.consignee, 70));
  const headerImportCosts = direction === "import"
    ? importCostAdjustmentsByItem(input, items)
    : items.map((): ImportCostAdjustment[] => []);
  const goodsItems = items.map((item, index) => {
    const procedureCode = upper(item.procedureCode, 4);
    const explicitItemDestination = upper(item.destinationCountry, 2);
    const itemCurrency = upper(item.currency, 3);
    const taricCodes = [
      upper(item.taricCode, 4),
      ...repeatableInputs(item.additionalTaricCodes).map((entry) =>
        upper(entry.code, 4)
      ),
    ].filter(Boolean);
    const nationalCodes = [
      upper(item.nationalCode, 4),
      ...repeatableInputs(item.additionalNationalCodes).map((entry) =>
        upper(entry.code, 4)
      ),
    ].filter(Boolean);
    const classification = [
      element(
        "CommodityCode",
        upper(item.commodityCode, direction === "export" ? 8 : 10),
      ),
      element("CusCode", upper(item.cusCode, 8)),
      ...taricCodes.map((code) => element("AdditionalTaricCode", code)),
      ...nationalCodes.map((code) => element("AdditionalNationalCode", code)),
    ].join("");
    const dutyCalculations = repeatableInputs(item.dutyCalculations)
      .filter((entry) =>
        hasAnyValue(entry, [
          "taxType",
          "paymentMethod",
          "baseQuantity",
          "unitCode",
          "declaredTax",
        ])
      )
      .map((entry) =>
        group(
          "DutyTaxFee",
          (direction === "import" ? [
            element("SpecificTaxBaseQuantity", decimal(entry.baseQuantity, 6), { unitCode: upper(entry.unitCode, 4) }),
            element("TypeCode", upper(entry.taxType, 3)),
            group("Payment", [element("MethodCode", upper(entry.paymentMethod, 1)), element("PaymentAmount", decimal(entry.declaredTax, 2), { currencyID: "GBP" })].join("")),
          ] : [
            element("TypeCode", upper(entry.taxType, 3)),
            element("PaymentMethodCode", upper(entry.paymentMethod, 2)),
            element("TaxBaseQuantity", decimal(entry.baseQuantity, 6), {
              unitCode: upper(entry.unitCode, 4),
            }),
            element("PaymentAmount", decimal(entry.declaredTax, 2), {
              currencyID: itemCurrency,
            }),
          ]).join(""),
        )
      ).join("");
    const commodity = group(
      "Commodity",
      [
        element("Description", item.description),
        group("Classification", classification),
        direction === "import"
          ? group(
            "DutyTaxFee",
            // HMRC CDS DSSD v2.32, partial quota allocation example:
            // Commodity/DutyTaxFee contains both treatment and quota order.
            element("DutyRegimeCode", upper(item.preferenceCode, 3)) +
              element("QuotaOrderID", upper(item.quotaOrderNumber, 6)),
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
        dutyCalculations,
      ].join(""),
    );
    const explicitItemConsignee = clean(item.consignee, 70);
    const itemConsignee = direction === "export" &&
        explicitItemConsignee &&
        (useItemLevelConsignees ||
          explicitItemConsignee !== clean(input.consignee, 70))
      ? party(
        "Consignee",
        explicitItemConsignee,
        partyContact(input, "consignee"),
      )
      : "";
    const primaryAdditionalDocument: Json = {
      category: item.additionalDocumentCategory,
      type: item.additionalDocumentType,
      reference: item.additionalDocumentId,
      name: item.additionalDocumentName,
      lpcoExemptionCode: item.lpcoExemptionCode,
      writeOff: item.additionalDocumentWriteOff,
      validityDate: item.additionalDocumentValidityDate,
    };
    const additionalDocuments = [
      primaryAdditionalDocument,
      ...repeatableInputs(item.additionalDocuments),
    ]
      .filter((entry) =>
        hasAnyValue(entry, [
          "category",
          "type",
          "reference",
          "name",
          "lpcoExemptionCode",
          "writeOff",
          "validityDate",
        ])
      )
      .map((entry) =>
        group(
          "AdditionalDocument",
          [
            element("CategoryCode", upper(entry.category, 1)),
            group(
              "EffectiveDateTime",
              element("DateTime", clean(entry.validityDate, 10)),
            ),
            element("ID", entry.reference),
            element("Name", entry.name),
            group("Submitter", element("Name", entry.writeOff)),
            element("TypeCode", upper(entry.type, 3)),
            element("LPCOExemptionCode", upper(entry.lpcoExemptionCode, 2)),
          ].join(""),
        )
      ).join("");
    const previousDocuments = [{
      category: item.previousDocumentCategory,
      type: item.previousDocumentType,
      reference: item.previousDocumentReference,
    }, ...repeatableInputs(item.additionalPreviousDocuments)]
      .filter((entry) => hasAnyValue(entry, ["category", "type", "reference"]))
      .filter((entry) =>
        direction !== "export" || !(
          (upper(entry.category, 1) ||
              upper(input.previousDocumentCategory, 1)) ===
            upper(input.previousDocumentCategory, 1) &&
          upper(entry.type, 3) === upper(input.previousDocumentType, 3) &&
          clean(entry.reference, 35) ===
            clean(input.previousDocumentReference, 35)
        )
      );
    const itemPreviousDocuments = previousDocuments.map((
      entry,
      documentIndex,
    ) =>
      group(
        "PreviousDocument",
        [
          element(
            "CategoryCode",
            upper(entry.category, 1) ||
              upper(input.previousDocumentCategory, 1),
          ),
          element("ID", entry.reference),
          element("TypeCode", upper(entry.type, 3)),
          element("LineNumeric", String(documentIndex + 1)),
        ].join(""),
      )
    ).join("");
    const additionalInformation = repeatableInputs(
      item.additionalInformationStatements,
    )
      .filter((entry) => hasAnyValue(entry, ["statementCode"]))
      .map((entry) =>
        group(
          "AdditionalInformation",
          [element("StatementCode", upper(entry.statementCode, 5)), direction === "import" ? element("StatementDescription", clean(entry.statementDescription, 512)) : ""].join(""),
        )
      )
      .join("");
    const additionalProcedures = [
      upper(item.additionalProcedureCode, 3),
      ...repeatableInputs(item.additionalProcedureCodes).map((entry) =>
        upper(entry.code, 3)
      ),
    ].filter(Boolean).map((code) =>
      group("GovernmentAdditionalProcedure", element("CurrentCode", code))
    ).join("");
    const packages = [{
      kind: item.packageKind,
      marks: item.packageMarks,
      count: item.packageCount,
    }, ...repeatableInputs(item.additionalPackageDetails)]
      .filter((entry) => hasAnyValue(entry, ["kind", "marks", "count"]))
      .map((entry, packageIndex) =>
        group(
          "Packaging",
          [
            element("SequenceNumeric", String(packageIndex + 1)),
            element("MarksNumbersID", entry.marks),
            element("QuantityQuantity", decimal(entry.count, 0)),
            element("TypeCode", upper(entry.kind, 2)),
          ].join(""),
        )
      ).join("");
    const valuationAdjustments = [
      ...(headerImportCosts[index] ?? []),
      ...repeatableInputs(item.valuationAdjustments),
    ]
      .filter((entry) => hasAnyValue(entry, ["code", "currency", "amount"]));
    const valuationAdjustmentXml = direction === "import"
      ? (valuationAdjustments.length
        ? valuationAdjustments.map((entry) =>
          group(
            "ValuationAdjustment",
            [
              element("AdditionCode", upper(entry.code, 4)),
              element("Amount", decimal(entry.amount, 2), isPercentageAdjustment(upper(entry.code, 4)) ? undefined : {
                currencyID: upper(entry.currency, 3) || itemCurrency,
              }),
            ].join(""),
          )
        ).join("")
        : group("ValuationAdjustment", element("AdditionCode", "0000")))
      : "";
    const partyReferences = (name: string, value: unknown) =>
      repeatableInputs(value)
        .filter((entry) => hasAnyValue(entry, ["partyId"]))
        .map((entry) => group(name, element("ID", clean(entry.partyId, 35))))
        .join("");
    const domesticDutyTaxParties = repeatableInputs(item.domesticDutyTaxParties)
      .filter((entry) => hasAnyValue(entry, ["partyId", "roleCode"]))
      .map((entry, partyIndex) =>
        group(
          "DomesticDutyTaxParty",
          [
            element("SequenceNumeric", String(partyIndex + 1)),
            element("ID", clean(entry.partyId, 17)),
            element("RoleCode", upper(entry.roleCode, 3)),
          ].join(""),
        )
      ).join("");
    const mutualRecognitionParties = repeatableInputs(
      item.mutualRecognitionParties,
    )
      .filter((entry) => hasAnyValue(entry, ["partyId"]))
      .map((entry) =>
        group(
          "AEOMutualRecognitionParty",
          element("ID", clean(entry.partyId, 35)),
        )
      )
      .join("");

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
        additionalDocuments,
        additionalInformation,
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
        direction === "export" &&
            upper(input.declarationCategory, 3) !== "B1"
          ? party("Consignor", item.consignor)
          : "",
        itemConsignee,
        partyReferences("Exporter", item.itemExporters),
        partyReferences("Seller", item.itemSellers),
        partyReferences("Buyer", item.itemBuyers),
        domesticDutyTaxParties,
        mutualRecognitionParties,
        direction === "export" && explicitItemDestination &&
          explicitItemDestination !== destinationCountry
          ? group(
            "Destination",
            element("CountryCode", explicitItemDestination),
          )
          : "",
        group(
          "GovernmentProcedure",
          [
            element("CurrentCode", procedureCode.slice(0, 2)),
            element("PreviousCode", procedureCode.slice(2, 4)),
          ].join(""),
        ),
        additionalProcedures,
        group(
          "Origin",
          [
            element("CountryCode", upper(item.nonPreferentialOrigin, 2)),
            element("TypeCode", "2"),
          ].join(""),
        ),
        packages,
        direction === "export" ? itemPreviousDocuments : "",
        valuationAdjustmentXml,
      ].join(""),
    );
  }).join("");

  const importPreviousDocuments = direction === "import"
    ? items.flatMap((item, itemIndex) =>
      [{
        category: item.previousDocumentCategory,
        type: item.previousDocumentType,
        reference: item.previousDocumentReference,
      }, ...repeatableInputs(item.additionalPreviousDocuments)].map((
        entry,
      ) => ({ entry, itemIndex }))
    )
      .filter(({ entry }) =>
        hasAnyValue(entry, ["category", "type", "reference"])
      )
      .map(({ entry, itemIndex }) =>
        group(
          "PreviousDocument",
          [
            element(
              "CategoryCode",
              upper(entry.category, 1) ||
                upper(input.previousDocumentCategory, 1),
            ),
            element("ID", entry.reference),
            element("TypeCode", upper(entry.type, 3)),
            element("LineNumeric", String(itemIndex + 1)),
          ].join(""),
        )
      ).join("")
    : "";

  const transportEquipment = isContainerised
    ? [input.containerId, ...(Array.isArray(input.additionalContainerIds) ? input.additionalContainerIds : [])].filter((id) => clean(id, 17)).map((id, index) => group(
      "TransportEquipment",
      [
        element("SequenceNumeric", String(index + 1)),
        element("ID", id),
        index === 0 && clean(input.sealIdentifier, 20)
          ? group(
            "Seal",
            [
              element("SequenceNumeric", "1"),
              element("ID", input.sealIdentifier),
            ].join(""),
          )
          : "",
      ].join(""),
    )).join("")
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
        : element("ID", input.goodsLocationAdditionalIdentifier),
      element("TypeCode", upper(input.goodsLocationType, 1)),
      group(
        "Address",
        [
          element("TypeCode", upper(input.goodsAddressType, 1) || "U"),
          element(
            "CountryCode",
            upper(
              input.goodsLocationCountry || (direction === "import"
                ? input.destinationCountry
                : input.exportCountry),
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
        ) || (direction === "import" && clean(input.inlandMode, 1))
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
            element("ModeCode", input.inlandMode),
          ].join(""),
        )
        : "",
      goodsLocation,
      clean(input.loadingLocationId, 35) ? group("LoadingLocation", element("ID", input.loadingLocationId)) : "",
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
      direction === "import" ? element("InternalJobReference", clean(input.jobReference, 35)) : "",
      element("InvoiceAmount", decimal(input.totalAmount, 2), {
        currencyID: currency,
      }),
      element("TotalGrossMassMeasure", decimal(input.totalGrossMass)),
      element("TotalPackageQuantity", decimal(input.totalPackages, 0)),
      ...(direction === "import" ? [input.primaryDefermentAccount, input.secondaryDefermentAccount].map((account, index) => clean(account, 7) ? group("AdditionalDocument", [element("CategoryCode", String(index + 1)), element("ID", account), element("TypeCode", "DAN")].join("")) : "") : []),
      clean(input.headerAdditionalInformationCode, 5)
        ? group(
          "AdditionalInformation",
          [
            element(
              "StatementCode",
              upper(input.headerAdditionalInformationCode, 5),
            ),
            element(
              "StatementDescription",
              clean(input.headerAdditionalInformationDescription, 512),
            ),
          ].join(""),
        )
        : "",
      clean(input.gvmsCode, 5) ? group("AdditionalInformation", [element("StatementCode", upper(input.gvmsCode, 5)), element("StatementDescription", clean(input.gvmsValue, 512))].join("")) : "",
      clean(input.representative, 70)
        ? party("Agent", input.representativeEori ?? input.representative, { ...partyContact(input, "representative"), name: input.representativeName || input.representative })
        : "",
      clean(input.representationType, 1)
        ? element("AgentFunctionCode", clean(input.representationType, 1))
        : "",
      clean(input.authorisationIdentifier, 35) &&
        clean(input.authorisationCategory, 4)
        ? group(
          "AuthorisationHolder",
          [
            element("ID", input.authorisationIdentifier),
            element("CategoryCode", upper(input.authorisationCategory, 4)),
          ].join(""),
        )
        : "",
      ...(direction === "import" ? repeatableInputs(input.additionalAuthorisationHolders).filter((entry, index, entries) => !(upper(entry.category, 4) === upper(input.authorisationCategory, 4) && upper(entry.identifier, 17) === upper(input.authorisationIdentifier, 17)) && entries.findIndex(candidate => upper(candidate.category, 4) === upper(entry.category, 4) && upper(candidate.identifier, 17) === upper(entry.identifier, 17)) === index).map(entry => group("AuthorisationHolder", [element("ID", upper(entry.identifier, 17)), element("CategoryCode", upper(entry.category, 4))].join(""))) : []),
      borderTransport,
      clean(input.exchangeRate)
        ? group("CurrencyExchange", element("RateNumeric", clean(input.exchangeRate))) : "",
      direction === "export"
        ? group(
          "Consignment",
          party("Carrier", input.carrierIdentifier, { name: input.carrier }),
        )
        : "",
      party(
        "Declarant",
        input.declarantEori ?? input.declarant,
        partyContact(input, "declarant"),
      ),
      direction === "export"
        ? group("ExitOffice", element("ID", upper(input.exitOffice, 8)))
        : "",
      party("Exporter", input.exporterEori ?? input.exporter, partyContact(input, "exporter")),
      group(
        "GoodsShipment",
        [
          direction === "import" && clean(input.buyer, 70) ? party("Buyer", input.buyerEori ?? input.buyer, { ...partyContact(input, "buyer"), name: input.buyerName || input.buyer }) : "",
          direction === "export"
            ? element(
              "TransactionNatureCode",
              clean(input.transactionNature, 2),
            )
            : "",
          direction === "export" && !useItemLevelConsignees
            ? party(
              "Consignee",
              input.consignee,
              partyContact(input, "consignee"),
            )
            : "",
          consignment,
          group("Destination", element("CountryCode", destinationCountry)),
          ...(direction === "import" ? importFiscalParties(input.domesticDutyTaxParties)
            .filter((row) => row.partyId || row.roleCode || row.useCustomer)
            .map((row) => group("DomesticDutyTaxParty", element("ID", row.useCustomer ? clean(input.importerVatNumber, 17) : row.partyId) + element("RoleCode", row.roleCode))) : []),
          group("ExportCountry", element("ID", upper(input.exportCountry, 2))),
          goodsItems,
          direction === "import"
            ? party(
              "Importer",
              clean(input.importerEori, 17) || input.importer,
              partyContact(input, "importer"),
            )
            : "",
          direction === "import" ? [
            importPreviousDocuments,
            ...([["DCR", input.ducr], ["MCR", input.ucn]] as const).map(([type, reference]) => clean(reference, 35)
              ? group("PreviousDocument", element("CategoryCode", "Z") + element("ID", upper(reference, 35)) + element("TypeCode", type))
              : ""),
          ].join("") : group(
            "PreviousDocument",
            [
              element("CategoryCode", upper(input.previousDocumentCategory, 1)),
              element("ID", input.previousDocumentReference),
              element("TypeCode", upper(input.previousDocumentType, 3)),
            ].join(""),
          ),
          direction === "import" && clean(input.seller, 70) ? party("Seller", input.sellerEori ?? input.seller, { ...partyContact(input, "seller"), name: input.sellerName || input.seller }) : "",
          direction === "import"
            ? group(
              "TradeTerms",
              [
                element("ConditionCode", upper(input.tradeTerms, 3)),
                element("LocationID", clean(input.tradeTermsLocation, 35) || upper(input.goodsLocationIdentifier, 35)),
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
          direction === "import" && (clean(input.warehouseType) || clean(input.warehouseIdentifier))
            ? group("Warehouse", element("ID", clean(input.warehouseIdentifier, 35)) + element("TypeCode", clean(input.warehouseType, 1))) : "",
        ].join(""),
      ),
      ...(direction === "import" ? guaranteesForDraft(input).filter(hasGuaranteeValues).map(row => group("ObligationGuarantee", [
        element("AmountAmount", row.amount, { currencyID: row.currency }),
        element("ID", row.guaranteeId),
        element("ReferenceID", row.grn),
        element("SecurityDetailsCode", row.type),
        element("AccessCode", row.accessCode),
        row.office ? group("GuaranteeOffice", element("ID", row.office)) : "",
      ].join(""))) : []),
      direction === "import" && clean(input.presentationOffice)
        ? group("PresentationOffice", element("ID", upper(input.presentationOffice, 8))) : "",
      direction === "import" && clean(input.supervisingOffice)
        ? group("SupervisingOffice", element("ID", upper(input.supervisingOffice, 8))) : "",
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

export function buildICustomsDraftShellXml(
  direction: "import" | "export",
  localReference: string,
) {
  const reference = clean(localReference, 19);
  return [
    "<iCustoms><Declaration>",
    element("DeclarationCategory", direction === "import" ? "H1" : "B1"),
    element("TypeCode", direction === "import" ? "IMA" : "EXA"),
    reference
      ? group("UCR", element("TraderAssignedReferenceID", reference))
      : "",
    "</Declaration></iCustoms>",
  ].join("");
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
  const text = await response.text();
  if (!text) return {};
  if (text.length > 2_000_000) return { raw: text.slice(0, 100_000) };
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string" && /^[\[{]/.test(parsed.trim())) {
      return JSON.parse(parsed);
    }
    return parsed;
  } catch {
    return { raw: text };
  }
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

  declarationDetails(
    direction: "import" | "export",
    correlationId: string,
  ) {
    return this.request(
      `/api/cds/v1/GetDeclaration/${direction}/${
        encodeURIComponent(correlationId)
      }`,
    );
  }

  deleteWorkspaceDraft(providerDraftId: string) {
    return this.request(
      `/api/v2/delete_draft/${encodeURIComponent(providerDraftId)}`,
      { method: "GET" },
    );
  }

  updateAndSubmit(correlationId: string, xml: string) {
    return this.request(
      `/api/cds/v1/update-and-submit/${encodeURIComponent(correlationId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
      },
    );
  }

  submitDraft(correlationId: string) {
    return this.request(
      `/api/cds/v1/submit/${encodeURIComponent(correlationId)}`,
      { method: "POST" },
    );
  }

  draftAndSubmit(xml: string) {
    return this.request("/api/cds/v1/draft-and-submit", {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: xml,
    });
  }

  notifications(correlationId: string) {
    return this.request(
      `/api/cds/v1/notification/${encodeURIComponent(correlationId)}`,
    );
  }

  searchCommodities(query: string, country = "UK") {
    return this.request("/api/iclassification/v1.0.0/aisearch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        query: clean(query, 180),
        country: upper(country, 2) === "GB" ? "UK" : upper(country, 2),
      }]),
    });
  }

  tariffDetails(commodityCode: string) {
    return this.request("/api/v2/tariDetails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commodity_code: clean(commodityCode, 10) }),
    });
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

function providerRelationshipIds(value: unknown) {
  return new Set(
    providerRecords(providerRecord(value).data).map((entry) =>
      clean(entry.id, 80)
    ).filter(Boolean),
  );
}

function plainProviderText(value: unknown, maximum = 2_000) {
  return clean(value, maximum * 2)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

export function iCustomsCommoditySuggestions(
  value: unknown,
): ICustomsCommoditySuggestion[] {
  const body = providerRecord(value);
  const seen = new Set<string>();
  const suggestions: ICustomsCommoditySuggestion[] = [];
  for (const response of providerRecords(body.response)) {
    for (const commodity of providerRecords(response.commodities)) {
      const code = clean(
        commodity["HS-Code"] ?? commodity.hs_code ?? commodity.code,
        20,
      ).replace(/\D/g, "").slice(0, 10);
      const description = plainProviderText(
        commodity.Description ?? commodity.description,
        600,
      );
      if (!/^\d{10}$/.test(code) || !description || seen.has(code)) continue;
      seen.add(code);
      const rawConfidence = Number(
        commodity.Confidence ?? commodity.confidence,
      );
      suggestions.push({
        code,
        description,
        confidence: Number.isFinite(rawConfidence)
          ? Math.max(0, Math.min(100, rawConfidence))
          : null,
      });
      if (suggestions.length >= 20) return suggestions;
    }
  }
  return suggestions;
}

export function iCustomsCommodityDetail(
  value: unknown,
  direction: "import" | "export",
): ICustomsCommodityDetail {
  const body = providerRecord(value);
  const data = providerRecord(body.data);
  const attributes = providerRecord(data.attributes);
  const relationships = providerRecord(data.relationships);
  const included = providerRecords(body.included);
  const code = clean(attributes.goods_nomenclature_item_id, 20).replace(
    /\D/g,
    "",
  ).slice(0, 10);

  const measureIds = providerRelationshipIds(
    relationships[
      direction === "import" ? "import_measures" : "export_measures"
    ],
  );
  const conditionIds = new Set<string>();
  for (const item of included) {
    if (item.type !== "measure" || !measureIds.has(clean(item.id, 80))) {
      continue;
    }
    const itemRelationships = providerRecord(item.relationships);
    for (
      const condition of providerRecords(
        providerRecord(itemRelationships.measure_conditions).data,
      )
    ) {
      const id = clean(condition.id, 80);
      if (id) conditionIds.add(id);
    }
  }

  const certificatesByCode = new Map<string, ICustomsCommodityCertificate>();
  for (const item of included) {
    if (
      item.type !== "measure_condition" ||
      !conditionIds.has(clean(item.id, 80))
    ) continue;
    const itemAttributes = providerRecord(item.attributes);
    const documentCode = upper(itemAttributes.document_code, 4);
    if (!/^[A-Z0-9]{4}$/.test(documentCode)) continue;
    const description = plainProviderText(
      itemAttributes.certificate_description ?? itemAttributes.requirement,
      1_000,
    );
    const guidance = plainProviderText(itemAttributes.guidance_cds, 2_000);
    const statementMatch = guidance.match(
      /Complete statement\s+["'‘’]([^"'‘’]+)["'‘’]/i,
    );
    const certificate: ICustomsCommodityCertificate = {
      code: documentCode,
      category: documentCode.slice(0, 1),
      type: documentCode.slice(1),
      description,
      guidance,
      statement: statementMatch?.[1]?.trim() || null,
      referenceRequired: !/No document status code (?:is )?required/i.test(
        guidance,
      ),
      action: plainProviderText(itemAttributes.action, 160) || null,
    };
    if (!certificatesByCode.has(documentCode)) {
      certificatesByCode.set(documentCode, certificate);
    }
  }

  const vatOptions = direction === "import"
    ? Object.entries(
      providerRecord(
        providerRecord(data.meta).duty_calculator,
      ).applicable_vat_options as Json ?? {},
    ).flatMap(([vatCode, labelValue]) => {
      const label = plainProviderText(labelValue, 200);
      if (!label) return [];
      return [{
        code: upper(vatCode, 12),
        label,
        rate: label.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? null,
      }];
    })
    : [];
  const tradeSummary = included.find((item) =>
    item.type === "import_trade_summary"
  );
  const dutyRate = direction === "import"
    ? plainProviderText(
      providerRecord(tradeSummary?.attributes).basic_third_country_duty,
      120,
    ) || null
    : null;

  return {
    code,
    description: plainProviderText(
      attributes.description_plain ?? attributes.formatted_description ??
        attributes.description,
      1_000,
    ),
    declarable: attributes.declarable === true,
    validFrom: clean(attributes.validity_start_date, 40) || null,
    validTo: clean(attributes.validity_end_date, 40) || null,
    dutyRate,
    vatOptions,
    certificates: Array.from(certificatesByCode.values()),
    quotas: commodityQuotas(value, direction),
  };
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

export function providerCorrelationId(value: unknown): string {
  const record = providerRecord(value);
  const direct = clean(record.co_relation_id, 160) ||
    clean(record.co_relation, 160) || clean(record.correlation_id, 160) ||
    clean(record.declaration_id, 160);
  if (direct) return direct;
  if (Array.isArray(record.declarations)) {
    for (const declaration of record.declarations) {
      const nested = providerCorrelationId(declaration);
      if (nested) return nested;
    }
  }
  return "";
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
