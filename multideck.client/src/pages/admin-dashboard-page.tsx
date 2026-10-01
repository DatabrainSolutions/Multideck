import { DashboardEmptyState, type DashboardEmptyKind } from "@/components/multideck/dashboard-empty-state"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowRight, RefreshCw } from "@/components/icons/hugeicons"
import { CrmPanel } from "@/components/multideck/crm-dashboard"
import {
  CohortJourney,
  LossReasonMap,
  UsageCalendar,
} from "@/components/multideck/dashboard-analytics-charts"
import { StaticBloomShader } from "@/components/multideck/dexter-action-pill"
import { DashboardWorldMap } from "@/components/multideck/dashboard-world-map"
import { DashboardModeChart } from "@/components/multideck/dashboard-mode-chart"
import { DashboardInsightCard, QuoteDecisionBreakdown } from "@/components/multideck/dashboard-insight-card"
import { MultideckDateRangePicker, type MultideckDateRange } from "@/components/multideck/date-picker"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { Surface } from "@/components/multideck/surface"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { accentCssText, buildAccentRamp } from "@/lib/accent-theme"
import { useLanguage } from "@/i18n/language-provider"
import {
  adminReportingPeriod,
  getAdminDashboard,
  type AdminDashboardData,
} from "@/lib/admin-dashboard-api"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { getDexterUsage, type DexterUsage } from "@/lib/dexter-api"

const adminShaderStops = buildAccentRamp("teal").brand.shader
const adminBrandCss = accentCssText("teal")
  .replaceAll(":root.dark", ".dark .md-admin-dashboard")
  .replaceAll(":root", ".md-admin-dashboard")

const views = ["Overview", "Growth", "Usage & AI", "System health"] as const
type View = (typeof views)[number]
const modeNames: Record<string, string> = {
  air: "Air",
  sea: "Sea",
  road: "Road",
  rail: "Rail",
  courier: "Courier",
  multimodal: "Multimodal",
  warehouse: "Warehouse",
  unassigned: "No mode set",
}
const flowNames: Record<string, string> = {
  lead_create: "Create lead",
  lead_convert: "Convert lead",
  quote_create: "Create quote",
  quote_send: "Send quote",
  booking_create: "Create booking",
}
const purposeNames: Record<string, string> = {
  dexter_chat: "Dexter chat",
  inbox_document_extraction: "Inbox document extraction",
  document_ocr: "Document OCR",
  tenant_brand_import: "Brand import",
  dexter_voice: "Dexter voice",
  invoice_ocr: "Invoice OCR",
  email_compose: "Email writing",
  email_refine: "Email editing",
  quote_intelligence: "Quote analysis",
  reference_rule: "Reference rules",
  crm_sales_insights: "Sales insights",
  developer_broadcast: "Developer broadcast",
  writing_profile: "Writing profile",
  finance_matching: "Finance matching",
}
const palette = [
  "var(--md-accent)",
  "var(--md-blue)",
  "var(--md-amber)",
  "var(--md-green)",
  "var(--md-subtle)",
]

function Ranking({
  rows,
  format,
  onOpen,
  total,
}: {
  total?: number
  rows: { key: string; label: string; value: number; sub?: string }[]
  format: (n: number) => string
  onOpen?: (key: string) => void
}) {
  const { t } = useLanguage()
  if (!rows.length)
    return (
      <p className="md-analytics-empty">{t("No activity in this period")}</p>
    )
  return (
    <div className="md-admin-ranking">
      {rows.map((row, i) => {
        const content = (
          <>
            <span className="md-admin-rank">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="md-admin-rank-copy">
              <span dir="auto">{row.label}</span>
              {row.sub ? <small>{row.sub}</small> : null}
            </span>
            {total !== undefined ? (
              <span className="md-admin-customer-share">
                <span aria-hidden="true"><i style={{ width: `${total > 0 ? Math.min(100, row.value / total * 100) : 0}%` }} /></span>
                <small>{total > 0 ? `${Math.round(row.value / total * 100)}%` : "—"}</small>
              </span>
            ) : null}
            <strong>{format(row.value)}</strong>
            {onOpen ? (
              <ArrowRight className="size-3.5" aria-hidden="true" />
            ) : null}
          </>
        )
        return onOpen ? (
          <button
            type="button"
            key={row.key}
            className="md-admin-rank-row"
            onClick={() => onOpen(row.key)}
          >
            {content}
          </button>
        ) : (
          <div key={row.key} className="md-admin-rank-row">
            {content}
          </div>
        )
      })}
    </div>
  )
}

function Metric({
  label,
  value,
  detail,
  empty,
}: {
  label: string
  value: string
  detail?: string
  empty?: { kind: DashboardEmptyKind; title: string }
}) {
  return (
    <div className="md-admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
      {empty ? <DashboardEmptyState {...empty} compact /> : null}
    </div>
  )
}

export function AdminDashboardPage({
  load = getAdminDashboard,
  loadAllowance = getDexterUsage,
  navigate = (path: string) => {
    window.location.assign(path)
  },
}: {
  load?: typeof getAdminDashboard
  loadAllowance?: typeof getDexterUsage
  navigate?: (path: string) => void
} = {}) {
  const { language, t } = useLanguage()
  const [view, setView] = useState<View>("Overview")
  const [period, setPeriod] = useState("30")
  const [custom, setCustom] = useState<MultideckDateRange>(() => {
    const range = adminReportingPeriod(30)
    return { start: range.from, end: range.to }
  })
  const [appliedCustom, setAppliedCustom] = useState(() => adminReportingPeriod(30))
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [error, setError] = useState<{
    message: string
    status?: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [currency, setCurrency] = useState<string | null>(null)
  const [sortUsers, setSortUsers] = useState("active")
  const [allowance, setAllowance] = useState<DexterUsage | null>(null)
  const [allowanceError, setAllowanceError] = useState<string | null>(null)
  const [allowanceRevision, setAllowanceRevision] = useState(0)
  const window_ = useMemo(
    () =>
      period === "custom"
        ? appliedCustom
        : adminReportingPeriod(Number(period)),
    [period, appliedCustom, revision],
  )
  const integer = (n: number) =>
    n.toLocaleString(language, { maximumFractionDigits: 0 })
  const activeDays = (n: number) =>
    `${integer(n)} ${t(n === 1 ? "active day" : "active days")}`
  const hours = (n: number) =>
    `${(n / 3600).toLocaleString(language, { maximumFractionDigits: 1 })}h`
  const percent = (n: number, d: number) =>
    d ? `${Math.round((n / d) * 100)}%` : "—"
  const date = (v: string) =>
    new Date(`${v}T00:00:00Z`).toLocaleDateString(language, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
  const displayedPeriod = data?.period ?? window_
  const periodLabel = `${date(displayedPeriod.from)} – ${date(displayedPeriod.to)}`
  const money = (n: number, code: string) =>
    n.toLocaleString(language, {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(code) ? code : "GBP",
      maximumFractionDigits: 0,
    })
  useEffect(() => {
    document.title = `${t("Admin dashboard")} · Multideck`
  }, [t])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    load(window_, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (cause?.status === 401 || cause?.status === 403) setData(null)
          setError({
            message:
              cause instanceof Error
                ? cause.message
                : "Workspace analytics could not be loaded.",
            status: cause?.status,
          })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [window_, load])
  useEffect(() => {
    if (view !== "Usage & AI") return
    let current = true
    setAllowance(null)
    setAllowanceError(null)
    loadAllowance()
      .then((result) => {
        if (current) setAllowance(result)
      })
      .catch((cause) => {
        if (current)
          setAllowanceError(
            cause instanceof Error
              ? cause.message
              : "The billing allowance is unavailable.",
          )
      })
    return () => {
      current = false
    }
  }, [view, loadAllowance, allowanceRevision])
  const lastCompleteDay = adminReportingPeriod(1).to
  const customEndLimit = custom.start && !custom.end
    ? new Date(Math.min(Date.parse(lastCompleteDay), Date.parse(custom.start) + 365 * 86_400_000)).toISOString().slice(0, 10)
    : lastCompleteDay
  const customStartLimit = custom.start && !custom.end
    ? new Date(Date.parse(custom.start) - 365 * 86_400_000).toISOString().slice(0, 10)
    : undefined
  const activePrice =
    data?.prices.find((p) => p.currency === currency) ?? data?.prices[0]
  const users = [...(data?.users ?? [])].sort((a, b) =>
    sortUsers === "ai"
      ? b.aiRequests - a.aiRequests
      : b.activeSeconds - a.activeSeconds,
  )
  const mostActiveUsers = [...(data?.users ?? [])].sort(
    (a, b) => b.activeSeconds - a.activeSeconds,
  )
  const kpis: DashboardKpi[] = data
    ? ([
        {
          label: t("New leads"),
          value: data.permissions.crm ? integer(data.summary.leads) : "—",
          detail: t(
            data.permissions.crm ? "" : "CRM access required",
          ),
          tone: "neutral",
        },
        {
          label: t("New customers"),
          value: data.permissions.customers
            ? integer(data.summary.customers)
            : "—",
          detail: t(
            data.permissions.customers
              ? ""
              : "Customer access required",
          ),
          tone: "neutral",
        },
        {
          label: t("Repeat customers"),
          value: data.permissions.bookings
            ? integer(data.summary.repeatCustomers)
            : "—",
          detail: t(
            data.permissions.bookings
              ? "Booked before this period"
              : "Booking access required",
          ),
          tone: "neutral",
        },
        {
          label: t("Bookings placed"),
          value: data.permissions.bookings
            ? integer(data.summary.bookings)
            : "—",
          detail: t(
            data.permissions.bookings
              ? "Excludes provisional and cancelled"
              : "Booking access required",
          ),
          tone: "teal",
        },
        {
          label: t("Quote win rate"),
          value: data.permissions.quotes
            ? percent(
                data.summary.wonQuotes,
                data.summary.wonQuotes + data.summary.lostQuotes,
              )
            : "—",
          detail: data.permissions.quotes
            ? `${integer(data.summary.wonQuotes + data.summary.lostQuotes)} ${t(data.summary.wonQuotes + data.summary.lostQuotes === 1 ? "recorded decision" : "recorded decisions")}`
            : t("Quote access required"),
          tone: "green",
        },
        {
          label: t("Active users"),
          value: integer(data.summary.activeUsers),
          detail: t("With recorded active time"),
          tone: "neutral",
        },
      ].map((kpi, i) => {
        const keys = [
          "leads",
          "customers",
          "repeatCustomers",
          "bookings",
          null,
          "activeUsers",
        ] as const
        const key = keys[i]
        if (
          !key ||
          kpi.value === "—" ||
          (key === "activeUsers" && !data.coverage.previousUsageComplete)
        )
          return kpi
        const now = data.summary[key],
          before = data.previous[key]
        return before > 0 && now !== before
          ? {
              ...kpi,
              delta: {
                direction: now > before ? ("up" as const) : ("down" as const),
                text: `${now > before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%`,
                caption: `${t("vs previous")} ${Math.round((Date.parse(window_.to) - Date.parse(window_.from)) / 86_400_000) + 1} ${t("days")}`,
              },
            }
          : kpi
      }) as DashboardKpi[])
    : []

  const dailyTrend = (key: "leads" | "customers" | "bookings" | "activeSeconds") =>
    (data?.trend ?? []).map(day => ({
      label: new Date(`${day.day}T00:00:00Z`).toLocaleDateString(language, {
        day: "numeric", month: "short", timeZone: "UTC",
      }),
      value: key === "activeSeconds" ? day[key] / 60 : day[key],
      measured: key !== "activeSeconds" || Boolean(data?.coverage.trackingStartedAt
        && day.day >= data.coverage.trackingStartedAt.slice(0, 10)
        && (!data.coverage.usageRetainedFrom || day.day >= data.coverage.usageRetainedFrom)),
    }))
  const insights = data ? [
    { route: "/crm/leads", trend: dailyTrend("leads"), trendLabel: t("Daily leads") },
    { route: "/crm/accounts?view=customers", trend: dailyTrend("customers"), trendLabel: t("Daily customers") },
    { route: "/crm/accounts?view=customers", segments: [
      { label: t("Repeat"), value: data.summary.repeatCustomers, color: "var(--md-accent)" },
      { label: t("First-time"), value: Math.max(0, data.summary.bookingCustomers - data.summary.repeatCustomers), color: "var(--md-line-strong, var(--md-line))" },
    ] },
    { route: "/bookings", trend: dailyTrend("bookings"), trendLabel: t("Daily bookings") },
    { route: "/quotes", segments: [
      { label: t("Accepted"), value: data.summary.wonQuotes, color: "var(--md-accent)" },
      { label: t("Lost"), value: data.summary.lostQuotes, color: "var(--md-amber)" },
    ] },
    { route: "/admin/activity", trend: dailyTrend("activeSeconds"), trendLabel: t("Active minutes per day") },
  ] : []

  const growthReadings: { text: string; source: string; label: string }[] = []
  if (data?.permissions.crm) {
    growthReadings.push({
      text: data.leadFunnel.overdueFollowUps > 0
        ? `${integer(data.leadFunnel.overdueFollowUps)} ${t("open leads have overdue follow-ups. Review the current queue before adding more outreach.")}`
        : data.leadFunnel.created > 0
          ? `${integer(data.leadFunnel.converted)} ${t("of")} ${integer(data.leadFunnel.created)} ${t("leads created in this period have converted to deals.")}`
          : t("No new leads were recorded in this period. Existing customer activity is measured separately."),
      source: "#admin-growth-leads", label: t("Lead conversion"),
    })
  }
  if (data?.permissions.quotes) {
    const awaiting = Math.max(0, data.quoteFunnel.sent - data.quoteFunnel.responded)
    growthReadings.push({
      text: data.quoteFunnel.responded > data.quoteFunnel.sent
        ? t("The quote stage counts need review before drawing a conversion conclusion.")
        : data.quoteFunnel.sent > 0
        ? `${integer(awaiting)} ${t("of")} ${integer(data.quoteFunnel.sent)} ${t("quotes first sent in this period have no recorded customer decision yet.")}`
        : t("No quotes were first sent in this period. Accepted prices can still include quotes sent earlier."),
      source: "#admin-growth-quotes", label: t("Quote conversion"),
    })
  }
  if (data?.permissions.customers && data.permissions.bookings && data.customers[0] && data.summary.bookings > 0) {
    const customer = data.customers[0]
    growthReadings.push({ text: `${customer.name} ${t("accounts for")} ${percent(customer.bookings, data.summary.bookings)} ${t("of bookings placed in this period")} (${integer(customer.bookings)} ${t("of")} ${integer(data.summary.bookings)}).`, source: "#admin-growth-customers", label: t("Top customers") })
  }
  const emptyPanels: Record<string, { kind: DashboardEmptyKind; title: string; detail?: string } | undefined> = {}
  if (data) {
    const empty = (name: string, missing: boolean, kind: DashboardEmptyKind, title: string, detail = "Try a wider date range to see earlier activity.") => {
      if (missing) emptyPanels[name] = { kind, title, detail }
    }
    empty("Booking destinations", data.permissions.bookings && !data.countries.some(country => country.count > 0), "map", "No booking destinations in this period")
    empty("Top customers", !data.customers.length, "customers", "No customer bookings in this period")
    empty("Shipping modes", !data.modes.some(mode => mode.count > 0), "shipping", "No bookings placed in this period")
    empty("Quote decisions", data.summary.wonQuotes + data.summary.lostQuotes === 0, "quotes", "No quote decisions recorded")
    empty("Most active users", !mostActiveUsers.some(user => user.activeSeconds > 0), "activity", "No active time recorded")
    empty("Lead conversion", data.leadFunnel.created === 0, "leads", "No leads created in this period")
    empty("Lead follow-up", data.leadFunnel.created === 0 && data.leadFunnel.overdueFollowUps === 0 && data.leadFunnel.responseHours === null, "followup", "No lead follow-up activity", "No overdue follow-ups. Response time will appear once a new lead receives a recorded response.")
    empty("Quote conversion", data.quoteFunnel.sent === 0, "pipeline", "No quotes sent in this period")
    empty("Accepted quote value", !activePrice, "money", "No priced accepted quotes", "Saved prices will appear here when an accepted quote has a complete price.")
    empty("Price coverage", data.summary.wonQuotes === 0, "coverage", "No accepted quotes in this period")
    empty("Quote loss reasons", !data.lossReasons.some(reason => reason.count > 0), "losses", "No recorded quote losses")
    empty("Customer continuity", data.summary.bookingCustomers === 0, "continuity", "No customer bookings in this period")
    empty("Workflow completion", !data.workflows.some(flow => flow.started > 0), "workflow", "No workflow attempts recorded", "Recorded lead, quote and booking workflows will appear here.")
    empty("Workspace rhythm", !data.trend.some(day => day.activeSeconds + day.idleSeconds > 0), "activity", "No workspace activity recorded", "Activity appears after colleagues use Multideck with tracking enabled.")
    empty("Time in Multideck", !data.trend.some(day => day.activeSeconds + day.idleSeconds > 0), "activity", "No time recorded in this period")
    empty("Users", !users.some(user => user.activeSeconds + user.idleSeconds + user.aiRequests > 0), "customers", "No measured user activity")
    empty("Module adoption", !data.modules.some(module => module.activeSeconds + module.idleSeconds > 0), "modules", "No module activity recorded")
    empty("AI activity", data.ai.requests === 0, "ai", "No successful AI requests recorded", "Recorded requests will appear here after Dexter is used.")
    empty("AI cost and reliability", data.ai.requests + data.ai.failed === 0, "ai", "No AI requests recorded", "Cost and reliability will appear once requests are recorded.")
    empty("Needs attention", (data.permissions.crm ? data.leadFunnel.overdueFollowUps : 0) + (data.permissions.documents ? data.system.failedDocuments : 0) + (data.permissions.finance ? data.system.blockedAccounting : 0) + data.ai.failed === 0, "system", "Nothing needs attention", "No overdue follow-ups, blocked exports or recorded failures within your access.")
    empty("Data coverage", (data.permissions.bookings || data.permissions.quotes) && data.summary.bookings + data.summary.wonQuotes + data.summary.lostQuotes + data.coverage.undatedQuoteOutcomes === 0, "coverage", "No records to assess yet", "Data coverage will appear as bookings and quote outcomes are recorded.")
  }
  const panel = (
    title: string,
    children: ReactNode,
    meta?: string,
    action?: ReactNode,
  ) => (
    <CrmPanel title={t(title)} meta={meta} action={action} className={`md-admin-panel md-admin-panel--${title.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}>
      <div className="md-admin-panel-body" data-panel={title} tabIndex={0} role="region" aria-label={`${t(title)} ${t("details")}`}>
        {emptyPanels[title] ? <DashboardEmptyState {...emptyPanels[title]!} /> : children}
      </div>
    </CrmPanel>
  )
  const coverage = data ? (
    <p className="md-admin-caption">
      {data.coverage.estimatedBookingDates
        ? `${integer(data.coverage.estimatedBookingDates)} ${t("historical booking dates use creation-date estimates.")} `
        : ""}
      {data.coverage.undatedQuoteOutcomes
        ? `${integer(data.coverage.undatedQuoteOutcomes)} ${t("quote outcomes have no recorded date and are excluded from period totals.")} `
        : ""}
      {t("Usage and workflow attempts are measured from")}{" "}
      {data.coverage.trackingStartedAt
        ? new Date(data.coverage.trackingStartedAt).toLocaleDateString(language)
        : t("the first recorded session")}
      {". "}
    </p>
  ) : null
  const customerPanel =
    data &&
    data.permissions.customers &&
    data.permissions.bookings &&
    panel(
      "Top customers",
      <Ranking
        rows={data.customers.map((c) => ({
          key: c.id,
          label: c.name,
          value: c.bookings,
        }))}
        format={integer}
        onOpen={(id) => {
          const c = data.customers.find((c) => c.id === id)
          if (c) navigate(c.route)
        }}
      />,
      t("Bookings placed"),
    )
  const usagePanel =
    data &&
    panel(
      "Most active users",
      <Ranking
        rows={mostActiveUsers.slice(0, 8).map((u) => ({
          key: u.id,
          label: u.name,
          value: u.activeSeconds,
          sub: `${activeDays(u.days)} · ${hours(u.idleSeconds)} ${t("idle")}`,
        }))}
        format={hours}
      />,
      t("Estimated active time"),
    )
  const attentionPanel =
    data &&
    panel(
      "Needs attention",
      <div className="md-admin-attention">
        {[
          ...(data.permissions.crm
            ? [
                {
                  label: "Overdue lead follow-ups",
                  value: data.leadFunnel.overdueFollowUps,
                  route: "/crm/leads",
                  detail: "Current open leads",
                },
              ]
            : []),
          ...(data.permissions.documents
            ? [
                {
                  label: "Failed document renders",
                  value: data.system.failedDocuments,
                  route: "/documents",
                  detail: "In the selected period",
                },
              ]
            : []),
          ...(data.permissions.finance
            ? [
                {
                  label: "Blocked accounting exports",
                  value: data.system.blockedAccounting,
                  route: "/finance/systems",
                  detail: "Current queue",
                },
              ]
            : []),
          {
            label: "Failed AI requests",
            value: data.ai.failed,
            route: "/admin/detailed-log",
            detail: "In the selected period",
          },
        ].map((item) => (
          <button
            type="button"
            key={item.label}
            onClick={() => navigate(item.route)}
          >
            <span>
              <span>{t(item.label)}</span>
              <small>{t(item.detail)}</small>
            </span>
            <strong data-attention={item.value > 0}>
              {integer(item.value)}
            </strong>
            <ArrowRight className="size-3.5" />
          </button>
        ))}
      </div>,
    )
  return (
    <div className="md-admin-dashboard md-kpi-scope" data-view={view}>
      <style>{adminBrandCss}</style>
      <SettingsPageHeader
        title={t("Admin dashboard")}
        descriptionPlacement="under-title"
        actions={
          <>
            <div className="md-admin-range-controls">
              <SegmentedControl
                options={["7", "30", "90"] as const}
                value={period}
                onChange={setPeriod}
                ariaLabel={t("Reporting period")}
                renderOption={value => `${value}D`}
                className="h-9 [&>button]:h-7 [&>button]:px-2.5"
                animated={false}
              />
              <MultideckDateRangePicker
                value={custom}
                onChange={range => {
                  setCustom(range)
                  if (range.start && range.end && range.start <= range.end
                    && range.end <= lastCompleteDay
                    && Date.parse(range.end) - Date.parse(range.start) <= 365 * 86_400_000) {
                    setAppliedCustom({ from: range.start, to: range.end })
                    setPeriod("custom")
                  }
                }}
                onOpenChange={open => {
                  if (open) setCustom({ start: window_.from, end: window_.to })
                }}
                triggerLabel={t("Custom")}
                title="Custom reporting period"
                description="Choose a start and end date, up to one year apart. Today is excluded."
                footerLabel="Reporting dates"
                active={period === "custom"}
                align="end"
                minDate={customStartLimit}
                maxDate={customEndLimit}
                resetValue={{ start: adminReportingPeriod(30).from, end: lastCompleteDay }}
                triggerClassName="h-9 w-auto min-w-0"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("Refresh analytics")}
              disabled={loading}
              onClick={() => setRevision((n) => n + 1)}
            >
              <RefreshCw className="size-4" />
            </Button>
          </>
        }
      />
      <div className="md-admin-toolbar">
        <div
          role="tablist"
          aria-label={t("Dashboard views")}
          className="md-admin-tabs"
        >
          {views.map((v, i) => (
            <button
              id={`admin-tab-${i}`}
              type="button"
              role="tab"
              key={v}
              aria-selected={view === v}
              aria-controls="admin-dashboard-content"
              tabIndex={view === v ? 0 : -1}
              onClick={() => setView(v)}
              onKeyDown={(e) => {
                const index = views.indexOf(view)
                const next =
                  e.key === "ArrowRight"
                    ? (index + 1) % views.length
                    : e.key === "ArrowLeft"
                      ? (index + views.length - 1) % views.length
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? views.length - 1
                          : -1
                if (next >= 0) {
                  e.preventDefault()
                  setView(views[next])
                  document.getElementById(`admin-tab-${next}`)?.focus()
                }
              }}
            >
              {t(v)}
            </button>
          ))}
        </div>
        <p>
          {periodLabel}
          <span>{" "}UTC</span>
        </p>
      </div>
      {loading && !data ? (
        <DotGridLoaderPanel label={t("Loading workspace analytics")} />
      ) : error ? (
        <InlineNotice
          tone="error"
          title={t(
            error.status === 403
              ? "Administrator access required"
              : "Analytics could not be loaded",
          )}
          action={
            error.status === 403 ? undefined : (
              <Button
                variant="secondary"
                onClick={() => setRevision((n) => n + 1)}
              >
                {t("Try again")}
              </Button>
            )
          }
        >
          {error.message}
        </InlineNotice>
      ) : null}
      {data ? (
        <div
          id="admin-dashboard-content"
          role="tabpanel"
          aria-labelledby={`admin-tab-${views.indexOf(view)}`}
          tabIndex={0}
          className="md-admin-content"
          aria-busy={loading}
        >
          {loading ? <span className="md-admin-refresh-status" role="status">{t("Updating report…")}</span> : null}
          {view === "Overview" ? <div className="md-admin-insights">
            {kpis.map((kpi, index) => {
              const { route, ...visual } = insights[index]
              const available = kpi.value !== "—"
              return <DashboardInsightCard
                key={kpi.label}
                kpi={kpi}
                empty={available && [data.summary.leads, data.summary.customers, data.summary.bookingCustomers, data.summary.bookings, data.summary.wonQuotes + data.summary.lostQuotes, data.summary.activeSeconds][index] === 0 ? { kind: (["leads", "customers", "customers", "map", "quotes", "activity"] as DashboardEmptyKind[])[index], title: t("No recorded activity") } : undefined}
                onOpen={available ? () => navigate(route) : undefined}
                {...(available ? visual : {})}
              />
            })}
          </div> : null}
          {view === "Overview" ? (
            <>
              <div className="md-admin-grid md-admin-grid-feature">
                {data.permissions.bookings
                  ? panel(
                      "Booking destinations",
                      <DashboardWorldMap values={data.countries} />,
                    )
                  : panel(
                      "Booking destinations",
                      <p className="md-admin-caption">
                        {t(
                          "Booking access is required to view geographic activity.",
                        )}
                      </p>,
                    )}
                {customerPanel}
              </div>
              <div className="md-admin-grid md-admin-commercial-row">
                {data.permissions.bookings && data.modes.length === 0 ? (
                  panel(
                    "Shipping modes",
                    <p className="md-admin-caption">
                      {t("No bookings placed in this period.")}
                    </p>,
                    t("Daily bookings placed"),
                  )
                ) : data.permissions.bookings ? (
                  <div className="md-admin-chart-frame md-admin-chart-frame--modes"><DashboardModeChart
                    animated={false}
                    title={t("Shipping modes")}
                    subtitle={t(
                      "Daily bookings placed · hover or use arrow keys to inspect",
                    )}
                    labels={data.trend.map((d) =>
                      new Date(`${d.day}T00:00:00Z`).toLocaleDateString(
                        language,
                        { day: "numeric", month: "short", timeZone: "UTC" },
                      ),
                    )}
                    series={[
                      ...data.modes.slice(0, 5).map((m, i) => ({
                        key: m.key,
                        label: `${t(modeNames[m.key] ?? m.key)} · ${integer(m.count)}`,
                        color: palette[i],
                        values: data.trend.map((d) => d.modes[m.key] ?? 0),
                      })),
                      ...(data.modes.length > 5
                        ? [
                            {
                              key: "other",
                              label: t("Other modes"),
                              color: "var(--md-subtle)",
                              values: data.trend.map((d) =>
                                data.modes
                                  .slice(5)
                                  .reduce(
                                    (n, m) => n + (d.modes[m.key] ?? 0),
                                    0,
                                  ),
                              ),
                            },
                          ]
                        : []),
                    ]}
                    height={390}
                  /></div>
                ) : null}
                {data.permissions.quotes ? (
                  <div className="md-admin-quote-column">
                    {panel(
                      "Quote decisions",
                      <QuoteDecisionBreakdown
                        accepted={data.summary.wonQuotes}
                        lost={data.summary.lostQuotes}
                        reasons={data.lossReasons}
                      />,
                      t("Recorded in this period"),
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setView("Growth")}
                      >
                        {t("Explore conversion")}
                        <ArrowRight className="size-3.5" />
                      </Button>,
                    )}
                    <Surface padding="none" className="md-admin-quote-activity" aria-labelledby="admin-quote-activity-title">
                      <div className="md-admin-quote-activity-head">
                        <div>
                        <h2 id="admin-quote-activity-title">{t("Quote pipeline")}</h2>
                        <p>{t("Quotes sent in the selected period")}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => navigate("/quotes")}>
                          {t("View quotes")}
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </div>
                      <div className="md-admin-quote-activity-body">
                        {data.quoteFunnel.sent === 0 ? <DashboardEmptyState kind="pipeline" title="No quotes sent in this period" detail="Try a wider date range to see earlier activity." /> : <>
                      <dl>
                        <div><dt>{t("Sent")}</dt><dd>{integer(data.quoteFunnel.sent)}</dd><p>{t("Sent to customers")}</p></div>
                        <div data-pending={data.summary.pendingQuotes > 0 || undefined}><dt>{t("Awaiting decision")}</dt><dd>{integer(data.summary.pendingQuotes)}</dd><p>{t("No decision recorded")}</p></div>
                        {data.permissions.bookings ? <div><dt>{t("Booked")}</dt><dd>{integer(data.quoteFunnel.booked)}</dd><p>{t("Linked to a booking")}</p></div> : null}
                      </dl>
                        </>}
                      </div>
                    </Surface>
                  </div>
                ) : null}
              </div>
              <div className="md-admin-grid">
                {usagePanel}
                {attentionPanel}
              </div>
            </>
          ) : null}
          {view === "Growth" ? (
            <>
              <div className="md-admin-grid md-admin-growth-pair">
                {data.permissions.crm ? (
                  <div className="md-admin-growth-stack">
                    <div id="admin-growth-leads">
                      {panel("Lead conversion", <CohortJourney
                        stages={[{ label: "Leads created", value: data.leadFunnel.created }, { label: "Converted to a deal", value: data.leadFunnel.converted }]}
                        note={t("Leads created in this period, with outcomes to date.")}
                      />)}
                    </div>
                    {panel("Lead follow-up", <>
                      <div className="md-admin-metrics md-admin-growth-followup">
                        <Metric label={t("Overdue follow-ups")} value={integer(data.leadFunnel.overdueFollowUps)} detail={t("Current open leads · all dates")} />
                        <Metric label={t("Average first response")} value={data.leadFunnel.responseHours === null ? "—" : `${data.leadFunnel.responseHours}h`} detail={t("Leads created in this period with a recorded response")} />
                      </div>
                    </>, undefined, <Button variant="ghost" size="sm" onClick={() => navigate("/crm/leads")}>{t("View leads")}<ArrowRight className="size-3.5" /></Button>)}
                  </div>
                ) : null}
                {data.permissions.quotes ? (
                  <div id="admin-growth-quotes" className="md-admin-growth-conversion">
                    {panel("Quote conversion", <CohortJourney
                      stages={[
                        { label: "Quotes sent", value: data.quoteFunnel.sent },
                        { label: "Customer decision", value: data.quoteFunnel.responded },
                        { label: "Accepted", value: data.quoteFunnel.accepted },
                        ...(data.permissions.bookings ? [{ label: "Booking placed", value: data.quoteFunnel.booked }] : []),
                      ]}
                      note={t(data.permissions.bookings
                        ? "Quotes first sent in this period, with outcomes to date. Unanswered quotes are excluded from decisions."
                        : "Quotes first sent in this period, with outcomes to date. Booking access is required to view booking conversion.")}
                    />)}
                  </div>
                ) : null}
              </div>
              {data.permissions.quotes ? (
                <div className="md-admin-grid md-admin-growth-pair">
                  <div className="md-admin-growth-stack" id="admin-growth-value">
                    {panel("Accepted quote value", <>
                      <div className="md-admin-price-summary">
                        <div className="md-admin-price-hero">
                          <span>{t("Average accepted price")}</span>
                          <strong>{activePrice ? money(activePrice.average, activePrice.currency) : "—"}</strong>
                          <small>{activePrice ? `${integer(activePrice.sample)} ${t(activePrice.sample === 1 ? "priced quote" : "priced quotes")} · ${activePrice.currency}` : t("No priced wins in this period")}</small>
                        </div>
                        <div className="md-admin-price-median">
                          <span>{t("Median price")}</span>
                          <strong>{activePrice ? money(activePrice.median, activePrice.currency) : "—"}</strong>
                          <small>{t("The midpoint, less affected by unusually large quotes")}</small>
                        </div>
                      </div>
                      <p className="md-admin-price-note">{t("Accepted submitted prices, excluding tax. Currencies are kept separate.")}</p>
                    </>, data.prices.length > 1 ? undefined : activePrice?.currency,
                    data.prices.length > 1 ? (
                      <Select value={activePrice?.currency} onValueChange={setCurrency}>
                        <SelectTrigger aria-label={t("Quote currency")} className="md-admin-currency"><SelectValue /></SelectTrigger>
                        <SelectContent>{data.prices.map((p) => <SelectItem value={p.currency} key={p.currency}>{p.currency}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : undefined)}
                    {panel("Price coverage", <div className="md-admin-price-coverage">
                      <div><strong>{integer(data.prices.reduce((sum, price) => sum + price.sample, 0))}<span> / {integer(data.summary.wonQuotes)}</span></strong><span>{t("accepted quotes have a complete saved price")}</span></div>
                      <div className="md-admin-coverage-track" aria-hidden="true"><i style={{ width: `${data.summary.wonQuotes > 0 ? Math.min(100, data.prices.reduce((sum, price) => sum + price.sample, 0) / data.summary.wonQuotes * 100) : 0}%` }} /></div>
                      <p>{data.coverage.unpricedWins > 0
                        ? `${integer(data.coverage.unpricedWins)} ${t(data.coverage.unpricedWins === 1 ? "accepted quote is missing a complete saved price and is excluded above." : "accepted quotes are missing complete saved prices and are excluded above.")}`
                        : t(data.summary.wonQuotes > 0 ? "All accepted quotes in this period are included across the available currencies." : "No accepted quotes were recorded in this period.")}</p>
                    </div>)}
                  </div>
                  {panel("Quote loss reasons", <LossReasonMap reasons={data.lossReasons} />,
                    data.lossReasons.some((reason) => reason.count > 0) ? t("Area shows share of recorded losses") : undefined)}
                </div>
              ) : null}
              {data.permissions.customers && data.permissions.bookings ? (
                <div className="md-admin-growth-customers" id="admin-growth-customers">
                  {panel("Top customers", <>
                    <div className="md-admin-customers-head"><span>{t("Customer")}</span><span>{t("Share of period bookings")}</span><span>{t("Bookings")}</span></div>
                    <Ranking rows={data.customers.map(c => ({ key: c.id, label: c.name, value: c.bookings }))} total={data.summary.bookings} format={integer}
                      onOpen={(id) => { const customer = data.customers.find(c => c.id === id); if (customer) navigate(customer.route) }} />
                  </>, t("Bookings placed in the selected period"))}
                </div>
              ) : null}
              <div className="md-admin-grid md-admin-growth-pair">
                {data.permissions.bookings ? panel("Customer continuity", <div className="md-admin-continuity">
                  <div className="md-admin-continuity-head"><strong>{percent(data.summary.repeatCustomers, data.summary.bookingCustomers)}</strong><span>{t("repeat customer share")}</span></div>
                  <div className="md-admin-coverage-track" aria-hidden="true"><i style={{ width: `${data.summary.bookingCustomers > 0 ? data.summary.repeatCustomers / data.summary.bookingCustomers * 100 : 0}%` }} /></div>
                  <div className="md-admin-continuity-counts">
                    <Metric label={t("Repeat customers")} value={integer(data.summary.repeatCustomers)} detail={t("Booked before this period")} />
                    <Metric label={t("First-time customers")} value={integer(Math.max(0, data.summary.bookingCustomers - data.summary.repeatCustomers))} detail={t("First booking in this period")} />
                  </div>
                  {data.summary.bookingCustomers === 0 ? <p>{t("No customers placed bookings in this period.")}</p> : null}
                </div>) : null}
                <section className="md-admin-period-reading" aria-labelledby="admin-period-reading-title">
                  <span className="md-admin-period-reading-shader" aria-hidden="true"><StaticBloomShader tone="brand" stops={adminShaderStops} /></span>
                  <div className="md-admin-period-reading-content">
                    <div className="md-admin-period-reading-head"><h2 id="admin-period-reading-title">{t("Reading the period")}</h2><span>{t("Dexter")}</span></div>
                    {data.summary.leads + data.quoteFunnel.sent + data.summary.bookings === 0 ? <DashboardEmptyState kind="ai" title="No activity to read yet" detail="Try a wider date range to see earlier activity." /> : growthReadings.map(reading => <div className="md-admin-period-reading-row" key={reading.source}>
                      <p>{reading.text}</p><a href={reading.source}>{reading.label}<ArrowRight className="size-3" aria-hidden="true" /></a>
                    </div>)}
                    {growthReadings.length === 0 ? <p>{t("There is not enough recorded activity to draw a useful conclusion for this period. Try a wider date range.")}</p> : null}
                    <small>{t("Calculated from the recorded figures in this report.")}</small>
                  </div>
                </section>
              </div>
              {panel(
                "Workflow completion",
                <>
                  <div
                    className="md-admin-flow-table"
                    tabIndex={0}
                    role="region"
                    aria-label={t("Workflow completion details")}
                  >
                    <table>
                      <thead>
                        <tr className="md-admin-flow-head">
                          <th scope="col">{t("Workflow")}</th>
                          <th scope="col">{t("Completed / started")}</th>
                          <th scope="col">{t("Unfinished")}</th>
                          <th scope="col">{t("Recorded issues")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(flowNames).map((flow) => {
                          const rows = data.workflows.filter(
                            (f) => f.flow === flow,
                          )
                          const sum = (
                            key:
                              | "started"
                              | "completed"
                              | "unfinished"
                              | "errors"
                              | "pending"
                              | "cancelled",
                          ) => rows.reduce((n, r) => n + r[key], 0)
                          return (
                            <tr className="md-admin-flow-row" key={flow}>
                              <th scope="row">
                                {t(flowNames[flow])}
                                <small>
                                  {integer(sum("pending"))} {t("in progress")} ·{" "}
                                  {integer(sum("cancelled"))} {t("cancelled")}
                                </small>
                              </th>
                              <td>
                                <strong>
                                  {integer(sum("completed"))} /{" "}
                                  {integer(sum("started"))}
                                </strong>
                              </td>
                              <td>{integer(sum("unfinished"))}</td>
                              <td>{integer(sum("errors"))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="md-admin-caption">
                    {t(
                      "Unfinished attempts have no completion or cancellation after 24 hours. They may still be in progress. Older attempts retain daily totals.",
                    )}
                  </p>
                  {data.workflowSteps.length ? (
                    <p className="md-admin-caption">
                      {t("Last steps in unfinished attempts:")}{" "}
                      {data.workflowSteps
                        .slice(0, 5)
                        .map(
                          (s) =>
                            `${t(flowNames[s.flow])} · ${t(s.step)} (${integer(s.count)})`,
                        )
                        .join("; ")}
                    </p>
                  ) : null}
                </>,
                t("Attempts started in this period"),
              )}
            </>
          ) : null}
          {view === "Usage & AI" ? (
            <>
              {panel(
                "Billing-period allowance",
                allowance ? (
                  <>
                    <div className="md-admin-metrics">
                      <Metric
                        label={t("Included AI usage")}
                        value={
                          allowance.categories?.find((c) => c.id === "ai")
                            ?.dataState === "live"
                            ? `${allowance.categories.find((c) => c.id === "ai")!.usedPercent.toLocaleString(language, { maximumFractionDigits: 1 })}%`
                            : "—"
                        }
                        detail={t(
                          "Share of included AI allowance used",
                        )}
                      />
                      <Metric
                        label={t("Seats occupied")}
                        value={
                          allowance.subscription
                            ? `${integer(allowance.subscription.occupiedSeats)}${allowance.subscription.paidSeats != null || allowance.subscription.seatLimit != null ? ` / ${integer(allowance.subscription.paidSeats ?? allowance.subscription.seatLimit!)}` : ""}`
                            : "—"
                        }
                      />
                    </div>
                    <p className="md-admin-caption">
                      {date(allowance.periodStart.slice(0, 10))} –{" "}
                      {date(
                        new Date(Date.parse(allowance.periodEnd) - 1)
                          .toISOString()
                          .slice(0, 10),
                      )}
                      {" · "}
                      {t("Billing dates are separate from the reporting period.")}
                    </p>
                  </>
                ) : allowanceError ? (
                  <div className="md-admin-caption">
                    <InlineNotice
                      tone="warning"
                      title={t("Billing allowance unavailable")}
                      action={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAllowanceRevision((n) => n + 1)}
                        >
                          {t("Try again")}
                        </Button>
                      }
                    >
                      {allowanceError}
                    </InlineNotice>
                  </div>
                ) : (
                  <DotGridLoaderPanel
                    minHeight={100}
                    label={t("Loading billing allowance")}
                  />
                ),
              )}
              <div className="md-admin-metrics md-admin-metrics-wide">
                <Metric
                  label={t("Active time")}
                  empty={data.summary.activeSeconds === 0 ? { kind: "activity", title: t("No active time recorded") } : undefined}
                  value={hours(data.summary.activeSeconds)}
                  detail={t("Estimated time in focused Multideck windows")}
                />
                <Metric
                  label={t("Idle time")}
                  empty={data.summary.idleSeconds === 0 ? { kind: "activity", title: t("No idle time recorded") } : undefined}
                  value={hours(data.summary.idleSeconds)}
                  detail={t("After 5 minutes without interaction")}
                />
                <Metric
                  label={t("AI requests")}
                  empty={data.ai.requests === 0 ? { kind: "ai", title: t("No successful requests recorded") } : undefined}
                  value={integer(data.ai.requests)}
                  detail={t("Successful provider requests")}
                />
                <Metric
                  label={t("AI tokens")}
                  empty={data.ai.tokens === 0 ? { kind: "ai", title: t("No token usage recorded") } : undefined}
                  value={integer(data.ai.tokens)}
                  detail={t("OpenAI input and output tokens")}
                />
              </div>
              <div className="md-admin-grid">
                {panel(
                  "Workspace rhythm",
                  <UsageCalendar
                    days={data.trend}
                    measuredFrom={data.coverage.trackingStartedAt}
                    retainedFrom={data.coverage.usageRetainedFrom}
                  />,
                  t("Daily active time · UTC"),
                )}
                <div className="md-admin-chart-frame md-admin-chart-frame--time">
                  {emptyPanels["Time in Multideck"] ? panel("Time in Multideck", null, t("Hours in focused windows")) : (
                <DashboardModeChart
                  animated={false}
                  title={t("Time in Multideck")}
                  subtitle={t(
                    "Hours in focused windows · overlapping sessions counted once per user",
                  )}
                  formatValue={(n) =>
                    `${n.toLocaleString(language, { maximumFractionDigits: 1 })}h`
                  }
                  labels={data.trend.map((d) =>
                    new Date(`${d.day}T00:00:00Z`).toLocaleDateString(
                      language,
                      { day: "numeric", month: "short", timeZone: "UTC" },
                    ),
                  )}
                  series={[
                    {
                      key: "active",
                      label: t("Active"),
                      color: palette[0],
                      values: data.trend.map((d) => d.activeSeconds / 3600),
                    },
                    {
                      key: "idle",
                      label: t("Idle"),
                      color: "var(--md-subtle)",
                      values: data.trend.map((d) => d.idleSeconds / 3600),
                    },
                  ]}
                  height={230}
                />                  )}
                </div>
              </div>
              <div className="md-admin-grid">
                {panel(
                  "Users",
                  <div
                    className="md-admin-user-table"
                    tabIndex={0}
                    role="region"
                    aria-label={t("User activity details")}
                  >
                    <table>
                      <thead>
                        <tr className="md-admin-user-head">
                          <th scope="col">{t("User")}</th>
                          <th scope="col">{t("Active / idle")}</th>
                          <th scope="col">{t("AI requests")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.length ? (
                          users.map((u) => (
                            <tr className="md-admin-user-row" key={u.id}>
                              <th scope="row" dir="auto">
                                {u.name}
                                <small>
                                  {activeDays(u.days)}
                                  {!u.enabled ? ` · ${t("Deactivated")}` : ""}
                                </small>
                              </th>
                              <td>
                                <strong>
                                  {hours(u.activeSeconds)}
                                  <small>
                                    {hours(u.idleSeconds)} {t("idle")}
                                  </small>
                                </strong>
                              </td>
                              <td>
                                {integer(u.aiRequests)}
                                <small>
                                  {integer(u.aiTokens)} {t("tokens")}
                                </small>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3}>
                              <p className="md-admin-caption">
                                {t("No measured user activity in this period.")}
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>,
                  t("Top 100 by active time"),
                  <Select value={sortUsers} onValueChange={setSortUsers}>
                    <SelectTrigger
                      className="md-admin-currency"
                      aria-label={t("Sort users")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t("Active time")}</SelectItem>
                      <SelectItem value="ai">{t("AI requests")}</SelectItem>
                    </SelectContent>
                  </Select>,
                )}
                {panel(
                  "Module adoption",
                  <Ranking
                    rows={data.modules.map((m) => ({
                      key: m.key,
                      label: t(m.key[0].toUpperCase() + m.key.slice(1)),
                      value: m.activeSeconds,
                      sub: `${integer(m.users)} ${t(m.users === 1 ? "user" : "users")} · ${hours(m.idleSeconds)} ${t("idle")}`,
                    }))}
                    format={hours}
                  />,
                  t("Active time by module"),
                )}
              </div>
              <div className="md-admin-grid">
                {panel(
                  "AI activity",
                  <Ranking
                    rows={data.ai.purposes.map((p) => ({
                      key: p.key,
                      label: t(purposeNames[p.key] ?? p.key.replaceAll("_", " ")),
                      value: p.count,
                    }))}
                    format={integer}
                  />,
                  t("Requests by purpose"),
                )}
                {panel(
                  "AI cost and reliability",
                  <div className="md-admin-metrics">
                    <Metric
                      label={t("Recorded AI cost")}
                      value={money(data.ai.cost, "GBP")}
                      detail={t(
                        "Actual cost where supplied; otherwise an estimate",
                      )}
                    />
                    <Metric
                      label={t("Failed requests")}
                      value={integer(data.ai.failed)}
                    />
                  </div>,
                )}
              </div>
              <p className="md-admin-caption">
                {t(
                  "Active and idle time are activity estimates, not a measure of productivity. Hidden, closed and unfocused windows are excluded. No typed content is collected. Raw detail is retained for 90 days; daily trends for 13 months. Reported AI requests are not billable credits.",
                )}
              </p>
            </>
          ) : null}
          {view === "System health" ? (
            <>
              <div className="md-admin-grid">
                {attentionPanel}
                {panel(
                  "Data coverage",
                  <div className="md-admin-metrics">
                    <Metric
                      label={t("Missing destinations")}
                      value={
                        data.permissions.bookings
                          ? integer(data.system.unmappedDestinations)
                          : "—"
                      }
                      detail={t(
                        data.permissions.bookings
                          ? "Bookings excluded from reliable country mapping"
                          : "Booking access required",
                      )}
                    />
                    <Metric
                      label={t("Unpriced wins")}
                      value={
                        data.permissions.quotes
                          ? integer(data.coverage.unpricedWins)
                          : "—"
                      }
                      detail={t(
                        data.permissions.quotes
                          ? "Accepted quotes without a complete submitted price"
                          : "Quote access required",
                      )}
                    />
                    <Metric
                      label={t("Undated quote outcomes")}
                      value={
                        data.permissions.quotes
                          ? integer(data.coverage.undatedQuoteOutcomes)
                          : "—"
                      }
                      detail={t(
                        data.permissions.quotes
                          ? "Excluded from period outcome totals"
                          : "Quote access required",
                      )}
                    />
                    <Metric
                      label={t("Estimated booking dates")}
                      value={
                        data.permissions.bookings
                          ? integer(data.coverage.estimatedBookingDates)
                          : "—"
                      }
                      detail={t(
                        data.permissions.bookings
                          ? "Historical records use their creation date"
                          : "Booking access required",
                      )}
                    />
                  </div>,
                )}
              </div>
              <p className="md-admin-caption">
                {t(
                  "Queue and overdue-follow-up counts show the current state; other counts use the reporting period.",
                )}
              </p>
            </>
          ) : null}
          <footer className="md-admin-footer">
            {coverage}
            <span>
              {t("Updated")}{" "}
              {new Date(data.generatedAt).toLocaleTimeString(language, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </footer>
        </div>
      ) : null}
    </div>
  )
}
