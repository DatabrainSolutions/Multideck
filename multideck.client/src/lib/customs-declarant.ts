import type { StandaloneExportDraft } from "./customs-declaration.ts"
import type { ApiCustomerDetail } from "./customer-api"
import { importerCompanyPatch, formattedImporterAddress } from "./customs-importer.ts"

export function declarantCompanyPatch(company: ApiCustomerDetail, addressId?: string): Partial<StandaloneExportDraft> {
  const source = importerCompanyPatch(company, addressId)
  if (!source.importerOrganisationId) return {}
  return {
    declarant: source.importer, declarantName: source.importerName,
    declarantOrganisationId: source.importerOrganisationId, declarantAddressId: source.importerAddressId,
    declarantEori: source.importerEori, declarantAddressLine: source.importerAddressLine,
    declarantCity: source.importerCity, declarantPostcode: source.importerPostcode, declarantCountry: source.importerCountry,
  }
}

export function formattedDeclarantAddress(draft: StandaloneExportDraft) {
  return formattedImporterAddress({ importerAddressLine: draft.declarantAddressLine, importerCity: draft.declarantCity, importerPostcode: draft.declarantPostcode, importerCountry: draft.declarantCountry })
}

export function applyTenantDeclarantDefault(draft: StandaloneExportDraft, tenant: { name: string; eori?: string } | null): StandaloneExportDraft {
  if (draft.direction !== "import" || !tenant?.name || draft.declarant || draft.declarantName || draft.declarantAddressLine || draft.declarantCity || draft.declarantPostcode || draft.declarantEori !== undefined) return draft
  return { ...draft, declarant: tenant.name, declarantName: tenant.name, declarantEori: tenant.eori ?? "" }
}
