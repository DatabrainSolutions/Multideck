type Entry<T> = { value?: T; expiresAt: number; inFlight?: Promise<T>; controller?: AbortController; consumers: Set<symbol>; lastAccessedAt: number }

export function createRegisterReadCache({ ttlMs = 15_000, timeoutMs = 15_000, maxEntries = 64 } = {}) {
  const entries = new Map<string, Entry<unknown>>()
  const listeners = new Set<() => void>()
  let project = "", user: string | null = null, generation = 0
  const abortError = () => new DOMException("The register request was cancelled.", "AbortError")
  const keyFor = (scope: string, resource: string) => `${project}:${generation}:${scope}\u0000${resource}`
  const prune = () => {
    const completed = [...entries].filter(([, entry]) => !entry.inFlight).sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    for (const [key] of completed.slice(0, Math.max(0, completed.length - maxEntries))) entries.delete(key)
  }
  function invalidate(resourcePrefix: string) {
    for (const [key, entry] of entries) {
      if (!key.split("\u0000", 2)[1]?.startsWith(resourcePrefix)) continue
      entry.controller?.abort()
      entries.delete(key)
    }
  }
  function peek<T>(scope: string, resource: string): T | undefined {
    if (!user || scope !== user) return undefined
    const entry = entries.get(keyFor(scope, resource)) as Entry<T> | undefined
    if (entry?.value === undefined || entry.expiresAt <= Date.now()) return undefined
    entry.lastAccessedAt = Date.now()
    return entry.value
  }
  function read<T>(scope: string, resource: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError())
    const key = keyFor(scope, resource)
    let entry = entries.get(key) as Entry<T> | undefined
    if (entry?.value !== undefined && entry.expiresAt > Date.now()) {
      entry.lastAccessedAt = Date.now()
      return Promise.resolve(entry.value)
    }
    if (!entry?.inFlight || entry.controller?.signal.aborted) {
      const controller = new AbortController()
      const next: Entry<T> = { expiresAt: 0, controller, consumers: new Set(), lastAccessedAt: Date.now() }
      let timedOut = false
      let timer: ReturnType<typeof setTimeout>
      const cancelled = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(timedOut
          ? new DOMException("Loading took too long. Please try again.", "TimeoutError") : abortError()), { once: true })
        timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      })
      // Race even transports which ignore AbortSignal so no consumer waits forever.
      next.inFlight = Promise.race([Promise.resolve().then(() => load(controller.signal)), cancelled])
        .then(value => {
          if (controller.signal.aborted || entries.get(key) !== next) throw abortError()
          entries.set(key, { value, expiresAt: Date.now() + ttlMs, consumers: new Set(), lastAccessedAt: Date.now() })
          prune()
          return value
        }).catch(error => {
          if (entries.get(key) === next) entries.delete(key)
          throw error
        }).finally(() => clearTimeout(timer))
      entries.set(key, next)
      entry = next
    }
    const active = entry
    const consumer = Symbol(resource)
    active.consumers.add(consumer)
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const release = () => { active.consumers.delete(consumer); signal?.removeEventListener("abort", abort) }
      const abort = () => {
        if (settled) return
        settled = true
        release()
        queueMicrotask(() => { if (active.consumers.size === 0) active.controller?.abort() })
        reject(abortError())
      }
      signal?.addEventListener("abort", abort, { once: true })
      active.inFlight!.then(value => {
        if (settled) return
        settled = true; release(); resolve(value)
      }, error => {
        if (settled) return
        settled = true; release(); reject(error)
      })
    })
  }
  return {
    read, peek, invalidate,
    setScope(nextProject: string, nextUser: string | null, accessChanged = false) {
      if (!accessChanged && project === nextProject && user === nextUser) return
      project = nextProject; user = nextUser; generation += 1
      invalidate("")
      listeners.forEach(listener => listener())
    },
    getGeneration: () => generation,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export const registerReadCache = createRegisterReadCache()
