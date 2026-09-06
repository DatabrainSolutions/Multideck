import { useSyncExternalStore } from "react"
import { authenticatedAccessChangedEvent, getSupabaseSession, supabase } from "@/lib/supabase"
import { captureAuthenticatedScope } from "@/lib/crm-read-cache"
import { createNotificationStore } from "@/lib/notification-store"
import { dismissAllWorkspaceNotifications, dismissWorkspaceNotification, listWorkspaceNotifications, markAllWorkspaceNotificationsRead, markWorkspaceNotificationRead, markWorkspaceNotificationUnread } from "@/lib/notification-api"

let connectionSequence = 0
const store = createNotificationStore({
  async load() {
    const session = await getSupabaseSession()
    if (!session?.user) return []
    const assertCurrent = captureAuthenticatedScope(session.user.id)
    const result = await listWorkspaceNotifications()
    assertCurrent()
    return result
  },
  connect(changed) {
    const client = supabase
    if (!client) return () => undefined
    const channel = client.channel(`workspace-notifications-${++connectionSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "Comm_Notifications" }, changed)
      .subscribe()
    return () => { void client.removeChannel(channel) }
  },
  onError(error) { if (!(error instanceof Error && error.name === "AbortError")) console.error("Notifications could not be updated.", error) },
})

if (typeof window !== "undefined") window.addEventListener(authenticatedAccessChangedEvent, (event) => {
  store.reset((event as CustomEvent<{ identityChanged: boolean }>).detail?.identityChanged === false)
})

export function useWorkspaceNotifications() {
  const notifications = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return {
    notifications,
    updateNotificationStatus: (id: string, status: "read" | "unread") => store.mutate(
      (current) => current.map((notification) => notification.id === id ? { ...notification, status } : notification),
      () => status === "read" ? markWorkspaceNotificationRead(id) : markWorkspaceNotificationUnread(id),
    ),
    dismissNotification: (id: string) => store.mutate((current) => current.filter((notification) => notification.id !== id), () => dismissWorkspaceNotification(id)),
    markAllRead: () => store.mutate((current) => current.map((notification) => ({ ...notification, status: "read" })), markAllWorkspaceNotificationsRead),
    clearNotifications: () => store.mutate(() => [], dismissAllWorkspaceNotifications),
  }
}
