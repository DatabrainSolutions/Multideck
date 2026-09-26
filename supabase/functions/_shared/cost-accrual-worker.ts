import { attemptDelivery } from "./finance-journal-delivery.ts"

/** Invoked only by the authenticated tenant accounting worker. No browser input. */
export async function processCostFinalisations(admin: any) {
  const queue = await admin.rpc("multideck_cost_work_queue")
  if (queue.error) throw new Error("Cost finalisation queue is unavailable")
  const result = { evaluated: 0, delivered: 0, failed: 0 }
  for (const item of queue.data.pending ?? []) {
    // The database rechecks current authority, policy, invoices and period in
    // the same transaction as the posting. A duplicate invocation is harmless.
    const posted = await admin.rpc("multideck_cost_finalise", { p_entity: item.legal_entity_id, p_evidence: item.id })
    if (posted.error) result.failed++
    else result.evaluated++
  }
  // Refresh after posting so newly queued mirrors need not wait for another tick.
  const delivery = await admin.rpc("multideck_cost_work_queue")
  if (delivery.error) throw new Error("Cost journal delivery queue is unavailable")
  for (const item of delivery.data.delivery ?? []) {
    try {
      const journal = await attemptDelivery(admin, item.authorised_by, item.legal_entity_id, item.id)
      if (journal.mirror_status === "synced") result.delivered++
      else result.failed++
    } catch { result.failed++ }
  }
  return result
}

/** Classify committed charge events after the native cost finalisation pass. */
export async function processChargeLifecycle(admin: any) {
  const queue = await admin.rpc("multideck_charge_lifecycle_work_queue")
  if (queue.error || !Array.isArray(queue.data)) throw new Error("Charge lifecycle queue is unavailable")
  const result = { evaluated: 0, review: 0, failed: 0 }
  for (const item of queue.data) {
    const args = {
      p_entity: item.legal_entity_id,
      p_charge: item.charge_id,
      p_revision: item.source_revision,
    }
    const decision = await admin.rpc("multideck_charge_lifecycle_process", args)
    if (!decision.error) {
      if (decision.data?.status !== "newer_event") result.evaluated++
      if (decision.data?.status === "review") result.review++
      continue
    }
    result.failed++
    // A newer source event must not inherit a failure from an older revision.
    await admin.rpc("multideck_charge_lifecycle_record_failure", {
      ...args,
      p_reason: String(decision.error.message || "Lifecycle evaluation failed").slice(0, 500),
    })
  }
  return result
}

/** Post only under a separately approved recognition mandate and fresh evidence. */
export async function processChargeRecognition(admin: any) {
  const queue = await admin.rpc("multideck_charge_lifecycle_work_queue")
  if (queue.error || !Array.isArray(queue.data)) throw new Error("Charge recognition queue is unavailable")
  const result = { posted: 0, review: 0, failed: 0 }
  for (const item of queue.data) {
    const args = {
      p_entity: item.legal_entity_id,
      p_charge: item.charge_id,
      p_revision: item.source_revision,
    }
    for (const kind of ["cost", "revenue"] as const) {
      const posting = await admin.rpc("multideck_charge_recognise_initial", { ...args, p_kind: kind })
      if (posting.error) {
        result.failed++
        await admin.rpc("multideck_charge_lifecycle_record_failure", {
          ...args,
          p_reason: String(posting.error.message || "Recognition failed").slice(0, 500),
        })
        break
      }
      if (posting.data?.status === "posted") result.posted++
      if (posting.data?.status === "review") result.review++
      if (["posted", "review", "newer_event"].includes(posting.data?.status)) break
    }
  }
  return result
}
