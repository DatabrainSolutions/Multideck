import type { WorkspaceNotification } from "./notification-api"

/** Notifications may carry a URL or just the source record's identity. */
export function workspaceNotificationDestination(notification: Pick<WorkspaceNotification, "metadata" | "targetTable" | "targetId">, origin: string): string | null {
  for (const value of [notification.metadata.action_url, notification.metadata.url]) {
    if (typeof value !== "string" || !value.trim()) continue
    try {
      const url = new URL(value, origin)
      if (url.origin === origin && !url.username && !url.password) return `${url.pathname}${url.search}${url.hash}`
    } catch { /* Fall back to the source record. */ }
  }
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null
  const id = text(notification.targetId)
  const suggestionId = text(notification.metadata.suggestion_id) ?? (notification.targetTable === "AI_InboxSuggestedUpdates" ? id : null)
  if (suggestionId) return `/inbox?view=suggested&suggestion=${encodeURIComponent(suggestionId)}`
  if (notification.targetTable === "CRM_Leads" && id) return `/crm/leads/${encodeURIComponent(id)}`
  if (notification.targetTable === "CRM_LeadTransferRequests") {
    const leadId = text(notification.metadata.leadId)
    return leadId ? `/crm/leads/${encodeURIComponent(leadId)}` : "/crm/leads"
  }
  if (notification.targetTable === "AI_DexterWatches" && id) return `/agent-dexter?watch=${encodeURIComponent(id)}`
  return null
}
