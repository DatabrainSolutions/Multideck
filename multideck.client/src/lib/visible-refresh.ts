/** One coalesced wake-up refresh; no polling timer runs while the tab is hidden. */
export function connectVisibleRefresh(refresh: () => void, page: Document = document, host: Window = window, intervalMs = 60_000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let queued: ReturnType<typeof setTimeout> | undefined
  const clear = () => { clearTimeout(timer); clearTimeout(queued); timer = undefined; queued = undefined }
  const schedule = () => {
    if (page.visibilityState !== "visible") { clear(); return }
    clearTimeout(timer)
    if (queued !== undefined) return
    queued = setTimeout(() => {
      queued = undefined
      if (page.visibilityState !== "visible") return
      refresh()
      timer = setTimeout(schedule, intervalMs)
    }, 75)
  }
  const visibility = () => { if (page.visibilityState === "visible") schedule(); else clear() }
  host.addEventListener("focus", schedule)
  host.addEventListener("online", schedule)
  page.addEventListener("visibilitychange", visibility)
  if (page.visibilityState === "visible") timer = setTimeout(schedule, intervalMs)
  return () => {
    clear()
    host.removeEventListener("focus", schedule)
    host.removeEventListener("online", schedule)
    page.removeEventListener("visibilitychange", visibility)
  }
}
