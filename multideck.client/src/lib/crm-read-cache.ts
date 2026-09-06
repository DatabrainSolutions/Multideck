type CacheEntry<T> = {
  value?: T
  updatedAt: number
  inFlight?: Promise<T>
}

export type CrmReadOptions = {
  forceRefresh?: boolean
}

const DEFAULT_FRESHNESS_MS = 60_000
const MAX_COMPLETED_ENTRIES = 128
const entries = new Map<string, CacheEntry<unknown>>()
let projectScope = ""
let authenticatedUserId: string | null | undefined
let accessGeneration = 0

function entryKey(scope: string, resource: string) {
  return `${projectScope}\u0000${scope}\u0000${resource}`
}

function staleReadError() {
  return Object.assign(new Error("This read was invalidated. Load the current workspace data again."), { name: "AbortError" })
}

/** Called synchronously by Auth; a previous account's pending reads must never be delivered. */
export function setCrmReadCacheScope(project: string, userId: string | null, accessChanged = false) {
  if (!accessChanged && projectScope === project && authenticatedUserId === userId) return false
  projectScope = project
  authenticatedUserId = userId
  accessGeneration += 1
  clearCrmReadCache()
  return true
}

/** Guard queued work against sign-out, account switches and access changes. */
export function captureAuthenticatedScope(userId: string) {
  const generation = accessGeneration
  return () => {
    if (generation !== accessGeneration || (authenticatedUserId !== undefined && userId !== authenticatedUserId)) throw staleReadError()
  }
}

function pruneCompletedEntries() {
  const completed = [...entries].filter(([, entry]) => !entry.inFlight)
  for (const [key] of completed.slice(0, Math.max(0, completed.length - MAX_COMPLETED_ENTRIES))) entries.delete(key)
}

/**
 * Keeps short-lived CRM list reads responsive while preventing two mounted
 * surfaces from sending the same Supabase request at the same time.
 */
export function readCachedCrmResource<T>(
  scope: string,
  resource: string,
  load: () => Promise<T>,
  options: CrmReadOptions = {},
  freshnessMs = DEFAULT_FRESHNESS_MS,
) {
  if (authenticatedUserId !== undefined && scope !== authenticatedUserId) return Promise.reject(staleReadError())
  const key = entryKey(scope, resource)
  const current = entries.get(key) as CacheEntry<T> | undefined
  const now = Date.now()

  if (!options.forceRefresh && current?.value !== undefined && now - current.updatedAt < freshnessMs) {
    entries.delete(key)
    entries.set(key, current)
    return Promise.resolve(current.value)
  }

  if (current?.inFlight) return current.inFlight

  const inFlight = load()
    .then((value) => {
      // Reject delivery as well as caching: otherwise a slow response can
      // overwrite newer data or paint the previous account after sign-out.
      if ((entries.get(key) as CacheEntry<T> | undefined)?.inFlight !== inFlight) throw staleReadError()
      entries.delete(key)
      entries.set(key, { value, updatedAt: Date.now() })
      pruneCompletedEntries()
      return value
    })
    .catch((error) => {
      if ((entries.get(key) as CacheEntry<T> | undefined)?.inFlight === inFlight) {
        if (current?.value !== undefined) {
          entries.set(key, { value: current.value, updatedAt: current.updatedAt })
        } else {
          entries.delete(key)
        }
      }
      throw error
    })

  entries.set(key, {
    value: current?.value,
    updatedAt: current?.updatedAt ?? 0,
    inFlight,
  })

  return inFlight
}

/** Invalidate shared reads without announcing an unrelated CRM mutation. */
export function invalidateCachedCrmResources(scope: string | null, resources: readonly string[]) {
  for (const key of entries.keys()) {
    const [project, user, resource] = key.split("\u0000")
    if (project === projectScope && (scope === null || user === scope) && resources.some((prefix) => resource.startsWith(prefix))) entries.delete(key)
  }
}

export function invalidateCrmResources(scope: string, resources: readonly string[]) {
  invalidateCachedCrmResources(scope, [...resources, "quote-sources"])

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("multideck:crm-changed", { detail: { scope, resources } }))
  }
}

export function clearCrmReadCache() {
  entries.clear()
}
