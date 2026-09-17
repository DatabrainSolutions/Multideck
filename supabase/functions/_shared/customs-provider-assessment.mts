import { Decimal, sum } from "./customs-calculation-decimal.mts"
import { compareDeclarationAssessment, type AssessmentLine, type CalculationResult } from "./customs-duty-calculation.mts"
import type { extractProviderTaxEvidence } from "./customs-provider-tax-evidence.mts"

type Notice = ReturnType<typeof extractProviderTaxEvidence>["notices"][number]
const money = (value: string | null): value is string => value !== null && /^\d{1,24}(?:\.\d{1,2})?$/.test(value)

/** CDS 03 DSSD v2.32: final, outright-paid ad-valorem A00/B00 or
 * NI at-risk A50/B00/B05. Other liabilities retain their dedicated gates.
 * The caller supplies the immutable calculation linked to this submission, not
 * the latest calculation. XML confirmation must precede this adapter.
 * Matching an estimate is not certification of its calculation rules.
 */
export function compareFinalProviderAssessment(notice: Notice, result: CalculationResult) {
  const issues = [...notice.validationIssues]
  if (notice.classification !== "final" || notice.statusCode !== "4") issues.push("Only final customs debt can be reconciled.")
  if (!notice.facts.length) issues.push("The final assessment contains no tax rows.")
  const grouped = new Map<string, Notice["facts"]>()
  for (const fact of notice.facts) {
    if (!fact.itemId) { issues.push("An assessed item has no verified submission link."); continue }
    grouped.set(fact.itemId, [...(grouped.get(fact.itemId) ?? []), fact])
    if (fact.currency !== "GBP" || !money(fact.assessedAmount) || !money(fact.baseAmount)) issues.push("Every assessed amount and base needs confirmed GBP values without sub-penny precision.")
    if (fact.rateUnit !== "P1" || fact.rate === null || !/^\d+(?:\.\d+)?$/.test(fact.rate) || fact.dutyRegime !== "100") issues.push("This assessment needs a separate rate or preference treatment adapter.")
    if (fact.deductionAmount === null || Decimal.parse(fact.deductionAmount).n !== 0n) issues.push("Relief amounts need a separate treatment adapter.")
    if (!money(fact.paymentAmount) || !money(fact.assessedAmount) || Decimal.parse(fact.paymentAmount).compare(Decimal.parse(fact.assessedAmount)) !== 0) issues.push("Payment timing, suspension or security needs separate liability verification.")
  }
  const lines: AssessmentLine[] = []
  for (const [itemId, facts] of grouped) {
    if (facts.some(f => f.taxType === "A50" || f.taxType === "B05")) {
      const expected = result.lines.find(line => line.itemId === itemId)
      if (facts.length !== 3 || ["A50", "B00", "B05"].some(code => facts.filter(f => f.taxType === code).length !== 1)) {
        issues.push("The NI item needs one A50, one B00 and one B05 row; additional taxes need their own adapter.")
        continue
      }
      if (!expected?.vatTaxes || expected.taxes.length !== 1 || expected.taxes[0].taxType !== "A50") {
        issues.push("The submitted calculation has no verified NI duty and VAT split. Do not infer one for a historical calculation.")
        continue
      }
      const duty = facts.find(f => f.taxType === "A50")!, goodsVat = facts.find(f => f.taxType === "B00")!, dutyVat = facts.find(f => f.taxType === "B05")!
      if (goodsVat.rate === null || dutyVat.rate === null || !/^\d+(?:\.\d+)?$/.test(goodsVat.rate) || !/^\d+(?:\.\d+)?$/.test(dutyVat.rate) || Decimal.parse(goodsVat.rate).compare(Decimal.parse(dutyVat.rate)) !== 0) issues.push("B00 and B05 have different or invalid VAT rates and need a separate treatment review.")
      if ([duty, goodsVat, dutyVat].every(f => money(f.assessedAmount) && money(f.baseAmount))) {
        const vat = sum([goodsVat, dutyVat].map(f => Decimal.parse(f.assessedAmount!))).fixed(2)
        lines.push({ itemId, currency: "GBP", duty: duty.assessedAmount!, vat, customsValue: duty.baseAmount!, vatBase: sum([goodsVat, dutyVat].map(f => Decimal.parse(f.baseAmount!))).fixed(2), taxes: [{ taxType: "A50", amount: duty.assessedAmount!, disposition: "payable" }], vatLiability: { amount: vat, disposition: "payable" }, vatTaxes: [{ taxType: "B00", base: goodsVat.baseAmount!, amount: goodsVat.assessedAmount! }, { taxType: "B05", base: dutyVat.baseAmount!, amount: dutyVat.assessedAmount! }] })
      }
      continue
    }
    if (facts.length !== 2 || facts.filter(f => f.taxType === "A00").length !== 1 || facts.filter(f => f.taxType === "B00").length !== 1) {
      issues.push("Each item needs one ordinary duty row and one VAT row; other measures need their own adapter.")
      continue
    }
    if (!result.lines.some(line => line.itemId === itemId)) { issues.push("The assessment contains an item absent from the submission calculation."); continue }
    const duty = facts.find(f => f.taxType === "A00")!, vat = facts.find(f => f.taxType === "B00")!
    if (money(duty.assessedAmount) && money(vat.assessedAmount) && money(duty.baseAmount) && money(vat.baseAmount)) {
      lines.push({ itemId, currency: "GBP", duty: duty.assessedAmount, vat: vat.assessedAmount, customsValue: duty.baseAmount, vatBase: vat.baseAmount,
        taxes: [{ taxType: "A00", amount: duty.assessedAmount, disposition: "payable" }], vatLiability: { amount: vat.assessedAmount, disposition: "payable" } })
    }
  }
  if (result.lines.some(line => !grouped.has(line.itemId))) issues.push("The assessment does not cover every submitted invoice item.")
  if (issues.length) return { status: "needs-information" as const, issues: [...new Set(issues)], comparison: null, totalsBasis: null }
  const totals = { currency: "GBP" as const, duty: sum(lines.map(line => Decimal.parse(line.duty))).fixed(2), vat: sum(lines.map(line => Decimal.parse(line.vat))).fixed(2) }
  const comparison = compareDeclarationAssessment(result, lines, totals)
  return { status: "compared" as const, issues: [], comparison: { ...comparison,
    lines: comparison.lines.map(line => ({ ...line, submittedSequence: grouped.get(line.itemId)?.[0]?.sequence ?? null })) },
    // DMSTAX header cash totals are not independent duty/VAT liability totals.
    totalsBasis: "assessed-items" as const }
}
