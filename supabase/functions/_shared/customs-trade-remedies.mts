import type { TariffSnapshot, TariffMeasure, TariffResource } from "./customs-tariff-reference.mts"
import { tariffFormula, type TariffQuantity } from "./customs-tariff-components.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"
import type { TaxMeasure } from "./customs-duty-calculation.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"

export type RemedyReview = {
  commodity: string; origin: string; dataset: "uk" | "xi"; validFrom: string; validTo: string
  originEvidence: string; exporterEvidence: string; legalEvidence: string
  selections: { measureId: string; additionalCode: string; signedInvoice?: { reference: string; evidence: string } }[]
}
export type RemedyDocument = { code: string; reference: string }
const codes: Record<string, string> = { "551": "A35", "552": "A30", "553": "A45", "554": "A40" }

// D008 is deliberately a narrow adapter, not a generic condition bypass.
// The official response contains one signed-invoice branch and one fallback,
// both action 01. More complex legal/quantity conditions remain gated.
function signedInvoiceComponents(snapshot: TariffSnapshot, measure: TariffMeasure, signed: RemedyReview["selections"][number]["signedInvoice"], documents: RemedyDocument[]): TariffResource[] {
  const fail = (): never => { throw new Error(`Remedy ${measure.id} needs a matching declared D008 signed invoice and a supported tariff condition.`) }
  if (!signed || typeof signed.reference !== "string" || !signed.reference.trim() || typeof signed.evidence !== "string" || !signed.evidence.trim()) return fail()
  if (documents.filter(d => d.code === "D008" && d.reference === signed.reference).length !== 1) return fail()
  if (measure.components.length || measure.conditions.length !== 2) return fail()
  if (measure.conditions.some(c => c.type !== "measure_condition" || c.attributes.condition_code !== "A" || c.attributes.action_code !== "01" || ["condition_duty_amount", "condition_measurement_unit_code", "condition_measurement_unit_qualifier_code", "condition_monetary_unit_code", "requirement_operator", "threshold_unit_type"].some(k => c.attributes[k] != null))) return fail()
  const branch = measure.conditions.filter(c => c.attributes.document_code === "D008")
  if (branch.length !== 1 || measure.conditions.filter(c => c.attributes.document_code === "").length !== 1) return fail()
  const links = (branch[0].relationships?.measure_condition_components as { data?: { id: string; type: string }[] } | undefined)?.data
  const resources = (snapshot.raw as { included?: TariffResource[] } | null)?.included
  if (!Array.isArray(links) || links.length !== 1 || links[0].type !== "measure_condition_component" || !Array.isArray(resources)) return fail()
  const matches = resources.filter(r => r.type === links[0].type && r.id === links[0].id)
  if (matches.length !== 1) return fail()
  const a = matches[0].attributes
  if (String(a.measure_condition_sid) !== branch[0].id || a.duty_expression_id !== "01" || a.monetary_unit_code != null || a.measurement_unit_code != null || a.measurement_unit_qualifier_code != null) return fail()
  return matches
}

/** Selects reviewed unconditional ADD/CVD measures, never a cheapest exporter.
 * Remaining fiscal measures must still be checked by the calling selector.
 * Safeguards/conditional reliefs need their separate interaction adapters.
 * Structure: UK Tariff Data Standard, trade-remedies. Liability: HMRC guidance
 * check-when-you-need-to-pay-anti-dumping-countervailing-and-safeguard-duties.
 */
export function selectTradeRemedies(snapshot: TariffSnapshot, review: RemedyReview, quantities: TariffQuantity[] = [], conversion?: TariffExchangeRate, documents: RemedyDocument[] = []) {
  const fail = (message: string): never => { throw new Error(message) }
  if (!review || review.commodity !== snapshot.request.code || review.origin !== snapshot.request.origin || review.dataset !== snapshot.request.dataset || !validCustomsConversionDate(review.validFrom) || !validCustomsConversionDate(review.validTo) || review.validFrom > snapshot.request.date || review.validTo < snapshot.request.date) fail("Review trade remedies for this commodity, origin, tariff and date.")
  if (![review.originEvidence, review.exporterEvidence, review.legalEvidence].every(value => typeof value === "string" && value.trim())) fail("Record non-preferential origin, exporter and legal-measure evidence.")
  if (!Array.isArray(review.selections) || !review.selections.length || review.selections.length > 4 || review.selections.some(row => !row || typeof row.measureId !== "string" || typeof row.additionalCode !== "string") || new Set(review.selections.map(row => row.measureId)).size !== review.selections.length) fail("Select each applicable remedy once, with its exporter additional code.")
  if (conversion && conversion.calculationDate !== snapshot.request.date) fail("The tariff conversion must match the remedy date.")
  const selected = review.selections.map(row => {
    const matches = snapshot.measures.filter(measure => measure.id === row.measureId)
    if (matches.length !== 1 || !codes[matches[0].typeCode]) fail("Select a supported provisional or definitive remedy from the retained tariff.")
    const measure = matches[0], code = measure.additionalCode?.attributes.code ?? ""
    if (code !== row.additionalCode) fail("The selected exporter code no longer matches its tariff measure.")
    if (!measure.legalActs?.length || measure.unresolved.length || measure.orderNumber || measure.excludedCountries.includes(snapshot.request.origin) || measure.vat || measure.excise) fail(`Remedy ${measure.id} needs its legal, condition or geographical eligibility check.`)
    if (measure.conditions.length) signedInvoiceComponents(snapshot, measure, row.signedInvoice, documents)
    else if (row.signedInvoice) fail("Remove the signed-invoice selection for this unconditional remedy.")
    if (measure.start > snapshot.request.date || (measure.end && measure.end < snapshot.request.date)) fail("The remedy is not valid on the calculation date.")
    return measure
  })
  // A selection must account for each active family. Several exporter variants
  // of one family are alternatives, but ADD and CVD may both apply.
  const families = new Set(snapshot.measures.filter(m => codes[m.typeCode]).map(m => m.typeCode))
  if ([...families].some(type => selected.filter(m => m.typeCode === type).length !== 1)) fail("Select exactly one exporter measure for every applicable remedy type.")
  for (const chosen of selected) {
    const legalIds = (chosen.legalActs ?? []).map(act => act.id).sort().join("|")
    const variants = snapshot.measures.filter(m => m.typeCode === chosen.typeCode && m.id !== chosen.id)
    if (variants.some(m => !m.additionalCode || !chosen.additionalCode || m.unresolved.length || !m.legalActs?.length || m.legalActs.map(act => act.id).sort().join("|") !== legalIds)) fail("Other remedy measures are not confirmed exporter alternatives under the same legal act. Review each liability before calculating.")
  }
  if ((families.has("551") && families.has("552")) || (families.has("553") && families.has("554"))) fail("Concurrent provisional and definitive measures need the collection decision; they cannot both be charged.")
  const measures: TaxMeasure[] = selected.map(measure => ({
    source: snapshot.sourceUrl, reference: measure.id, retrievedAt: snapshot.retrievedAt,
    validFrom: measure.start, validTo: measure.end ?? "9999-12-31", provenance: "official-snapshot",
    taxType: codes[measure.typeCode], family: "trade-remedy", jurisdiction: snapshot.request.dataset === "xi" ? "EU" : "UK",
    evidence: [review.originEvidence, review.exporterEvidence, review.legalEvidence, ...measure.legalActs!.map(act => `Legal act ${act.id}`), ...review.selections.filter(row => row.measureId === measure.id && row.signedInvoice).map(row => `D008 ${row.signedInvoice!.reference}: ${row.signedInvoice!.evidence}`)],
    ...tariffFormula(measure.conditions.length ? signedInvoiceComponents(snapshot, measure, review.selections.find(row => row.measureId === measure.id)!.signedInvoice, documents) : measure.components, quantities, conversion),
    disposition: ["551", "553"].includes(measure.typeCode) ? "secured" : "payable", includedInVatBase: true,
  }))
  return { measures, selectedMeasureIds: selected.map(m => m.id), alternativeMeasureIds: snapshot.measures.filter(m => codes[m.typeCode] && !selected.includes(m)).map(m => m.id) }
}
