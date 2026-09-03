import type { StatusTone } from "@/data/operational-data"
import {
  buildDashboardLiveData,
  dashboardBookings,
  dashboardClockQueues,
  dashboardModeTrend,
  dashboardPriorityQueue,
  dashboardQuoteStages,
  dashboardRangeWindow,
  dashboardStatusMix,
  operatingCutoffHour,
  type DashboardCustomDateRange,
  type DashboardPriorityItem,
  type DashboardRange,
} from "@/lib/dashboard-live-data"
import { invalidateRegisterPages, listLiveBookingsCompatibilitySample, readCachedRegisterPage } from "@/lib/application-data-api"
import { listSalesQuotesCompatibilitySample } from "@/lib/quote-api"
import { getSupabaseSession, supabase } from "@/lib/supabase"

export type DashboardOverviewCounts = {
  activeJobs: number
  exceptions: number
  openQuotes: number
  readyQuotes: number
  totalQuotes: number
  priority: number
  priorityMine: number
  liveBookings: number
  liveExceptions: number
}

export type DashboardOverviewBooking = {
  id: string
  lane: string
  mode: string
  customer: string
  milestone: string
  progress: number
  eta: string
  updatedAt: string
  tone: StatusTone
  origin: string
  destination: string
}

export type DashboardOverviewReadModel = {
  windowStart: string
  windowEnd: string
  seriesEnd: string
  generatedAt: string
  operatorName: string
  counts: DashboardOverviewCounts
  series: {
    activeJobs: number[]
    exceptions: number[]
    quotes: number[]
    readyQuotes: number[]
    modes: Record<string, number[]>
  }
  modeDefinitions: { key: string; label: string; color: string }[]
  clockQueues: Record<string, { openRfqs: number; needAction: number; readyToQuote: number }>
  statusCounts: Record<string, number>
  quoteStages: { name: string; value: number }[]
  priorityItems: DashboardPriorityItem[]
  priorityMineItems: DashboardPriorityItem[]
  liveBookings: DashboardOverviewBooking[]
}

export type DashboardDrilldownKind = "active_jobs" | "booking_exceptions" | "open_quotes" | "ready_quotes" | "region"
export type DashboardDrilldownCursor = { sortAt: string; rowKey: string }
export type DashboardDrilldownItem = {
  id: string
  detail: string
  status: string
  tone: StatusTone
  recordType: "booking" | "quote"
}
export type DashboardDrilldownPage = {
  items: DashboardDrilldownItem[]
  total: number
  hasMore: boolean
  nextCursor: DashboardDrilldownCursor | null
}

const tones = new Set<StatusTone>(["neutral", "teal", "green", "amber", "red", "blue", "orange", "purple"])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function asNumber(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function asTone(value: unknown): StatusTone {
  return typeof value === "string" && tones.has(value as StatusTone) ? value as StatusTone : "neutral"
}

function numberSeries(value: unknown) {
  return asArray(value).map(asNumber)
}

function operatorName(session: NonNullable<Awaited<ReturnType<typeof getSupabaseSession>>>) {
  const metadata = session.user.user_metadata as Record<string, unknown>
  const name = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null
  return name ?? session.user.email ?? "Signed-in operator"
}

function priorityItem(value: unknown): DashboardPriorityItem {
  const row = asRecord(value)
  const kind = row.kind === "quote-send" || row.kind === "quote-progress" ? row.kind : "exception"
  const dueKind = row.dueKind === "departure" || row.dueKind === "cutoff" ? row.dueKind : "action"
  return {
    id: asString(row.id),
    kind,
    reference: asString(row.reference),
    task: asString(row.task),
    customer: asString(row.customer),
    context: asString(row.context),
    status: asString(row.status),
    owner: asString(row.owner),
    dueAt: asNumber(row.dueAt),
    dueKind,
    tone: asTone(row.tone),
    bookingId: typeof row.bookingId === "string" ? row.bookingId : undefined,
    quoteReference: typeof row.quoteReference === "string" ? row.quoteReference : undefined,
  }
}

function normalizeOverview(value: unknown, currentOperator: string): DashboardOverviewReadModel {
  const row = asRecord(value)
  const counts = asRecord(row.counts)
  const series = asRecord(row.series)
  const modes = asRecord(series.modes)
  return {
    windowStart: asString(row.windowStart),
    windowEnd: asString(row.windowEnd),
    seriesEnd: asString(row.seriesEnd),
    generatedAt: asString(row.generatedAt),
    operatorName: currentOperator,
    counts: {
      activeJobs: asNumber(counts.activeJobs),
      exceptions: asNumber(counts.exceptions),
      openQuotes: asNumber(counts.openQuotes),
      readyQuotes: asNumber(counts.readyQuotes),
      totalQuotes: asNumber(counts.totalQuotes),
      priority: asNumber(counts.priority),
      priorityMine: asNumber(counts.priorityMine),
      liveBookings: asNumber(counts.liveBookings),
      liveExceptions: asNumber(counts.liveExceptions),
    },
    series: {
      activeJobs: numberSeries(series.activeJobs),
      exceptions: numberSeries(series.exceptions),
      quotes: numberSeries(series.quotes),
      readyQuotes: numberSeries(series.readyQuotes),
      modes: Object.fromEntries(Object.entries(modes).map(([key, points]) => [key, numberSeries(points)])),
    },
    modeDefinitions: asArray(row.modeDefinitions).map((entry) => {
      const mode = asRecord(entry)
      return { key: asString(mode.key), label: asString(mode.label), color: asString(mode.color) }
    }),
    clockQueues: Object.fromEntries(Object.entries(asRecord(row.clockQueues)).map(([code, value]) => {
      const queue = asRecord(value)
      return [code, { openRfqs: asNumber(queue.openRfqs), needAction: asNumber(queue.needAction), readyToQuote: asNumber(queue.readyToQuote) }]
    })),
    statusCounts: Object.fromEntries(Object.entries(asRecord(row.statusCounts)).map(([status, count]) => [status, asNumber(count)])),
    quoteStages: asArray(row.quoteStages).map((entry) => {
      const stage = asRecord(entry)
      return { name: asString(stage.name), value: asNumber(stage.value) }
    }),
    priorityItems: asArray(row.priorityItems).map(priorityItem),
    priorityMineItems: asArray(row.priorityMineItems).map(priorityItem),
    liveBookings: asArray(row.liveBookings).map((entry) => {
      const booking = asRecord(entry)
      return {
        id: asString(booking.id),
        lane: asString(booking.lane),
        mode: asString(booking.mode),
        customer: asString(booking.customer),
        milestone: asString(booking.milestone),
        progress: asNumber(booking.progress),
        eta: asString(booking.eta),
        updatedAt: asString(booking.updatedAt),
        tone: asTone(booking.tone),
        origin: asString(booking.origin),
        destination: asString(booking.destination),
      }
    }),
  }
}

function readWindow(range: DashboardRange, customRange?: DashboardCustomDateRange) {
  const now = new Date()
  const window = dashboardRangeWindow(range, customRange, now)
  const seriesEnd = now.getTime() > window.start && now.getTime() < window.end ? now.getTime() : window.end
  const cutoff = new Date(now)
  cutoff.setHours(operatingCutoffHour, 0, 0, 0)
  return {
    now,
    start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(),
    seriesEnd: new Date(seriesEnd).toISOString(),
    cutoff: cutoff.toISOString(),
  }
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

function missingDashboardReadModel(error: unknown) {
  const candidate = asRecord(error)
  const message = `${asString(candidate.code)} ${asString(candidate.message)} ${asString(candidate.details)}`.toLowerCase()
  return message.includes("pgrst202")
    || message.includes("multideck_dashboard_") && (message.includes("not find") || message.includes("does not exist"))
}

const dashboardCompatibilityLimit = 50
async function loadBoundedDashboardCompatibilitySources(signal?: AbortSignal) {
  const [bookings, quotes] = await Promise.all([
    listLiveBookingsCompatibilitySample(signal),
    listSalesQuotesCompatibilitySample(signal),
  ])
  if (bookings.length > dashboardCompatibilityLimit || quotes.length > dashboardCompatibilityLimit) {
    throw new Error("This workspace is larger than the safe dashboard compatibility limit. Finish the dashboard database update before loading this view.")
  }
  return { bookings, quotes }
}

async function loadLegacyDashboardOverview(range: DashboardRange, currentOperator: string, customRange?: DashboardCustomDateRange, signal?: AbortSignal): Promise<DashboardOverviewReadModel> {
  if (signal?.aborted) throw new DOMException("The dashboard request was cancelled.", "AbortError")
  const { bookings, quotes } = await loadBoundedDashboardCompatibilitySources(signal)
  if (signal?.aborted) throw new DOMException("The dashboard request was cancelled.", "AbortError")
  const now = new Date()
  const window = dashboardRangeWindow(range, customRange, now)
  const seriesEnd = now.getTime() > window.start && now.getTime() < window.end ? now.getTime() : window.end
  const snapshot = buildDashboardLiveData(range, bookings, quotes, customRange, now)
  const kpi = new Map(snapshot.kpis.map((item) => [item.label, item]))
  const priorities = dashboardPriorityQueue(bookings, quotes, now)
  const mine = priorities.filter((item) => item.owner.trim().toLowerCase() === currentOperator.trim().toLowerCase())
  const modeTrend = dashboardModeTrend(range, bookings, customRange, now)
  const status = dashboardStatusMix(bookings)
  const quoteStages = dashboardQuoteStages(quotes)
  const live = dashboardBookings(bookings).slice(0, 50)
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]))

  return {
    windowStart: new Date(window.start).toISOString(),
    windowEnd: new Date(window.end).toISOString(),
    seriesEnd: new Date(seriesEnd).toISOString(),
    generatedAt: now.toISOString(),
    operatorName: currentOperator,
    counts: {
      activeJobs: Number(kpi.get("Active jobs")?.value ?? 0),
      exceptions: Number(kpi.get("Booking exceptions")?.value ?? 0),
      openQuotes: Number(kpi.get("Open quotes")?.value ?? 0),
      readyQuotes: Number(kpi.get("Ready quotes")?.value ?? 0),
      totalQuotes: quotes.length,
      priority: priorities.length,
      priorityMine: mine.length,
      liveBookings: live.length,
      liveExceptions: live.filter((booking) => booking.milestone !== "On track").length,
    },
    series: {
      activeJobs: kpi.get("Active jobs")?.series ?? [],
      exceptions: kpi.get("Booking exceptions")?.series ?? [],
      quotes: kpi.get("Open quotes")?.series ?? [],
      readyQuotes: kpi.get("Ready quotes")?.series ?? [],
      modes: Object.fromEntries(modeTrend.series.map((series) => [series.key, series.values])),
    },
    modeDefinitions: modeTrend.series.map((series) => ({ key: series.key, label: series.label, color: series.color })),
    clockQueues: dashboardClockQueues(bookings, quotes),
    statusCounts: Object.fromEntries(status.map((item) => [item.name, item.value])),
    quoteStages: quoteStages.map(({ name, value }) => ({ name, value })),
    priorityItems: priorities.slice(0, 50),
    priorityMineItems: mine.slice(0, 50),
    liveBookings: live.map((booking) => ({
      id: booking.id,
      lane: booking.lane,
      mode: booking.mode,
      customer: booking.customer,
      milestone: booking.milestone,
      progress: booking.progress,
      eta: booking.eta,
      updatedAt: bookingById.get(booking.id)?.updatedAt ?? now.toISOString(),
      tone: booking.tone,
      origin: booking.origin,
      destination: booking.destination,
    })),
  }
}

export async function loadDashboardOverview(
  range: DashboardRange,
  customRange?: DashboardCustomDateRange,
  signal?: AbortSignal,
) {
  if (!supabase) throw new Error("This workspace is not connected to Supabase.")
  const client = supabase
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to load the dashboard.")
  const currentOperator = operatorName(session)
  const window = readWindow(range, customRange)
  const timeZone = browserTimeZone()
  const resource = `dashboard:overview:${range}:${window.start}:${window.end}:${timeZone}:${currentOperator}`

  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const { data, error } = await client.rpc("multideck_dashboard_overview", {
      p_window_start: window.start,
      p_window_end: window.end,
      p_series_end: window.seriesEnd,
      p_now: window.now.toISOString(),
      p_cutoff_at: window.cutoff,
      p_time_zone: timeZone,
      p_operator_name: currentOperator,
      p_row_limit: 50,
    }).abortSignal(requestSignal)
    if (error) {
      if (missingDashboardReadModel(error)) return loadLegacyDashboardOverview(range, currentOperator, customRange, requestSignal)
      throw error
    }
    return normalizeOverview(data, currentOperator)
  }, signal)
}

function normalizeDrilldown(value: unknown): DashboardDrilldownPage {
  const row = asRecord(value)
  const cursor = asRecord(row.nextCursor)
  return {
    items: asArray(row.items).map((entry) => {
      const item = asRecord(entry)
      return {
        id: asString(item.id),
        detail: asString(item.detail),
        status: asString(item.status),
        tone: asTone(item.tone),
        recordType: item.recordType === "quote" ? "quote" : "booking",
      }
    }),
    total: asNumber(row.total),
    hasMore: row.hasMore === true,
    nextCursor: row.nextCursor && asString(cursor.sortAt) && asString(cursor.rowKey)
      ? { sortAt: asString(cursor.sortAt), rowKey: asString(cursor.rowKey) }
      : null,
  }
}

const dashboardRegionTerms: Record<string, string[]> = {
  LAX: ["Los Angeles", "Long Beach", "USLAX"],
  CHI: ["Chicago", "USCHI"],
  NYC: ["New York", "JFK", "USJFK"],
  YYZ: ["Toronto", "CATOR"],
  GRU: ["Sao Paulo", "Santos", "BRSSZ"],
  LDN: ["London", "Heathrow", "GBLHR", "Felixstowe", "GBFXT", "Bristol", "GBBRS", "Southampton", "GBSOU", "Gateway", "Manchester", "Birmingham"],
  AMS: ["Amsterdam", "Rotterdam", "NLRTM"],
  FRA: ["Frankfurt", "DEFRA", "Hamburg", "DEHAM"],
  IST: ["Istanbul", "TRIST"],
  DXB: ["Dubai", "AEDXB"],
  BOM: ["Mumbai", "Nhava Sheva", "INNSA"],
  SIN: ["Singapore", "SGSIN"],
  HKG: ["Hong Kong", "HKHKG"],
  SHA: ["Shanghai", "CNSHA", "Yantian", "CNYTN", "Ningbo", "CNNGB"],
  TYO: ["Tokyo", "Narita", "JPTYO", "Kobe", "JPUKB"],
  SYD: ["Sydney", "AUSYD", "Melbourne", "AUMEL"],
}

function dateTime(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function overlapsDashboardWindow(startAt: number | null, endAt: number | null, fallbackAt: number | null, windowStart: number, windowEnd: number) {
  if (startAt !== null && endAt !== null) return startAt < windowEnd && endAt > windowStart
  if (startAt !== null) return startAt >= windowStart && startAt < windowEnd
  if (endAt !== null) return endAt > windowStart && endAt <= windowEnd
  return fallbackAt !== null && fallbackAt >= windowStart && fallbackAt < windowEnd
}

async function loadLegacyDashboardDrilldown(input: {
  kind: DashboardDrilldownKind
  value?: string | null
  range: DashboardRange
  customRange?: DashboardCustomDateRange
  cursor?: DashboardDrilldownCursor | null
}, signal?: AbortSignal): Promise<DashboardDrilldownPage> {
  if (signal?.aborted) throw new DOMException("The dashboard request was cancelled.", "AbortError")
  const { bookings, quotes } = await loadBoundedDashboardCompatibilitySources(signal)
  if (signal?.aborted) throw new DOMException("The dashboard request was cancelled.", "AbortError")

  const window = readWindow(input.range, input.customRange)
  const windowStart = Date.parse(window.start)
  const windowEnd = Date.parse(window.end)
  const region = input.value?.trim().toUpperCase() ?? ""
  const regionTerms = input.kind === "region" ? dashboardRegionTerms[region] : undefined
  if (input.kind === "region" && !regionTerms) throw new Error("Choose a valid dashboard operating region.")

  const locationMatches = (origin: string, destination: string) => {
    const haystack = `${origin} ${destination}`.toLowerCase()
    return regionTerms?.some((term) => haystack.includes(term.toLowerCase())) ?? false
  }
  const rows: Array<DashboardDrilldownItem & { rowKey: string; sortAt: string; sortTime: number }> = []

  for (const booking of bookings) {
    const sortTime = dateTime(booking.updatedAt)
    const inWindow = overlapsDashboardWindow(
      dateTime(booking.departureAt || booking.departureDate),
      dateTime(booking.arrivalAt || booking.arrivalDate),
      sortTime,
      windowStart,
      windowEnd,
    )
    const eligible = input.kind === "active_jobs"
      ? booking.progress < 100 && inWindow
      : input.kind === "booking_exceptions"
        ? booking.progress < 100 && booking.status !== "On track" && inWindow
        : input.kind === "region" && locationMatches(booking.origin, booking.destination)
    if (!eligible) continue
    rows.push({
      id: booking.id,
      detail: `${booking.customer} · ${booking.route}`,
      status: booking.status,
      tone: booking.tone,
      recordType: "booking",
      rowKey: `booking:${booking.id}`,
      sortAt: booking.updatedAt,
      sortTime: sortTime ?? Number.NEGATIVE_INFINITY,
    })
  }

  for (const quote of quotes) {
    const sortTime = dateTime(quote.createdAt)
    const inWindow = overlapsDashboardWindow(
      dateTime(quote.estimatedDeparture),
      dateTime(quote.estimatedArrival),
      sortTime,
      windowStart,
      windowEnd,
    )
    const eligible = input.kind === "open_quotes"
      ? quote.status !== "Sent" && quote.status !== "Accepted" && inWindow
      : input.kind === "ready_quotes"
        ? quote.status === "Ready to send" && inWindow
        : input.kind === "region" && locationMatches(quote.origin, quote.destination)
    if (!eligible) continue
    rows.push({
      id: quote.reference,
      detail: `${quote.customer} · ${quote.origin} → ${quote.destination}`,
      status: quote.status,
      tone: quote.statusTone,
      recordType: "quote",
      rowKey: `quote:${quote.reference}`,
      sortAt: quote.createdAt,
      sortTime: sortTime ?? Number.NEGATIVE_INFINITY,
    })
  }

  rows.sort((left, right) => right.sortTime - left.sortTime || right.rowKey.localeCompare(left.rowKey))
  const total = rows.length
  const cursorTime = dateTime(input.cursor?.sortAt)
  const eligibleRows = input.cursor && cursorTime !== null
    ? rows.filter((row) => row.sortTime < cursorTime || row.sortTime === cursorTime && row.rowKey < input.cursor!.rowKey)
    : rows
  const page = eligibleRows.slice(0, 50)
  const hasMore = eligibleRows.length > page.length
  const last = page.at(-1)
  return {
    items: page.map(({ rowKey: _rowKey, sortAt: _sortAt, sortTime: _sortTime, ...item }) => item),
    total,
    hasMore,
    nextCursor: hasMore && last ? { sortAt: last.sortAt, rowKey: last.rowKey } : null,
  }
}

export async function loadDashboardDrilldownPage(input: {
  kind: DashboardDrilldownKind
  value?: string | null
  range: DashboardRange
  customRange?: DashboardCustomDateRange
  cursor?: DashboardDrilldownCursor | null
  signal?: AbortSignal
}) {
  if (!supabase) throw new Error("This workspace is not connected to Supabase.")
  const client = supabase
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to load this dashboard list.")
  const window = readWindow(input.range, input.customRange)
  const timeZone = browserTimeZone()
  const resource = `dashboard:drilldown:${input.kind}:${input.value ?? ""}:${window.start}:${window.end}:${timeZone}:${input.cursor?.sortAt ?? ""}:${input.cursor?.rowKey ?? ""}`

  return readCachedRegisterPage(session.user.id, resource, async (requestSignal) => {
    const { data, error } = await client.rpc("multideck_dashboard_drilldown_page", {
      p_kind: input.kind,
      p_value: input.value ?? null,
      p_window_start: window.start,
      p_window_end: window.end,
      p_time_zone: timeZone,
      p_limit: 50,
      p_cursor_sort_at: input.cursor?.sortAt ?? null,
      p_cursor_row_key: input.cursor?.rowKey ?? null,
    }).abortSignal(requestSignal)
    if (error) {
      if (missingDashboardReadModel(error)) return loadLegacyDashboardDrilldown(input, requestSignal)
      throw error
    }
    return normalizeDrilldown(data)
  }, input.signal)
}

export function invalidateDashboardOverview() {
  invalidateRegisterPages("dashboard:")
}
