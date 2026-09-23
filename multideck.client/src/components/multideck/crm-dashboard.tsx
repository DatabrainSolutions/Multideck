import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Inbox, MapPin, Moon, Workflow } from "@/components/icons/hugeicons"
import L from "leaflet"
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { formatFollowUpRecommendation } from "@/lib/follow-up-recommendation"
import type {
  CrmDashboardData,
  CrmDashboardFollowUp,
  CrmFollowUpData,
  CrmFollowUpOpportunity,
  CrmFollowUpReason,
} from "@/lib/lead-api"
import type { StatusTone } from "@/data/operational-data"
import { areaTown, coordinateForArea, crmInitials, type AreaCoordinate } from "@/lib/crm-dashboard"
import { CountUpValue } from "./rolling-digits"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"

/* ── Shared panel shell ──────────────────────────────────────────────────── */

/**
 * Every panel on this dashboard is the same object: a title, an optional quiet
 * measure beside it, an optional link, and a body that grows. One shell is what
 * lets panels of very different content still read as one grid – the sales
 * analysis panels are built from it too.
 */
export function CrmPanel({
  title,
  meta,
  action,
  children,
  className,
  footer,
}: {
  title: string
  /** What the panel is measured over, or how many it holds. Never a sentence. */
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <Surface padding="none" className={cn("md-crm-panel", className)}>
      <div className="md-crm-panel-head">
        <div className="md-crm-panel-heading">
          <h2 className="md-crm-panel-title">{title}</h2>
          {meta ? <p className="md-crm-panel-meta">{meta}</p> : null}
        </div>
        {action ? <div className="md-crm-panel-actions">{action}</div> : null}
      </div>
      {children}
      {footer ? <div className="md-crm-panel-foot">{footer}</div> : null}
    </Surface>
  )
}

const Panel = CrmPanel

export function CrmPanelLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="md-crm-panel-link" onClick={onClick}>
      {label}
      <ArrowRight className="md-crm-panel-link-arrow size-3" strokeWidth={1.6} />
    </Button>
  )
}

const PanelLink = CrmPanelLink

export function CrmEmptyState({ icon: Icon, title, body }: { icon: typeof Inbox; title: string; body: string }) {
  return (
    <div className="md-crm-empty">
      <span className="md-crm-empty-glyph" aria-hidden="true"><Icon className="size-4" strokeWidth={1.4} /></span>
      <p className="md-crm-empty-title">{title}</p>
      <p className="md-crm-empty-body">{body}</p>
    </div>
  )
}

const EmptyState = CrmEmptyState

/**
 * The dashboard's one row shape: a glyph, a two-line body, and a right-hand
 * stack. Every list on the dashboard uses it, which is why a queue entry, a
 * quiet lead and a deal waiting on a next step scan at the same rhythm.
 */
export function CrmRow({
  index,
  accent,
  glyph,
  title,
  sub,
  meter,
  status,
  side,
  sideInteractive,
  onOpen,
  ariaLabel,
  ref,
}: {
  /** Forwarded so a list can hand an exiting row to a popLayout presence. */
  ref?: Ref<HTMLDivElement>
  index: number
  accent?: string
  glyph?: ReactNode
  title: ReactNode
  sub?: ReactNode
  /** A proportional bar between the body and the side, used where rows carry a
   *  comparable number. */
  meter?: ReactNode
  /** A dedicated state rail used by queues where status must scan separately
   *  from the row action. */
  status?: ReactNode
  side: ReactNode
  sideInteractive?: boolean
  onOpen?: () => void
  ariaLabel?: string
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      layout="position"
      className="md-crm-row"
      data-openable={onOpen ? "true" : undefined}
      data-metered={meter ? "true" : undefined}
      data-status-column={status ? "true" : undefined}
      style={accent ? { ["--md-row-accent" as string]: accent } : undefined}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -5 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.028) }}
    >
      {onOpen ? <button type="button" className="md-crm-row-open-target" aria-label={ariaLabel} onClick={onOpen} /> : null}
      {glyph ? <span className="md-crm-row-glyph">{glyph}</span> : null}
      <span className="md-crm-row-body">
        <span className="md-crm-row-title" dir="auto">{title}</span>
        {sub ? <span className="md-crm-row-sub" dir="auto">{sub}</span> : null}
      </span>
      {meter}
      {status ? <span className="md-crm-row-status">{status}</span> : null}
      <span className="md-crm-row-side" data-interactive={sideInteractive ? "true" : undefined}>{side}</span>
    </motion.div>
  )
}

const Row = CrmRow

/** Grown with a transform rather than a width, so a sweep of bars never asks the
 *  panel for a layout pass. */
export function CrmMeter({ share, index, className }: { share: number; index: number; className?: string }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <span className={cn("md-crm-meter", className)} aria-hidden="true">
      <motion.span
        className="md-crm-meter-fill"
        initial={shouldReduceMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: Math.max(share, 0.014) }}
        transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.morph, delay: staggerRamp(index, 0.05) }}
      />
    </span>
  )
}

const Meter = CrmMeter

/* ── Opportunity value ───────────────────────────────────────────────────── */

const gaugeTickCount = 46
const gaugeSweep = 244
const gaugeRadius = 78
const gaugeTickLength = 15
const gaugeSize = (gaugeRadius + gaugeTickLength / 2 + 3) * 2

/**
 * Ordered stages read as progression, so the arc uses one hue deepening across
 * the pipeline rather than five unrelated colours. The ramp is mixed against the
 * panel surface rather than transparency: a 46%-alpha tick on a dark panel reads
 * as an empty track, and none of this arc is empty.
 */
function stageShade(index: number, total: number) {
  const step = total <= 1 ? 1 : index / (total - 1)
  return `color-mix(in srgb, var(--md-accent) ${Math.round(46 + step * 54)}%, var(--md-surface))`
}

/**
 * Open opportunity value, drawn as one arc split by stage. The ticks are the
 * graph and the centre is the answer: an operator should be able to read the
 * total and the shape of it in the same glance.
 *
 * The arc is a value breakdown, not progress towards a target – the CRM
 * snapshot carries no quota, so nothing here implies one.
 */
export function CrmOpportunityValue({
  stages,
  totalValue,
  totalDeals,
  currencyCode,
  formatValue,
  onOpen,
}: {
  stages: CrmDashboardData["pipeline"]
  totalValue: number
  totalDeals: number
  currencyCode: string
  formatValue: (value: number, currency: string) => string
  onOpen?: () => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [hovered, setHovered] = useState<string | null>(null)

  /**
   * Ticks are handed to stages by cumulative share, with one blank slot left
   * between stages so the breakdown is readable as segments rather than one
   * gradient. Every stage carrying value keeps at least one tick, so a stage
   * worth 2% of the pipeline is still on the arc.
   */
  const { ticks, legend } = useMemo(() => {
    const gaps = Math.max(stages.length - 1, 0)
    const usable = Math.max(gaugeTickCount - gaps, stages.length)
    const basis = stages.reduce((sum, stage) => sum + stage.value, 0)
    const weights = stages.map((stage) => (basis > 0 ? stage.value / basis : 1 / Math.max(stages.length, 1)))
    const raw = weights.map((weight) => weight * usable)
    const counts = raw.map((value, index) => (weights[index] > 0 ? Math.max(1, Math.floor(value)) : 0))

    let spare = usable - counts.reduce((sum, count) => sum + count, 0)
    const byRemainder = raw
      .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
      .sort((a, b) => b.remainder - a.remainder)
    for (let step = 0; spare > 0 && byRemainder.length; step += 1) {
      counts[byRemainder[step % byRemainder.length].index] += 1
      spare -= 1
    }

    /** `null` marks a spacer slot: it holds its place on the arc and paints nothing. */
    const assigned: Array<{ stageId: string; color: string } | null> = []
    stages.forEach((stage, index) => {
      if (index > 0) assigned.push(null)
      const color = stageShade(index, stages.length)
      for (let n = 0; n < counts[index]; n += 1) assigned.push({ stageId: stage.stageId, color })
    })

    return {
      ticks: assigned,
      legend: stages.map((stage, index) => ({ ...stage, color: stageShade(index, stages.length) })),
    }
  }, [stages])

  const centre = gaugeSize / 2

  return (
    <Panel
      title={t("Company pipeline value")}
      action={onOpen ? <PanelLink label={t("Deals")} onClick={onOpen} /> : undefined}
      className="md-crm-gauge-panel"
    >
      {stages.length ? (
        <>
          <div className="md-crm-gauge">
            <svg
              className="md-crm-gauge-svg"
              width={gaugeSize}
              height={gaugeSize * 0.86}
              viewBox={`0 0 ${gaugeSize} ${gaugeSize * 0.86}`}
              role="img"
              aria-label={`${t("Company pipeline value")} ${formatValue(totalValue, currencyCode)}`}
            >
              {ticks.map((tick, index) => {
                if (!tick) return null
                const angle = (-gaugeSweep / 2 + (index / (gaugeTickCount - 1)) * gaugeSweep) * (Math.PI / 180)
                const sin = Math.sin(angle)
                const cos = Math.cos(angle)
                const inner = gaugeRadius - gaugeTickLength / 2
                const outer = gaugeRadius + gaugeTickLength / 2
                return (
                  <line
                    key={index}
                    className="md-crm-gauge-tick"
                    data-dimmed={hovered && hovered !== tick.stageId ? "true" : undefined}
                    x1={centre + inner * sin}
                    y1={centre - inner * cos}
                    x2={centre + outer * sin}
                    y2={centre - outer * cos}
                    stroke={tick.color}
                    strokeWidth={5}
                    strokeLinecap="round"
                    // A CSS one-shot rather than 46 motion values: the sweep
                    // costs no React work and no per-frame JavaScript at all,
                    // and the whole arc lands inside a quarter of a second.
                    style={shouldReduceMotion ? undefined : { animationDelay: `${index * 5}ms` }}
                  />
                )
              })}
            </svg>

            <div className="md-crm-gauge-centre">
              <CountUpValue value={formatValue(totalValue, currencyCode)} className="md-crm-gauge-value" />
              <p className="md-crm-gauge-caption">
                {totalDeals} {totalDeals === 1 ? t("open deal") : t("open deals")}
              </p>
            </div>
          </div>

          <div className="md-crm-legend" onMouseLeave={() => setHovered(null)}>
            {legend.map((stage) => (
              <button
                key={stage.stageId}
                type="button"
                className="md-crm-legend-row"
                data-dimmed={hovered && hovered !== stage.stageId ? "true" : undefined}
                onMouseEnter={() => setHovered(stage.stageId)}
                onFocus={() => setHovered(stage.stageId)}
                onBlur={() => setHovered(null)}
                onClick={onOpen}
              >
                <span className="md-crm-legend-dot" style={{ background: stage.color }} aria-hidden="true" />
                <span className="md-crm-legend-name" dir="auto">{stage.stage}</span>
                <span className="md-crm-legend-count" data-i18n-skip dir="ltr">{stage.count}</span>
                <span className="md-crm-legend-value" data-i18n-skip dir="ltr">
                  {formatValue(stage.value, stage.currencyCode || currencyCode)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Workflow}
          title={t("No open deals yet.")}
          body={t("Company deals will build this profile as they move through the pipeline.")}
        />
      )}
    </Panel>
  )
}

/* ── Follow-up queue ─────────────────────────────────────────────────────── */

/**
 * The five reason codes the server returns collapse into four buckets an
 * operator actually sorts by. They stay mutually exclusive, so the chip counts
 * always add up to the queue total.
 */
export type CrmQueueBucket = "reply_due" | "awaiting_reply" | "scheduled" | "never_contacted"

const bucketOfReason: Record<CrmFollowUpReason, CrmQueueBucket> = {
  reply_due: "reply_due",
  first_follow_up: "awaiting_reply",
  second_follow_up: "awaiting_reply",
  scheduled_due: "scheduled",
  never_contacted: "never_contacted",
}

const bucketTone: Record<CrmQueueBucket, StatusTone> = {
  reply_due: "red",
  awaiting_reply: "amber",
  scheduled: "blue",
  never_contacted: "neutral",
}

/** Untranslated keys – each call site runs them through the language layer. */
const bucketLabel: Record<CrmQueueBucket, string> = {
  reply_due: "Reply waiting",
  awaiting_reply: "Awaiting reply",
  scheduled: "Scheduled",
  never_contacted: "Never contacted",
}

const bucketOrder: CrmQueueBucket[] = ["reply_due", "awaiting_reply", "scheduled", "never_contacted"]


function QueueFilterChips({
  counts,
  total,
  active,
  onSelect,
}: {
  counts: Record<CrmQueueBucket, number>
  total: number
  active: CrmQueueBucket | null
  onSelect: (bucket: CrmQueueBucket | null) => void
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const chips: Array<{ key: CrmQueueBucket | null; label: string; count: number; tone: StatusTone }> = [
    { key: null, label: "All", count: total, tone: "teal" },
    ...bucketOrder
      .filter((bucket) => counts[bucket] > 0)
      .map((bucket) => ({ key: bucket, label: bucketLabel[bucket], count: counts[bucket], tone: bucketTone[bucket] })),
  ]

  return (
    <div className="md-crm-chips" role="group" aria-label={t("Filter the follow-up queue")}>
      {chips.map((chip) => {
        const selected = active === chip.key
        return (
          <button
            key={chip.key ?? "all"}
            type="button"
            className="md-crm-chip"
            aria-pressed={selected}
            style={{ ["--md-chip-accent" as string]: toneToVar(chip.tone) }}
            onClick={() => onSelect(chip.key)}
          >
            {/* One indicator for the whole row. Motion interpolates it between
                chips, so switching filters slides rather than blinks – and a
                change mid-flight retargets instead of restarting. */}
            {selected ? (
              <motion.span
                layoutId="md-crm-chip-indicator"
                className="md-crm-chip-indicator"
                aria-hidden="true"
                transition={shouldReduceMotion ? { duration: 0 } : mdMotion.spring}
              />
            ) : null}
            <span className="md-crm-chip-label">{t(chip.label)}</span>
            <span className="md-crm-chip-count" data-i18n-skip dir="ltr">{chip.count}</span>
          </button>
        )
      })}
    </div>
  )
}

const QueueRow = memo(function QueueRow({
  opportunity,
  index,
  onOpen,
  renderCreate,
}: {
  opportunity: CrmFollowUpOpportunity
  index: number
  onOpen: (opportunity: CrmFollowUpOpportunity) => void
  renderCreate: (opportunity: CrmFollowUpOpportunity) => ReactNode
}) {
  const { t } = useLanguage()
  const bucket = bucketOfReason[opportunity.reasonCode]
  const tone = bucketTone[bucket]
  const name = opportunity.personName || opportunity.companyName || opportunity.email || t("Unknown sender")
  const openable = Boolean(opportunity.recordId || opportunity.threadId)

  return (
    <Row
      index={index}
      accent={toneToVar(tone)}
      ariaLabel={`${name} – ${opportunity.subject}`}
      onOpen={openable ? () => onOpen(opportunity) : undefined}
      glyph={<span className="md-crm-avatar" aria-hidden="true">{crmInitials(name)}</span>}
      title={
        <>
          {name}
          {opportunity.companyName && opportunity.companyName !== opportunity.personName ? (
            <span className="md-crm-row-title-aside"> · {opportunity.companyName}</span>
          ) : null}
        </>
      }
      sub={formatFollowUpRecommendation(opportunity.recommendationCode, t)}
      status={<StatusPill kind="status" tone={tone}>{t(bucketLabel[bucket])}</StatusPill>}
      sideInteractive={opportunity.canCreate}
      side={
        <>
          {opportunity.canCreate ? (
            <span>{renderCreate(opportunity)}</span>
          ) : (
            <span className="md-crm-row-age" data-i18n-skip={opportunity.daysWaiting === 0 ? undefined : ""}>
              {opportunity.daysWaiting === 0 ? t("today") : `${opportunity.daysWaiting}${t("d")}`}
              <ArrowRight className="md-crm-row-arrow size-3" strokeWidth={1.6} aria-hidden="true" />
            </span>
          )}
        </>
      }
    />
  )
})

export function CrmFollowUpQueue({
  data,
  onOpen,
  renderCreate,
  onViewAll,
  limit = 6,
}: {
  data: CrmFollowUpData | null
  onOpen: (opportunity: CrmFollowUpOpportunity) => void
  renderCreate: (opportunity: CrmFollowUpOpportunity) => ReactNode
  onViewAll?: () => void
  limit?: number
}) {
  const { t } = useLanguage()
  const [active, setActive] = useState<CrmQueueBucket | null>(null)
  const items = data?.items ?? []

  const counts = useMemo(() => {
    const next: Record<CrmQueueBucket, number> = { reply_due: 0, awaiting_reply: 0, scheduled: 0, never_contacted: 0 }
    for (const item of items) next[bucketOfReason[item.reasonCode]] += 1
    return next
  }, [items])

  const visible = useMemo(
    () => (active ? items.filter((item) => bucketOfReason[item.reasonCode] === active) : items).slice(0, limit),
    [items, active, limit],
  )
  const select = useCallback((bucket: CrmQueueBucket | null) => setActive(bucket), [])

  const listRef = useRef<HTMLDivElement>(null)
  const [reserve, setReserve] = useState<number>()

  /** Recorded on the unfiltered pass only, so the reserve always describes the
   *  full queue rather than whatever the last filter left behind. */
  useLayoutEffect(() => {
    if (active || !listRef.current) return
    setReserve(listRef.current.getBoundingClientRect().height)
  }, [active, items])

  return (
    <Panel
      title={t("Who needs following up")}
      action={items.length && onViewAll ? <PanelLink label={t("Inbox")} onClick={onViewAll} /> : undefined}
    >
      {items.length ? (
        <>
          <div className="md-crm-controls">
            <QueueFilterChips counts={counts} total={items.length} active={active} onSelect={select} />
          </div>
          <div className="md-crm-queue-columns">
            <span className="md-crm-queue-status-label">{t("Status")}</span>
          </div>
          {/* The list holds the height of the unfiltered queue. Without it a
              filter down to two rows collapses the panel and shunts everything
              below it up the page – the filter would move more of the screen
              than it changes. Measured rather than assumed, because a row
              offering a Create action is taller than one that is not. */}
          <div ref={listRef} className="md-crm-list" style={reserve ? { minHeight: reserve } : undefined}>
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((opportunity, index) => (
                <QueueRow
                  key={opportunity.id}
                  opportunity={opportunity}
                  index={index}
                  onOpen={onOpen}
                  renderCreate={renderCreate}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Inbox}
          title={t("No follow-up opportunities right now.")}
          body={t("Actionable replies, overdue conversations, and due CRM actions will appear here automatically.")}
        />
      )}
    </Panel>
  )
}

/* ── Leads by area ───────────────────────────────────────────────────────── */


function FitAreaBounds({ points }: { points: AreaCoordinate[] }) {
  const map = useMap()

  useEffect(() => {
    const fit = () => {
      map.invalidateSize({ pan: false })
      if (points.length === 1) {
        map.setView([points[0][0], points[0][1]], 7, { animate: false })
        return
      }
      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng))), {
          animate: false,
          padding: [28, 28],
          maxZoom: 7,
        })
      }
    }

    const frame = window.requestAnimationFrame(fit)
    const settled = window.setTimeout(fit, 220)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit)
    observer?.observe(map.getContainer())

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settled)
      observer?.disconnect()
    }
  }, [map, points])

  return null
}

/**
 * Where the leads are on an actual geographic canvas. Dot area and opacity
 * encode lead count, while the basemap preserves the spatial relationship an
 * operator needs when planning local coverage.
 */
export function CrmAreaHeatmap({
  areas,
  onOpen,
  limit = 12,
}: {
  areas: CrmDashboardData["areas"]
  onOpen?: () => void
  limit?: number
}) {
  const { t } = useLanguage()
  const mappedAreas = useMemo(() => (
    areas.flatMap((area) => {
      const coordinate = coordinateForArea(area.label)
      return coordinate ? [{ ...area, town: areaTown(area.label), coordinate }] : []
    })
  ), [areas])
  const points = useMemo(() => {
    const ranked = [...mappedAreas].sort((a, b) => b.count - a.count).slice(0, limit)
    const peak = Math.max(...ranked.map((area) => area.count), 1)
    return ranked.map((area) => ({ ...area, share: area.count / peak }))
  }, [limit, mappedAreas])

  const total = areas.reduce((sum, area) => sum + area.count, 0)
  const mappedTotal = mappedAreas.reduce((sum, area) => sum + area.count, 0)
  const unmappedTotal = Math.max(total - mappedTotal, 0)
  const hiddenMappedAreaCount = Math.max(mappedAreas.length - points.length, 0)
  const boundsPoints = useMemo(() => points.map((point) => point.coordinate), [points])

  return (
    <Panel
      title={t("Leads by area")}
      action={points.length && onOpen ? <PanelLink label={t("Accounts")} onClick={onOpen} /> : undefined}
    >
      {points.length ? (
        <div className="md-crm-heat">
          <div className="md-crm-heat-plot">
            <MapContainer
              center={[54.4, -3.2]}
              zoom={5}
              minZoom={4}
              maxZoom={9}
              zoomControl={false}
              scrollWheelZoom={false}
              className="md-booking-map md-crm-area-map absolute inset-0 h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <FitAreaBounds points={boundsPoints} />
              {points.map((point) => (
                <CircleMarker
                  key={point.key}
                  center={[point.coordinate[0], point.coordinate[1]]}
                  radius={4 + Math.sqrt(point.share) * 6}
                  pathOptions={{
                    className: "md-crm-area-dot",
                    color: "var(--md-surface)",
                    fillColor: "var(--md-accent)",
                    fillOpacity: 0.5 + point.share * 0.4,
                    opacity: 0.9,
                    weight: 1.5,
                  }}
                >
                  <Tooltip permanent direction="top" offset={[0, -5]} opacity={1}>
                    <span dir="auto">{point.town}</span> · <span dir="ltr">{point.count}</span> {point.count === 1 ? t("lead") : t("leads")}
                  </Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <p className="md-crm-heat-foot">
            <span>{mappedTotal} {mappedTotal === 1 ? t("lead mapped") : t("leads mapped")}</span>
            <span className="md-crm-heat-foot-value">
              {hiddenMappedAreaCount ? <><span data-i18n-skip dir="ltr">{hiddenMappedAreaCount}</span> {hiddenMappedAreaCount === 1 ? t("more mapped area not shown") : t("more mapped areas not shown")}</> : null}
              {hiddenMappedAreaCount && unmappedTotal ? <span aria-hidden="true"> · </span> : null}
              {unmappedTotal ? <><span data-i18n-skip dir="ltr">{unmappedTotal}</span> {unmappedTotal === 1 ? t("without an area") : t("without areas")}</> : hiddenMappedAreaCount ? null : t("All areas mapped")}
            </span>
          </p>
        </div>
      ) : (
        <EmptyState
          icon={MapPin}
          title={t(areas.length ? "No mappable areas yet." : "No areas on file yet.")}
          body={t(areas.length ? "Add a recognised town or city to each account address to place its leads on the map." : "Leads get an area once their account has an address recorded.")}
        />
      )}
    </Panel>
  )
}

/* ── Activity ────────────────────────────────────────────────────────────── */

type FeedEntry = CrmDashboardData["activity"][number] & { repeats: number; day: string }

const dayMs = 86_400_000

function localDayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
}

/**
 * What has been logged against your records inside the dashboard period,
 * grouped by day. Consecutive identical entries on one record collapse into a
 * single line with a count: six "details updated" rows in a row are one event
 * worth knowing about, not six.
 */
export function CrmActivityFeed({
  activity,
  periodDays,
  onOpenRecord,
  limit = 7,
}: {
  activity: CrmDashboardData["activity"]
  periodDays: number
  onOpenRecord?: (item: CrmDashboardData["activity"][number]) => void
  limit?: number
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  const groups = useMemo(() => {
    const now = new Date()
    const since = now.getTime() - periodDays * dayMs
    const entries: FeedEntry[] = []
    for (const item of activity) {
      const at = new Date(item.at)
      if (Number.isNaN(at.getTime()) || at.getTime() < since) continue
      const day = localDayKey(at)
      const previous = entries[entries.length - 1]
      if (previous && previous.day === day && previous.subject === item.subject && previous.leadId === item.leadId && previous.dealId === item.dealId) {
        previous.repeats += 1
        continue
      }
      entries.push({ ...item, repeats: 1, day })
    }
    const today = localDayKey(now)
    const yesterday = localDayKey(new Date(now.getTime() - dayMs))
    const dayLabel = new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" })
    const grouped: Array<{ day: string; label: string; items: FeedEntry[] }> = []
    for (const entry of entries.slice(0, limit)) {
      let group = grouped[grouped.length - 1]
      if (!group || group.day !== entry.day) {
        const label = entry.day === today ? t("Today") : entry.day === yesterday ? t("Yesterday") : dayLabel.format(new Date(entry.at))
        group = { day: entry.day, label, items: [] }
        grouped.push(group)
      }
      group.items.push(entry)
    }
    return { grouped, total: entries.length }
  }, [activity, language, limit, periodDays, t])

  const time = useMemo(() => new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }), [language])
  let order = 0

  return (
    <Panel
      title={t("Activity")}
      meta={periodDays === 365 ? t("Last 12 months") : `${t("Last")} ${periodDays} ${t("days")}`}
    >
      {groups.grouped.length ? (
        <div className="md-crm-feed">
          <AnimatePresence initial={false} mode="popLayout">
          {groups.grouped.map((group) => (
            <motion.div
              key={group.day}
              layout="position"
              className="md-crm-feed-day"
              exit={shouldReduceMotion ? undefined : { opacity: 0, transition: mdMotion.exit }}
              transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
            >
              <p className="md-crm-feed-day-label">{group.label}</p>
              <div className="md-crm-feed-items">
                {group.items.map((item) => {
                  const index = order++
                  const openable = Boolean(onOpenRecord && (item.leadId || item.dealId))
                  const body = (
                    <>
                      <span className="md-crm-feed-node" aria-hidden="true" />
                      <span className="md-crm-feed-body">
                        <span className="md-crm-feed-subject" dir="auto">
                          {item.subject}
                          {item.repeats > 1 ? <span className="md-crm-feed-repeats" data-i18n-skip dir="ltr">×{item.repeats}</span> : null}
                        </span>
                        {item.summary ? <span className="md-crm-feed-summary" dir="auto">{item.summary}</span> : null}
                      </span>
                      <span className="md-crm-feed-when" data-i18n-skip dir="ltr">{time.format(new Date(item.at))}</span>
                    </>
                  )
                  return (
                    <motion.div
                      key={item.id}
                      className="md-crm-feed-row"
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.03) }}
                    >
                      {openable ? (
                        <button type="button" className="md-crm-feed-target" onClick={() => onOpenRecord?.(item)}>{body}</button>
                      ) : (
                        <div className="md-crm-feed-target">{body}</div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
          {groups.total > limit ? (
            <p className="md-crm-feed-more"><span data-i18n-skip dir="ltr">{groups.total - limit}</span> {t("earlier in this period")}</p>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title={t("Nothing logged in this period.")}
          body={t("Calls, emails and notes logged against your records will appear here.")}
        />
      )}
    </Panel>
  )
}

/* ── Leads gone quiet ────────────────────────────────────────────────────── */

/**
 * Open leads with no contact inside the inactivity window. Ranked by what is
 * sitting on them, then by how long they have been silent, so the lead you are
 * quietly losing the most on is always first. A value bar is only drawn when at
 * least one lead carries a value – a column of empty bars says nothing.
 */
export function CrmQuietLeads({
  leads,
  inactivityDays,
  openLeads,
  formatValue,
  formatDate,
  onOpenLead,
  onViewAll,
  limit = 6,
}: {
  leads: CrmDashboardFollowUp[]
  inactivityDays: number
  /** All open leads, so the panel can say what share has gone quiet. */
  openLeads?: number
  formatValue: (value: number, currency: string) => string
  formatDate: (value: string) => string
  onOpenLead: (leadId: string) => void
  onViewAll?: () => void
  limit?: number
}) {
  const { t } = useLanguage()
  const ranked = useMemo(
    () => [...leads].sort((a, b) =>
      (b.opportunityValue ?? 0) - (a.opportunityValue ?? 0)
      || Number(b.neverContacted) - Number(a.neverContacted)
      || (b.contactAgeDays ?? 0) - (a.contactAgeDays ?? 0)
      || a.companyName.localeCompare(b.companyName),
    ).slice(0, limit),
    [leads, limit],
  )
  const hasValues = ranked.some((lead) => (lead.opportunityValue ?? 0) > 0)
  const peak = Math.max(...ranked.map((lead) => lead.opportunityValue ?? 0), 1)
  const hidden = Math.max(leads.length - ranked.length, 0)
  const neverContacted = leads.filter((lead) => lead.neverContacted).length
  // The closing line gives a short list a floor, so the space above it reads as
  // room rather than as something that failed to load.
  const summary = leads.length ? [
    openLeads ? `${leads.length} ${t("of")} ${openLeads} ${openLeads === 1 ? t("open lead") : t("open leads")}` : null,
    neverContacted ? `${neverContacted} ${t("never contacted")}` : null,
    hidden ? `${hidden} ${t("not shown")}` : null,
  ].filter(Boolean).join(" · ") : ""

  return (
    <Panel
      title={t("Gone quiet")}
      meta={`${t("No contact in")} ${inactivityDays} ${t("days")}`}
      action={leads.length && onViewAll ? <PanelLink label={t("Leads")} onClick={onViewAll} /> : undefined}
      footer={summary || undefined}
    >
      {ranked.length ? (
        <div className="md-crm-list" data-valued={hasValues ? "true" : undefined}>
          <AnimatePresence initial={false} mode="popLayout">
          {ranked.map((lead, index) => (
            <Row
              key={lead.id}
              index={index}
              accent={toneToVar(lead.neverContacted ? "red" : "amber")}
              ariaLabel={lead.companyName}
              onOpen={() => onOpenLead(lead.id)}
              glyph={<span className="md-crm-avatar" aria-hidden="true">{crmInitials(lead.companyName)}</span>}
              title={
                <>
                  {lead.companyName}
                  {lead.decisionMaker ? <span className="md-crm-row-title-aside"> · {lead.decisionMaker}</span> : null}
                </>
              }
              sub={[lead.stage, lead.laneContext].filter(Boolean).join(" · ")}
              meter={hasValues ? <Meter share={(lead.opportunityValue ?? 0) / peak} index={index} /> : undefined}
              side={
                <>
                  {hasValues ? (
                    <span className="md-crm-row-value" data-i18n-skip dir="ltr">
                      {lead.opportunityValue ? formatValue(lead.opportunityValue, lead.currencyCode) : t("No value")}
                    </span>
                  ) : null}
                  <span className="md-crm-row-age" data-tone={lead.neverContacted ? "red" : undefined}>
                    {lead.neverContacted
                      ? t("Never contacted")
                      : lead.contactAgeDays != null
                        ? <><span data-i18n-skip dir="ltr">{lead.contactAgeDays}</span>&nbsp;{t("days quiet")}</>
                        : lead.lastContactAt
                          ? `${t("Quiet since")} ${formatDate(lead.lastContactAt)}`
                          : t("No contact recorded")}
                    <ArrowRight className="md-crm-row-arrow size-3" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                </>
              }
            />
          ))}
          </AnimatePresence>
        </div>
      ) : (
        <EmptyState
          icon={Moon}
          title={t("Every open lead has been contacted recently.")}
          body={t("Leads land here once they pass the inactivity window without a conversation.")}
        />
      )}
    </Panel>
  )
}

/* ── Loading ─────────────────────────────────────────────────────────────── */

/**
 * The skeleton holds the loaded page's geometry, so arriving data changes
 * opacity only. Nothing reflows and the scroll position never jumps.
 */
export function CrmDashboardSkeleton() {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div
      className={cn("md-crm-skeleton", shouldReduceMotion && "md-crm-skeleton-still")}
      role="status"
      aria-label={t("Loading your CRM dashboard…")}
    >
      <div className="md-crm-skeleton-kpis">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className="md-crm-skeleton-block md-crm-skeleton-kpi" style={{ animationDelay: `${index * 60}ms` }} />
        ))}
      </div>
      <div className="md-crm-lead">
        <span className="md-crm-skeleton-block md-crm-skeleton-panel-lg" style={{ animationDelay: "180ms" }} />
        <span className="md-crm-skeleton-block md-crm-skeleton-panel-lg" style={{ animationDelay: "220ms" }} />
      </div>
      <div className="md-crm-trio">
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="md-crm-skeleton-block md-crm-skeleton-panel" style={{ animationDelay: `${270 + index * 40}ms` }} />
        ))}
      </div>
    </div>
  )
}

/* ── Page entrance ───────────────────────────────────────────────────────── */

/**
 * One settling group rather than a dozen independent fades – the same cadence
 * the operations dashboard arrives on, so the two screens feel like one product.
 */
export function CrmBand({
  index,
  className,
  count,
  children,
}: {
  index: number
  className?: string
  /** How many panels the band holds, for bands whose column split depends on it. */
  count?: number
  children: ReactNode
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      data-count={count}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.042) }}
    >
      {children}
    </motion.div>
  )
}
