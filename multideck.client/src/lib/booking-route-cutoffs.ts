import { routeScheduleParts } from "./booking-route-schedule"

export const bookingRouteCutoffFields = [
  { field: "cargoCutoffAt", label: "Cargo cut-off" },
  { field: "documentationCutoffAt", label: "Documentation cut-off" },
  { field: "vgmCutoffAt", label: "VGM cut-off" },
] as const

/** Native datetime-local controls display UTC deliberately, not browser time. */
export function routeCutoffInputValue(value?: string | null) {
  const parts = routeScheduleParts(value)
  return !parts.invalid && parts.date && parts.time ? `${parts.date}T${parts.time}` : ""
}

export function changeRouteCutoff(current: string | null | undefined, value: string) {
  if (!value) return ""
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new Error("Enter a complete cut-off date and time in UTC.")
  }
  const full = value.length === 16 ? `${value}:00` : value
  if (routeScheduleParts(`${full}Z`).invalid) throw new Error("Choose a valid cut-off date and time.")
  // Unedited controls must not discard the database's sub-second precision.
  if (full === routeCutoffInputValue(current)) return current!
  return `${full}Z`
}
