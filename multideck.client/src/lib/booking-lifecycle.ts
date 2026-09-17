/** Persisted legacy codes remain stable for quote links and integrations. */
export type BookingLifecycle = "draft" | "open" | "complete"
export function bookingLifecycle(status: string): BookingLifecycle | null {
  const code = status.trim().toLowerCase()
  if (["draft", "provisional"].includes(code)) return "draft"
  if (["complete", "completed", "closed"].includes(code)) return "complete"
  if (["open", "booked", "in_transit", "arrived", "delivered", "ready_for_invoice", "in_progress"].includes(code)) return "open"
  return null
}
export function bookingLifecycleLabel(status: string): string {
  const lifecycle = bookingLifecycle(status)
  return lifecycle === "draft" ? "Provisional" : lifecycle === "open" ? "In progress" : lifecycle === "complete" ? "Complete" : status
}
