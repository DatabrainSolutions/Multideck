import type { LucideIcon } from "lucide-react"
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
  LDN: ["London", "Heathrow", "GBLHR", "Felixstowe", "GBFXT", "Bristol", "GBBRS", "Southampton", "GBSOU"],
  AMS: ["Amsterdam", "Rotterdam", "NLRTM"], IST: ["Istanbul", "TRIST"], DXB: ["Dubai", "AEDXB"],
  SHA: ["Shanghai", "CNSHA", "Yantian", "CNYTN", "Ningbo", "CNNGB"], SIN: ["Singapore", "SGSIN"],
  NYC: ["New York", "JFK", "USJFK"], LAX: ["Los Angeles", "Long Beach", "USLAX"],
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
    booking.departureDate,
    booking.arrivalDate,
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

  const bookingSeries = occupancySeries(rangeBookings, (booking) => booking.departureDate, (booking) => booking.arrivalDate, (booking) => booking.updatedAt, seriesWindow)
  const exceptionSeries = occupancySeries(exceptions, (booking) => booking.departureDate, (booking) => booking.arrivalDate, (booking) => booking.updatedAt, seriesWindow)
  const quoteSeries = occupancySeries(rangeQuotes, (quote) => quote.estimatedDeparture, (quote) => quote.estimatedArrival, (quote) => quote.createdAt, seriesWindow)
  const readyQuoteSeries = occupancySeries(readyQuotes, (quote) => quote.estimatedDeparture, (quote) => quote.estimatedArrival, (quote) => quote.createdAt, seriesWindow)

  const kpis: DashboardKpi[] = [
    { label: "Active jobs", value: String(rangeBookings.length), change: `${exceptions.length} need action`, detail: "in selected period", tone: exceptions.length ? "amber" : "green", series: bookingSeries },
    { label: "Booking exceptions", value: String(exceptions.length), change: `${rangeBookings.length - exceptions.length} on track`, detail: "derived from tracking risk", tone: exceptions.length ? "red" : "green", series: exceptionSeries },
    { label: "Open quotes", value: String(openQuotes.length), change: `${readyQuotes.length} ready`, detail: "in selected period", tone: readyQuotes.length ? "green" : "blue", series: quoteSeries },
    { label: "Ready quotes", value: String(readyQuotes.length), change: `${rangeQuotes.length} total`, detail: "ready to issue", tone: readyQuotes.length ? "teal" : "neutral", series: readyQuoteSeries },
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

export function dashboardJobs(bookings: LiveBooking[]): DashboardJob[] {
  return bookings.map((booking) => {
    const dueDate = new Date(booking.updatedAt)
    dueDate.setHours(dueDate.getHours() + Math.max(1, Math.round((100 - booking.progress) / 20)))
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
