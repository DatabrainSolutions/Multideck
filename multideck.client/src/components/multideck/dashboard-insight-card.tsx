import { DashboardEmptyState, type DashboardEmptyKind } from "./dashboard-empty-state"
import { useId } from "react"
import { ArrowUpRight } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import type { DashboardKpi } from "@/lib/dashboard-live-data"
import "./dashboard-insight-card.css"

type Segment = { label: string; value: number; color: string }
type Point = { label: string; value: number; measured?: boolean }

function Distribution({ segments }: { segments: Segment[] }) {
  const { language } = useLanguage()
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div className="md-insight-distribution">
      <div className="md-insight-track" aria-hidden="true">
        {total > 0 ? segments.filter(segment => segment.value > 0).map(segment => (
          <span key={segment.label} style={{ flex: segment.value, background: segment.color }} />
        )) : null}
      </div>
      <ul className="md-insight-key">
        {segments.map(segment => (
          <li key={segment.label}>
            <i style={{ background: segment.color }} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.value.toLocaleString(language)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One measured KPI, paired with a daily trend or a true part-to-whole split. */
export function DashboardInsightCard({
  kpi,
  trend,
  trendLabel,
  segments,
  onOpen,
  empty,
}: {
  empty?: { kind: DashboardEmptyKind; title: string }
  kpi: DashboardKpi
  trend?: Point[]
  trendLabel?: string
  segments?: Segment[]
  onOpen?: () => void
}) {
  const { t, language } = useLanguage()
  const id = useId()
  const peak = Math.max(1, ...(trend ?? []).map(point => point.value))
  return (
    <section className="md-insight-card" aria-labelledby={id}>
      <header className="md-insight-head">
        <h2 id={id}>{kpi.label}</h2>
        {onOpen ? <button type="button" className="md-insight-open" aria-label={`${t("Open")} ${kpi.label}`} onClick={onOpen}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </button> : null}
      </header>
      <div className="md-insight-body">
        <div className="md-insight-reading">
          <strong className="md-insight-value" dir="ltr">{kpi.value}</strong>
          {kpi.delta ? <span className="md-insight-change" data-direction={kpi.delta.direction}>
            <span aria-hidden="true">{kpi.delta.direction === "up" ? "↗" : kpi.delta.direction === "down" ? "↘" : "→"}</span>
            {kpi.delta.text}
          </span> : null}
        </div>
        {empty ? <DashboardEmptyState {...empty} compact /> : segments ? <Distribution segments={segments} /> : trend?.length ? (
          <figure className="md-insight-trend">
            <svg viewBox={`0 0 ${trend.length * 8} 40`} preserveAspectRatio="none" role="img" aria-label={trendLabel} aria-describedby={`${id}-daily-values`}>
              <title id={`${id}-daily-values`}>{trend.map(point => `${point.label}: ${point.measured === false ? t("Not tracked") : point.value.toLocaleString(language)}`).join("; ")}</title>
              {trend.map((point, index) => <rect
                key={index}
                x={index * 8 + 1}
                y={point.measured === false ? 37 : 40 - Math.max(2, point.value / peak * 40)}
                width={6}
                height={point.measured === false ? 2 : Math.max(2, point.value / peak * 40)}
                rx={1.5}
                data-empty={point.value === 0 || point.measured === false}
                data-unmeasured={point.measured === false}
              />)}
            </svg>
            <figcaption><span>{trendLabel}</span><span>{trend[0].label} – {trend.at(-1)?.label}</span></figcaption>
          </figure>
        ) : null}
        {kpi.detail || kpi.delta ? <p className="md-insight-note">
          {kpi.detail}
          {kpi.detail && kpi.delta ? " · " : ""}
          {kpi.delta?.caption}
        </p> : null}
      </div>
    </section>
  )
}

/** Period outcomes, kept distinct from the sent-quote cohort and pending quotes. */
export function QuoteDecisionBreakdown({
  accepted,
  lost,
  reasons = [],
}: {
  accepted: number
  lost: number
  reasons?: { label: string; count: number }[]
}) {
  const { t, language } = useLanguage()
  const total = accepted + lost
  const recordedReasons = reasons.filter(reason => reason.count > 0).sort((a, b) => b.count - a.count)
  const reasonTotal = recordedReasons.reduce((sum, reason) => sum + reason.count, 0)
  return (
    <div className="md-quote-decisions">
      <div className="md-quote-decision-reading">
        <strong dir="ltr">{total ? `${Math.round(accepted / total * 100)}%` : "—"}</strong>
        <div><span>{t("Win rate")}</span><small>{total.toLocaleString(language)} {t(total === 1 ? "recorded decision" : "recorded decisions")}</small></div>
      </div>
      <Distribution segments={[
        { label: t("Accepted"), value: accepted, color: "var(--md-accent)" },
        { label: t("Lost"), value: lost, color: "var(--md-amber)" },
      ]} />
      {total === 0 ? <p className="md-insight-note">{t("No quote decisions recorded in this period.")}</p> : null}
      {recordedReasons.length ? <div className="md-quote-loss-summary">
        <h3>{t("Loss reasons")}</h3>
        <ul>{recordedReasons.map(reason => <li key={reason.label}>
          <span>{t(reason.label)}</span><strong>{reason.count.toLocaleString(language)}</strong>
          <span className="md-quote-loss-track" aria-hidden="true"><i style={{ width: `${reason.count / reasonTotal * 100}%` }} /></span>
        </li>)}</ul>
      </div> : null}
    </div>
  )
}
