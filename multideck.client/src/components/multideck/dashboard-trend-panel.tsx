import { useMemo } from "react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { dashboardSnapshots, dashboardTrends, type DashboardRange } from "@/data/multideck-data"
import type { AreaChartPoint } from "@/lib/area-chart"
import { DashboardAreaChart } from "./dashboard-area-chart"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"

export function DashboardTrendPanel({
  range,
  metricLabel,
  className,
}: {
  range: DashboardRange
  metricLabel: string
  className?: string
}) {
  const { t } = useLanguage()
  const snapshot = dashboardSnapshots[range] ?? dashboardSnapshots.today
  const metric = snapshot.kpis.find((item) => item.label === metricLabel) ?? snapshot.kpis[0]
  const accent = toneToVar(metric.tone)

  const points = useMemo<AreaChartPoint[]>(() => {
    const series = dashboardTrends[range]?.[metric.label] ?? []
    return series.map((point) => ({ label: point.period, value: point.value, target: point.target }))
  }, [range, metric.label])

  const peak = points.reduce((highest, point) => Math.max(highest, point.value), 0)
  const last = points.at(-1)
  const previous = points.at(-2)
  const movement = last && previous ? last.value - previous.value : 0

  return (
    <Surface padding="none" className={cn("md-trend-panel", className)} style={{ ["--md-trend-accent" as string]: accent }}>
      <div className="md-trend-panel-head">
        <div className="min-w-0">
          <p className="md-panel-eyebrow">{t("Trend")}</p>
          <h2 className="md-trend-panel-title">{metric.label}</h2>
        </div>
        <StatusPill tone={metric.tone}>{metric.change}</StatusPill>
      </div>

      {/* Three readings the curve alone cannot give quickly: where it stands, its
          high point, and which way the last period moved. */}
      <dl className="md-trend-facts">
        <div>
          <dt>{t("Now")}</dt>
          <dd dir="ltr">{metric.value}</dd>
        </div>
        <div>
          <dt>{t("Peak")}</dt>
          <dd dir="ltr">{peak}</dd>
        </div>
        <div>
          <dt>{t("Last move")}</dt>
          <dd data-direction={movement > 0 ? "up" : movement < 0 ? "down" : undefined} dir="ltr">
            {movement > 0 ? "+" : ""}
            {movement}
          </dd>
        </div>
        <div className="md-trend-facts-legend">
          <span>
            <span className="md-trend-legend-swatch" style={{ background: accent }} />
            {t("Actual")}
          </span>
          <span>
            <span className="md-trend-legend-swatch md-trend-legend-swatch-dashed" />
            {t("Target")}
          </span>
        </div>
      </dl>

      <div className="md-trend-panel-canvas">
        <DashboardAreaChart
          points={points}
          tone={metric.tone}
          height={216}
          valueLabel={t("Actual")}
          targetLabel={t("Target")}
        />
      </div>
    </Surface>
  )
}
