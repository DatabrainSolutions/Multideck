import { Decimal, sum } from "./customs-calculation-decimal.mts"
import { quantityForMeasure } from "./customs-measure-quantity.mts"
import { convertEuroTariffAmount } from "./customs-tariff-exchange-rate.mts"
import type { TaxComponent, TaxMeasure, CalculationLine } from "./customs-duty-calculation.mts"

function nonNegative(value: string) { const n = Decimal.parse(value); if (n.n < 0n) throw new Error("Amounts and rates cannot be negative."); return n }
function percentage(value: string) { return nonNegative(value).div(Decimal.parse("100")) }

/** Shared exact arithmetic for already-selected measures. Eligibility, reference
 * validity and jurisdiction remain the caller's responsibility. Never substitute
 * this evaluator for the risk/authorisation rules. */
export function evaluateTariffMeasure(measure: TaxMeasure, customs: Decimal, date: string, quantityShare = Decimal.parse("1")) {
  // For an original-input lot, customs is already the allocated value while
  // specific components still describe the whole lot. Keep the share rational;
  // converting it to a decimal string would lose recurring fractions.
  if (quantityShare.n <= 0n || quantityShare.compare(Decimal.parse("1")) > 0) throw new Error("The original-input quantity share must be greater than zero and no more than one.")
  if (quantityShare.compare(Decimal.parse("1")) !== 0 && (measure.minimum !== undefined || measure.maximum !== undefined || measure.calculationBasis !== undefined)) throw new Error("Allocated quantities require an explicit review of absolute bounds and product-level rounding.")
  const taxWorkings: CalculationLine["workings"] = []
  const evaluateComponents = (components: TaxComponent[], group = "") => sum(components.map(component => {
    let componentAmount: Decimal, label: string
    if (component.type === "percent") {
      componentAmount = customs.mul(percentage(component.rate))
      label = `${measure.taxType}: customs value × ${component.rate}%`
    } else {
      if (component.type !== "specific" || !component.unit.trim()) throw new Error("Specific duties require a measure unit.")
      if (!["GBP", "EUR"].includes(component.currency)) throw new Error("Specific duty needs an explicitly evidenced GBP or EUR tariff rate.")
      const per = nonNegative(component.per)
      if (per.n === 0n) throw new Error("The specific duty rate denominator must be greater than zero.")
      const quantity = quantityForMeasure({ quantity: component.quantity, sourceUnit: component.quantityUnit ?? component.unit, targetUnit: component.unit, sourceQualifier: component.quantityQualifier, targetQualifier: component.unitQualifier, alcoholByVolume: component.alcoholByVolume, strengthEvidence: component.strengthEvidence })
      componentAmount = nonNegative(component.rate).mul(quantity).mul(quantityShare).div(per)
      if (component.currency === "EUR") componentAmount = convertEuroTariffAmount(componentAmount, component.tariffConversion, date)
      const strength = component.unit === "LPA" && component.quantityUnit !== "LPA" && component.alcoholByVolume !== undefined ? ` × ${component.alcoholByVolume}% ABV` : ""
      const converted = component.quantityUnit && component.quantityUnit !== component.unit ? `${component.quantity} ${component.quantityUnit}${strength} → ${quantity.fixed(6)} ${component.unit}` : `${component.quantity} ${component.unit}`
      label = `${measure.taxType}: ${component.currency === "EUR" ? "€" : "£"}${component.rate} × ${converted}${component.unitQualifier ? ` (${component.unitQualifier})` : ""} ÷ ${component.per} ${component.unit}${component.currency === "EUR" ? ` × ${component.tariffConversion!.rate} GBP/EUR (tariff record ${component.tariffConversion!.recordId}, ${component.tariffConversion!.validityStart})` : ""}`
      if (quantityShare.compare(Decimal.parse("1")) !== 0) label += ` × original-input share ${quantityShare.n}/${quantityShare.d}`
    }
    taxWorkings.push({ label: group ? `${group} — ${label}` : label, amount: componentAmount.fixed(2), exact: componentAmount.evidence() })
    return componentAmount
  }))
  let amount = evaluateComponents(measure.components)
  if (measure.bounds?.length) {
    if (measure.minimum !== undefined || measure.maximum !== undefined || measure.calculationBasis !== undefined) throw new Error("A structured tariff bound cannot be combined with a manual bound or Alcohol Duty rounding rule.")
    if (measure.bounds.length > 3) throw new Error("Too many tariff comparison groups.")
    for (const bound of measure.bounds) {
      if (!["minimum", "maximum"].includes(bound.type) || !bound.components.length) throw new Error("A tariff bound requires a valid comparison and components.")
      const threshold = evaluateComponents(bound.components, `${bound.type} comparison`)
      const apply = bound.type === "minimum" ? amount.compare(threshold) < 0 : amount.compare(threshold) > 0
      if (apply) amount = threshold
      taxWorkings.push({ label: `${measure.taxType}: ${bound.type} comparison ${apply ? "applied" : "not applied"} (£${threshold.fixed(2)})`, amount: amount.fixed(2), exact: amount.evidence() })
    }
  }
  if (measure.minimum && measure.maximum && nonNegative(measure.minimum).compare(nonNegative(measure.maximum)) > 0) throw new Error("The measure minimum exceeds its maximum.")
  if (measure.minimum && amount.compare(nonNegative(measure.minimum)) < 0) {
    amount = nonNegative(measure.minimum)
    taxWorkings.push({ label: `${measure.taxType}: minimum GBP amount applied`, amount: amount.fixed(2), exact: amount.evidence() })
  }
  if (measure.maximum && amount.compare(nonNegative(measure.maximum)) > 0) {
    amount = nonNegative(measure.maximum)
    taxWorkings.push({ label: `${measure.taxType}: maximum GBP amount applied`, amount: amount.fixed(2), exact: amount.evidence() })
  }
  if (measure.calculationBasis !== undefined) {
    if (measure.calculationBasis !== "alcohol-duty" || measure.family !== "excise" || measure.components.some(component => component.type !== "specific" || component.unit !== "LPA" || component.unitQualifier)) throw new Error("Alcohol Duty rounding requires an identified excise measure in litres of pure alcohol.")
    // HMRC: round the product's Alcohol Duty down to a whole penny.
    // This rule does not establish ordinary customs-duty or VAT precision.
    // https://www.gov.uk/guidance/work-out-how-much-alcohol-duty-you-need-to-pay
    amount = amount.truncate(2)
    taxWorkings.push({ label: `${measure.taxType}: Alcohol Duty rounded down to the penny`, amount: amount.fixed(2), exact: amount.evidence() })
  }
  return { amount, workings: taxWorkings }
}
