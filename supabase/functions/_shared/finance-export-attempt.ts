import { HttpError } from "./backend.ts"
import { AccountingProviderPartialError, exportFinanceRecord, type CanonicalFinanceExport } from "./accounting-providers.ts"

/** Provider effects are recoverable by identity; local completion is one fenced transaction. */
export async function deliverFinanceExport(admin: any, actorId: string, queueId: string, connectionId: string, input: CanonicalFinanceExport, deliver = exportFinanceRecord) {
  const claim = await admin.rpc("multideck_finance_begin_export", { p_queue: queueId, p_actor: actorId, p_connection: connectionId, p_canonical: input })
  if (claim.error || !claim.data?.token) throw new HttpError(claim.error?.code === "42501" ? 403 : 409, "The finance export could not be reserved. Refresh its status and review the connection before retrying.")
  let result: Record<string, unknown>
  let providerError: unknown
  try {
    const exported = await deliver(input)
    result = { status: "synced", ...exported }
  } catch (error) {
    providerError = error
    const mismatch = error instanceof AccountingProviderPartialError && error.readback?.status === "mismatch"
    const blocked = mismatch || error instanceof HttpError && error.status === 409
    result = {
      status: blocked ? "blocked" : "failed",
      issue: mismatch ? "provider_delivery_mismatch" : blocked ? "mapping_required" : "provider_export_failed",
      message: (error instanceof Error ? error.message : "Accounting provider export failed.").slice(0, 500),
      ...(error instanceof AccountingProviderPartialError ? {
        externalObjectType: error.externalObjectType, externalId: error.externalId, externalNumber: error.externalId,
        requestPayload: error.requestPayload, responsePayload: { state: "provider_reference_retained", deliveryVerification: error.readback },
      } : {}),
    }
  }
  // Keep completion outside the provider catch. A database outage must leave the
  // lease/evidence recoverable, not be misreported as a new provider failure.
  const finished = await admin.rpc("multideck_finance_finish_export", { p_queue: queueId, p_token: claim.data.token, p_actor: actorId, p_result: result })
  if (finished.error || finished.data?.completed !== true) throw new HttpError(503, "Provider delivery was attempted, but its local completion was not confirmed. Refresh the export before retrying; the retained identity prevents a second ERPNext document.")
  if (finished.data.status !== "synced") {
    throw new HttpError(finished.data.status === "blocked" ? 409 : 502, finished.data.message || (providerError instanceof Error ? providerError.message : "Accounting delivery needs review."))
  }
  return { id: queueId, status: "synced", provider: input.providerCode, externalObjectType: result.externalObjectType, externalId: result.externalId, externalNumber: result.externalNumber, externalUrl: result.externalUrl }
}
