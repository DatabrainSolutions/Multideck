import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, PackageCheck, Plane, Ship } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import type { StatusTone } from "@/data/multideck-data"
import type { DashboardBooking } from "@/lib/dashboard-live-data"
import { Surface } from "./surface"
import { StatusPill, toneToVar } from "./status-pill"
import { SegmentedControl } from "./workflow-components"

const InteractiveBookingMap = lazy(() =>
  import("./interactive-booking-map").then((module) => ({ default: module.InteractiveBookingMap })),
)

const boardViews = ["list", "map"] as const
type BoardView = (typeof boardViews)[number]
export type LiveBookingFeedItem = DashboardBooking

export const LiveBookingRow = memo(function LiveBookingRow({
  booking,
  onOpen,
  index = 0,
  animated = true,
}: {
  booking: LiveBookingFeedItem
  onOpen?: (booking: LiveBookingFeedItem) => void
  index?: number
  animated?: boolean
}) {
  const shouldReduceMotion = useReducedMotion()
  const shouldAnimate = animated && !shouldReduceMotion
  const accent = toneToVar(booking.tone)

  return (
    <motion.button
      type="button"
      onClick={onOpen ? () => onOpen(booking) : undefined}
      initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldAnimate ? { ...mdMotion.enter, delay: staggerRamp(index, 0.03) } : { duration: 0 }}
      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
      className="md-live-row"
      style={{ ["--md-live-accent" as string]: accent }}
    >
      <span className="md-live-row-ref">
        <span className="md-live-row-id" dir="ltr" data-i18n-skip>
          {booking.id}
        </span>
        <span className="md-live-row-mode">{booking.mode}</span>
      </span>

      <span className="md-live-row-lane">
        <span className="md-live-row-lane-text" dir="ltr">
          {booking.lane}
        </span>
        <span className="md-live-row-progress">
          <span className="md-live-row-track">
            <motion.span
              className="md-live-row-fill"
              initial={shouldAnimate ? { scaleX: 0 } : false}
              animate={{ scaleX: booking.progress / 100 }}
              transition={
                shouldAnimate
                  ? { duration: 0.68, ease: [0.16, 1, 0.3, 1], delay: staggerRamp(index, 0.03) }
                  : { duration: 0 }
              }
            />
          </span>
          <span className="md-live-row-percent" dir="ltr">
            {booking.progress}%
          </span>
        </span>
      </span>

      <span className="md-live-row-milestone">
        <span className="md-live-row-milestone-text">{booking.milestone}</span>
        <span className="md-live-row-customer">{booking.customer}</span>
      </span>

      <span className="md-live-row-tail">
        <span className="md-live-row-eta">
          <span className="md-live-row-eta-label">ETA</span>
          <span className="md-live-row-eta-value" dir="ltr" data-i18n-skip>
            {booking.eta}
          </span>
        </span>
        <ArrowRight className="md-live-row-arrow" strokeWidth={1.25} aria-hidden="true" />
      </span>
    </motion.button>
  )
})

/**
 * Leaflet is heavy, so the map is not part of the dashboard's first paint. It is
 * only imported once the operator asks for the map view, and only mounted once
 * the panel has actually scrolled into the viewport.
 */
function LazyBookingMap({ bookings }: { bookings: DashboardBooking[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: "160px" },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="flex min-h-[320px] flex-1 flex-col">
      {inView ? (
        <Suspense fallback={<BookingMapFallback />}>
          <InteractiveBookingMap bookings={bookings} className="md-live-bookings-map min-h-[320px] flex-1" />
        </Suspense>
      ) : (
        <BookingMapFallback />
      )}
    </div>
  )
}

function BookingMapFallback() {
  const { t } = useLanguage()

  return (
    <div className="md-live-map-fallback">
      <div className="md-live-map-fallback-sheen" />
      <div className="md-live-map-fallback-badge">
        <span className="size-2 rounded-full bg-[var(--md-accent)]" />
        {t("Loading live routes")}
      </div>
    </div>
  )
}

export function LiveBookingsBoard({
  bookings: liveBookings,
  onOpenBooking,
  className,
}: {
  bookings: DashboardBooking[]
  onOpenBooking?: (booking: LiveBookingFeedItem) => void
  className?: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [view, setView] = useState<BoardView>("list")
  const [modeFilter, setModeFilter] = useState<string | null>(null)
  const bookingModes = useMemo(() => [
    { label: "Ocean", count: liveBookings.filter((booking) => booking.mode === "Ocean").length, icon: Ship, tone: "teal" as StatusTone },
    { label: "Air", count: liveBookings.filter((booking) => booking.mode === "Air").length, icon: Plane, tone: "blue" as StatusTone },
    { label: "Road", count: liveBookings.filter((booking) => booking.mode === "Road").length, icon: PackageCheck, tone: "green" as StatusTone },
  ].filter((mode) => mode.count > 0), [liveBookings])

  const bookings = useMemo(
    () => (modeFilter ? liveBookings.filter((booking) => booking.mode === modeFilter) : liveBookings),
    [liveBookings, modeFilter],
  )
  const exceptions = liveBookings.filter((booking) => booking.tone === "red" || booking.tone === "amber").length

  return (
    <Surface padding="none" className={cn("md-live-board", className)}>
      <div className="md-live-board-head">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="md-live-pulse" aria-hidden="true">
            <span className="md-live-pulse-core" />
            {shouldReduceMotion ? null : (
              <motion.span
                className="md-live-pulse-ring"
                animate={{ opacity: [0.7, 0, 0.7], scale: [1, 2.2, 1] }}
                transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity }}
              />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="md-panel-title">{t("Live bookings")}</h2>
            <p className="md-panel-meta">
              {bookings.length} {t("in transit")}
              {exceptions ? ` · ${exceptions} ${t("need attention")}` : ""}
            </p>
          </div>
        </div>

        <div className="md-live-board-controls">
          <div className="md-live-mode-filters">
            {bookingModes.map((mode) => {
              const Icon = mode.icon
              const active = modeFilter === mode.label
              return (
                <button
                  key={mode.label}
                  type="button"
                  aria-pressed={active}
                  className="md-live-mode-chip"
                  onClick={() => setModeFilter(active ? null : mode.label)}
                >
                  <StatusPill tone={active ? (mode.tone as StatusTone) : "neutral"}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3" strokeWidth={1.2} />
                      {t(mode.label)} {mode.count}
                    </span>
                  </StatusPill>
                </button>
              )
            })}
          </div>
          <SegmentedControl
            options={boardViews}
            value={view}
            onChange={setView}
            ariaLabel={t("Live bookings view")}
            renderOption={(option) => t(option === "list" ? "List" : "Map")}
            className="[&_button]:h-7 [&_button]:px-2.5 [&_button]:text-[12px]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {view === "list" ? (
            <motion.div
              key="list"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.exit)}
              className="md-live-board-list"
            >
              {bookings.map((booking, index) => (
                <LiveBookingRow key={booking.id} booking={booking} index={index} onOpen={onOpenBooking} />
              ))}
              {bookings.length === 0 ? (
                <p className="md-live-board-empty">{t("No bookings match this mode.")}</p>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="map"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.exit)}
              className="flex min-h-[320px] flex-col px-3 pb-3"
            >
              <LazyBookingMap bookings={liveBookings} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Surface>
  )
}
