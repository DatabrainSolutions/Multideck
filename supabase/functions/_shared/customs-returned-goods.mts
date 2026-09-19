import { hasOfficialTaxEvidence, type CalculationItem, type Reference } from "./customs-duty-calculation.mts"

export const RETURNED_GOODS_SOURCE = "https://www.gov.uk/government/publications/appendix-2-de-111-additional-procedure-codes-of-the-customs-declaration-service-cds/additional-procedure-code-f-series-appendix-2a"
export const RETURNED_GOODS_GUIDANCE = "https://www.gov.uk/guidance/pay-less-import-duty-and-vat-when-re-importing-goods-to-the-uk-and-eu"

/** Evidence is an operator review, not an automatic HMRC eligibility decision.
 * The original assessment and the relieved liability are both retained. */
export type ReturnedGoodsReview = {
  exportDate: string
  exportReference: string
  exportItemReference: string
  exportTerritory: "GB" | ""
  exporterEori: string
  goodsIdentityEvidence: string
  freeCirculationEvidence: string
  unchangedGoodsEvidence: string
  valuationEvidence: string
  repaymentEvidence: string
  ordinaryGoodsConfirmed: boolean
  noProcessingConfirmed: boolean
  vatEligibilityEvidence: string
  timeLimitWaiverEvidence?: string
}
type Context = {
  direction: string; jurisdiction: string; date: string; retrievedAt: string
  procedure: string; additionalProcedures: string[]; preference: string; importerEori: string
}
const present = (value: unknown): value is string => typeof value === "string" && !!value.trim()
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

/** GB reimports following ordinary export/temporary export. Warehouse releases,
 * NI, agricultural refunds, processing, excise and combined reliefs each need
 * their corresponding adapter; they must not inherit this exemption. */
export function returnedGoodsEstimate(item: CalculationItem, context: Context, review?: ReturnedGoodsReview): { item?: CalculationItem; issues: string[] } {
  const issues: string[] = []
  if (context.direction !== "import" || context.jurisdiction !== "GB" || !["6110", "6123"].includes(context.procedure)) issues.push("Returned-goods estimates currently require a GB reimport under 6110 or 6123. Other return routes need their own treatment.")
  if (!validDate(context.date) || context.date < "2026-09-15") issues.push("Historic returned-goods relief needs the rules applicable on that date.")
  const codes = context.additionalProcedures.filter(Boolean)
  if (codes.length !== 1 || !["F01", "F05"].includes(codes[0])) issues.push("Choose either F01 (duty relief) or F05 (duty and VAT relief), without another additional procedure for this estimate.")
  if (context.preference !== "100" || item.families.some(family => ["preference", "quota", "trade-remedy", "excise"].includes(family))) issues.push("Combined preference, quota, remedy or excise treatment needs its own returned-goods rules.")
  if (!hasOfficialTaxEvidence(item) || item.measures.length !== 1 || item.measures[0].taxType !== "A00" || item.measures[0].jurisdiction !== "UK" || item.measures[0].disposition !== "payable" || !["gb-standard", "specific-compound"].includes(item.measures[0].family)) issues.push("Use official ordinary UK duty and VAT measures before estimating returned-goods relief.")
  if (!review || typeof review !== "object") return { issues: [...issues, "Record the original export and returned-goods eligibility evidence."] }
  if (review.exportTerritory !== "GB") issues.push("This review covers goods previously exported from Great Britain; confirm the original export territory.")
  if (!validDate(review.exportDate) || review.exportDate > context.date) issues.push("Enter the actual export date, no later than the reimport calculation date.")
  else if (validDate(context.date)) {
    // Calendar years, not 1,095 days; clamp leap-day anniversaries to February.
    const [year, month, day] = review.exportDate.split("-").map(Number)
    const lastDay = new Date(Date.UTC(year + 3, month, 0)).getUTCDate()
    const anniversary = `${year + 3}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`
    if (context.date > anniversary && !present(review.timeLimitWaiverEvidence)) issues.push("The return is beyond three years. Record HMRC time-limit waiver evidence before applying relief.")
  }
  for (const [key, label] of [
    ["exportReference", "the original export reference"], ["exportItemReference", "the original exported item"],
    ["goodsIdentityEvidence", "the identity and quantity of the returned goods"],
    ["freeCirculationEvidence", "free-circulation status at export"],
    ["unchangedGoodsEvidence", "unchanged condition without an upgrade"],
    ["valuationEvidence", "the reimport valuation method and value"],
    ["repaymentEvidence", "repayment of export refunds, or confirmation that none are outstanding"],
  ] as const) if (!present(review[key])) issues.push(`Record evidence of ${label}.`)
  if (review.ordinaryGoodsConfirmed !== true) issues.push("Confirm these are ordinary returned goods, without agricultural, excise, authorised-use or processing relief conditions.")
  if (review.noProcessingConfirmed !== true) issues.push("Confirm no repair or processing was carried out overseas; maintenance-only or processed returns need a separate review.")
  if (codes[0] === "F05") {
    if (!present(context.importerEori) || !present(review.exporterEori) || review.exporterEori.trim() !== context.importerEori.trim()) issues.push("VAT relief requires the original exporter and current importer to be the same entity, with identical EORI including its prefix.")
    if (!present(review.vatEligibilityEvidence)) issues.push("Record the same-entity VAT evidence and review any overseas sale or export VAT refund before claiming VAT relief.")
  }
  if (issues.length) return { issues }
  const evidence = `Returned-goods estimate ${codes[0]}: export ${review.exportReference}, item ${review.exportItemReference}, ${review.exportDate}; ${review.goodsIdentityEvidence}; ${review.freeCirculationEvidence}; ${review.unchangedGoodsEvidence}; valuation: ${review.valuationEvidence}; repayments: ${review.repaymentEvidence}${codes[0] === "F05" ? `; VAT: ${review.vatEligibilityEvidence}; exporter/importer ${context.importerEori}` : ""}${review.timeLimitWaiverEvidence ? `; time-limit waiver: ${review.timeLimitWaiverEvidence}` : ""}. Operator-reviewed eligibility, not HMRC approval.`
  const reference: Reference = { source: RETURNED_GOODS_SOURCE, reference: `gb-returned-goods-${codes[0]}-v1`, validFrom: context.date, validTo: context.date, retrievedAt: context.retrievedAt, provenance: "operator" }
  return { issues, item: {
    ...item, families: [...new Set([...item.families, "special-procedure" as const])], procedureEvidence: evidence,
    measures: item.measures.map(measure => ({ ...measure, disposition: "relieved", evidence: [...measure.evidence, evidence] })),
    // Relieved duty is not an amount payable and must not inflate the VAT base.
    vatTreatment: codes[0] === "F05" ? { disposition: "relieved", evidence, reference, includedTaxReferences: [] } : undefined,
  } }
}
