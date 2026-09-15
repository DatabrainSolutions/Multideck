export const CALCULATE_CUSTOMS_ACTION = "calculate_customs_duties"
export const OVERRIDE_CUSTOMS_CALCULATION_ACTION = "override_customs_calculation"
export const RECORD_CUSTOMS_ASSESSMENT_ACTION = "record_customs_assessment_comparison"
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const amount = (value: unknown): value is string => typeof value === "string" && /^\d{1,16}\.\d{2}$/.test(value)

/** Explicit allowlist: an approved calculation action cannot select a filing URL
 * or supply arbitrary declaration fields. Backend validation remains authoritative. */
export function customsCalculationActionRequest(action: string, args: Record<string, unknown>) {
  if (action === "preview_customs_calculation") throw new Error("Live estimates use unsaved inputs in the standalone import editor. Dexter cannot read or watch that preview. Save the draft to retain a calculation for Dexter and Watching for you.")
  if (!uuid(args.target_id)) throw new Error("Select the exact Customs declaration.")
  if (typeof args.reason !== "string" || args.reason.trim().length < 10 || args.reason.trim().length > 2000) throw new Error("Provide a reason of 10–2,000 characters.")
  if (action === RECORD_CUSTOMS_ASSESSMENT_ACTION) {
    if (!uuid(args.source_id)) throw new Error("Select the retained provider response.")
    return { path: `/declarations/${encodeURIComponent(args.target_id)}/assessment-comparisons`, body: { sourceId: args.source_id } }
  }
  const path = `/declarations/${encodeURIComponent(args.target_id)}/calculations`
  if (action === CALCULATE_CUSTOMS_ACTION) return { path, body: {} }
  if (action !== OVERRIDE_CUSTOMS_CALCULATION_ACTION) throw new Error("This calculation action is not available.")
  if (!uuid(args.calculation_id) || typeof args.item_id !== "string" || !args.item_id || args.item_id.length > 200 || !amount(args.duty) || !amount(args.vat)) throw new Error("Select the calculation and item, and enter duty and VAT in GBP with two decimal places.")
  return { path: `${path}/override`, body: { calculationId: args.calculation_id, itemId: args.item_id, duty: args.duty, vat: args.vat, reason: args.reason.trim() } }
}

export async function executeCustomsCalculationAction(action: string, args: Record<string, unknown>, connection: { url: string; anonKey: string; authorization: string }, fetcher: typeof fetch = fetch) {
  let request: ReturnType<typeof customsCalculationActionRequest>
  try { request = customsCalculationActionRequest(action, args) }
  catch (error) { return { data: null, error: { code: "calculation_arguments_invalid", message: (error as Error).message } } }
  try {
    const response = await fetcher(`${connection.url}/functions/v1/icustoms-api${request.path}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(120000),
      headers: { Authorization: connection.authorization, apikey: connection.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(request.body),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) return { data: null, error: { code: `calculation_${response.status}`, message: typeof payload?.detail === "string" ? payload.detail.slice(0, 500) : "The calculation service rejected the action. Check the declaration and its history." } }
    if (!payload || typeof payload.id !== "string") return { data: null, error: { code: "calculation_result_unknown", message: "The service response did not confirm an audit record. Check calculation history before retrying." } }
    return { data: payload, error: null }
  } catch {
    return { data: null, error: { code: "calculation_result_unknown", message: "The calculation response was interrupted. Check history before retrying; the service may have saved a result. No customs submission was requested." } }
  }
}
