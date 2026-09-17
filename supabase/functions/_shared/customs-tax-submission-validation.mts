/** HMRC CDS Group 4, manual calculations/PVA, reviewed 14 September 2026.
 * This validates input only; it never inserts OVR01 or alters a tax amount.
 * https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes
 */
export function obsoleteImportVatStatementIssue(code: unknown): string | null {
  return typeof code === "string" && code.trim().toUpperCase() === "PVA01"
    ? "PVA01 is no longer used for postponed VAT. Remove this obsolete code and review the VAT treatment. An authorised manual calculation must declare the actual B00 VAT amount, not the former zero-GBP workaround."
    : null
}
