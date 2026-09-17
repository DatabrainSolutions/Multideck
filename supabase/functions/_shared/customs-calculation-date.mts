/** Calendar date in the customs operator's UK timezone, not UTC or device locale. */
export function ukCustomsDate(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid calculation clock.")
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find(value => value.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
