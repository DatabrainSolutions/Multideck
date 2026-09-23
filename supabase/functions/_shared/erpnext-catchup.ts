import { erpNextOrigin, erpNextRequest } from "./erpnext.ts"

const TYPES = ["Sales Invoice", "Purchase Invoice", "Payment Entry"] as const
const VERSION = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/

type Listing = { name: string; modified: string; company: string }

export function normaliseErpNextVersion(value: unknown): string | null {
  if (typeof value !== "string" || !VERSION.test(value)) return null
  const [dateTime, fraction = ""] = value.replace("T", " ").split(".")
  return `${dateTime}.${fraction.padEnd(6, "0")}`
}

export function scanLowerBound(watermark: string | null): string {
  const version = normaliseErpNextVersion(watermark)
  if (!version) return "1900-01-01 00:00:00.000000"
  // Revisit the previous hour. The unique observation key makes this safe,
  // while late commits and equal provider timestamps are seen again.
  const [dateTime, microseconds] = version.split(".")
  const time = Date.parse(`${dateTime.replace(" ", "T")}Z`)
  const lower = Math.max(Date.UTC(1900, 0, 1), time - 3_600_000)
  if (lower === Date.UTC(1900, 0, 1)) return "1900-01-01 00:00:00.000000"
  return `${new Date(lower).toISOString().slice(0, 19).replace("T", " ")}.${microseconds}`
}

export function scanQuery(company: string, lower: string, upper: string, afterModified: string | null, afterName: string | null, limit = 100, sameTimestamp = false): string {
  const filters: unknown[][] = [["company", "=", company]]
  if (sameTimestamp) {
    if (!afterModified || !afterName) throw new Error("A same-time scan requires its exact cursor")
    filters.push(["modified", "=", afterModified], ["name", ">", afterName])
  } else {
    filters.push(["modified", afterModified ? ">" : ">=", afterModified ?? lower], ["modified", "<=", upper])
  }
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "modified", "company"]),
    filters: JSON.stringify(filters),
    order_by: sameTimestamp ? "name asc" : "modified asc, name asc",
    limit_page_length: String(limit),
  })
  return query.toString()
}

function listing(value: unknown, company: string): Listing[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("ERPNext scan returned an invalid page")
  return value.map((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {}
    const modified = normaliseErpNextVersion(row.modified)
    if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 240 || row.company !== company || !modified) {
      throw new Error("ERPNext scan returned an invalid document identity")
    }
    return { name: row.name, modified, company }
  })
}

/** One bounded page per type per worker call. A failed page never moves its checkpoint. */
export async function processErpNextCatchup(admin: any, request = erpNextRequest): Promise<Record<string, unknown>[]> {
  const connections = await admin.from("ACCI_Connections")
    .select("ACCIC_ID,ACCIC_ExternalTenantName,ACCIC_LegalEntityID,ACCIC_SettingsJSON")
    .eq("ACCIC_ProviderCode", "erpnext").eq("ACCIC_StatusCode", "active")
  if (connections.error) throw new Error("ERPNext catch-up connections could not be read")
  const results: Record<string, unknown>[] = []
  const bound = (connections.data ?? []).filter((connection: any) => connection.ACCIC_SettingsJSON?.partySync?.siteOrigin === erpNextOrigin())
  const companyCounts = new Map<string, number>()
  for (const connection of bound) {
    const company = connection.ACCIC_ExternalTenantName
    if (typeof company === "string" && company) companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1)
  }
  if ([...companyCounts.values()].some((count) => count !== 1)) throw new Error("ERPNext company does not resolve to one connection")
  for (const connection of bound) {
    const entity = await admin.from("cmp_LegalEntities").select("Company_ID,LegalEntity_IsActive")
      .eq("LegalEntity_ID", connection.ACCIC_LegalEntityID).maybeSingle()
    if (entity.error || !entity.data?.LegalEntity_IsActive || !entity.data.Company_ID) continue
    const company = connection.ACCIC_ExternalTenantName
    if (typeof company !== "string" || !company) continue
    for (const type of TYPES) {
      const backlog = await admin.from("ACCI_WebhookEvents").select("ACCIWH_ID")
        .eq("ACCIWH_ConnectionID", connection.ACCIC_ID)
        .in("ACCIWH_ProcessingStatusCode", ["queued", "processing", "failed"])
        .limit(100)
      if (backlog.error) throw new Error("ERPNext inbound backlog could not be checked")
      if ((backlog.data?.length ?? 0) >= 100) {
        results.push({ connectionId: connection.ACCIC_ID, type, status: "waiting_for_inbound_backlog" })
        break
      }
      const state = await admin.from("ACCI_ProviderScanCursors").select("revision,watermark,upper_bound,cursor_modified,cursor_name")
        .eq("connection_id", connection.ACCIC_ID).eq("object_type", type).maybeSingle()
      if (state.error) throw new Error("ERPNext catch-up checkpoint could not be read")
      const revision = state.data?.revision ?? 0
      const cursorModified = normaliseErpNextVersion(state.data?.cursor_modified)
      const cursorName = state.data?.cursor_name ?? null
      const lower = scanLowerBound(state.data?.watermark ?? null)
      let upper = normaliseErpNextVersion(state.data?.upper_bound)
      if (!upper) {
        const latestQuery = new URLSearchParams({
          fields: JSON.stringify(["name", "modified", "company"]),
          filters: JSON.stringify([["company", "=", company]]),
          order_by: "modified desc",
          limit_page_length: "1",
        })
        const latest = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}?${latestQuery}`)
        if (!Array.isArray(latest.data) || latest.data.length > 1) throw new Error("ERPNext latest version could not be verified")
        if (!latest.data.length) continue
        upper = listing(latest.data, company)[0].modified
      }
      if (upper < lower) throw new Error("ERPNext listing is older than its retained checkpoint")
      let rows: Listing[] = []
      if (cursorModified && cursorName) {
        const same = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}?${scanQuery(company, lower, upper, cursorModified, cursorName, 100, true)}`)
        rows = listing(same.data, company)
      }
      if (rows.length < 100) {
        const later = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}?${scanQuery(company, lower, upper, cursorModified, cursorName, 100 - rows.length)}`)
        rows.push(...listing(later.data, company))
      }
      if (!state.data?.upper_bound && !rows.length) {
        throw new Error("ERPNext latest document is absent from its bounded scan")
      }
      let hasMore = rows.length === 100
      if (rows.length > 0 && !hasMore) {
        // Some provider deployments cap a requested page below 100. Prove
        // exhaustion with a keyset look-ahead before completing the window.
        const last = rows.at(-1)!
        const same = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}?${scanQuery(company, lower, upper, last.modified, last.name, 1, true)}`)
        const later = listing(same.data, company)
        if (!later.length) {
          const next = await request<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}?${scanQuery(company, lower, upper, last.modified, last.name, 1)}`)
          later.push(...listing(next.data, company))
        }
        hasMore = later.length > 0
      }
      const persisted = await admin.rpc("multideck_erpnext_record_scan_page", {
        p_connection: connection.ACCIC_ID, p_type: type, p_revision: revision,
        p_lower: lower, p_upper: upper,
        p_cursor_modified: cursorModified, p_cursor_name: cursorName,
        p_rows: rows, p_has_more: hasMore,
        p_site: erpNextOrigin(),
      })
      if (persisted.error || persisted.data !== true) throw new Error("ERPNext catch-up page was not retained")
      results.push({ connectionId: connection.ACCIC_ID, type, count: rows.length, complete: !hasMore })
    }
  }
  return results
}
