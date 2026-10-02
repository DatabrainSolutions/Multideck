import type { FinanceMonth } from "@/lib/finance-director-api"

/**
 * The dashboard's figures, worked out from the months the server returns. Kept
 * free of React so the period maths and the forecast can be read and tested on
 * their own.
 */

export type FinancePeriod = "month" | "quarter" | "half" | "year"

export const financePeriods: { value: FinancePeriod; label: string; months: number }[] = [
  { value: "month", label: "Month", months: 1 },
  { value: "quarter", label: "Quarter", months: 3 },
  { value: "half", label: "6 months", months: 6 },
  { value: "year", label: "12 months", months: 12 },
]

export const periodMonths = (period: FinancePeriod) => financePeriods.find((item) => item.value === period)?.months ?? 3

const pad = (value: number) => String(value).padStart(2, "0")
export const monthKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
const parseMonth = (key: string) => { const [year, month] = key.split("-").map(Number); return new Date(year, month - 1, 1) }
const addMonths = (key: string, count: number) => { const date = parseMonth(key); date.setMonth(date.getMonth() + count); return monthKey(date) }
const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/**
 * A period is whole, closed months ending with last month. The month in
 * progress is left out of the comparison: half a month set against a full one
 * would read as a fall every time.
 */
export function periodWindow(period: FinancePeriod, asOf = new Date()) {
  const current = monthKey(asOf)
  const end = addMonths(current, -1)
  const length = periodMonths(period)
  const start = addMonths(end, -(length - 1))
  const endDate = parseMonth(end)
  endDate.setMonth(endDate.getMonth() + 1, 0)
  return {
    current,
    start,
    end,
    length,
    previousStart: addMonths(start, -length),
    previousEnd: addMonths(start, -1),
    from: `${start}-01`,
    to: isoDate(endDate),
    asOf: isoDate(asOf),
  }
}

export type FinanceTotals = {
  revenue: number
  directCost: number
  overheads: number
  grossProfit: number
  netProfit: number
  cashIn: number
  cashOut: number
  netCash: number
  months: number
}

export function totalsBetween(months: FinanceMonth[], start: string, end: string): FinanceTotals {
  const selected = months.filter((month) => month.month >= start && month.month <= end)
  const sum = (pick: (month: FinanceMonth) => number) => selected.reduce((total, month) => total + pick(month), 0)
  const revenue = sum((month) => month.revenue)
  const directCost = sum((month) => month.directCost)
  const overheads = sum((month) => month.overheads)
  const cashIn = sum((month) => month.cashIn)
  const cashOut = sum((month) => month.cashOut)
  return {
    revenue,
    directCost,
    overheads,
    grossProfit: revenue - directCost,
    netProfit: revenue - directCost - overheads,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    months: selected.length,
  }
}

/** Margin as a share of revenue, or null when there is no revenue to divide by. */
export const margin = (profit: number, revenue: number) => (revenue > 0 ? profit / revenue : null)

/**
 * Movement against the previous period. A percentage needs a positive base: a
 * loss turning into a smaller loss is not "-40%", so a zero or negative base
 * reports the absolute change instead.
 */
export function movement(current: number, previous: number) {
  const change = current - previous
  const direction = Math.abs(change) < 0.5 ? "flat" as const : change > 0 ? "up" as const : "down" as const
  if (previous > 0) return { direction, change, ratio: change / previous }
  return { direction, change, ratio: null }
}

export type ForecastPoint = { month: string; value: number; low: number; high: number }

export type FinanceForecast = {
  /** Completed months the projection was fitted on. */
  basis: FinanceMonth[]
  revenue: ForecastPoint[]
  netProfit: ForecastPoint[]
}

/**
 * A straight-line trend through up to twelve closed months, carried three
 * months forward from the month in progress. The band is the spread of the
 * months around that line (roughly an 80% range), widening the further out it
 * reaches. It is deliberately plain: a seasonal model needs two full years of
 * posted history that most ledgers here do not have yet, and a fitted curve
 * that cannot be explained is worse than a line that can.
 */
export function forecast(months: FinanceMonth[], current: string, horizon = 3): FinanceForecast | null {
  const closed = months.filter((month) => month.month < current)
  // Start from the first month that has any activity, so a ledger that went
  // live recently is not dragged towards zero by empty months before it.
  const firstActive = closed.findIndex((month) => month.revenue !== 0 || month.directCost !== 0 || month.overheads !== 0)
  if (firstActive < 0) return null
  const basis = closed.slice(firstActive).slice(-12)
  if (basis.length < 6) return null

  const project = (values: number[]): ForecastPoint[] => {
    const count = values.length
    const meanX = (count - 1) / 2
    const meanY = values.reduce((total, value) => total + value, 0) / count
    let numerator = 0
    let denominator = 0
    values.forEach((value, index) => {
      numerator += (index - meanX) * (value - meanY)
      denominator += (index - meanX) ** 2
    })
    const slope = denominator === 0 ? 0 : numerator / denominator
    const intercept = meanY - slope * meanX
    const residuals = values.map((value, index) => value - (intercept + slope * index))
    const spread = Math.sqrt(residuals.reduce((total, value) => total + value ** 2, 0) / Math.max(count - 2, 1))
    return Array.from({ length: horizon }, (_, step) => {
      const x = count + step
      const value = intercept + slope * x
      const width = 1.28 * spread * Math.sqrt(1 + 1 / count + ((x - meanX) ** 2) / Math.max(denominator, 1))
      return { month: addMonths(current, step), value, low: value - width, high: value + width }
    })
  }

  return {
    basis,
    revenue: project(basis.map((month) => month.revenue)),
    netProfit: project(basis.map((month) => month.revenue - month.directCost - month.overheads)),
  }
}

/**
 * Average days a customer takes to pay: what is owed now against the sales of
 * the last three closed months.
 */
export function debtorDays(receivables: number, months: FinanceMonth[], current: string) {
  const recent = months.filter((month) => month.month < current).slice(-3)
  const revenue = recent.reduce((total, month) => total + month.revenue, 0)
  if (revenue <= 0 || receivables <= 0) return null
  const days = recent.reduce((total, month) => {
    const date = parseMonth(month.month)
    return total + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }, 0)
  return Math.round((receivables / revenue) * days)
}

export function formatMonth(key: string, language: string, style: "short" | "long" = "short") {
  return new Intl.DateTimeFormat(language, { month: style, ...(style === "long" ? { year: "numeric" } : {}) }).format(parseMonth(key))
}

export function formatMonthRange(start: string, end: string, language: string) {
  const format = new Intl.DateTimeFormat(language, { month: "short", year: "numeric" })
  if (start === end) return new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(parseMonth(start))
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const first = sameYear ? new Intl.DateTimeFormat(language, { month: "short" }).format(parseMonth(start)) : format.format(parseMonth(start))
  return `${first} – ${format.format(parseMonth(end))}`
}

export function moneyFormatter(currency: string, language: string) {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "GBP"
  const whole = new Intl.NumberFormat(language, { style: "currency", currency: code, maximumFractionDigits: 0 })
  const compact = new Intl.NumberFormat(language, { style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1 })
  return {
    whole: (value: number) => whole.format(Math.round(value) === 0 ? 0 : value),
    compact: (value: number) => (Math.abs(value) < 1000 ? whole.format(Math.round(value) === 0 ? 0 : value) : compact.format(value)),
  }
}

export function percent(value: number | null, language: string) {
  if (value === null) return null
  // A margin that rounds to nothing is "0%", never "-0%".
  const shown = Math.abs(value) < 0.0005 ? 0 : value
  return new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: Math.abs(shown) < 0.1 ? 1 : 0, signDisplay: "auto" }).format(shown)
}
