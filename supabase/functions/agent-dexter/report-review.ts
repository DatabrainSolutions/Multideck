type Value = Record<string, unknown>
const object = (value: unknown): Value => value && typeof value === "object" && !Array.isArray(value) ? value as Value : {}
const text = (value: unknown) => String(value ?? "")
const labels: Record<string, string> = { jobs: "Jobs", sales: "Invoiced sales", quotes: "Quotes", opportunities: "Opportunities", reference: "Reference", date: "Invoice date", created: "Created date", net: "Net invoiced sales", goodsValue: "Shipment goods value" }
const label = (value: unknown) => labels[text(value)] || text(value).replace(/([a-z])([A-Z])/g, "$1 $2")
const operators: Record<string, string> = { eq: "is", neq: "is not", contains: "contains", gte: "is at least", lte: "is at most", empty: "is empty", notEmpty: "is not empty" }
const period = (value: unknown) => {
  const p = object(value)
  const names: Record<string, string> = { last12months: "Last 12 months to today", last2months: "Last 2 complete months", lastmonth: "Last complete month", thismonth: "This month to today" }
  return names[text(p.preset)] || `${text(p.start)} to ${text(p.end)} (inclusive)`
}
export function reportActionChanges(args: Value) {
  const definition = object(args.definition)
  const changes: { field: string; value: string; before: null; after: string; beforeKnown: boolean; kind: string }[] = []
  const add = (field: string, value: unknown) => { const after = text(value); changes.push({ field, value: after, before: null, after, beforeKnown: !args.target_id, kind: args.target_id ? "changed" : "added" }) }
  add("Report", args.name); add("Format", definition.kind); add("Who can view it", args.visibility === "workspace" ? "Workspace members with access to the data" : "Only me")
  const analysis = (raw: unknown, prefix = "") => {
    const q = object(raw)
    add(`${prefix}Data`, label(q.source)); add(`${prefix}Date to use`, label(q.dateField)); add(`${prefix}Period`, period(q.period))
    add(`${prefix}Columns`, Array.isArray(q.columns) ? q.columns.map(label).join(", ") : "")
    add(`${prefix}Filters`, Array.isArray(q.filters) && q.filters.length ? q.filters.map(raw => { const f = object(raw); return `${label(f.field)} ${operators[text(f.op)] || text(f.op)} ${text(f.value)}`.trim() }).join(q.filterMatch === "any" ? " OR " : " AND ") : "All records in the period")
    const sort = object(q.sort)
    if(sort.field) add(`${prefix}Sort`, `${label(sort.field)}, ${sort.direction === "desc" ? "descending" : "ascending"}`)
    if(q.mode === "summary") { add(`${prefix}Measure`, q.measure === "count" ? "Number of records" : `${text(q.aggregation)} of ${label(q.measure)}`); add(`${prefix}Group by`, label(q.groupBy)); add(`${prefix}Comparison`, q.compare === "previous" ? "Previous period of the same length" : "None"); add(`${prefix}Chart`, q.chart === "pie" ? "Donut (negative values use bars)" : q.chart) }
    if(q.currency) add(`${prefix}Currency`, `${text(q.currency)}; no conversion`)
  }
  if(definition.kind === "document") {
    add("Document period", period(definition.period)); add("Document customer", definition.customer || "All customers")
    for(const [i, raw] of (Array.isArray(definition.blocks) ? definition.blocks : []).entries()) {
      const b=object(raw); const prefix=`Section ${i+1}: `
      add(`${prefix}Title`, b.title)
      if(b.kind === "text") add(`${prefix}Commentary`, b.text)
      else { analysis({ ...object(b.query), ...(b.useDocumentPeriod !== false ? { period: definition.period } : {}) }, prefix); add(`${prefix}Customer`, b.useDocumentCustomer !== false ? definition.customer || "All customers" : "Uses its own analysis filters") }
    }
  } else analysis(definition.query)
  return changes
}
