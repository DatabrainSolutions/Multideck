import { calculateUkCashExitOutstanding, type CashExitOutstandingInput } from "./uk-vat-cash-allocation.mts"

type Row = Record<string, unknown>
type Stream = "outputVatGbp" | "inputVatGbp"

export type UkVatCashControlBridgePreview = {
  status: "cash_control_bridge_preview_only"
  calculationValid: boolean
  returnReady: false
  sourceDigest: string | null
  issueCount: number
  issues: string[]
  streams: Record<Stream, {
    openingUnpaid: string
    postedInvoiceVat: string
    closingUnpaid: string
    derivedPaymentVat: string
    projectedPaymentVat: string
    difference: string
  }> | null
  invoiceCount: number
}

const digestPattern = /^[a-f0-9]{64}$/
const amountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const ukDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
})

function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row : null
}

function count(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null
}

function units(value: unknown): bigint {
  if (typeof value !== "string" || !amountPattern.test(value)) {
    throw new Error("Cash control needs exact non-negative GBP source strings.")
  }
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
}

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? "-" : ""}${absolute / 10000n}.${String(absolute % 10000n).padStart(4, "0")}`
}

function ukDate(value: unknown): string {
  if (typeof value !== "string") throw new Error("Cash control source timestamp is missing.")
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) throw new Error("Cash control source timestamp is invalid.")
  const parts = ukDateFormatter.formatToParts(instant)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

function date(value: unknown): string {
  if (typeof value !== "string" || !datePattern.test(value)) {
    throw new Error("Cash control source date is invalid.")
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Cash control source date is invalid.")
  }
  return value
}

function errorCount(value: unknown): number {
  const parsed = count(value)
  if (parsed === null) throw new Error("Cash control source issue count is missing.")
  return parsed
}

/** Exact arithmetic over a server-bound Cash-period source inventory. This
 * previews the invoice-to-payment timing identity; it never proves that prior
 * Cash events were accepted or that GL VAT-control journals are approved. */
export function previewUkVatCashControlBridge(value: unknown): UkVatCashControlBridgePreview {
  const source = object(value)
  const context = object(source?.context)
  const inventory = object(source?.invoiceInventory)
  const projection = object(source?.paymentPreview)
  const anomalies = object(source?.dateAnomalies)
  const journal = object(source?.journalEvidence)
  const issues: string[] = []
  let issueCount = 0
  const issue = (message: string) => { issueCount++; if (issues.length < 30) issues.push(message) }
  const empty = (): UkVatCashControlBridgePreview => ({
    status: "cash_control_bridge_preview_only", calculationValid: false,
    returnReady: false, sourceDigest: typeof source?.sourceDigest === "string"
      && digestPattern.test(source.sourceDigest) ? source.sourceDigest : null,
    issueCount, issues, streams: null, invoiceCount: 0,
  })
  if (!source || source.status !== "cash_control_source_only"
    || source.returnReady !== false || source.truncated !== false
    || !digestPattern.test(String(source.sourceDigest ?? ""))
    || !context || !inventory || !projection || !anomalies || !journal
    || inventory.truncated !== false || inventory.amountEncoding !== "decimal_strings"
    || projection.amountEncoding !== "decimal_strings"
    || projection.status !== "preview_only_no_cash_return_effect"
    || !digestPattern.test(String(context.projectionFingerprint ?? ""))
    || projection.sourceFingerprint !== context.projectionFingerprint
    || projection.projectionId !== context.projectionId
    || inventory.legalEntityId !== context.legalEntityId
    || projection.legalEntityId !== context.legalEntityId
    || inventory.startDate !== context.schemeEntryDate
    || inventory.exitDate !== context.periodEnd
    || projection.startDate !== context.periodStart
    || projection.endDate !== context.periodEnd
    || !Array.isArray(inventory.invoices)
    || !Array.isArray(inventory.cashSources)
    || !Array.isArray(inventory.priceChanges)
    || journal.status !== "invoice_journals_matched"
    || !digestPattern.test(String(journal.digest ?? ""))
    || !Array.isArray(journal.lines)) {
    issue("A complete invoice and payment inventory bound to one Cash VAT period is required.")
    return empty()
  }
  let start: string
  let end: string
  let entry: string
  try {
    if (errorCount(journal.unmatchedLines) !== 0
      || errorCount(journal.orphanTaxPostings) !== 0
      || errorCount(journal.lineCount) !== journal.lines.length) {
      issue("Invoice VAT journal postings are incomplete or unmatched.")
    }
    start = date(context.periodStart)
    end = date(context.periodEnd)
    entry = date(context.schemeEntryDate)
    if (entry > start || start > end) throw new Error("Cash term and period dates are inconsistent.")
  } catch (error) {
    issue(error instanceof Error ? error.message : "Cash period dates are invalid.")
    return empty()
  }
  try {
    if (errorCount(anomalies.preEntryDatedPostedInvoices) !== 0
      || errorCount(anomalies.futureDatedPostedInvoices) !== 0
      || errorCount(anomalies.missingPostingDates) !== 0) {
      issue("Posted invoices dated outside the Cash term or missing posting dates need review.")
    }
    for (const field of ["unpostedInvoiceCount", "postedPriceChangeCount",
      "lineSourceIssueCount", "lineTreatmentIssueCount", "cashSourceIssueCount",
      "dueTermIssueCount"] as const) {
      if (errorCount(inventory[field]) !== 0) issue(`${field} must be resolved before the Cash bridge.`)
    }
    if (inventory.requiresPriceChangeReview !== false
      || errorCount(inventory.invoiceCount) !== inventory.invoices.length
      || errorCount(inventory.cashSourceCount) !== inventory.cashSources.length
      || errorCount(inventory.postedPriceChangeCount) !== inventory.priceChanges.length) {
      issue("Cash invoice, cash or price-change coverage is incomplete.")
    }
  } catch (error) {
    issue(error instanceof Error ? error.message : "Cash source counts are incomplete.")
  }
  if (issues.length) return empty()

  const journalLines = new Map<string, Row>()
  for (const item of journal.lines) {
    const line = object(item)
    const key = `${String(line?.invoiceId)}:${String(line?.lineId)}`
    try {
      if (!line || line.matched !== true || typeof line.invoiceId !== "string"
        || typeof line.lineId !== "string" || journalLines.has(key)
        || typeof line.expectedVatGbp !== "string"
        || typeof line.postedVatGbp !== "string"
        || units(line.expectedVatGbp) !== units(line.postedVatGbp)) {
        throw new Error("posted VAT amount or source link is invalid")
      }
      journalLines.set(key, line)
    } catch {
      issue("A Cash invoice VAT line has no matching posted journal evidence.")
    }
  }
  if (issueCount) return empty()

  const cashById = new Map<string, Row>()
  for (const item of inventory.cashSources) {
    const cash = object(item)
    try {
      if (!cash || typeof cash.cash_id !== "string" || !cash.cash_id
        || cashById.has(cash.cash_id) || cash.source_issue !== false
        || cash.reviewFingerprintMatches !== true
        || cash.native_posting_status !== "posted"
        || !["customer_receipt", "supplier_payment"].includes(String(cash.cash_type))
        || cash.currency_code !== "GBP"
        || !/^1(?:\.0{1,10})?$/.test(String(cash.exchange_rate ?? ""))
        || units(cash.cash_amount) === 0n
        || units(cash.cash_amount) !== units(cash.local_amount)
        || units(cash.unallocated_amount) !== 0n
        || units(cash.cash_amount) !== units(cash.represented_amount)) {
        throw new Error("posted payment, allocation or date review is incomplete")
      }
      cashById.set(cash.cash_id, cash)
    } catch (error) {
      issue(`Cash ${String(cash?.cash_id ?? "unknown")}: ${error instanceof Error ? error.message : "invalid source"}.`)
    }
  }
  if (issueCount) return empty()

  const opening = { outputVatGbp: 0n, inputVatGbp: 0n }
  const posted = { outputVatGbp: 0n, inputVatGbp: 0n }
  const closing = { outputVatGbp: 0n, inputVatGbp: 0n }
  const seenInvoices = new Set<string>()
  const seenAllocations = new Set<string>()
  const periodAllocations = new Map<string, { invoiceId: string; side: "sale" | "purchase" }>()
  for (const item of inventory.invoices) {
    const invoice = object(item)
    const invoiceId = invoice?.invoice_id
    try {
      if (!invoice || typeof invoiceId !== "string" || !invoiceId
        || seenInvoices.has(invoiceId) || invoice.source_exception !== false
        || invoice.currency_code !== "GBP"
        || !/^1(?:\.0{1,10})?$/.test(String(invoice.exchange_rate ?? ""))
        || errorCount(invoice.lineSourceIssueCount) !== 0
        || errorCount(invoice.lineTreatmentIssueCount) !== 0
        || invoice.due_within_six_months !== true
        || !Array.isArray(invoice.lines) || invoice.lines.length === 0
        || !Array.isArray(invoice.allocation_sources)) {
        throw new Error("invoice source or Cash treatment is incomplete")
      }
      seenInvoices.add(invoiceId)
      const side = invoice.document_type === "sl_invoice" ? "sale"
        : invoice.document_type === "pl_invoice" ? "purchase" : null
      if (!side || date(invoice.document_date) < entry || date(invoice.document_date) > end) {
        throw new Error("invoice is outside the Cash term or has an unsupported type")
      }
      const stream: Stream = side === "sale" ? "outputVatGbp" : "inputVatGbp"
      const postedOn = ukDate(invoice.native_posted_at)
      if (postedOn < entry || postedOn > end) throw new Error("invoice posting date is outside the Cash term")
      const gross = units(invoice.gross_amount)
      if (gross === 0n || gross !== units(invoice.local_gross_amount)) {
        throw new Error("posted invoice GBP gross is inconsistent")
      }
      const lines: CashExitOutstandingInput["lines"] = invoice.lines.map((item: unknown) => {
        const line = object(item)
        if (!line || typeof line.lineId !== "string" || typeof line.decisionId !== "string"
          || line.decisionScheme !== "cash" || line.supportedCashTreatment !== true
          || line.taxPointInCashTerm !== true || typeof line.reviewedRuleId !== "string"
          || typeof line.treatment !== "string"
          || units(line.netGbp) !== units(line.evidenceNetGbp)
          || units(line.vatGbp) !== units(line.evidenceVatGbp)
          || units(line.netGbp) + units(line.vatGbp) !== units(line.grossGbp)
          || !journalLines.has(`${invoiceId}:${line.lineId}`)
          || journalLines.get(`${invoiceId}:${line.lineId}`)?.evidenceId !== line.evidenceId
          || journalLines.get(`${invoiceId}:${line.lineId}`)?.decisionId !== line.decisionId
          || units(journalLines.get(`${invoiceId}:${line.lineId}`)?.expectedVatGbp)
            !== units(line.vatGbp)) {
          throw new Error("invoice line does not match reviewed Cash VAT evidence")
        }
        return { lineId: line.lineId, treatment: line.treatment as CashExitOutstandingInput["lines"][number]["treatment"],
          reviewedRuleId: line.reviewedRuleId, netGbp: line.netGbp as string, vatGbp: line.vatGbp as string }
      })
      let paidOpening = 0n
      let paidClosing = 0n
      for (const item of invoice.allocation_sources) {
        const allocation = object(item)
        if (!allocation || typeof allocation.allocationId !== "string"
          || seenAllocations.has(allocation.allocationId)
          || allocation.allocationStatus !== "allocated"
          || allocation.documentLineId !== null
          || allocation.cashEntityId !== context.legalEntityId
          || allocation.cashCurrency !== "GBP"
          || allocation.cashPostingStatus !== "posted"
          || allocation.cashType !== (side === "sale" ? "customer_receipt" : "supplier_payment")
          || !cashById.has(String(allocation.cashId))
          || cashById.get(String(allocation.cashId))?.cash_type !== allocation.cashType) {
          throw new Error("invoice allocation is incomplete or duplicated")
        }
        seenAllocations.add(allocation.allocationId)
        const amount = units(allocation.allocatedAmount)
        if (amount === 0n) throw new Error("invoice allocation amount must be positive")
        const effectiveDate = [date(allocation.paymentDate),
          ukDate(allocation.allocatedAt),ukDate(allocation.cashPostedAt)].sort().at(-1)!
        if (effectiveDate < postedOn) throw new Error("payment predates the posted invoice")
        if (effectiveDate >= start && effectiveDate <= end) {
          periodAllocations.set(allocation.allocationId,
            { invoiceId, side })
        }
        if (effectiveDate < start) paidOpening += amount
        if (effectiveDate <= end) paidClosing += amount
      }
      if (paidClosing > gross || paidClosing !== units(invoice.paid_through_exit)
        || gross - paidClosing !== units(invoice.candidate_outstanding)) {
        throw new Error("invoice paid and unpaid balances do not match posted allocations")
      }
      const closeResult = calculateUkCashExitOutstanding({ invoiceId, side,
        invoiceGrossGbp: invoice.gross_amount as string,
        paidThroughExitGbp: money(paidClosing),lines })
      if (units(closeResult.apportionmentRemainderGbp) !== 0n) {
        throw new Error("closing unpaid VAT has an unresolved apportionment remainder")
      }
      closing[stream] += units(closeResult.sourceBoxesGbp[side === "sale" ? 1 : 4])
      if (postedOn < start) {
        const openResult = calculateUkCashExitOutstanding({ invoiceId, side,
          invoiceGrossGbp: invoice.gross_amount as string,
          paidThroughExitGbp: money(paidOpening),lines })
        if (units(openResult.apportionmentRemainderGbp) !== 0n) {
          throw new Error("opening unpaid VAT has an unresolved apportionment remainder")
        }
        opening[stream] += units(openResult.sourceBoxesGbp[side === "sale" ? 1 : 4])
      } else {
        for (const line of lines) {
          if ((side === "sale" && line.treatment === "domestic_sale")
            || (side === "purchase" && line.treatment === "domestic_purchase")) {
            posted[stream] += units(line.vatGbp)
          }
        }
      }
    } catch (error) {
      issue(`Invoice ${String(invoiceId ?? "unknown")}: ${error instanceof Error ? error.message : "invalid source"}.`)
    }
  }
  if (journalLines.size !== inventory.invoices.reduce((total, invoice) =>
    total + (Array.isArray(object(invoice)?.lines) ? (object(invoice)?.lines as unknown[]).length : 0), 0)) {
    issue("Posted VAT journal evidence does not cover every Cash invoice line.")
  }
  if (issueCount) return empty()
  const boxLines = object(projection.boxLines)
  const projectedAllocations = new Set<string>()
  const seenEvents = new Set<string>()
  if (!boxLines || !Array.isArray(boxLines["6"]) || !Array.isArray(boxLines["7"])) {
    issue("Cash payment-event box lines are incomplete.")
    return empty()
  }
  for (const box of ["6", "7"] as const) {
    for (const item of boxLines[box] as unknown[]) {
      const event = object(item)
      const allocation = periodAllocations.get(String(event?.allocationId))
      if (!event || typeof event.eventId !== "string" || !event.eventId
        || seenEvents.has(event.eventId)
        || event.box !== Number(box)
        || !allocation || allocation.invoiceId !== event.invoiceId
        || allocation.side !== (box === "6" ? "sale" : "purchase")) {
        issue("A projected Cash event does not match a current-period invoice allocation.")
        continue
      }
      seenEvents.add(event.eventId)
      projectedAllocations.add(event.allocationId as string)
    }
  }
  if (count(projection.eventLineCount) !== seenEvents.size
    || [...periodAllocations.keys()].some((id) => !projectedAllocations.has(id))) {
    issue("Cash payment events do not cover every current-period invoice allocation.")
  }
  if (issueCount) return empty()
  const boxes = object(projection.sourceBoxesGbp)
  if (!boxes) { issue("Cash payment boxes are unavailable."); return empty() }
  try {
    const projected = { outputVatGbp: units(boxes["1"]), inputVatGbp: units(boxes["4"]) }
    const streams = {} as NonNullable<UkVatCashControlBridgePreview["streams"]>
    for (const stream of ["outputVatGbp", "inputVatGbp"] as const) {
      const derived = opening[stream] + posted[stream] - closing[stream]
      streams[stream] = {
        openingUnpaid: money(opening[stream]),postedInvoiceVat: money(posted[stream]),
        closingUnpaid: money(closing[stream]),derivedPaymentVat: money(derived),
        projectedPaymentVat: money(projected[stream]),difference: money(derived - projected[stream]),
      }
      if (derived < 0n || derived !== projected[stream]) {
        issue(`${stream} does not reconcile to the verified payment events.`)
      }
    }
    return { status: "cash_control_bridge_preview_only", calculationValid: issueCount === 0,
      returnReady: false, sourceDigest: source.sourceDigest as string,
      issueCount,issues,streams,invoiceCount:seenInvoices.size }
  } catch (error) {
    issue(error instanceof Error ? error.message : "Cash VAT boxes are invalid.")
    return empty()
  }
}
