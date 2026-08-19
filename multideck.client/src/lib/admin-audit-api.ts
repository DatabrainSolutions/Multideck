import { edgeFetch } from "@/lib/api"
import { readCachedRegisterPage } from "@/lib/application-data-api"
import { getSupabaseSession } from "@/lib/supabase"
import type { MultideckDateRange } from "@/components/multideck/date-picker"

export type AdminAuditView = "activity" | "detailed"

export type AdminAuditRow = {
  id: string
  occurredAt: string
  category: "authentication" | "application" | string
  action: string
  title: string
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  source: string
  recordType: string | null
  recordId: string | null
  recordKey: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  outcome: string
  detail: string | null
  fieldName: string | null
  oldValue: unknown
  newValue: unknown
  requestId: string | null
  correlationId: string | null
  sensitive: boolean
}

export type AdminActiveUser = {
  id: string
  name: string
  email: string | null
  route: string | null
  ipAddress: string | null
  userAgent: string | null
  lastSeenAt: string
}

export type AdminAuditResponse = {
  view: AdminAuditView
  rows: AdminAuditRow[]
  activeUsers: AdminActiveUser[]
  total: number
  offset: number
  limit: number
  compatibilityMode: boolean
}

export type AdminAuditQuery = {
  search?: string
  category?: "all" | "authentication" | "application"
  dateRange?: MultideckDateRange
  sort?: { id: "time"; direction: "asc" | "desc" } | null
  limit: number
  offset: number
}

type RawAdminAuditRow = Record<string, unknown>

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function mapRow(row: RawAdminAuditRow): AdminAuditRow {
  return {
    id: String(row.id ?? row.audit_id ?? ""),
    occurredAt: String(row.occurred_at ?? ""),
    category: String(row.category ?? "application"),
    action: String(row.action ?? "updated"),
    title: String(row.title ?? "Activity recorded"),
    actorId: asNullableString(row.actor_id),
    actorName: asNullableString(row.actor_name),
    actorEmail: asNullableString(row.actor_email),
    source: String(row.source ?? "Multideck"),
    recordType: asNullableString(row.record_type),
    recordId: asNullableString(row.record_id),
    recordKey: asObject(row.record_key),
    ipAddress: asNullableString(row.ip_address),
    userAgent: asNullableString(row.user_agent),
    outcome: String(row.outcome ?? "recorded"),
    detail: asNullableString(row.detail),
    fieldName: asNullableString(row.field_name),
    oldValue: row.old_value,
    newValue: row.new_value,
    requestId: asNullableString(row.request_id),
    correlationId: asNullableString(row.correlation_id),
    sensitive: row.is_sensitive === true || row.sensitive === true,
  }
}

async function parseError(response: Response) {
  try {
    const result = await response.json() as { detail?: string; message?: string; title?: string }
    return result.detail || result.message || result.title || `Admin request failed (${response.status}).`
  } catch {
    return `Admin request failed (${response.status}).`
  }
}

export async function getAdminAudit(view: AdminAuditView, input: AdminAuditQuery, signal?: AbortSignal): Promise<AdminAuditResponse> {
  const session = await getSupabaseSession()
  if (!session?.access_token || !session.user) throw new Error("Sign in again to open Admin.")
  const normalized = {
    search: input.search?.trim().slice(0, 120) || undefined,
    category: input.category === "authentication" || input.category === "application" ? input.category : "all",
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(input.dateRange?.start ?? "") ? input.dateRange?.start : undefined,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(input.dateRange?.end ?? "") ? input.dateRange?.end : undefined,
    sort: input.sort?.direction === "asc" ? "asc" : "desc",
    limit: Math.max(1, Math.min(Math.trunc(input.limit), 50)),
    offset: Math.max(0, Math.min(Math.trunc(input.offset), 1_000_000)),
  }
  const parameters = new URLSearchParams({
    view,
    category: normalized.category,
    sortDirection: normalized.sort,
    limit: String(normalized.limit),
    offset: String(normalized.offset),
  })
  if (normalized.search) parameters.set("query", normalized.search)
  if (normalized.startDate) parameters.set("startDate", normalized.startDate)
  if (normalized.endDate) parameters.set("endDate", normalized.endDate)
  const resource = `admin-audit:${parameters.toString()}`

  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const response = await edgeFetch("admin-audit", `?${parameters.toString()}`, session.access_token, { signal: requestSignal })
    if (!response.ok) throw new Error(await parseError(response))
    const result = await response.json() as {
      view?: AdminAuditView
      rows?: RawAdminAuditRow[]
      activeUsers?: AdminActiveUser[]
      total?: number
      offset?: number
      limit?: number
      compatibilityMode?: boolean
    }
    const rows = (result.rows ?? []).map(mapRow)
    return {
      view: result.view === "detailed" ? "detailed" : "activity",
      rows,
      activeUsers: result.activeUsers ?? [],
      total: Number.isFinite(Number(result.total)) ? Math.max(rows.length, Number(result.total)) : rows.length,
      offset: Number.isFinite(Number(result.offset)) ? Math.max(0, Number(result.offset)) : normalized.offset,
      limit: Number.isFinite(Number(result.limit)) ? Math.max(1, Number(result.limit)) : normalized.limit,
      compatibilityMode: result.compatibilityMode === true,
    }
  }, signal)
}

export async function recordWorkspacePresence(route: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) return
  const response = await edgeFetch("admin-audit", "/presence", session.access_token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route }),
  })
  if (!response.ok) throw new Error(await parseError(response))
}
