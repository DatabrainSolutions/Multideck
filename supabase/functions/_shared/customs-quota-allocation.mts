import { Decimal } from "./customs-calculation-decimal.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"
import { tariffFormula, type TariffQuantity } from "./customs-tariff-components.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"
import type { TariffSnapshot } from "./customs-tariff-reference.mts"

export type QuotaAllocationReview = {
  commodity: string; origin: string; dataset: "uk" | "xi"; measureId: string
  orderNumber: string; preferenceCode: string
  status: "requested" | "allocated" | "rejected"
  allocatedQuantity: string; unit: string; allocationReference: string
  validFrom: string; validTo: string; evidence: string; originEvidence?: string
}

/** The same saved quantity must drive both rate eligibility and allocation use.
 * Quota volume is never inferred from goods mass or the invoice quantity. */
export function quotaItemQuantity(netMass: string, unit: string, quantities: TariffQuantity[] = []) {
  if (unit === "KGM") return { quantity: netMass, unit }
  const matching = quantities.filter(row => row.unit === unit && !row.qualifier)
  if (matching.length !== 1 || !matching[0].evidence?.trim()) throw new Error(`Enter one evidenced item quantity in quota unit ${unit}.`)
  return { quantity: matching[0].quantity, unit }
}

/** A displayed balance or an operator request is not an allocation.
 * HMRC: https://www.gov.uk/guidance/claiming-tariff-quotas-to-reduce-import-duties
 * This validates a full-item allocation only. Partial allocations must be split
 * into their quota and out-of-quota quantities by the higher-level workflow.
 * It supplies a candidate, not permission to omit other fiscal measures.
 */
export function quotaAllocationCandidate(snapshot: TariffSnapshot, review: QuotaAllocationReview, declared: { orderNumber: string; preferenceCode: string; quantity: string; unit: string }, quantities: TariffQuantity[] = [], conversion?: TariffExchangeRate) {
  const fail = (message: string): never => { throw new Error(message) }
  if (!review || review.commodity !== snapshot.request.code || review.origin !== snapshot.request.origin || review.dataset !== snapshot.request.dataset) fail("Review the quota for this commodity, origin and tariff.")
  if (review.status !== "allocated") fail("A quota request or displayed balance is not a confirmed allocation. Keep the full-rate liability until allocation evidence is available.")
  if (!validCustomsConversionDate(review.validFrom) || !validCustomsConversionDate(review.validTo) || review.validFrom > snapshot.request.date || review.validTo < snapshot.request.date) fail("The quota allocation must cover the calculation date.")
  if (![review.allocationReference, review.evidence].every(value => typeof value === "string" && value.trim())) fail("Record the allocation reference and supporting evidence.")
  if (!/^\d{6}$/.test(review.orderNumber) || declared.orderNumber !== review.orderNumber || declared.preferenceCode !== review.preferenceCode || !["120", "220", "320"].includes(review.preferenceCode)) fail("Match the declared quota order number and preference to the allocation.")
  if (review.preferenceCode !== "120" && !review.originEvidence?.trim()) fail("Record the preferential-origin evidence supporting the quota.")
  if (typeof review.unit !== "string" || !review.unit.trim() || declared.unit !== review.unit) fail("Express the item and allocation in the same quota unit.")
  const requested = Decimal.parse(declared.quantity), allocated = Decimal.parse(review.allocatedQuantity)
  if (requested.n <= 0n || allocated.n <= 0n) fail("Enter positive item and allocated quota quantities.")
  if (allocated.compare(requested) < 0) fail("The allocation covers only part of this item. Separate quota and full-rate quantities before calculating.")
  const candidates = snapshot.measures.filter(m => review.measureId ? m.id === review.measureId : m.preferenceCode === review.preferenceCode && (m.orderNumber?.attributes.number ?? m.orderNumber?.id) === review.orderNumber)
  if (candidates.length !== 1) fail("Select one retained quota measure.")
  const measure = candidates[0]
  const definitionLink = measure.orderNumber?.relationships?.definition as { data?: { id?: string; type?: string } } | undefined
  const resources = (snapshot.raw as { included?: { id: string; type: string; attributes: Record<string, unknown> }[] })?.included
  const definitions = Array.isArray(resources) ? resources.filter(row => row.id === definitionLink?.data?.id && row.type === "definition") : []
  if (definitions.length !== 1) fail("Retain the quota definition and its quantity unit before applying an allocation.")
  const definition = definitions[0].attributes
  // Explicit provider unit mapping; do not mistake a descriptive label for a
  // code or silently accept an operator-selected unit with another meaning.
  // Labels verified in retained official quota definitions 26425 and 32014.
  const officialUnit = ({ "Kilogram (kg)": "KGM", "Litre (l)": "LTR" } as Record<string, string>)[String(definition.measurement_unit)]
  if (!officialUnit || review.unit !== officialUnit || definition.monetary_unit || definition.measurement_unit_qualifier) fail("This quota needs its official unit or value-based allocation conversion before calculation.")
  if (typeof definition.validity_start_date !== "string" || typeof definition.validity_end_date !== "string" || !validCustomsConversionDate(definition.validity_start_date.slice(0, 10)) || !validCustomsConversionDate(definition.validity_end_date.slice(0, 10)) || definition.validity_start_date.slice(0, 10) > snapshot.request.date || definition.validity_end_date.slice(0, 10) < snapshot.request.date) fail("The retained quota period does not cover the calculation date.")
  const order = measure.orderNumber?.attributes.number ?? measure.orderNumber?.id
  const expectedType = review.preferenceCode === "120" ? "122" : "143"
  if (measure.typeCode !== expectedType || measure.preferenceCode !== review.preferenceCode || order !== review.orderNumber) fail("The selected tariff measure does not match this quota allocation.")
  if (measure.unresolved.length || !measure.legalActs?.length || measure.conditions.length || measure.additionalCode || measure.excise || measure.vat || measure.excludedCountries.includes(snapshot.request.origin)) fail("The quota needs its additional legal, document or geographical condition checks.")
  if (measure.start > snapshot.request.date || (measure.end && measure.end < snapshot.request.date)) fail("The quota measure is not valid on the calculation date.")
  if (conversion && conversion.calculationDate !== snapshot.request.date) fail("The tariff exchange rate must match the quota calculation date.")
  return { measure, ...tariffFormula(measure.components, quantities, conversion), allocationEvidence: `Quota ${review.orderNumber}; allocation ${review.allocationReference}; ${review.allocatedQuantity} ${review.unit}; item ${declared.quantity} ${declared.unit}; ${review.evidence}${review.originEvidence ? `; ${review.originEvidence}` : ""}` }
}

/** Run across every quota item before applying any candidate. A per-item
 * quantity check alone would allow the same allocation to be spent twice. */
export function reconcileQuotaAllocations(rows: { itemId: string; review: QuotaAllocationReview; quantity: string; unit: string }[]) {
  if (new Set(rows.map(row => row.itemId)).size !== rows.length || rows.some(row => !row.itemId.trim())) throw new Error("Quota item references must be present and unique.")
  const groups = new Map<string, { review: QuotaAllocationReview; used: Decimal; itemIds: string[] }>()
  for (const row of rows) {
    const review = row.review
    if (review.status !== "allocated" || !review.allocationReference?.trim() || !["uk", "xi"].includes(review.dataset)) throw new Error("Every quota item needs its confirmed allocation reference.")
    const quantity = Decimal.parse(row.quantity), allocation = Decimal.parse(review.allocatedQuantity)
    if (quantity.n <= 0n || allocation.n <= 0n || !row.unit.trim() || row.unit !== review.unit) throw new Error("Use positive quantities in the confirmed allocation unit.")
    const key = JSON.stringify([review.dataset, review.allocationReference.trim()])
    const previous = groups.get(key)
    if (previous) {
      const first = previous.review
      if (["orderNumber", "origin", "unit", "validFrom", "validTo"].some(field => first[field as keyof QuotaAllocationReview] !== review[field as keyof QuotaAllocationReview]) || Decimal.parse(first.allocatedQuantity).compare(allocation) !== 0) throw new Error("The same quota allocation has conflicting quantity, unit, origin, order or validity evidence.")
      previous.used = previous.used.add(quantity)
      previous.itemIds.push(row.itemId)
    } else groups.set(key, { review, used: quantity, itemIds: [row.itemId] })
  }
  return [...groups.values()].map(({ review, used, itemIds }) => {
    const allocated = Decimal.parse(review.allocatedQuantity)
    if (used.compare(allocated) > 0) throw new Error(`Quota allocation ${review.allocationReference} is overused across items ${itemIds.join(", ")}. Separate the out-of-quota quantities.`)
    return { allocationReference: review.allocationReference, dataset: review.dataset, orderNumber: review.orderNumber, unit: review.unit, itemIds, allocated: allocated.evidence(), used: used.evidence(), remaining: allocated.sub(used).evidence() }
  })
}
