import { Decimal } from "./customs-calculation-decimal.mts"

export type ComparableValueWorksheet = {
  method: "2" | "3"; productionCountry: string; quantity: string; unit: string
  method1Unavailable: string; method2Unavailable?: string
  comparables: {
    id: string; productionCountry: string; sameProducer: boolean; sameCommercialLevel: boolean
    quantity: string; unit: string; acceptedMethod1Entry: string; comparabilityEvidence: string
    reasonableTimeEvidence: string; producerSelectionEvidence: string
    acceptedUnitValueGbp: string
    commercialUnitAdjustmentGbp: string; commercialAdjustmentEvidence: string
    deliveryAdjustmentGbp: string; deliveryAdjustmentEvidence: string
  }[]
}

/** Candidate amounts are previously accepted GBP customs values, not invoices
 * to reconvert at today's FX rate. Adjustments are evidenced GBP differences. */
export function comparableCustomsValue(worksheet: ComparableValueWorksheet, fallback?: { differentProductionCountryEvidence: string }) {
  const evidence = (value: unknown) => typeof value === "string" && value.trim().length > 0
  if (fallback && !evidence(fallback.differentProductionCountryEvidence)) throw new Error("Flexible country comparisons need Method 6 supporting evidence.")
  if (!worksheet || !["2", "3"].includes(worksheet.method) || !evidence(worksheet.method1Unavailable) || (worksheet.method === "3" && !evidence(worksheet.method2Unavailable))) throw new Error("Record why the preceding valuation methods could not be used.")
  if (!/^[A-Z]{2}$/.test(worksheet.productionCountry) || !evidence(worksheet.unit)) throw new Error("Record the production country and comparable quantity unit.")
  const quantity = Decimal.parse(worksheet.quantity)
  if (quantity.n <= 0n) throw new Error("The quantity to value must be greater than zero.")
  if (!Array.isArray(worksheet.comparables) || !worksheet.comparables.length || worksheet.comparables.length > 100) throw new Error("Supply at least one evidenced comparable import, up to 100.")
  const ids = new Set<string>()
  const candidates = worksheet.comparables.map(candidate => {
    if (!candidate || !evidence(candidate.id) || ids.has(candidate.id)) throw new Error("Comparable imports need unique references.")
    ids.add(candidate.id)
    if (!/^[A-Z]{2}$/.test(candidate.productionCountry) || (!fallback && candidate.productionCountry !== worksheet.productionCountry) || candidate.unit !== worksheet.unit) throw new Error("Comparable imports must use the same production country and quantity unit unless the country difference is evidenced under Method 6.")
    if (typeof candidate.sameProducer !== "boolean" || typeof candidate.sameCommercialLevel !== "boolean" ||
      ![candidate.acceptedMethod1Entry, candidate.comparabilityEvidence, candidate.reasonableTimeEvidence, candidate.producerSelectionEvidence, candidate.commercialAdjustmentEvidence, candidate.deliveryAdjustmentEvidence].every(evidence)) throw new Error("Each comparable needs accepted Method 1 entry, goods/time/producer evidence and documented commercial and delivery adjustments.")
    const comparableQuantity = Decimal.parse(candidate.quantity), unitValue = Decimal.parse(candidate.acceptedUnitValueGbp)
    if (comparableQuantity.n <= 0n || unitValue.n <= 0n) throw new Error("Comparable quantity and accepted unit value must be greater than zero.")
    const commercial = Decimal.parse(candidate.commercialUnitAdjustmentGbp), delivery = Decimal.parse(candidate.deliveryAdjustmentGbp)
    const adjustedUnit = unitValue.add(commercial)
    const value = adjustedUnit.mul(quantity).add(delivery)
    if (adjustedUnit.n <= 0n || value.n <= 0n) throw new Error("Adjustments must leave a positive comparable customs value.")
    return { ...candidate, exactValue: value, sameQuantity: comparableQuantity.compare(quantity) === 0 }
  })
  // Prefer the original producer, then a sale at the same level and quantity.
  // Only compare the adjusted values of candidates in that eligible group.
  const producerGroup = candidates.some(candidate => candidate.sameProducer) ? candidates.filter(candidate => candidate.sameProducer) : candidates
  const hasSameSale = producerGroup.some(candidate => candidate.sameCommercialLevel && candidate.sameQuantity)
  const eligible = hasSameSale ? producerGroup.filter(candidate => candidate.sameCommercialLevel && candidate.sameQuantity) : producerGroup
  const ranked = [...eligible].sort((a, b) => a.exactValue.compare(b.exactValue) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { value: ranked[0].exactValue, selectedId: ranked[0].id,
    candidates: candidates.map(candidate => ({ id: candidate.id, value: candidate.exactValue, eligible: eligible.includes(candidate) })) }
}
