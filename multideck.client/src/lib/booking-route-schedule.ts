export const bookingRouteScheduleFields = [
  { field: "plannedPickupAt", label: "Planned pickup" },
  { field: "plannedDepartureAt", label: "Planned departure" },
  { field: "plannedArrivalAt", label: "Planned arrival" },
  { field: "plannedDeliveryAt", label: "Planned delivery" },
] as const

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

/** Explicit UTC display; never interpret a timestamp in the operator's zone. */
export function routeScheduleParts(value?: string | null) {
  if (!value) return { date: "", time: "", timestamp: "", invalid: false }
  if (validDate(value)) return { date: value, time: "", timestamp: value, invalid: false }
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !validDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) {
    return { date: "", time: "", timestamp: value, invalid: true }
  }
  const utc = new Date(value).toISOString()
  // Date only carries milliseconds; retain the saved database's finer precision.
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1]
  const timestamp = utc.slice(0, 19) + (fraction ? `.${fraction}` : "") + "Z"
  return { date: timestamp.slice(0, 10), time: timestamp.slice(11, 19), timestamp, invalid: false }
}

export function changeRouteScheduleDate(current: string | null | undefined, date: string) {
  if (!date) return ""
  if (!validDate(date)) throw new Error("Choose a valid planned date.")
  const parts = routeScheduleParts(current)
  if (parts.invalid) throw new Error("Review the saved timestamp before changing its date.")
  return parts.time ? date + parts.timestamp.slice(10) : date
}

export function changeRouteScheduleTime(current: string | null | undefined, time: string) {
  const parts = routeScheduleParts(current)
  if (parts.invalid || !parts.date) throw new Error("Choose a planned date before setting its time.")
  if (!time) return parts.date
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) throw new Error("Choose a valid UTC time.")
  // Re-entering the displayed time is a no-op, including sub-second evidence.
  const clock = time.length === 5 ? `${time}:00` : time
  if (parts.time === clock) return current!
  return `${parts.date}T${clock}Z`
}
