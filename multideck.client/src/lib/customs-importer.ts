import type { ApiCustomerDetail } from "./customer-api"
import type { ExportDeclarationItem, StandaloneExportDraft } from "./customs-declaration"

export type ImporterPaymentDefaults = {
  dutyPaymentMethod: string
  vatPaymentMethod: string
  defermentAccount: string
  cguDocumentId: string
  dpoDocumentId: string
  cguHolderEori: string
  dpoHolderEori: string
}

export function customsText(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" ? (data[key] as string).trim() : ""
}

export function importerPaymentDefaults(data: Record<string, unknown>): ImporterPaymentDefaults {
  return Object.fromEntries(["dutyPaymentMethod", "vatPaymentMethod", "defermentAccount", "cguDocumentId", "dpoDocumentId", "cguHolderEori", "dpoHolderEori"].map(key => [key, customsText(data, key)])) as ImporterPaymentDefaults
}

export function importerCompanyPatch(company: ApiCustomerDetail, addressId?: string): Partial<StandaloneExportDraft> {
  const address = addressId ? company.addresses.find(address => address.id === addressId) : company.address
  if (addressId && !address) return {}
  const customs = company.operations?.customs ?? {}
  const overrides = customs.addressEoris && typeof customs.addressEoris === "object" && !Array.isArray(customs.addressEoris) ? customs.addressEoris as Record<string, unknown> : {}
  return {
    importer: company.name, importerName: company.name,
    importerOrganisationId: company.id, importerAddressId: address?.id ?? "",
    importerEori: customsText(overrides, address?.id ?? "") || customsText(customs, "eoriNumber"),
    importerAddressLine: [address?.line1, address?.line2].filter(Boolean).join("\n"),
    importerCity: address?.townCity ?? "", importerPostcode: address?.postZipCode ?? "",
    importerCountry: address?.countryCode?.toUpperCase() ?? "",
    importerPaymentDefaults: importerPaymentDefaults(customs),
  }
}

export function formattedImporterAddress(draft: Pick<StandaloneExportDraft, "importerAddressLine" | "importerCity" | "importerPostcode" | "importerCountry">, countryName?: string) {
  const locality = [draft.importerCity, draft.importerPostcode].filter(Boolean)
  // Never parse a presentation string back into structured customs fields.
  if (["DE", "FR", "ES", "IT", "NL", "BE", "CH", "AT"].includes(draft.importerCountry)) locality.reverse()
  return [draft.importerAddressLine, locality.join(["GB", "IE"].includes(draft.importerCountry) ? "\n" : " "), countryName || draft.importerCountry].filter(Boolean).join("\n")
}

const deferred = (method: string) => ["E", "R"].includes(method.toUpperCase())

export function applyImporterItemDefaults(item: ExportDeclarationItem, defaults?: ImporterPaymentDefaults): ExportDeclarationItem {
  if (!defaults) return item
  const dutyCalculations = item.dutyCalculations.map(entry => ({
    ...entry,
    paymentMethod: entry.paymentMethod || (/^A\d{2}$/i.test(entry.taxType) ? defaults.dutyPaymentMethod : entry.taxType.toUpperCase() === "B00" ? defaults.vatPaymentMethod : ""),
  }))
  const requiresDutyAuthorities = dutyCalculations.some(entry => /^A\d{2}$/i.test(entry.taxType) && deferred(entry.paymentMethod))
  const documents = [...item.additionalDocuments]
  if (requiresDutyAuthorities) {
    for (const [type, reference] of [["505", defaults.cguDocumentId], ["506", defaults.dpoDocumentId]]) {
      // Preserve an existing document, including an intentional exception.
      if (!reference || (item.additionalDocumentCategory === "C" && item.additionalDocumentType === type) || documents.some(doc => doc.category === "C" && doc.type === type)) continue
      documents.push({ id: `importer-default-${type}-${item.id}`, category: "C", type, reference, name: "", lpcoExemptionCode: "", writeOff: "", validityDate: "" })
    }
  }
  return { ...item, dutyCalculations, additionalDocuments: documents }
}

export function applyImporterDefaults(draft: StandaloneExportDraft): StandaloneExportDraft {
  const defaults = draft.importerPaymentDefaults
  if (draft.direction !== "import" || !defaults) return draft
  const items = draft.items.map(item => applyImporterItemDefaults(item, defaults))
  const dutyDeferred = items.some(item => item.dutyCalculations.some(entry => /^A\d{2}$/i.test(entry.taxType) && deferred(entry.paymentMethod)))
  const anyDeferred = items.some(item => item.dutyCalculations.some(entry => deferred(entry.paymentMethod)))
  const holders = [...(draft.additionalAuthorisationHolders ?? [])]
  if (dutyDeferred) for (const [category, identifier] of [["CGU", defaults.cguHolderEori], ["DPO", defaults.dpoHolderEori]]) {
    if (!identifier || draft.authorisationCategory === category || holders.some(holder => holder.category === category)) continue
    holders.push({ id: `importer-default-${category}`, category, identifier })
  }
  return { ...draft, items, primaryDefermentAccount: draft.primaryDefermentAccount || (anyDeferred ? defaults.defermentAccount : ""), additionalAuthorisationHolders: holders }
}
