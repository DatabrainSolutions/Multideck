import { Decimal } from "./customs-calculation-decimal.mts"
import { evaluateTariffMeasure } from "./customs-tariff-evaluator.mts"
import { determineNiRisk, type NiRiskInput } from "./customs-ni-risk.mts"
import type { TaxMeasure } from "./customs-duty-calculation.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"

export type NiComparisonFacts = Omit<NiRiskInput, "ukDuty" | "euDuty">

/** Initial complete standard-measure comparison. The upstream selector must
 * resolve all applicability conditions before supplying each measure. Additional
 * taxes/reliefs need their complete measure-set path, not a silent omission. */
export function compareNiDutyMeasures(uk: TaxMeasure, eu: TaxMeasure, customsValue: Decimal, valuationReference: string, facts: NiComparisonFacts) {
  if (facts.movement !== "rest-of-world-to-NI" || !validCustomsConversionDate(facts.date) || !valuationReference.trim() || customsValue.n <= 0n) throw new Error("NI duty comparison requires the dated overseas movement and a positive shared customs valuation.")
  const evaluate = (measure: TaxMeasure, jurisdiction: "UK" | "EU") => {
    if (measure.jurisdiction !== jurisdiction || measure.taxType !== "A00" || !["ni", "gb-standard", "specific-compound"].includes(measure.family) || measure.disposition !== "payable" || measure.provenance !== "official-snapshot" || !measure.evidence.length || !measure.reference?.trim() || !measure.source?.trim() || !validCustomsConversionDate(measure.validFrom) || !validCustomsConversionDate(measure.validTo) || measure.validFrom > facts.date || measure.validTo < facts.date || !measure.components.length) throw new Error(`The ${jurisdiction} comparison requires a complete applicable, dated official standard-duty measure.`)
    const evaluated = evaluateTariffMeasure(measure, customsValue, facts.date)
    return { ...evaluated, evidence: {
      basis: "equivalent-duty" as const, dutyGbp: evaluated.amount.evidence(), customsValueGbp: customsValue.evidence(),
      valuationReference, date: facts.date, reference: `${measure.source}#${measure.reference}`, allApplicableMeasuresIncluded: true,
    } }
  }
  const ukResult = evaluate(uk, "UK"), euResult = evaluate(eu, "EU")
  const riskInput: NiRiskInput = { ...facts, ukDuty: ukResult.evidence, euDuty: euResult.evidence }
  const decision = determineNiRisk(riskInput)
  return {
    riskInput, decision,
    selectedMeasure: decision.status === "needs-information" ? null : decision.status === "at-risk" ? eu : uk,
    workings: { uk: ukResult.workings, eu: euResult.workings },
  }
}
