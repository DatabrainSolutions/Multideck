import { useMemo } from "react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import type { DashboardKpi, DashboardTrendPoint } from "@/lib/dashboard-live-data"
import type { AreaChartPoint } from "@/lib/area-chart"
import { DashboardAreaChart } from "./dashboard-area-chart"
import { toneToVar } from "./status-pill"
import { Surface } from "./surface"

/**
 * The chart the metric row above drives. One large plot with room to read it,
 * rather than a half-width panel squeezed beside a list — the curve is the only
 * thing on this surface, so it gets the width.
 */
export function DashboardPerformancePanel({
  kpis,
  trends,
  metricLabel,
  className,
}: {
  kpis: DashboardKpi[]
  trends: Record<string, DashboardTrendPoint[]>
  metricLabel: string
  className?: string
}) {
  const { t } = useLanguage()
  const metric = kpis.find((item) => item.label === metricLabel) ?? kpis[0]
  const accent = toneToVar(metric.tone)

  const points = useMemo<AreaChartPoint[]>(() => {
    const series = trends[metric.label] ?? []
    return series.map((point) => ({ label: point.period, value: point.value, target: point.target }))
  }, [metric.label, trends])

  const hasTarget = points.some((point) => point.target !== undefined)

  return (
    <Surface
      padding="none"
      className={cn("md-performance-panel", className)}
      style={{ ["--md-performance-accent" as string]: accent }}
    >
      <div className="md-performance-head">
        <div className="min-w-0">
          <p className="md-panel-eyebrow">{t("Trend")}</p>
          <h2 className="md-performance-title">{metric.label}</h2>
          <p className="md-panel-meta">{metric.detail}</p>
        </div>

        <div className="md-performance-legend">
          <span>
            <span className="md-performance-swatch" style={{ background: accent }} />
            {metric.label}
          </span>
          {hasTarget ? (
            <span>
              <span className="md-performance-swatch md-performance-swatch-dashed" />
              {t("Target")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="md-performance-canvas">
        <DashboardAreaChart
          points={points}
          tone={metric.tone}
          height={268}
          valueLabel={metric.label}
          targetLabel={t("Target")}
        />
      </div>
    </Surface>
  )
}
