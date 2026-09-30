export const idleAfterMs = 5 * 60_000
export const usageHeartbeatMs = 30_000
export type UsageModule = "operations" | "quotes" | "crm" | "finance" | "warehouse" | "customs" | "documents" | "dexter" | "admin" | "other"
export type CommercialFlow = "lead_create" | "lead_convert" | "quote_create" | "quote_send" | "booking_create"

export function usageModuleForRoute(route: string): UsageModule {
  if (route.startsWith("/bookings") || route.startsWith("/road-control") || route === "/") return "operations"
  for (const module of ["quotes", "crm", "finance", "warehouse", "customs", "documents", "admin"] as const) {
    if (route.startsWith(`/${module}`)) return module
  }
  return route.startsWith("/agent-dexter") ? "dexter" : "other"
}

/** Split at the idle boundary, rather than assigning a whole heartbeat to its last state. */
export function measuredUsage(start: number, end: number, lastInteraction: number, foreground: boolean) {
  if (!foreground || end <= start || end - start > 60_000) return []
  const idleAt = lastInteraction + idleAfterMs
  const result: Array<{ from: number; to: number; state: "active" | "idle" }> = []
  if (start < idleAt) result.push({ from: start, to: Math.min(end, idleAt), state: "active" })
  if (end > idleAt) result.push({ from: Math.max(start, idleAt), to: end, state: "idle" })
  return result
}
