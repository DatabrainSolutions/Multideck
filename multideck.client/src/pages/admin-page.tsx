import { lazy, useCallback, useEffect, useMemo, useState } from "react"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { getDateKey, MultideckDateRangePicker, type MultideckDateRange } from "@/components/multideck/date-picker"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { getAdminAudit, type AdminActiveUser, type AdminAuditResponse, type AdminAuditRow, type AdminAuditView } from "@/lib/admin-audit-api"
import { getQuoteReferenceSettings, saveQuoteReferenceSettings, type QuoteReferenceSettings } from "@/lib/quote-workflow-api"
import type { AuthUserSummary } from "@/lib/auth-user"

const AdminUsersContent = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.AdminUsersContent })))
const AdminAiUsageContent = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.AdminAiUsageContent })))
const AdminBillingContent = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.AdminBillingContent })))
const AdminBroadcastContent = lazy(() => import("@/components/multideck/broadcast-settings").then((module) => ({ default: module.BroadcastSettings })))

function normaliseReferencePatternInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return { pattern: "", nextNumber: null as number | null }
  if (/\{number\}/i.test(trimmed)) return { pattern: trimmed, nextNumber: null as number | null }
  const numberedPrefix = trimmed.match(/^(.*?)(\d+)$/)
  if (numberedPrefix) return { pattern: `${numberedPrefix[1]}{number}`, nextNumber: Number(numberedPrefix[2]) }
  return { pattern: `${trimmed}{number}`, nextNumber: null as number | null }
}

export type AdminRoute = "/admin/users" | "/admin/ai-usage" | "/admin/broadcast" | "/admin/billing" | "/admin/system-preferences" | "/admin/activity" | "/admin/detailed-log"
type AuditCategory = "all" | "authentication" | "application"
const auditRefreshIntervalMs = 60_000

const adminRouteTitles: Record<AdminRoute, string> = {
  "/admin/users": "Users",
  "/admin/ai-usage": "AI usage",
  "/admin/broadcast": "Broadcast",
  "/admin/billing": "Billing",
  "/admin/system-preferences": "System Preferences",
  "/admin/activity": "Active log",
  "/admin/detailed-log": "Detailed log",
}

const routeLabels: Record<string, string> = {
  "/": "Overview",
  "/agent-dexter": "Dexter",
  "/bookings": "Bookings",
  "/crm": "CRM",
  "/customers": "Customers",
  "/inbox": "Inbox",
  "/settings": "Settings",
  "/warehouse": "Warehouse",
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date)
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    const text = JSON.stringify(value)
    return text.length > 160 ? `${text.slice(0, 157)}…` : text
  } catch {
    return "Recorded value"
  }
}

function humanise(value: string | null | undefined) {
  if (!value) return "—"
  return value.replace(/^public\./, "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isUserAuditRecord(recordType: string | null | undefined) {
  if (!recordType) return false
  return /(^|[\s_.-])users?($|[\s_.-])/i.test(recordType.replace(/^public\./, ""))
}

function recordLabel(row: AdminAuditRow) {
  const key = row.recordKey ? Object.values(row.recordKey).find((value) => value !== null && value !== "") : null
  const identifier = row.recordId || (key === null || key === undefined ? null : String(key))
  const type = humanise(row.recordType)
  if (isUserAuditRecord(row.recordType)) return type
  return identifier ? `${type} · ${identifier}` : type
}

function isSystemAuditActor(row: AdminAuditRow) {
  const identities = [row.actorName, row.actorEmail]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase())

  return identities.length === 0 || identities.some((value) => /^(system|service[_ -]?role|supabase[_ -]?auth[_ -]?admin)$/.test(value))
}

function AuditActor({ row, systemLabel, fallbackLabel }: { row: AdminAuditRow; systemLabel: string; fallbackLabel: string }) {
  const systemGenerated = isSystemAuditActor(row)
  const label = systemGenerated ? systemLabel : row.actorName || fallbackLabel

  return (
    <div className="min-w-0">
      <StatusPill
        kind="status"
        tone={systemGenerated ? "purple" : "blue"}
        indicator={false}
        className="max-w-full"
      >
        <span className="truncate">{label}</span>
      </StatusPill>
    </div>
  )
}

function ActiveUsers({ users, currentUser }: { users: AdminActiveUser[]; currentUser: AuthUserSummary | null }) {
  const { t } = useLanguage()
  if (!users.length) return null

  return (
    <section aria-label={t("Active now")} className="px-1 py-1">
      <ul className="flex flex-wrap items-center gap-2">
        {users.map((user) => {
          const location = t(routeLabels[user.route ?? ""] ?? humanise(user.route?.split("/").filter(Boolean).at(-1) || "Workspace"))
          const isCurrentUser = Boolean(currentUser?.email && user.email && currentUser.email.toLowerCase() === user.email.toLowerCase())
          const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()

          return (
            <li key={user.id} aria-label={`${user.name} · ${location}`} title={`${user.name} · ${location}`}>
              <Avatar className="size-10 rounded-full">
                {isCurrentUser && currentUser?.profilePhotoUrl ? <AvatarImage src={currentUser.profilePhotoUrl} alt="" /> : null}
                <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[12px] font-medium text-[var(--md-ink)]">{initials}</AvatarFallback>
                <AvatarBadge className="size-2.5 bg-[var(--md-green)] text-transparent shadow-[0_0_0_2px_var(--md-surface)]" aria-hidden="true" />
              </Avatar>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AuditLog({ view, currentUser }: { view: AdminAuditView; currentUser: AuthUserSummary | null }) {
  const { t } = useLanguage()
  const [result, setResult] = useState<AdminAuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<AuditCategory>("all")
  const [dateRange, setDateRange] = useState<MultideckDateRange>({ start: null, end: null })
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<{ id: "time"; direction: "asc" | "desc" }>({ id: "time", direction: "desc" })
  const pageSize = 25

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  useEffect(() => {
    setOffset(0)
    setResult(null)
  }, [view])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      setResult(await getAdminAudit(view, { search, category, dateRange, sort, limit: pageSize, offset }, signal))
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return
      setError(loadError instanceof Error ? loadError.message : "The audit log could not be loaded.")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [category, dateRange, offset, search, sort, view])

  useEffect(() => {
    let controller = new AbortController()
    void load(controller.signal)
    const intervalId = window.setInterval(() => {
      controller.abort()
      controller = new AbortController()
      void load(controller.signal)
    }, auditRefreshIntervalMs)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [load])

  const activityColumns = useMemo<DataTableColumn<AdminAuditRow>[]>(() => [
    { id: "time", label: t("Time"), kind: "date", width: 190, sortValue: (row) => row.occurredAt, cell: (row) => <bdi className="tabular-nums text-[var(--md-text)]">{formatTimestamp(row.occurredAt)}</bdi> },
    { id: "actor", label: t("Who"), kind: "identity", width: 210, cell: (row) => <AuditActor row={row} systemLabel={t("System")} fallbackLabel={t("Workspace user")} /> },
    { id: "activity", label: t("Activity"), kind: "long-text", width: 240, cell: (row) => <div className="min-w-0"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t(row.title)}</p><p className="truncate text-[12px] text-[var(--md-text)]">{humanise(row.source)}</p></div> },
    { id: "record", label: t("Record"), kind: "long-text", width: 230, cellTitle: recordLabel, cell: (row) => <span className="block truncate text-[13px] text-[var(--md-text)]">{recordLabel(row)}</span> },
    { id: "category", label: t("Source"), kind: "status", width: 135, cell: (row) => <StatusPill kind="status" tone={row.category === "authentication" ? "purple" : "blue"}>{t(row.category === "authentication" ? "Authentication" : "Application")}</StatusPill> },
    { id: "ip", label: t("IP address"), kind: "text", width: 150, cell: (row) => <bdi className="text-[12px] text-[var(--md-text)]">{row.ipAddress || "—"}</bdi> },
    { id: "outcome", label: t("Outcome"), kind: "status", width: 115, cell: (row) => <StatusPill kind="status" tone={row.outcome.toLowerCase().includes("fail") ? "red" : "green"}>{t(humanise(row.outcome))}</StatusPill> },
  ], [t])

  const detailedColumns = useMemo<DataTableColumn<AdminAuditRow>[]>(() => [
    ...activityColumns.slice(0, 3),
    { id: "record", label: t("Record"), kind: "long-text", width: 220, cellTitle: recordLabel, cell: (row) => <span className="block truncate text-[13px] text-[var(--md-text)]">{recordLabel(row)}</span> },
    { id: "field", label: t("Field"), kind: "attribute", width: 160, cell: (row) => <span className="text-[12px] text-[var(--md-ink)]">{humanise(row.fieldName)}</span> },
    { id: "before", label: t("Before"), kind: "long-text", width: 210, cellTitle: (row) => formatAuditValue(row.oldValue), cell: (row) => <span className="block truncate text-[12px] text-[var(--md-text)]">{formatAuditValue(row.oldValue)}</span> },
    { id: "after", label: t("After"), kind: "long-text", width: 210, cellTitle: (row) => formatAuditValue(row.newValue), cell: (row) => <span className="block truncate text-[12px] text-[var(--md-ink)]">{formatAuditValue(row.newValue)}</span> },
    { id: "ip", label: t("IP address"), kind: "text", width: 145, cell: (row) => <bdi className="text-[12px] text-[var(--md-text)]">{row.ipAddress || "—"}</bdi> },
    { id: "reference", label: t("Reference"), kind: "text", width: 180, defaultHidden: true, cell: (row) => <span className="block truncate text-[12px] text-[var(--md-text)]">{row.correlationId || row.requestId || "—"}</span> },
  ], [activityColumns, t])

  const title = view === "detailed" ? t("Detailed log") : t("Active log")
  const description = view === "detailed"
    ? t("Inspect field changes, authentication detail and the evidence behind each recorded event.")
    : t("See sign-ins, sign-outs and operator actions in the workspace.")

  useEffect(() => { document.title = `${title} · Admin · Multideck` }, [title])

  const header = <SettingsPageHeader title={title} description={description} descriptionPlacement="under-title" actions={view === "activity" ? <ActiveUsers users={result?.activeUsers ?? []} currentUser={currentUser} /> : undefined} />
  if (loading && !result) return <div className="px-[var(--md-page-pad)] py-[var(--md-page-pad)]"><div className="mx-auto max-w-[1440px]">{header}<p className="mt-8 text-[13px] text-[var(--md-text)]" role="status">{t("Loading audit log…")}</p></div></div>
  if (error && !result) return <div className="px-[var(--md-page-pad)] py-[var(--md-page-pad)]"><div className="mx-auto max-w-[1440px]">{header}<div className="mt-6 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 text-[13px] shadow-[var(--md-shadow-soft)]" role="alert"><p className="font-medium text-[var(--md-red)]">{t("The audit log could not be loaded.")}</p><p className="mt-1 text-[var(--md-text)]">{error}</p></div></div></div>

  return (
    <div className="min-w-0 px-[var(--md-page-pad)] py-[var(--md-page-pad)]">
      <div className="mx-auto max-w-[1440px] space-y-5 pb-[var(--md-page-bottom-pad)]">
        {header}
        <DataTable
          ariaLabel={title}
          columnsButtonLabel={t("Manage audit log columns")}
          toolbarSearch={<Input type="search" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setOffset(0) }} placeholder={t("Search audit log")} aria-label={t("Search audit log")} className="w-full sm:w-[220px]" />}
          toolbarFilters={<><MultideckDateRangePicker value={dateRange} onChange={(range) => { setDateRange(range); setOffset(0) }} placeholder="Date range" title="Audit date range" description="Show events recorded between these dates." footerLabel="Selected audit dates" align="end" allowClear maxDate={getDateKey(new Date())} active={Boolean(dateRange.start || dateRange.end)} triggerClassName="h-9 w-auto min-w-[148px] max-w-[220px]" /><Select value={category} onValueChange={(value) => { setCategory(value as AuditCategory); setOffset(0) }}><SelectTrigger aria-label={t("Filter audit source")} className="min-w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All sources")}</SelectItem><SelectItem value="authentication">{t("Authentication")}</SelectItem><SelectItem value="application">{t("Application")}</SelectItem></SelectContent></Select></>}
          contentBeforeTable={error ? <p className="text-[12px] text-[var(--md-red)]" role="status">{error}</p> : undefined}
          columns={view === "detailed" ? detailedColumns : activityColumns}
          rows={result?.rows ?? []}
          getRowKey={(row) => row.id}
          storageKey={`admin-${view}-log`}
          minimumWidth={view === "detailed" ? 1515 : 1270}
          rowClassName="h-[64px]"
          enableSelectionExport={false}
          serverSorting={{ value: sort, onChange: (next) => { setSort(next?.id === "time" ? { id: "time", direction: next.direction } : { id: "time", direction: "desc" }); setOffset(0) } }}
          pagination={{ offset, limit: pageSize, total: result?.total ?? 0, loading, onOffsetChange: setOffset }}
          emptyState={<div className="py-5 text-center"><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No matching audit activity")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Change the search, date range or source filter to see more events.")}</p></div>}
        />
      </div>
    </div>
  )
}

function SystemPreferencesContent() {
  const { t } = useLanguage()
  const [quotePattern, setQuotePattern] = useState("")
  const [quoteNextNumber, setQuoteNextNumber] = useState(1)
  const [bookingPatterns, setBookingPatterns] = useState<QuoteReferenceSettings["bookingPatterns"]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getQuoteReferenceSettings().then((settings) => {
      setQuotePattern(settings.quotePattern)
      setQuoteNextNumber(settings.quoteNextNumber ?? 1)
      setBookingPatterns(settings.bookingPatterns)
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "System preferences could not be loaded.")).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setFeedback(null)
    setError(null)
    try {
      const settings = await saveQuoteReferenceSettings({ quotePattern, quoteNextNumber, bookingPatterns })
      setQuotePattern(settings.quotePattern)
      setQuoteNextNumber(settings.quoteNextNumber ?? 1)
      setBookingPatterns(settings.bookingPatterns)
      setFeedback("System preferences saved.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "System preferences could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const updateBookingPattern = (index: number, patch: Partial<QuoteReferenceSettings["bookingPatterns"][number]>) => {
    setBookingPatterns((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }
  const addBookingPattern = () => {
    const key = `booking-${bookingPatterns.length + 1}`
    setBookingPatterns((current) => [...current, { key, label: "Booking type", pattern: "B-{number}", nextNumber: 1, enabled: true }])
  }
  const normaliseQuotePattern = () => {
    const normalized = normaliseReferencePatternInput(quotePattern)
    setQuotePattern(normalized.pattern)
    if (normalized.nextNumber !== null && Number.isFinite(normalized.nextNumber)) setQuoteNextNumber(Math.max(1, normalized.nextNumber))
  }
  const normaliseBookingPattern = (index: number) => {
    const item = bookingPatterns[index]
    if (!item) return
    const normalized = normaliseReferencePatternInput(item.pattern)
    updateBookingPattern(index, { pattern: normalized.pattern, ...(normalized.nextNumber === null ? {} : { nextNumber: Math.max(1, normalized.nextNumber) }) })
  }
  const header = <SettingsPageHeader title={t("System Preferences")} description={t("Control the patterns used when new quote and booking references are created.")} descriptionPlacement="under-title" />
  if (loading) return <div className="px-[var(--md-page-pad)] py-[var(--md-page-pad)]"><div className="mx-auto max-w-[760px]">{header}<p className="mt-8 text-[13px] text-[var(--md-text)]" role="status">{t("Loading system preferences…")}</p></div></div>

  return <div className="min-w-0 px-[var(--md-page-pad)] py-[var(--md-page-pad)]"><div className="mx-auto max-w-[860px] space-y-5 pb-[var(--md-page-bottom-pad)]">{header}<section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]"><div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-[1fr_160px]"><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Quote reference pattern")}</span><Input value={quotePattern} maxLength={64} onChange={(event) => setQuotePattern(event.target.value)} onBlur={normaliseQuotePattern} placeholder="Q-{number}" aria-label={t("Quote reference pattern")} /><span className="text-[11px] font-normal text-[var(--md-subtle)]">{t("Use {number} where the ascending number should appear. Example: JQ{number}. A value such as JQ20000 becomes JQ{number} starting at 20000.")}</span></label><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]"><span>{t("Next number")}</span><Input type="number" min={1} value={quoteNextNumber} onChange={(event) => setQuoteNextNumber(Math.max(1, Number(event.target.value) || 1))} aria-label={t("Next quote number")} /></label></div><div className="grid gap-3"><div className="flex items-center justify-between"><div><h2 className="text-[12px] font-medium text-[var(--md-text)]">{t("Booking reference patterns")}</h2><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("Add separate sequences for Import, Export or any other booking type.")}</p></div><Button type="button" variant="outline" onClick={addBookingPattern}>{t("Add pattern")}</Button></div>{bookingPatterns.map((item, index) => <div key={`${item.key}-${index}`} className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-muted)] p-3 sm:grid-cols-[1fr_1.4fr_120px_auto]"><label className="grid gap-1 text-[11px] font-medium text-[var(--md-text)]"><span>{t("Label")}</span><Input value={item.label} onChange={(event) => updateBookingPattern(index, { label: event.target.value })} aria-label={t("Booking pattern label")} /></label><label className="grid gap-1 text-[11px] font-medium text-[var(--md-text)]"><span>{t("Pattern")}</span><Input value={item.pattern} maxLength={64} onChange={(event) => updateBookingPattern(index, { pattern: event.target.value })} onBlur={() => normaliseBookingPattern(index)} placeholder="B-{number}" aria-label={t("Booking reference pattern")} /></label><label className="grid gap-1 text-[11px] font-medium text-[var(--md-text)]"><span>{t("Next number")}</span><Input type="number" min={1} value={item.nextNumber} onChange={(event) => updateBookingPattern(index, { nextNumber: Math.max(1, Number(event.target.value) || 1) })} aria-label={t("Next booking number")} /></label><div className="flex items-end"><Button type="button" variant="ghost" onClick={() => setBookingPatterns((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{t("Remove")}</Button></div></div>)}</div></div>{error ? <p className="mt-4 text-[12px] text-[var(--md-red)]" role="alert">{error}</p> : null}{feedback ? <p className="mt-4 text-[12px] text-[var(--md-green)]" role="status">{t(feedback)}</p> : null}<div className="mt-5 flex justify-end"><Button type="button" disabled={saving || !quotePattern || bookingPatterns.length === 0} onClick={() => void save()}>{t(saving ? "Saving…" : "Save preferences")}</Button></div></section></div></div>
}

export function AdminPage({ route, currentUser }: { route: AdminRoute; currentUser: AuthUserSummary | null }) {
  useEffect(() => {
    document.title = `${adminRouteTitles[route]} · Admin · Multideck`
  }, [route])

  const content = route === "/admin/users"
    ? <AdminUsersContent />
    : route === "/admin/ai-usage"
      ? <AdminAiUsageContent />
      : route === "/admin/broadcast"
        ? <AdminBroadcastContent />
      : route === "/admin/billing"
        ? <AdminBillingContent />
        : route === "/admin/system-preferences"
          ? <SystemPreferencesContent />
        : null

  if (content) {
    return <div className="px-[var(--md-page-pad)] py-[var(--md-page-pad)]"><div className="mx-auto max-w-[1180px] pb-[var(--md-page-bottom-pad)]">{content}</div></div>
  }
  return <AuditLog view={route === "/admin/detailed-log" ? "detailed" : "activity"} currentUser={currentUser} />
}
