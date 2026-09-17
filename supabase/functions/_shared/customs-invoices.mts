import { validCustomsConversionDate, type HmrcExchangeRate } from "./customs-hmrc-exchange-rates.mts"
import { isCustomsTradeTerm } from "./customs-import-terms.mts"

/** Commercial invoice evidence owned by a declaration, not an accounting invoice. */
export type CustomsInvoiceHeader = {
  id: string
  invoiceNumber: string
  invoiceDate: string
  currency: string
  totalAmount: string
  exchangeRate: string
  hmrcExchangeRate?: HmrcExchangeRate
  extractedFields?: string[]
  extractionAppliedAt?: number
  sourceExtractionId?: string
  tradeTerms: string
  tradeTermsLocation: string
  tradeTermsLocationSource?: string
  transactionNature: string
  grossMass: string
  netMass: string
  letterOfCreditExchangeRate: string
  packageCount: string
  packageKind: string
}

export function emptyCustomsInvoiceHeader(id: string): CustomsInvoiceHeader {
  return { id, invoiceNumber: "", invoiceDate: "", currency: "", totalAmount: "", exchangeRate: "", tradeTerms: "", tradeTermsLocation: "", transactionNature: "", grossMass: "", netMass: "", letterOfCreditExchangeRate: "", packageCount: "", packageKind: "" }
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
export const invoiceNumberKey = (value: string) => value.trim().toUpperCase()

export function normalizeCustomsInvoiceHeader(value: unknown, id = ""): CustomsInvoiceHeader {
  const source = record(value)
  const header = emptyCustomsInvoiceHeader(id)
  for (const field of Object.keys(header) as (keyof CustomsInvoiceHeader)[]) {
    if (field !== "id" && field !== "exchangeRate" && field !== "hmrcExchangeRate") Object.assign(header, { [field]: text(source[field]) })
  }
  if (text(source.tradeTermsLocationSource)) header.tradeTermsLocationSource = text(source.tradeTermsLocationSource)
  return header
}


export function customsInvoiceErrors(input: { invoiceHeaders?: unknown; items?: unknown; customsConversionDate?: unknown }, requireLinks = true) {
  const errors: { field: string; message: string; itemIndex?: number }[] = []
  if (input.invoiceHeaders !== undefined && !Array.isArray(input.invoiceHeaders)) {
    return [{ field: "invoiceHeaders", message: "Invoice headers must be a list." }]
  }
  const headers = (Array.isArray(input.invoiceHeaders) ? input.invoiceHeaders : []).map(record)
  const ids = new Set<string>()
  const numbers = new Set<string>()
  headers.forEach((header, index) => {
    const prefix = `invoiceHeaders.${index}`
    const add = (field: string, message: string) => errors.push({ field: `${prefix}.${field}`, message: `Invoice ${index + 1}: ${message}` })
    const id = text(header.id)
    const number = text(header.invoiceNumber)
    if (!id || ids.has(id)) add("id", "each header needs a unique reference. Remove this header and add it again.")
    ids.add(id)
    if (!number) add("invoiceNumber", "enter an invoice number.")
    else if (number.length > 35 || /[\x00-\x1f\x7f]/.test(number)) add("invoiceNumber", "use an invoice number of up to 35 characters without control characters.")
    else if (numbers.has(invoiceNumberKey(number))) add("invoiceNumber", "this invoice number is already used in this declaration.")
    numbers.add(invoiceNumberKey(number))
    const evidence = record(header.hmrcExchangeRate)
    if (requireLinks && text(header.currency) && text(header.currency) !== "GBP") {
      if (!validCustomsConversionDate(text(input.customsConversionDate))) add("exchangeRate", "select the customs conversion date and load the HMRC rate.")
      else if (evidence.conversionDate !== input.customsConversionDate || evidence.currency !== header.currency || evidence.rate !== header.exchangeRate || evidence.direction !== "currency_units_per_gbp") add("exchangeRate", "load the HMRC rate for this currency and customs conversion date.")
    }
    const date = text(header.invoiceDate)
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) add("invoiceDate", "enter a valid invoice date.")
    const currency = text(header.currency)
    if (currency && !/^[A-Z]{3}$/.test(currency)) add("currency", "select a three-letter currency code.")
    const amount = text(header.totalAmount)
    if (amount && (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0)) add("totalAmount", "enter a total greater than zero with up to two decimal places.")
    if (amount && !currency) add("currency", "select the currency for this invoice total.")
    for (const field of ["exchangeRate", "letterOfCreditExchangeRate", "grossMass", "netMass"] as const) {
      const value = text(header[field])
      if (value && (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0)) add(field, `${field === "exchangeRate" ? "exchange rate" : field === "letterOfCreditExchangeRate" ? "letter of credit exchange rate" : field === "grossMass" ? "gross weight" : "net weight"} must be greater than zero.`)
    }
    if (Number(text(header.netMass)) > Number(text(header.grossMass)) && Number(text(header.grossMass)) > 0) add("netMass", "net weight cannot exceed gross weight.")
    const packages = text(header.packageCount)
    if (packages && (!/^\d+$/.test(packages) || !Number.isSafeInteger(Number(packages)) || Number(packages) <= 0)) add("packageCount", "enter a whole number of packages greater than zero.")
    const terms = text(header.tradeTerms)
    if (terms && !isCustomsTradeTerm(terms)) add("tradeTerms", "select a recognised Incoterm.")
    if (text(header.tradeTermsLocation) && !/^[A-Z]{2}[A-Z2-9]{3}$/.test(text(header.tradeTermsLocation))) add("tradeTermsLocation", "select a UN/LOCODE for the agreed place.")
    const nature = text(header.transactionNature)
    if (nature && !["11", "12", "13", "14", "19", "21", "22", "23", "29", "3", "41", "42", "51", "52", "7", "8", "91", "99"].includes(nature)) add("transactionNature", "select a valid nature of transaction.")

  })
  ;(Array.isArray(input.items) ? input.items : []).forEach((value, itemIndex) => {
    const item = record(value)
    const id = text(item.invoiceHeaderId)
    if (id && !ids.has(id)) errors.push({ field: "invoiceHeaderId", itemIndex, message: `Item ${itemIndex + 1}: the linked invoice no longer exists. Select an invoice from this declaration.` })
    else if (requireLinks && headers.length && !id) errors.push({ field: "invoiceHeaderId", itemIndex, message: `Item ${itemIndex + 1}: select its invoice number.` })

  })
  return errors
}

/** Current iCustoms XML has one declaration currency, exchange rate and terms.
 * Derive these only when every invoice agrees; conflicts are validation errors.
 * Never sum money in different currencies or select the first differing value.
 */
export function resolveCustomsInvoiceDeclaration<T extends { invoiceHeaders?: unknown; items?: unknown }>(input: T): T {
  if (!Array.isArray(input.invoiceHeaders)) return input
  const headers = input.invoiceHeaders.map(record)
  const common = (field: string) => {
    const values = headers.map(header => text(header[field]))
    const keys = values.map(value => field === "exchangeRate" && value ? String(Number(value)) : value.toUpperCase())
    return values.length && keys.every(value => value === keys[0]) ? values[0] : ""
  }
  const sum = (rows: Record<string, unknown>[], field: string, decimals: number) => rows.length && rows.every(row => text(row[field]) && Number.isFinite(Number(row[field])) && Number(row[field]) > 0)
    ? rows.reduce((total, row) => total + Number(row[field]), 0).toFixed(decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1") : ""
  const items = (Array.isArray(input.items) ? input.items : []).map(record)
  // Invoice weights/packages may be omitted when the physical goods lines carry
  // the totals. Never combine a partial set of invoice totals with item totals.
  const physicalTotal = (field: string, decimals: number) => headers.some(header => text(header[field])) ? sum(headers, field, decimals) : sum(items, field, decimals)
  const currency = common("currency")
  return {
    ...input,
    totalAmount: currency ? sum(headers, "totalAmount", 2) : "",
    currency,
    exchangeRate: common("exchangeRate"),
    tradeTerms: common("tradeTerms"),
    tradeTermsLocation: common("tradeTermsLocation"),
    transactionNature: common("transactionNature"),
    totalGrossMass: physicalTotal("grossMass", 3),
    totalNetMass: physicalTotal("netMass", 3),
    totalPackages: physicalTotal("packageCount", 0),
  }
}

export function customsInvoiceProjectionErrors(input: { invoiceHeaders?: unknown }): { field: string; message: string; itemIndex?: number }[] {
  if (!Array.isArray(input.invoiceHeaders) || !input.invoiceHeaders.length) return []
  const headers = input.invoiceHeaders.map(record)
  const labels: Record<string, string> = { currency: "currencies", exchangeRate: "exchange rates", tradeTerms: "Incoterms", tradeTermsLocation: "agreed places for Incoterms", transactionNature: "natures of transaction" }
  const errors: { field: string; message: string }[] = []
  for (const [field, label] of Object.entries(labels)) {
    const values = headers.map(header => text(header[field]))
    const keys = values.map(value => field === "exchangeRate" && value ? String(Number(value)) : value.toUpperCase())
    if (new Set(keys).size > 1) errors.push({ field: `invoiceHeaders.${field}`, message: `Invoices have different or incomplete ${label}. The current customs submission requires one shared value. Review the invoice headers; use separate declarations where values genuinely differ.` })
  }
  for (const field of ["grossMass", "netMass", "packageCount"]) {
    if (headers.some(header => text(header[field])) && headers.some(header => !text(header[field]))) errors.push({ field: `invoiceHeaders.${field}`, message: `Complete ${field === "packageCount" ? "the number of packages" : field === "grossMass" ? "gross weight" : "net weight"} for every invoice, or leave it blank on every invoice to use the goods-line totals.` })
  }
  return errors
}
