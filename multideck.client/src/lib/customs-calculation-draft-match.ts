import { resolveCustomsInvoiceDeclaration } from "../../../supabase/functions/_shared/customs-invoices.mts"

const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry)

/** Compare against the same invoice projection used by Save draft. The saved
 * evidence stays untouched; genuine header, item and cost edits still differ. */
export function calculationDraftMatches(snapshot: unknown, draft: { invoiceHeaders?: unknown; items?: unknown }): boolean {
  return canonical(snapshot) === canonical(resolveCustomsInvoiceDeclaration(draft))
}
