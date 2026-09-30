import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeftRight, ChartAnalysis, TrendingUp, Wallet } from "@/components/icons/hugeicons"
import { DashboardBreakdownPanel, type BreakdownSlice } from "@/components/multideck/dashboard-breakdown-panel"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { DashboardColumnChart, type ColumnSeries } from "@/components/multideck/dashboard-column-chart"
import { DashboardForecastChart, type ForecastSeries } from "@/components/multideck/dashboard-forecast-chart"
import { KpiStrip } from "@/components/multideck/dashboard-kpi-strip"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { FinanceProfitLossPanel } from "@/components/multideck/finance-profit-loss-panel"
import { FinanceWorkingCapitalPanel } from "@/components/multideck/finance-working-capital-panel"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { SettingsPageHeader } from "@/components/multideck/settings-components"
import { Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import { getFinanceDirectorDashboard, type FinanceDirectorResponse, type FinanceSplit } from "@/lib/finance-director-api"
import {
  debtorDays,
  financePeriods,
  forecast,
  formatMonth,
  formatMonthRange,
  margin,
  moneyFormatter,
  movement,
  percent,
  periodWindow,
  totalsBetween,
  type FinancePeriod,
} from "@/lib/finance-director-model"
import { mdMotion, staggerRamp } from "@/lib/motion"

type Metric = "revenue" | "gross" | "net" | "cash"
const periodStorageKey = "multideck.finance-dashboard.period"
const readPeriod = (): FinancePeriod => {
  try {
    const saved = window.localStorage.getItem(periodStorageKey)
    return financePeriods.some((item) => item.value === saved) ? saved as FinancePeriod : "quarter"
  } catch { return "quarter" }
}
const savePeriod = (period: FinancePeriod) => { try { window.localStorage.setItem(periodStorageKey, period) } catch { /* Keep the selection for this visit. */ } }

const splitRowLimit = 6
const customerInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toLocaleUpperCase() ?? "").join("") || "?"
const modeLabels: Record<string, string> = {
  air: "Air", sea: "Sea", road: "Road", rail: "Rail", courier: "Courier", multimodal: "Multimodal",
  warehouse: "Warehouse", postal: "Postal", inland_waterway: "Inland waterway", other: "Other", unassigned: "No mode set",
}
const regionLabels: Record<string, string> = { Unassigned: "No lane set" }

/**
 * Gives a chart the height its row leaves it. The chart sits in an absolutely
 * positioned layer, so its own height can never push the row taller than the
 * panel beside it asks for.
 */
function FillHeight({ min, children }: { min: number; children: (height: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setHeight(node.clientHeight)
    if (typeof ResizeObserver === "undefined") return
    let frame = 0
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.height ?? 0)
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setHeight(next))
    })
    observer.observe(node)
    return () => { if (frame) cancelAnimationFrame(frame); observer.disconnect() }
  }, [])
  return (
    <div ref={ref} className="md-finance-fill" style={{ minHeight: min }}>
      <div className="md-finance-fill-layer">{height > 0 ? children(height) : null}</div>
    </div>
  )
}

/** Each band arrives a beat after the one above it, top to bottom. */
function Band({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.05) }}
    >
      {children}
    </motion.div>
  )
}

export function FinanceDirectorDashboardPage({ load = getFinanceDirectorDashboard }: {
  /** Where the figures come from. The live edge function unless a preview supplies its own. */
  load?: typeof getFinanceDirectorDashboard
} = {}) {
  const { t, language } = useLanguage()
  const [period, setPeriod] = useState<FinancePeriod>(readPeriod)
  const [entityId, setEntityId] = useState<string | undefined>()
  const [response, setResponse] = useState<FinanceDirectorResponse | null>(null)
  const [error, setError] = useState<{ message: string; status?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<Metric>("revenue")
  const [attempt, setAttempt] = useState(0)
  const window_ = useMemo(() => periodWindow(period), [period])
  const requestRef = useRef(0)

  useEffect(() => { document.title = `${t("Dashboard")} · Finance · Multideck` }, [t])

  useEffect(() => {
    const controller = new AbortController()
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    load({ entityId, from: window_.from, to: window_.to, asOf: window_.asOf }, controller.signal)
      .then((result) => { if (request === requestRef.current) setResponse(result) })
      .catch((cause) => {
        if (controller.signal.aborted || request !== requestRef.current) return
        setError({ message: cause instanceof Error ? cause.message : "The finance dashboard could not be loaded.", status: (cause as { status?: number }).status })
      })
      .finally(() => { if (request === requestRef.current && !controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [entityId, window_, attempt, load])

  const dashboard = response?.dashboard ?? null
  const money = useMemo(() => moneyFormatter(dashboard?.currency ?? "GBP", language), [dashboard?.currency, language])
  const pct = useCallback((value: number | null) => percent(value, language), [language])

  const model = useMemo(() => {
    if (!dashboard) return null
    const current = totalsBetween(dashboard.months, window_.start, window_.end)
    const previous = totalsBetween(dashboard.months, window_.previousStart, window_.previousEnd)
    const outlook = forecast(dashboard.months, window_.current)
    const recent = dashboard.months.slice(-13)
    return { current, previous, outlook, recent }
  }, [dashboard, window_])

  const periodLabel = formatMonthRange(window_.start, window_.end, language)
  const previousLabel = formatMonthRange(window_.previousStart, window_.previousEnd, language)

  const kpis = useMemo<(DashboardKpi & { key: Metric })[]>(() => {
    if (!model) return []
    const { current, previous } = model
    const delta = (now: number, before: number) => {
      // Nothing either side is not a movement, so no chip at all.
      if (Math.abs(now) < 0.5 && Math.abs(before) < 0.5) return undefined
      const change = movement(now, before)
      const text = change.ratio !== null
        ? `${change.ratio > 0 ? "+" : ""}${pct(change.ratio)}`
        : `${change.change > 0 ? "+" : ""}${money.compact(change.change)}`
      return { direction: change.direction, text, caption: `vs ${previousLabel}` }
    }
    const grossMargin = pct(margin(current.grossProfit, current.revenue))
    const netMargin = pct(margin(current.netProfit, current.revenue))
    return [
      { key: "revenue", label: t("Revenue"), value: money.whole(current.revenue), detail: `${t("Costs")} ${money.compact(current.directCost + current.overheads)}`, tone: "teal", icon: ChartAnalysis, delta: delta(current.revenue, previous.revenue) },
      { key: "gross", label: t("Gross profit"), value: money.whole(current.grossProfit), detail: grossMargin ? `${grossMargin} ${t("margin")}` : t("No revenue yet"), tone: "green", icon: TrendingUp, delta: delta(current.grossProfit, previous.grossProfit) },
      { key: "net", label: t("Net profit"), value: money.whole(current.netProfit), detail: netMargin ? `${netMargin} ${t("net margin")}` : t("No revenue yet"), tone: current.netProfit < 0 ? "red" : "green", icon: Wallet, delta: delta(current.netProfit, previous.netProfit) },
      { key: "cash", label: t("Net cash flow"), value: money.whole(current.netCash), detail: `${money.compact(current.cashIn)} ${t("in")} · ${money.compact(current.cashOut)} ${t("out")}`, tone: "blue", icon: ArrowLeftRight, delta: delta(current.netCash, previous.netCash) },
    ]
  }, [model, money, pct, previousLabel, t])

  const selectedKpi = kpis.find((kpi) => kpi.key === metric) ?? kpis[0]

  const columns = useMemo(() => {
    if (!model || !dashboard) return null
    const months = model.recent
    const labels = months.map((month) => formatMonth(month.month, language))
    const tooltipLabels = months.map((month) => formatMonth(month.month, language, "long"))
    const emphasis = months.map((month) => month.month >= window_.start && month.month <= window_.end)
    const costs = months.map((month) => month.directCost + month.overheads)
    const series: Record<Metric, { title: string; series: ColumnSeries[]; extra?: (index: number) => { label: string; value: string } | null }> = {
      revenue: {
        title: t("Revenue and costs"),
        series: [
          { key: "revenue", label: t("Revenue"), color: "var(--md-fin-in)", values: months.map((month) => month.revenue) },
          { key: "costs", label: t("Costs"), color: "var(--md-fin-out)", values: costs },
        ],
        extra: (index) => ({ label: t("Net profit"), value: money.whole(months[index].revenue - costs[index]) }),
      },
      gross: {
        title: t("Gross profit by month"),
        series: [{ key: "gross", label: t("Gross profit"), color: "var(--md-fin-in)", values: months.map((month) => month.revenue - month.directCost) }],
        extra: (index) => { const value = pct(margin(months[index].revenue - months[index].directCost, months[index].revenue)); return value ? { label: t("Margin"), value } : null },
      },
      net: {
        title: t("Net profit by month"),
        series: [{ key: "net", label: t("Net profit"), color: "var(--md-fin-in)", values: months.map((month, index) => month.revenue - costs[index]) }],
        extra: (index) => { const value = pct(margin(months[index].revenue - costs[index], months[index].revenue)); return value ? { label: t("Net margin"), value } : null },
      },
      cash: {
        title: t("Cash in and out"),
        series: [
          { key: "in", label: t("Cash in"), color: "var(--md-fin-in)", values: months.map((month) => month.cashIn) },
          { key: "out", label: t("Cash out"), color: "var(--md-fin-out)", values: months.map((month) => month.cashOut) },
        ],
        extra: (index) => ({ label: t("Net"), value: money.whole(months[index].cashIn - months[index].cashOut) }),
      },
    }
    return { labels, tooltipLabels, emphasis, partialIndex: months.length - 1, ...series[metric] }
  }, [dashboard, language, metric, model, money, pct, t, window_])

  const forecastView = useMemo(() => {
    if (!model?.outlook || !dashboard) return null
    const { basis, revenue, netProfit } = model.outlook
    const history = basis.slice(-9)
    const labels = [...history.map((month) => formatMonth(month.month, language)), ...revenue.map((point) => formatMonth(point.month, language))]
    const tooltipLabels = [...history.map((month) => formatMonth(month.month, language, "long")), ...revenue.map((point) => formatMonth(point.month, language, "long"))]
    const series: ForecastSeries[] = [
      { key: "revenue", label: t("Revenue"), color: "var(--md-fin-in)", actual: history.map((month) => month.revenue), projected: revenue },
      { key: "net", label: t("Net profit"), color: "var(--md-blue)", actual: history.map((month) => month.revenue - month.directCost - month.overheads), projected: netProfit },
    ]
    const nextRevenue = revenue.reduce((total, point) => total + point.value, 0)
    const nextProfit = netProfit.reduce((total, point) => total + point.value, 0)
    const lastThree = basis.slice(-3).reduce((total, month) => total + month.revenue, 0)
    const inProgress = dashboard.months.at(-1)
    const change = movement(nextRevenue, lastThree).ratio
    return { labels, tooltipLabels, series, nextRevenue, nextProfit, change, basis: basis.length, inProgress, projectedCurrent: revenue[0]?.value ?? 0 }
  }, [dashboard, language, model, t])

  // Every split panel shows at most six rows – five named, then the rest as
  // one – so the three panels in the row come out the same height.
  const splitSlices = useCallback((rows: FinanceSplit[], labels: Record<string, string>, otherLabel: string) => {
    const withRevenue = rows.filter((row) => row.revenue !== 0)
    const named = withRevenue.length > splitRowLimit ? withRevenue.slice(0, splitRowLimit - 1) : withRevenue
    const rest = withRevenue.slice(named.length)
    const folded = rest.length
      ? [{ key: otherLabel, revenue: rest.reduce((sum, row) => sum + row.revenue, 0), cost: rest.reduce((sum, row) => sum + row.cost, 0), jobs: rest.reduce((sum, row) => sum + row.jobs, 0) }]
      : []
    return [...named, ...folded].map<BreakdownSlice>((row) => {
      // With no costs booked against the jobs yet, a margin would read 100%.
      const rowMargin = row.cost > 0 ? pct(margin(row.revenue - row.cost, row.revenue)) : null
      return { label: t(labels[row.key] ?? row.key), value: row.revenue, color: "var(--md-fin-in)", meta: rowMargin ? `${rowMargin} ${t("margin")}` : t("No costs yet") }
    })
  }, [pct, t])

  const entityOptions = response?.legalEntities ?? []
  const header = (
    <SettingsPageHeader
      title={t("Finance dashboard")}
      description={dashboard
        ? `${dashboard.legalEntity} · ${t("posted results in")} ${dashboard.currency}`
        : t("Revenue, profit, cash and what comes next, from the posted ledger.")}
      descriptionPlacement="under-title"
      actions={(
        <>
          {entityOptions.length > 1 && dashboard ? (
            // A dropdown whatever the count: two segmented controls side by side
            // read as one control, and entities are not modes of the same view.
            <Select value={dashboard.legalEntityId} onValueChange={setEntityId}>
              <SelectTrigger aria-label={t("Legal entity")} className="h-9 min-w-[200px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                {entityOptions.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id} className="text-[13px]" data-i18n-skip>{entity.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <SegmentedControl
            ariaLabel={t("Reporting period")}
            options={financePeriods.map((item) => item.value)}
            value={period}
            onChange={(value) => { setPeriod(value); savePeriod(value) }}
            renderOption={(value) => t(financePeriods.find((item) => item.value === value)?.label ?? value)}
          />
        </>
      )}
    />
  )

  if (!response && loading) {
    return <div className="md-page md-page-stack md-dashboard">{header}<DotGridLoaderPanel label={t("Loading finance…")} minHeight={320} /></div>
  }

  if (!response && error) {
    return (
      <div className="md-page md-page-stack md-dashboard">
        {header}
        <InlineNotice
          tone="error"
          title={error.status === 403 ? t("You do not have access to the Finance dashboard.") : t("The Finance dashboard could not be loaded.")}
          action={error.status === 403 ? undefined : <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("Retry")}</Button>}
        >
          {error.status === 403
            ? t("Ask a workspace administrator to check your role and dashboard access.")
            : error.message === "The finance dashboard could not be loaded." ? t("Check your connection, then try again.") : error.message}
        </InlineNotice>
      </div>
    )
  }

  if (!dashboard || !model) {
    return (
      <div className="md-page md-page-stack md-dashboard">
        {header}
        <InlineNotice tone="info" title={t("Finance isn't set up yet")}>
          {t("Once a legal entity and its chart of accounts are set up in Finance, results appear here as invoices, bills and journals are posted.")}
        </InlineNotice>
      </div>
    )
  }

  const nothingPosted = dashboard.coverage.postedBatches === 0
  const salesLinkedShare = dashboard.salesRevenue > 0 ? dashboard.jobLinkedRevenue / dashboard.salesRevenue : null
  const namedCustomers = dashboard.customerCount > splitRowLimit ? dashboard.customers.slice(0, splitRowLimit - 1) : dashboard.customers
  const otherCustomers = dashboard.customerCount - namedCustomers.length
  const otherCustomerRevenue = dashboard.customers.slice(namedCustomers.length).reduce((sum, customer) => sum + customer.revenue, 0) + dashboard.otherCustomerRevenue

  const customerMagnitude = namedCustomers.reduce((sum, customer) => sum + Math.abs(customer.revenue), 0) + Math.abs(otherCustomerRevenue)

  return (
    <div className="md-page md-dashboard">
      <div className="md-dashboard-main md-page-stack">
        {header}

        <p className="md-finance-period-caption -mt-2" aria-live="polite">
          {periodLabel} {t("compared with")} {previousLabel} · {t("whole months to the end of last month")}
          {loading ? ` · ${t("Updating…")}` : ""}
        </p>

        {error ? (
          <InlineNotice tone="error" title={t("The latest figures could not be loaded.")} action={<Button type="button" size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("Retry")}</Button>}>
            {error.message} {t("Showing the last figures that loaded.")}
          </InlineNotice>
        ) : null}

        {nothingPosted ? (
          <InlineNotice tone="info" title={`${t("Nothing has been posted for")} ${dashboard.legalEntity} ${t("yet")}`}>
            {t("Figures appear here as invoices, bills, receipts and journals are posted to the ledger.")}
          </InlineNotice>
        ) : null}

        <div className="md-finance-content md-page-stack" data-refreshing={loading ? "true" : undefined}>
          <Band index={0}>
            <KpiStrip
              kpis={kpis}
              selectedLabel={selectedKpi?.label}
              onSelect={(label) => { const next = kpis.find((kpi) => kpi.label === label); if (next) setMetric(next.key) }}
              spark={false}
              markerId="md-finance-metric-rule"
            />
          </Band>

          {/* Two rows of pairs on one grid, so each pair shares a top and a
              bottom edge. The statement panels set the row height and the
              charts beside them grow into it: the elastic element is always a
              drawing, never empty surface. */}
          <div className="md-finance-band md-finance-band-lead">
          <Band index={1} className="md-finance-cell">
            <Surface padding="none" className="md-finance-chart-panel">
              <div className="md-finance-chart-head">
                <div className="min-w-0">
                  <h2 className="md-panel-title">{columns?.title}</h2>
                  <p className="md-panel-meta">{t("The last twelve months, with")} {periodLabel} {t("in full colour. The lightest column is this month so far.")}</p>
                </div>
                {columns && columns.series.length > 1 ? (
                  <div className="md-finance-legend">
                    {columns.series.map((entry) => (
                      <span key={entry.key}><span className="md-finance-legend-swatch" style={{ background: entry.color }} />{entry.label}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="md-finance-chart-canvas">
                {columns && !columns.series.some((entry) => entry.values.some((value) => Math.abs(value) >= 0.5)) ? (
                  <p className="md-finance-chart-empty">{t("No posted results in the last twelve months.")}</p>
                ) : columns ? (
                  <FillHeight min={260}>{(height) => (
                  <DashboardColumnChart
                    labels={columns.labels}
                    tooltipLabels={columns.tooltipLabels}
                    series={columns.series}
                    emphasis={columns.emphasis}
                    partialIndex={columns.partialIndex}
                    formatValue={money.whole}
                    formatAxis={money.compact}
                    tooltipExtra={columns.extra}
                    ariaLabel={`${columns.title}, ${t("last twelve months")}`}
                    height={height}
                  />
                  )}</FillHeight>
                ) : null}
              </div>
            </Surface>
          </Band>

          <Band index={2} className="md-finance-cell">
            <FinanceProfitLossPanel
              title={t("Profit and loss")}
              subtitle={periodLabel}
              figures={model.current}
              overheadAccounts={dashboard.overheadAccounts}
              formatMoney={money.whole}
              formatPercent={pct}
            />
          </Band>

          <Band index={3} className="md-finance-cell">
            <Surface padding="none" className="md-finance-chart-panel">
              <div className="md-finance-chart-head">
                <div className="min-w-0">
                  <h2 className="md-panel-title">{t("Forecast")}</h2>
                  {forecastView ? (
                    <>
                      <p className="md-finance-chart-figure" dir="ltr">{money.whole(forecastView.nextRevenue)}</p>
                      <p className="md-panel-meta">
                        {t("Revenue expected over the next three months, with")} {money.whole(forecastView.nextProfit)} {t("net profit")}
                        {forecastView.change !== null ? ` · ${forecastView.change > 0 ? "+" : ""}${pct(forecastView.change)} ${t("on the last three months")}` : ""}
                      </p>
                    </>
                  ) : <p className="md-panel-meta">{t("Revenue and net profit, carried forward from the months already closed.")}</p>}
                </div>
                {forecastView ? (
                  <div className="md-finance-legend">
                    {forecastView.series.map((entry) => (
                      <span key={entry.key}><span className="md-finance-legend-line" style={{ background: entry.color }} />{entry.label}</span>
                    ))}
                    <span><span className="md-finance-legend-line md-finance-legend-dashed" />{t("Projected")}</span>
                  </div>
                ) : null}
              </div>
              {forecastView ? (
                <>
                  <div className="md-finance-chart-canvas">
                    <FillHeight min={220}>{(height) => (
                    <DashboardForecastChart
                      key={`${dashboard.legalEntityId}-${window_.current}`}
                      labels={forecastView.labels}
                      tooltipLabels={forecastView.tooltipLabels}
                      series={forecastView.series}
                      formatValue={money.whole}
                      formatAxis={money.compact}
                      ariaLabel={t("Revenue and net profit, recorded and projected")}
                      height={height}
                    />
                    )}</FillHeight>
                  </div>
                  <p className="md-finance-chart-foot">
                    {forecastView.inProgress ? (
                      <span>
                        <strong>{formatMonth(forecastView.inProgress.month, language, "long")}</strong> {t("so far")}: <span dir="ltr">{money.whole(forecastView.inProgress.revenue)}</span> {t("of a projected")} <span dir="ltr">{money.whole(forecastView.projectedCurrent)}</span>
                      </span>
                    ) : null}
                    <span>{t("A straight-line trend through the last")} {forecastView.basis} {t("closed months. The shaded band is the likely range.")}</span>
                  </p>
                </>
              ) : (
                <p className="md-finance-chart-empty">
                  {t("A forecast needs six closed months of posted results.")}
                </p>
              )}
            </Surface>
          </Band>

          <Band index={4} className="md-finance-cell">
            <FinanceWorkingCapitalPanel
              title={t("Cash and working capital")}
              subtitle={t("Today, across every open invoice and bill")}
              cashAtBank={dashboard.cashAtBank}
              receivables={dashboard.receivables}
              payables={dashboard.payables}
              debtorDays={debtorDays(dashboard.receivables.total, dashboard.months, window_.current)}
              formatMoney={money.whole}
            />
          </Band>
          </div>

          <Band index={5} className="md-finance-band md-finance-band-splits">
            <Surface padding="none" className="md-breakdown-panel md-finance-customers-panel">
              <div className="md-breakdown-head">
                <h2 className="md-panel-title">{t("Top customers")}</h2>
                <p className="md-panel-meta">{t("Invoiced sales")} · {periodLabel}</p>
              </div>
              {namedCustomers.length === 0 ? (
                <p className="md-breakdown-empty">{t("No invoiced sales in this period.")}</p>
              ) : (
                <div className="md-breakdown-body">
                  <ul className="md-finance-customer-list">
                    {namedCustomers.map((customer) => (
                      <li key={customer.id} className="md-finance-customer-row">
                        <CustomerAvatar initials={customerInitials(customer.name)} size="sm" className="md-finance-customer-avatar" />
                        <span className="md-finance-customer-name" data-i18n-skip title={customer.name}>{customer.name}</span>
                        <span className="md-finance-customer-metrics">
                          <span className="md-finance-customer-metric">
                            <span>{t("Sales")}</span>
                            <strong dir="ltr">{money.compact(customer.revenue)}</strong>
                            <span className="md-mini-split" aria-hidden="true"><span style={{ transform: `scaleX(${customerMagnitude > 0 ? Math.abs(customer.revenue) / customerMagnitude : 0})`, background: customer.revenue < 0 ? "var(--md-red)" : "var(--md-fin-in)" }} /></span>
                          </span>
                          <span className="md-finance-customer-metric">
                            <span>{t("Invoices")}</span>
                            <strong dir="ltr">{customer.invoices}</strong>
                          </span>
                        </span>
                      </li>
                    ))}
                    {otherCustomers > 0 ? (
                      <li className="md-finance-customer-row md-finance-customer-row-other">
                        <span className="md-finance-customer-other-mark" aria-hidden="true">+{otherCustomers}</span>
                        <span className="md-finance-customer-name">{otherCustomers} {t(otherCustomers === 1 ? "other customer" : "other customers")}</span>
                        <span className="md-finance-customer-metrics">
                          <span className="md-finance-customer-metric">
                            <span>{t("Sales")}</span>
                            <strong dir="ltr">{money.compact(otherCustomerRevenue)}</strong>
                            <span className="md-mini-split" aria-hidden="true"><span style={{ transform: `scaleX(${customerMagnitude > 0 ? Math.abs(otherCustomerRevenue) / customerMagnitude : 0})`, background: otherCustomerRevenue < 0 ? "var(--md-red)" : "var(--md-fin-in)" }} /></span>
                          </span>
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
            </Surface>
            <DashboardBreakdownPanel
              title={t("Shipping modes")}
              subtitle={salesLinkedShare !== null && salesLinkedShare < 0.995
                ? `${t("Sales on jobs")} · ${pct(salesLinkedShare)} ${t("of sales linked to a job")}`
                : `${t("Sales on jobs")} · ${periodLabel}`}
              variant="figures"
              slices={splitSlices(dashboard.modes, modeLabels, "Other modes")}
              formatValue={money.compact}
              emptyLabel={t("No sales linked to jobs in this period.")}
            />
            <DashboardBreakdownPanel
              title={t("Regions")}
              subtitle={t("By the overseas end of each lane")}
              variant="figures"
              slices={splitSlices(dashboard.regions, regionLabels, "Other regions")}
              formatValue={money.compact}
              emptyLabel={t("No sales linked to jobs in this period.")}
            />
          </Band>
        </div>
      </div>
    </div>
  )
}
