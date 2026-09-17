import type { TariffSnapshot } from "./customs-tariff-reference.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"

export const AUTHORISED_USE_SOURCE = "https://www.gov.uk/guidance/authorised-use-end-use/authorised-use"
export type AuthorisedUseReview = {
  commodity: string; origin: string; dataset: "uk"; measureId: string
  validFrom: string; validTo: string; completionDueDate: string
  authorisationReference: string; authorisationEvidence: string
  prescribedUseEvidence: string; supervisionEvidence: string
}
export type AuthorisedUseDocument = { code: string; reference: string; status?: string }

/** Reviewed N990 authorisation branch only, not a general condition override.
 * Selecting the rate does not discharge customs supervision or establish VAT
 * relief. The caller must validate other measures and the release procedure.
 * Observed official B/27 N990 -> B/08 negative branch, 15 September 2026.
 */
export function authorisedUseCandidate(snapshot: TariffSnapshot, review: AuthorisedUseReview | undefined,
  preferenceCode: string, documents: AuthorisedUseDocument[] = []) {
  const fail = (message: string): never => { throw new Error(message) }
  if (snapshot.request.dataset !== "uk" || !review || review.dataset !== "uk" || review.commodity !== snapshot.request.code || review.origin !== snapshot.request.origin) fail("Review authorised use for this commodity, origin and UK tariff. Northern Ireland needs its separate end-use and risk treatment.")
  if (!["140", "115"].includes(preferenceCode)) fail("This authorised-use preference needs its separate quota or preferential-origin treatment.")
  if (![review!.validFrom, review!.validTo, review!.completionDueDate].every(validCustomsConversionDate) || review!.validFrom > snapshot.request.date || review!.validTo < snapshot.request.date || review!.completionDueDate < snapshot.request.date) fail("Record an authorisation validity period covering the calculation date and its permitted completion date.")
  if (!/^GBEUS\S+$/.test(review!.authorisationReference) || ![review!.authorisationEvidence, review!.prescribedUseEvidence, review!.supervisionEvidence].every(value => typeof value === "string" && value.trim())) fail("Record the GB EUS authorisation reference, its scope, the prescribed use and the supervision arrangements.")
  const declared = documents.filter(document => document.code === "N990")
  if (declared.length !== 1 || declared[0].reference !== review!.authorisationReference || declared[0].status) fail("Declare the matching N990 authorisation once, without a waiver or document status, before using this authorised-use rate.")
  const matches = snapshot.measures.filter(measure => measure.id === review!.measureId)
  if (matches.length !== 1) fail("Select the authorised-use measure from the retained official tariff.")
  const measure = matches[0]
  if (measure.typeCode !== (preferenceCode === "140" ? "105" : "115") || measure.preferenceCode !== preferenceCode || measure.vat || measure.excise || measure.additionalCode || measure.orderNumber || measure.unresolved.length || !measure.legalActs?.length || measure.excludedCountries.includes(snapshot.request.origin) || measure.start > snapshot.request.date || (measure.end && measure.end < snapshot.request.date)) fail("The selected measure needs a different authorised-use, quota, geographical or legal treatment.")
  const conditions = measure.conditions
  if (conditions.length !== 2 || conditions.some(condition => condition.type !== "measure_condition" || condition.attributes.condition_code !== "B" || ["condition_duty_amount", "condition_measurement_unit_code", "condition_measurement_unit_qualifier_code", "condition_monetary_unit_code", "requirement_operator", "threshold_unit_type"].some(key => condition.attributes[key] != null) || !Array.isArray((condition.relationships?.measure_condition_components as { data?: unknown })?.data) || ((condition.relationships!.measure_condition_components as { data: unknown[] }).data.length > 0))) fail("The authorised-use tariff has additional conditions that need their own calculation rule.")
  if (conditions.filter(condition => condition.attributes.document_code === "N990" && condition.attributes.action_code === "27").length !== 1 || conditions.filter(condition => condition.attributes.document_code === "" && condition.attributes.action_code === "08").length !== 1) fail("The authorised-use measure does not have the reviewed N990 certificate and rejection branches.")
  return {
    measure,
    evidence: `Authorised-use estimate; N990 ${review!.authorisationReference}; authorisation ${review!.validFrom} to ${review!.validTo}: ${review!.authorisationEvidence}; prescribed use: ${review!.prescribedUseEvidence}; supervision: ${review!.supervisionEvidence}; completion due ${review!.completionDueDate}. Completion is not confirmed and VAT is assessed separately. Official measure ${measure.id}; source ${AUTHORISED_USE_SOURCE}.`,
  }
}
