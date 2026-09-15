import { Decimal } from "./customs-calculation-decimal.mts"
import { comparableCustomsValue, type ComparableValueWorksheet } from "./customs-comparable-valuation.mts"
import { deductiveCustomsValue, type DeductiveValueWorksheet } from "./customs-deductive-valuation.mts"

export const fallbackValuationSource = "https://www.gov.uk/guidance/valuing-imported-goods-using-method-6-fall-back-method"
export type FallbackValueWorksheet = {
  basis: "supplier-uk-export-price" | "flexible-comparable" | "flexible-deductive"
  flexibilityEvidence?: string
  comparableWorksheet?: ComparableValueWorksheet
  deductiveWorksheet?: DeductiveValueWorksheet
  earlierMethodReasons: Record<"1" | "2" | "3" | "4" | "5", string>
  supplierEvidence: string
  priceListEvidence: string
  applicabilityEvidence: string
  adjustmentReviewEvidence: string
  quantity: string
  unit: string
  unitPrice: string
  currency: string
}

/** Explicit evidence-led lanes, not an arbitrary or minimum customs value.
 * Flexible comparable values allow a documented production-country difference;
 * flexible deductive values require justification for an extended sales period. */
export function fallbackCustomsValue(worksheet: FallbackValueWorksheet, convert: (amount: string, currency: string) => Decimal) {
  const present = (value: unknown) => typeof value === "string" && value.trim().length > 0
  if (!worksheet || !["supplier-uk-export-price", "flexible-comparable", "flexible-deductive"].includes(worksheet.basis)) throw new Error("Choose an implemented Method 6 valuation basis; an unexplained total is not sufficient.")
  if (!["1", "2", "3", "4", "5"].every(method => present(worksheet.earlierMethodReasons?.[method as keyof FallbackValueWorksheet["earlierMethodReasons"]]))) throw new Error("Method 6 needs evidence explaining why each of Methods 1 to 5 could not be used.")
  if (worksheet.basis !== "supplier-uk-export-price") {
    if (!present(worksheet.flexibilityEvidence)) throw new Error("Explain and evidence the Method 6 flexibility being applied.")
    if (worksheet.basis === "flexible-comparable") {
      if (!worksheet.comparableWorksheet) throw new Error("Complete the flexible comparable-import worksheet.")
      const comparison = comparableCustomsValue(worksheet.comparableWorksheet, { differentProductionCountryEvidence: worksheet.flexibilityEvidence! })
      return { value: comparison.value, includesCustomsAdjustments: true, source: fallbackValuationSource,
        workings: comparison.candidates.map(candidate => ({ label: `Method 6 comparable ${candidate.id}${candidate.id === comparison.selectedId ? " — selected" : candidate.eligible ? " — eligible" : " — lower priority"}`, value: candidate.value })) }
    }
    if (!worksheet.deductiveWorksheet) throw new Error("Complete the flexible sales and deductions worksheet.")
    const deduction = deductiveCustomsValue(worksheet.deductiveWorksheet)
    return { value: deduction.value, includesCustomsAdjustments: true, source: fallbackValuationSource,
      workings: [{ label: "Method 6: selected unit selling price", value: deduction.unitPrice },
        ...deduction.deductions.map(component => ({ label: `Method 6: ${component.category} deduction per unit`, value: component.amount })),
        { label: "Method 6: net customs value per unit", value: deduction.netUnit }] }
  }
  if (![worksheet.supplierEvidence, worksheet.priceListEvidence, worksheet.applicabilityEvidence, worksheet.adjustmentReviewEvidence, worksheet.unit].every(present)) throw new Error("Provide the supplier's current UK export price evidence, its applicability and the included-cost review.")
  if (!/^[A-Z]{3}$/.test(worksheet.currency)) throw new Error("Choose the currency of the supplier's export price.")
  const quantity = Decimal.parse(worksheet.quantity), price = Decimal.parse(worksheet.unitPrice)
  if (quantity.n <= 0n || price.n <= 0n) throw new Error("Method 6 export prices and quantities must be positive.")
  const unitValueGbp = convert(worksheet.unitPrice, worksheet.currency)
  if (unitValueGbp.n <= 0n) throw new Error("The converted export price must be positive.")
  const value = unitValueGbp.mul(quantity)
  return { value, includesCustomsAdjustments: false, source: fallbackValuationSource,
    workings: [{ label: "Method 6: supplier UK export price per unit in GBP", value: unitValueGbp },
      { label: "Method 6: export price × quantity before adjustments", value }] }
}
