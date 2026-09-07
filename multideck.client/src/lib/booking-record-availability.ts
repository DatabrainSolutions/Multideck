/** Presence is not completeness, clearance, payment or readiness to depart. */
export function bookingRecordAvailability(records: readonly unknown[] | null | undefined) {
  if (!Array.isArray(records)) return { label: "Not loaded", tone: "neutral" } as const
  if (records.length === 0) return { label: "No records", tone: "neutral" } as const
  return { label: "Records available", tone: "teal" } as const
}
