import { hasOfficialTaxEvidence, type CalculationItem } from "./customs-duty-calculation.mts"
import type { LowValueExclusionReview } from "./customs-tariff-reference.mts"

export const NI_TEMPORARY_RELEASE_SOURCE = "https://taxation-customs.ec.europa.eu/document/download/b5844d5a-0c43-4940-be4b-462dec0a10a3_en"

/** Normal release under Article 85, not an Article 79 non-compliance debt.
 * Prior partial relief/payment credits require the separate release adapter. */
export type NiTemporaryReleaseReview = {
  lowValueExclusion?: LowValueExclusionReview
  event: "normal-release"
  priorRelief: "total"
  entryDate: string
  entryReference: string
  entryItemReference: string
  authorisationEvidence: string
  goodsIdentityEvidence: string
  releaseValuationEvidence: string
  releaseRiskEvidence: string
  noPreviousTaxPaidConfirmed: boolean
  noProcessingConfirmed: boolean
}

type Context = {
  direction: string; jurisdiction: string; procedure: string; date: string
  category: string; declarationType: string; preference: string
  additionalProcedures: string[]; niTariff: string; riskStatus: string
}
const present = (v: unknown): v is string => typeof v === "string" && !!v.trim()
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v

export function niTemporaryReleaseEstimate(item: CalculationItem, context: Context, review?: NiTemporaryReleaseReview): { item?: CalculationItem; issues: string[] } {
  const issues: string[] = []
  if (context.direction !== "import" || context.jurisdiction !== "NI" || context.procedure !== "4053" || context.category !== "H1" || context.declarationType !== "A") issues.push("This release estimate requires a Northern Ireland H1 standard import declaration with procedure 4053.")
  if (!date(context.date) || context.date < "2026-09-15") issues.push("Historic temporary-admission releases need their applicable dated rules.")
  if (context.preference !== "100" || context.additionalProcedures.filter(Boolean).some(code => code !== "000")) issues.push("Combined preference, quota or additional relief needs its own release treatment.")
  if (context.niTariff !== "EU" || context.riskStatus !== "at-risk" || item.niRiskInput || item.niDutyComparison) issues.push("Confirm the EU at-risk treatment at release. Other NI tariff and automatic risk-comparison paths need their separate release rules.")
  if (item.valuationMethod !== "1" || item.contractConversion) issues.push("Use the evidenced release transaction value; alternative valuation and fixed-contract conversion need their separate release rules.")
  if (!hasOfficialTaxEvidence(item) || item.measures.length !== 1 || item.measures[0].taxType !== "A00" || item.measures[0].jurisdiction !== "EU" || item.measures[0].disposition !== "payable" || !["ni", "specific-compound"].includes(item.measures[0].family)) issues.push("Use official release-date EU duty and UK VAT measures. Remedies, excise and other taxes need their corresponding release treatment.")
  if (!review || typeof review !== "object") return { issues: [...issues, "Record the original temporary-admission entry and normal-release evidence."] }
  if (review.event !== "normal-release" || review.priorRelief !== "total") issues.push("This estimate is for normal release after total relief, not partial relief, a breach or diversion debt.")
  if (!date(review.entryDate) || review.entryDate > context.date) issues.push("Record the original entry date, no later than the release calculation date.")
  for (const [key, label] of [
    ["entryReference", "the original entry reference"], ["entryItemReference", "the original goods item"],
    ["authorisationEvidence", "the authorisation valid at entry and compliant discharge"],
    ["goodsIdentityEvidence", "the identity and quantity of goods being released"],
    ["releaseValuationEvidence", "the release transaction value and included transport/insurance costs"],
    ["releaseRiskEvidence", "the EU at-risk treatment applicable at release"],
  ] as const) if (!present(review[key])) issues.push(`Record evidence of ${label}.`)
  if (review.noPreviousTaxPaidConfirmed !== true) issues.push("Confirm no duty or VAT was previously paid for these goods. Existing payments need a separate tax-by-tax credit calculation.")
  if (review.noProcessingConfirmed !== true) issues.push("Confirm no processing, destruction, waste or additional relief changes the release treatment.")
  if (issues.length) return { issues }
  const evidence = `NI normal release after total TA relief, Article 85: entry ${review.entryReference}, item ${review.entryItemReference}, ${review.entryDate}; release calculation date ${context.date}; ${review.authorisationEvidence}; identity: ${review.goodsIdentityEvidence}; release valuation: ${review.releaseValuationEvidence}; release risk: ${review.releaseRiskEvidence}; no previous duty/VAT payment or processing confirmed. Source ${NI_TEMPORARY_RELEASE_SOURCE}, section III.1.1.4. Operator review, not HMRC approval.`
  return { issues, item: { ...item, procedureEvidence: evidence, families: [...new Set([...item.families, "special-procedure" as const])], measures: item.measures.map(measure => ({ ...measure, evidence: [...measure.evidence, evidence] })) } }
}
