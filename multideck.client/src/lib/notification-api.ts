import { supabase } from "@/lib/supabase"

export type WorkspaceNotification = {
  id: string
  title: string
  body: string
  priority: string
  status: string
  targetId?: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export async function listWorkspaceNotifications(take = 8) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { data, error } = await supabase
    .from("Comm_Notifications")
    .select("CommNotif_ID,CommNotif_Title,CommNotif_Body,CommNotif_PriorityCode,CommNotif_StatusCode,CommNotif_TargetID,CommNotif_MetadataJSON,CommNotif_CreatedAt")
    .is("CommNotif_DismissedAt", null)
    .order("CommNotif_CreatedAt", { ascending: false })
    .limit(Math.max(1, Math.min(take, 20)))
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.CommNotif_ID),
    title: String(row.CommNotif_Title),
    body: String(row.CommNotif_Body ?? ""),
    priority: String(row.CommNotif_PriorityCode),
    status: String(row.CommNotif_StatusCode),
    targetId: row.CommNotif_TargetID ? String(row.CommNotif_TargetID) : null,
    metadata: row.CommNotif_MetadataJSON && typeof row.CommNotif_MetadataJSON === "object" ? row.CommNotif_MetadataJSON as Record<string, unknown> : {},
    createdAt: String(row.CommNotif_CreatedAt),
  })) satisfies WorkspaceNotification[]
}

export async function markWorkspaceNotificationRead(notificationId: string) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_StatusCode: "read", CommNotif_ReadAt: new Date().toISOString() })
    .eq("CommNotif_ID", notificationId)
  if (error) throw error
}

export async function markWorkspaceNotificationUnread(notificationId: string) {
  if (!supabase) throw new Error("Notifications are not connected to this workspace.")
  const { error } = await supabase
    .from("Comm_Notifications")
    .update({ CommNotif_StatusCode: "unread", CommNotif_ReadAt: null })
    .eq("CommNotif_ID", notificationId)
    .is("CommNotif_DismissedAt", null)
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
