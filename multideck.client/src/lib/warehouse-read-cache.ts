type WarehouseCacheEntry<T> = {
  scope: string
  resource: string
  value?: T
  updatedAt: number
  lastAccessedAt: number
  inFlight?: Promise<T>
  token?: symbol
}

export type WarehouseReadOptions = {
  forceRefresh?: boolean
}

const DEFAULT_FRESHNESS_MS = 20_000
const MAX_ENTRIES_PER_SCOPE = 96
const entries = new Map<string, WarehouseCacheEntry<unknown>>()
const scopeGenerations = new Map<string, number>()

function entryKey(scope: string, resource: string) {
  return `${scope}\u0000${resource}`
}

function scopeGeneration(scope: string) {
  return scopeGenerations.get(scope) ?? 0
}

function pruneScope(scope: string) {
  const scoped = [...entries.entries()]
    .filter(([, entry]) => entry.scope === scope && !entry.inFlight)
    .sort((first, second) => first[1].lastAccessedAt - second[1].lastAccessedAt)

  const overflow = Math.max(0, scoped.length - MAX_ENTRIES_PER_SCOPE)
  for (const [key] of scoped.slice(0, overflow)) entries.delete(key)
}

/**
 * Shares short-lived tenant warehouse reads without weakening the session,
 * tenant, or mutation boundaries enforced by the Warehouse Edge Function.
 */
export function readCachedWarehouseResource<T>(
  scope: string,
  resource: string,
  load: () => Promise<T>,
  options: WarehouseReadOptions = {},
  freshnessMs = DEFAULT_FRESHNESS_MS,
) {
  const key = entryKey(scope, resource)
  const current = entries.get(key) as WarehouseCacheEntry<T> | undefined
  const now = Date.now()

  if (!options.forceRefresh && current?.value !== undefined && now - current.updatedAt < freshnessMs) {
    current.lastAccessedAt = now
    return Promise.resolve(current.value)
  }

  if (current?.inFlight) return current.inFlight

  const generation = scopeGeneration(scope)
  const token = Symbol(resource)
  const inFlight = load()
    .then((value) => {
      const latest = entries.get(key) as WarehouseCacheEntry<T> | undefined
      if (scopeGeneration(scope) === generation && latest?.token === token) {
        entries.set(key, { scope, resource, value, updatedAt: Date.now(), lastAccessedAt: Date.now() })
        pruneScope(scope)
      }
      return value
    })
    .catch((error) => {
      const latest = entries.get(key) as WarehouseCacheEntry<T> | undefined
      if (scopeGeneration(scope) === generation && latest?.token === token) {
        if (current?.value !== undefined) {
          entries.set(key, { ...current, inFlight: undefined, token: undefined, lastAccessedAt: Date.now() })
        } else {
          entries.delete(key)
        }
      }
      throw error
    })

  entries.set(key, {
    scope,
    resource,
    value: current?.value,
    updatedAt: current?.updatedAt ?? 0,
    lastAccessedAt: now,
    inFlight,
    token,
  })

  return inFlight
}

/** Clears every cached warehouse view after a confirmed write. */
export function invalidateWarehouseResources(scope: string) {
  scopeGenerations.set(scope, scopeGeneration(scope) + 1)
  for (const [key, entry] of entries) {
    if (entry.scope === scope) entries.delete(key)
  }
}

export function clearWarehouseReadCache() {
  entries.clear()
  scopeGenerations.clear()
}
