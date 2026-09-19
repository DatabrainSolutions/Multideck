/** Structure validation only; this does not verify registration or authority. */
export function customsImporterProfileErrors(value: unknown): string[] {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const errors: string[] = []
  const eoriValid = (text: string) => /^(?:GB|XI)\d{12}$/.test(text) || (!/^(?:GB|XI)/.test(text) && /^[A-Z]{2}[A-Z0-9]{3,15}$/.test(text))
  for (const key of ["eoriNumber", "cguHolderEori", "dpoHolderEori"]) {
    if (data[key] != null && data[key] !== "" && (typeof data[key] !== "string" || !eoriValid((data[key] as string).trim()))) errors.push(`Check ${key === "eoriNumber" ? "the company EORI" : key === "cguHolderEori" ? "the CGU holder EORI" : "the DPO holder EORI"}.`)
  }
  if (data.addressEoris != null) {
    if (typeof data.addressEoris !== "object" || Array.isArray(data.addressEoris)) errors.push("Office EORI numbers must be grouped by address.")
    else for (const entry of Object.values(data.addressEoris)) if (entry !== "" && (typeof entry !== "string" || !eoriValid(entry.trim()))) errors.push("Check the registered EORI for each office address.")
  }
  for (const key of ["dutyPaymentMethod", "vatPaymentMethod"]) {
    if (data[key] != null && data[key] !== "" && (typeof data[key] !== "string" || !/^[A-Z]$/.test(data[key] as string))) errors.push("Use a single-letter payment method code.")
  }
  if (data.defermentAccount != null && data.defermentAccount !== "" && (typeof data.defermentAccount !== "string" || !/^\d{7}$/.test((data.defermentAccount as string).trim()))) errors.push("Use the seven-digit deferment account number.")
  for (const key of ["cguDocumentId", "dpoDocumentId"]) {
    if (data[key] != null && data[key] !== "" && (typeof data[key] !== "string" || !/^[A-Z0-9-]{1,35}$/.test(data[key] as string))) errors.push("Use the full registered document ID, up to 35 letters, numbers or hyphens.")
  }
  return [...new Set(errors)]
}

export function importDefermentIssues(value: unknown): { field: string; itemIndex?: number; message: string }[] {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const rows = (value: unknown) => Array.isArray(value) ? value.map(record) : []
  const text = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : ""
  const data = record(value)
  const issues: { field: string; itemIndex?: number; message: string }[] = []
  let anyDeferred = false, dutyDeferred = false
  rows(data.items).forEach((item, itemIndex) => {
    const deferred = rows(item.dutyCalculations).filter(entry => ["E", "R"].includes(text(entry.paymentMethod)) && text(entry.taxType))
    if (deferred.length) anyDeferred = true
    if (!deferred.some(entry => /^A\d{2}$/.test(text(entry.taxType)))) return
    dutyDeferred = true
    const documents = [{ category: item.additionalDocumentCategory, type: item.additionalDocumentType, reference: item.additionalDocumentId, name: item.additionalDocumentName }, ...rows(item.additionalDocuments)]
    for (const type of ["505", "506"]) if (!documents.some(doc => text(doc.category) === "C" && text(doc.type) === type && (text(doc.reference) || text(doc.name)))) issues.push({ field: "additionalDocuments", itemIndex, message: `Add C${type} for deferred customs duty on item ${itemIndex + 1}.` })
  })
  if (anyDeferred && !text(data.primaryDefermentAccount)) issues.push({ field: "primaryDefermentAccount", message: "Add the deferment account used for payment code E or R." })
  if (dutyDeferred) {
    const holders = [{ category: data.authorisationCategory, identifier: data.authorisationIdentifier }, ...rows(data.additionalAuthorisationHolders)]
    for (const category of ["CGU", "DPO"]) if (!holders.some(holder => text(holder.category) === category && text(holder.identifier))) issues.push({ field: "additionalAuthorisationHolders", message: `Add the ${category} holder EORI for deferred customs duty.` })
  }
  return issues
}
