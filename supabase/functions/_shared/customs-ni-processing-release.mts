import { hasOfficialTaxEvidence, type CalculationItem } from "./customs-duty-calculation.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"
import type { LowValueExclusionReview } from "./customs-tariff-reference.mts"
import { standardTariffSelection, type TariffSnapshot } from "./customs-tariff-reference.mts"
import { allocateProcessingInputs, type ProcessingInputLot, type ProcessingConsumption } from "./customs-processing-allocation.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"

export const NI_PROCESSING_RELEASE_SOURCE = "https://taxation-customs.ec.europa.eu/customs/customs-procedures-import-and-export/importation_en"
export type NiProcessingReleaseReview = {
  lowValueExclusion?: LowValueExclusionReview
  basis: "processed-products" | "original-inputs"
  allOriginalInputsConfirmed?: boolean
  entryDate: string
  entryReference: string
  authorisationEvidence: string
  dischargeEvidence: string
  processedValuationEvidence: string
  originalBasisExclusionEvidence: string
  releaseRiskEvidence: string
  noPriorTaxPaymentConfirmed: boolean
  noEquivalenceOrCombinedReliefConfirmed: boolean
}

export type ProcessingTariffEvidence = Record<string, { duty: TariffSnapshot | { error: string }; vat: TariffSnapshot | { error: string } }>

/** Article 86(3): original classification/value/quantities, debt-date duty rates.
 * Original GBP values are retained entry values, never today's reconversion.
 * The separate processed-product VAT value remains on the invoice item.
 * https://taxation-customs.ec.europa.eu/document/download/b5844d5a-0c43-4940-be4b-462dec0a10a3_en
 */
export function niOriginalInputReleaseEstimate(item: CalculationItem, context: Context, review: NiProcessingReleaseReview | undefined,
  worksheet: { jurisdiction: string; lots: ProcessingInputLot[]; consumption: ProcessingConsumption[] } | undefined,
  references: ProcessingTariffEvidence | undefined, conversion?: TariffExchangeRate): { item?: CalculationItem; issues: string[] } {
  const issues: string[] = []
  if (context.direction !== "import" || context.jurisdiction !== "NI" || context.procedure !== "4051" || context.category !== "H1" || context.declarationType !== "A" || !validCustomsConversionDate(context.date) || context.date < "2026-09-15") issues.push("Use a current NI H1 standard 4051 release for the original-input estimate.")
  const apcs = context.additionalProcedures.filter(Boolean)
  if (context.preference !== "100" || apcs.filter(code => code === "F44").length !== 1 || apcs.some(code => !["000", "F44"].includes(code))) issues.push("Original-input release requires F44; preference and combined relief need their separate treatment.")
  if (context.niTariff !== "EU" || context.riskStatus !== "at-risk" || item.niRiskInput || item.niDutyComparison) issues.push("Review the EU at-risk treatment for this original-input release.")
  if (item.valuationMethod !== "1" || item.contractConversion || !hasOfficialTaxEvidence(item) || item.measures.length !== 1 || item.measures[0].taxType !== "A00" || item.measures[0].jurisdiction !== "EU") issues.push("Retain the processed-product valuation and official UK VAT evidence; additional output taxes require their release treatment.")
  if (!review || review.basis !== "original-inputs" || review.allOriginalInputsConfirmed !== true || review.noPriorTaxPaymentConfirmed !== true || review.noEquivalenceOrCombinedReliefConfirmed !== true) issues.push("Confirm the original-input basis, complete input inventory and absence of prior taxes, equivalence or combined relief.")
  for (const [key, label] of [["authorisationEvidence", "the authorisation and original-input basis"], ["dischargeEvidence", "product identity, quantity and compliant discharge"], ["processedValuationEvidence", "the processed-product VAT value"], ["releaseRiskEvidence", "the EU at-risk decision at release"]] as const) if (typeof review?.[key] !== "string" || !review[key].trim()) issues.push(`Record evidence of ${label}.`)
  if (!worksheet || worksheet.jurisdiction !== "NI" || !Array.isArray(worksheet.lots) || !Array.isArray(worksheet.consumption)) return { issues: [...issues, "Complete the Northern Ireland original-input worksheet."] }
  if (worksheet.lots.some(lot => !lot || typeof lot !== "object") || worksheet.consumption.some(row => !row || typeof row !== "object")) return { issues: [...issues, "Review the saved original lots and consumption rows."] }
  if (!context.outputItemIds?.length || worksheet.consumption.some(row => !context.outputItemIds!.includes(row.outputItemId))) issues.push("Reassign consumption linked to a missing item or an item without a processing-release procedure.")
  try { allocateProcessingInputs(worksheet.lots, worksheet.consumption) } catch (error) { issues.push(error instanceof Error ? error.message : "Review original-input consumption.") }
  const links = worksheet.consumption.filter(row => row.outputItemId === item.id)
  if (!links.length) issues.push("Link the released item to every original input it consumes.")
  if (issues.length) return { issues }
  const measures: CalculationItem["measures"] = [], bases: NonNullable<CalculationItem["originalInputDutyBases"]> = []
  for (const link of links) {
    const lot = worksheet.lots.find(lot => lot.id === link.inputLotId)!
    // HMRC 4051 notes: release F44 must also have appeared on the original
    // processing entry. A release authorisation review cannot establish this.
    if (typeof lot.originalF44Evidence !== "string" || !lot.originalF44Evidence.trim()) { issues.push(`Original lot ${lot.id}: record evidence that F44 was declared on the original processing entry.`); continue }
    if (!validCustomsConversionDate(lot.entryDate ?? "") || lot.entryDate! > context.date || !/^\d{10}$/.test(lot.commodityCode ?? "") || !/^[A-Z]{2}$/.test(lot.origin ?? "")) { issues.push(`Original lot ${lot.id}: complete its entry date, ten-digit commodity code and origin.`); continue }
    const lookup = references?.[lot.id]
    if (!lookup || "error" in lookup.duty || "error" in lookup.vat) { issues.push(`Original lot ${lot.id}: official tariff evidence is unavailable.`); continue }
    if ([lookup.duty, lookup.vat].some(snapshot => snapshot.request.code !== lot.commodityCode || snapshot.request.origin !== lot.origin || snapshot.request.date !== context.date) || lookup.duty.request.dataset !== "xi" || lookup.vat.request.dataset !== "uk") { issues.push(`Original lot ${lot.id}: tariff evidence does not match the retained classification, origin and release date.`); continue }
    const selection = standardTariffSelection(lookup.duty, lookup.vat, [{ quantity: lot.quantity, unit: lot.unit, evidence: lot.evidence }], { jurisdiction: "NI", preferenceCode: "100", nationalCodes: [], lowValueExclusion: review!.lowValueExclusion }, conversion)
    if (selection.issues.length || !selection.duty) { issues.push(...selection.issues.map(issue => `Original lot ${lot.id}: ${issue}`)); continue }
    const selected = selection.duty
    const evidence = `Original entry ${lot.entryReference}, item ${lot.entryItemReference}, ${lot.entryDate}; retained GBP value ${lot.originalCustomsValueGbp}; ${lot.evidence}; original F44 evidence: ${lot.originalF44Evidence}; consumption ${link.quantity}/${lot.quantity} ${lot.unit}: ${link.yieldEvidence}. Article 86(3) original inputs with debt-date rates; ${review!.authorisationEvidence}.`
    measures.push({ source: lookup.duty.sourceUrl, reference: selected.id, processingInputLotId: lot.id, provenance: "official-snapshot", validFrom: selected.start, validTo: selected.end ?? context.date, retrievedAt: lookup.duty.retrievedAt, taxType: "A00", jurisdiction: "EU", family: selection.bounds?.length || selection.components.some(c => c.type === "specific") ? "specific-compound" : "ni", components: selection.components, bounds: selection.bounds, includedInVatBase: true, disposition: "payable", evidence: [evidence, ...selection.notClaimed.map(row => `${row.id}: ${row.reason}`)] })
    bases.push({ measureSource: lookup.duty.sourceUrl, measureReference: selected.id, inputLotId: lot.id, originalValueGbp: lot.originalCustomsValueGbp, originalQuantity: lot.quantity, consumedQuantity: link.quantity, rateDate: context.date, evidence })
  }
  if (issues.length) return { issues }
  return { issues, item: { ...item, families: [...new Set([...item.families, "special-procedure" as const])], measures, originalInputDutyBases: bases, procedureEvidence: `NI original-input release; ${review!.authorisationEvidence}; ${review!.dischargeEvidence}; processed VAT valuation ${review!.processedValuationEvidence}; risk ${review!.releaseRiskEvidence}. Estimate only; original quantities and values retained separately.` } }
}
type Context = {
  outputItemIds?: string[]
  direction: string; jurisdiction: string; procedure: string; date: string
  category: string; declarationType: string; preference: string
  additionalProcedures: string[]; niTariff: string; riskStatus: string
}

/** Processed-product release basis only. The Article 86(3) original-input basis,
 * compulsory original-basis cases and GB rules require separate adapters.
 * Reviewed evidence permits estimates, never automatic tax population. */
export function niProcessingReleaseEstimate(item: CalculationItem, context: Context, review?: NiProcessingReleaseReview): { item?: CalculationItem; issues: string[] } {
  const issues: string[] = []
  if (context.direction !== "import" || context.jurisdiction !== "NI" || context.procedure !== "4051" || context.category !== "H1" || context.declarationType !== "A") issues.push("Use a Northern Ireland H1 standard 4051 release for this processed-products estimate.")
  if (!validCustomsConversionDate(context.date) || context.date < "2026-09-15") issues.push("Historic processing releases need their applicable dated rules.")
  if (context.preference !== "100" || context.additionalProcedures.filter(Boolean).some(code => code !== "000")) issues.push("Original-input duty, preference, quota and combined relief require their own processing-release basis.")
  if (context.niTariff !== "EU" || context.riskStatus !== "at-risk" || item.niRiskInput || item.niDutyComparison) issues.push("Review the EU at-risk treatment at release; do not reuse the original entry risk decision.")
  if (item.valuationMethod !== "1" || item.contractConversion) issues.push("This estimate requires an evidenced processed-product transaction value. Other valuation and contractual-rate bases require separate rules.")
  if (!hasOfficialTaxEvidence(item) || item.measures.length !== 1 || item.measures[0].taxType !== "A00" || item.measures[0].jurisdiction !== "EU" || item.measures[0].disposition !== "payable" || !["ni", "specific-compound"].includes(item.measures[0].family)) issues.push("Retain official release-date EU duty and UK VAT measures. Remedies, excise and other fiscal treatments need their corresponding release rules.")
  if (!review || typeof review !== "object") return { issues: [...issues, "Review the authorised processed-products basis before calculating this release."] }
  if (review.basis !== "processed-products") issues.push("Do not calculate an original-input release using processed-product values.")
  if (!validCustomsConversionDate(review.entryDate) || review.entryDate > context.date) issues.push("Record the original processing entry date, no later than release.")
  for (const [key, label] of [
    ["entryReference", "the original processing entry"],
    ["authorisationEvidence", "the authorisation valid at entry and the permitted calculation basis"],
    ["dischargeEvidence", "compliant discharge and the identity, yield and quantity of released products"],
    ["processedValuationEvidence", "the release-date processed-product duty and VAT valuation, including eligible costs"],
    ["originalBasisExclusionEvidence", "why neither elected nor compulsory original-input calculation applies, including the original goods' trade-policy measures"],
    ["releaseRiskEvidence", "the EU at-risk decision applicable at release"],
  ] as const) if (typeof review[key] !== "string" || !review[key].trim()) issues.push(`Record evidence of ${label}.`)
  if (review.noPriorTaxPaymentConfirmed !== true) issues.push("Previous tax payments require a separate evidenced credit calculation.")
  if (review.noEquivalenceOrCombinedReliefConfirmed !== true) issues.push("Equivalence and combined relief require their own release calculation.")
  if (issues.length) return { issues }
  const evidence = `NI processed-products release estimate: entry ${review.entryReference}, ${review.entryDate}; release ${context.date}; ${review.authorisationEvidence}; discharge ${review.dischargeEvidence}; valuation ${review.processedValuationEvidence}; original-basis exclusion ${review.originalBasisExclusionEvidence}; risk ${review.releaseRiskEvidence}. No prior tax payments, equivalence or combined relief confirmed. Operator evidence, not Customs approval. Source ${NI_PROCESSING_RELEASE_SOURCE}.`
  return { issues, item: { ...item, families: [...new Set([...item.families, "special-procedure" as const])], procedureEvidence: evidence, measures: item.measures.map(measure => ({ ...measure, evidence: [...measure.evidence, evidence] })) } }
}
