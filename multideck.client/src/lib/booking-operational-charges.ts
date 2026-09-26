import type { UnifiedQuoteChargeRow, QuoteChargeParty, QuoteChargeCurrency } from "@/components/multideck/unified-quote-charges-workspace"
import { readBookingChargeRows, type BookingPlanningCharge } from "./booking-planning-charges"

type Snapshot = Record<string, unknown>
export type QuoteChargeDecision = "keep" | "add" | "replace" | "remove" | "restore"
export type BookingQuoteChargeReview = {
  reviewId: string; versionId: string; token: string; editable: boolean; blockedReason: string | null
  items: { key: string; kind: QuoteChargeDecision | "preserve"; before: Snapshot | null; proposed: Snapshot | null;
    beforeNotes: Snapshot | null; proposedNotes: Snapshot | null; blockedReason: string | null }[]
}
export type OperationalChargeLine = { id: string; values: BookingPlanningCharge | null; snapshot: Snapshot; blockedReason: string | null }
export type OperationalChargeWorkspace = { supported: false } | {
  supported: true; jobId: string; editable: boolean; blockedReason: string | null; baseCurrency: string | null
  bookingUpdatedAt: string; currencies: QuoteChargeCurrency[]; parties: QuoteChargeParty[]; lines: OperationalChargeLine[]
}
const object = (value: unknown): Snapshot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Charge information is incomplete. Reload before continuing.")
  return value as Snapshot
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readQuoteChargeReview(input: unknown): BookingQuoteChargeReview | null {
  if (input === null) return null
  const value = object(input)
  if (typeof value.reviewId !== "string" || !uuid.test(value.reviewId) || typeof value.versionId !== "string" || !uuid.test(value.versionId)
    || typeof value.token !== "string" || !/^[0-9a-f]{64}$/.test(value.token) || typeof value.editable !== "boolean" || !Array.isArray(value.items)
    || (value.blockedReason !== null && typeof value.blockedReason !== "string")) throw new Error("Quote charge review could not be confirmed.")
  const items = value.items.map(inputItem => {
    const item = object(inputItem)
    if (typeof item.key !== "string" || !item.key || typeof item.kind !== "string" || !["preserve", "replace", "remove", "add", "restore"].includes(item.kind)
      || (item.blockedReason !== null && typeof item.blockedReason !== "string")) throw new Error("Quote charge decision is invalid.")
    return { key: item.key, kind: item.kind as BookingQuoteChargeReview["items"][number]["kind"],
      before: item.before === null ? null : object(item.before), proposed: item.proposed === null ? null : object(item.proposed),
      beforeNotes: item.beforeNotes === null ? null : object(item.beforeNotes), proposedNotes: item.proposedNotes === null ? null : object(item.proposedNotes),
      blockedReason: item.blockedReason as string | null }
  })
  if (new Set(items.map(item => item.key)).size !== items.length) throw new Error("Duplicate Quote charge decisions.")
  return { reviewId: value.reviewId, versionId: value.versionId, token: value.token, editable: value.editable, blockedReason: value.blockedReason as string | null, items }
}

export function readOperationalCharges(input: unknown, jobId: string): OperationalChargeWorkspace {
  const value = object(input)
  if (value.supported === false) return { supported: false }
  if (value.supported !== true || value.jobId !== jobId || typeof value.editable !== "boolean"
    || (value.blockedReason !== null && typeof value.blockedReason !== "string")
    || (value.baseCurrency !== null && (typeof value.baseCurrency !== "string" || !/^[A-Z]{3}$/.test(value.baseCurrency)))
    || typeof value.bookingUpdatedAt !== "string" || !Number.isFinite(Date.parse(value.bookingUpdatedAt))
    || !Array.isArray(value.lines) || !Array.isArray(value.currencies) || !Array.isArray(value.parties)) throw new Error("Charge access could not be confirmed.")
  const baseCurrency = value.baseCurrency as string | null
  const currencies = value.currencies.map(item => {
    const currency = object(item)
    if (typeof currency.code !== "string" || !/^[A-Z]{3}$/.test(currency.code) || typeof currency.name !== "string"
      || typeof currency.symbol !== "string" || typeof currency.decimalPlaces !== "number" || !Number.isInteger(currency.decimalPlaces)
      || currency.decimalPlaces < 0 || currency.decimalPlaces > 6) throw new Error("Charge currencies could not be confirmed.")
    return { code: currency.code, name: currency.name, symbol: currency.symbol, decimalPlaces: currency.decimalPlaces }
  })
  const parties = value.parties.map(item => {
    const party = object(item)
    if (typeof party.id !== "string" || !uuid.test(party.id) || typeof party.name !== "string" || typeof party.code !== "string"
      || !Array.isArray(party.roles) || party.roles.some(role => role !== "supplier" && role !== "customer")) throw new Error("Charge parties could not be confirmed.")
    return { id: party.id, name: party.name, code: party.code, roles: party.roles } as QuoteChargeParty
  })
  const lines = value.lines.map(item => {
    const line = object(item), snapshot = object(line.snapshot)
    if (typeof line.id !== "string" || !uuid.test(line.id) || snapshot.JobCostingLine_ID !== line.id || snapshot.Job_ID !== jobId
      || (line.blockedReason !== null && typeof line.blockedReason !== "string")) throw new Error("Charge identity could not be confirmed.")
    let values: BookingPlanningCharge | null = null
    try { if (baseCurrency) values = readBookingChargeRows([line.values], baseCurrency)[0] } catch {
      if (!line.blockedReason) throw new Error("Editable charge values could not be confirmed.")
    }
    if (values && values.id !== line.id) throw new Error("Charge identity mismatch.")
    return { id: line.id, values, snapshot, blockedReason: line.blockedReason as string | null }
  })
  if (new Set(lines.map(line => line.id)).size !== lines.length || (value.editable && (!baseCurrency || value.blockedReason !== null
    || !currencies.some(currency => currency.code === baseCurrency)))) throw new Error("Charge editing is not ready.")
  return { supported: true, jobId, editable: value.editable, blockedReason: value.blockedReason as string | null,
    baseCurrency, bookingUpdatedAt: value.bookingUpdatedAt, currencies, parties, lines }
}

export function operationalEditorRows(workspace: OperationalChargeWorkspace): UnifiedQuoteChargeRow[] {
  return workspace.supported ? workspace.lines.flatMap(line => line.values ? [{ ...line.values, costRoeSource: "manual" as const, sellRoeSource: "manual" as const }] : []) : []
}

export function operationalChargeSavePayload(workspace: OperationalChargeWorkspace, editorRows: readonly UnifiedQuoteChargeRow[], reason: string) {
  if (!workspace.supported || !workspace.editable || !workspace.baseCurrency) throw new Error("Charge editing is unavailable.")
  if (!reason.trim() || reason.trim().length > 2000) throw new Error("Enter a reason of up to 2,000 characters.")
  const rows = readBookingChargeRows(editorRows.map(row => ({ ...row, quantity: row.quantity ?? 1 })), workspace.baseCurrency)
  const byId = new Map(rows.map(row => [row.id, row]))
  const operations: { id: string; action: "add" | "update" | "remove"; before?: Snapshot; after?: BookingPlanningCharge; reason: string }[] = []
  for (const line of workspace.lines) {
    const next = byId.get(line.id)
    if (!line.values) { if (next) throw new Error("Historical charges require review."); continue }
    const changed = next && Object.keys(line.values).some(key => line.values![key as keyof BookingPlanningCharge] !== next[key as keyof BookingPlanningCharge])
    if (!next || changed) {
      if (line.blockedReason) throw new Error(line.blockedReason)
      operations.push({ id: line.id, action: next ? "update" : "remove", before: line.snapshot, ...(next ? { after: next } : {}), reason: reason.trim() })
    }
  }
  for (const row of rows) if (!workspace.lines.some(line => line.id === row.id)) operations.push({ id: row.id, action: "add", after: row, reason: reason.trim() })
  return { jobId: workspace.jobId, expectedUpdatedAt: workspace.bookingUpdatedAt, operations }
}
