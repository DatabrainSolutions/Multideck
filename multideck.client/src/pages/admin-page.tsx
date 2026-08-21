import { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { LockKeyIcon as LockKeyholeIcon } from "@hugeicons/core-free-icons"
import { ChevronDown, Image, ImageUp, LoaderCircle, RotateCcw } from "@/components/icons/hugeicons"
import { AiPromptMorph } from "@/components/multideck/ai-prompt-morph"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { getDateKey, MultideckDateRangePicker, type MultideckDateRange } from "@/components/multideck/date-picker"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { getAdminAudit, type AdminActiveUser, type AdminAuditResponse, type AdminAuditRow, type AdminAuditView } from "@/lib/admin-audit-api"
import { draftQuoteReferenceRule, getQuoteBranding, getQuoteReferenceSettings, saveQuoteReferenceSettings, uploadQuoteBrandingLogo, type QuoteBranding, type QuoteReferenceSettings, type ReferenceRuleDraft, type ReferenceRuleTarget } from "@/lib/quote-workflow-api"
import type { AuthUserSummary } from "@/lib/auth-user"
import { cn } from "@/lib/utils"

const AdminUsersContent = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.AdminUsersContent })))
const AdminAiUsageContent = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.AdminAiUsageContent })))
const AdminBillingContent = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.AdminBillingContent })))
const AdminBroadcastContent = lazy(() => import("@/components/multideck/broadcast-settings").then((module) => ({ default: module.BroadcastSettings })))

function normaliseReferencePatternInput(value: string) {
  const trimmed = value.trim().toUpperCase()
  if (!trimmed) return { pattern: "", nextNumber: null as number | null }
  if (/\{(?:NUMBER|LETTERS)(?::\d{1,2})?\}/.test(trimmed)) return { pattern: trimmed.replace(/\{(NUMBER|LETTERS)\}/g, "{$1:4}"), nextNumber: null as number | null }
  const numberedPrefix = trimmed.match(/^(.*?)(\d+)$/)
  if (numberedPrefix) return { pattern: `${numberedPrefix[1]}{NUMBER:${numberedPrefix[2].length}}`, nextNumber: Number(numberedPrefix[2]) }
  return { pattern: `${trimmed}{NUMBER:4}`, nextNumber: null as number | null }
}

function referenceCounterWidth(pattern: string) {
  return Math.max(1, Number(pattern.match(/\{(?:NUMBER|LETTERS):(\d{1,2})\}/i)?.[1]) || 1)
}

type ReferenceRecipeChunk =
  | { kind: "literal"; value: string; start: number; end: number }
  | { kind: "token"; token: "NUMBER" | "LETTERS" | "COMPANY" | "MULTIDECK"; width: number | null; start: number; end: number }

function referenceRecipeChunks(pattern: string): ReferenceRecipeChunk[] {
  const chunks: ReferenceRecipeChunk[] = []
  const tokenPattern = /\{(NUMBER|LETTERS|COMPANY|MULTIDECK)(?::(\d{1,2}))?\}/gi
  let cursor = 0
  for (const match of pattern.matchAll(tokenPattern)) {
    const start = match.index ?? cursor
    if (start > cursor) chunks.push({ kind: "literal", value: pattern.slice(cursor, start), start: cursor, end: start })
    chunks.push({
      kind: "token",
      token: match[1].toUpperCase() as "NUMBER" | "LETTERS" | "COMPANY" | "MULTIDECK",
      width: match[2] ? Number(match[2]) : null,
      start,
      end: start + match[0].length,
    })
    cursor = start + match[0].length
  }
  if (cursor < pattern.length) chunks.push({ kind: "literal", value: pattern.slice(cursor), start: cursor, end: pattern.length })
  return chunks
}

function replaceReferenceRecipeLiteral(pattern: string, chunk: Extract<ReferenceRecipeChunk, { kind: "literal" }>, value: string) {
  const literal = value.toUpperCase().replace(/[^A-Z0-9 _./-]/g, "").slice(0, 24)
  return `${pattern.slice(0, chunk.start)}${literal}${pattern.slice(chunk.end)}`
}

function setReferenceCounterFormat(pattern: string, token: "NUMBER" | "LETTERS", width: 4 | 5 | 6 | 7) {
  return pattern.replace(/\{(?:NUMBER|LETTERS)(?::\d{1,2})?\}/i, `{${token}:${width}}`)
}

function referenceCounterType(pattern: string): "NUMBER" | "LETTERS" {
  return /\{LETTERS(?::\d{1,2})?\}/i.test(pattern) ? "LETTERS" : "NUMBER"
}

function formatReferenceLetters(value: number, width: number) {
  let remainder = Math.max(1, Math.floor(value) || 1) - 1
  let result = ""
  do {
    result = String.fromCharCode(65 + (remainder % 26)) + result
    remainder = Math.floor(remainder / 26)
  } while (remainder > 0)
  return result.padStart(width, "A")
}

function formatReferenceCounter(value: number, pattern: string) {
  const normalizedValue = Math.max(1, Math.floor(value) || 1)
  return referenceCounterType(pattern) === "LETTERS"
    ? formatReferenceLetters(normalizedValue, referenceCounterWidth(pattern))
    : String(normalizedValue).padStart(referenceCounterWidth(pattern), "0")
}

function parseReferenceCounter(value: string, pattern: string) {
  if (referenceCounterType(pattern) === "NUMBER") return Math.max(1, Number(value.replace(/\D/g, "")) || 1)
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "")
  if (!letters) return 1
  return letters.split("").reduce((total, letter) => (total * 26) + letter.charCodeAt(0) - 65, 0) + 1
}

function referencePreview(pattern: string, value: number, companyName: string) {
  const company = companyName.toUpperCase().replace(/[^A-Z0-9]/g, "") || "COMPANY"
  const replaceSeed = (current: string, token: "COMPANY" | "MULTIDECK", seed: string) => current.replace(
    new RegExp(`\\{${token}(?::(\\d{1,2}))?\\}`, "gi"),
    (_match, width: string | undefined) => width ? seed.slice(0, Number(width)) : seed,
  )
  return replaceSeed(replaceSeed(pattern.toUpperCase(), "COMPANY", company), "MULTIDECK", "MULTIDECK")
    .replace(/\{(?:NUMBER|LETTERS)(?::\d{1,2})?\}/i, formatReferenceCounter(value, pattern))
}

function referencePatternError(pattern: string, target: ReferenceRuleTarget, companyName: string) {
  const normalized = pattern.trim().toUpperCase()
  const counterTokens = normalized.match(/\{(?:NUMBER|LETTERS)(?::\d{1,2})?\}/g) ?? []
  if (counterTokens.length !== 1) return "Every reference rule needs one continuous sequence."
  const tokens = normalized.match(/\{[^}]*\}/g) ?? []
  if (tokens.some((token) => !/^\{(?:NUMBER|LETTERS|COMPANY|MULTIDECK)(?::\d{1,2})?\}$/.test(token))) return "That rule contains an unsupported part."
  if (tokens.some((token) => { const match = token.match(/:(\d{1,2})\}/); const width = Number(match?.[1]); return Boolean(match) && (width < 1 || width > 18) })) return "Rule lengths must be between 1 and 18 characters."
  const literal = normalized.replace(/\{(?:NUMBER|LETTERS|COMPANY|MULTIDECK)(?::\d{1,2})?\}/g, "")
  if (!normalized || /[^A-Z0-9 _./-]/.test(literal) || /[{}]/.test(literal)) return "That rule contains unsupported characters."
  if (target === "customer" && referencePreview(normalized, 1, companyName).length > 8) return "Customer references must remain within eight characters."
  return null
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
  const { language, t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const [companyName, setCompanyName] = useState("Multideck")
  const [branding, setBranding] = useState<QuoteBranding | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [brandingFeedback, setBrandingFeedback] = useState<string | null>(null)
  const [brandingError, setBrandingError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [quotePattern, setQuotePattern] = useState("")
  const [quoteNextNumber, setQuoteNextNumber] = useState(1)
  const [bookingPatterns, setBookingPatterns] = useState<QuoteReferenceSettings["bookingPatterns"]>([])
  const [customerPattern, setCustomerPattern] = useState("CUS{NUMBER:4}")
  const [customerNextNumber, setCustomerNextNumber] = useState(1)
  const [unlockedCounters, setUnlockedCounters] = useState<Set<string>>(() => new Set())
  const [counterUnlock, setCounterUnlock] = useState<{ key: string; label: string } | null>(null)
  const [activeRuleKey, setActiveRuleKey] = useState<string | null>(null)
  const [rulePrompt, setRulePrompt] = useState("")
  const [ruleDraft, setRuleDraft] = useState<ReferenceRuleDraft | null>(null)
  const [draftingRule, setDraftingRule] = useState(false)
  const [ruleProgress, setRuleProgress] = useState<"idle" | "working" | "crafting">("idle")
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([getQuoteReferenceSettings(), getQuoteBranding()]).then(([settings, quoteBranding]) => {
      setCompanyName(settings.companyName || "Multideck")
      setQuotePattern(normaliseReferencePatternInput(settings.quotePattern).pattern)
      setQuoteNextNumber(settings.quoteNextNumber ?? 1)
      setBookingPatterns(settings.bookingPatterns.map((item) => ({ ...item, pattern: normaliseReferencePatternInput(item.pattern).pattern })))
      setCustomerPattern(normaliseReferencePatternInput(settings.customerPattern || "CUS{NUMBER:4}").pattern)
      setCustomerNextNumber(settings.customerNextNumber ?? 1)
      setBranding(quoteBranding)
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "System preferences could not be loaded.")).finally(() => setLoading(false))
  }, [])

  async function uploadLogo(file: File | null) {
    if (!file || uploadingLogo) return
    setUploadingLogo(true)
    setBrandingError(null)
    setBrandingFeedback(null)
    try {
      setBranding(await uploadQuoteBrandingLogo(file))
      setBrandingFeedback("Company logo updated. New quote PDFs will use it.")
    } catch (uploadError) {
      setBrandingError(uploadError instanceof Error ? uploadError.message : "The company logo could not be uploaded.")
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }

  async function save() {
    const validationError = referencePatternError(quotePattern, "quote", companyName)
      || bookingPatterns.map((item) => referencePatternError(item.pattern, "booking", companyName)).find(Boolean)
      || referencePatternError(customerPattern, "customer", companyName)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setFeedback(null)
    setError(null)
    try {
      const settings = await saveQuoteReferenceSettings({
        companyName,
        quotePattern: quotePattern.trim().toUpperCase(),
        quoteNextNumber,
        bookingPatterns: bookingPatterns.map((item) => ({ ...item, pattern: item.pattern.trim().toUpperCase() })),
        customerPattern: customerPattern.trim().toUpperCase(),
        customerNextNumber,
      })
      setCompanyName(settings.companyName || companyName)
      setQuotePattern(settings.quotePattern)
      setQuoteNextNumber(settings.quoteNextNumber ?? 1)
      setBookingPatterns(settings.bookingPatterns)
      setCustomerPattern(settings.customerPattern || customerPattern)
      setCustomerNextNumber(settings.customerNextNumber ?? 1)
      setUnlockedCounters(new Set())
      setFeedback("Reference rules saved.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "System preferences could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const updateBookingPattern = (index: number, patch: Partial<QuoteReferenceSettings["bookingPatterns"][number]>) => {
    setBookingPatterns((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
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

  const activeRule = useMemo(() => {
    if (activeRuleKey === "quote") return { key: "quote", target: "quote" as const, label: "Quote references", pattern: quotePattern }
    if (activeRuleKey === "customer") return { key: "customer", target: "customer" as const, label: "Customer references", pattern: customerPattern }
    if (activeRuleKey?.startsWith("booking:")) {
      const key = activeRuleKey.slice("booking:".length)
      const item = bookingPatterns.find((booking) => booking.key === key)
      if (item) return { key: activeRuleKey, target: "booking" as const, label: item.label, pattern: item.pattern }
    }
    return null
  }, [activeRuleKey, bookingPatterns, customerPattern, quotePattern])

  const openRuleComposer = (key: string) => {
    setActiveRuleKey((current) => current === key ? null : key)
    setRulePrompt("")
    setRuleDraft(null)
    setRuleError(null)
    setRuleProgress("idle")
  }

  const applyReferencePattern = (rule: NonNullable<typeof activeRule>, pattern: string) => {
    if (rule.target === "quote") setQuotePattern(pattern)
    if (rule.target === "customer") setCustomerPattern(pattern)
    if (rule.target === "booking") {
      const key = rule.key.slice("booking:".length)
      setBookingPatterns((current) => current.map((item) => item.key === key ? { ...item, pattern } : item))
    }
  }

  async function draftRule() {
    if (!activeRule || !rulePrompt.trim()) return
    const rule = activeRule
    setDraftingRule(true)
    setRuleProgress("working")
    setRuleDraft(null)
    setRuleError(null)
    setFeedback(null)
    const craftingTimer = window.setTimeout(() => setRuleProgress("crafting"), 420)
    try {
      const request = draftQuoteReferenceRule({
        target: rule.target,
        prompt: rulePrompt,
        currentPattern: rule.pattern,
        companyName,
        locale: language,
      }).then((draft) => ({ draft, requestError: null as unknown })).catch((requestError: unknown) => ({ draft: null, requestError }))
      const [{ draft, requestError }] = await Promise.all([request, new Promise<void>((resolve) => window.setTimeout(resolve, 760))])
      if (requestError) throw requestError
      if (!draft) throw new Error("Dexter could not draft that rule.")
      if (draft.status === "accepted" && draft.pattern) {
        applyReferencePattern(rule, draft.pattern)
        setFeedback("Reference recipe updated. Save to apply it.")
        setActiveRuleKey(null)
        setRulePrompt("")
        setRuleDraft(null)
      } else {
        setRuleDraft(draft)
      }
    } catch (draftError) {
      setRuleError(draftError instanceof Error ? draftError.message : "Dexter could not draft that rule.")
    } finally {
      window.clearTimeout(craftingTimer)
      setRuleProgress("idle")
      setDraftingRule(false)
    }
  }

  const setCounter = (key: string, value: string, pattern: string) => {
    const next = parseReferenceCounter(value, pattern)
    if (key === "quote") setQuoteNextNumber(next)
    else if (key === "customer") setCustomerNextNumber(next)
    else {
      const bookingKey = key.slice("booking:".length)
      setBookingPatterns((current) => current.map((item) => item.key === bookingKey ? { ...item, nextNumber: next } : item))
    }
  }

  const renderRuleRow = ({
    counterKey,
    title,
    target,
    pattern,
    defaultPattern,
    nextNumber,
    onPatternChange,
    onPatternBlur,
  }: {
    counterKey: string
    title: string
    target: ReferenceRuleTarget
    pattern: string
    defaultPattern: string
    nextNumber: number
    onPatternChange: (value: string) => void
    onPatternBlur: () => void
  }) => {
    const unlocked = unlockedCounters.has(counterKey)
    const expanded = activeRuleKey === counterKey
    const preview = referencePreview(pattern, nextNumber, companyName)
    const patternError = referencePatternError(pattern, target, companyName)
    const recipeChunks = referenceRecipeChunks(pattern)
    const motionTransition = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }
    const tokenLabel = (chunk: Extract<ReferenceRecipeChunk, { kind: "token" }>) => {
      if (chunk.token === "NUMBER") return chunk.width && chunk.width > 1 ? `${chunk.width} ${t("digit number")}` : t("Number")
      if (chunk.token === "LETTERS") return chunk.width && chunk.width > 1 ? `${chunk.width} ${t("letter sequence")}` : t("Letters")
      if (chunk.token === "COMPANY") return chunk.width ? `${t("Company")} · ${t("first")} ${chunk.width}` : t("Company")
      return chunk.width ? `${t("Multideck")} · ${t("first")} ${chunk.width}` : t("Multideck")
    }
    const restoreDefault = () => {
      onPatternChange(defaultPattern)
      setRuleDraft(null)
      setRuleError(null)
      setFeedback("Default recipe restored. Save to apply it.")
    }
    const counterTokenMenu = (chunk: Extract<ReferenceRecipeChunk, { kind: "token" }>) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="md-dexter-mention m-0 h-[23px] cursor-pointer border-0 text-[11px] outline-none transition-[background-color,box-shadow,color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.96] motion-reduce:active:scale-100"
            aria-label={`${tokenLabel(chunk)} · ${t("Change format")}`}
          >
            {tokenLabel(chunk)}
            <ChevronDown className="size-3 text-[var(--md-subtle)]" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-[232px] p-1.5">
          <DropdownMenuLabel>{t("Sequence format")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={`${chunk.token}:${chunk.width ?? 1}`}
            onValueChange={(value) => {
              const [token, widthValue] = value.split(":")
              if ((token !== "NUMBER" && token !== "LETTERS") || !["4", "5", "6", "7"].includes(widthValue)) return
              onPatternChange(setReferenceCounterFormat(pattern, token, Number(widthValue) as 4 | 5 | 6 | 7))
              setFeedback(null)
            }}
          >
            {([
              { token: "NUMBER", width: 4, badge: "123", label: "4 digits" },
              { token: "NUMBER", width: 5, badge: "123", label: "5 digits" },
              { token: "NUMBER", width: 6, badge: "123", label: "6 digits" },
              { token: "NUMBER", width: 7, badge: "123", label: "7 digits" },
              { token: "LETTERS", width: 4, badge: "ABC", label: "4 letters" },
              { token: "LETTERS", width: 5, badge: "ABC", label: "5 letters" },
              { token: "LETTERS", width: 6, badge: "ABC", label: "6 letters" },
              { token: "LETTERS", width: 7, badge: "ABC", label: "7 letters" },
            ] as const).map((option) => {
              const nextPattern = setReferenceCounterFormat(pattern, option.token, option.width)
              return (
                <DropdownMenuRadioItem key={`${option.token}:${option.width}`} value={`${option.token}:${option.width}`} disabled={Boolean(referencePatternError(nextPattern, target, companyName))}>
                  <span className="inline-flex min-w-10 justify-center rounded-[7px] bg-[var(--md-mention-bg)] px-1.5 text-[11px] font-medium text-[var(--md-mention-text)] shadow-[inset_0_0_0_1px_var(--md-mention-stroke)]" dir="ltr">{option.badge}</span>
                  <span>{t(option.label)}</span>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
          {target === "customer" ? <p className="px-2 pb-1 pt-1.5 text-[10px] leading-[1.4] text-[var(--md-subtle)]">{t("Customer references must stay within 8 characters.")}</p> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
    const renderLiteralChunk = (chunk: Extract<ReferenceRecipeChunk, { kind: "literal" }>, index: number) => {
      return (
        <input
          key={`literal-${index}`}
          value={chunk.value}
          onChange={(event) => onPatternChange(replaceReferenceRecipeLiteral(pattern, chunk, event.target.value))}
          onBlur={onPatternBlur}
          aria-label={t("Reference text")}
          data-reference-literal={counterKey}
          className="md-dexter-mention m-0 h-[23px] min-w-7 border-0 font-medium outline-none focus:ring-[3px] focus:ring-[var(--md-accent-a14)]"
          style={{ width: `${Math.max(28, Math.min(184, (chunk.value.length * 7) + 16))}px` }}
          spellCheck={false}
        />
      )
    }
    return (
      <motion.div layout={!reduceMotion} className="grid gap-x-3 gap-y-3 border-t border-[var(--md-hairline)] py-4 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[190px_minmax(0,1fr)_136px_118px] md:items-start">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t(title)}</h3>
          <span className="mt-2 inline-flex rounded-[7px] bg-[var(--md-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--md-text)]" dir="ltr">{preview}</span>
        </div>
        <motion.div layout={!reduceMotion} transition={motionTransition} className="min-w-0 md:col-span-3">
          <div className={cn(
            "relative overflow-hidden",
            expanded ? "h-10 md:h-[62px]" : "h-[188px] md:h-[62px]",
            !expanded && (patternError || unlocked) && "h-[232px] md:h-[84px]",
          )}>
          <AnimatePresence initial={false}>
            {!expanded ? (
              <motion.div
                key="reference-fields"
                className="absolute inset-x-0 top-0 grid gap-3 md:grid-cols-[minmax(0,1fr)_136px_118px]"
                initial={{ opacity: 0, y: reduceMotion ? 0 : -18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -48 }}
                transition={motionTransition}
              >
                <div className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">
                  <span className="flex h-4 items-center justify-between gap-2">
                    <span>{t("Reference recipe")}</span>
                    <Button type="button" size="xs" variant="ghost" className="-my-1 -me-1 font-normal text-[var(--md-subtle)]" onClick={restoreDefault}>
                      <RotateCcw className="size-3" data-icon="inline-start" aria-hidden="true" />
                      {t("Restore default")}
                    </Button>
                  </span>
                  <span
                    className="flex h-10 min-w-0 flex-wrap items-center gap-1.5 rounded-lg bg-[var(--md-surface-tint)] px-2.5 py-1.5 text-[13px] shadow-[var(--md-shadow-line)] focus-within:ring-[3px] focus-within:ring-[var(--md-accent-a14)]"
                    dir="ltr"
                    role="group"
                    aria-label={t("Reference recipe")}
                    aria-invalid={Boolean(patternError)}
                  >
                    {recipeChunks.map((chunk, index) => chunk.kind === "literal" ? renderLiteralChunk(chunk, index) : chunk.token === "NUMBER" || chunk.token === "LETTERS" ? (
                      <span key={`token-${index}`}>{counterTokenMenu(chunk)}</span>
                    ) : (
                      <span key={`token-${index}`} className="md-dexter-mention m-0 h-[23px] text-[11px]">
                        {tokenLabel(chunk)}
                      </span>
                    ))}
                  </span>
                  {patternError ? <span className="font-normal text-[var(--md-red)]" role="status">{t(patternError)}</span> : null}
                </div>
                <label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">
                  <span>{t("Next value")}</span>
                  <span className="relative block">
                    <Input
                      value={formatReferenceCounter(nextNumber, pattern)}
                      inputMode={referenceCounterType(pattern) === "NUMBER" ? "numeric" : "text"}
                      dir="ltr"
                      readOnly={!unlocked}
                      onClick={() => { if (!unlocked) setCounterUnlock({ key: counterKey, label: title }) }}
                      onKeyDown={(event) => {
                        if (!unlocked && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault()
                          setCounterUnlock({ key: counterKey, label: title })
                        }
                      }}
                      onChange={(event) => setCounter(counterKey, event.target.value, pattern)}
                      className="h-10 rounded-lg pe-8 tabular-nums"
                      aria-label={t("Next value")}
                      aria-readonly={!unlocked}
                    />
                    {!unlocked ? (
                      <span className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-[var(--md-subtle)]" aria-hidden="true">
                        <HugeiconsIcon icon={LockKeyholeIcon} size={15} strokeWidth={1.5} />
                      </span>
                    ) : null}
                  </span>
                  {unlocked ? <span className="font-normal text-[var(--md-subtle)]">{t("Unlocked until saved")}</span> : null}
                </label>
              </motion.div>
            ) : null}
          </AnimatePresence>
            <AiPromptMorph
            id={`reference-rule-prompt-${counterKey}`}
            open={expanded}
            value={rulePrompt}
            busy={draftingRule}
            busyLabel={draftingRule ? t(ruleProgress === "crafting" ? "Crafting rule…" : "Working…") : null}
            placeholder={t("Describe the reference you want…")}
            triggerLabel={`${t("Custom rule")} · ${t(title)}`}
            showTriggerLabel
            inputLabel={`${t("Custom rule")} · ${t(title)}`}
            closeLabel={t("Cancel")}
            submitLabel={t("Create rule")}
            submitDisabled={!rulePrompt.trim()}
            className="absolute inset-x-0 bottom-0 max-w-none md:bottom-auto md:top-[22px]"
            onOpenChange={(open) => { if (open) openRuleComposer(counterKey); else setActiveRuleKey(null) }}
            onValueChange={setRulePrompt}
            onSubmit={() => void draftRule()}
            />
          </div>
          <AnimatePresence initial={false}>
            {expanded && (ruleError || ruleDraft) ? (
              <motion.div initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={motionTransition} className="mt-2 border-s-2 border-[var(--md-red)] ps-3">
                {ruleError ? <p className="text-[12px] text-[var(--md-red)]" role="alert">{ruleError}</p> : null}
                {ruleDraft ? <div role="status"><p className="text-[12px] font-medium text-[var(--md-ink)]">{ruleDraft.summary || t("Dexter refused this rule")}</p>{ruleDraft.message ? <p className="mt-1 text-[11px] leading-[1.45] text-[var(--md-text)]">{ruleDraft.message}</p> : null}</div> : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    )
  }

  const header = <SettingsPageHeader title={t("System Preferences")} description={t("Choose how Multideck names new records. Existing references stay unchanged.")} descriptionPlacement="under-title" />
  if (loading) return <div className="px-[var(--md-page-pad)] py-[var(--md-page-pad)]"><div className="mx-auto max-w-[760px]">{header}<p className="mt-8 text-[13px] text-[var(--md-text)]" role="status">{t("Loading system preferences…")}</p></div></div>

  return (
    <div className="min-w-0 px-[var(--md-page-pad)] py-[var(--md-page-pad)]">
      <div className="mx-auto max-w-[960px] space-y-5 pb-[var(--md-page-bottom-pad)]">
        {header}
        <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Quote documents")}</h2>
              <p className="mt-1 max-w-[62ch] text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t("Upload the company logo used on customer quote PDFs. The original stays private inside this workspace.")}</p>
            </div>
            <Button type="button" variant="outline" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
              {uploadingLogo ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImageUp className="size-4" aria-hidden="true" />}
              {t(uploadingLogo ? "Uploading logo…" : branding?.hasLogo ? "Replace company logo" : "Upload company logo")}
            </Button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("Upload company logo")}
              onChange={(event) => void uploadLogo(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="mt-4 flex min-h-24 items-center gap-4 rounded-[calc(var(--md-radius-xl)-5px)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[var(--md-radius-lg)] bg-white shadow-[var(--md-shadow-line)]">
              {branding?.logoUrl ? <img src={branding.logoUrl} alt={t("Company logo preview")} className="size-full object-contain p-2" /> : <Image className="size-5 text-[var(--md-subtle)]" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{branding?.displayName || companyName}</p>
              <p className="mt-1 text-[11px] leading-4 text-[var(--md-subtle)]">{t("Shown on generated quote PDFs · PNG, JPEG or WebP · Up to 5 MB")}</p>
            </div>
          </div>
          {brandingError ? <p className="mt-3 text-[12px] text-[var(--md-red)]" role="alert">{t(brandingError)}</p> : null}
          {brandingFeedback ? <p className="mt-3 text-[12px] text-[var(--md-green)]" role="status">{t(brandingFeedback)}</p> : null}
        </section>
        <motion.section layout={!reduceMotion} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
          <div className="border-b border-[var(--md-hairline)] pb-4">
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Reference rules")}</h2>
          </div>

          <div className="py-4">
            {renderRuleRow({
              counterKey: "quote", title: "Quote references",
              target: "quote", pattern: quotePattern, defaultPattern: "JQ{NUMBER:4}", nextNumber: quoteNextNumber,
              onPatternChange: setQuotePattern, onPatternBlur: normaliseQuotePattern,
            })}
            {renderRuleRow({
              counterKey: "customer", title: "Customer references",
              target: "customer", pattern: customerPattern, defaultPattern: "CUS{NUMBER:4}", nextNumber: customerNextNumber,
              onPatternChange: setCustomerPattern,
              onPatternBlur: () => { const normalized = normaliseReferencePatternInput(customerPattern); setCustomerPattern(normalized.pattern); if (normalized.nextNumber !== null) setCustomerNextNumber(Math.max(1, normalized.nextNumber)) },
            })}
            {bookingPatterns.map((item, index) => (
              <div key={item.key}>
                {renderRuleRow({
                  counterKey: `booking:${item.key}`, title: index === 0 ? "Booking references" : item.label || "Booking references",
                  target: "booking", pattern: item.pattern, defaultPattern: "B-{NUMBER:4}", nextNumber: item.nextNumber,
                  onPatternChange: (value) => updateBookingPattern(index, { pattern: value }),
                  onPatternBlur: () => normaliseBookingPattern(index),
                })}
              </div>
            ))}
          </div>

          {error ? <p className="mt-4 text-[12px] text-[var(--md-red)]" role="alert">{t(error)}</p> : null}
          {feedback ? <p className="mt-4 text-[12px] text-[var(--md-green)]" role="status">{t(feedback)}</p> : null}
          <div className="mt-5 flex justify-end border-t border-[var(--md-hairline)] pt-4">
            <Button type="button" disabled={saving || !quotePattern || !customerPattern || bookingPatterns.length === 0} onClick={() => void save()}>{t(saving ? "Saving…" : "Save reference rules")}</Button>
          </div>
        </motion.section>
      </div>

      <Dialog open={Boolean(counterUnlock)} onOpenChange={(open) => { if (!open) setCounterUnlock(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Change the next value?")}</DialogTitle>
            <DialogDescription>{t("Moving the sequence backwards may meet a reference that already exists. Multideck will skip reserved references, but you should only change this when correcting a sequence.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("Keep locked")}</Button></DialogClose>
            <Button type="button" onClick={() => { if (counterUnlock) setUnlockedCounters((current) => new Set(current).add(counterUnlock.key)); setCounterUnlock(null) }}>{t("Unlock value")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
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
