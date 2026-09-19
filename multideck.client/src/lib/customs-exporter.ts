import type { ApiCustomerDetail } from "./customer-api"
import type { StandaloneExportDraft } from "./customs-declaration"
import { importerCompanyPatch, formattedImporterAddress } from "./customs-importer.ts"

// Reuse address and office-EORI resolution, but never copy importer payment defaults.
export function exporterCompanyPatch(company: ApiCustomerDetail, addressId?: string): Partial<StandaloneExportDraft> {
  const source = importerCompanyPatch(company, addressId)
  if (!source.importerOrganisationId) return {}
  return {
    exporter: source.importer, exporterName: source.importerName,
    exporterOrganisationId: source.importerOrganisationId, exporterAddressId: source.importerAddressId,
    exporterEori: source.importerEori, exporterAddressLine: source.importerAddressLine,
    exporterCity: source.importerCity, exporterPostcode: source.importerPostcode, exporterCountry: source.importerCountry,
  }
}

export function formattedExporterAddress(draft: StandaloneExportDraft) {
  return formattedImporterAddress({ importerAddressLine: draft.exporterAddressLine, importerCity: draft.exporterCity, importerPostcode: draft.exporterPostcode, importerCountry: draft.exporterCountry })
}
