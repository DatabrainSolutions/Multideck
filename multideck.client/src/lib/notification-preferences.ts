import type { LanguageCode } from "@/i18n/languages"
import { supabase } from "@/lib/supabase"

export const notificationEventTypes = [
  "customs_hold",
  "eta_delay",
  "customer_message",
  "document_parse",
  "daily_digest",
  "quote_reminder",
  "product_updates",
  "dexter_watch",
] as const

export type NotificationEventType = (typeof notificationEventTypes)[number]

export type NotificationEmailPreferences = Record<NotificationEventType, boolean> & {
  digestTime: string
  timezone: string
}

export const defaultNotificationEmailPreferences: NotificationEmailPreferences = {
  customs_hold: true,
  eta_delay: true,
  customer_message: true,
  document_parse: false,
  daily_digest: true,
  quote_reminder: true,
  product_updates: true,
  dexter_watch: false,
  digestTime: "07:30",
  timezone: "Europe/London",
}

async function requireWorkspaceUserId() {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error("Authentication required.")

  const { data, error } = await supabase
    .from("cmp_Users")
    .select("User_ID")
    .eq("Auth_User_ID", authData.user.id)
    .single()
  if (error || !data) throw error ?? new Error("Workspace profile not found.")
  return data.User_ID as string
}

export async function loadNotificationEmailPreferences() {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const userId = await requireWorkspaceUserId()
  const { data, error } = await supabase
    .from("Comm_UserNotificationPreferences")
    .select("CommNotifPref_EventType,CommNotifPref_IsEnabled,CommNotifPref_QuietHoursJSON")
    .eq("CommNotifPref_UserID", userId)
    .eq("CommNotifPref_ChannelCode", "email")
    .limit(notificationEventTypes.length)
  if (error) throw error

  const preferences = { ...defaultNotificationEmailPreferences }
  for (const row of data ?? []) {
    if (notificationEventTypes.includes(row.CommNotifPref_EventType as NotificationEventType)) {
      preferences[row.CommNotifPref_EventType as NotificationEventType] = Boolean(row.CommNotifPref_IsEnabled)
    }
    if (row.CommNotifPref_EventType === "daily_digest" && row.CommNotifPref_QuietHoursJSON) {
      preferences.digestTime = String(row.CommNotifPref_QuietHoursJSON.delivery_time ?? preferences.digestTime)
      preferences.timezone = String(row.CommNotifPref_QuietHoursJSON.timezone ?? preferences.timezone)
    }
  }
  return preferences
}

export async function saveNotificationEmailPreferences(preferences: NotificationEmailPreferences) {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const userId = await requireWorkspaceUserId()
  const rows = notificationEventTypes.map((eventType) => ({
    CommNotifPref_UserID: userId,
    CommNotifPref_ChannelCode: "email",
    CommNotifPref_EventType: eventType,
    CommNotifPref_IsEnabled: preferences[eventType],
    CommNotifPref_DeliveryChannelsJSON: { email: preferences[eventType], in_app: true },
    CommNotifPref_QuietHoursJSON: eventType === "daily_digest"
      ? { delivery_time: preferences.digestTime, timezone: preferences.timezone }
      : {},
    CommNotifPref_UpdatedAt: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from("Comm_UserNotificationPreferences")
    .upsert(rows, { onConflict: "CommNotifPref_UserID,CommNotifPref_ChannelCode,CommNotifPref_EventType" })
  if (error) throw error
}

export async function sendNotificationTestEmail(locale: LanguageCode) {
  if (!supabase) throw new Error("Supabase is not configured for this workspace.")
  const { data, error } = await supabase.functions.invoke("send-notification-email", {
    body: { action: "test", locale },
  })
  if (error) throw error
  if (!data?.delivered) throw new Error("The test email was not delivered.")
  return data as { delivered: true; id: string | null }
}
