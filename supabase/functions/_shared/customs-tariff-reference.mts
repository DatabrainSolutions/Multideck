import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"
import { tariffFormula, type TariffQuantity } from "./customs-tariff-components.mts"
import type { TariffExchangeRate } from "./customs-tariff-exchange-rate.mts"
import { selectTradeRemedies, type RemedyReview, type RemedyDocument } from "./customs-trade-remedies.mts"
import { quotaAllocationCandidate, type QuotaAllocationReview } from "./customs-quota-allocation.mts"
import { authorisedUseCandidate, type AuthorisedUseReview, type AuthorisedUseDocument } from "./customs-authorised-use.mts"

export type TariffRequest = { code: string; origin: string; date: string; dataset: "uk" | "xi" }
export type TariffResource = { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> }
export type TariffMeasure = {
  id: string; typeCode: string; description: string; series: string; area: string
  start: string; end: string | null; vat: boolean; excise: boolean; dutyExpression: string
  components: TariffResource[]; conditions: TariffResource[]; footnotes: TariffResource[]
  additionalCode: TariffResource | null; orderNumber: TariffResource | null
  excludedCountries: string[]; unresolved: string[]; percentage: string | null
  preferenceCode?: string; legalActs?: TariffResource[]
}
export type TariffPreferenceReview = {
  preferenceCode: "200" | "300"; origin: string; dataset: "uk" | "xi"
  validFrom: string; validTo: string
  proofReference: string; originRulesEvidence: string; transportEvidence: string
  measureId?: string
}
export type LowValueExclusionReview = { basis: "not-distance-sale"; reviewDate: string; consignmentReference: string; evidence: string }
export const LOW_VALUE_DUTY_SOURCE = "https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en"
export type TariffTreatment = { authorisedUseReview?: AuthorisedUseReview; authorisedUseDocuments?: AuthorisedUseDocument[]; niComparison?: boolean; lowValueExclusion?: LowValueExclusionReview; preferentialOrigin?: string; jurisdiction: string; preferenceCode: string; preferenceReview?: TariffPreferenceReview; nationalCodes?: string[]; vatEvidence?: string; remedyReview?: RemedyReview; remedyDocuments?: RemedyDocument[]; quotaClaim?: { review: QuotaAllocationReview; declared: { orderNumber: string; preferenceCode: string; quantity: string; unit: string } } }
export type TariffSnapshot = {
  request: TariffRequest; sourceUrl: string; retrievedAt: string; raw: unknown
  commodity: TariffResource; measures: TariffMeasure[]
}
const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
const txt = (v: unknown) => typeof v === "string" ? v : ""

// Only absent optional dates mean an open-ended validity period. Do not turn
// malformed provider values into unlimited validity by coercing them to "".
function referenceDate(value: unknown, optional = false): string {
  if (optional && (value === null || value === undefined || value === "")) return ""
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !validCustomsConversionDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw new Error("The tariff returned an invalid validity date.")
  return value.slice(0, 10)
}

export function tariffUrl(request: TariffRequest) {
  if (!/^\d{10}$/.test(request.code) || !/^[A-Z]{2}$/.test(request.origin) || !validCustomsConversionDate(request.date) || !["uk", "xi"].includes(request.dataset)) throw new Error("A valid commodity, origin, date and tariff dataset are required.")
  const url = new URL(`https://api.trade-tariff.service.gov.uk/${request.dataset}/api/commodities/${request.code}`)
  url.searchParams.set("as_of", request.date)
  url.searchParams.set("filter[geographical_area_id]", request.origin)
  return url.toString()
}

/** Preserve the full graph. Percentages are an exact recognised component,
 * never scraped from formatted HTML; unresolved relationships are blockers. */
export function parseTariffSnapshot(raw: unknown, request: TariffRequest, retrievedAt: string): TariffSnapshot {
  const sourceUrl = tariffUrl(request), root = rec(raw), data = rec(root.data), attrs = rec(data.attributes)
  if (data.type !== "commodity" || attrs.goods_nomenclature_item_id !== request.code || attrs.declarable !== true || !Array.isArray(root.included)) throw new Error("The tariff returned a different or non-declarable commodity.")
  const start = referenceDate(attrs.validity_start_date), end = referenceDate(attrs.validity_end_date, true)
  if (!validCustomsConversionDate(start) || start > request.date || (end && (!validCustomsConversionDate(end) || end < request.date))) throw new Error("The commodity is not valid on the calculation date.")
  const resources = new Map<string, TariffResource>()
  for (const value of root.included) {
    const row = rec(value), id = txt(row.id), type = txt(row.type), key = `${type}:${id}`
    if (!id || !type || resources.has(key)) throw new Error("The tariff returned missing or duplicate resource identities.")
    resources.set(key, { id, type, attributes: rec(row.attributes), relationships: rec(row.relationships) })
  }
  const measures: TariffMeasure[] = []
  const links = rec(rec(data.relationships).import_measures).data
  if (!Array.isArray(links)) throw new Error("Import measure references are missing.")
  const seen = new Set<string>()
  for (const link of links) {
    const ref = rec(link), id = txt(ref.id)
    if (ref.type !== "measure" || seen.has(id)) throw new Error("Invalid import measure references.")
    seen.add(id)
    const measure = resources.get(`measure:${id}`)
    if (!measure || measure.attributes.import !== true) throw new Error("An import measure could not be resolved.")
    const unresolved: string[] = []
    const related = (name: string) => {
      const data = rec(measure.relationships?.[name]).data
      const references = data == null ? [] : Array.isArray(data) ? data : [data]
      return references.flatMap(value => {
        const row = rec(value), key = `${txt(row.type)}:${txt(row.id)}`, resolved = resources.get(key)
        if (!resolved) { unresolved.push(key); return [] }
        return [resolved]
      })
    }
    const components = related("measure_components"), conditions = related("measure_conditions"), footnotes = related("footnotes")
    const type = related("measure_type")[0], area = related("geographical_area")[0]
    if (!type) unresolved.push("required:measure_type")
    if (!area) unresolved.push("required:geographical_area")
    const dutyExpression = related("duty_expression")[0], additionalCode = related("additional_code")[0] ?? null, orderNumber = related("order_number")[0] ?? null
    const excludedCountries = related("excluded_countries").map(r => r.id)
    const preference = related("preference_code"), legalActs = related("legal_acts")
    if (preference.length > 1 || (preference[0] && (preference[0].type !== "preference_code" || !/^\d{3}$/.test(preference[0].id) || preference[0].attributes.code !== preference[0].id))) unresolved.push("invalid:preference_code")
    const a = measure.attributes, start = referenceDate(a.effective_start_date), end = referenceDate(a.effective_end_date, true) || null
    if (!validCustomsConversionDate(start) || start > request.date || (end && (!validCustomsConversionDate(end) || end < request.date))) throw new Error("A tariff measure falls outside the requested date.")
    const component = components.length === 1 ? components[0].attributes : null
    const rate = component && component.duty_expression_id === "01" && !component.monetary_unit_code && !component.measurement_unit_code && !component.measurement_unit_qualifier_code ? String(component.duty_amount ?? "") : ""
    measures.push({ id, typeCode: type?.id ?? "", description: txt(type?.attributes.description), series: txt(type?.attributes.measure_type_series_id), area: area?.id ?? "", start, end, vat: a.vat === true, excise: a.excise === true, dutyExpression: txt(dutyExpression?.attributes.base), components, conditions, footnotes, additionalCode, orderNumber, excludedCountries, unresolved, preferenceCode: preference[0]?.id, legalActs, percentage: /^\d+(\.\d+)?$/.test(rate) ? rate : null })
  }
  return { request, sourceUrl, retrievedAt, raw, commodity: { id: txt(data.id), type: "commodity", attributes: attrs, relationships: rec(data.relationships) }, measures }
}

/** Only unambiguous standard additive selections. Other taxes, conditional
 * rates and reliefs must go through their dedicated adapters, not be omitted. */
export function standardTariffSelection(snapshot: TariffSnapshot, vatSnapshot: TariffSnapshot = snapshot, quantities: TariffQuantity[] = [], treatment?: TariffTreatment, conversion?: TariffExchangeRate) {
  const issues: string[] = []
  const claimingAuthorisedUse = ["140", "115"].includes(treatment?.preferenceCode ?? "")
  let authorisedUse: ReturnType<typeof authorisedUseCandidate> | undefined
  if (claimingAuthorisedUse) {
    try {
      if (treatment?.jurisdiction !== "GB" || treatment.quotaClaim || treatment.preferenceReview || treatment.remedyReview) throw new Error("Authorised use with Northern Ireland, quotas, origin preferences or remedies needs its combined treatment.")
      authorisedUse = authorisedUseCandidate(snapshot, treatment.authorisedUseReview, treatment.preferenceCode, treatment.authorisedUseDocuments)
    } catch (error) { issues.push((error as Error).message) }
  }
  let quota: ReturnType<typeof quotaAllocationCandidate> | undefined
  if (treatment?.quotaClaim) {
    try {
      if (treatment.jurisdiction !== "GB" || snapshot.request.dataset !== "uk") throw new Error("NI quota selection needs the complete UK/EU capacity and movement review.")
      quota = quotaAllocationCandidate(snapshot, treatment.quotaClaim.review, treatment.quotaClaim.declared, quantities, conversion)
    } catch (error) { issues.push((error as Error).message) }
  }
  let remedies: ReturnType<typeof selectTradeRemedies> | undefined
  if (treatment?.remedyReview) {
    try {
      if (treatment.jurisdiction !== "GB" || snapshot.request.dataset !== "uk") throw new Error("NI remedies require the complete paired tariff and VAT treatment before selection.")
      remedies = selectTradeRemedies(snapshot, treatment.remedyReview, quantities, conversion, treatment.remedyDocuments)
    } catch (error) { issues.push((error as Error).message) }
  }
  if (vatSnapshot.request.dataset !== "uk") issues.push("UK tariff evidence is required for VAT; XI duty evidence cannot substitute for it.")
  if (["code", "origin", "date"].some(key => snapshot.request[key as keyof TariffRequest] !== vatSnapshot.request[key as keyof TariffRequest])) issues.push("Duty and VAT evidence must match the same commodity, origin and date.")
  const claimingPreference = !!treatment?.preferenceCode && treatment.preferenceCode !== "100" && !treatment.quotaClaim && !claimingAuthorisedUse
  const candidates = claimingPreference ? snapshot.measures.filter(m => ["142", "144"].includes(m.typeCode) && m.preferenceCode === treatment!.preferenceCode) : []
  const review = treatment?.preferenceReview
  const proofOrigin = treatment?.preferentialOrigin ?? snapshot.request.origin
  const duty = claimingAuthorisedUse ? authorisedUse ? [authorisedUse.measure] : [] : treatment?.quotaClaim ? quota ? [quota.measure] : [] : claimingPreference ? candidates.filter(m => !review?.measureId || m.id === review.measureId) : snapshot.measures.filter(m => m.typeCode === "103")
  if (claimingPreference) {
    if (!["200", "300"].includes(treatment!.preferenceCode)) issues.push("This preference needs its quota, suspension or end-use treatment; it cannot use the unrestricted preference calculation.")
    if (!review || review.preferenceCode !== treatment!.preferenceCode || review.origin !== proofOrigin || review.dataset !== snapshot.request.dataset) issues.push("Review origin evidence for this preference code, country and tariff dataset.")
    if (proofOrigin !== snapshot.request.origin) {
      // DE 5/16 uses EU for Union proof; the official tariff identifies that
      // group as 1013. Keep the individual-origin snapshot for all other taxes.
      const raw = snapshot.raw as { included?: { type?: string; id?: string; attributes?: { description?: string } }[] }
      const groups = raw?.included?.filter(row => row.type === "geographical_area" && row.id === "1013") ?? []
      if (proofOrigin !== "EU" || treatment?.jurisdiction !== "GB" || snapshot.request.dataset !== "uk" || treatment.preferenceCode !== "300" || groups.length !== 1 || groups[0].attributes?.description !== "European Union" || duty.length !== 1 || duty[0].area !== "1013") issues.push("The preferential-origin group must match the selected official measure in the individual-origin tariff response; other differing origins require separate treatment.")
    }
    if (!review || !validCustomsConversionDate(review.validFrom) || !validCustomsConversionDate(review.validTo) || review.validFrom > snapshot.request.date || review.validTo < snapshot.request.date || review.validFrom > review.validTo) issues.push("Record an origin-proof validity period covering the calculation date.")
    for (const [key, label] of [["proofReference", "proof of origin and its document code"], ["originRulesEvidence", "the applicable origin rules and agreement or scheme"], ["transportEvidence", "the applicable transport or non-alteration conditions"]] as const) {
      if (typeof review?.[key] !== "string" || !review[key].trim()) issues.push(`Record evidence for ${label}.`)
    }
    if (duty.some(m => !m.legalActs?.length)) issues.push("The preference measure is missing its official legal basis.")
  }
  const vatCodes = treatment?.nationalCodes?.filter(code => code.startsWith("VAT"))
  if (vatCodes && (new Set(vatCodes).size !== vatCodes.length || vatCodes.length > 1 || vatCodes.some(code => !["VATZ", "VATR"].includes(code)))) issues.push("Review the national VAT codes: choose one applicable VAT treatment, without duplicates.")
  const vat = vatSnapshot.measures.filter(m => m.vat && (vatCodes === undefined || (vatCodes.length ? txt(m.additionalCode?.attributes.code) === vatCodes[0] : !m.additionalCode)))
  if (vatCodes?.length && !treatment?.vatEvidence?.trim()) issues.push("Record the eligibility evidence for the claimed zero or reduced VAT rate.")
  if (vatCodes && !vatCodes.length && vat.some(m => /^(?:0|5)(?:\.0+)?$/.test(m.percentage ?? ""))) issues.push("Review the national VAT code required for the zero or reduced rate before calculating.")
  const sources = snapshot === vatSnapshot ? [snapshot] : [snapshot, vatSnapshot]
  const incomplete = sources.flatMap(source => source.measures.filter(m => m.unresolved.length || !m.typeCode || !m.area))
  if (incomplete.length) issues.push("The tariff response contains unresolved measure evidence: " + [...new Set(incomplete.map(m => m.id))].join(", "))
  // An explicit GB preference 100 does not claim an alternative 142 preference
  // or 119 airworthiness suspension, or explicitly correlated 117/140 end use.
  // Conditions on an unclaimed relief do not
  // establish conditions on the selected 103 measure; keep both in the snapshot.
  // Additional fiscal measures (including safeguards/remedies) are NOT excluded.
  // https://uktrade.github.io/tariff-data-manual/documentation/data-structures/preference-codes.html
  const notClaimed = claimingAuthorisedUse
    ? snapshot.measures.filter(m => !duty.includes(m) && !m.vat && !m.excise && !!m.preferenceCode && ["103", "105", "112", "115", "117", "119", "122", "123", "142", "143", "144", "145", "146"].includes(m.typeCode))
    : treatment?.quotaClaim
    ? snapshot.measures.filter(m => !duty.includes(m) && !m.vat && !m.excise && ["103", "117", "119", "122", "142", "143", "144"].includes(m.typeCode) && !!m.preferenceCode)
    : claimingPreference
    ? snapshot.measures.filter(m => !duty.includes(m) && !m.vat && !m.excise && !!m.preferenceCode && ((m.preferenceCode !== treatment!.preferenceCode && ["103", "112", "115", "117", "119", "122", "123", "142", "143", "144", "145", "146"].includes(m.typeCode)) || (!!review?.measureId && m.preferenceCode === treatment!.preferenceCode && ["142", "144"].includes(m.typeCode))))
    : (treatment?.jurisdiction === "GB" || (treatment?.jurisdiction === "NI" && treatment.niComparison === true)) && treatment?.preferenceCode === "100" && snapshot.request.dataset === "uk"
    ? snapshot.measures.filter(m => !m.vat && !m.excise && (
      (!m.orderNumber && (["142", "119"].includes(m.typeCode) || (m.typeCode === "117" && m.preferenceCode === "140"))) ||
      // Preference 100 does not claim the alternative 120 / 122 quota.
      // Safeguards (696), additional duties and securities remain in `others`.
      // Retain the quota evidence; do not use its rate or available balance.
      (m.typeCode === "122" && m.preferenceCode === "120" && !!m.orderNumber) ||
      // Correlation 100 selects 103 (+651/652/696), not an optional 143
      // preferential quota. Retain the unclaimed order and its conditions.
      (m.typeCode === "143" && ["220", "320"].includes(m.preferenceCode ?? "") && !!m.orderNumber)
    ))
    : treatment?.jurisdiction === "NI" && treatment.preferenceCode === "100" && snapshot.request.dataset === "xi"
    ? snapshot.measures.filter(m => !m.vat && !m.excise && ((!m.orderNumber && (
      (m.typeCode === "142" && ["200", "300"].includes(m.preferenceCode ?? "")) ||
      (m.typeCode === "119" && m.preferenceCode === "119") ||
      (m.typeCode === "117" && m.preferenceCode === "140")
    )) || (treatment.niComparison === true && m.typeCode === "143" && ["220", "320"].includes(m.preferenceCode ?? "") && !!m.orderNumber)))
    : []
  // Types 109/110 / expression 99 request a supplementary quantity, not money.
  // Only this explicit non-monetary shape is excluded; unexpected components block.
  const supplementary = (m: TariffMeasure) => ["109", "110"].includes(m.typeCode) && !m.excise && m.components.length > 0 && m.components.every(c => c.attributes.duty_expression_id === "99" && c.attributes.duty_amount == null && !c.attributes.monetary_unit_code)
  const lowValueReview = treatment?.lowValueExclusion
  const lowValueExcluded = snapshot.measures.filter(m => {
    if (m.typeCode !== "107" || snapshot.request.dataset !== "xi" || treatment?.jurisdiction !== "NI" || !lowValueReview) return false
    const c = m.components.length === 1 ? m.components[0].attributes : null
    // The temporary EUR 3 measure applies to distance sales. Do not infer this
    // classification from invoice value, a company name, or a procedure code.
    return snapshot.request.date >= "2026-07-01" && snapshot.request.date < "2028-07-01" &&
      lowValueReview.basis === "not-distance-sale" && lowValueReview.reviewDate === snapshot.request.date &&
      !!txt(lowValueReview.consignmentReference).trim() && !!txt(lowValueReview.evidence).trim() &&
      !m.excise && !m.conditions.length && !m.unresolved.length && !m.additionalCode && !m.orderNumber &&
      c?.duty_expression_id === "01" && String(c.duty_amount) === "3" && c.monetary_unit_code === "EUR" && !c.measurement_unit_code && !c.measurement_unit_qualifier_code
  })
  // The paired UK response supplies VAT, not a second set of customs duties.
  // Keep excise blockers from either source; an EU duty decision does not remove
  // domestic excise. Both complete graphs remain in the reference snapshot.
  const customsDutyTypes = new Set(["103", "107", "112", "115", "117", "119", "122", "123", "142", "143", "144", "145", "146", "551", "552", "553", "554", "651", "652", "696"])
  const others = sources.flatMap(source => source.measures.filter(m => (source === snapshot || m.excise || !customsDutyTypes.has(m.typeCode)) && (m.components.length || m.excise || ["C", "Q"].includes(m.series)) && !(claimingAuthorisedUse || claimingPreference || treatment?.quotaClaim ? duty.includes(m) : m.typeCode === "103") && !m.vat && !notClaimed.includes(m) && !supplementary(m)))
  if (duty.length !== 1) issues.push(claimingPreference ? "The tariff has no single matching preference measure. Review the requested treatment and select a measure where more than one applies." : "The tariff has no single standard duty measure; select the applicable treatment.")
  if (vat.length !== 1) issues.push("The tariff has multiple or missing VAT options; verify the applicable VAT treatment.")
  const reviewedRemedyIds = new Set([...(remedies?.selectedMeasureIds ?? []), ...(remedies?.alternativeMeasureIds ?? [])])
  const remainingFiscalMeasures = others.filter(m => !reviewedRemedyIds.has(m.id) && !lowValueExcluded.includes(m))
  // A separate authorised-use control can carry conditions without a monetary
  // component. It is not covered by the selected N990 measure's review.
  if (claimingAuthorisedUse && snapshot.measures.some(m => m.typeCode === "464" && !others.includes(m))) issues.push("The tariff includes a separate authorised-use control. Review its conditions before calculating the relief.")
  if (remainingFiscalMeasures.some(m => m.typeCode === "107")) issues.push("Check whether the EU low-value consignment duty applies. Record the consignment's intrinsic value and distance-sale treatment before using a normal duty rate; the invoice total alone is not sufficient.")
  if (remainingFiscalMeasures.length) issues.push("Additional or alternative fiscal measures require treatment selection: " + remainingFiscalMeasures.map(m => m.description || m.typeCode).join(", "))
  if (lowValueExcluded.length) notClaimed.push(...lowValueExcluded)
  for (const m of [...duty, ...vat]) {
    const reviewedVatCode = m.vat && vatCodes?.length === 1 && txt(m.additionalCode?.attributes.code) === vatCodes[0] && !!treatment?.vatEvidence?.trim()
    if ((m.vat && m.percentage === null) || (m.conditions.length && m !== authorisedUse?.measure) || (m.additionalCode && !reviewedVatCode) || (m.orderNumber && m !== quota?.measure) || m.unresolved.length || m.excludedCountries.includes(snapshot.request.origin)) issues.push(`Measure ${m.id} needs a condition, component or geographical eligibility check.`)
  }
  let formula: ReturnType<typeof tariffFormula> = { components: [], bounds: [] }
  if (duty.length === 1) {
    try {
      if (conversion && conversion.calculationDate !== snapshot.request.date) throw new Error("Tariff conversion evidence does not match the measure date.")
      formula = tariffFormula(duty[0].components, quantities, conversion)
    }
    catch (error) { issues.push(`Measure ${duty[0].id}: ${(error as Error).message}`) }
  }
  return { authorisedUseEvidence: issues.length ? undefined : authorisedUse?.evidence, duty: issues.length ? null : duty[0], vat: issues.length ? null : vat[0], components: issues.length ? [] : formula.components, bounds: issues.length ? [] : formula.bounds, remedies: issues.length ? [] : remedies?.measures ?? [], quotaEvidence: issues.length ? undefined : quota?.allocationEvidence, notClaimed: notClaimed.map(m => ({ id: m.id, reason: lowValueExcluded.includes(m) ? `Temporary low-value duty excluded: operator reviewed non-distance sale on ${lowValueReview!.reviewDate}; consignment ${lowValueReview!.consignmentReference}; evidence ${lowValueReview!.evidence}; source ${LOW_VALUE_DUTY_SOURCE}.` : claimingAuthorisedUse ? `Authorised use ${treatment!.preferenceCode}: alternative treatment ${m.preferenceCode} not claimed.` : treatment?.quotaClaim ? `Quota ${treatment.quotaClaim.declared.orderNumber}: alternative treatment ${m.preferenceCode} not claimed.` : claimingPreference ? `Preference ${treatment!.preferenceCode}: alternative treatment ${m.preferenceCode} not claimed.` : m.typeCode === "122" ? "Preference 100: quota not claimed; full-rate duty retained." : m.typeCode === "119" ? "Preference 100: airworthiness suspension not claimed." : "Preference 100: alternative tariff preference not claimed." })), issues }
}

export type TariffCredentials = { clientId: string; clientSecret: string }
export function createTariffClient(credentials: TariffCredentials, fetcher: typeof fetch = fetch) {
  let cached: { value: string; expires: number } | null = null
  let pending: Promise<string> | null = null
  const token = async () => {
    if (cached && cached.expires > Date.now() + 60_000) return cached.value
    if (pending) return pending
    pending = (async () => {
      if (!credentials.clientId || !credentials.clientSecret) throw new Error("The official tariff connection needs its server-side API credentials.")
      const response = await fetcher("https://auth.id.trade-tariff.service.gov.uk/oauth2/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: credentials.clientId, client_secret: credentials.clientSecret }) })
      if (!response.ok) throw new Error("Official tariff authentication failed. Check the integration credentials.")
      const payload = rec(await response.json()), seconds = Number(payload.expires_in)
      if (!txt(payload.access_token) || !Number.isFinite(seconds) || seconds <= 60) throw new Error("The official tariff returned invalid authentication metadata.")
      cached = { value: txt(payload.access_token), expires: Date.now() + Math.min(seconds, 86400) * 1000 }
      return cached.value
    })().finally(() => { pending = null })
    return pending
  }
  return async (request: TariffRequest) => {
    const url = tariffUrl(request)
    // The official public UK/XI endpoint exposes the same versioned JSON:API
    // graph. Use it only when OAuth is wholly unconfigured, never to hide a
    // partial configuration or an authentication failure. Record its actual URL.
    if (!credentials.clientId && !credentials.clientSecret) {
      const publicUrl = new URL(url)
      publicUrl.hostname = "www.trade-tariff.service.gov.uk"
      const response = await fetcher(publicUrl.toString(), { redirect: "error", signal: AbortSignal.timeout(15000), headers: { Accept: "application/vnd.hmrc.2.0+json" } })
      if (!response.ok) throw new Error(`Official public tariff lookup failed (${response.status}). Previous calculation evidence is retained.`)
      const snapshot = parseTariffSnapshot(await response.json(), request, new Date().toISOString())
      return { ...snapshot, sourceUrl: publicUrl.toString() }
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const accessToken = await token()
      const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(15000), headers: { Accept: "application/vnd.hmrc.2.0+json", Authorization: `Bearer ${accessToken}` } })
      if (response.status === 401 && attempt === 0) { cached = null; continue }
      if (!response.ok) throw new Error(`Official tariff lookup failed (${response.status}). Previous calculation evidence is retained.`)
      const raw = await response.json()
      return parseTariffSnapshot(raw, request, new Date().toISOString())
    }
    throw new Error("Official tariff authentication could not be renewed.")
  }
}
