export type OpenItem = {
  id: string
  partyId: string
  partyName: string
  number: string
  ledger: "receivables" | "payables"
  dueDate: string | null
  currency: string
  outstanding: number
  status: string
  updatedAt: string
}

export type AgedItem = OpenItem & {
  daysOverdue: number
  bucket: "current" | "1–30" | "31–60" | "61–90" | "90+"
  priority: "routine" | "review" | "urgent"
  priorityReasons: string[]
  evidence: { sourceTable: "FIN_Documents"; sourceId: string; observedAt: string }
}

const day = 86_400_000
const asDay = (value: string) => {
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new Error("Choose a valid as-of date.")
  return parsed
}

/** Deterministic prioritisation. A payment promise or dispute never raises an
 * automated priority; the operator reviews those human records separately. */
export function ageOpenItems(rows: OpenItem[], asOf: string): AgedItem[] {
  const cutoff = asDay(asOf)
  return rows.filter((row) => Number.isFinite(row.outstanding) && row.outstanding > 0).map((row): AgedItem => {
    const daysOverdue = row.dueDate ? Math.max(0, Math.floor((cutoff - asDay(row.dueDate)) / day)) : 0
    const bucket: AgedItem["bucket"] = daysOverdue > 90 ? "90+" : daysOverdue > 60 ? "61–90" : daysOverdue > 30 ? "31–60" : daysOverdue > 0 ? "1–30" : "current"
    const priorityReasons = [
      daysOverdue > 60 ? `Invoice is ${daysOverdue} days overdue` : daysOverdue > 0 ? `Invoice is ${daysOverdue} days overdue` : "Not overdue",
      `Outstanding ${row.currency} ${row.outstanding.toFixed(2)}`,
    ]
    const priority: AgedItem["priority"] = daysOverdue > 60 ? "urgent" : daysOverdue > 0 ? "review" : "routine"
    return { ...row, daysOverdue, bucket, priority, priorityReasons, evidence: { sourceTable: "FIN_Documents", sourceId: row.id, observedAt: row.updatedAt } }
  }).sort((a, b) => {
    const rank = { urgent: 0, review: 1, routine: 2 }
    return rank[a.priority] - rank[b.priority] || b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding || a.id.localeCompare(b.id)
  })
}

export function summariseOpenBalances(items: Array<{ currency: string; outstanding: number }>, offsets: Array<{ currency: string; amount: number }>) {
  const totals: Record<string, { grossInvoices: number; unappliedOffsets: number; net: number }> = {}
  for (const item of items) {
    if (!Number.isFinite(item.outstanding) || item.outstanding < 0) throw new Error("Invoice balances must be non-negative.")
    const row = totals[item.currency] ?? { grossInvoices: 0, unappliedOffsets: 0, net: 0 }
    row.grossInvoices += item.outstanding; row.net += item.outstanding; totals[item.currency] = row
  }
  for (const item of offsets) {
    if (!Number.isFinite(item.amount) || item.amount > 0) throw new Error("Unapplied offsets must be non-positive.")
    const row = totals[item.currency] ?? { grossInvoices: 0, unappliedOffsets: 0, net: 0 }
    row.unappliedOffsets += item.amount; row.net += item.amount; totals[item.currency] = row
  }
  return totals
}

export type MatchCandidate = {
  id: string
  number: string
  supplierId: string
  currency: string
  netAmount: number
  matchedNet: number
  jobId: string | null
  status: string
}

export function proposePurchaseOrderMatches(input: { supplierId: string; currency: string; netAmount: number; jobId?: string | null; purchaseOrderNumber?: string | null }, orders: MatchCandidate[]) {
  return orders.filter((order) => order.status === "approved" && order.supplierId === input.supplierId && order.currency === input.currency).map((order) => {
    const available = Math.round((order.netAmount - order.matchedNet) * 100) / 100
    const exactNumber = Boolean(input.purchaseOrderNumber && order.number.trim().toLowerCase() === input.purchaseOrderNumber.trim().toLowerCase())
    const exactAmount = Math.abs(available - input.netAmount) <= 0.01
    const matchingJob = Boolean(input.jobId && order.jobId === input.jobId)
    const conflicts = [
      available + 0.01 < input.netAmount ? "Invoice net exceeds unmatched PO value" : "",
      input.jobId && order.jobId && input.jobId !== order.jobId ? "Job differs from the PO" : "",
    ].filter(Boolean)
    return {
      ...order,
      available,
      score: (exactNumber ? 60 : 0) + (exactAmount ? 25 : 0) + (matchingJob ? 15 : 0),
      reasons: [exactNumber ? "Exact PO number" : "Same supplier and currency", exactAmount ? "Unmatched PO value agrees" : "Compare net values", matchingJob ? "Same job" : "Review job allocation"],
      conflicts,
      evidence: { sourceTable: "FIN_SupplierPurchaseOrders" as const, sourceId: order.id },
    }
  }).sort((a, b) => a.conflicts.length - b.conflicts.length || b.score - a.score || a.number.localeCompare(b.number))
}

export const matchCitationFields = ["invoice.supplier", "invoice.currency", "invoice.netAmount", "invoice.job", "invoice.number", "po.supplier", "po.currency", "po.availableNet", "po.job", "po.number"] as const

type MatchSource = {
  document: { table: string; id: string; fileId: string | null; sha256: string | null; fields: Record<string, string | number | null> }
  purchaseOrders: Array<{ table: string; id: string; fields: Record<string, string | number | null> }>
}

/** Treat the model response as an untrusted suggestion. Every citation value is
 * resolved from the current canonical snapshot rather than copied from text. */
export function validateMatchModelProposal(output: unknown, source: MatchSource, eligibleIds: string[]) {
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("AI matching returned an invalid proposal.")
  const value = output as Record<string, unknown>
  const selectedId = value.purchaseOrderId === null ? null : typeof value.purchaseOrderId === "string" ? value.purchaseOrderId : undefined
  if (selectedId === undefined || (selectedId && !eligibleIds.includes(selectedId))) throw new Error("AI matching selected an ineligible PO.")
  const rationale = typeof value.rationale === "string" ? value.rationale.trim().slice(0, 600) : ""
  if (!rationale || !Array.isArray(value.citationFields) || !value.citationFields.length || value.citationFields.length > 8) throw new Error("AI matching must explain and cite the proposal.")
  const fields = [...new Set(value.citationFields)]
  if (fields.some((field) => typeof field !== "string" || !matchCitationFields.includes(field as typeof matchCitationFields[number]))) throw new Error("AI matching cited an unknown source field.")
  if (!fields.some((field) => String(field).startsWith("invoice.")) || (selectedId && !fields.some((field) => String(field).startsWith("po.")))) throw new Error("AI matching must cite both records for a proposed PO match.")
  const selectedOrder = source.purchaseOrders.find((order) => order.id === selectedId)
  if (selectedId && !selectedOrder) throw new Error("AI matching selected a PO outside the source snapshot.")
  const citations = fields.map((field) => {
    const [record, key] = String(field).split(".")
    const owner = record === "invoice" ? source.document : selectedOrder
    if (!owner || !(key in owner.fields)) throw new Error("AI matching cited a field absent from the source snapshot.")
    return { field, table: owner.table, recordId: owner.id, fileId: record === "invoice" ? source.document.fileId : null, fileSha256: record === "invoice" ? source.document.sha256 : null, page: null, value: owner.fields[key] }
  })
  return { selectedId, rationale, citations }
}
