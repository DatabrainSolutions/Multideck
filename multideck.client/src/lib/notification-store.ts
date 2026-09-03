import type { WorkspaceNotification } from "./notification-api"

type Notifications = readonly WorkspaceNotification[]

/** One live feed for every mounted notification control. */
export function createNotificationStore(dependencies: {
  load: () => Promise<Notifications>
  connect: (changed: () => void) => () => void
  onError: (error: unknown) => void
}) {
  let notifications: Notifications = []
  let generation = 0
  let mutations = 0
  let needsRefresh = false
  let inFlight: Promise<void> | null = null
  let disconnect: (() => void) | null = null
  const listeners = new Set<() => void>()
  const publish = (next: Notifications) => { notifications = next; listeners.forEach((listener) => listener()) }

  function refresh() {
    if (!listeners.size) return Promise.resolve()
    if (inFlight || mutations) { needsRefresh = true; return inFlight ?? Promise.resolve() }
    const requestGeneration = generation
    needsRefresh = false
    const request = dependencies.load()
      .then((next) => { if (requestGeneration === generation && !needsRefresh && !mutations) publish(next) })
      .catch((error) => { if (requestGeneration === generation) dependencies.onError(error) })
      .finally(() => {
        if (inFlight !== request) return
        inFlight = null
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
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => { listeners.delete(listener); if (!listeners.size) stop() }
    },
    reset(preserveVisible = false) {
      stop()
      if (!preserveVisible) publish([])
      // Auth listeners cannot await another Auth call until the lock releases.
      if (listeners.size) queueMicrotask(() => { if (listeners.size && !disconnect) start() })
    },
    async mutate(update: (current: Notifications) => Notifications, request: () => Promise<void>) {
      const requestGeneration = generation
      mutations += 1
      needsRefresh = true
      publish(update(notifications))
      try { await request() }
      catch (error) { if (requestGeneration === generation) dependencies.onError(error) }
      finally {
        if (requestGeneration === generation) {
          mutations -= 1
          if (!mutations) void refresh()
        }
      }
    },
    refresh,
  }
}
