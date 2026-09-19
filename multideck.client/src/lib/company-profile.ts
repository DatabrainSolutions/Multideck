/** Optional CRM facts, separate from operational addresses and the finance ledger. */
export type CompanyProfileKey = "registeredName" | "registrationNumber" | "website" | "linkedInUrl" | "employeeCount" | "source"

export function companyProfile(metadata: Record<string, unknown>): Partial<Record<CompanyProfileKey, string>> {
  const stored = metadata.companyProfile
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {}
  return Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === "string"))
}

export function updateCompanyProfile(metadata: Record<string, unknown>, key: CompanyProfileKey, input: string): Record<string, unknown> {
  let value = input.trim()
  if (value && (key === "website" || key === "linkedInUrl")) {
    if (!/^[a-z][a-z\d+.-]*:/i.test(value)) value = `https://${value}`
    let url: URL
    try { url = new URL(value) } catch { throw new Error("Enter a valid website address, for example https://example.com.") }
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) {
      throw new Error("Use an http or https website address without sign-in details.")
    }
    value = url.toString()
  }
  if (value && key === "employeeCount" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) {
    throw new Error("Enter a whole number of employees, or leave this blank.")
  }
  const stored = metadata.companyProfile
  const previous = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}
  return { ...metadata, companyProfile: { ...previous, [key]: value || null } }
}

/** Merge just the changed keys at save time, preserving neighbouring queued edits. */
export function updateQuoteDefaults(metadata: Record<string, unknown>, change: Record<string, unknown>): Record<string, unknown> {
  const stored = metadata.quoteTerms
  const previous = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}
  return { ...metadata, quoteTerms: { ...previous, ...change } }
}

/** Preserve untouched legacy values, including numbers and structured imports. */
export function updateCompanyCustomFields(metadata: Record<string, unknown>, fields: Array<{ label: string; value: string }>): Record<string, unknown> {
  const stored = metadata.customFields
  const previous: Record<string, unknown> = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {}
  return { ...metadata, customFields: Object.fromEntries(fields.filter(field => field.label.trim()).map(field => {
    const label = field.label.trim()
    const unchanged = Object.hasOwn(previous, label) && String(previous[label]) === field.value
    return [label, unchanged ? previous[label] : field.value.trim()]
  })) }
}
