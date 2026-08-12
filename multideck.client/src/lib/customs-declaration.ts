export type ExportDeclarationCategory = string
export type ExportDeclarationType = string
export type DeclarationDirection = "export" | "import"

export type CustomsCodeEntry = { id: string; code: string }
export type CustomsPackageEntry = { id: string; kind: string; marks: string; count: string }
export type CustomsPreviousDocumentEntry = { id: string; category: string; type: string; reference: string }
export type CustomsAdditionalDocumentEntry = {
  id: string
  category: string
  type: string
  reference: string
  name: string
  lpcoExemptionCode: string
  writeOff: string
  validityDate: string
}
export type CustomsAdditionalInformationEntry = { id: string; statementCode: string }
export type CustomsDutyCalculationEntry = {
  id: string
  taxType: string
  paymentMethod: string
  baseQuantity: string
  unitCode: string
  declaredTax: string
}
export type CustomsValuationAdjustmentEntry = { id: string; code: string; currency: string; amount: string }
export type CustomsPartyEntry = { id: string; partyId: string }
export type CustomsFiscalPartyEntry = { id: string; partyId: string; roleCode: string }

export type ExportDeclarationItem = {
  id: string
  commodityCode: string
  description: string
  dangerousGoodsCode: string
  taricCode: string
  additionalTaricCodes: CustomsCodeEntry[]
  nationalCode: string
  additionalNationalCodes: CustomsCodeEntry[]
  cusCode: string
  packageKind: string
  packageMarks: string
  packageCount: string
  additionalPackageDetails: CustomsPackageEntry[]
  transactionNature: string
  preferentialOrigin: string
  nonPreferentialOrigin: string
  procedureCode: string
  additionalProcedureCode: string
  additionalProcedureCodes: CustomsCodeEntry[]
  tariffQuantity: string
  grossMass: string
  netMass: string
  itemPrice: string
  currency: string
  statisticalValue: string
  previousDocumentCategory: string
  previousDocumentType: string
  previousDocumentReference: string
  additionalPreviousDocuments: CustomsPreviousDocumentEntry[]
  additionalDocumentCategory: string
  additionalDocumentType: string
  additionalDocumentId: string
  additionalDocumentName: string
  lpcoExemptionCode: string
  additionalDocumentWriteOff: string
  additionalDocumentValidityDate: string
  additionalDocuments: CustomsAdditionalDocumentEntry[]
  additionalInformationStatements: CustomsAdditionalInformationEntry[]
  dutyCalculations: CustomsDutyCalculationEntry[]
  valuationAdjustments: CustomsValuationAdjustmentEntry[]
  itemExporters: CustomsPartyEntry[]
  itemSellers: CustomsPartyEntry[]
  itemBuyers: CustomsPartyEntry[]
  domesticDutyTaxParties: CustomsFiscalPartyEntry[]
  mutualRecognitionParties: CustomsPartyEntry[]
  consignor: string
  consignee: string
  destinationCountry: string
  ucr: string
  containerId: string
  freightPaymentMethod: string
  customsValuationMethod: string
  preferenceCode: string
}

export type StandaloneExportDraft = {
  direction: DeclarationDirection
  multideckReference: string
  iCustomsCorrelationId: string | null
  declarationCategory: ExportDeclarationCategory
  declarationType: ExportDeclarationType
  badgeId: string
  ucn: string
  traderReference: string
  internalReference: string
  totalAmount: string
  currency: string
  totalPackages: string
  totalGrossMass: string
  totalNetMass: string
  exporter: string
  exporterName: string
  exporterAddressLine: string
  exporterCity: string
  exporterPostcode: string
  exporterCountry: string
  importer: string
  importerName: string
  importerAddressLine: string
  importerCity: string
  importerPostcode: string
  importerCountry: string
  seller: string
  buyer: string
  consignee: string
  consigneeName: string
  consigneeAddressLine: string
  consigneeCity: string
  consigneePostcode: string
  consigneeCountry: string
  carrier: string
  declarant: string
  declarantName: string
  declarantAddressLine: string
  declarantCity: string
  declarantPostcode: string
  declarantCountry: string
  representative: string
  representationType: string
  authorisationIdentifier: string
  authorisationCategory: string
  exportCountry: string
  destinationCountry: string
  borderNationality: string
  inlandMode: string
  borderIdentificationNumber: string
  borderMode: string
  departureIdentificationNumber: string
  arrivalIdentificationType: string
  arrivalIdentificationNumber: string
  goodsLocationType: string
  goodsLocationName: string
  goodsLocationIdentifier: string
  freightPaymentMethod: string
  isContainerised: string
  gvmsCode: string
  gvmsValue: string
  containerId: string
  sealIdentifier: string
  routingCountry: string
  previousDocumentCategory: string
  previousDocumentType: string
  previousDocumentReference: string
  transactionNature: string
  exchangeRate: string
  tradeTerms: string
  customsValuationMethod: string
  primaryDefermentAccount: string
  secondaryDefermentAccount: string
  freightChargeAmount: string
  freightChargeCurrency: string
  exitOffice: string
  supervisingOffice: string
  presentationOffice: string
  warehouseType: string
  warehouseIdentifier: string
  guaranteeType: string
  guaranteeReference: string
  guaranteeAccessCode: string
  guaranteeOffice: string
  guaranteeAmount: string
  guaranteeCurrency: string
  items: ExportDeclarationItem[]
}

export type DeclarationIssue = {
  id: string
  scope: "general" | "item"
  field: string
  message: string
  itemId?: string
  itemNumber?: number
}

export function createExportDeclarationItem(index = 1): ExportDeclarationItem {
  return {
    id: `item-${index}`,
    commodityCode: "",
    description: "",
    dangerousGoodsCode: "",
    taricCode: "",
    additionalTaricCodes: [],
    nationalCode: "",
    additionalNationalCodes: [],
    cusCode: "",
    packageKind: "",
    packageMarks: "",
    packageCount: "",
    additionalPackageDetails: [],
    transactionNature: "",
    preferentialOrigin: "",
    nonPreferentialOrigin: "",
    procedureCode: "",
    additionalProcedureCode: "",
    additionalProcedureCodes: [],
    tariffQuantity: "",
    grossMass: "",
    netMass: "",
    itemPrice: "",
    currency: "",
    statisticalValue: "",
    previousDocumentCategory: "",
    previousDocumentType: "",
    previousDocumentReference: "",
    additionalPreviousDocuments: [],
    additionalDocumentCategory: "",
    additionalDocumentType: "",
    additionalDocumentId: "",
    additionalDocumentName: "",
    lpcoExemptionCode: "",
    additionalDocumentWriteOff: "",
    additionalDocumentValidityDate: "",
    additionalDocuments: [],
    additionalInformationStatements: [{ id: "additional-information-1", statementCode: "" }],
    dutyCalculations: [{ id: "duty-calculation-1", taxType: "", paymentMethod: "", baseQuantity: "", unitCode: "", declaredTax: "" }],
    valuationAdjustments: [],
    itemExporters: [{ id: "item-exporter-1", partyId: "" }],
    itemSellers: [{ id: "item-seller-1", partyId: "" }],
    itemBuyers: [{ id: "item-buyer-1", partyId: "" }],
    domesticDutyTaxParties: [{ id: "domestic-duty-tax-party-1", partyId: "", roleCode: "" }],
    mutualRecognitionParties: [{ id: "mutual-recognition-party-1", partyId: "" }],
    consignor: "",
    consignee: "",
    destinationCountry: "",
    ucr: "",
    containerId: "",
    freightPaymentMethod: "",
    customsValuationMethod: "",
    preferenceCode: "",
  }
}

export function createStandaloneDeclarationDraft(direction: DeclarationDirection): StandaloneExportDraft {
  return {
    direction,
    multideckReference: "",
    iCustomsCorrelationId: null,
    declarationCategory: "",
    declarationType: "",
    badgeId: "",
    ucn: "",
    traderReference: "",
    internalReference: "",
    totalAmount: "",
    currency: "",
    totalPackages: "",
    totalGrossMass: "",
    totalNetMass: "",
    exporter: "",
    exporterName: "",
    exporterAddressLine: "",
    exporterCity: "",
    exporterPostcode: "",
    exporterCountry: "",
    importer: "",
    importerName: "",
    importerAddressLine: "",
    importerCity: "",
    importerPostcode: "",
    importerCountry: direction === "import" ? "GB" : "",
    seller: "",
    buyer: "",
    consignee: "",
    consigneeName: "",
    consigneeAddressLine: "",
    consigneeCity: "",
    consigneePostcode: "",
    consigneeCountry: "",
    carrier: "",
    declarant: "",
    declarantName: "",
    declarantAddressLine: "",
    declarantCity: "",
    declarantPostcode: "",
    declarantCountry: direction === "import" ? "GB" : "",
    representative: "",
    representationType: "",
    authorisationIdentifier: "",
    authorisationCategory: "",
    exportCountry: "",
    destinationCountry: direction === "import" ? "GB" : "",
    borderNationality: "",
    inlandMode: "",
    borderIdentificationNumber: "",
    borderMode: "",
    departureIdentificationNumber: "",
    arrivalIdentificationType: "",
    arrivalIdentificationNumber: "",
    goodsLocationType: "",
    goodsLocationName: "",
    goodsLocationIdentifier: "",
    freightPaymentMethod: "",
    isContainerised: "",
    gvmsCode: "",
    gvmsValue: "",
    containerId: "",
    sealIdentifier: "",
    routingCountry: "",
    previousDocumentCategory: "",
    previousDocumentType: "",
    previousDocumentReference: "",
    transactionNature: "",
    exchangeRate: "",
    tradeTerms: "",
    customsValuationMethod: "",
    primaryDefermentAccount: "",
    secondaryDefermentAccount: "",
    freightChargeAmount: "",
    freightChargeCurrency: "",
    exitOffice: "",
    supervisingOffice: "",
    presentationOffice: "",
    warehouseType: "",
    warehouseIdentifier: "",
    guaranteeType: "",
    guaranteeReference: "",
    guaranteeAccessCode: "",
    guaranteeOffice: "",
    guaranteeAmount: "",
    guaranteeCurrency: "",
    items: [createExportDeclarationItem()],
  }
}

export function createStandaloneExportDraft(): StandaloneExportDraft {
  return createStandaloneDeclarationDraft("export")
}

export function createStandaloneImportDraft(): StandaloneExportDraft {
  return createStandaloneDeclarationDraft("import")
}

function positive(value: string) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

export function validateStandaloneExportDraft(draft: StandaloneExportDraft): DeclarationIssue[] {
  const issues: DeclarationIssue[] = []
  const requireGeneral = (field: keyof StandaloneExportDraft, message: string) => {
    const value = draft[field]
    if (typeof value === "string" && !value.trim()) issues.push({ id: `general-${String(field)}`, scope: "general", field: String(field), message })
  }

  requireGeneral("declarationCategory", "Select a declaration category.")
  requireGeneral("declarationType", "Select a declaration type.")
  if (draft.direction === "export") requireGeneral("internalReference", "Add an internal reference.")
  if (draft.traderReference.trim() && !/^[A-Z0-9]{1,19}$/.test(draft.traderReference.trim())) {
    issues.push({ id: "general-trader-reference-format", scope: "general", field: "traderReference", message: "Use up to 19 uppercase letters and numbers for the trader reference." })
  }
  requireGeneral("currency", "Select the declaration currency.")
  if (draft.direction === "import") requireGeneral("importer", "Select or add the importer.")
  requireGeneral("exporter", "Select or add the exporter.")
  if (draft.direction === "export") requireGeneral("consignee", "Select or add the consignee.")
  requireGeneral("declarant", "Select the declarant.")
  const requiredPartyContacts = [
    ...(draft.direction === "import" ? [["importer", ["importerName", "importerAddressLine", "importerCity", "importerPostcode", "importerCountry"]] as const] : []),
    ["exporter", ["exporterName", "exporterAddressLine", "exporterCity", "exporterPostcode", "exporterCountry"]] as const,
    ...(draft.direction === "export" ? [["consignee", ["consigneeName", "consigneeAddressLine", "consigneeCity", "consigneePostcode", "consigneeCountry"]] as const] : []),
    ["declarant", ["declarantName", "declarantAddressLine", "declarantCity", "declarantPostcode", "declarantCountry"]] as const,
  ] as const
  const contactFieldLabels = ["Name", "Street", "City", "Postcode", "Country"] as const
  for (const [party, fields] of requiredPartyContacts) {
    const missingFields = fields.flatMap((field, index) => !draft[field].trim() ? [{ field, label: contactFieldLabels[index] }] : [])
    if (missingFields.length) {
      issues.push({
        id: `general-${party}-contact`,
        scope: "general",
        field: missingFields[0].field,
        message: `This contact is missing: ${missingFields.map(({ label }) => label).join(", ")}.`,
      })
    }
  }
  requireGeneral("exportCountry", "Select the export country.")
  requireGeneral("destinationCountry", "Select the destination country.")
  requireGeneral("borderMode", "Select the transport mode at the border.")
  requireGeneral("transactionNature", "Select the nature of transaction.")
  if (draft.direction === "import") {
    requireGeneral("representationType", "Select the type of representation.")
    requireGeneral("tradeTerms", "Add the trade terms.")
    requireGeneral("goodsLocationIdentifier", "Add the goods location identifier used for the trade terms.")
    if (draft.tradeTerms.trim() && !/^[A-Z]{3}$/.test(draft.tradeTerms.trim())) {
      issues.push({ id: "general-trade-terms-format", scope: "general", field: "tradeTerms", message: "Use the three-letter trade terms code." })
    }
    if (draft.authorisationIdentifier.trim() || draft.authorisationCategory.trim()) {
      if (!draft.authorisationIdentifier.trim() || !/^[A-Z0-9]{1,3}$/.test(draft.authorisationCategory.trim().toUpperCase())) {
        issues.push({ id: "general-authorisation", scope: "general", field: !draft.authorisationIdentifier.trim() ? "authorisationIdentifier" : "authorisationCategory", message: "Complete both the authorisation identifier and category." })
      }
    }
  }
  if (draft.direction === "export") requireGeneral("exitOffice", "Select the customs office of exit.")
  if (draft.direction === "export") {
    requireGeneral("previousDocumentCategory", "Select the previous document category.")
    requireGeneral("previousDocumentType", "Select the previous document type.")
    requireGeneral("previousDocumentReference", "Add the previous document reference.")
    if (draft.previousDocumentReference.trim() && !/^[A-Za-z0-9]{1,35}$/.test(draft.previousDocumentReference.trim())) {
      issues.push({ id: "general-previous-document-reference-format", scope: "general", field: "previousDocumentReference", message: "Use up to 35 letters and numbers for the previous document reference." })
    }
  }

  const headerTotals = [
    ["totalAmount", draft.totalAmount, "Enter a total amount greater than zero."],
    ["totalPackages", draft.totalPackages, "Enter at least one package."],
    ["totalGrossMass", draft.totalGrossMass, "Enter a gross mass greater than zero."],
    ...(draft.direction === "export" ? [["totalNetMass", draft.totalNetMass, "Enter a net mass greater than zero."] as const] : []),
  ] as const
  for (const [field, value, message] of headerTotals) {
    if (!positive(value)) issues.push({ id: `general-${field}`, scope: "general", field, message })
  }

  if (positive(draft.totalPackages) && !Number.isInteger(Number(draft.totalPackages))) {
    issues.push({ id: "general-package-whole", scope: "general", field: "totalPackages", message: "Enter a whole total package count." })
  }

  if (draft.direction === "export" && draft.totalGrossMass && draft.totalNetMass && Number(draft.totalNetMass) > Number(draft.totalGrossMass)) {
    issues.push({ id: "general-net-mass", scope: "general", field: "totalNetMass", message: "Net mass cannot exceed gross mass." })
  }

  if (draft.isContainerised === "1" && !draft.containerId.trim()) {
    issues.push({ id: "general-container", scope: "general", field: "containerId", message: "Add the container identification number." })
  }

  if (!draft.goodsLocationName.trim() && !draft.goodsLocationIdentifier.trim()) {
    issues.push({ id: "general-goods-location", scope: "general", field: "goodsLocationName", message: "Add the goods location name or identifier." })
  }

  draft.items.forEach((item, index) => {
    const push = (field: keyof ExportDeclarationItem, message: string) => issues.push({
      id: `${item.id}-${String(field)}`,
      scope: "item",
      field: String(field),
      itemId: item.id,
      itemNumber: index + 1,
      message,
    })
    if (!/^\d{10}$/.test(item.commodityCode)) push("commodityCode", "Enter a 10-digit commodity code.")
    if (!item.description.trim()) push("description", "Add a goods description.")
    if (!item.packageKind) push("packageKind", "Select a package kind.")
    if (!item.packageMarks.trim()) push("packageMarks", "Add package marks.")
    if (!positive(item.packageCount) || !Number.isInteger(Number(item.packageCount))) push("packageCount", "Enter a whole package count.")
    if (!item.procedureCode) push("procedureCode", "Select a procedure code.")
    if (!item.additionalProcedureCode) push("additionalProcedureCode", "Select an additional procedure code.")
    if (!item.nonPreferentialOrigin) push("nonPreferentialOrigin", "Select an origin country.")
    if (!positive(item.grossMass)) push("grossMass", "Enter a gross mass.")
    if (!positive(item.netMass)) push("netMass", "Enter a net mass.")
    if (positive(item.grossMass) && positive(item.netMass) && Number(item.netMass) > Number(item.grossMass)) push("netMass", "Net mass cannot exceed gross mass.")
    if (!positive(item.itemPrice)) push("itemPrice", "Enter an item price.")
    if (!item.currency) push("currency", "Select the item currency.")
    if (item.currency && draft.currency && item.currency !== draft.currency) push("currency", "Use the declaration currency for every item.")
    if (!positive(item.statisticalValue)) push("statisticalValue", "Enter a statistical value.")
    if (draft.direction === "import" && !item.previousDocumentCategory) push("previousDocumentCategory", "Select the previous document category.")
    if (!item.previousDocumentType) push("previousDocumentType", "Select the previous document type.")
    if (!item.previousDocumentReference.trim()) push("previousDocumentReference", "Add a previous document reference.")
    if (item.previousDocumentReference.trim() && !/^[A-Za-z0-9]{1,35}$/.test(item.previousDocumentReference.trim())) push("previousDocumentReference", "Use up to 35 letters and numbers for the previous document reference.")
    if (draft.direction === "import" && !item.customsValuationMethod.trim()) push("customsValuationMethod", "Add the customs valuation method.")
    if (draft.direction === "import" && !/^\d{3}$/.test(item.preferenceCode.trim())) push("preferenceCode", "Add the three-digit preference code.")
    item.additionalPackageDetails.forEach((entry) => {
      if ((entry.kind || entry.marks || entry.count) && (!entry.kind || !entry.marks.trim() || !positive(entry.count) || !Number.isInteger(Number(entry.count)))) push("additionalPackageDetails", "Complete every added package detail.")
    })
    item.additionalProcedureCodes.forEach((entry) => {
      if (entry.code && !/^[A-Za-z0-9]{3}$/.test(entry.code)) push("additionalProcedureCodes", "Use a three-character additional procedure code.")
    })
    item.additionalPreviousDocuments.forEach((entry) => {
      if ((entry.category || entry.type || entry.reference) && ((draft.direction === "import" && !entry.category) || !entry.type || !/^[A-Za-z0-9]{1,35}$/.test(entry.reference))) push("additionalPreviousDocuments", "Complete every added previous document.")
    })
    const additionalDocuments = [{ category: item.additionalDocumentCategory, type: item.additionalDocumentType, reference: item.additionalDocumentId }, ...item.additionalDocuments]
    additionalDocuments.forEach((entry) => {
      if ((entry.category || entry.type || entry.reference) && (!entry.category || !entry.type || !entry.reference.trim())) push("additionalDocuments", "Complete every added document category, type and ID.")
    })
    item.dutyCalculations.forEach((entry) => {
      if ((entry.taxType || entry.paymentMethod || entry.baseQuantity || entry.unitCode || entry.declaredTax) && (!entry.taxType || !positive(entry.baseQuantity) || !entry.unitCode)) push("dutyCalculations", "Complete every added duty calculation.")
    })
    item.valuationAdjustments.forEach((entry) => {
      if ((entry.code || entry.currency || entry.amount) && (!entry.code || !entry.currency || !positive(entry.amount))) push("valuationAdjustments", "Complete every addition or deduction.")
    })
    item.domesticDutyTaxParties.forEach((entry) => {
      if ((entry.partyId || entry.roleCode) && (!entry.partyId || !/^(?:FR[1-5]|FR7)$/i.test(entry.roleCode))) push("domesticDutyTaxParties", "Complete every domestic duty tax party.")
    })
  })

  const packageTotal = draft.items.reduce((total, item) => total + (Number(item.packageCount) || 0) + item.additionalPackageDetails.reduce((itemTotal, entry) => itemTotal + (Number(entry.count) || 0), 0), 0)
  const grossMassTotal = draft.items.reduce((total, item) => total + (Number(item.grossMass) || 0), 0)
  const netMassTotal = draft.items.reduce((total, item) => total + (Number(item.netMass) || 0), 0)
  const amountTotal = draft.items.reduce((total, item) => total + (Number(item.itemPrice) || 0), 0)
  const nearlyEqual = (left: number, right: number, tolerance = 0.005) => Math.abs(left - right) <= Math.max(tolerance, Math.abs(left) * 0.00001)
  if (positive(draft.totalPackages) && Number(draft.totalPackages) !== packageTotal) issues.push({ id: "general-package-total", scope: "general", field: "totalPackages", message: "The declaration package total must match the goods items." })
  if (positive(draft.totalGrossMass) && !nearlyEqual(Number(draft.totalGrossMass), grossMassTotal)) issues.push({ id: "general-gross-total", scope: "general", field: "totalGrossMass", message: "The declaration gross mass must match the goods items." })
  if (draft.direction === "export" && positive(draft.totalNetMass) && !nearlyEqual(Number(draft.totalNetMass), netMassTotal)) issues.push({ id: "general-net-total", scope: "general", field: "totalNetMass", message: "The declaration net mass must match the goods items." })
  if (positive(draft.totalAmount) && !nearlyEqual(Number(draft.totalAmount), amountTotal, 0.01)) issues.push({ id: "general-amount-total", scope: "general", field: "totalAmount", message: "The declaration amount must match the goods items." })

  return issues
}

export function declarationCompletion(draft: StandaloneExportDraft) {
  const issues = validateStandaloneExportDraft(draft)
  const totalChecks = (draft.direction === "import" ? 30 : 28) + draft.items.length * (draft.direction === "import" ? 20 : 17)
  const completeChecks = Math.max(0, totalChecks - issues.length)
  return { completeChecks, totalChecks, percent: Math.round((completeChecks / totalChecks) * 100), issues }
}
