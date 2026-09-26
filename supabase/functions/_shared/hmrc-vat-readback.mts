import { assembleHmrcVatFraudEvidence } from "./hmrc-vat-fraud-evidence.mts"
import { requestHmrcVatReturnReadbackEvidence } from "./hmrc-vat-oauth.mts"

type RpcResult = { data: unknown; error: unknown }
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult> }
type FraudInput = Parameters<typeof assembleHmrcVatFraudEvidence>[0]

type ReadbackResult =
  | { status: "preflight_failed"; reason: "fraud_evidence" | "authority" | "context" }
  | { status: "unresolved"; reason: "hmrc_read" | "durable_record" }
  | { status: "reconciliation_required"; result: "not_found" | "mismatch"; readbackId: string }
  | { status: "accepted_readback"; result: "matched"; readbackId: string }

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** A readback can resolve an uncertain dispatch, but never authorises a new
 * POST. All attempt, tenant and period identity comes from guarded server RPCs.
 * `send` is required so no caller can accidentally use live fetch. */
export async function reconcileHmrcVatReturnReadback(input: {
  db: RpcClient
  actorId: string
  entityId: string
  projectRef: string
  periodId: string
  connectionId: string
  attemptId: string
  fraud: FraudInput
  send: typeof fetch
  now?: () => Date
}): Promise<ReadbackResult> {
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
    p_connection: input.connectionId, p_attempt: input.attemptId }
  let access: Record<string, unknown> | null = null
  try {
    const result = await input.db.rpc("multideck_hmrc_vat_access_for_period", {
      ...scope, p_purpose: "readback",
    })
    if (!result.error) access = object(result.data)
  } catch { /* Deny GET when token access is unavailable. */ }
  if (!access || access.periodId !== input.periodId || access.connectionId !== input.connectionId
    || (access.environment !== "sandbox" && access.environment !== "production")
    || typeof access.vrn !== "string" || !/^\d{9}$/.test(access.vrn)
    || typeof access.accessToken !== "string" || !/^[!-~]{10,8000}$/.test(access.accessToken)) {
    return { status: "preflight_failed", reason: "authority" }
  }

  let context: Record<string, unknown> | null = null
  try {
    const result = await input.db.rpc("multideck_uk_vat_readback_context", scope)
    if (!result.error) context = object(result.data)
  } catch { /* A missing context can never select a period key. */ }
  if (!context || context.attemptId !== input.attemptId
    || context.periodId !== input.periodId || context.connectionId !== input.connectionId
    || context.environment !== access.environment || context.vrn !== access.vrn
    || typeof context.periodKey !== "string"
    || !/^(?:[A-Za-z0-9]{4}|#[A-Za-z0-9]{3})$/.test(context.periodKey)) {
    return { status: "preflight_failed", reason: "context" }
  }

  let evidence: Awaited<ReturnType<typeof requestHmrcVatReturnReadbackEvidence>>
  try {
    evidence = await requestHmrcVatReturnReadbackEvidence({
      environment: access.environment, vrn: access.vrn,
      periodKey: context.periodKey, accessToken: access.accessToken,
      fraudHeaders,
    }, input.send)
  } catch {
    return { status: "unresolved", reason: "hmrc_read" }
  }

  try {
    const result = await input.db.rpc("multideck_uk_vat_record_return_readback", {
      p_actor: input.actorId, p_entity: input.entityId,
      p_project_ref: input.projectRef, p_attempt: input.attemptId,
      p_connection: input.connectionId, p_http_status: evidence.httpStatus,
      p_raw_body: evidence.rawBody, p_correlation_id: evidence.correlationId,
    })
    const saved = !result.error ? object(result.data) : null
    if (saved?.attemptId !== input.attemptId || typeof saved.readbackId !== "string") {
      return { status: "unresolved", reason: "durable_record" }
    }
    if (evidence.status === "not_found" && saved.status === "reconciliation_required"
      && saved.result === "not_found") {
      return { status: "reconciliation_required", result: "not_found", readbackId: saved.readbackId }
    }
    if (evidence.status === "observed" && saved.status === "reconciliation_required"
      && saved.result === "mismatch") {
      return { status: "reconciliation_required", result: "mismatch", readbackId: saved.readbackId }
    }
    if (evidence.status === "observed" && saved.status === "accepted_readback"
      && saved.result === "matched") {
      return { status: "accepted_readback", result: "matched", readbackId: saved.readbackId }
    }
  } catch { /* A lost DB response cannot be interpreted as acceptance. */ }
  return { status: "unresolved", reason: "durable_record" }
}
