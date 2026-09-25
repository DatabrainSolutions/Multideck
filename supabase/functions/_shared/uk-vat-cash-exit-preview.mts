import { calculateUkCashExitOutstanding, type CashExitOutstandingInput } from "./uk-vat-cash-allocation.mts"

type RecordValue = Record<string, unknown>
type Box = 1 | 4 | 6 | 7

export type UkVatCashExitPreview = {
  status: "immediate_exit_preview_only"
  calculationValid: boolean
  returnReady: false
  sourceDigest: string | null
  issueCount: number
  issues: string[]
  sourceBoxesGbp: Record<Box, string> | null
  invoiceLines: Array<{
    invoiceId: string
    lineId: string
    decisionId: string
    treatment: string
    netGbp: string
    vatGbp: string
  }>
}

const amountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/
const gbpRatePattern = /^1(?:\.0{1,10})?$/
const digestPattern = /^[0-9a-f]{64}$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const boxes: Box[] = [1, 4, 6, 7]

function object(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue : null
}

function count(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null
}

function units(value: unknown): bigint {
  if (typeof value !== "string" || !amountPattern.test(value)) throw new Error("Cash exit needs exact non-negative GBP source strings.")
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
}

function money(value: bigint): string {
  return `${value / 10000n}.${String(value % 10000n).padStart(4, "0")}`
}

function validCashSource(source: RecordValue): boolean {
  try {
    if (source.source_issue !== false || source.reviewFingerprintMatches !== true
      || source.native_posting_status !== "posted"
      || (source.cash_type !== "customer_receipt" && source.cash_type !== "supplier_payment")
      || source.currency_code !== "GBP" || typeof source.exchange_rate !== "string"
      || !gbpRatePattern.test(source.exchange_rate)
      || units(source.cash_amount) === 0n
      || units(source.cash_amount) !== units(source.local_amount)
      || units(source.unallocated_amount) !== 0n
      || units(source.cash_amount) !== units(source.represented_amount)) return false
    return true
  } catch { return false }
}

/** Read-only immediate-option source amounts. Prior filed Cash events, ledger
 * bridge, statutory exclusions and transition approval are separate gates.
 * A partial or inconsistent snapshot never produces partial box totals. */
export function previewUkVatCashExitImmediate(value: unknown): UkVatCashExitPreview {
  const snapshot = object(value)
  const issues: string[] = []
  let issueCount = 0
  const issue = (message: string) => { issueCount++; if (issues.length < 30) issues.push(message) }
  const empty = (): UkVatCashExitPreview => ({
    status: "immediate_exit_preview_only", calculationValid: false,
    returnReady: false, sourceDigest: typeof snapshot?.sourceDigest === "string"
      && digestPattern.test(snapshot.sourceDigest) ? snapshot.sourceDigest : null,
    issueCount, issues, sourceBoxesGbp: null, invoiceLines: [],
  })
  const context = object(snapshot?.verifiedTransition)
  if (!snapshot || snapshot.amountEncoding !== "decimal_strings"
    || snapshot.truncated !== false || !digestPattern.test(String(snapshot.sourceDigest ?? ""))
    || !context || typeof context.cashRegistrationId !== "string"
    || typeof context.finalCashPeriodId !== "string"
    || typeof context.nextStandardRegistrationId !== "string"
    || typeof context.schemeEntryDate !== "string"
    || typeof context.schemeExitDate !== "string"
    || !datePattern.test(context.schemeEntryDate) || !datePattern.test(context.schemeExitDate)
    || context.schemeEntryDate > context.schemeExitDate
    || snapshot.startDate !== context.schemeEntryDate
    || snapshot.exitDate !== context.schemeExitDate
    || !Array.isArray(snapshot.invoices) || !Array.isArray(snapshot.cashSources)
    || !Array.isArray(snapshot.priceChanges)) {
    issue("A complete inventory bound to recorded Cash and Standard terms is required.")
    return empty()
  }
  const invoices = snapshot.invoices.map(object)
  const cash = snapshot.cashSources.map(object)
  if (invoices.some((invoice) => !invoice) || cash.some((source) => !source)
    || count(snapshot.invoiceCount) !== invoices.length
    || count(snapshot.cashSourceCount) !== cash.length
    || count(snapshot.postedPriceChangeCount) !== snapshot.priceChanges.length
    || count(snapshot.lineCount) !== invoices.reduce((total, invoice) =>
      total + (Array.isArray(invoice?.lines) ? invoice.lines.length : 0), 0)
    || count(snapshot.allocationCount) !== invoices.reduce((total, invoice) =>
      total + (Array.isArray(invoice?.allocation_sources) ? invoice.allocation_sources.length : 0), 0)
    || count(snapshot.cashAllocationCount) !== cash.reduce((total, source) =>
      total + (Array.isArray(source?.allocation_sources) ? source.allocation_sources.length : 0), 0)) {
    issue("Cash exit source counts or item shapes are incomplete.")
    return empty()
  }
  if (count(snapshot.postedPriceChangeCount) !== 0 || snapshot.requiresPriceChangeReview !== false) {
    issue("Posted price changes require reviewed Cash credit and refund treatment.")
  }
  if (count(snapshot.dueTermIssueCount) !== 0) issue("An invoice has missing or ineligible payment terms.")
  if (count(snapshot.lineSourceIssueCount) !== 0 || count(snapshot.lineTreatmentIssueCount) !== 0) {
    issue("An invoice line lacks complete supported Cash VAT evidence.")
  }
  if (count(snapshot.cashSourceIssueCount) !== 0) issue("A cash source or payment-date review is unresolved.")
  if (cash.some((source) => !source || !validCashSource(source))) {
    issue("A cash source is not supported by its current payment review.")
  }
  if (issueCount) return empty()

  const seenInvoices = new Set<string>()
  const amounts = { 1: 0n, 4: 0n, 6: 0n, 7: 0n }
  const invoiceLines: UkVatCashExitPreview["invoiceLines"] = []
  for (const invoice of invoices) {
    const row = invoice!
    const invoiceId = row.invoice_id
    const side = row.document_type === "sl_invoice" ? "sale"
      : row.document_type === "pl_invoice" ? "purchase" : null
    if (typeof invoiceId !== "string" || !invoiceId || seenInvoices.has(invoiceId)
      || !side || row.currency_code !== "GBP" || typeof row.exchange_rate !== "string"
      || !gbpRatePattern.test(row.exchange_rate)
      || row.source_exception !== false || row.due_within_six_months !== true
      || count(row.lineSourceIssueCount) !== 0 || count(row.lineTreatmentIssueCount) !== 0
      || !Array.isArray(row.lines) || row.lines.length === 0) {
      issue(`Invoice ${String(invoiceId ?? "unknown")} needs source or eligibility review.`)
      continue
    }
    seenInvoices.add(invoiceId)
    try {
      if (units(row.gross_amount) !== units(row.local_gross_amount)
        || units(row.gross_amount) - units(row.paid_through_exit)
          !== units(row.candidate_outstanding)) {
        throw new Error("Invoice balance does not match exact posted GBP amounts.")
      }
      const lines: CashExitOutstandingInput["lines"] = row.lines.map((item: unknown) => {
        const line = object(item)
        if (!line || typeof line.lineId !== "string" || typeof line.decisionId !== "string"
          || line.decisionScheme !== "cash" || line.supportedCashTreatment !== true
          || line.taxPointInCashTerm !== true || typeof line.treatment !== "string"
          || typeof line.reviewedRuleId !== "string"
          || units(line.netGbp) !== units(line.evidenceNetGbp)
          || units(line.vatGbp) !== units(line.evidenceVatGbp)
          || units(line.netGbp) + units(line.vatGbp) !== units(line.grossGbp)) {
          throw new Error("An invoice line does not match its reviewed VAT source.")
        }
        return { lineId: line.lineId, treatment: line.treatment as CashExitOutstandingInput["lines"][number]["treatment"],
          reviewedRuleId: line.reviewedRuleId, netGbp: line.netGbp as string, vatGbp: line.vatGbp as string }
      })
      const calculated = calculateUkCashExitOutstanding({ invoiceId, side,
        invoiceGrossGbp: row.gross_amount as string,
        paidThroughExitGbp: row.paid_through_exit as string, lines })
      if (units(calculated.apportionmentRemainderGbp) !== 0n) {
        throw new Error("Cash exit apportionment needs a reviewed rounding bridge.")
      }
      for (const box of boxes) amounts[box] += units(calculated.sourceBoxesGbp[box])
      for (const line of calculated.lines) {
        const source = (row.lines as RecordValue[]).find((item) => item.lineId === line.lineId)!
        invoiceLines.push({ invoiceId, lineId: line.lineId, decisionId: source.decisionId as string,
          treatment: line.treatment, netGbp: line.netGbp, vatGbp: line.vatGbp })
      }
    } catch (error) {
      issue(`Invoice ${invoiceId}: ${error instanceof Error ? error.message : "invalid source"}`)
    }
  }
  if (issueCount) return empty()
  return { status: "immediate_exit_preview_only", calculationValid: true,
    returnReady: false, sourceDigest: snapshot.sourceDigest as string,
    issueCount: 0, issues: [], sourceBoxesGbp: {
      1: money(amounts[1]), 4: money(amounts[4]),
      6: money(amounts[6]), 7: money(amounts[7]),
    }, invoiceLines }
}
