import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { registerReadCache } from "@/lib/register-read-cache"

/** A result belongs to its query and access generation, never just its page component. */
export function useRegisterPage<T>({ scope, resource, load, revision = 0 }: {
  scope: string | null | undefined
  resource: string
  load: (signal: AbortSignal) => Promise<T>
  revision?: number
}) {
  const generation = useSyncExternalStore(registerReadCache.subscribe, registerReadCache.getGeneration, registerReadCache.getGeneration)
  const key = `${generation}:${scope ?? ""}:${resource}`
  const [retry, setRetry] = useState(0)
  const requestKey = `${key}:${revision}:${retry}`
  const [state, setState] = useState<{ key: string; requestKey: string; data?: T; pending: boolean; error: string | null }>(() => ({ key, requestKey, data: scope ? registerReadCache.peek<T>(scope, resource) : undefined, pending: true, error: null }))
  const loadRef = useRef(load)
  loadRef.current = load
  const snapshot = scope ? registerReadCache.peek<T>(scope, resource) : undefined
  const data = state.key === key ? state.data ?? snapshot : snapshot
  const loading = state.requestKey !== requestKey || state.pending

  useEffect(() => {
    const controller = new AbortController()
    const requestGeneration = generation
    const current = () => !controller.signal.aborted && requestGeneration === registerReadCache.getGeneration()
    const cached = scope ? registerReadCache.peek<T>(scope, resource) : undefined
    setState(previous => ({ key, requestKey, data: cached ?? (previous.key === key ? previous.data : undefined), pending: true, error: null }))
    if (!scope) {
      setState({ key, requestKey, pending: false, error: "Sign in again to load this register." })
      return () => controller.abort()
    }
    void loadRef.current(controller.signal).then(value => {
      if (current()) setState({ key, requestKey, data: value, pending: false, error: null })
    }).catch(error => {
      if (!current()) return
      // Cancellation of this consumer is silent; transport timeouts and invalidated
      // active reads must leave an actionable state rather than an endless loader.
      setState(previous => ({ ...previous, pending: false, error: error instanceof Error && error.name !== "AbortError" ? error.message : "The data changed while loading. Please try again." }))
    })
    return () => controller.abort()
  }, [key, requestKey, scope, resource, generation])

  const refresh = useCallback(() => {
    registerReadCache.invalidate(resource)
    setRetry(value => value + 1)
  }, [resource])
  return { data, loading, initialLoading: loading && data === undefined, refreshing: loading && data !== undefined, error: state.requestKey === requestKey ? state.error : null, refresh }
}
