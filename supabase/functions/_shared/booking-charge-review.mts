/** Pure decision planner. Inputs must be loaded by an authorised server adapter.
 * This module never writes charges, changes a Quote or grants permission.
 */
export type ChargeValues = Readonly<Record<string, unknown>>
export interface BookingReviewCharge {
  id: string
  origin: "quote" | "booking" | "unknown"
  quoteLineId?: string
  values: ChargeValues
  protectionReason?: string
}
export interface QuoteReviewCharge { id: string; values: ChargeValues }
export interface RemovedQuoteCharge { quoteLineId: string; values: ChargeValues }
export interface ChargeReviewInput {
  /** Opaque server-generated token covering Quote version, all rows and links. */
  token: string
  current: readonly BookingReviewCharge[]
  proposed: readonly QuoteReviewCharge[]
  removed: readonly RemovedQuoteCharge[]
}
export interface ChargeReviewItem {
  key: string
  kind: "replace" | "remove" | "add" | "restore" | "preserve"
  bookingLineId?: string
  quoteLineId?: string
  before: ChargeValues | null
  proposed: ChargeValues | null
  blockedReason?: string
}

function unique(values: readonly string[], label: string) {
  if (values.some(value => !value.trim()) || new Set(values).size !== values.length) {
    throw new Error(`Invalid or duplicate ${label}. Refresh the charge review.`)
  }
}

export function buildBookingChargeReview(input: ChargeReviewInput): ChargeReviewItem[] {
  if (!input.token.trim()) throw new Error("Refresh the charge review before continuing.")
  unique(input.current.map(row => row.id), "Booking line identities")
  unique(input.proposed.map(row => row.id), "Quote line identities")
  unique(input.removed.map(row => row.quoteLineId), "removed Quote line identities")
  const linked = input.current.filter(row => row.origin === "quote")
  if (linked.some(row => !row.quoteLineId?.trim())) {
    throw new Error("A Quote-derived charge has no reliable source identity. Review its mapping first.")
  }
  unique(linked.map(row => row.quoteLineId!), "Quote-to-Booking mappings")
  const removed = new Map(input.removed.map(row => [row.quoteLineId, row]))
  if (linked.some(row => removed.has(row.quoteLineId!))) {
    throw new Error("A charge is both active and removed. Refresh and review its history.")
  }
  const proposed = new Map(input.proposed.map(row => [row.id, row]))
  const matched = new Set<string>()
  const hasUnmapped = input.current.some(row => row.origin === "unknown")
  const result: ChargeReviewItem[] = input.current.map(row => {
    if (row.origin !== "quote") return {
      key: `booking:${row.id}`, kind: "preserve", bookingLineId: row.id,
      before: row.values, proposed: null,
      blockedReason: row.origin === "booking"
        ? "Booking-added charge: preserved independently of the Quote."
        : "Source not recorded: preserve this charge until its origin is explicitly matched.",
    }
    const next = proposed.get(row.quoteLineId!)
    matched.add(row.quoteLineId!)
    return {
      key: `quote:${row.quoteLineId}`, kind: next ? "replace" : "remove",
      bookingLineId: row.id, quoteLineId: row.quoteLineId,
      before: row.values, proposed: next?.values ?? null,
      blockedReason: row.protectionReason,
    }
  })
  for (const row of input.proposed) {
    if (matched.has(row.id)) continue
    const previous = removed.get(row.id)
    result.push({
      key: `quote:${row.id}`, kind: previous ? "restore" : "add", quoteLineId: row.id,
      before: previous?.values ?? null, proposed: row.values,
      // An unmatched proposal might already exist as a legacy unlinked charge.
      blockedReason: hasUnmapped ? "Match the existing charges with missing origins before adding or restoring Quote charges." : undefined,
    })
  }
  return result
}

export interface ChargeReviewDecision {
  key: string
  action: "keep" | "replace" | "remove" | "add" | "restore"
}
export interface ChargeReviewOperation {
  action: Exclude<ChargeReviewDecision["action"], "keep">
  bookingLineId?: string
  quoteLineId: string
  before: ChargeValues | null
  after: ChargeValues | null
}

/** Produces a validated plan, not a database transaction. The caller must re-read
 * under lock, verify the token, recheck financial links and persist audit atomically.
 * Omitted decisions always preserve. A removed line requires the distinct Restore
 * action, never an ordinary Add/Replace. Booking-added rows cannot be overwritten.
 */
export function planBookingChargeDecisions(input: ChargeReviewInput, expectedToken: string, decisions: readonly ChargeReviewDecision[]) {
  if (expectedToken !== input.token) throw new Error("The Quote or Booking changed. Refresh and review the charges again.")
  const review = buildBookingChargeReview(input)
  unique(decisions.map(decision => decision.key), "charge decisions")
  const byKey = new Map(review.map(item => [item.key, item]))
  const operations: ChargeReviewOperation[] = []
  const audit: Array<{ key: string; action: ChargeReviewDecision["action"]; before: ChargeValues | null; after: ChargeValues | null }> = []
  for (const decision of decisions) {
    const item = byKey.get(decision.key)
    if (!item) throw new Error("A selected charge is not part of this review.")
    if (decision.action === "keep") {
      audit.push({ key: item.key, action: "keep", before: item.before, after: item.before })
      continue
    }
    if (item.blockedReason) throw new Error(item.blockedReason)
    if (item.kind === "preserve" || decision.action !== item.kind || !item.quoteLineId) {
      throw new Error("Choose the explicit action offered for this charge.")
    }
    const after = item.kind === "remove" ? null : item.proposed
    operations.push({ action: decision.action, bookingLineId: item.bookingLineId, quoteLineId: item.quoteLineId, before: item.before, after })
    audit.push({ key: item.key, action: decision.action, before: item.before, after })
  }
  return { operations, audit }
}
