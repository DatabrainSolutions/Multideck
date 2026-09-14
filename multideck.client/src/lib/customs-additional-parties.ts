import type { ApiCustomerDetail } from "./customer-api"
import type { StandaloneExportDraft } from "./customs-declaration"
import { importerCompanyPatch, formattedImporterAddress } from "./customs-importer.ts"

export type AdditionalCustomsParty = "seller" | "buyer" | "representative"
export const additionalPartySuffixes = ["Name", "AddressLine", "City", "Postcode", "Country", "Eori", "OrganisationId", "AddressId"] as const

export function additionalPartyCompanyPatch(party: AdditionalCustomsParty, company: ApiCustomerDetail, addressId?: string): Partial<StandaloneExportDraft> {
  const source = importerCompanyPatch(company, addressId)
  if (!source.importerOrganisationId) return {}
  return { [party]: company.name, ...Object.fromEntries(additionalPartySuffixes.map(suffix => [`${party}${suffix}`, source[`importer${suffix}`]])) }
}

export function clearAdditionalParty(party: AdditionalCustomsParty): Partial<StandaloneExportDraft> {
  return { [party]: "", ...Object.fromEntries(additionalPartySuffixes.map(suffix => [`${party}${suffix}`, ""])) }
}

export function formattedAdditionalPartyAddress(party: AdditionalCustomsParty, draft: StandaloneExportDraft) {
  return formattedImporterAddress({ importerAddressLine: draft[`${party}AddressLine`] ?? "", importerCity: draft[`${party}City`] ?? "", importerPostcode: draft[`${party}Postcode`] ?? "", importerCountry: draft[`${party}Country`] ?? "" })
}
