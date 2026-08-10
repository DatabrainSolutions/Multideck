import type { LucideIcon } from "@/components/icons/hugeicons"
import type { StatusTone } from "@/data/multideck-data"
import type { QuoteRegisterRecord } from "@/data/quote-register-data"
import type { LiveBooking } from "@/lib/application-data-api"

export type DashboardRange = "today" | "week" | "month" | "quarter" | "custom"
export type DashboardCustomDateRange = { start: string | null; end: string | null }

/**
 * One metric in the shared KPI strip. Only the label, the figure and the
 * supporting line are required: a surface that has no comparable previous period
 * or no stored history should leave `change` and `series` off rather than invent
 * them. `icon` marks the domain the metric belongs to when a strip mixes
 * subjects — leads, deals and money in one row, for example.
 */
export type DashboardKpi = {
  label: string
  value: string
  change?: string
  detail: string
  tone: StatusTone
  series?: number[]
  icon?: LucideIcon
  /**
   * Movement across the selected period, derived from the metric's own series.
   * Left off when there is no earlier reading to compare against — a tile with
   * one data point must not draw an arrow.
   */
  delta?: DashboardDelta
}

export type DashboardDelta = {
  direction: "up" | "down" | "flat"
  /** Already formatted, e.g. "+12%" or "+3". */
  text: string
  /** What the movement is measured against, e.g. "vs start of period". */
  caption: string
}

/**
 * Movement from the first reading in the window to the current one. Percent
 * where there is a non-zero base to divide by, absolute where there is not —
 * "+3 from 0" is a real statement, "+∞%" is not.
 */
function seriesDelta(series: number[] | undefined, caption: string): DashboardDelta | undefined {
  if (!series || series.length < 2) return undefined
  const first = series[0]
  const last = series[series.length - 1]
  const change = last - first
  if (change === 0) return { direction: "flat", text: "0%", caption }
  const text = first === 0 ? `${change > 0 ? "+" : ""}${change}` : `${change > 0 ? "+" : ""}${Math.round((change / first) * 100)}%`
  return { direction: change > 0 ? "up" : "down", text, caption }
}

export type DashboardAction = {
  label: string
  value: string
  detail: string
  source: string
  tone: StatusTone
}

export type DashboardTrendPoint = { period: string; value: number; target?: number }

export type DashboardLiveSnapshot = {
  kpis: DashboardKpi[]
  actions: DashboardAction[]
  briefLead: string
  trends: Record<string, DashboardTrendPoint[]>
}

export type DashboardJob = {
  id: string
  bookingId: string
  customer: string
  route: string
  task: string
  detail: string
  due: string
  status: string
  tone: StatusTone
}

export type DashboardBooking = {
  id: string
  lane: string
  mode: string
  customer: string
  milestone: string
  progress: number
  eta: string
  updated: string
  tone: StatusTone
  origin: string
  destination: string
}

export type DashboardClockQueue = { openRfqs: number; needAction: number; readyToQuote: number }

const clockLocationTerms: Record<string, string[]> = {
  LAX: ["Los Angeles", "Long Beach", "USLAX"], CHI: ["Chicago", "USCHI"],
  NYC: ["New York", "JFK", "USJFK"], YYZ: ["Toronto", "CATOR"], GRU: ["Sao Paulo", "Santos", "BRSSZ"],
  LDN: ["London", "Heathrow", "GBLHR", "Felixstowe", "GBFXT", "Bristol", "GBBRS", "Southampton", "GBSOU", "Gateway", "Manchester", "Birmingham"],
  AMS: ["Amsterdam", "Rotterdam", "NLRTM"], FRA: ["Frankfurt", "DEFRA", "Hamburg", "DEHAM"],
  IST: ["Istanbul", "TRIST"], DXB: ["Dubai", "AEDXB"], BOM: ["Mumbai", "Nhava Sheva", "INNSA"],
  SIN: ["Singapore", "SGSIN"], HKG: ["Hong Kong", "HKHKG"],
  SHA: ["Shanghai", "CNSHA", "Yantian", "CNYTN", "Ningbo", "CNNGB"],
  TYO: ["Tokyo", "Narita", "JPTYO", "Kobe", "JPUKB"], SYD: ["Sydney", "AUSYD", "Melbourne", "AUMEL"],
}

export function dashboardClockQueues(bookings: LiveBooking[], quotes: QuoteRegisterRecord[]): Record<string, DashboardClockQueue> {
  return Object.fromEntries(Object.entries(clockLocationTerms).map(([code, terms]) => {
    const matches = (value: string) => terms.some((term) => value.toLowerCase().includes(term.toLowerCase()))
    const localBookings = bookings.filter((booking) => matches(booking.origin) || matches(booking.destination))
    const localQuotes = quotes.filter((quote) => matches(quote.origin) || matches(quote.destination))
    return [code, {
      openRfqs: localQuotes.filter((quote) => quote.status !== "Sent" && quote.status !== "Accepted").length,
      needAction: localBookings.filter((booking) => booking.status !== "On track").length,
      readyToQuote: localQuotes.filter((quote) => quote.status === "Ready to send").length,
    }]
  }))
}

const rangeDays: Record<DashboardRange, number> = { today: 1, week: 7, month: 30, quarter: 90, custom: 30 }

type DashboardRangeWindow = { start: number; end: number }

function localDateBoundary(value: string | null | undefined, endExclusive = false) {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    if (endExclusive) date.setDate(date.getDate() + 1)
    return date.getTime()
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function dashboardRangeWindow(
  range: DashboardRange,
  customRange?: DashboardCustomDateRange,
  now = new Date(),
): DashboardRangeWindow {
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  if (range === "custom") {
    const customStart = localDateBoundary(customRange?.start)
    const customEnd = localDateBoundary(customRange?.end, true)
    if (customStart !== null && customEnd !== null && customEnd > customStart) {
      return { start: customStart, end: customEnd }
    }
  }

  const start = new Date(todayStart)
  start.setDate(start.getDate() - (rangeDays[range] - 1))
  return { start: start.getTime(), end: tomorrowStart.getTime() }
}

function recordOverlapsWindow(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  fallbackAt: string | null | undefined,
  window: DashboardRangeWindow,
) {
  const start = localDateBoundary(startsAt)
  const end = localDateBoundary(endsAt, true)
  if (start !== null && end !== null) return start < window.end && end > window.start
  if (start !== null) return start >= window.start && start < window.end
  if (end !== null) return end > window.start && end <= window.end
  const fallback = localDateBoundary(fallbackAt)
  return fallback !== null && fallback >= window.start && fallback < window.end
}

function occupancySeries<T>(
  records: T[],
  startsAt: (record: T) => string | null | undefined,
  endsAt: (record: T) => string | null | undefined,
  fallbackAt: (record: T) => string | null | undefined,
  window: DashboardRangeWindow,
) {
  const bucketCount = 10
  const width = Math.max((window.end - window.start) / bucketCount, 1)
  return Array.from({ length: bucketCount }, (_, index) => {
    const point = window.start + width * (index + 1)
    return records.filter((record) => {
      const start = localDateBoundary(startsAt(record))
      const end = localDateBoundary(endsAt(record), true)
      if (start !== null && end !== null) return start <= point && end > point
      if (start !== null) return start <= point
      if (end !== null) return end > point
      const fallback = localDateBoundary(fallbackAt(record))
      return fallback !== null && fallback <= point
    }).length
  })
}

function bookingStartsAt(booking: LiveBooking) {
  return booking.departureAt || booking.departureDate
}

function bookingEndsAt(booking: LiveBooking) {
  return booking.arrivalAt || booking.arrivalDate
}

function trend(series: number[], range: DashboardRange, window: DashboardRangeWindow): DashboardTrendPoint[] {
  const formatter = new Intl.DateTimeFormat(undefined, range === "today" ? { hour: "2-digit" } : { month: "short", day: "numeric" })
  const width = (window.end - window.start) / series.length
  return series.map((value, index) => ({ period: formatter.format(new Date(window.start + width * (index + 1))), value }))
}

export function buildDashboardLiveData(
  range: DashboardRange,
  bookings: LiveBooking[],
  quotes: QuoteRegisterRecord[],
  customRange?: DashboardCustomDateRange,
  now = new Date(),
): DashboardLiveSnapshot {
  const window = dashboardRangeWindow(range, customRange, now)
  const nowTimestamp = now.getTime()
  const seriesWindow = nowTimestamp > window.start && nowTimestamp < window.end
    ? { start: window.start, end: nowTimestamp }
    : window
  const rangeBookings = bookings.filter((booking) => booking.progress < 100 && recordOverlapsWindow(
    bookingStartsAt(booking),
    bookingEndsAt(booking),
    booking.updatedAt,
    window,
  ))
  const rangeQuotes = quotes.filter((quote) => recordOverlapsWindow(
    quote.estimatedDeparture,
    quote.estimatedArrival,
    quote.createdAt,
    window,
  ))
  const exceptions = rangeBookings.filter((booking) => booking.status !== "On track")
  const readyQuotes = rangeQuotes.filter((quote) => quote.status === "Ready to send")
  const openQuotes = rangeQuotes.filter((quote) => quote.status !== "Sent" && quote.status !== "Accepted")

  const bookingSeries = occupancySeries(rangeBookings, bookingStartsAt, bookingEndsAt, (booking) => booking.updatedAt, seriesWindow)
  const exceptionSeries = occupancySeries(exceptions, bookingStartsAt, bookingEndsAt, (booking) => booking.updatedAt, seriesWindow)
  const quoteSeries = occupancySeries(rangeQuotes, (quote) => quote.estimatedDeparture, (quote) => quote.estimatedArrival, (quote) => quote.createdAt, seriesWindow)
  const readyQuoteSeries = occupancySeries(readyQuotes, (quote) => quote.estimatedDeparture, (quote) => quote.estimatedArrival, (quote) => quote.createdAt, seriesWindow)

  const movement = "vs start of period"
  const kpis: DashboardKpi[] = [
    { label: "Active jobs", value: String(rangeBookings.length), change: `${exceptions.length} need action`, detail: `${exceptions.length} need action`, tone: exceptions.length ? "amber" : "green", series: bookingSeries, delta: seriesDelta(bookingSeries, movement) },
    { label: "Booking exceptions", value: String(exceptions.length), change: `${rangeBookings.length - exceptions.length} on track`, detail: `${rangeBookings.length - exceptions.length} on track`, tone: exceptions.length ? "red" : "green", series: exceptionSeries, delta: seriesDelta(exceptionSeries, movement) },
    { label: "Open quotes", value: String(openQuotes.length), change: `${readyQuotes.length} ready`, detail: `${readyQuotes.length} ready to send`, tone: readyQuotes.length ? "green" : "blue", series: quoteSeries, delta: seriesDelta(quoteSeries, movement) },
    { label: "Ready quotes", value: String(readyQuotes.length), change: `${rangeQuotes.length} total`, detail: `${rangeQuotes.length} quotes in period`, tone: readyQuotes.length ? "teal" : "neutral", series: readyQuoteSeries, delta: seriesDelta(readyQuoteSeries, movement) },
  ]

  const actions: DashboardAction[] = [
    ...exceptions.map((booking) => ({ label: `Review ${booking.id}`, value: "Open", detail: `${booking.customer} · ${booking.route} · ${booking.status}`, source: "Bookings", tone: booking.tone })),
    ...readyQuotes.map((quote) => ({ label: `Send ${quote.reference}`, value: "Send", detail: `${quote.customer} · ${quote.origin} → ${quote.destination}`, source: "Quotes", tone: quote.statusTone })),
    ...openQuotes.filter((quote) => quote.status !== "Ready to send").map((quote) => ({ label: `Progress ${quote.reference}`, value: "Review", detail: `${quote.customer} · ${quote.workflowStage}`, source: "Quotes", tone: quote.priorityTone })),
  ].slice(0, 8)

  return {
    kpis,
    actions,
    briefLead: actions.length ? "Prioritised from current booking exceptions and quote workflow status." : "No booking exceptions or quote actions are currently open.",
    trends: Object.fromEntries(kpis.map((kpi) => [kpi.label, trend(kpi.series ?? [], range, seriesWindow)])),
  }
}

/**
 * When a booking next needs a human. Remaining progress is the only forward
 * signal tracking gives us, so it sets the horizon: a booking at 90% is wanted
 * within the hour, one at 20% not for four. Kept in one place because the
 * priority queue and the job list must never disagree about the same booking.
 */
function bookingDueAt(booking: LiveBooking) {
  const due = new Date(booking.updatedAt)
  due.setHours(due.getHours() + Math.max(1, Math.round((100 - booking.progress) / 20)))
  return due.getTime()
}

/**
 * The operating cutoff the rest of the product already works to — the same
 * 17:00 the world-clock queues are measured against. A quote that is ready to
 * send is due by it, so "ready" cannot quietly mean "whenever".
 */
export const operatingCutoffHour = 17

function cutoffToday(now: Date) {
  const cutoff = new Date(now)
  cutoff.setHours(operatingCutoffHour, 0, 0, 0)
  return cutoff.getTime()
}

export type DashboardPriorityKind = "exception" | "quote-send" | "quote-progress"
export type DashboardPriorityBucket = "overdue" | "soon" | "today" | "later"

/**
 * One thing the operator has to do, from whichever register it came from. The
 * dashboard used to carry three lists over the same records — every booking as
 * "your jobs", the exception subset as "today's actions", and every booking
 * again as "live bookings" — so the same delay was read three times before it
 * was worked once. This is the single ranked queue those collapse into.
 */
export type DashboardPriorityItem = {
  id: string
  kind: DashboardPriorityKind
  /** Booking or quote reference, shown left-to-right in every language. */
  reference: string
  task: string
  customer: string
  /** The lane or route the work sits on. */
  context: string
  status: string
  owner: string
  dueAt: number
  /** What the deadline actually is, so the row never implies a precision it lacks. */
  dueKind: "action" | "cutoff" | "departure"
  tone: StatusTone
  bookingId?: string
  quoteReference?: string
}

export function dashboardPriorityBucket(dueAt: number, now: number): DashboardPriorityBucket {
  if (dueAt < now) return "overdue"
  if (dueAt - now <= 2 * 60 * 60 * 1000) return "soon"
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)
  return dueAt <= endOfDay.getTime() ? "today" : "later"
}

/**
 * Booking exceptions and quote work in one list, ranked by real deadline. Only
 * records that need a decision are here: a booking running to plan is progress
 * to watch on the live board, not a task, and putting it in the queue would
 * bury the three that are actually broken.
 */
export function dashboardPriorityQueue(
  bookings: LiveBooking[],
  quotes: QuoteRegisterRecord[],
  now = new Date(),
): DashboardPriorityItem[] {
  const cutoff = cutoffToday(now)

  const exceptions: DashboardPriorityItem[] = bookings
    .filter((booking) => booking.progress < 100 && booking.status !== "On track")
    .map((booking) => ({
      id: `booking:${booking.id}`,
      kind: "exception" as const,
      reference: booking.id,
      task: booking.status === "Exception" ? "Resolve tracking exception" : "Review revised delivery plan",
      customer: booking.customer,
      context: booking.route,
      status: booking.status,
      owner: booking.owner,
      dueAt: bookingDueAt(booking),
      dueKind: "action" as const,
      tone: booking.tone,
      bookingId: booking.id,
    }))

  const readyQuotes: DashboardPriorityItem[] = quotes
    .filter((quote) => quote.status === "Ready to send")
    .map((quote) => {
      const departure = localDateBoundary(quote.estimatedDeparture)
      // Priced and waiting: it goes out by today's cutoff, or before the ship
      // leaves if that comes first.
      const dueAt = departure !== null ? Math.min(departure, cutoff) : cutoff
      return {
        id: `quote-send:${quote.reference}`,
        kind: "quote-send" as const,
        reference: quote.reference,
        task: "Send priced quote",
        customer: quote.customer,
        context: `${quote.origin} → ${quote.destination}`,
        status: quote.status,
        owner: quote.salesOwner,
        dueAt,
        dueKind: departure !== null && departure < cutoff ? ("departure" as const) : ("cutoff" as const),
        tone: quote.statusTone,
        quoteReference: quote.reference,
      }
    })

  const openQuotes: DashboardPriorityItem[] = quotes
    .filter((quote) => quote.status !== "Sent" && quote.status !== "Accepted" && quote.status !== "Ready to send")
    .map((quote) => {
      const departure = localDateBoundary(quote.estimatedDeparture)
      return {
        id: `quote-progress:${quote.reference}`,
        kind: "quote-progress" as const,
        reference: quote.reference,
        task: `Progress ${quote.workflowStage.toLowerCase()}`,
        customer: quote.customer,
        context: `${quote.origin} → ${quote.destination}`,
        status: quote.status,
        owner: quote.salesOwner,
        // No departure yet means no real deadline; the cutoff is the honest
        // stand-in rather than a date invented for the sort.
        dueAt: departure ?? cutoff,
        dueKind: departure !== null ? ("departure" as const) : ("cutoff" as const),
        tone: quote.priorityTone,
        quoteReference: quote.reference,
      }
    })

  return [...exceptions, ...readyQuotes, ...openQuotes].sort((left, right) => left.dueAt - right.dueAt)
}

export type DashboardBreakdownSlice = { name: string; value: number; color: string }

const modeColours: Record<string, string> = {
  Ocean: "var(--md-accent)",
  Air: "var(--md-blue)",
  Road: "var(--md-amber)",
  Multimodal: "var(--md-accent-glow-warm)",
}

// Canonical jobs store maritime transport as SEA while the application label
// and older booking adapter use OCEAN. Normalise at the dashboard boundary so
// both sources contribute to one honest series rather than splitting the mode.
function dashboardModeCode(mode: string) {
  return mode.trim().toUpperCase() === "SEA" ? "OCEAN" : mode.trim().toUpperCase()
}

/**
 * Live bookings by transport mode. Only modes actually present are returned, so
 * the ring never carries an empty segment for a service the tenant does not run.
 */
export function dashboardModeMix(bookings: LiveBooking[]): DashboardBreakdownSlice[] {
  const counts = new Map<string, number>()
  bookings
    .filter((booking) => booking.progress < 100)
    .forEach((booking) => {
      const modeCode = dashboardModeCode(booking.mode)
      const mode = modeCode === "OCEAN" ? "Ocean" : modeCode === "AIR" ? "Air" : modeCode === "ROAD" ? "Road" : modeCode === "MULTIMODAL" ? "Multimodal" : modeCode
      counts.set(mode, (counts.get(mode) ?? 0) + 1)
    })

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([name, value], index) => ({
      name,
      value,
      color: modeColours[name] ?? (index % 2 === 0 ? "var(--md-amber)" : "var(--md-subtle)"),
    }))
}

export type DashboardModeTrend = {
  labels: string[]
  series: { key: string; label: string; color: string; values: number[] }[]
}

/**
 * Each transport mode's load across the selected window, as one series per mode
 * on a shared time axis. A single split of today's total says which mode is
 * biggest; this says *when* each one is booked, which is the question a desk
 * planning capacity actually asks.
 */
export function dashboardModeTrend(
  range: DashboardRange,
  bookings: LiveBooking[],
  customRange?: DashboardCustomDateRange,
  now = new Date(),
): DashboardModeTrend {
  const window = dashboardRangeWindow(range, customRange, now)
  const nowTimestamp = now.getTime()
  const seriesWindow =
    nowTimestamp > window.start && nowTimestamp < window.end ? { start: window.start, end: nowTimestamp } : window

  const live = bookings.filter((booking) => booking.progress < 100)
  const present = [
    { key: "Ocean", match: "OCEAN", color: "var(--md-accent)" },
    { key: "Air", match: "AIR", color: "var(--md-blue)" },
    { key: "Road", match: "ROAD", color: "var(--md-amber)" },
    { key: "Multimodal", match: "MULTIMODAL", color: "var(--md-accent-glow-warm)" },
  ].filter((mode) => live.some((booking) => dashboardModeCode(booking.mode) === mode.match))

  const formatter = new Intl.DateTimeFormat(
    undefined,
    range === "today" ? { hour: "2-digit" } : { month: "short", day: "numeric" },
  )
  const width = (seriesWindow.end - seriesWindow.start) / 10

  const columns = present.map((mode) => ({
    mode,
    values: occupancySeries(
      live.filter((booking) => dashboardModeCode(booking.mode) === mode.match),
      bookingStartsAt,
      bookingEndsAt,
      (booking) => booking.updatedAt,
      seriesWindow,
    ),
  }))

  return {
    labels: Array.from({ length: 10 }, (_, index) =>
      formatter.format(new Date(seriesWindow.start + width * (index + 1))),
    ),
    series: columns.map((column) => ({
      key: column.mode.key,
      label: column.mode.key,
      color: column.mode.color,
      values: column.values,
    })),
  }
}

/**
 * Live bookings by tracking status. Ordered worst first, because a status split
 * is read to find the trouble rather than to admire the healthy majority.
 */
export function dashboardStatusMix(bookings: LiveBooking[]): DashboardBreakdownSlice[] {
  const rank: Record<string, number> = { Exception: 0, Delayed: 1, "On track": 2 }
  const tones: Record<string, string> = {
    Exception: "var(--md-red)",
    Delayed: "var(--md-amber)",
    "On track": "var(--md-green)",
  }

  const counts = new Map<string, number>()
  bookings
    .filter((booking) => booking.progress < 100)
    .forEach((booking) => counts.set(booking.status, (counts.get(booking.status) ?? 0) + 1))

  return [...counts.entries()]
    .sort((left, right) => (rank[left[0]] ?? 9) - (rank[right[0]] ?? 9))
    .map(([name, value]) => ({ name, value, color: tones[name] ?? "var(--md-blue)" }))
}

/**
 * Quotes by workflow stage, busiest first. Drawn as ranked bars rather than a
 * funnel: the stages are where quotes are currently sitting, not a monotonic
 * drop-off, and a funnel in a side column carries a fixed aspect that leaves
 * dead space beside a tall neighbour.
 */
export function dashboardQuoteStages(quotes: QuoteRegisterRecord[]): DashboardBreakdownSlice[] {
  const counts = new Map<string, number>()
  quotes
    .filter((quote) => quote.status !== "Sent" && quote.status !== "Accepted")
    .forEach((quote) => {
      const stage = quote.workflowStage?.trim()
      if (!stage) return
      counts.set(stage, (counts.get(stage) ?? 0) + 1)
    })

  const shades = ["var(--md-accent)", "var(--md-accent-tint)", "var(--md-accent-glow-core)", "var(--md-blue)", "var(--md-subtle)"]
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, value], index) => ({ name, value, color: shades[index % shades.length] }))
}

export function dashboardJobs(bookings: LiveBooking[]): DashboardJob[] {
  return bookings.map((booking) => {
    const dueDate = new Date(bookingDueAt(booking))
    return {
      id: booking.jobRef,
      bookingId: booking.id,
      customer: booking.customer,
      route: booking.route,
      task: booking.status === "Exception" ? "Resolve tracking exception" : booking.status === "Delayed" ? "Review revised delivery plan" : "Monitor next milestone",
      detail: `${booking.status} · ${booking.progress}% complete`,
      due: dueDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
      status: booking.status,
      tone: booking.tone,
    }
  })
}

export function dashboardBookings(bookings: LiveBooking[]): DashboardBooking[] {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  return bookings.map((booking) => {
    const minutes = Math.round((new Date(booking.updatedAt).getTime() - Date.now()) / 60_000)
    return {
      id: booking.id,
      lane: booking.route,
      mode: booking.mode === "OCEAN" ? "Ocean" : booking.mode === "AIR" ? "Air" : booking.mode === "ROAD" ? "Road" : booking.mode,
      customer: booking.customer,
      milestone: booking.status,
      progress: booking.progress,
      eta: booking.eta,
      updated: rtf.format(minutes, "minute"),
      tone: booking.tone,
      origin: booking.origin,
      destination: booking.destination,
    }
  })
}
