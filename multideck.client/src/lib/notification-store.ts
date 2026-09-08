import type { WorkspaceNotification } from "./notification-api"

type Notifications = readonly WorkspaceNotification[]
export type NotificationFeed = { notifications: Notifications; unreadCount: number; total: number }
type FeedState = { loading: boolean; loaded: boolean; error: string | null; pending: boolean; unreadCount: number; total: number }

/** One live feed for every mounted notification control. */
export function createNotificationStore(dependencies: {
  load: () => Promise<Notifications | NotificationFeed>
  connect: (changed: () => void) => () => void
  onError: (error: unknown, operation: "load" | "save") => void
}) {
  let notifications: Notifications = []
  const emptyState: FeedState = { loading: false, loaded: false, error: null, pending: false, unreadCount: 0, total: 0 }
  let state = emptyState
  let generation = 0
  let mutations = 0
  let needsRefresh = false
  let inFlight: Promise<void> | null = null
  let disconnect: (() => void) | null = null
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  const publish = (next: Notifications) => { notifications = next; emit() }
  const updateState = (next: Partial<FeedState>) => { state = { ...state, ...next }; emit() }
  const unread = (rows: Notifications) => rows.filter((row) => row.status === "unread").length

  function refresh() {
    if (!listeners.size) return Promise.resolve()
    if (inFlight || mutations) { needsRefresh = true; return inFlight ?? Promise.resolve() }
    const requestGeneration = generation
    needsRefresh = false
    updateState({ loading: true })
    const request = dependencies.load()
      .then((result) => {
        if (requestGeneration !== generation || needsRefresh || mutations) return
        const feed = Array.isArray(result) ? { notifications: result, unreadCount: unread(result), total: result.length } : result as NotificationFeed
        state = { ...state, loaded: true, error: null, unreadCount: feed.unreadCount, total: feed.total }
        publish(feed.notifications)
      })
      .catch((error) => {
        if (requestGeneration !== generation) return
        updateState({ error: "Notifications could not be refreshed. Please try again." })
        dependencies.onError(error, "load")
      })
      .finally(() => {
        if (inFlight !== request) return
        inFlight = null
        updateState({ loading: false })
        if (needsRefresh && !mutations) void refresh()
      })
    inFlight = request
    return request
  }

  function start() {
    const connectionGeneration = generation
    disconnect = dependencies.connect(() => { if (connectionGeneration === generation) void refresh() })
    void refresh()
  }

  function stop() {
    generation += 1
    disconnect?.()
    disconnect = null
    inFlight = null
    mutations = 0
    needsRefresh = false
  }

  return {
    getSnapshot: () => notifications,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => { listeners.delete(listener); if (!listeners.size) stop() }
    },
    reset(preserveVisible = false) {
      stop()
      state = preserveVisible ? { ...state, loading: false, pending: false } : emptyState
      publish(preserveVisible ? notifications : [])
      queueMicrotask(() => { if (listeners.size && !disconnect) start() })
    },
    async mutate(update: (current: Notifications) => Notifications, request: () => Promise<void>, all = false) {
      // Serialize actions so a slow "read" cannot overwrite a newer "unread".
      if (mutations) return false
      const requestGeneration = generation
      const previous = notifications
      const previousState = state
      mutations = 1
      needsRefresh = true
      const next = update(notifications)
      state = { ...state, pending: true, error: null,
        unreadCount: all ? 0 : Math.max(0, state.unreadCount + unread(next) - unread(previous)),
        total: all && !next.length ? 0 : Math.max(0, state.total + next.length - previous.length) }
      publish(next)
      try { await request(); return requestGeneration === generation }
      catch (error) {
        if (requestGeneration === generation) {
          state = { ...previousState, pending: true, error: "Your notification change could not be saved. Please try again." }
          publish(previous)
          dependencies.onError(error, "save")
        }
        return false
      }
      finally {
        if (requestGeneration === generation) {
          mutations = 0
          updateState({ pending: false })
          void refresh()
        }
      }
    },
    refresh,
  }
}
