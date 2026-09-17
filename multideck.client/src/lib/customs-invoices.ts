import { customsToday, fetchHmrcMonthlyRates, selectHmrcExchangeRate } from "../../../supabase/functions/_shared/customs-hmrc-exchange-rates.mts"
import type { ExportDeclarationItem, StandaloneExportDraft } from "./customs-declaration"
import { emptyCustomsInvoiceHeader, invoiceNumberKey, type CustomsInvoiceHeader } from "../../../supabase/functions/_shared/customs-invoices.mts"

/** Upgrade only recognisable old invoice-import rows. Never infer an invoice from a customs document. */
export function restoreCustomsInvoiceHeaders(draft: StandaloneExportDraft): StandaloneExportDraft {
  if (Array.isArray(draft.invoiceHeaders)) return { ...draft, invoiceHeaders: draft.invoiceHeaders.map(header => ({ ...emptyCustomsInvoiceHeader(header.id), ...header })) }
  const invoiceHeaders: CustomsInvoiceHeader[] = []
  const items = draft.items.map(item => {
    if (item.invoiceHeaderId || !item.id.startsWith("invoice-") || item.previousDocumentType || !item.previousDocumentReference.trim()) return item
    const number = item.previousDocumentReference.trim()
    let header = invoiceHeaders.find(candidate => invoiceNumberKey(candidate.invoiceNumber) === invoiceNumberKey(number))
    if (!header) {
      header = { ...emptyCustomsInvoiceHeader(`legacy-invoice-${invoiceHeaders.length + 1}`), invoiceNumber: number, currency: item.currency }
      invoiceHeaders.push(header)
    }
    return { ...item, invoiceHeaderId: header.id }
  })
  const inferredHeaderCount = invoiceHeaders.length
  const legacyValues = {
    totalAmount: draft.totalAmount, currency: draft.currency, exchangeRate: draft.exchangeRate,
    tradeTerms: draft.tradeTerms, tradeTermsLocation: draft.tradeTermsLocation,
    transactionNature: draft.transactionNature, grossMass: draft.totalGrossMass,
    netMass: draft.totalNetMass, packageCount: draft.totalPackages,
  }
  const hasLegacyValues = Object.entries(legacyValues).some(([field, value]) => field !== "transactionNature" && Boolean(value?.trim()))
  if (!invoiceHeaders.length && hasLegacyValues) invoiceHeaders.push(emptyCustomsInvoiceHeader("legacy-invoice-1"))
  if (invoiceHeaders.length === 1) {
    const header = invoiceHeaders[0]
    for (const [field, value] of Object.entries(legacyValues)) {
      if (value?.trim()) Object.assign(header, { [field]: value })
    }
    return { ...draft, invoiceHeaders, items: inferredHeaderCount ? items : items.map(item => ({ ...item, invoiceHeaderId: item.invoiceHeaderId || header.id })) }
  }
  // A declaration total cannot be allocated to several invoices without evidence.
  // Retain the original summary for the operator to reconcile instead of copying
  // the total into every invoice or losing it when derived totals are saved.
  return { ...draft, invoiceHeaders, items, ...(hasLegacyValues && invoiceHeaders.length > 1 ? { invoiceLegacySummary: legacyValues } : {}) }

}

/** Reimporting the same invoice reuses its identity and never overwrites reviewed header details. */
export function applyCustomsInvoiceImport(draft: StandaloneExportDraft, items: ExportDeclarationItem[], mode: "replace" | "append" | "header", imported: CustomsInvoiceHeader): StandaloneExportDraft {
  const headers = draft.invoiceHeaders ?? []
  const existing = headers.find(header => invoiceNumberKey(header.invoiceNumber) === invoiceNumberKey(imported.invoiceNumber))
  const populatedFields = existing ? Object.entries(imported).filter(([field, value]) => field !== "id" && field !== "exchangeRate" && typeof value === "string" && value && !existing[field as keyof CustomsInvoiceHeader]).map(([field]) => field) : []
  const header = existing ? { ...existing, ...Object.fromEntries(populatedFields.map(field => [field, imported[field as keyof CustomsInvoiceHeader]])), ...(populatedFields.length ? { extractedFields: [...new Set([...(existing.extractedFields ?? []), ...populatedFields])], extractionAppliedAt: imported.extractionAppliedAt, sourceExtractionId: imported.sourceExtractionId } : {}) } : imported
  const linkedItems = items.map(item => ({ ...item, invoiceHeaderId: header.id }))
  return { ...draft, invoiceHeaders: existing ? headers.map(candidate => candidate.id === existing.id ? header : candidate) : [...headers, header], items: mode === "header" ? draft.items : mode === "append" ? [...draft.items, ...linkedItems] : linkedItems }
}

/** Refresh atomically: a failed currency lookup must retain the entire saved estimate. */
export async function refreshCustomsInvoiceEstimate(draft: StandaloneExportDraft, date = customsToday()): Promise<StandaloneExportDraft> {
  const headers = draft.invoiceHeaders ?? []
  const foreign = headers.some(header => header.currency && header.currency !== "GBP")
  const payload = foreign ? await fetchHmrcMonthlyRates(date) : null
  const fetchedAt = new Date().toISOString()
  return { ...draft, customsConversionDate: date, invoiceHeaders: headers.map(header => {
    if (!header.currency || header.currency === "GBP") return header
    const rate = selectHmrcExchangeRate(payload, header.currency, date, fetchedAt)
    return { ...header, exchangeRate: rate.rate, hmrcExchangeRate: rate }
  }) }
}
