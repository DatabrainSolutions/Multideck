/** Deterministic cash-accounting arithmetic for one posted GBP allocation.
 * The caller must verify scheme eligibility, payment date, invoice order,
 * source posting, credit linkage and reviewed tax treatment before using it.
 * This helper does not create VAT evidence or authorise a return. */
export type CashLineTreatment = "domestic_sale" | "zero_rated_sale" | "exempt_sale"
  | "domestic_purchase" | "nonrecoverable_purchase" | "zero_rated_purchase" | "exempt_purchase"

export interface CashAllocationInput {
  allocationId: string
  invoiceId: string
  paymentDate: string
  periodStart: string
  periodEnd: string
  side: "sale" | "purchase"
  invoiceGrossGbp: string
  paidBeforeGbp: string
  paidNowGbp: string
  lines: Array<{
    lineId: string
    treatment: CashLineTreatment
    reviewedRuleId: string
    netGbp: string
    vatGbp: string
  }>
}

export interface CashAllocationResult {
  allocationId: string
  invoiceId: string
  paymentDate: string
  lines: Array<{
    lineId: string
    reviewedRuleId: string
    treatment: CashLineTreatment
    netGbp: string
    vatGbp: string
  }>
  /** Unrounded source amounts for boxes 1, 4, 6 and 7 respectively. */
  sourceBoxesGbp: { 1: string; 4: string; 6: string; 7: string }
  /** Four-decimal apportionment can leave a bounded fraction of a penny. */
  allocationRemainderGbp: string
}

export interface CashInvoiceBalance {
  invoiceId: string
  issueDate: string
  /** Immutable ordering within one date; do not use a random UUID as order. */
  issueSequence: number
  invoiceGrossGbp: string
  paidBeforeGbp: string
}

/** Arithmetic for the immediate outstanding-tax option when leaving Cash
 * Accounting. The caller must verify the final Cash period, all payment
 * history, transition eligibility and reviewed source before using it. */
export interface CashExitOutstandingInput {
  invoiceId: string
  side: "sale" | "purchase"
  invoiceGrossGbp: string
  paidThroughExitGbp: string
  lines: CashAllocationInput["lines"]
}

export interface CashExitOutstandingResult {
  invoiceId: string
  outstandingGrossGbp: string
  /** A four-decimal allocation may leave a fraction-of-a-penny bridge. */
  apportionmentRemainderGbp: string
  lines: CashAllocationResult["lines"]
  sourceBoxesGbp: CashAllocationResult["sourceBoxesGbp"]
  status: "calculation_only_no_cash_event"
}

const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/
const allowedTreatments = new Set<CashLineTreatment>([
  "domestic_sale", "zero_rated_sale", "exempt_sale", "domestic_purchase",
  "nonrecoverable_purchase", "zero_rated_purchase", "exempt_purchase",
])

function money(value: string): bigint {
  if (!moneyPattern.test(value)) throw new Error("Cash VAT amounts must be non-negative GBP with at most four decimals.")
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
}

function format(value: bigint): string {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? "-" : ""}${absolute / 10000n}.${String(absolute % 10000n).padStart(4, "0")}`
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Cumulative targets stop repeated part payments from accumulating rounding
 * drift. Full settlement always takes the final remainder of the invoice. */
function portion(original: bigint, cumulativePaid: bigint, gross: bigint): bigint {
  return cumulativePaid === gross ? original : original * cumulativePaid / gross
}

export function calculateUkCashAllocation(input: CashAllocationInput): CashAllocationResult {
  if (!input.allocationId || !input.invoiceId || !validDate(input.paymentDate)
    || !validDate(input.periodStart) || !validDate(input.periodEnd)
    || input.periodStart > input.periodEnd
    || input.paymentDate < input.periodStart || input.paymentDate > input.periodEnd
    || !["sale", "purchase"].includes(input.side) || !input.lines.length) {
    throw new Error("Cash VAT needs a dated allocation in one valid VAT period.")
  }
  const gross = money(input.invoiceGrossGbp)
  const paidBefore = money(input.paidBeforeGbp)
  const paidNow = money(input.paidNowGbp)
  if (gross === 0n || paidNow === 0n || paidBefore + paidNow > gross) {
    throw new Error("Cash VAT payment exceeds or does not reduce the invoice balance.")
  }
  const seen = new Set<string>()
  let lineGross = 0n
  let allocated = 0n
  const boxes = { 1: 0n, 4: 0n, 6: 0n, 7: 0n }
  const lines = input.lines.map((line) => {
    if (!line.lineId || !line.reviewedRuleId || seen.has(line.lineId)) {
      throw new Error("Cash VAT needs distinct, reviewed invoice lines.")
    }
    seen.add(line.lineId)
    if (!allowedTreatments.has(line.treatment)) throw new Error("Cash VAT treatment needs a reviewed supported rule.")
    const sale = line.treatment.endsWith("_sale")
    if ((input.side === "sale") !== sale) throw new Error("Cash VAT line treatment does not match the invoice side.")
    const net = money(line.netGbp)
    const vat = money(line.vatGbp)
    if (net + vat === 0n || ((line.treatment.startsWith("zero_rated") || line.treatment.startsWith("exempt")) && vat !== 0n)) {
      throw new Error("Cash VAT source lines need coherent net and VAT values.")
    }
    lineGross += net + vat
    const nextPaid = paidBefore + paidNow
    const currentNet = portion(net, nextPaid, gross) - portion(net, paidBefore, gross)
    const currentVat = portion(vat, nextPaid, gross) - portion(vat, paidBefore, gross)
    allocated += currentNet + currentVat
    if (input.side === "sale") {
      boxes[6] += currentNet
      if (line.treatment === "domestic_sale") boxes[1] += currentVat
    } else {
      boxes[7] += currentNet
      if (line.treatment === "domestic_purchase") boxes[4] += currentVat
    }
    return { lineId: line.lineId, reviewedRuleId: line.reviewedRuleId,
      treatment: line.treatment, netGbp: format(currentNet), vatGbp: format(currentVat) }
  })
  if (lineGross !== gross) throw new Error("Cash VAT invoice lines do not add to its GBP gross.")
  return {
    allocationId: input.allocationId, invoiceId: input.invoiceId,
    paymentDate: input.paymentDate, lines,
    sourceBoxesGbp: { 1: format(boxes[1]), 4: format(boxes[4]),
      6: format(boxes[6]), 7: format(boxes[7]) },
    allocationRemainderGbp: format(paidNow - allocated),
  }
}

/** HMRC Notice 731 section 6.4 permits outstanding VAT to be brought into
 * account in the final Cash period. This calculates only the unpaid fraction;
 * it does not invent a cash receipt/payment or choose the six-month option. */
export function calculateUkCashExitOutstanding(input: CashExitOutstandingInput): CashExitOutstandingResult {
  if (!input.invoiceId || !["sale", "purchase"].includes(input.side) || !input.lines.length) {
    throw new Error("Cash VAT exit needs a reviewed sale or purchase invoice.")
  }
  const gross = money(input.invoiceGrossGbp)
  const paid = money(input.paidThroughExitGbp)
  if (gross === 0n || paid > gross) throw new Error("Cash VAT exit invoice balance is invalid.")
  const seen = new Set<string>()
  const boxes = { 1: 0n, 4: 0n, 6: 0n, 7: 0n }
  let lineGross = 0n
  let apportionedOutstanding = 0n
  const lines = input.lines.map((line) => {
    if (!line.lineId || !line.reviewedRuleId || seen.has(line.lineId)
      || !allowedTreatments.has(line.treatment)
      || (input.side === "sale") !== line.treatment.endsWith("_sale")) {
      throw new Error("Cash VAT exit needs distinct lines with a reviewed treatment on the correct side.")
    }
    seen.add(line.lineId)
    const net = money(line.netGbp)
    const vat = money(line.vatGbp)
    if (net + vat === 0n
      || ((line.treatment.startsWith("zero_rated") || line.treatment.startsWith("exempt")) && vat !== 0n)) {
      throw new Error("Cash VAT exit invoice lines have invalid net or VAT amounts.")
    }
    lineGross += net + vat
    const outstandingNet = net - portion(net, paid, gross)
    const outstandingVat = vat - portion(vat, paid, gross)
    apportionedOutstanding += outstandingNet + outstandingVat
    if (input.side === "sale") {
      boxes[6] += outstandingNet
      if (line.treatment === "domestic_sale") boxes[1] += outstandingVat
    } else {
      boxes[7] += outstandingNet
      if (line.treatment === "domestic_purchase") boxes[4] += outstandingVat
    }
    return { lineId: line.lineId, reviewedRuleId: line.reviewedRuleId,
      treatment: line.treatment, netGbp: format(outstandingNet), vatGbp: format(outstandingVat) }
  })
  if (lineGross !== gross) throw new Error("Cash VAT exit invoice lines do not add to its GBP gross.")
  return { invoiceId: input.invoiceId, outstandingGrossGbp: format(gross - paid),
    apportionmentRemainderGbp: format(gross - paid - apportionedOutstanding), lines,
    sourceBoxesGbp: { 1: format(boxes[1]), 4: format(boxes[4]),
      6: format(boxes[6]), 7: format(boxes[7]) },
    status: "calculation_only_no_cash_event" }
}

/** Split an unallocated payment across invoices in issue-date order. The
 * returned amounts must still be matched to posted source allocations. */
export function allocateUkCashPaymentOldestFirst(paymentGbp: string, invoices: CashInvoiceBalance[]): Array<{
  invoiceId: string; paidBeforeGbp: string; paidNowGbp: string
}> {
  if (!invoices.length) throw new Error("Cash VAT needs the invoices covered by this payment.")
  let remaining = money(paymentGbp)
  if (remaining === 0n) throw new Error("Cash VAT payment must be positive.")
  const seen = new Set<string>()
  const seenOrder = new Set<string>()
  const ordered = invoices.map((invoice) => {
    if (!invoice.invoiceId || seen.has(invoice.invoiceId) || !validDate(invoice.issueDate)
      || !Number.isSafeInteger(invoice.issueSequence) || invoice.issueSequence < 1
      || seenOrder.has(`${invoice.issueDate}:${invoice.issueSequence}`)) {
      throw new Error("Cash VAT needs distinct invoices with evidenced issue order.")
    }
    seen.add(invoice.invoiceId)
    seenOrder.add(`${invoice.issueDate}:${invoice.issueSequence}`)
    const gross = money(invoice.invoiceGrossGbp)
    const paid = money(invoice.paidBeforeGbp)
    if (gross === 0n || paid > gross) throw new Error("Cash VAT invoice balance is invalid.")
    return { ...invoice, gross, paid }
  }).sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.issueSequence - b.issueSequence)
  const result: Array<{ invoiceId: string; paidBeforeGbp: string; paidNowGbp: string }> = []
  for (const invoice of ordered) {
    if (remaining === 0n) break
    const applied = remaining < invoice.gross - invoice.paid ? remaining : invoice.gross - invoice.paid
    if (applied > 0n) result.push({ invoiceId: invoice.invoiceId,
      paidBeforeGbp: format(invoice.paid), paidNowGbp: format(applied) })
    remaining -= applied
  }
  if (remaining !== 0n) throw new Error("Cash VAT payment exceeds the listed invoice balances.")
  return result
}
