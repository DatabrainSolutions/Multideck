import { memo, useMemo, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Activity, ChartAnalysis, ChevronRight, Cpu, Info, MessageCircle, WandSparkles, type LucideIcon } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { CountUpValue } from "@/components/multideck/rolling-digits"
import { DashboardAreaChart } from "@/components/multideck/dashboard-area-chart"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { SectionHeader } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { dexterModelPrices, estimateDexterModelCost } from "@/lib/dexter-costs"
import {
  describeDexterAllowance,
  dexterWorkRates,
  estimateDexterValue,
  type DexterAllowancePace,
} from "@/lib/dexter-value"
import type { DexterUsage } from "@/lib/dexter-api"
import type { AreaChartPoint } from "@/lib/area-chart"
import type { StatusTone } from "@/data/multideck-data"
import usageFieldDeep from "@/assets/ai-usage/usage-field-deep.webp"
import usageFieldDawn from "@/assets/ai-usage/usage-field-dawn.webp"

/* --------------------------------------------------------------------------
   Formatting
   Animated figures are grouped in en-GB and carry their currency as a separate
   word ("USD 6,216"), matching the billing tab. Keeping the symbol out of the
   ramping string means the count-up never has to parse a localised currency.
   -------------------------------------------------------------------------- */

function groupNumber(value: number, fractionDigits = 0) {
  return value.toLocaleString("en-GB", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
}

function moneyDigits(value: number) {
  if (value === 0) return "0"
  if (Math.abs(value) < 10) return groupNumber(value, 2)
  return groupNumber(Math.round(value))
}

function gbp(value: number) {
  return `£${moneyDigits(value)}`
}

function compactTokens(value: number) {
  if (value >= 1_000_000) return `${groupNumber(value / 1_000_000, 1)}M`
  if (value >= 1_000) return `${groupNumber(value / 1_000, 1)}k`
  return groupNumber(value)
}

const paceTone: Record<DexterAllowancePace, StatusTone> = {
  unused: "neutral",
  "on-track": "teal",
  watch: "amber",
  over: "red",
}

const paceLabel: Record<DexterAllowancePace, string> = {
  unused: "No usage yet",
  "on-track": "On pace",
  watch: "Close to the limit",
  over: "Projected to exceed",
}

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

/**
 * A bar that fills from the leading edge. The fill is absolutely positioned so
 * the width tween is contained to that one element — nothing around it
 * re-lays-out per frame — and `inset-inline-start` keeps it correct in RTL.
 */
const Meter = memo(function Meter({
  percent,
  delay = 0,
  className,
  fillClassName,
}: {
  percent: number
  delay?: number
  className?: string
  fillClassName?: string
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <span className={cn("relative block overflow-hidden rounded-full bg-[var(--md-ai-track)]", className)}>
      <motion.span
        aria-hidden="true"
        className={cn("absolute inset-y-0 start-0 block rounded-full bg-[var(--md-accent)]", fillClassName)}
        initial={{ width: "0%" }}
        animate={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        transition={reduceMotion(Boolean(shouldReduceMotion), { ...mdMotion.morph, delay })}
      />
    </span>
  )
})

function Figure({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string
  detail?: string
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11.5px] leading-4 text-[var(--md-subtle)]">{t(label)}</p>
      <p className="mt-1 text-[17px] font-medium tracking-[-0.02em] tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
        <CountUpValue value={value} />
      </p>
      {/* `dir="auto"` keeps a mixed figure-and-words caption in reading order
          under RTL instead of flipping the number to the far edge. */}
      {detail ? <p dir="auto" className="mt-0.5 text-[11.5px] leading-4 text-[var(--md-text)]">{t(detail)}</p> : null}
    </div>
  )
}

/**
 * A panel header that carries one of the motion-blurred field images. Used
 * twice on the page at most: the backdrop is a full-bleed layer under a scrim,
 * never behind body copy that has to stay legible on its own.
 */
function FieldPanel({
  image,
  title,
  description,
  action,
  children,
  className,
}: {
  image: string
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("md-ai-panel overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]", className)}>
      <div className="md-ai-field-header relative isolate flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <img src={image} alt="" aria-hidden="true" loading="lazy" decoding="async" className="md-ai-field-header__image" />
        <span aria-hidden="true" className="md-ai-field-header__scrim" />
        <div className="relative min-w-0">
          <h2 className="text-[15px] font-medium text-[var(--md-ai-field-ink)]">{t(title)}</h2>
          <p className="mt-1 max-w-[62ch] text-pretty text-[12.5px] leading-5 text-[var(--md-ai-field-text)]">{t(description)}</p>
        </div>
        {action ? <div className="relative shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("md-ai-panel flex flex-col overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]", className)}>
      <div className="px-5 py-4">
        <SectionHeader title={t(title)} meta={description ? t(description) : undefined} action={action} metaClassName="text-[12.5px] leading-5" />
      </div>
      {children}
    </section>
  )
}

/* --------------------------------------------------------------------------
   Value hero
   -------------------------------------------------------------------------- */

function ValueHero({
  actions,
  inputTokens,
  outputTokens,
  costUsd,
  hasCostData,
  isLoading,
}: {
  actions: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  hasCostData: boolean
  isLoading: boolean
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [showWorkings, setShowWorkings] = useState(false)
  const value = useMemo(
    () => estimateDexterValue({ actions, inputTokens, outputTokens, costUsd }),
    [actions, inputTokens, outputTokens, costUsd],
  )

  // Both bars are measured against the larger figure, so the cost bar reads as
  // the sliver it usually is rather than being normalised into significance.
  const ceiling = Math.max(value.valueUsd, costUsd, 1)
  const hoursDigits = value.hoursSaved > 0 && value.hoursSaved < 10 ? 1 : 0

  return (
    <section className="md-ai-hero relative isolate overflow-hidden rounded-[var(--md-radius-2xl)]" aria-busy={isLoading}>
      <img src={usageFieldDeep} alt="" aria-hidden="true" decoding="async" className="md-ai-hero__image" />
      <span aria-hidden="true" className="md-ai-hero__scrim" />

      <div className="relative grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,394px)] lg:gap-8">
        <div className="min-w-0 self-center">
          <p className="text-[12px] font-medium text-[var(--md-ai-hero-text)]">{t("Desk time returned this month")}</p>
          <p className="mt-2 flex items-baseline gap-2 text-[var(--md-ai-hero-ink)]" dir="ltr" data-i18n-skip>
            <span className="text-[46px] font-medium leading-[1.02] tracking-[-0.035em] tabular-nums sm:text-[56px]">
              <CountUpValue value={groupNumber(value.hoursSaved, hoursDigits)} />
            </span>
            <span className="text-[16px] font-medium text-[var(--md-ai-hero-text)]">{t(value.hoursSaved === 1 ? "hour" : "hours")}</span>
          </p>
          {actions === 0 ? (
            <p className="mt-3 max-w-[48ch] text-pretty text-[13px] leading-[1.5] text-[var(--md-ai-hero-text)]">
              {t("Nothing recorded for this period yet. Time returned is measured from the tokens each Dexter action uses, so this fills in as the workspace puts Dexter to work.")}
            </p>
          ) : (
          <p className="mt-3 max-w-[48ch] text-pretty text-[13px] leading-[1.5] text-[var(--md-ai-hero-text)]">
            {t("Worth about")}{" "}
            <span className="font-medium text-[var(--md-ai-hero-ink)]" data-i18n-skip>USD {moneyDigits(value.valueUsd)}</span>{" "}
            {t("of desk time across")}{" "}
            <span className="font-medium text-[var(--md-ai-hero-ink)]" data-i18n-skip>{groupNumber(actions)}</span>{" "}
            {t("actions — an average of")}{" "}
            <span className="font-medium text-[var(--md-ai-hero-ink)]" data-i18n-skip>{groupNumber(value.minutesPerAction, value.minutesPerAction < 10 ? 1 : 0)}</span>{" "}
            {t("minutes each, measured from the tokens those actions actually used.")}
          </p>
          )}

          {/* Cost per hour returned leads instead of the raw multiple: token
              spend against desk-rate value produces a number so large it reads
              as a claim, where the unit price reads as a fact. */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="md-ai-hero-chip md-ai-hero-chip--bright" data-i18n-skip>
              {value.costPerHourUsd === null || !hasCostData ? "—" : `USD ${moneyDigits(value.costPerHourUsd)}`}
              <span className="md-ai-hero-chip__label">{t("per hour returned")}</span>
            </span>
            <span className="md-ai-hero-chip" data-i18n-skip>
              USD {moneyDigits(costUsd)}
              <span className="md-ai-hero-chip__label">{t("estimated API cost")}</span>
            </span>
          </div>
        </div>

        <div className="md-ai-glass relative min-w-0 rounded-[var(--md-radius-xl)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] font-medium text-[var(--md-ai-hero-ink)]">{t("Cost against value")}</p>
            <span className="text-[11px] text-[var(--md-ai-hero-text)]">{t("This month")}</span>
          </div>

          <dl className="mt-4 space-y-3.5">
            <LedgerRow
              label="Desk time recovered"
              amount={`USD ${moneyDigits(value.valueUsd)}`}
              percent={(value.valueUsd / ceiling) * 100}
              tone="value"
            />
            <LedgerRow
              label="Estimated API cost"
              amount={hasCostData ? `USD ${moneyDigits(costUsd)}` : "—"}
              percent={(costUsd / ceiling) * 100}
              tone="cost"
              delay={0.06}
            />
          </dl>

          <div className="mt-4 border-t border-[var(--md-ai-hero-line)] pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-[var(--md-ai-hero-text)]">{t("Net value")}</span>
              <span className="text-[19px] font-medium tabular-nums text-[var(--md-ai-hero-ink)]" dir="ltr" data-i18n-skip>
                USD <CountUpValue value={moneyDigits(value.netUsd)} />
              </span>
            </div>
            {value.returnMultiple !== null && hasCostData ? (
              <p className="mt-1 text-end text-[11px] text-[var(--md-ai-hero-text)]">
                <span data-i18n-skip>{groupNumber(value.returnMultiple, value.returnMultiple < 10 ? 1 : 0)}×</span>{" "}
                {t("the estimated token cost")}
              </p>
            ) : null}
          </div>

          {/* The split between finding and writing is the estimate's substance:
              both halves come straight from the recorded token counts. */}
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--md-ai-hero-line)] pt-3.5">
            <SplitFigure
              label="Finding"
              value={`${groupNumber(value.retrievalHours, value.retrievalHours < 10 ? 1 : 0)} h`}
              detail={`${compactTokens(Math.round(value.contextWords))} ${t("words of context read")}`}
            />
            <SplitFigure
              label="Writing"
              value={`${groupNumber(value.draftingHours, value.draftingHours < 10 ? 1 : 0)} h`}
              detail={`${compactTokens(Math.round(value.writtenWords))} ${t("words drafted")}`}
            />
          </dl>

          <button
            type="button"
            className="md-ai-workings-toggle mt-3.5 flex w-full items-center gap-1.5 text-start text-[11.5px] text-[var(--md-ai-hero-text)]"
            aria-expanded={showWorkings}
            onClick={() => setShowWorkings((current) => !current)}
          >
            <Info className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 flex-1">{t("How this is worked out")}</span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                showWorkings ? "rotate-90" : "rtl:rotate-180",
              )}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
          <div className="md-ai-workings" data-open={showWorkings || undefined}>
            <div className="overflow-hidden">
              <p className="pt-2.5 text-[11.5px] leading-[1.55] text-[var(--md-ai-hero-text)]">
                {t("Recorded tokens are converted at")}{" "}
                <span data-i18n-skip>{dexterWorkRates.wordsPerToken}</span> {t("words per token, then read at")}{" "}
                <span data-i18n-skip>{groupNumber(dexterWorkRates.retrievalWordsPerMinute)}</span>{" "}
                {t("words a minute to find something and written at")}{" "}
                <span data-i18n-skip>{dexterWorkRates.draftingWordsPerMinute}</span>{" "}
                {t("words a minute to draft it. Retrieval is capped at")}{" "}
                <span data-i18n-skip>{dexterWorkRates.maxRetrievalMinutesPerAction}</span>{" "}
                {t("minutes per action, and hours are valued at a blended desk rate of USD")}{" "}
                <span data-i18n-skip>{dexterWorkRates.deskRateUsdPerHour}</span>{" "}
                {t("an hour. Cost is the recorded token estimate; caching, tool calls and provider fees are excluded.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* The refresh cue lives on a permanently mounted layer: fading opacity
          avoids the mount/unmount flash a conditional element would give on
          every poll, and it stays still under reduced motion. */}
      <motion.span
        aria-hidden="true"
        className="md-ai-hero__sheen"
        animate={{ opacity: isLoading && !shouldReduceMotion ? 1 : 0 }}
        transition={mdMotion.smooth}
      />
    </section>
  )
}

function SplitFigure({ label, value, detail }: { label: string; value: string; detail: string }) {
  const { t } = useLanguage()

  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[var(--md-ai-hero-text)]">{t(label)}</dt>
      <dd>
        <span className="block text-[15px] font-medium tabular-nums text-[var(--md-ai-hero-ink)]" dir="ltr" data-i18n-skip>{value}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-ai-hero-text)]" data-i18n-skip>{detail}</span>
      </dd>
    </div>
  )
}

function LedgerRow({
  label,
  amount,
  percent,
  tone,
  delay = 0,
}: {
  label: string
  amount: string
  percent: number
  tone: "value" | "cost"
  delay?: number
}) {
  const { t } = useLanguage()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-[12px] text-[var(--md-ai-hero-text)]">{t(label)}</dt>
        <dd className="text-[13px] font-medium tabular-nums text-[var(--md-ai-hero-ink)]" dir="ltr" data-i18n-skip>{amount}</dd>
      </div>
      <Meter
        percent={percent}
        delay={delay}
        className="mt-1.5 h-1.5 bg-[var(--md-ai-hero-track)]"
        fillClassName={tone === "value" ? "bg-[var(--md-ai-hero-value)]" : "bg-[var(--md-ai-hero-cost)]"}
      />
    </div>
  )
}

/* --------------------------------------------------------------------------
   Allowance
   -------------------------------------------------------------------------- */

function AllowanceCard({
  usage,
  isLoading,
  onViewHistory,
}: {
  usage: DexterUsage | null
  isLoading: boolean
  onViewHistory: () => void
}) {
  const { t, language } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const includedGbp = usage?.includedUsageGbp ?? 350
  const usedGbp = usage?.usageGbp ?? 0

  const allowance = useMemo(
    () => describeDexterAllowance({
      // Work in pence so the existing projection helper retains useful
      // decimals without changing its integer-safe chart contract.
      limit: includedGbp * 100,
      used: usedGbp * 100,
      periodStart: usage?.periodStart,
      periodEnd: usage?.periodEnd,
    }),
    [includedGbp, usage?.periodEnd, usage?.periodStart, usedGbp],
  )

  const periodEndLabel = allowance.periodEnd
    ? new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(allowance.periodEnd)
    : ""
  const daysLeft = Math.max(0, Math.round(allowance.remainingDays))
  // The projection only paints the part that has not happened yet, so the two
  // segments read as "spent" and "expected" rather than overlapping claims.
  const projectionWidth = Math.max(0, allowance.projectedPercent - allowance.usedPercent)
  const statusTone: StatusTone = usage?.usageStatus === "paused" || usage?.usageStatus === "extra_limit_reached"
    ? "red"
    : usage?.usageStatus === "near_limit"
      ? "amber"
      : usage?.usageStatus === "extra_usage"
        ? "teal"
        : paceTone[allowance.pace]
  const statusLabel = usage?.usageStatus === "paused"
    ? "Allowance used"
    : usage?.usageStatus === "extra_limit_reached"
      ? "Extra usage limit reached"
      : usage?.usageStatus === "extra_usage"
        ? "Pay as you go active"
        : paceLabel[allowance.pace]
  const extraUsageCopy = usage?.extraUsageEnabled
    ? usage.usageStatus === "extra_usage"
      ? "Included usage is used. New requests are now charged as extra usage."
      : "Pay as you go starts automatically after the included allowance."
    : usage?.extraUsageConfigured && !usage.billingReady
      ? "Billing setup is incomplete. Dexter pauses when the included allowance is used."
      : "Not set up. Dexter pauses when the included allowance is used."

  return (
    <section
      aria-busy={isLoading}
      className="md-ai-panel overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)] sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-[15px] font-medium text-[var(--md-ink)]">
              <ChartAnalysis className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
              <span>{t("Monthly AI allowance")}</span>
            </h2>
            <StatusPill tone={statusTone}>{t(statusLabel)}</StatusPill>
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-[var(--md-text)]">
            {t("Pooled across this workspace")} · {t("Resets")} <span data-i18n-skip>{periodEndLabel}</span> · <span data-i18n-skip>{daysLeft}</span> {t("days left")}
          </p>
        </div>
        <div className="flex items-end gap-4 sm:flex-col sm:items-end">
          <p className="text-[30px] font-medium leading-none tracking-[-0.03em] tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
            <CountUpValue value={gbp(allowance.used / 100)} />
            <span className="text-[var(--md-subtle)]">/{gbp(allowance.limit / 100)}</span>
          </p>
          <Button
            type="button"
            variant="ghost"
            className="md-ai-ghost-button h-8 w-fit rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
            onClick={onViewHistory}
          >
            {t("Usage history")}
            <ChevronRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        role="img"
        aria-label={`${t("Monthly AI allowance")}: ${gbp(allowance.used / 100)} / ${gbp(allowance.limit / 100)}. ${t("Projected")} ${gbp(allowance.projectedActions / 100)}.`}
        data-pace={allowance.pace}
        className="md-ai-allowance-meter relative mt-6 h-[54px] overflow-hidden rounded-[var(--md-radius-lg)]"
      >
        <span aria-hidden="true" className="md-ai-allowance-meter__weave" />

        <motion.span
          aria-hidden="true"
          className="md-ai-allowance-meter__projection absolute inset-y-0"
          style={{ insetInlineStart: `${allowance.usedPercent}%` }}
          initial={{ width: "0%", opacity: 0 }}
          animate={{ width: `${projectionWidth}%`, opacity: 1 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), { ...mdMotion.morph, delay: 0.12 })}
        />

        <motion.span
          aria-hidden="true"
          className="md-ai-allowance-meter__fill absolute inset-y-0 start-0"
          initial={{ width: "0%" }}
          animate={{ width: `${allowance.usedPercent}%` }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.morph)}
        />

        <motion.span
          aria-hidden="true"
          title={`${t("Even pace for today")}: ${Math.round(allowance.pacePercent)}%`}
          className="md-ai-allowance-meter__pace absolute inset-y-0"
          style={{ insetInlineStart: `${allowance.pacePercent}%` }}
          initial={{ opacity: 0, scaleY: 0.4 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), { ...mdMotion.enter, delay: 0.34 })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[11.5px] text-[var(--md-text)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <LegendKey className="md-ai-key--used" label="Used" />
          <LegendKey className="md-ai-key--projected" label="Projected by period end" />
          <LegendKey className="md-ai-key--pace" label="Even pace for today" />
        </div>
        {/* One sentence explains the consequence, including whether paid
            continuation is ready, without exposing provider terminology. */}
        {allowance.pace === "over" ? (
          <p className={usage?.extraUsageEnabled ? "text-[var(--md-text)]" : "text-[var(--md-red)]"}>
            {usage?.extraUsageEnabled ? (
              <><span data-i18n-skip>{gbp((allowance.projectedActions - allowance.limit) / 100)}</span>{" "}{t("projected extra usage at this pace")}</>
            ) : (
              <>{t("Dexter will pause at")} <span data-i18n-skip>{gbp(includedGbp)}</span> {t("unless extra usage is set up")}</>
            )}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 border-t border-[var(--md-line)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Remaining" value={gbp(allowance.remaining / 100)} detail="Included usage left" />
        <Figure label="Current pace" value={gbp(allowance.actionsPerDay / 100)} detail="Usage a day" />
        <Figure
          label="Projected total"
          value={gbp(allowance.projectedActions / 100)}
          detail={`${Math.round(allowance.projectedPercent)}% of the allowance`}
        />
        <Figure
          label="Safe daily pace"
          value={gbp(allowance.sustainablePerDay / 100)}
          detail="Keeps you inside the limit"
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Extra usage")}</p>
            <StatusPill tone={usage?.extraUsageEnabled ? "teal" : "neutral"}>
              {t(usage?.extraUsageEnabled ? "Ready" : "Not set up")}
            </StatusPill>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(extraUsageCopy)}</p>
        </div>
        <div className="shrink-0 text-start sm:text-end">
          <p className="text-[11px] text-[var(--md-subtle)]">{t("Extra usage this month")}</p>
          <p className="mt-0.5 text-[17px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
            {gbp(usage?.extraUsageGbp ?? 0)}
          </p>
          {usage?.extraUsageLimitGbp != null ? (
            <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">
              {t("Monthly limit")} <span dir="ltr" data-i18n-skip>{gbp(usage.extraUsageLimitGbp)}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function LegendKey({ label, className }: { label: string; className: string }) {
  const { t } = useLanguage()
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("md-ai-key", className)} />
      {t(label)}
    </span>
  )
}

/* --------------------------------------------------------------------------
   Where it is going
   -------------------------------------------------------------------------- */

type EngineRow = {
  id: string
  engine: string
  providerModel: string
  reasoningEffort: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

function EngineBreakdown({ engines, hasCostData }: { engines: EngineRow[]; hasCostData: boolean }) {
  const { t } = useLanguage()
  const busiest = Math.max(1, ...engines.map((engine) => engine.totalTokens))
  const recorded = engines.filter((engine) => engine.totalTokens > 0)
  const rows = recorded.length > 0 ? recorded : engines

  return (
    <ul className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
      {rows.map((engine, index) => (
        <li key={engine.id} className="md-ai-row px-5 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-baseline gap-2 text-[13px] font-medium text-[var(--md-ink)]">
              <span className="truncate">{t(engine.engine)}</span>
              <span className="truncate text-[11.5px] font-normal text-[var(--md-subtle)]" data-i18n-skip>{engine.providerModel}</span>
            </p>
            <p className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
              {hasCostData ? `USD ${moneyDigits(engine.costUsd)}` : "—"}
            </p>
          </div>
          <Meter
            percent={(engine.totalTokens / busiest) * 100}
            delay={staggerRamp(index)}
            className="mt-2 h-1.5"
            fillClassName="bg-[linear-gradient(90deg,var(--md-accent),color-mix(in_srgb,var(--md-accent)_58%,var(--md-blue)))]"
          />
          <p className="mt-1.5 text-[11.5px] tabular-nums text-[var(--md-text)]" dir="ltr" data-i18n-skip>
            {compactTokens(engine.inputTokens)} in · {compactTokens(engine.outputTokens)} out · {t(engine.reasoningEffort)}
          </p>
        </li>
      ))}
    </ul>
  )
}

function HeaviestRequests({ usage, onViewHistory }: { usage: DexterUsage | null; onViewHistory: () => void }) {
  const { t, language } = useLanguage()
  const entries = useMemo(() => {
    const recent = usage?.recentEntries ?? []
    return [...recent].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 5)
  }, [usage])
  const heaviest = Math.max(1, ...entries.map((entry) => entry.totalTokens))

  if (entries.length === 0) {
    return (
      <div className="px-5 pb-6 pt-2">
        <p className="text-[13px] text-[var(--md-text)]">{t("Individual requests appear here once Dexter has completed work this month.")}</p>
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
        {entries.map((entry, index) => (
          <li key={entry.id} className="md-ai-row px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="line-clamp-2 min-w-0 text-[13px] leading-[1.4] text-[var(--md-ink)]" title={entry.title} data-i18n-skip>{entry.title}</p>
              <p className="shrink-0 text-[12.5px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
                {compactTokens(entry.totalTokens)}
              </p>
            </div>
            <Meter
              percent={(entry.totalTokens / heaviest) * 100}
              delay={staggerRamp(index)}
              className="mt-2 h-1"
              fillClassName="bg-[color-mix(in_srgb,var(--md-accent)_78%,var(--md-blue))]"
            />
            <p className="mt-1.5 text-[11.5px] text-[var(--md-text)]" dir="ltr" data-i18n-skip>
              {new Intl.DateTimeFormat(language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-auto px-5 py-3.5">
        <Button
          type="button"
          variant="ghost"
          className="md-ai-ghost-button h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-accent)]"
          onClick={onViewHistory}
        >
          {t("See every request")}
          <ChevronRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} aria-hidden="true" />
        </Button>
      </div>
    </>
  )
}

/* --------------------------------------------------------------------------
   Overview
   -------------------------------------------------------------------------- */

export function AiUsageOverview({
  usage,
  isLoading,
  error,
  onRetry,
  onViewHistory,
}: {
  usage: DexterUsage | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onViewHistory: () => void
}) {
  const { t } = useLanguage()
  const [metric, setMetric] = useState<"actions" | "tokens">("actions")

  const actions = usage?.actionsUsed ?? 0
  const totalTokens = usage?.totalTokens ?? 0
  const hasCostData = Array.isArray(usage?.modelBreakdown)

  const engines = useMemo<EngineRow[]>(
    () => (["fast", "smart", "worker"] as const).map((model) => {
      const recorded = usage?.modelBreakdown?.find((entry) => entry.model === model)
      const price = dexterModelPrices[model]
      const providerModel = recorded?.providerModel ?? price.providerModel
      const reasoningEffort = recorded?.reasoningEffort ?? (model === "smart" ? "high" : "medium")
      const inputTokens = recorded?.inputTokens ?? 0
      const outputTokens = recorded?.outputTokens ?? 0
      const cost = estimateDexterModelCost({ model, providerModel, reasoningEffort, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens })
      return {
        id: model,
        engine: model === "smart" ? "Balanced" : model === "fast" ? "Fast" : "Worker",
        providerModel,
        reasoningEffort,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: cost.totalUsd,
      }
    }),
    [usage],
  )

  const costUsd = engines.reduce((total, engine) => total + engine.costUsd, 0)

  const trendPoints = useMemo<AreaChartPoint[]>(() => {
    const trend = usage?.trend ?? []
    if (trend.length === 0) return Array.from({ length: 6 }, (_, index) => ({ label: `W${index + 1}`, value: 0 }))
    return trend.map((point) => ({
      label: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(`${point.weekStart}T00:00:00`)),
      value: metric === "actions" ? point.actions : point.tokens,
    }))
  }, [usage, metric])

  const inputPercent = totalTokens > 0 ? Math.round(((usage?.inputTokens ?? 0) / totalTokens) * 100) : 0
  const tiles: Array<[LucideIcon, string, string, string]> = [
    [Activity, "Dexter actions", groupNumber(actions), "Completed this month"],
    [MessageCircle, "Conversations", groupNumber(usage?.conversationCount ?? 0), "Threads Dexter worked in"],
    [Cpu, "Input tokens", compactTokens(usage?.inputTokens ?? 0), "Workspace context reviewed"],
    [WandSparkles, "Output tokens", compactTokens(usage?.outputTokens ?? 0), "Responses generated"],
  ]

  return (
    <div className="md-ai-usage mt-[var(--md-page-stack-gap)] flex flex-col gap-[var(--md-page-stack-gap)]">
      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Dexter usage is temporarily unavailable")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(error)}</p>
          </div>
          <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium" onClick={onRetry}>
            {t("Try again")}
          </Button>
        </div>
      ) : null}

      <ValueHero
        actions={actions}
        inputTokens={usage?.inputTokens ?? 0}
        outputTokens={usage?.outputTokens ?? 0}
        costUsd={costUsd}
        hasCostData={hasCostData}
        isLoading={isLoading}
      />

      <AllowanceCard usage={usage} isLoading={isLoading} onViewHistory={onViewHistory} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([Icon, label, value, detail]) => (
          <section key={label} className="md-ai-tile group rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <span className="md-ai-tile__icon grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                <Icon className="size-4" strokeWidth={1.35} aria-hidden="true" />
              </span>
              <span className="text-end text-[11px] text-[var(--md-subtle)]">{t(label)}</span>
            </div>
            <p className="mt-5 text-[21px] font-medium tracking-[-0.025em] tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
              <CountUpValue value={value} />
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(detail)}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
        <Panel
          title="Volume over time"
          description="Weekly Dexter activity for the last six weeks."
          action={
            <SegmentedControl
              options={["actions", "tokens"] as const}
              value={metric}
              onChange={setMetric}
              ariaLabel={t("Choose the plotted measure")}
              renderOption={(option) => t(option === "actions" ? "Actions" : "Tokens")}
            />
          }
        >
          <div className="md-ai-chart px-3 pb-4">
            <DashboardAreaChart
              points={trendPoints}
              tone="teal"
              height={214}
              valueLabel={t(metric === "actions" ? "Actions" : "Tokens")}
              formatValue={(value) => (metric === "tokens" ? compactTokens(value) : groupNumber(Math.round(value)))}
            />
          </div>
        </Panel>

        <Panel title="Where it is going" description="Every engine Dexter used, with its recorded tokens and estimated cost.">
          <EngineBreakdown engines={engines} hasCostData={hasCostData} />
          <div className="mt-auto bg-[var(--md-surface-soft)] px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12.5px] font-medium text-[var(--md-ink)]">{t("Context against responses")}</p>
              <p className="text-[12px] tabular-nums text-[var(--md-text)]" dir="ltr" data-i18n-skip>
                {inputPercent}% / {Math.max(0, 100 - inputPercent)}%
              </p>
            </div>
            <Meter percent={inputPercent} className="mt-2 h-2 bg-[var(--md-ai-track-strong)]" fillClassName="bg-[var(--md-blue)]" />
            <p className="mt-2 text-[11.5px] leading-[1.5] text-[var(--md-text)]">
              {t("Input tokens are the workspace context Dexter read; output tokens are what it wrote back.")}{" "}
              {t("Token data was recorded for")}{" "}
              <span className="tabular-nums text-[var(--md-ink)]" data-i18n-skip>{groupNumber(usage?.trackedActions ?? 0)}</span>{" "}
              {t("of")} <span className="tabular-nums text-[var(--md-ink)]" data-i18n-skip>{groupNumber(actions)}</span> {t("actions.")}
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
        <Panel title="Heaviest requests" description="The five requests that used the most tokens this month.">
          <HeaviestRequests usage={usage} onViewHistory={onViewHistory} />
        </Panel>

        <FieldPanel
          image={usageFieldDawn}
          title="Development cost estimate"
          description="Derived from this month's recorded tokens at standard uncached rates. An internal estimate, not an invoice."
          action={
            <span className="md-ai-field-figure" dir="ltr" data-i18n-skip>
              {hasCostData ? `USD ${moneyDigits(costUsd)}` : "—"}
            </span>
          }
        >
          <CostTable engines={engines} hasCostData={hasCostData} />
          <div className="mt-auto grid gap-4 bg-[var(--md-surface-soft)] px-5 py-4 sm:grid-cols-3">
            <Figure label="Total tokens" value={compactTokens(totalTokens)} detail="Recorded this month" />
            <Figure
              label="Average per action"
              value={compactTokens(Math.round(totalTokens / Math.max(1, actions)))}
              detail="Context plus response"
            />
            <Figure
              label="Cost per action"
              value={hasCostData ? `USD ${moneyDigits(costUsd / Math.max(1, actions))}` : "—"}
              detail="At standard uncached rates"
            />
          </div>
        </FieldPanel>
      </div>
    </div>
  )
}

function CostTable({ engines, hasCostData }: { engines: EngineRow[]; hasCostData: boolean }) {
  const { t } = useLanguage()
  const columns = useMemo<DataTableColumn<EngineRow>[]>(() => [
    { id: "engine", label: "Engine", kind: "long-text", width: 150, cellTitle: (engine) => `${t(engine.engine)} · ${engine.providerModel}`, cell: (engine) => <div className="min-w-0"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t(engine.engine)}</p><p className="mt-0.5 truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{engine.providerModel}</p></div> },
    { id: "thinking", label: "Thinking mode", kind: "attribute", width: 120, cell: (engine) => <StatusPill kind="attribute" tone="blue">{t(engine.reasoningEffort)}</StatusPill> },
    { id: "input", label: "Input", kind: "number", width: 100, sortValue: (engine) => engine.inputTokens, cell: (engine) => <span dir="ltr" data-i18n-skip>{hasCostData ? compactTokens(engine.inputTokens) : "—"}</span> },
    { id: "output", label: "Output", kind: "number", width: 100, sortValue: (engine) => engine.outputTokens, cell: (engine) => <span dir="ltr" data-i18n-skip>{hasCostData ? compactTokens(engine.outputTokens) : "—"}</span> },
    { id: "rates", label: "Rates per 1M", kind: "number", width: 132, cell: (engine) => { const price = dexterModelPrices[engine.id as keyof typeof dexterModelPrices]; return <span className="text-[11.5px] text-[var(--md-subtle)]" dir="ltr" data-i18n-skip>${price.inputPerMillionUsd.toFixed(2)} / ${price.outputPerMillionUsd.toFixed(2)}</span> } },
    { id: "cost", label: "Estimated cost", kind: "number", width: 128, sortValue: (engine) => engine.costUsd, cell: (engine) => <span className="font-medium text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{hasCostData ? `USD ${moneyDigits(engine.costUsd)}` : "—"}</span> },
  ], [hasCostData, t])

  return <DataTable ariaLabel="Development cost estimate" columns={columns} rows={engines} getRowKey={(engine) => engine.id} minimumWidth={730} showToolbar={false} showColumnManager={false} className="rounded-none shadow-none" tableClassName="text-[12px]" />
}
