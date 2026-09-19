export type HmrcExchangeRate = {
  currency: string
  rate: string
  conversionDate: string
  validFrom: string
  validTo: string
  sourceUrl: string
  fetchedAt: string
  direction: "currency_units_per_gbp"
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
/** Customs operates on the UK calendar date, independent of the operator's browser timezone. */
export function customsToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const part = (type: string) => parts.find(value => value.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function validCustomsConversionDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
}
export function hmrcMonthlyRatesUrl(date: string) {
  if (!validCustomsConversionDate(date)) throw new Error("Select a valid customs conversion date.")
  return `https://www.trade-tariff.service.gov.uk/uk/api/exchange_rates/${date.slice(0, 4)}-${Number(date.slice(5, 7))}?filter%5Btype%5D=monthly`
}

export function selectHmrcExchangeRate(payload: unknown, currency: string, date: string, fetchedAt: string): HmrcExchangeRate {
  const sourceUrl = hmrcMonthlyRatesUrl(date)
  const response = record(payload)
  const collection = record(record(response.data).attributes)
  if (collection.type !== "monthly" || String(collection.year) !== date.slice(0, 4) || Number(collection.month) !== Number(date.slice(5, 7))) throw new Error("HMRC returned a different rate period. Refresh the rates before continuing.")
  const rows = (Array.isArray(response.included) ? response.included : []).map(record)
    .filter(row => row.type === "exchange_rate").map(row => record(row.attributes))
    .filter(row => text(row.currency_code) === currency && validCustomsConversionDate(text(row.validity_start_date)) && validCustomsConversionDate(text(row.validity_end_date)) && text(row.validity_start_date) <= date && text(row.validity_end_date) >= date)
    .sort((a, b) => text(b.validity_start_date).localeCompare(text(a.validity_start_date)))
  const latest = rows[0]
  if (!latest) throw new Error(`HMRC has no published ${currency} rate covering ${date}. Check the official list or choose the correct conversion date.`)
  const candidates = rows.filter(row => row.validity_start_date === latest.validity_start_date)
  if (new Set(candidates.map(row => text(row.rate))).size !== 1) throw new Error(`HMRC returned conflicting ${currency} rates. Check the official list before continuing.`)
  const rate = text(latest.rate)
  if (!/^\d+(\.\d+)?$/.test(rate) || !Number.isFinite(Number(rate)) || Number(rate) <= 0) throw new Error(`HMRC returned an invalid ${currency} rate. Try again later.`)
  return { currency, rate, conversionDate: date, validFrom: text(latest.validity_start_date), validTo: text(latest.validity_end_date), sourceUrl, fetchedAt, direction: "currency_units_per_gbp" }
}

export async function fetchHmrcMonthlyRates(date: string, signal?: AbortSignal) {
  const response = await fetch(hmrcMonthlyRatesUrl(date), { headers: { Accept: "application/vnd.hmrc.2.0+json" }, credentials: "omit", cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`HMRC exchange rates are unavailable (${response.status}). Your saved values are retained; refresh before submitting.`)
  return response.json() as Promise<unknown>
}

/** The authoritative submission boundary rechecks the official source, including
 * in-month amendments. Client evidence is an audit snapshot, never authority. */
export async function verifyCustomsInvoiceHmrcRates(input: { invoiceHeaders?: unknown; customsConversionDate?: unknown }, submissionDate?: string) {
  const headers = (Array.isArray(input.invoiceHeaders) ? input.invoiceHeaders : []).map(record)
  const foreign = headers.filter(header => text(header.currency) && text(header.currency) !== "GBP")
  if (!foreign.length) return []
  const date = text(input.customsConversionDate)
  if (!validCustomsConversionDate(date)) return ["Select the customs conversion date in Invoice header before checking HMRC rates."]
  if (submissionDate && date !== submissionDate) return [`This estimate is dated ${date}. Refresh HMRC rates for the submission date (${submissionDate}) and review before submitting.`]
  try {
    const payload = await fetchHmrcMonthlyRates(date)
    return foreign.flatMap(header => {
      const expected = selectHmrcExchangeRate(payload, text(header.currency), date, new Date().toISOString())
      return text(header.exchangeRate) === expected.rate ? [] : [`Invoice ${text(header.invoiceNumber)}: the saved exchange rate differs from HMRC for ${date}. Refresh HMRC rates in Invoice header and review the change.`]
    })
  } catch (error) {
    return [error instanceof Error ? error.message : "HMRC exchange rates could not be checked. Try again before submitting."]
  }
}
