import { getSupabaseSession, supabase, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"

export type ReportField = { id: string; label: string; type: "text" | "date" | "money" | "number" }
export type ReportSource = { id: string; label: string; description: string; defaultDate: string; fields: ReportField[] }
export type ReportPeriod = { preset: "last12months" | "last2months" | "lastmonth" | "thismonth" | "custom"; start?: string; end?: string }
export type ReportFilter = { field: string; op: "eq" | "neq" | "contains" | "gte" | "lte" | "empty" | "notEmpty"; value: string }
export type ReportQuery = {
  source: string; dateField: string; period: ReportPeriod; columns: string[]; mode: "rows" | "summary";
  filters: ReportFilter[]; filterMatch: "all" | "any"; groupBy: string; measure: string;
  aggregation: "sum" | "avg" | "min" | "max"; currency: string; compare: "none" | "previous";
  sort: { field: string; direction: "asc" | "desc" }; chart: "bar" | "line" | "pie";
}
export type ReportBlock = { id: string; kind: "text" | "table" | "chart"; title: string; text?: string; query?: ReportQuery; useDocumentPeriod?: boolean; useDocumentCustomer?: boolean; copiedFrom?: string }
export type ReportDefinition = { version: 1; kind: "table" | "chart" | "document"; query?: ReportQuery; period?: ReportPeriod; customer?: string; blocks?: ReportBlock[] }
export type SavedReport = { id: string; owner_id: string; name: string; visibility: "private" | "workspace"; definition: ReportDefinition; version: number; updated_at: string }
export type ReportResult = {
  source: string; description: string; start: string; end: string; generatedAt: string; columns: ReportField[];
  rows: Record<string, string | number | null>[]; total: number; recordCount: number; truncated: boolean; value?: number;
  comparison?: { value: number; start: string; end: string; change: number; percent: number | null };
}
export type ReportSnapshot = { kind: ReportDefinition["kind"]; query?: ReportResult; blocks?: (ReportBlock & { result?: ReportResult })[]; generatedAt?: string }
export type ReportRun = { id: string; report_id: string; name: string; report_version: number; definition: ReportDefinition; snapshot: ReportSnapshot | null; status: "ready" | "failed"; error: string | null; created_at: string; schedule_id: string | null }
export type ReportSchedule = { id: string; report_id: string; name: string; frequency: "daily" | "weekly" | "monthly"; timezone: string; local_time: string; weekday: number; monthday: number; paused: boolean; next_run_at: string; last_run_at: string | null; updated_at: string }
export type ReportsWorkspace = { userId: string; catalogue: ReportSource[]; reports: SavedReport[]; archivedReports: SavedReport[]; runs: ReportRun[]; schedules: ReportSchedule[] }

export async function reportingRequest<T>(action: string, payload: unknown = {}): Promise<T> {
  if (!supabase) throw new Error("Reporting needs a connected Multideck workspace.")
  const { data, error } = await supabase.rpc("reporting_workspace", { action, payload })
  if (error) throw new Error(error.code === "PGRST202" ? "Reporting is being set up for this workspace. Please try again shortly." : error.message)
  return data as T
}

export function newReportQuery(source: ReportSource): ReportQuery {
  return {
    source: source.id, dateField: source.defaultDate, period: { preset: "last12months" },
    columns: source.fields.slice(0, 7).map(f => f.id), mode: "rows", filters: [], filterMatch: "all",
    groupBy: "month", measure: "count", aggregation: "sum", currency: "", compare: "none",
    sort: { field: source.defaultDate, direction: "desc" }, chart: "bar",
  }
}

export function reportSchedulePayload(schedule: ReportSchedule) {
  return { id: schedule.id, reportId: schedule.report_id, frequency: schedule.frequency, timezone: schedule.timezone, localTime: schedule.local_time,
    weekday: schedule.weekday, monthday: schedule.monthday, paused: schedule.paused, updatedAt: schedule.updated_at }
}

export async function downloadReport(run: ReportRun, format: "pdf" | "xlsx" | "csv") {
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to download this report.")
  const response = await fetch(`${supabaseFunctionsUrl}/report-export`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: supabasePublicApiKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ runId: run.id, format }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.detail || "The report could not be downloaded. Your saved snapshot is still available.")
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = `${run.name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 100) || "Report"}-${run.created_at.slice(0, 10)}.${format}`
  document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
