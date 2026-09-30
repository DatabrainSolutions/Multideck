import { assembleHmrcVatFraudEvidence } from "./hmrc-vat-fraud-evidence.mts"
import { matchOpenHmrcVatObligation, requestHmrcVatObligations } from "./hmrc-vat-oauth.mts"

type RpcResult = { data: unknown; error: unknown }
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult> }
type FraudInput = Parameters<typeof assembleHmrcVatFraudEvidence>[0]

type ObligationResult =
  | { status: "preflight_failed"; reason: "fraud_evidence" | "authority" | "context" }
  | { status: "unresolved"; reason: "hmrc_read" | "no_exact_open_obligation" | "durable_record" }
  | { status: "verified"; verificationId: string; dueDate: string; observedAt: string }

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** Binds one HMRC obligations GET to server-owned period dates and records its
 * exact open match. No browser date, VRN or period key can select the target.
 * The caller supplies an explicit HTTP sender; no route calls this yet. */
export async function verifyHmrcVatObligation(input: {
  db: RpcClient
  actorId: string
  entityId: string
  projectRef: string
  periodId: string
  connectionId: string
  fraud: FraudInput
  send: typeof fetch
  now?: () => Date
}): Promise<ObligationResult> {
  if (input.projectRef !== input.fraud.tenantProjectRef) {
    return { status: "preflight_failed", reason: "fraud_evidence" }
  }
  let fraudHeaders: Awaited<ReturnType<typeof assembleHmrcVatFraudEvidence>>
  try {
    fraudHeaders = await assembleHmrcVatFraudEvidence({ ...input.fraud, now: (input.now ?? (() => new Date()))() })
  } catch {
    return { status: "preflight_failed", reason: "fraud_evidence" }
  }
  const scope = { p_actor: input.actorId, p_entity: input.entityId,
    p_project_ref: input.projectRef, p_period: input.periodId,
    p_connection: input.connectionId }
  let access: Record<string, unknown> | null = null
  try {
    const result = await input.db.rpc("multideck_hmrc_vat_access_for_period", {
      ...scope, p_purpose: "obligations",
    })
    if (!result.error) access = object(result.data)
  } catch { /* No authority, no GET. */ }
  if (!access || access.periodId !== input.periodId || access.connectionId !== input.connectionId
    || (access.environment !== "sandbox" && access.environment !== "production")
    || typeof access.vrn !== "string" || !/^\d{9}$/.test(access.vrn)
    || typeof access.accessToken !== "string" || !/^[!-~]{10,8000}$/.test(access.accessToken)) {
    return { status: "preflight_failed", reason: "authority" }
  }
  let context: Record<string, unknown> | null = null
  try {
    const result = await input.db.rpc("multideck_hmrc_vat_obligation_context", scope)
    if (!result.error) context = object(result.data)
  } catch { /* Dates must come from a scoped database read. */ }
  if (!context || context.periodId !== input.periodId || context.connectionId !== input.connectionId
    || context.environment !== access.environment || context.vrn !== access.vrn
    || typeof context.startDate !== "string" || typeof context.endDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(context.startDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(context.endDate)
    || context.startDate > context.endDate) {
    return { status: "preflight_failed", reason: "context" }
  }
  let response: Awaited<ReturnType<typeof requestHmrcVatObligations>>
  try {
    response = await requestHmrcVatObligations({
      environment: access.environment, vrn: access.vrn,
      from: context.startDate, to: context.endDate, status: "O",
      accessToken: access.accessToken, fraudHeaders,
    }, input.send)
  } catch {
    return { status: "unresolved", reason: "hmrc_read" }
  }
  let match: ReturnType<typeof matchOpenHmrcVatObligation>
  try {
    match = matchOpenHmrcVatObligation(response.obligations, context.startDate, context.endDate)
  } catch {
    return { status: "unresolved", reason: "no_exact_open_obligation" }
  }
  try {
    const result = await input.db.rpc("multideck_hmrc_vat_record_obligation", {
      ...scope, p_obligation: match, p_correlation_id: response.correlationId,
    })
    const saved = !result.error ? object(result.data) : null
    if (saved?.periodId === input.periodId
      && saved.environment === access.environment
      && saved.periodKey === match.periodKey && saved.due === match.due
      && typeof saved.verificationId === "string"
      && typeof saved.observedAt === "string") {
      return { status: "verified", verificationId: saved.verificationId,
        dueDate: match.due, observedAt: saved.observedAt }
    }
  } catch { /* A lost write response is not proof of a verified obligation. */ }
  return { status: "unresolved", reason: "durable_record" }
}
