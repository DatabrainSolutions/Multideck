/** DE 8/1 input checks, not a decision that quota relief is available.
 * https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-8-other-data-elements-statistical-data-guarantees-and-tariff-related-data
 */
export function isQuotaPreference(value: unknown): boolean {
  return typeof value === "string" && ["120", "123", "125", "128", "220", "223", "225", "320", "323", "325"].includes(value.trim())
}

export function quotaClaimIssues(orderValue: unknown, preferenceValue: unknown, context: { jurisdiction?: unknown; movement?: unknown } = {}): string[] {
  const order = typeof orderValue === "string" ? orderValue.trim() : ""
  const preference = typeof preferenceValue === "string" ? preferenceValue.trim() : ""
  const quotaPreference = isQuotaPreference(preference)
  const issues: string[] = []
  if (context.jurisdiction === "NI" && context.movement === "GB-to-NI") {
    if (order) issues.push("Leave quota order number blank for GB-to-NI movements. Record the EU quota reference with NIQUO additional information instead.")
    return issues
  }
  if (order && !/^[A-Za-z0-9]{6}$/.test(order)) issues.push("Use the six-character quota order number from the applicable tariff.")
  if (quotaPreference && !order) issues.push("Add the quota order number for the requested quota preference.")
  if (order && !quotaPreference) issues.push("Match the quota order number to a quota preference, or clear it when quota is not claimed.")
  return issues
}
