import { assembleHmrcVatFraudEvidence } from "./hmrc-vat-fraud-evidence.mts"
import { requestHmrcVatSubmission, type HmrcVatSubmissionReceipt } from "./hmrc-vat-oauth.mts"

type RpcResult = { data: unknown; error: unknown }
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult> }
type FraudInput = Parameters<typeof assembleHmrcVatFraudEvidence>[0]

type DispatchResult =
  | { status: "preflight_failed"; reason: "fraud_evidence" | "authority" }
  | { status: "claim_outcome_unknown" }
  | { status: "reconciliation_required"; kind: string; recorded: boolean; receipt?: HmrcVatSubmissionReceipt }
  | { status: "accepted"; receiptId: string; receipt: HmrcVatSubmissionReceipt }

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** No route invokes this yet. A future caller must supply a verified ingress
 * adapter, actual licence evidence and an expressly authorised filing action.
 * `send` is required so a caller cannot accidentally default to live fetch.
 * The database claim commits before the sole POST. Every ambiguous outcome
 * remains blocking; neither this function nor a caller may retry the POST. */
export async function dispatchHmrcVatReturn(input: {
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
}): Promise<DispatchResult> {
  const clock = input.now ?? (() => new Date())
  if (input.projectRef !== input.fraud.tenantProjectRef) {
    return { status: "preflight_failed", reason: "fraud_evidence" }
  }
  try {
    await assembleHmrcVatFraudEvidence({ ...input.fraud, now: clock() })
  } catch {
    return { status: "preflight_failed", reason: "fraud_evidence" }
  }
  let access: Record<string, unknown> | null = null
  try {
    const result = await input.db.rpc("multideck_hmrc_vat_access_for_period", {
      p_actor: input.actorId, p_entity: input.entityId, p_project_ref: input.projectRef,
      p_period: input.periodId, p_connection: input.connectionId,
      p_purpose: "submission", p_attempt: input.attemptId,
    })
    if (!result.error) access = object(result.data)
  } catch { /* A failed preclaim read cannot send a return. */ }
  if (!access || access.periodId !== input.periodId || access.connectionId !== input.connectionId
    || (access.environment !== "sandbox" && access.environment !== "production")
    || typeof access.vrn !== "string" || !/^\d{9}$/.test(access.vrn)
    || typeof access.accessToken !== "string"
    || !/^[!-~]{10,8000}$/.test(access.accessToken)) {
    return { status: "preflight_failed", reason: "authority" }
  }

  let claim: Record<string, unknown> | null = null
  try {
    const result = await input.db.rpc("multideck_uk_vat_claim_submission_dispatch", {
      p_actor: input.actorId, p_entity: input.entityId,
      p_project_ref: input.projectRef, p_attempt: input.attemptId,
    })
    if (!result.error) claim = object(result.data)
  } catch { /* The commit may have succeeded even if this response was lost. */ }
  if (!claim || claim.status !== "dispatching" || claim.attemptId !== input.attemptId) {
    return { status: "claim_outcome_unknown" }
  }

  const markUnresolved = async (kind: string, httpStatus: number | null, receipt?: HmrcVatSubmissionReceipt): Promise<DispatchResult> => {
    let recorded = false
    try {
      const result = await input.db.rpc("multideck_uk_vat_record_submission_uncertainty", {
        p_actor: input.actorId, p_entity: input.entityId,
        p_project_ref: input.projectRef, p_attempt: input.attemptId,
        p_kind: kind, p_http_status: httpStatus,
      })
      recorded = !result.error && object(result.data)?.status === "reconciliation_required"
    } catch { /* dispatching remains a blocking database state */ }
    return { status: "reconciliation_required", kind, recorded, ...(receipt ? { receipt } : {}) }
  }

  const body = claim.payloadBody
  if (typeof body !== "string" || body.length < 100 || body.length > 2000
    || typeof claim.payloadSha256 !== "string"
    || claim.payloadSha256 !== await sha256Hex(body)) {
    return markUnresolved("other", null)
  }
  let fraudHeaders: Awaited<ReturnType<typeof assembleHmrcVatFraudEvidence>>
  try {
    // Recheck time-sensitive ingress and MFA evidence after the durable claim.
    fraudHeaders = await assembleHmrcVatFraudEvidence({ ...input.fraud, now: clock() })
  } catch {
    return markUnresolved("other", null)
  }
  let outcome: Awaited<ReturnType<typeof requestHmrcVatSubmission>>
  try {
    outcome = await requestHmrcVatSubmission({
      environment: access.environment, vrn: access.vrn,
      payloadBody: body, accessToken: access.accessToken, fraudHeaders,
    }, input.send)
  } catch {
    return markUnresolved("other", null)
  }
  if (outcome.status !== "accepted") {
    return markUnresolved(outcome.kind, outcome.httpStatus)
  }
  try {
    const result = await input.db.rpc("multideck_uk_vat_record_submission_receipt", {
      p_actor: input.actorId, p_entity: input.entityId,
      p_project_ref: input.projectRef, p_attempt: input.attemptId,
      p_http_status: 201, p_receipt: outcome.receipt,
    })
    const saved = !result.error ? object(result.data) : null
    if (saved?.status === "accepted" && saved.attemptId === input.attemptId
      && typeof saved.receiptId === "string") {
      return { status: "accepted", receiptId: saved.receiptId, receipt: outcome.receipt }
    }
  } catch { /* A 201 with an unpersisted receipt must remain blocking. */ }
  return markUnresolved("other", 201, outcome.receipt)
}
