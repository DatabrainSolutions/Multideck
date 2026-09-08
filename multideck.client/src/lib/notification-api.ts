import { supabase } from "@/lib/supabase"

export type WorkspaceNotification = {
  id: string
  title: string
  body: string
  priority: string
  status: string
  targetTable?: string | null
  targetId?: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export function workspaceNotificationFromRow(row: Record<string, unknown>): WorkspaceNotification {
  return {
    id: String(row.CommNotif_ID),
    title: String(row.CommNotif_Title),
    body: String(row.CommNotif_Body ?? ""),
    priority: String(row.CommNotif_PriorityCode),
    status: String(row.CommNotif_StatusCode),
    targetTable: row.CommNotif_TargetTable ? String(row.CommNotif_TargetTable) : null,
    targetId: row.CommNotif_TargetID ? String(row.CommNotif_TargetID) : null,
    metadata: row.CommNotif_MetadataJSON && typeof row.CommNotif_MetadataJSON === "object" ? row.CommNotif_MetadataJSON as Record<string, unknown> : {},
    createdAt: String(row.CommNotif_CreatedAt),
  }
}

export async function listWorkspaceNotifications(take = 20) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const rows: WorkspaceNotification[] = []
  const limit = Math.max(1, Math.floor(Number.isFinite(take) ? take : 20))
  // PostgREST caps each response; fetch explicit ranges so older records remain reachable.
  for (let offset = 0; offset < limit; offset += 1000) {
    const size = Math.min(1000, limit - offset)
    const { data, error } = await supabase
      .from("Comm_Notifications")
      .select("CommNotif_ID,CommNotif_Title,CommNotif_Body,CommNotif_PriorityCode,CommNotif_StatusCode,CommNotif_TargetTable,CommNotif_TargetID,CommNotif_MetadataJSON,CommNotif_CreatedAt")
      .is("CommNotif_DismissedAt", null)
      .order("CommNotif_CreatedAt", { ascending: false })
      .order("CommNotif_ID", { ascending: false })
      .range(offset, offset + size - 1)
    if (error) throw error
    rows.push(...(data ?? []).map((row) => workspaceNotificationFromRow(row as Record<string, unknown>)))
    if (!data || data.length < size) break
  }
  return rows
}

export async function loadWorkspaceNotificationFeed(take = 20) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const [notifications, unread, total] = await Promise.all([
    listWorkspaceNotifications(take),
    supabase.from("Comm_Notifications").select("CommNotif_ID", { count: "exact", head: true }).is("CommNotif_DismissedAt", null).eq("CommNotif_StatusCode", "unread"),
    supabase.from("Comm_Notifications").select("CommNotif_ID", { count: "exact", head: true }).is("CommNotif_DismissedAt", null),
  ])
  if (unread.error) throw unread.error
  if (total.error) throw total.error
  return { notifications, unreadCount: unread.count ?? 0, total: total.count ?? 0 }
}

export async function markWorkspaceNotificationRead(notificationId: string) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_StatusCode: "read", CommNotif_ReadAt: new Date().toISOString() })
    .eq("CommNotif_ID", notificationId)
    .select("CommNotif_ID").single()
  if (error) throw error
}

export async function markWorkspaceNotificationUnread(notificationId: string) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_StatusCode: "unread", CommNotif_ReadAt: null })
    .eq("CommNotif_ID", notificationId)
    .is("CommNotif_DismissedAt", null)
    .select("CommNotif_ID").single()
  if (error) throw error
}

export async function markAllWorkspaceNotificationsRead() {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_StatusCode: "read", CommNotif_ReadAt: new Date().toISOString() })
    .eq("CommNotif_StatusCode", "unread")
    .is("CommNotif_DismissedAt", null)
  if (error) throw error
}

export async function dismissWorkspaceNotification(notificationId: string) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_DismissedAt: new Date().toISOString() })
    .eq("CommNotif_ID", notificationId)
    .is("CommNotif_DismissedAt", null)
    .select("CommNotif_ID").single()
  if (error) throw error
}

export async function dismissAllWorkspaceNotifications() {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_DismissedAt: new Date().toISOString() })
    .is("CommNotif_DismissedAt", null)
  if (error) throw error
}
