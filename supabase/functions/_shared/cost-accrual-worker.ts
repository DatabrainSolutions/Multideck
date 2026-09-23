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
