/** Refresh only public identity, never a visitor's form, hold or selected time.
 * No Auth/realtime subscription is exposed to anonymous visitors. These cheap
 * reads run on return/reconnect and once a minute while the page is visible.
 */
export function startPublicBrandRefresh<T>(read: () => Promise<T>, apply: (value: T) => void) {
  let disposed = false
  let pending = false
  const refresh = async () => {
    if (disposed || pending || document.visibilityState === "hidden" || navigator.onLine === false) return
    pending = true
    try {
      const value = await read()
      if (!disposed) apply(value)
    } catch {
      // A failed read is not a brand removal. Retain the last confirmed identity
      // and retry on the next lifecycle signal or visible-page interval.
    } finally { pending = false }
  }
  const interval = window.setInterval(refresh, 60_000)
  window.addEventListener("focus", refresh)
  window.addEventListener("online", refresh)
  window.addEventListener("pageshow", refresh)
  document.addEventListener("visibilitychange", refresh)
  return () => {
    disposed = true
    window.clearInterval(interval)
    window.removeEventListener("focus", refresh)
    window.removeEventListener("online", refresh)
    window.removeEventListener("pageshow", refresh)
    document.removeEventListener("visibilitychange", refresh)
  }
}
