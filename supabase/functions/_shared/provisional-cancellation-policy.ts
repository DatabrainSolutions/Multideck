/** Pure planning policy; not an authorization boundary or a persistence API.
 * The future transactional adapter must load these facts under a job lock,
 * enforce tenant/Bookings.Write access and expected revision, and persist the
 * complete charge snapshot plus actor/time/reason in append-only audit history.
 * Never accept these facts directly from a browser or Dexter action payload.
 */
export type ChargeDecision = "keep" | "discard"
export type CancellationState = {
  status: string
  planningChargeCount: number
  hasFinancialRecords: boolean
  cancellation: { origin: "provisional"; decision: ChargeDecision | null } | null
}

export type CancellationPlan = {
  status: "cancelled" | "draft"
  chargeAction: "retain-inactive" | "archive-discarded" | "preserve"
  financialReportingEligible: false
  reviewPricesAndDates: boolean
  event: "provisional_cancelled" | "provisional_reopened"
  reason: string
  decision: ChargeDecision | null
}

export function planProvisionalCancellation(
  state: CancellationState,
  request: { action: "cancel" | "reopen"; reason: string; decision?: ChargeDecision },
): CancellationPlan {
  const reason = request.reason.trim()
  if (!reason) throw new Error("Record a reason for cancellation or reopening.")
  if (!Number.isSafeInteger(state.planningChargeCount) || state.planningChargeCount < 0) {
    throw new Error("The planning charge count is invalid.")
  }
  if (state.hasFinancialRecords) {
    throw new Error("Financial records require Finance review; this action cannot discard or hide them.")
  }
  const status = state.status.trim().toLowerCase()
  if (request.action === "reopen") {
    if (status !== "cancelled" || state.cancellation?.origin !== "provisional") {
      throw new Error("Only a recorded provisional cancellation can reopen through this action.")
    }
    if (request.decision !== undefined) throw new Error("Reopening cannot change the recorded charge decision.")
    return {
      status: "draft", chargeAction: "preserve", financialReportingEligible: false,
      reviewPricesAndDates: true, event: "provisional_reopened", reason,
      decision: state.cancellation.decision,
    }
  }
  if (request.action !== "cancel") throw new Error("Unsupported provisional action.")
  if (!["draft", "provisional"].includes(status)) throw new Error("Only Provisional bookings can use this cancellation action.")
  if (request.decision !== undefined && !["keep", "discard"].includes(request.decision)) {
    throw new Error("Choose Keep or Discard for the planning charges.")
  }
  if (state.planningChargeCount > 0 && !request.decision) {
    throw new Error("Choose Keep or Discard for the planning charges.")
  }
  const decision = state.planningChargeCount > 0 ? request.decision! : null
  return {
    status: "cancelled", chargeAction: decision === "discard" ? "archive-discarded" : "retain-inactive",
    financialReportingEligible: false, reviewPricesAndDates: false,
    event: "provisional_cancelled", reason, decision,
  }
}
