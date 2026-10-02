type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {}

/** Remove database decimal padding without rounding, coercing invalid values, or losing precision. */
export function unpadCustomsDecimal(value: unknown): unknown {
  if (typeof value !== "string" || !/^\d+\.\d+$/.test(value)) return value
  return value.replace(/0+$/, "").replace(/\.$/, "")
}

function numbers(value: RecordValue, fields: string[]): RecordValue {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fields.includes(key) ? unpadCustomsDecimal(entry) : entry]))
}

/** Adapt only proven Booking-prefill values. Never substitute current organisation data. */
export function restoreBookingCustomsPrefill(saved: RecordValue, sourceSnapshot: unknown): RecordValue {
  const source = record(sourceSnapshot)
  if (source.source !== "booking_customs_handoff") return saved
  const original = record(source.payload)
  const result = numbers(saved, ["totalAmount", "totalPackages", "totalGrossMass", "totalNetMass", "freightChargeAmount"])
  for (const party of ["exporter", "importer", "consignee"]) {
    const name = `${party}Name`
    const identifier = `${party}Eori`
    // New-format drafts and deliberately edited/cleared identifiers stay authoritative.
    if (!(identifier in saved) && original.bookingHandoffUiVersion !== 2
      && (saved[party] ?? "") === (original[party] ?? "")
      && saved[name] === original[name] && typeof original[name] === "string") {
      result[party] = original[name]
      result[identifier] = original[party] ?? ""
    }
  }
  if (Array.isArray(saved.items)) result.items = saved.items.map(item => numbers(record(item), ["packageCount", "grossMass", "netMass", "itemPrice"]))
  if (Array.isArray(saved.invoiceHeaders)) result.invoiceHeaders = saved.invoiceHeaders.map(header => numbers(record(header), ["totalAmount", "packageCount", "grossMass", "netMass"]))
  return result
}
