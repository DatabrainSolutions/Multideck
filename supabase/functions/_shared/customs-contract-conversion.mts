import { Decimal } from "./customs-calculation-decimal.mts"
import { validCustomsConversionDate } from "./customs-hmrc-exchange-rates.mts"

export type ContractConversionWorksheet = {
  invoiceId: string
  basis: "foreign-invoice-gbp-payment" | "gbp-invoice-reconversion"
  foreignCurrency: string
  fixedRate: string
  direction: "currency_units_per_gbp"
  sellerPaymentCurrency: "GBP" | ""
  contractReference: string
  fixedRateClauseEvidence: string
  sellerPaymentEvidence: string
  validFrom: string
  validTo: string
}

/** A letter-of-credit rate alone does not establish this treatment. The
 * invoice-linked worksheet records the contract and GBP-payment conditions.
 * The supplied converter is the ordinary dated HMRC converter, not this rate.
 * https://www.gov.uk/guidance/converting-foreign-currency-amounts-to-include-in-the-customs-value
 */
export function validateContractConversion(worksheet: ContractConversionWorksheet, invoice: { id: string; currency: string }, date: string): Decimal {
  if (worksheet.invoiceId !== invoice.id) throw new Error("The contractual conversion evidence belongs to a different invoice.")
  if (!validCustomsConversionDate(date) || !validCustomsConversionDate(worksheet.validFrom) || !validCustomsConversionDate(worksheet.validTo) || worksheet.validFrom > date || worksheet.validTo < date) throw new Error("The contractual conversion evidence must cover the calculation date.")
  if (!["foreign-invoice-gbp-payment", "gbp-invoice-reconversion"].includes(worksheet.basis)) throw new Error("Select the applicable contractual conversion treatment.")
  if (!/^[A-Z]{3}$/.test(worksheet.foreignCurrency) || worksheet.foreignCurrency === "GBP" || worksheet.direction !== "currency_units_per_gbp") throw new Error("Contractual conversion needs a foreign currency and an explicit foreign-units-per-GBP rate.")
  if (worksheet.sellerPaymentCurrency !== "GBP" || !worksheet.contractReference?.trim() || !worksheet.fixedRateClauseEvidence?.trim() || !worksheet.sellerPaymentEvidence?.trim()) throw new Error("Evidence the fixed-rate contract and the seller's payment in GBP; a letter-of-credit rate alone is not sufficient.")
  const rate = Decimal.parse(worksheet.fixedRate)
  if (rate.n <= 0n) throw new Error("The contract rate must be positive.")
  if (worksheet.basis === "foreign-invoice-gbp-payment" && invoice.currency !== worksheet.foreignCurrency) throw new Error("The foreign invoice currency does not match its contract evidence.")
  if (worksheet.basis === "gbp-invoice-reconversion" && invoice.currency !== "GBP") throw new Error("Reconversion applies only to a GBP invoice based on a fixed foreign-currency contract rate.")
  return rate
}

export function contractGoodsValue(worksheet: ContractConversionWorksheet, invoice: { id: string; currency: string; amount: string }, date: string, hmrcConvert: (amount: string, currency: string) => Decimal) {
  const rate = validateContractConversion(worksheet, invoice, date), original = Decimal.parse(invoice.amount)
  if (original.n < 0n) throw new Error("The invoice amount cannot be negative.")
  if (worksheet.basis === "foreign-invoice-gbp-payment") {
    return { value: original.div(rate), explanation: `${invoice.amount} ${invoice.currency} ÷ contract rate ${worksheet.fixedRate} (foreign units per GBP)`, foreignAmount: original.evidence() }
  }
  const foreign = original.mul(rate)
  // Do not round the intermediate foreign amount. Convert one foreign unit,
  // then multiply exact fractions to retain all original invoice precision.
  const value = foreign.mul(hmrcConvert("1", worksheet.foreignCurrency))
  return { value, explanation: `${invoice.amount} GBP × contract rate ${worksheet.fixedRate}, then ${worksheet.foreignCurrency} converted using the dated HMRC rate`, foreignAmount: foreign.evidence() }
}
