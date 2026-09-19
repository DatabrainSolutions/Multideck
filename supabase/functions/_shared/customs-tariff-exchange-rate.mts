import { Decimal } from "./customs-calculation-decimal.mts"

export const TARIFF_EXCHANGE_RATE_SOURCE = "https://www.trade-tariff.service.gov.uk/xi/api/v2/monetary_exchange_rates"
export type TariffExchangeRate = ReturnType<typeof selectTariffExchangeRate>
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Select from a retained official response, never invoice FX or a latest-rate fallback.
 * Same-period amendments require resolution rather than guessing from response order.
 * This supplies evidence only: it does not certify a rule or round a duty amount. */
export function selectTariffExchangeRate(payload: unknown, calculationDate: string) {
  if (!validDate(calculationDate)) throw new Error("A valid tariff conversion date is required.")
  const data = object(payload).data
  if (!Array.isArray(data)) throw new Error("The tariff conversion response has no rate records.")
  const candidates = data.filter(value => {
    const row = object(value)
    const attributes = object(row.attributes)
    return row.type === "monetary_exchange_rate" && attributes.child_monetary_unit_code === "GBP" && typeof attributes.validity_start_date === "string" && attributes.validity_start_date.slice(0, 7) === calculationDate.slice(0, 7)
  })
  if (candidates.length !== 1) throw new Error(candidates.length ? "Multiple tariff conversion records cover this month; resolve the applicable amendment." : "No tariff conversion rate is available for this month. A different month's rate cannot be substituted.")
  const row = object(candidates[0])
  const attributes = object(row.attributes)
  const start = attributes.validity_start_date
  const startDate = typeof start === "string" ? start.slice(0, 10) : ""
  if (!validDate(startDate) || ![startDate, `${startDate}T00:00:00.000Z`].includes(String(start)) || startDate > calculationDate || !validDate(attributes.operation_date) || typeof row.id !== "string" || !row.id.trim()) throw new Error("The tariff conversion record has invalid dates or identification.")
  const rate = attributes.exchange_rate
  if (typeof rate !== "string" || !/^\d+(\.\d+)?$/.test(rate) || Decimal.parse(rate).n <= 0n) throw new Error("The tariff conversion rate must be a positive exact decimal.")
  return {
    recordId: row.id, source: TARIFF_EXCHANGE_RATE_SOURCE,
    purpose: "specific-tariff-duty" as const,
    fromCurrency: "EUR" as const, toCurrency: "GBP" as const,
    direction: "GBP-per-EUR" as const, rate,
    calculationDate, validityStart: startDate, operationDate: attributes.operation_date,
    certified: false as const,
  }
}

/** Keep the original EUR component and apply this to its exact amount, including
 * comparison bounds. Never round the converted rate before calculating duty. */
export function convertEuroTariffAmount(amount: Decimal, reference: TariffExchangeRate | undefined, calculationDate: string): Decimal {
  if (!reference || reference.source !== TARIFF_EXCHANGE_RATE_SOURCE || reference.purpose !== "specific-tariff-duty" || reference.fromCurrency !== "EUR" || reference.toCurrency !== "GBP" || reference.direction !== "GBP-per-EUR" || reference.calculationDate !== calculationDate) throw new Error("Specific duty needs its own dated EUR-to-GBP tariff conversion evidence, not an invoice exchange rate.")
  const verified = selectTariffExchangeRate({ data: [{ id: reference.recordId, type: "monetary_exchange_rate", attributes: { child_monetary_unit_code: "GBP", exchange_rate: reference.rate, operation_date: reference.operationDate, validity_start_date: reference.validityStart } }] }, calculationDate)
  return amount.mul(Decimal.parse(verified.rate))
}
