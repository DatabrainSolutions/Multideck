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
  return rows.filter((row) => Number.isFinite(row.outstanding) && row.outstanding > 0).map((row) => {
    const daysOverdue = row.dueDate ? Math.max(0, Math.floor((cutoff - asDay(row.dueDate)) / day)) : 0
    const bucket = daysOverdue > 90 ? "90+" : daysOverdue > 60 ? "61–90" : daysOverdue > 30 ? "31–60" : daysOverdue > 0 ? "1–30" : "current"
    const priorityReasons = [
      daysOverdue > 60 ? `Invoice is ${daysOverdue} days overdue` : daysOverdue > 0 ? `Invoice is ${daysOverdue} days overdue` : "Not overdue",
      `Outstanding ${row.currency} ${row.outstanding.toFixed(2)}`,
    ]
    const priority = daysOverdue > 60 ? "urgent" : daysOverdue > 0 ? "review" : "routine"
    return { ...row, daysOverdue, bucket, priority, priorityReasons, evidence: { sourceTable: "FIN_Documents", sourceId: row.id, observedAt: row.updatedAt } }
  }).sort((a, b) => {
    const rank = { urgent: 0, review: 1, routine: 2 }
    return rank[a.priority] - rank[b.priority] || b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding || a.id.localeCompare(b.id)
  })
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
