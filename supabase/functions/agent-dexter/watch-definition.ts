export type WatchRecord = { recordId?: unknown; [key: string]: unknown }

export function validateWatchRule(
  fields: string[], field: string, operator: string, value: string,
): string | null {
  if (!fields.includes(field)) return "That field is not available as a live watch signal yet."
  if (!["changed", "eq", "neq", "contains", "contains_all", "gt", "gte", "lt", "lte"].includes(operator)) {
    return "That watch condition is not supported."
  }
  if (operator !== "changed" && !value.trim()) {
    return "What value should Dexter watch for?"
  }
  if (["gt", "gte", "lt", "lte"].includes(operator) &&
      !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) {
    return "Use a number for this threshold."
  }
  return null
}

/** Prefer exact record evidence over fuzzy search results; never guess among ties. */
export function chooseWatchRecord<T extends WatchRecord>(
  records: T[], search: string, requestedId: string, explicitIds: Set<string>,
  label: (record: T) => string,
): { record: T | null; candidates: T[] } {
  const verifiedId = requestedId && explicitIds.has(requestedId.toLowerCase())
    ? requestedId.toLowerCase() : ""
  if (requestedId && !verifiedId) return { record: null, candidates: [] }
  const pool = verifiedId
    ? records.filter(record => String(record.recordId ?? "").toLowerCase() === verifiedId)
    : records
  const identifierKeys = ["recordId", "name", "title", "reference", "quoteNumber", "bookingReference",
    "jobReference", "customerReference", "accountCode", "companyName", "contactName",
    "phoneNumber", "orderNumber", "sku", "code", "targetLabel"]
  const exact = search.trim()
    ? pool.filter(record => [label(record), ...identifierKeys.map(key => record[key])]
      .some(value => typeof value === "string" && value.trim().toLocaleLowerCase() === search.trim().toLocaleLowerCase()))
    : []
  const candidates = verifiedId ? pool : exact.length ? exact : pool
  return { record: (verifiedId || exact.length > 0) && candidates.length === 1 ? candidates[0] : null, candidates }
}
