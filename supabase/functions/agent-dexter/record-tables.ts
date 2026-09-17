type Json = Record<string, unknown>
type Column = { key: string; label: string; kind?: "text" | "number" | "date" | "status"; required?: boolean }
const column = (key: string, label: string, kind?: Column["kind"]): Column => ({ key, label, ...(kind ? { kind } : {}) })
const columns: Record<string, Column[]> = {
  leads: [column("companyName", "Lead"), column("tradeLane", "Route"), column("status", "Status", "status"), column("serviceInterest", "Service"), column("owner", "Owner"), column("rating", "Rating", "status"), column("lastInteractionAt", "Last interaction", "date"), column("estimatedValue", "Est. value", "number"), column("currency", "Currency"), column("nextActionDueAt", "Next action due", "date")],
  deals: [column("name", "Deal"), column("pipeline", "Pipeline"), column("stage", "Stage", "status"), column("status", "Status", "status"), column("expectedValue", "Expected value", "number"), column("currency", "Currency"), column("expectedCloseDate", "Expected close", "date"), column("nextActionDueAt", "Next action due", "date")],
  customers: [column("name", "Company"), column("relationshipStatus", "Relationship", "status"), column("location", "Location"), column("owner", "Owner"), column("nextActionDueAt", "Next action due", "date")],
  bookings: [column("bookingReference", "Job"), column("customerName", "Company"), column("status", "Status", "status"), column("origin", "Origin"), column("destination", "Destination")],
  quotes: [column("quoteNumber", "Quote"), column("customerName", "Company"), column("status", "Status", "status"), column("origin", "Origin"), column("destination", "Destination")],
}
export const recordTableTool = {
  type: "function", name: "show_record_table", strict: true,
  description: "Show selected records from an earlier query in the native Multideck table, with record links and sorting. Use for record lists such as leads, deals, companies, jobs and quotes. Pass only record IDs returned by that domain query. Rows and values come from verified query results, not generated text. Summarise the takeaway without repeating the table in Markdown. This is a snapshot, not a complete workspace count.",
  parameters: { type: "object", additionalProperties: false, properties: {
    domain: { type: "string", enum: Object.keys(columns) },
    title: { type: "string" },
    fields: { type: ["array", "null"], items: { type: "string", enum: [...new Set(Object.values(columns).flat().map(field => field.key))] }, minItems: 1, maxItems: 7,
      description: "Choose up to seven fields relevant to the question, or null for the usual overview. The identity column is always included. For lead follow-up include nextActionDueAt and lastInteractionAt; missing values remain visible. Use only fields belonging to this record type." },
    filters: { type: ["array", "null"], maxItems: 5, description: "For a filtered list, declare its inclusion/exclusion rules. Every selected record must match. For open/booked jobs excluding closed, use jobStatus in [open, booked] and status not_in [Closed]. Use null only for an unfiltered list.", items: {
      type: "object", additionalProperties: false, properties: {
        field: {type: "string", enum: [...new Set([...Object.values(columns).flat().map(field => field.key), "jobStatus"])]},
        operator: {type: "string", enum: ["in", "not_in"]},
        values: {type: "array", items: {type: "string"}, minItems: 1, maxItems: 20},
      }, required: ["field", "operator", "values"],
    } },
    record_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 25 },
  }, required: ["domain", "title", "record_ids", "fields", "filters"] },
}

export function createRecordTable(args: Json, records: Map<string, Map<string, Json>>, now = new Date()) {
  const domain = typeof args.domain === "string" ? args.domain : ""
  if (!columns[domain]) return { error: "That record type cannot be shown as a table." }
  const ids = Array.isArray(args.record_ids) ? [...new Set(args.record_ids)] : []
  if (!ids.length || ids.length > 25 || ids.some(id => typeof id !== "string" || !records.get(domain)?.has(id))) {
    return { error: "Query this domain first and choose only record IDs returned by that query." }
  }
  if (args.filters != null) {
    if (!Array.isArray(args.filters) || args.filters.length > 5) return {error: "Choose up to five table filters."}
    for (const filter of args.filters) {
      if (!filter || typeof filter !== "object" || Array.isArray(filter)) return {error: "Choose valid table filters."}
      const {field, operator, values} = filter as Json
      if (typeof field !== "string" || !(columns[domain].some(column => column.key === field) || domain === "bookings" && field === "jobStatus")
        || !["in", "not_in"].includes(String(operator)) || !Array.isArray(values) || !values.length || values.length > 20
        || values.some(value => typeof value !== "string" || !value.trim())) return {error: "Choose filters using fields available on this record type."}
      const expected = values.map(value => String(value).trim().toLowerCase())
      const mismatch = ids.some(id => {
        const actual = records.get(domain)!.get(String(id))![field]
        // Missing evidence cannot prove either inclusion or exclusion.
        if (typeof actual !== "string" && typeof actual !== "number") return true
        const match = expected.includes(String(actual).trim().toLowerCase())
        return operator === "in" ? !match : match
      })
      if (mismatch) return {error: `Some selected records do not match the ${field} filter. Select matching queried records, or query more examples. Do not relax the operator's requested criteria.`}
    }
  }
  const fields = Array.isArray(args.fields) ? [...new Set(args.fields)] : null
  if (fields && (!fields.length || fields.length > 7 || fields.some(key => !columns[domain].some(field => field.key === key)))) {
    return { error: "Choose only fields available on this record type." }
  }
  const selectedColumns = fields
    ? [columns[domain][0], ...fields.filter(key => key !== columns[domain][0].key).map(key => columns[domain].find(field => field.key === key)!)].map(field => ({ ...field, required: true }))
    : columns[domain]
  const rows = ids.map(id => {
    const record = records.get(domain)!.get(String(id))!
    const citation = record._citation as Json | undefined
    const url = typeof citation?.url === "string" && /^\/(?!\/)[^\\]*$/.test(citation.url) ? citation.url : undefined
    return { id: String(id), ...(url ? { url } : {}), values: Object.fromEntries(selectedColumns.map(({ key }) => {
      const value = record[key]
      return [key, typeof value === "string" ? value.slice(0, 500) : typeof value === "number" && Number.isFinite(value) ? value : null]
    })) }
  })
  return { table: { id: crypto.randomUUID(), domain, title: typeof args.title === "string" ? args.title.slice(0, 120) : "Records", columns: selectedColumns, rows, retrievedAt: now.toISOString() } }
}

/** The caller supplies an authorised query result, never model-authored target details. */
export function recordActionTarget(record?: Json) {
  if (!record || typeof record.recordId !== "string") return undefined
  const label = ["companyName", "name", "bookingReference", "quoteNumber", "title", "reference"]
    .map(key => record[key]).find(value => typeof value === "string" && value.trim())
  if (typeof label !== "string") return undefined
  const citation = record._citation as Json | undefined
  const url = typeof citation?.url === "string" && /^\/(?!\/)[^\\]*$/.test(citation.url) ? citation.url : undefined
  return { id: record.recordId, label: label.slice(0, 240), ...(url ? { url } : {}) }
}
