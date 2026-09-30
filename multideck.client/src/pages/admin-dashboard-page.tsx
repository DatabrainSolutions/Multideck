import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowRight, RefreshCw } from "@/components/icons/hugeicons"
import { CrmPanel, CrmEmptyState } from "@/components/multideck/crm-dashboard"
import {
  CohortJourney,
  LossReasonMap,
  UsageCalendar,
} from "@/components/multideck/dashboard-analytics-charts"
import { DashboardWorldMap } from "@/components/multideck/dashboard-world-map"
import { DashboardModeChart } from "@/components/multideck/dashboard-mode-chart"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Inbox } from "@/components/icons/hugeicons"
import { accentCssText } from "@/lib/accent-theme"
import { useLanguage } from "@/i18n/language-provider"
import {
  adminReportingPeriod,
  getAdminDashboard,
  type AdminDashboardData,
} from "@/lib/admin-dashboard-api"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { getDexterUsage, type DexterUsage } from "@/lib/dexter-api"

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
}: {
  rows: { key: string; label: string; value: number; sub?: string }[]
  format: (n: number) => string
  onOpen?: (key: string) => void
}) {
  const { t } = useLanguage()
  if (!rows.length)
    return (
      <CrmEmptyState
        icon={Inbox}
        title={t("No activity in this period")}
        body={t("Recorded activity will appear here when it is available.")}
      />
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
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="md-admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
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
  const [custom, setCustom] = useState(() => adminReportingPeriod(30))
  const [appliedCustom, setAppliedCustom] = useState(custom)
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
  const periodLabel = `${date(window_.from)} – ${date(window_.to)}`
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
    setData(null)
    load(window_, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError({
            message:
              cause instanceof Error
                ? cause.message
                : "Workspace analytics could not be loaded.",
            status: cause?.status,
          })
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
  const validCustom =
    /^\d{4}-\d{2}-\d{2}$/.test(custom.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(custom.to) &&
    custom.from <= custom.to &&
    custom.to <= adminReportingPeriod(1).to &&
    Date.parse(custom.to) - Date.parse(custom.from) <= 365 * 86_400_000
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
            data.permissions.crm ? "Leads created" : "CRM access required",
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
              ? "Customer accounts created"
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
            ? `${integer(data.summary.wonQuotes + data.summary.lostQuotes)} ${t("recorded decisions")}`
            : t("Quote access required"),
          tone: "green",
        },
        {
          label: t("Active users"),
          value: integer(data.summary.activeUsers),
          detail: t("Measured time in Multideck"),
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
                caption: t("vs previous equal period"),
              },
            }
          : kpi
      }) as DashboardKpi[])
    : []

  const panel = (
    title: string,
    children: ReactNode,
    meta?: string,
    action?: ReactNode,
  ) => (
    <CrmPanel title={t(title)} meta={meta} action={action}>
      {children}
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
      {t("All reporting days are UTC.")}
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
          sub: t("Bookings placed"),
        }))}
        format={integer}
        onOpen={(id) => {
          const c = data.customers.find((c) => c.id === id)
          if (c) navigate(c.route)
        }}
      />,
      t("By booking volume"),
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
          sub: `${integer(u.days)} ${t("active days")} · ${hours(u.idleSeconds)} ${t("idle")}`,
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
      t("Recorded exceptions"),
    )
  return (
    <div className="md-admin-dashboard md-kpi-scope">
      <style>{adminBrandCss}</style>
      <SettingsPageHeader
        title={t("Admin dashboard")}
        description={t(
          "A clear view of your workspace, customers and commercial activity.",
        )}
        descriptionPlacement="under-title"
        actions={
          <>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger
                aria-label={t("Reporting period")}
                className="md-admin-period"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["7", "30", "90", "custom"].map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === "custom"
                      ? t("Custom period")
                      : `${p} ${t("complete days")}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <span>UTC</span>
        </p>
      </div>
      {period === "custom" ? (
        <form
          className="md-admin-custom"
          onSubmit={(e) => {
            e.preventDefault()
            if (validCustom) setAppliedCustom({ ...custom })
          }}
        >
          <label>
            {t("From")}
            <Input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) =>
                setCustom((c) => ({ ...c, from: e.target.value }))
              }
            />
          </label>
          <label>
            {t("To")}
            <Input
              type="date"
              value={custom.to}
              min={custom.from}
              max={adminReportingPeriod(1).to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </label>
          <Button variant="secondary" disabled={!validCustom} type="submit">
            {t("Apply period")}
          </Button>
          {!validCustom ? (
            <small role="status">
              {t("Choose complete days within a period of at most one year.")}
            </small>
          ) : null}
        </form>
      ) : null}
      {loading ? (
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
      ) : data ? (
        <div
          id="admin-dashboard-content"
          role="tabpanel"
          aria-labelledby={`admin-tab-${views.indexOf(view)}`}
          tabIndex={0}
          className="md-admin-content"
        >
          <KpiStrip kpis={kpis} columns={6} spark={false} animated={false} />
          {view === "Overview" ? (
            <>
              <div className="md-admin-grid md-admin-grid-feature">
                {data.permissions.bookings
                  ? panel(
                      "Where your bookings go",
                      <DashboardWorldMap values={data.countries} />,
                      t("Destination · bookings placed"),
                    )
                  : panel(
                      "Where your bookings go",
                      <p className="md-admin-caption">
                        {t(
                          "Booking access is required to view geographic activity.",
                        )}
                      </p>,
                    )}
                {customerPanel}
              </div>
              <div className="md-admin-grid">
                {data.permissions.bookings && data.modes.length === 0 ? (
                  panel(
                    "Shipping modes",
                    <p className="md-admin-caption">
                      {t("No bookings placed in this period.")}
                    </p>,
                    t("Daily bookings placed"),
                  )
                ) : data.permissions.bookings ? (
                  <DashboardModeChart
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
                    height={230}
                  />
                ) : null}
                {data.permissions.quotes
                  ? panel(
                      "Quote decisions",
                      <>
                        <div className="md-admin-metrics">
                          <Metric
                            label={t("Accepted")}
                            value={integer(data.summary.wonQuotes)}
                            detail={t("Recorded wins in this period")}
                          />
                          <Metric
                            label={t("Lost")}
                            value={integer(data.summary.lostQuotes)}
                            detail={t("Recorded losses in this period")}
                          />
                        </div>
                        <LossReasonMap reasons={data.lossReasons} />
                      </>,
                      t("Outcomes recorded in this period"),
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setView("Growth")}
                      >
                        {t("Explore conversion")}
                        <ArrowRight className="size-3.5" />
                      </Button>,
                    )
                  : null}
              </div>
              <div className="md-admin-grid">
                {usagePanel}
                {attentionPanel}
              </div>
            </>
          ) : null}
          {view === "Growth" ? (
            <>
              <div className="md-admin-grid">
                {data.permissions.crm
                  ? panel(
                      "Lead conversion",
                      <CohortJourney
                        stages={[
                          {
                            label: "Leads created",
                            value: data.leadFunnel.created,
                          },
                          {
                            label: "Converted to a deal",
                            value: data.leadFunnel.converted,
                          },
                        ]}
                        note={t(
                          "Leads created in this period, with their outcomes to date. This cohort may still progress.",
                        )}
                      />,
                      t("Created-lead cohort"),
                    )
                  : null}
                {data.permissions.quotes
                  ? panel(
                      "Quote conversion",
                      <CohortJourney
                        stages={[
                          {
                            label: "Quotes sent",
                            value: data.quoteFunnel.sent,
                          },
                          {
                            label: "Customer decision",
                            value: data.quoteFunnel.responded,
                          },
                          {
                            label: "Accepted",
                            value: data.quoteFunnel.accepted,
                          },
                          ...(data.permissions.bookings
                            ? [
                                {
                                  label: "Booking placed",
                                  value: data.quoteFunnel.booked,
                                },
                              ]
                            : []),
                        ]}
                        note={t(
                          data.permissions.bookings
                            ? "Quotes first sent in this period, with outcomes to date. No response is not a customer decision."
                            : "Quotes first sent in this period, with outcomes to date. Booking access is required to inspect booking conversion.",
                        )}
                      />,
                      t("Sent-quote cohort"),
                    )
                  : null}
              </div>
              <div className="md-admin-grid">
                {data.permissions.quotes
                  ? panel(
                      "Accepted quote value",
                      <>
                        <div className="md-admin-metrics">
                          <Metric
                            label={t("Average won price")}
                            value={
                              activePrice
                                ? money(
                                    activePrice.average,
                                    activePrice.currency,
                                  )
                                : "—"
                            }
                            detail={
                              activePrice
                                ? `${integer(activePrice.sample)} ${t("accepted submitted versions")}`
                                : t("No priced wins in this period")
                            }
                          />
                          <Metric
                            label={t("Median won price")}
                            value={
                              activePrice
                                ? money(
                                    activePrice.median,
                                    activePrice.currency,
                                  )
                                : "—"
                            }
                            detail={t(
                              "Middle value, less affected by large quotes",
                            )}
                          />
                        </div>
                        <p className="md-admin-caption">
                          {t(
                            "Accepted submitted prices, excluding tax. Currencies are kept separate.",
                          )}
                          {data.coverage.unpricedWins
                            ? ` ${integer(data.coverage.unpricedWins)} ${t(data.coverage.unpricedWins === 1 ? "win has no complete saved price." : "wins have no complete saved price.")}`
                            : ""}
                        </p>
                      </>,
                      activePrice?.currency,
                      data.prices.length > 1 ? (
                        <Select
                          value={activePrice?.currency}
                          onValueChange={setCurrency}
                        >
                          <SelectTrigger
                            aria-label={t("Quote currency")}
                            className="md-admin-currency"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {data.prices.map((p) => (
                              <SelectItem value={p.currency} key={p.currency}>
                                {p.currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : undefined,
                    )
                  : null}
                {data.permissions.quotes
                  ? panel(
                      "Most common quote loss reasons",
                      <LossReasonMap reasons={data.lossReasons} />,
                      t("Area shows share of recorded losses"),
                    )
                  : null}
              </div>
              <div className="md-admin-grid">
                {panel(
                  "Customer continuity",
                  <div className="md-admin-metrics">
                    <Metric
                      label={t("Repeat customer share")}
                      value={
                        data.permissions.bookings
                          ? percent(
                              data.summary.repeatCustomers,
                              data.summary.bookingCustomers,
                            )
                          : "—"
                      }
                      detail={t(
                        data.permissions.bookings
                          ? "Booking customers who also booked before this period"
                          : "Booking access required",
                      )}
                    />
                    <Metric
                      label={t("Average first response")}
                      value={
                        !data.permissions.crm ||
                        data.leadFunnel.responseHours === null
                          ? "—"
                          : `${data.leadFunnel.responseHours}h`
                      }
                      detail={t(
                        data.permissions.crm
                          ? "Only leads with a recorded first response"
                          : "CRM access required",
                      )}
                    />
                  </div>,
                )}
                {customerPanel}
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
                      "Measured attempts in the core commercial flows. Unfinished means no completion or cancellation after 24 hours; it does not prove the task was abandoned. Older attempts retain daily totals.",
                    )}
                  </p>
                  {data.workflowSteps.length ? (
                    <p className="md-admin-caption">
                      {t("Last recorded steps in unfinished attempts:")}{" "}
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
                          "Of the included allowance for this billing period",
                        )}
                      />
                      <Metric
                        label={t("Seats occupied")}
                        value={
                          allowance.subscription
                            ? `${integer(allowance.subscription.occupiedSeats)}${allowance.subscription.paidSeats != null || allowance.subscription.seatLimit != null ? ` / ${integer(allowance.subscription.paidSeats ?? allowance.subscription.seatLimit!)}` : ""}`
                            : "—"
                        }
                        detail={t("Current subscription seats")}
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
                      {t("Billing period; separate from the reporting filter.")}
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
                t("Current billing period"),
              )}
              <div className="md-admin-metrics md-admin-metrics-wide">
                <Metric
                  label={t("Active time")}
                  value={hours(data.summary.activeSeconds)}
                  detail={t("Estimated time in focused Multideck windows")}
                />
                <Metric
                  label={t("Idle time")}
                  value={hours(data.summary.idleSeconds)}
                  detail={t("After 5 minutes without interaction")}
                />
                <Metric
                  label={t("AI requests")}
                  value={integer(data.ai.requests)}
                  detail={t("Successful provider requests in this report")}
                />
                <Metric
                  label={t("AI tokens")}
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
                <DashboardModeChart
                  animated={false}
                  title={t("Time in Multideck")}
                  subtitle={t(
                    "Hours · focused windows only · overlapping sessions counted once per user",
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
                />
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
                                  {integer(u.days)} {t("active days")}
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
                      sub: `${integer(m.users)} ${t("users")} · ${hours(m.idleSeconds)} ${t("idle")}`,
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
                      label: p.key.replaceAll("_", " "),
                      value: p.count,
                    }))}
                    format={integer}
                  />,
                  t("Provider request purposes"),
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
                      detail={t("Provider failures recorded in the period")}
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
                  "These are recorded application exceptions and data coverage checks. Queue and overdue-follow-up counts show their current state.",
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
