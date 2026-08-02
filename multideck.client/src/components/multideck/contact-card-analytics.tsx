import { useMemo, useState } from "react"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Info, QrCode, ShieldCheck, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { PanelError, PanelMessage, PanelSkeleton } from "@/components/multideck/contact-card-components"
import { useLanguage } from "@/i18n/language-provider"
import { reloadContactCards, type StoreStatus } from "@/lib/contact-card-store"
import {
  automationOutcomeBreakdown,
  browserBreakdown,
  cardTimeline,
  cardTotals,
  channelBreakdown,
  deviceBreakdown,
  locationBreakdown,
  LOCATION_SUPPRESSION_THRESHOLD,
  type BreakdownRow,
  type ContactCard,
} from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

function formatPercent(value: number | null) {
  if (value === null) return "—"
  return `${(value * 100).toFixed(1)}%`
}

function formatCount(value: number) {
  return value.toLocaleString()
}

/* -------------------------------------------------------------------------- */
/* Funnel                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A plain proportional funnel rather than a chart primitive: the question here
 * is "where am I losing people", which reads better as aligned rows with exact
 * values than as a tapering graphic.
 */
function Funnel({ card, muted }: { card: ContactCard; muted: boolean }) {
  const { t } = useLanguage()
  const totals = cardTotals(card)

  const steps = [
    { label: t("Scans"), value: totals.scans, hint: t("The card was opened from the code.") },
    { label: t("Unique visits"), value: totals.uniqueScans, hint: t("Repeat opens inside 30 minutes count once.") },
    { label: t("Started"), value: totals.started, hint: t("Typed into at least one field.") },
    { label: t("Shared details"), value: totals.exchanges, hint: t("Completed the exchange.") },
    { label: t("Leads created"), value: totals.leadsCreated, hint: t("New CRM records, excluding matched duplicates.") },
  ]

  const peak = Math.max(...steps.map((step) => step.value), 1)

  return (
    <ol className="grid gap-2.5">
      {steps.map((step, index) => {
        const previous = index === 0 ? null : steps[index - 1].value
        const dropped = previous !== null && previous > 0 ? 1 - step.value / previous : null

        return (
          <li key={step.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[132px_minmax(0,1fr)_auto]">
            <p className="min-w-0 text-[13px] text-[var(--md-ink)] sm:truncate" title={step.hint}>
              {step.label}
            </p>

            <div className="order-3 h-2 overflow-hidden rounded-full bg-[var(--md-surface-tint)] sm:order-none">
              <div
                className={cn("h-full rounded-full", muted ? "bg-[rgba(90,103,100,0.18)]" : "bg-[var(--md-accent)]")}
                style={{ width: `${Math.max((step.value / peak) * 100, step.value > 0 ? 2 : 0)}%` }}
              />
            </div>

            <p className="flex items-baseline justify-end gap-2 text-right">
              <span className="text-[15px] font-medium text-[var(--md-ink)] tabular-nums">{formatCount(step.value)}</span>
              <span className="w-[52px] text-[12px] text-[var(--md-subtle)] tabular-nums">
                {dropped === null ? "" : dropped > 0 ? `−${(dropped * 100).toFixed(0)}%` : "—"}
              </span>
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Breakdowns                                                                  */
/* -------------------------------------------------------------------------- */

function BreakdownList({ rows, emptyLabel }: { rows: BreakdownRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="py-2 text-[13px] text-[var(--md-subtle)]">{emptyLabel}</p>
  }

  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <p className="min-w-0 truncate text-[13px] text-[var(--md-ink)]">{row.name}</p>
          <p className="flex items-baseline gap-2.5 text-right">
            <span className="text-[13px] font-medium text-[var(--md-ink)] tabular-nums">{formatCount(row.value)}</span>
            <span className="w-[46px] text-[12px] text-[var(--md-subtle)] tabular-nums">{(row.share * 100).toFixed(1)}%</span>
          </p>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--md-surface-tint)]">
            <div className="h-full rounded-full bg-[var(--md-accent-a22)]" style={{ width: `${Math.max(row.share * 100, 1.5)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                    */
/* -------------------------------------------------------------------------- */

const TIMELINE_CONFIG = {
  scans: { label: "Scans", color: "var(--md-blue)" },
  exchanges: { label: "Shared details", color: "var(--md-accent)" },
}

function Timeline({ card, granularity }: { card: ContactCard; granularity: "hour" | "day" }) {
  const { t } = useLanguage()
  const [showTable, setShowTable] = useState(false)
  const points = useMemo(() => cardTimeline(card, granularity), [card, granularity])

  // Fewer ticks than points keeps the axis readable at narrow widths.
  const tickInterval = Math.max(0, Math.ceil(points.length / 7) - 1)

  return (
    <div>
      <div className="rounded-[var(--md-radius-lg)] bg-white/54 p-3 shadow-[var(--md-shadow-line)]">
        <ChartContainer config={TIMELINE_CONFIG} className="md-chart-container h-[240px] w-full min-w-0 max-w-full [aspect-ratio:auto]">
          <ComposedChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="card-scan-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-scans)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-scans)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(90, 103, 100, 0.16)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={tickInterval} tick={{ fill: "var(--md-text)", fontSize: 11 }} />
            <YAxis width={30} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "var(--md-subtle)", fontSize: 11 }} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent className="border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]" indicator="line" />} />
            {/* Two different marks, not two hues: the series stay apart in greyscale. */}
            <Area dataKey="scans" type="monotone" fill="url(#card-scan-area)" stroke="var(--color-scans)" strokeWidth={2} isAnimationActive={false} />
            <Line dataKey="exchanges" type="monotone" stroke="var(--color-exchanges)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ChartContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 text-[12px] text-[var(--md-text)]">
            <span aria-hidden="true" className="h-2 w-4 rounded-full" style={{ backgroundColor: "var(--md-blue)", opacity: 0.35 }} />
            {t("Scans")}
          </span>
          <span className="inline-flex items-center gap-2 text-[12px] text-[var(--md-text)]">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ backgroundColor: "var(--md-accent)" }} />
            {t("Shared details")}
          </span>
        </div>

        <Button
          variant="ghost"
          className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12.5px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
          aria-expanded={showTable}
          onClick={() => setShowTable((open) => !open)}
        >
          <Table2 data-icon="inline-start" strokeWidth={1.4} />
          {showTable ? t("Hide table") : t("View as table")}
        </Button>
      </div>

      {showTable ? (
        <div className="mt-3 max-h-[260px] overflow-auto rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] md-scrollbar">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">{t("Scans and shared details over time")}</caption>
            <thead className="sticky top-0 bg-[var(--md-surface-tint)]">
              <tr className="text-left text-[var(--md-subtle)]">
                <th scope="col" className="px-3 py-2 font-medium">{t("Period")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("Scans")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t("Shared details")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.iso} className="text-[var(--md-ink)]">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{point.label}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.scans}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{point.exchanges}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

function CountingNote() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <div>
      <Button
        variant="ghost"
        className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12.5px] text-[var(--md-text)] hover:text-[var(--md-ink)]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Info data-icon="inline-start" strokeWidth={1.4} />
        {t("How these are counted")}
      </Button>

      {open ? (
        <dl className="mt-2 grid gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3.5 text-[12.5px] leading-5 sm:grid-cols-2">
          {[
            ["Scan", "The public card was opened from the code."],
            ["Unique visit", "Repeat opens from the same device inside 30 minutes count once."],
            ["Started", "The visitor typed into at least one field."],
            ["Shared details", "A validated submission was written successfully."],
            ["Leads created", "New CRM records. Matched duplicates are counted separately."],
            ["Conversion", "Shared details divided by unique visits."],
          ].map(([term, definition]) => (
            <div key={term}>
              <dt className="font-medium text-[var(--md-ink)]">{t(term)}</dt>
              <dd className="text-[var(--md-text)]">{t(definition)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

export function CardAnalyticsPanel({ card, status }: { card: ContactCard; status: StoreStatus }) {
  const { t } = useLanguage()
  const [granularity, setGranularity] = useState<"hour" | "day">("day")

  const totals = cardTotals(card)
  const location = useMemo(() => locationBreakdown(card), [card])
  const hasScans = card.scans.length > 0

  if (status === "loading") {
    return (
      <div className="grid gap-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="p-5">
          <SectionHeader title={t("From scan to lead")} />
          <PanelSkeleton className="mt-4" rows={5} />
        </Surface>
        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Scans and exchanges over time")} />
          <div className="mt-4 h-[240px] animate-pulse rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]" aria-hidden="true" />
        </Surface>
      </div>
    )
  }

  if (status === "error") {
    return (
      <Surface padding="md" className="p-5">
        <PanelError message={t("The analytics for this card could not be loaded.")} onRetry={reloadContactCards} />
      </Surface>
    )
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      <Surface padding="md" className="p-5">
        <SectionHeader
          title={t("From scan to lead")}
          meta={
            hasScans
              ? `${formatPercent(totals.conversion)} ${t("of unique visits ended in a shared contact.")}`
              : t("Nothing has been counted yet.")
          }
        />
        <div className="mt-4">
          {hasScans ? (
            <Funnel card={card} muted={false} />
          ) : (
            <>
              {/* The structure stays visible so an unused card still reads as a card. */}
              <div aria-hidden="true" className="opacity-45">
                <Funnel card={card} muted />
              </div>
              <PanelMessage
                className="mt-4"
                icon={QrCode}
                title={t("No scans yet")}
                body={t("Share the code and the first scans will appear here within seconds.")}
              />
            </>
          )}
        </div>
        <div className="mt-4">
          <CountingNote />
        </div>
      </Surface>

      <Surface padding="md" className="p-5">
        <SectionHeader
          title={t("Scans and exchanges over time")}
          meta={t("Scans are the area, shared details are the line.")}
          action={
            <SegmentedControl
              options={["hour", "day"] as const}
              value={granularity}
              onChange={setGranularity}
              ariaLabel={t("Timeline granularity")}
              disabled={!hasScans}
              renderOption={(option) => (option === "hour" ? t("Hour") : t("Day"))}
            />
          }
        />
        <div className="mt-4">
          {hasScans ? (
            <Timeline card={card} granularity={granularity} />
          ) : (
            <PanelMessage title={t("No timeline yet")} body={t("This appears once the card has been scanned at least once.")} />
          )}
        </div>
      </Surface>

      <div className="grid gap-[var(--md-page-stack-gap)] md:grid-cols-2 2xl:grid-cols-3">
        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Device")} />
          <div className="mt-4">
            <BreakdownList rows={deviceBreakdown(card)} emptyLabel={t("No scans yet.")} />
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Browser")} meta={t("In-app browsers break autofill and contact downloads.")} />
          <div className="mt-4">
            <BreakdownList rows={browserBreakdown(card)} emptyLabel={t("No scans yet.")} />
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Channel")} meta={t("How the card was reached.")} />
          <div className="mt-4">
            <BreakdownList rows={channelBreakdown(card)} emptyLabel={t("No scans yet.")} />
          </div>
        </Surface>
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] lg:grid-cols-2">
        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Approximate location")} meta={t("Country and region only.")} />
          <div className="mt-4">
            <BreakdownList rows={location.rows} emptyLabel={t("No scans yet.")} />
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} />
            <div className="text-[12px] leading-5 text-[var(--md-text)]">
              <p>
                {t("Approximate, from network location. Precise location is never requested and IP addresses are not stored.")}
              </p>
              {location.suppressedRegions > 0 ? (
                <p className="mt-1.5 text-[var(--md-subtle)]">
                  {location.suppressedRegions} {t("regions with fewer than")} <span className="tabular-nums">{LOCATION_SUPPRESSION_THRESHOLD}</span>{" "}
                  {t("scans are grouped as “Other regions” so a single visitor cannot be identified.")}
                </p>
              ) : null}
            </div>
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Automation outcomes")} meta={t("What ran on each exchange.")} />
          <div className="mt-4">
            <BreakdownList rows={automationOutcomeBreakdown(card)} emptyLabel={t("Nothing has run yet.")} />
          </div>
        </Surface>
      </div>
    </div>
  )
}
