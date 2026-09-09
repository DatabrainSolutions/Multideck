import { toast } from "sonner"
import { useSyncExternalStore } from "react"
import { authenticatedAccessChangedEvent, getSupabaseSession, supabase } from "@/lib/supabase"
import { captureAuthenticatedScope } from "@/lib/crm-read-cache"
import { createNotificationStore } from "@/lib/notification-store"
import { dismissAllWorkspaceNotifications, dismissWorkspaceNotification, loadWorkspaceNotificationFeed, markAllWorkspaceNotificationsRead, markWorkspaceNotificationRead, markWorkspaceNotificationUnread } from "@/lib/notification-api"

let connectionSequence = 0
let visibleLimit = 20
const store = createNotificationStore({
  async load() {
    const session = await getSupabaseSession()
    if (!session?.user) return { notifications: [], unreadCount: 0, total: 0 }
    const assertCurrent = captureAuthenticatedScope(session.user.id)
    const result = await loadWorkspaceNotificationFeed(visibleLimit)
    assertCurrent()
    return result
  },
  connect(changed) {
    const client = supabase
    if (!client) return () => undefined
    const channel = client.channel(`workspace-notifications-${++connectionSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "Comm_Notifications" }, changed)
      .subscribe((status) => { if (status === "SUBSCRIBED") changed() })
    const onVisible = () => { if (document.visibilityState === "visible") changed() }
    window.addEventListener("focus", changed)
    window.addEventListener("online", changed)
    document.addEventListener("visibilitychange", onVisible)
    const timer = window.setInterval(onVisible, 60_000)
    return () => {
      window.removeEventListener("focus", changed)
      window.removeEventListener("online", changed)
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(timer)
      void client.removeChannel(channel)
    }
  },
  onError(error, operation) { if (operation === "save" && !(error instanceof Error && error.name === "AbortError")) toast.error("Notifications could not be updated. Please try again.") },
})

if (typeof window !== "undefined") window.addEventListener(authenticatedAccessChangedEvent, (event) => {
  visibleLimit = 20
  store.reset((event as CustomEvent<{ identityChanged: boolean }>).detail?.identityChanged === false)
})

export function useWorkspaceNotifications() {
  const notifications = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  return {
    ...state,
    notifications,
    refresh: store.refresh,
    hasMore: notifications.length < state.total,
    loadMore: () => { visibleLimit = visibleLimit + 20; return store.refresh() },
    updateNotificationStatus: (id: string, status: "read" | "unread") => store.mutate(
      (current) => current.map((notification) => notification.id === id ? { ...notification, status } : notification),
      () => status === "read" ? markWorkspaceNotificationRead(id) : markWorkspaceNotificationUnread(id),
    ),
    dismissNotification: (id: string) => store.mutate((current) => current.filter((notification) => notification.id !== id), () => dismissWorkspaceNotification(id)),
    markAllRead: () => store.mutate((current) => current.map((notification) => ({ ...notification, status: "read" })), markAllWorkspaceNotificationsRead, true),
    clearNotifications: () => store.mutate(() => [], dismissAllWorkspaceNotifications, true),
  }
}
