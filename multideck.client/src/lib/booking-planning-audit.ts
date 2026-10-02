type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const fields = {
  code: "Code", description: "Description", supplierId: "Supplier ID", customerId: "Customer ID",
  cost: "Cost", sell: "Sell", costCurrency: "Cost currency", sellCurrency: "Sell currency",
  costRoe: "Cost exchange rate", sellRoe: "Sell exchange rate", quantity: "Quantity", calculationBasis: "Calculation basis",
} as const

function editableCharge(raw: unknown): Row | null {
  if (raw == null) return null
  const line = record(raw)
  if (!line.JobCostingLine_ID) return line
  const source = record(line.JobCostingLine_SourceMetadataJSON)
  return { ...record(source.quoteCharge), ...record(source.planningCharge), ...record(source.bookingCharge),
    id: line.JobCostingLine_ID, description: line.JobCostingLine_Description,
    supplierId: line.JobCostingLine_SupplierID, cost: line.JobCostingLine_CostAmountCurrency,
    sell: line.JobCostingLine_RevenueAmountCurrency, costRoe: line.JobCostingLine_CostROE,
    sellRoe: line.JobCostingLine_RevenueROE }
}

type AuditChargeChange = { id: string; label: string; action: string; changes: { label: string; before: string | null; after: string | null }[] }

export function planningAuditChanges(metadata: unknown, language = "en-GB"): AuditChargeChange[] | null {
  const details = record(metadata)
  if (Array.isArray(details.decisions)) {
    return details.decisions.flatMap(raw => {
      const decision = record(raw), before = editableCharge(decision.before), after = editableCharge(decision.after)
      if (decision.action === 'keep') {
        const row = before ?? after ?? {}
        return [{ id: String(row.id ?? decision.key), label: [row.code, row.description].filter(Boolean).join(' — ') || 'Charge line', action: 'Kept unchanged', changes: [] }]
      }
      return planningAuditChanges({ planningHistory: {
        beforeRows: decision.action === 'restore' || !before ? [] : [before], afterRows: after ? [after] : [],
      } }, language) ?? []
    })
  }
  let history = record(details.planningHistory)
  // Operational deletion receipts retain the complete original ledger row.
  // Project only editable fields here; never expose raw backend field names.
  if (!Array.isArray(history.beforeRows) && details.costingLineId && details.before && details.after == null) {
    const line = record(details.before), source = record(line.JobCostingLine_SourceMetadataJSON)
    const values = { ...record(source.quoteCharge), ...record(source.planningCharge), ...record(source.bookingCharge) }
    history = { beforeRows: [{ ...values, id: line.JobCostingLine_ID, description: line.JobCostingLine_Description,
      supplierId: line.JobCostingLine_SupplierID, cost: line.JobCostingLine_CostAmountCurrency, sell: line.JobCostingLine_RevenueAmountCurrency,
      costRoe: line.JobCostingLine_CostROE, sellRoe: line.JobCostingLine_RevenueROE }], afterRows: [] }
  }
  if (!Array.isArray(history.beforeRows) || !Array.isArray(history.afterRows)) return null
  const before = new Map(history.beforeRows.map(value => { const row = record(value); return [String(row.id), row] }))
  const after = new Map(history.afterRows.map(value => { const row = record(value); return [String(row.id), row] }))
  const format = (row: Row, key: string) => {
    const value = row[key]
    if (value === null || value === undefined || value === "") return "Not recorded"
    if ((key === "cost" || key === "sell") && typeof value === "number") {
      const currency = row[`${key}Currency`]
      if (typeof currency === "string" && /^[A-Z]{3}$/.test(currency)) {
        return new Intl.NumberFormat(language, { style: "currency", currency }).format(value)
      }
    }
    return String(value)
  }
  return [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
    const old = before.get(id), current = after.get(id)
    const row = current ?? old!
    const changes = Object.entries(fields).flatMap(([key, label]) => {
      if (old && current && old[key] === current[key]) return []
      return [{ label, before: old ? format(old, key) : null, after: current ? format(current, key) : null }]
    })
    if (!changes.length) return []
    return [{ id, label: [row.code, row.description].filter(Boolean).join(" — ") || "Charge line", action: !old ? "Added" : !current ? "Deleted" : "Changed", changes }]
  })
}
