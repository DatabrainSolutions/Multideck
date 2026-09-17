import { determineNiRisk, type NiRiskInput, type NiRiskResult } from "./customs-ni-risk.mts"
import { standardTariffSelection, type TariffSnapshot, type TariffPreferenceReview, type LowValueExclusionReview } from "./customs-tariff-reference.mts"
import type { TaxMeasure, Reference } from "./customs-duty-calculation.mts"
import type { TariffQuantity } from "./customs-tariff-components.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"

export type NiRiskFacts = Pick<NiRiskInput, "movementEvidence" | "processing" | "ukims" | "endUse" | "endUseEvidence">
type Selection = ReturnType<typeof standardTariffSelection>
type Result = { issues: string[]; riskInput?: NiRiskInput; decision?: NiRiskResult; selection?: Selection; selectedSnapshot?: TariffSnapshot }
export type NiPairedPreferenceReview = { uk: TariffPreferenceReview; xi: TariffPreferenceReview }
type NiSelectionContext = { date: string; movement: string; importerEori: string; preferenceCode: string; euPreferenceCode?: string; nationalCodes?: string[]; vatEvidence?: string; pairedPreferences?: Partial<NiPairedPreferenceReview>; lowValueExclusion?: LowValueExclusionReview }
// HMRC's not-at-risk guidance requires applicable preferential rates in BOTH
// duties. Proof under a UK agreement is not proof under the EU agreement.
// https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu
function vatTreatment(context: NiSelectionContext, dataset: "uk" | "xi") {
  const preferenceCode = dataset === "uk" ? context.preferenceCode : context.euPreferenceCode ?? context.preferenceCode
  const review = context.pairedPreferences?.[dataset]
  if (!["100", "200", "300"].includes(preferenceCode)) throw new Error(`${dataset.toUpperCase()} preference needs its separate quota, suspension or end-use treatment.`)
  if (preferenceCode !== "100" && !review) throw new Error(`${dataset.toUpperCase()} claimed preference needs its own origin review before comparing complete duties.`)
  if (preferenceCode === "100" && review) throw new Error(`Remove or update the ${dataset.toUpperCase()} preference review after changing to full duty (100).`)
  // MFN alternatives may be left unclaimed only within the complete paired comparison.
  return { jurisdiction: "NI", niComparison: true, preferenceCode, nationalCodes: context.nationalCodes, vatEvidence: context.vatEvidence, preferenceReview: review, lowValueExclusion: context.lowValueExclusion }
}
function preferenceEvidence(context: NiSelectionContext, dataset: "uk" | "xi"): string[] {
  const review = context.pairedPreferences?.[dataset]
  return review ? [`${dataset.toUpperCase()} preference ${review.preferenceCode}; origin ${review.origin}; proof ${review.proofReference}; valid ${review.validFrom} to ${review.validTo}; origin rules ${review.originRulesEvidence}; transport ${review.transportEvidence}. Operator-reviewed eligibility, not automatic certification.`] : [`${dataset.toUpperCase()} full duty (100); no preference claim applied to this tariff.`]
}

/** Prepare both complete standard measures; selection waits until valuation. */
export function prepareNiDutyComparison(uk: TariffSnapshot, xi: TariffSnapshot, facts: NiRiskFacts, context: NiSelectionContext, quantities: TariffQuantity[], conversion?: TariffExchangeRate) {
  if (context.movement !== "rest-of-world-to-NI" || uk.request.dataset !== "uk" || xi.request.dataset !== "xi" || uk.request.date !== context.date || ["code", "origin", "date"].some(key => uk.request[key as keyof typeof uk.request] !== xi.request[key as keyof typeof xi.request])) throw new Error("Paired NI duty needs matching UK/XI references and overseas movement.")
  const ukSelection = standardTariffSelection(uk, uk, quantities, vatTreatment(context, "uk"), conversion)
  const euSelection = standardTariffSelection(xi, uk, quantities, vatTreatment(context, "xi"), conversion)
  const reference = (snapshot: TariffSnapshot, measure: NonNullable<Selection["duty"]>): Reference => ({ source: snapshot.sourceUrl, provenance: "official-snapshot", reference: measure.id, retrievedAt: snapshot.retrievedAt, validFrom: measure.start, validTo: measure.end ?? context.date })
  const prepare = (snapshot: TariffSnapshot, selection: Selection, jurisdiction: "UK" | "EU"): TaxMeasure => {
    if (selection.issues.length || !selection.duty || !selection.vat) throw new Error(`${jurisdiction} comparison: ${selection.issues.join(" ") || "Missing applicable duty or VAT."}`)
    return { ...reference(snapshot, selection.duty), taxType: "A00", family: "specific-compound", jurisdiction, evidence: [`Complete official measure for ${snapshot.request.origin} on ${context.date}`, ...preferenceEvidence(context, snapshot.request.dataset), ...selection.notClaimed.map(row => `${row.id}: ${row.reason}`), ...(context.vatEvidence ? [`UK VAT eligibility review: ${context.vatEvidence}; national codes ${(context.nationalCodes ?? []).join(", ")}; official VAT measure ${selection.vat.id}.`] : [])], components: selection.components, bounds: selection.bounds, includedInVatBase: true, disposition: "payable" }
  }
  const ukMeasure = prepare(uk, ukSelection, "UK"), euMeasure = prepare(xi, euSelection, "EU")
  return {
    comparison: { uk: ukMeasure, eu: euMeasure, facts: { ...facts, date: context.date, movement: "rest-of-world-to-NI" as const, importerEori: context.importerEori, euTradeRemedy: false, tradeRemedyEvidence: `Complete paired measure review: ${xi.sourceUrl}; additional fiscal measures block this comparison.` } },
    vatRate: ukSelection.vat!.percentage!, vatReference: reference(uk, ukSelection.vat!),
  }
}

/** Initial complete-percentage comparison. Additional/conditional taxes are
 * blockers until their full equivalent-duty comparison is implemented.
 * Never accept client-entered headline rates as the paired reference evidence.
 */
export function selectNiImportTariff(uk: TariffSnapshot, xi: TariffSnapshot, facts: NiRiskFacts, context: NiSelectionContext): Result {
  try {
    if (context.movement !== "rest-of-world-to-NI") throw new Error("This paired tariff comparison requires an outside-UK-and-EU movement; GB movements need their separate liability and VAT path.")
    if (uk.request.dataset !== "uk" || xi.request.dataset !== "xi" || uk.request.date !== context.date || ["code", "origin", "date"].some(key => uk.request[key as keyof typeof uk.request] !== xi.request[key as keyof typeof xi.request])) throw new Error("NI duty comparison needs matching UK and XI commodity, origin and date snapshots.")
    const ukSelection = standardTariffSelection(uk, uk, [], vatTreatment(context, "uk")), euSelection = standardTariffSelection(xi, uk, [], vatTreatment(context, "xi"))
    const evidence = (snapshot: TariffSnapshot, selection: Selection) => {
      if (selection.issues.length) throw new Error(`${snapshot.request.dataset.toUpperCase()} comparison: ${selection.issues.join(" ")}`)
      if (!selection.duty || selection.bounds?.length || selection.components.length !== 1 || selection.components[0].type !== "percent") throw new Error("NI specific or compound duties require their complete equivalent-duty comparison.")
      return { basis: "ad-valorem-only" as const, percentage: selection.components[0].rate, date: snapshot.request.date, reference: `${snapshot.sourceUrl}#measure-${selection.duty.id}`, allApplicableMeasuresIncluded: true }
    }
    const riskInput: NiRiskInput = { ...facts, date: context.date, movement: context.movement, importerEori: context.importerEori, ukDuty: evidence(uk, ukSelection), euDuty: evidence(xi, euSelection), euTradeRemedy: false, tradeRemedyEvidence: `Complete paired measure review: ${xi.sourceUrl}; additional fiscal measures would block this comparison.` }
    const decision = determineNiRisk(riskInput)
    if (decision.status === "needs-information") return { riskInput, decision, issues: decision.reasons }
    return { riskInput, decision, issues: [], selection: decision.status === "at-risk" ? euSelection : ukSelection, selectedSnapshot: decision.status === "at-risk" ? xi : uk }
  } catch (error) { return { issues: [error instanceof Error ? error.message : "The NI tariff comparison could not be completed."] } }
}
