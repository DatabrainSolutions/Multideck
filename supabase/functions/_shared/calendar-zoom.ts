// Zoom uses JSON integers for meeting IDs and webhook timestamps, while our
// canonical provider references are text. Never coerce objects or unsafe numbers.
export function zoomNumericReference(value: unknown): string {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : ""
  if (typeof value === "string" && /^\d{1,20}$/.test(value.trim())) return value.trim()
  return ""
}

export function sameZoomInstant(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false
  const instant = Date.parse(left)
  return Number.isFinite(instant) && instant === Date.parse(right)
}

export function zoomStartTime(value: string): string {
  // Zoom treats a time without a trailing Z as local to the supplied timezone.
  // Postgres +00:00 timestamps must therefore be normalised, not sent verbatim.
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z")
}
