import { evidenceHash } from "./finance-period-comparison.mts"

const TYPES = ["Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry", "GL Entry"] as const
type Kind = typeof TYPES[number]
type PeriodRequest = <T>(path: string, input?: { exactNumbers?: boolean }) => Promise<T>
const PAGE = 100
const MAX_ROWS = 3000
const CHILD_CONCURRENCY = 8
const fields: Record<Kind, string[]> = {
  "Sales Invoice": ["name", "modified", "company", "posting_date", "docstatus"],
  "Purchase Invoice": ["name", "modified", "company", "posting_date", "docstatus"],
  "Payment Entry": ["name", "modified", "company", "posting_date", "docstatus"],
  "Journal Entry": ["name", "modified", "company", "posting_date", "docstatus"],
  "GL Entry": ["name", "modified", "company", "posting_date", "account", "debit", "credit", "voucher_type", "voucher_no", "is_cancelled", "party_type", "party"],
}
const row = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
function filters(company: string, end: string) { return [["company", "=", company], ["posting_date", "<=", end]] }

async function count(type: Kind, company: string, end: string, request: PeriodRequest) {
  const query = new URLSearchParams({ doctype: type, filters: JSON.stringify(filters(company, end)) })
  const response = await request<{ message?: unknown }>(`/api/method/frappe.client.get_count?${query}`)
  if (!Number.isSafeInteger(response.message) || (response.message as number) < 0 || (response.message as number) > MAX_ROWS) throw new Error(`ERPNext ${type} count is unavailable or exceeds the bounded reconciliation window.`)
  return response.message as number
}

async function inventory(type: Kind, company: string, end: string, request: PeriodRequest) {
  const expected = await count(type, company, end, request)
  const records: Record<string, any>[] = []
  let pageCount = 0
  for (let start = 0; start <= expected; start += PAGE) {
    const query = new URLSearchParams({ fields: JSON.stringify(fields[type]), filters: JSON.stringify(filters(company, end)), order_by: "name asc", limit_start: String(start), limit_page_length: String(PAGE) })
    const response = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}?${query}`, { exactNumbers: true })
    if (!Array.isArray(response.data) || response.data.length > PAGE) throw new Error(`ERPNext ${type} returned an invalid page.`)
    pageCount++
    for (const item of response.data) {
      const value = row(item)
      if (typeof value.name !== "string" || !value.name || typeof value.modified !== "string" || value.company !== company || typeof value.posting_date !== "string" || value.posting_date > end) throw new Error(`ERPNext ${type} returned an invalid company, date or identity.`)
      records.push(value)
    }
    if (response.data.length < PAGE) break
    if (start + PAGE >= MAX_ROWS) throw new Error(`ERPNext ${type} exceeds the bounded reconciliation window.`)
  }
  const after = await count(type, company, end, request)
  if (records.length !== expected || after !== expected || new Set(records.map(item => item.name)).size !== records.length) throw new Error(`ERPNext ${type} changed or paged incompletely during reconciliation.`)
  return { records, pageCount, count: expected, hash: await evidenceHash(records) }
}

/** Complete double inventory and exact child readback; a changing or capped source fails. */
export async function fetchErpNextPeriod(company: string, end: string, request?: PeriodRequest, siteOrigin?: string) {
  if (!company || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error("Choose an exact ERPNext Company and period end.")
  if (!request) { const adapter = await import("./erpnext.ts"); request = adapter.erpNextRequest; siteOrigin = adapter.erpNextOrigin() }
  if (!siteOrigin) throw new Error("The exact ERPNext site origin is required for provider evidence.")
  const first = {} as Record<Kind, Awaited<ReturnType<typeof inventory>>>
  for (const type of TYPES) first[type] = await inventory(type, company, end, request)
  const details = {} as Record<Kind, Record<string, any>[]>
  for (const type of TYPES) {
    if (type === "GL Entry") { details[type] = first[type].records; continue }
    details[type] = []
    for (let start = 0; start < first[type].records.length; start += CHILD_CONCURRENCY) {
      const batch = first[type].records.slice(start, start + CHILD_CONCURRENCY)
      const complete = await Promise.all(batch.map(async listed => {
        const response = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}/${encodeURIComponent(listed.name)}`, { exactNumbers: true })
        const full = row(response.data)
        if (full.name !== listed.name || full.modified !== listed.modified || full.company !== company || full.posting_date !== listed.posting_date ||
          (full.docstatus !== listed.docstatus && String(full.docstatus) !== String(listed.docstatus))) throw new Error(`ERPNext ${type} changed during its child readback.`)
        if ((type === "Sales Invoice" || type === "Purchase Invoice") && (!Array.isArray(full.items) || !Array.isArray(full.taxes))) throw new Error(`ERPNext ${type} has incomplete item or tax evidence.`)
        if (type === "Payment Entry" && !Array.isArray(full.references)) throw new Error("ERPNext Payment Entry has incomplete allocation evidence.")
        if (type === "Journal Entry" && !Array.isArray(full.accounts)) throw new Error("ERPNext Journal Entry has incomplete account evidence.")
        return full
      }))
      details[type].push(...complete)
    }
  }
  const second = {} as Record<Kind, Awaited<ReturnType<typeof inventory>>>
  for (const type of TYPES) {
    second[type] = await inventory(type, company, end, request)
    if (first[type].count !== second[type].count || first[type].hash !== second[type].hash) throw new Error(`ERPNext ${type} changed between inventory passes.`)
  }
  const checkpoint = await evidenceHash(TYPES.map(type => ({ type, hash: second[type].hash, count: second[type].count })))
  return { providerCode: "erpnext", company, siteOrigin, checkpoint, details, counts: Object.fromEntries(TYPES.map(type => [type, { count: first[type].count, pages: first[type].pageCount + second[type].pageCount, hash: first[type].hash }])) }
}
