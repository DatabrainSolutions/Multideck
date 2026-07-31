export type RecentWorkContext =
  | { type: "booking"; recordId: string }
  | { type: "deal" }

const storageKey = "multideck.dexter.recent-work"

export function workContextForRoute(path: string): RecentWorkContext | null {
  const bookingMatch = path.match(/^\/bookings\/([^/]+)$/)
  if (bookingMatch && bookingMatch[1] !== "new" && bookingMatch[1] !== "provisional") {
    return { type: "booking", recordId: bookingMatch[1].toUpperCase() }
  }

  if (path === "/crm/deals" || /^\/crm\/leads\/[^/]+\/convert$/.test(path)) {
    return { type: "deal" }
  }

  return null
}

export function rememberRecentWorkContext(path: string) {
  if (typeof window === "undefined") return
  const context = workContextForRoute(path)
  if (context) window.sessionStorage.setItem(storageKey, JSON.stringify(context))
}

export function readRecentWorkContext(): RecentWorkContext | null {
  if (typeof window === "undefined") return null

  try {
    const context = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as RecentWorkContext | null
    if (context?.type === "deal") return context
    if (context?.type === "booking" && context.recordId) return context
  } catch {
    // A malformed browser value should only disable personalisation.
  }

  return null
}
