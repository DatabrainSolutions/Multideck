import { useMemo } from "react"
import { motion, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { getLocalTimeZone, getTimeZoneOffsetMinutes, useMinuteTick } from "@/lib/clock"
import { cityQueues } from "@/data/operational-data"
import type { DashboardClockQueue } from "@/lib/dashboard-live-data"
import { Surface } from "./surface"

/** The operating window every region is measured against, in its own local time. */
const dayStartHour = 8
const dayEndHour = 17

/** Ticks drawn under the track. */
const axisHours = [0, 6, 12, 18, 24]

type CoverageRow = {
  code: string
  city: string
  /** Local clock reading in that region, for the row's tail. */
  time: string
  /** The region's working window expressed in the viewer's own hours. */
  openAt: number
  closeAt: number
  waiting: number
  online: boolean
  closingSoon: boolean
}

/**
 * Coverage as a shape rather than eight clock readings. Every region's working
 * window is drawn on one shared 24-hour track in the *viewer's* time, with a
 * single "now" line across all of them — so the answer to "can Shanghai still
 * pick this up, and how long have I got" is a glance rather than arithmetic.
 */
export function DashboardCoveragePanel({
  queues = {},
  onViewQueue,
  className,
}: {
  queues?: Record<string, DashboardClockQueue>
  onViewQueue?: (code: string) => void
  className?: string
}) {
  const { t } = useLanguage()
  const now = useMinuteTick()
  const shouldReduceMotion = useReducedMotion()
  const localTimeZone = useMemo(() => getLocalTimeZone(), [])

  /** Where "now" sits on the shared track, as a 0-1 ratio of the viewer's day. */
  const nowRatio = (now.getHours() + now.getMinutes() / 60) / 24

  const rows = useMemo<CoverageRow[]>(() => {
    const localOffset = getTimeZoneOffsetMinutes(now, localTimeZone)

    return cityQueues.map((city) => {
      const cityOffset = getTimeZoneOffsetMinutes(now, city.timeZone)
      // Their 08:00 happens at (08:00 − offset) on the viewer's clock. The band
      // can run off either end of the day; the track wraps it rather than
      // clipping, so a region whose morning is the viewer's night still reads.
      const shift = (cityOffset - localOffset) / 60
      const openAt = dayStartHour - shift
      const closeAt = dayEndHour - shift

      const cityHour = (now.getUTCHours() + now.getUTCMinutes() / 60 + cityOffset / 60 + 24) % 24
      const open = cityHour >= dayStartHour && cityHour < dayEndHour
      const queue = queues[city.code]

      return {
        code: city.code,
        city: city.city,
        time: `${String(Math.floor(cityHour)).padStart(2, "0")}:${String(Math.floor((cityHour % 1) * 60)).padStart(2, "0")}`,
        openAt,
        closeAt,
        // Only work needing a human counts as a flag; open RFQs are a workload
        // figure and stay out of the rail.
        waiting: queue ? queue.needAction + queue.readyToQuote : 0,
        online: open,
        closingSoon: open && dayEndHour - cityHour <= 1,
      }
    })
  }, [localTimeZone, now, queues])

  const working = rows.filter((row) => row.online).length

  return (
    <Surface padding="none" className={cn("md-coverage-panel", className)}>
      <div className="md-coverage-panel-head">
        <div className="min-w-0">
          <h2 className="md-panel-title">{t("Coverage")}</h2>
          <p className="md-panel-meta">
            {working} {t("of")} {rows.length} {t("regions working")}
          </p>
        </div>
        <span className="md-coverage-now-badge" dir="ltr">
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
        </span>
      </div>

      <div className="md-coverage-plot">
        {/* One line for the viewer's own moment, drawn across every row rather
            than repeated per city. The rail spans exactly the track column, so
            the line lands on the same scale the bands are drawn on. */}
        <span className="md-coverage-nowrail" aria-hidden="true">
          <span className="md-coverage-nowline" style={{ insetInlineStart: `${nowRatio * 100}%` }} />
        </span>

        <div className="md-coverage-rows md-scrollbar">
          {rows.map((row, index) => (
            <motion.button
              key={row.code}
              type="button"
              className="md-coverage-row"
              data-online={row.online ? "true" : undefined}
              data-closing={row.closingSoon ? "true" : undefined}
              onClick={onViewQueue ? () => onViewQueue(row.code) : undefined}
              aria-label={`${row.city}, ${row.time}, ${row.online ? t("working") : t("clocked off")}${row.waiting ? `, ${row.waiting} ${t("waiting")}` : ""}`}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.026) }}
            >
              <span className="md-coverage-row-code" dir="ltr">
                {row.code}
              </span>

              <span className="md-coverage-track" aria-hidden="true">
                {/* The window is drawn twice, shifted a day apart, so a region
                    straddling midnight shows both ends instead of one clipped
                    stub. Anything off-track is simply not painted. */}
                {[0, -24, 24].map((wrap) => {
                  const start = row.openAt + wrap
                  const width = row.closeAt - row.openAt
                  if (start + width <= 0 || start >= 24) return null
                  return (
                    <motion.span
                      key={wrap}
                      className="md-coverage-band"
                      style={{ insetInlineStart: `${(start / 24) * 100}%`, width: `${(width / 24) * 100}%` }}
                      initial={shouldReduceMotion ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={
                        shouldReduceMotion ? { duration: 0 } : { ...mdMotion.panel, delay: staggerRamp(index, 0.026) }
                      }
                    />
                  )
                })}
              </span>

              <span className="md-coverage-row-time" dir="ltr">
                {row.time}
              </span>

              {row.waiting ? (
                <span className="md-coverage-row-count" dir="ltr">
                  {row.waiting}
                </span>
              ) : (
                <span className="md-coverage-row-count-spacer" aria-hidden="true" />
              )}
            </motion.button>
          ))}
        </div>

        <span className="md-coverage-axis" aria-hidden="true">
          {axisHours.map((hour) => (
            <span key={hour} style={{ insetInlineStart: `${(hour / 24) * 100}%` }}>
              {String(hour).padStart(2, "0")}
            </span>
          ))}
        </span>
      </div>

      <p className="md-coverage-foot">
        {t("Working windows shown in your local time. 08:00–17:00 in each region.")}
      </p>
    </Surface>
  )
}
