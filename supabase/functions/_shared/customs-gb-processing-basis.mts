import { Decimal } from "./customs-calculation-decimal.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"
import { hasOfficialTaxEvidence, type CalculationItem } from "./customs-duty-calculation.mts"

export const GB_PROCESSING_BASIS_SOURCE = "https://www.legislation.gov.uk/uksi/2018/1249/regulation/23"
type PolicyReview = {
  exceptedGoods?: boolean
  additionalDuty?: boolean
  nonTariffOrAgriculturalMeasure?: boolean
  guaranteeRequired?: boolean
}
export type GbProcessingBasisReview = {
  processedRelease?: {
    entryDate: string; entryReference: string
    authorisationEvidence: string; dischargeEvidence: string; valuationEvidence: string
    noPriorTaxPaymentConfirmed: boolean; noEquivalenceOrCombinedReliefConfirmed: boolean
  }
  date: string
  jurisdiction: "GB"
  originalBasisElected?: boolean
  regulation22Breach?: boolean
  holderReimportWithinOneYear?: boolean
  economicExaminationRequired?: boolean
  entryPolicy: PolicyReview
  authorisationPolicy: PolicyReview
  paragraph6Exception?: boolean
  sensitiveGoods?: boolean
  calendarYearClassificationValueGbp: string
  evidence: string
}

/** The basis decision alone never authorises product-value taxation. Require
 * the separate discharge/valuation review and selected official UK measures.
 * https://www.gov.uk/guidance/special-procedure-inward-processing/how-duty-is-calculated-for-free-circulation-goods
 * https://www.gov.uk/guidance/special-procedure-inward-processing/how-import-vat-is-calculated-for-free-circulation-goods
 */
export function gbProcessedReleaseEstimate(item: CalculationItem, context: {
  direction: string; jurisdiction: string; procedure: string; date: string
  category: string; declarationType: string; preference: string; additionalProcedures: string[]
}, review?: GbProcessingBasisReview): { item?: CalculationItem; issues: string[] } {
  const issues: string[] = []
  if (context.direction !== "import" || context.jurisdiction !== "GB" || context.procedure !== "4051" || context.category !== "H1" || context.declarationType !== "A" || !validCustomsConversionDate(context.date) || context.date < "2026-09-15") issues.push("Use a current GB H1 standard 4051 release for this processed-products calculation.")
  if (context.preference !== "100" || context.additionalProcedures.filter(Boolean).some(code => code !== "000")) issues.push("Original-input duty, preferences and combined relief need their corresponding processing-release treatment.")
  if (!review || review.date !== context.date) return { issues: [...issues, "Complete the GB basis review for this calculation date."] }
  const decision = reviewGbProcessingBasis(review)
  issues.push(...decision.issues)
  if (decision.basis !== "no-original-goods-trigger-established") issues.push("The reviewed facts do not permit this processed-products calculation. Resolve the original-goods basis first.")
  if (item.valuationMethod !== "1" || item.contractConversion || item.originalInputDutyBases || item.niRiskInput || item.niDutyComparison || item.vatTreatment) issues.push("This release needs an evidenced processed-product transaction value without another valuation or relief treatment.")
  if (!hasOfficialTaxEvidence(item) || item.measures.length !== 1 || item.measures[0].taxType !== "A00" || item.measures[0].jurisdiction !== "UK" || item.measures[0].disposition !== "payable" || !["gb-standard", "specific-compound"].includes(item.measures[0].family)) issues.push("Retain official UK duty and VAT measures for the released products. Additional taxes require their release rules.")
  const release = review.processedRelease
  if (!release || typeof release !== "object") return { issues: [...issues, "Complete the processed-products discharge and valuation review."] }
  if (!validCustomsConversionDate(release.entryDate) || release.entryDate > context.date) issues.push("Record the original processing entry date, no later than release.")
  for (const [key, label] of [["entryReference", "the original processing entry"], ["authorisationEvidence", "the authorisation and permitted processed-products basis"], ["dischargeEvidence", "product identity, yield, quantity and compliant discharge"], ["valuationEvidence", "the processed-product customs and VAT values, including eligible costs"]] as const) if (typeof release[key] !== "string" || !release[key].trim()) issues.push(`Record evidence of ${label}.`)
  if (release.noPriorTaxPaymentConfirmed !== true) issues.push("Previous duty or VAT payments need an evidenced credit calculation.")
  if (release.noEquivalenceOrCombinedReliefConfirmed !== true) issues.push("Equivalence and combined relief require their separate release treatment.")
  if (issues.length) return { issues }
  const evidence = `GB processed-products release estimate: entry ${release.entryReference}, ${release.entryDate}; release ${context.date}; basis review ${review.evidence}; authorisation ${release.authorisationEvidence}; discharge ${release.dischargeEvidence}; valuation ${release.valuationEvidence}. No prior tax payments, equivalence or combined relief confirmed. Operator evidence, not Customs approval. Source ${GB_PROCESSING_BASIS_SOURCE}.`
  return { issues, item: { ...item, families: [...new Set([...item.families, "special-procedure" as const])], procedureEvidence: evidence, measures: item.measures.map(measure => ({ ...measure, evidence: [...measure.evidence, evidence] })) } }
}

/** Regulation 23 basis decision only, not valuation, rates, VAT or approval.
 * Paragraph 5/6 exceptions apply to paragraph 4, never to paragraph 3.
 * Earlier rules and Northern Ireland must use their own dated decisions. */
export function reviewGbProcessingBasis(review: GbProcessingBasisReview) {
  const failure = (message: string) => ({ issues: [message], basis: null, autoPopulationAllowed: false as const })
  if (!review || typeof review !== "object" || review.jurisdiction !== "GB" || !validCustomsConversionDate(review.date) || review.date < "2026-07-01") return failure("Select the applicable GB processing rules and review date; this rule version starts on 1 July 2026.")
  const flags = [review.originalBasisElected, review.regulation22Breach, review.holderReimportWithinOneYear, review.economicExaminationRequired, review.paragraph6Exception, review.sensitiveGoods]
  const policyFlags = (policy: PolicyReview) => policy && [policy.exceptedGoods, policy.additionalDuty, policy.nonTariffOrAgriculturalMeasure, policy.guaranteeRequired]
  const entry = policyFlags(review.entryPolicy), authorised = policyFlags(review.authorisationPolicy)
  if (!entry || !authorised || [...flags, ...entry, ...authorised].some(value => typeof value !== "boolean") || typeof review.evidence !== "string" || !review.evidence.trim()) return failure("Record the election, entry and authorisation policy checks, exceptions and supporting evidence.")
  let annual: Decimal
  try { annual = Decimal.parse(review.calendarYearClassificationValueGbp) } catch { return failure("Enter the evidenced calendar-year total for this applicant and classification, not the invoice amount.") }
  if (annual.n < 0n) return failure("The calendar-year classification total cannot be negative.")
  const reasons: string[] = []
  if (review.originalBasisElected) reasons.push("Regulation 23(2)(a): original-goods basis elected.")
  if (review.regulation22Breach) reasons.push("Regulation 23(2)(c): regulation 22(3)(c) breach.")
  if (review.holderReimportWithinOneYear && entry.some(Boolean) && !review.economicExaminationRequired) reasons.push("Regulation 23(3): qualifying reimport and entry policy conditions.")
  const threshold = review.sensitiveGoods ? "135000" : "270000"
  const paragraph5 = !review.authorisationPolicy.exceptedGoods && !review.authorisationPolicy.additionalDuty && !review.authorisationPolicy.guaranteeRequired && annual.compare(Decimal.parse(threshold)) <= 0
  if (!review.economicExaminationRequired && authorised.some(Boolean) && !paragraph5 && !review.paragraph6Exception) reasons.push("Regulation 23(4): authorisation policy conditions without a paragraph 5 or 6 exception.")
  return {
    issues: [] as string[],
    basis: reasons.length ? "original-goods-required" as const : "no-original-goods-trigger-established" as const,
    reasons, paragraph5Exception: paragraph5, source: GB_PROCESSING_BASIS_SOURCE,
    input: structuredClone(review), autoPopulationAllowed: false as const,
  }
}
