import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, MoonStar, Sunrise } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import {
  computeCityClock,
  getLocalTimeZone,
  getLocalZoneLabel,
  useMinuteTick,
  type CityClock,
} from "@/lib/clock"
import { cityQueues, timezoneWorkQueues, type StatusTone } from "@/data/multideck-data"
import { useClockDisplayMode, type ClockDisplayMode } from "@/lib/user-preferences"
import { RollingDigits } from "./rolling-digits"
import { StatusPill, toneToVar } from "./status-pill"

/** The operating window every clock is measured against. */
const dayStartHour = 8
const dayEndHour = 17

/**
 * "OOH" is the right shorthand on a dense chip, but the detail popover has room
 * for language that reads properly out loud to a screen reader.
 */
function getLongStatusLabel(tone: StatusTone) {
  if (tone === "amber") return "Closing soon"
  if (tone === "green") return "Working"
  return "Clocked off"
}

/** How far through the working day a city is, as a 0-1 ratio. */
function getDayProgress(clock: CityClock) {
  const [, minutesRaw = "0"] = clock.time.split(":")
  const decimalHour = clock.hour + Number(minutesRaw) / 60
  return Math.min(Math.max((decimalHour - dayStartHour) / (dayEndHour - dayStartHour), 0), 1)
}

function ClockFace({ time, tone, size = 34 }: { time: string; tone: StatusTone; size?: number }) {
  const [hoursRaw = "0", minutesRaw = "0"] = time.split(":")
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  const hourDegrees = ((hours % 12) + minutes / 60) * 30
  const minuteDegrees = minutes * 6
  const handColor = tone === "neutral" ? "var(--md-subtle)" : toneToVar(tone)
  const transition = { type: "spring" as const, stiffness: 220, damping: 26, mass: 0.7 }

  return (
    <span
      className={cn("md-clock-face relative shrink-0 rounded-full", tone === "neutral" && "md-clock-face-ooh")}
      style={{ width: size, height: size }}
      role="img"
      aria-hidden="true"
    >
      <motion.span
        className="md-clock-hand md-clock-hand-hour"
        style={{ height: size * 0.26 }}
        animate={{ rotate: hourDegrees }}
        transition={transition}
      />
      <motion.span
        className="md-clock-hand md-clock-hand-minute"
        style={{ height: size * 0.36, background: handColor }}
        animate={{ rotate: minuteDegrees }}
        transition={transition}
      />
      <span className="md-clock-pin" style={{ background: handColor }} />
    </span>
  )
}

function StatusDot({ tone, animate: shouldAnimate }: { tone: StatusTone; animate: boolean }) {
  return (
    <span className="relative grid size-2 shrink-0 place-items-center" aria-hidden="true">
      <span className="size-2 rounded-full" style={{ background: toneToVar(tone) }} />
      {tone === "amber" && shouldAnimate ? (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 2px rgba(221,138,43,0.42)" }}
          animate={{ opacity: [0.65, 0, 0.65], scale: [1, 2.1, 1] }}
          transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity }}
        />
      ) : null}
    </span>
  )
}

type ClockChipProps = {
  clock: CityClock
  isLocal: boolean
  index: number
  focused: boolean
  displayMode: ClockDisplayMode
  onFocusChip: (index: number) => void
  onKeyNavigate: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void
  onViewQueue?: (code: string) => void
}

/**
 * One city in the rail. Memoised on the values it paints, so the minute tick
 * only re-renders the cities whose clock actually moved.
 */
const ClockChip = memo(function ClockChip({
  clock,
  isLocal,
  index,
  focused,
  displayMode,
  onFocusChip,
  onKeyNavigate,
  onViewQueue,
}: ClockChipProps) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const queue = timezoneWorkQueues[clock.code]
  const statusLabel = getLongStatusLabel(clock.tone)
  const progress = getDayProgress(clock)
  const isOoh = clock.tone === "neutral"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          tabIndex={focused ? 0 : -1}
          onFocus={() => onFocusChip(index)}
          onKeyDown={(event) => onKeyNavigate(event, index)}
          data-tone={clock.tone}
          whileHover={shouldReduceMotion ? undefined : { y: -2 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
          aria-label={`${clock.city} ${clock.time}, ${t(statusLabel)}`}
          className="md-clock-chip"
        >
          <span className="md-clock-chip-top">
            <span className="md-clock-chip-code" dir="ltr">
              {clock.code}
              {isLocal ? <span className="md-clock-chip-you">{t("You")}</span> : null}
            </span>
            <StatusDot tone={clock.tone} animate={!shouldReduceMotion} />
          </span>

          <span className="md-clock-chip-main">
            {displayMode === "analogue" ? <ClockFace time={clock.time} tone={clock.tone} size={28} /> : null}
            <RollingDigits value={clock.time} label={`${clock.city} ${clock.time}`} className="md-clock-chip-time" />
          </span>

          <span className="md-clock-chip-foot">
            <span className="md-clock-chip-city">{clock.city}</span>
            <span className="md-clock-chip-delta" dir="ltr">{clock.comparison}</span>
          </span>

          <span className="md-clock-chip-track" aria-hidden="true">
            <motion.span
              className="md-clock-chip-fill"
              style={{ background: isOoh ? "var(--md-subtle)" : toneToVar(clock.tone) }}
              initial={false}
              animate={{ scaleX: isOoh ? 0 : Math.max(progress, 0.02) }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            />
          </span>
        </motion.button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={10} className="md-clock-popover w-[300px] gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-[var(--md-ink)]">{clock.city}</p>
            <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]" dir="ltr">
              {clock.code} · {clock.comparison}
            </p>
            <StatusPill tone={clock.tone === "neutral" ? "neutral" : clock.tone} className="mt-2">
              <span className="inline-flex items-center gap-1.5">
                {isOoh ? <MoonStar className="size-3" strokeWidth={1.3} /> : <Sunrise className="size-3" strokeWidth={1.3} />}
                {t(statusLabel)}
              </span>
            </StatusPill>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <ClockFace time={clock.time} tone={clock.tone} size={54} />
            <RollingDigits value={clock.time} className="text-[17px] font-medium text-[var(--md-ink)]" />
          </div>
        </div>

        <div className="md-clock-popover-band">
          <span className="md-clock-popover-band-label">{isOoh ? t("Outside working hours") : t("Working day")}</span>
          <span className="md-clock-chip-track md-clock-popover-track" aria-hidden="true">
            <motion.span
              className="md-clock-chip-fill"
              style={{ background: isOoh ? "var(--md-subtle)" : toneToVar(clock.tone) }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: isOoh ? 0.04 : Math.max(progress, 0.02) }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            />
          </span>
          <span className="md-clock-popover-band-scale" dir="ltr">
            <span>08:00</span>
            <span>17:00</span>
          </span>
        </div>

        {queue ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                [t("Open RFQs"), queue.openRfqs, "neutral"],
                [t("Need action"), queue.needAction, "amber"],
                [t("Ready"), queue.readyToQuote, "green"],
              ].map(([label, value, cellTone]) => (
                <div key={label as string} className="md-clock-popover-metric">
                  <p
                    className="text-[17px] font-medium leading-none tabular-nums"
                    style={{ color: cellTone === "neutral" ? "var(--md-ink)" : toneToVar(cellTone as StatusTone) }}
                    dir="ltr"
                  >
                    {value as number}
                  </p>
                  <p className="mt-1 text-[10px] leading-tight text-[var(--md-text)]">{label as string}</p>
                </div>
              ))}
            </div>
            <p className="text-[11.5px] leading-4 text-[var(--md-text)]">
              {t("Pickup cutoff")}{" "}
              <span className="font-medium text-[var(--md-ink)]" dir="ltr">
                {queue.cutoff.replace(" local", "")}
              </span>{" "}
              · {queue.cutoffCountdown} {t("left")}
            </p>
            {onViewQueue ? (
              <Button
                type="button"
                variant="ghost"
                className="md-clock-popover-action"
                onClick={() => onViewQueue(clock.code)}
              >
                {t("View outbound queue")}
                <ArrowRight data-icon="inline-end" strokeWidth={1.2} />
              </Button>
            ) : null}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
})

export function ClockRail({
  onViewQueue,
  className,
}: {
  onViewQueue?: (code: string) => void
  className?: string
}) {
  const now = useMinuteTick()
  const displayMode = useClockDisplayMode()
  const { t, direction } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const localTimeZone = useMemo(() => getLocalTimeZone(), [])
  const clocks = useMemo<CityClock[]>(
    () => cityQueues.map((city) => computeCityClock(city, now, localTimeZone)),
    [now, localTimeZone],
  )
  const localLabel = useMemo(() => getLocalZoneLabel(now, localTimeZone), [now, localTimeZone])
  const workingCount = clocks.filter((clock) => clock.tone !== "neutral").length

  /** Roving tabindex: the rail is one tab stop and the arrows walk the cities. */
  const handleKeyNavigate = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight"
      const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft"
      const step = event.key === forward ? 1 : event.key === backward ? -1 : 0
      const isEdge = event.key === "Home" || event.key === "End"
      if (step === 0 && !isEdge) return

      event.preventDefault()
      const next = isEdge
        ? event.key === "Home"
          ? 0
          : clocks.length - 1
        : Math.min(Math.max(index + step, 0), clocks.length - 1)

      setFocusedIndex(next)
      const buttons = trackRef.current?.querySelectorAll<HTMLButtonElement>("button.md-clock-chip")
      const node = buttons?.[next]
      node?.focus()
      node?.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth", block: "nearest", inline: "nearest" })
    },
    [clocks.length, direction, shouldReduceMotion],
  )

  return (
    <section className={cn("md-clock-rail", className)} aria-label={t("World clock")}>
      <div className="md-clock-rail-head">
        <div className="flex min-w-0 items-center gap-2">
          <p className="md-clock-rail-title">{t("World clock")}</p>
          <span className="md-clock-rail-meta" dir="ltr">
            {localLabel}
          </span>
          <span className="md-clock-rail-count">
            {workingCount}/{clocks.length} {t("open")}
          </span>
        </div>
        <div className="md-clock-rail-legend">
          {(
            [
              [t("Working"), "green"],
              [t("Closing soon"), "amber"],
              [t("Clocked off"), "neutral"],
            ] as const
          ).map(([label, tone]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: toneToVar(tone as StatusTone) }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div ref={trackRef} className="md-clock-rail-track md-scrollbar" role="group" aria-label={t("City clocks")}>
        {clocks.map((clock, index) => (
          <motion.div
            key={clock.code}
            className="min-w-0"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.032) }}
          >
            <ClockChip
              clock={clock}
              index={index}
              isLocal={clock.timeZone === localTimeZone}
              focused={focusedIndex === index}
              displayMode={displayMode}
              onFocusChip={setFocusedIndex}
              onKeyNavigate={handleKeyNavigate}
              onViewQueue={onViewQueue}
            />
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export { ClockChip }
