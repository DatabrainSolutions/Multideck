type CacheEntry<T> = {
  value?: T
  updatedAt: number
  inFlight?: Promise<T>
}

export type CrmReadOptions = {
  forceRefresh?: boolean
}

const DEFAULT_FRESHNESS_MS = 60_000
const entries = new Map<string, CacheEntry<unknown>>()

function entryKey(scope: string, resource: string) {
  return `${scope}:${resource}`
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
  const key = entryKey(scope, resource)
  const current = entries.get(key) as CacheEntry<T> | undefined
  const now = Date.now()

  if (!options.forceRefresh && current?.value !== undefined && now - current.updatedAt < freshnessMs) {
    return Promise.resolve(current.value)
  }

  if (current?.inFlight) return current.inFlight

  const inFlight = load()
    .then((value) => {
      // An invalidation or newer read may have replaced this request while it
      // was in flight. The caller can still use the response it requested, but
      // it must not be allowed to repopulate the shared cache with stale data.
      if ((entries.get(key) as CacheEntry<T> | undefined)?.inFlight === inFlight) {
        entries.set(key, { value, updatedAt: Date.now() })
      }
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

export function invalidateCrmResources(scope: string, resources: readonly string[]) {
  for (const key of entries.keys()) {
    if (key.startsWith(`${scope}:`) && resources.some((resource) => key.startsWith(`${scope}:${resource}`))) {
      entries.delete(key)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("multideck:crm-changed", { detail: { scope, resources } }))
  }
}

export function clearCrmReadCache() {
  entries.clear()
}
