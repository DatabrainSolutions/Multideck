export type ExportDeclarationCategory = string
export type ExportDeclarationType = string

export type ExportDeclarationItem = {
  id: string
  commodityCode: string
  description: string
  dangerousGoodsCode: string
  taricCode: string
  nationalCode: string
  cusCode: string
  packageKind: string
  packageMarks: string
  packageCount: string
  transactionNature: string
  preferentialOrigin: string
  nonPreferentialOrigin: string
  procedureCode: string
  additionalProcedureCode: string
  tariffQuantity: string
  grossMass: string
  netMass: string
  itemPrice: string
  currency: string
  statisticalValue: string
  previousDocumentType: string
  previousDocumentReference: string
  additionalDocumentCategory: string
  additionalDocumentId: string
  additionalDocumentName: string
  lpcoExemptionCode: string
  consignor: string
  consignee: string
  destinationCountry: string
  ucr: string
  containerId: string
  freightPaymentMethod: string
}

export type StandaloneExportDraft = {
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
  consignee: string
  carrier: string
  declarant: string
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
    nationalCode: "",
    cusCode: "",
    packageKind: "",
    packageMarks: "",
    packageCount: "",
    transactionNature: "",
    preferentialOrigin: "",
    nonPreferentialOrigin: "",
    procedureCode: "",
    additionalProcedureCode: "",
    tariffQuantity: "",
    grossMass: "",
    netMass: "",
    itemPrice: "",
    currency: "",
    statisticalValue: "",
    previousDocumentType: "",
    previousDocumentReference: "",
    additionalDocumentCategory: "",
    additionalDocumentId: "",
    additionalDocumentName: "",
    lpcoExemptionCode: "",
    consignor: "",
    consignee: "",
    destinationCountry: "",
    ucr: "",
    containerId: "",
    freightPaymentMethod: "",
  }
}

export function createStandaloneExportDraft(): StandaloneExportDraft {
  return {
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
    consignee: "",
    carrier: "",
    declarant: "",
    representative: "",
    representationType: "",
    authorisationIdentifier: "",
    authorisationCategory: "",
    exportCountry: "",
    destinationCountry: "",
    borderNationality: "",
    inlandMode: "",
    borderIdentificationNumber: "",
    borderMode: "",
    departureIdentificationNumber: "",
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
  requireGeneral("traderReference", "Add a trader reference number.")
  requireGeneral("currency", "Select the declaration currency.")
  requireGeneral("exporter", "Select or add the exporter.")
  requireGeneral("consignee", "Select or add the consignee.")
  requireGeneral("declarant", "Select the declarant.")
  requireGeneral("exportCountry", "Select the export country.")
  requireGeneral("destinationCountry", "Select the destination country.")
  requireGeneral("borderMode", "Select the transport mode at the border.")
  requireGeneral("exitOffice", "Select the customs office of exit.")
  requireGeneral("previousDocumentCategory", "Select the previous document category.")
  requireGeneral("previousDocumentType", "Select the previous document type.")
  requireGeneral("previousDocumentReference", "Add the previous document reference.")

  for (const [field, value, message] of [
    ["totalAmount", draft.totalAmount, "Enter a total amount greater than zero."],
    ["totalPackages", draft.totalPackages, "Enter at least one package."],
    ["totalGrossMass", draft.totalGrossMass, "Enter a gross mass greater than zero."],
    ["totalNetMass", draft.totalNetMass, "Enter a net mass greater than zero."],
  ] as const) {
    if (!positive(value)) issues.push({ id: `general-${field}`, scope: "general", field, message })
  }

  if (draft.totalGrossMass && draft.totalNetMass && Number(draft.totalNetMass) > Number(draft.totalGrossMass)) {
    issues.push({ id: "general-net-mass", scope: "general", field: "totalNetMass", message: "Net mass cannot exceed gross mass." })
  }

  if (draft.isContainerised === "1" && !draft.containerId.trim()) {
    issues.push({ id: "general-container", scope: "general", field: "containerId", message: "Add the container identification number." })
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
    if (!positive(item.packageCount)) push("packageCount", "Enter a package count.")
    if (!item.procedureCode) push("procedureCode", "Select a procedure code.")
    if (!item.additionalProcedureCode) push("additionalProcedureCode", "Select an additional procedure code.")
    if (!item.nonPreferentialOrigin) push("nonPreferentialOrigin", "Select an origin country.")
    if (!positive(item.grossMass)) push("grossMass", "Enter a gross mass.")
    if (!positive(item.netMass)) push("netMass", "Enter a net mass.")
    if (!positive(item.itemPrice)) push("itemPrice", "Enter an item price.")
    if (!item.currency) push("currency", "Select the item currency.")
    if (!positive(item.statisticalValue)) push("statisticalValue", "Enter a statistical value.")
    if (!item.previousDocumentType) push("previousDocumentType", "Select the previous document type.")
    if (!item.previousDocumentReference.trim()) push("previousDocumentReference", "Add a previous document reference.")
  })

  return issues
}

export function declarationCompletion(draft: StandaloneExportDraft) {
  const issues = validateStandaloneExportDraft(draft)
  const totalChecks = 18 + draft.items.length * 15
  const completeChecks = Math.max(0, totalChecks - issues.length)
  return { completeChecks, totalChecks, percent: Math.round((completeChecks / totalChecks) * 100), issues }
}
