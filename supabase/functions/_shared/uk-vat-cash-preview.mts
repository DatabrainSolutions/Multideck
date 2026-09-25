import { calculateUkCashAllocation, type CashAllocationInput } from "./uk-vat-cash-allocation.mts"

type Amount = string | number
type SourceLine = {
  lineId: string; netGbp: Amount; vatGbp: Amount; grossGbp: Amount;
  evidenceId: string | null; evidenceBatchId: string | null;
  evidenceNetGbp: Amount | null; evidenceVatGbp: Amount | null;
  standardVatReconciledAt: string | null;
  standardProductionAcceptedAt: string | null;
  reviewId: string | null; treatment: string | null;
  decisionScheme: string | null; reviewedRuleId: string | null;
}
type PeriodCash = {
  cash_id: string; cash_type: string; cash_amount: Amount; currency_code: string;
  posting_batch_id: string | null; payment_review_id: string;
  vat_payment_date: string; fingerprint_matches: boolean;
  allocated_amount: Amount; allocation_count: number;
}
type Allocation = {
  allocation_id: string; allocated_amount: Amount; allocation_status: string;
  document_line_id: string | null;
  cash_id: string; cash_type: string; cash_currency_code: string;
  cash_posting_batch_id: string | null; payment_review_id: string;
  vat_payment_date: string; document_id: string | null; document_type: string | null;
  document_entity_id: string | null; document_currency_code: string | null;
  document_date: string | null; document_due_date: string | null;
  due_within_six_months: boolean;
  document_exchange_rate: Amount | null; document_posting_status: string | null;
  document_posting_batch_id: string | null; document_gross_amount: Amount | null;
  document_local_gross_amount: Amount | null; lines: SourceLine[];
}
export type UkVatCashSourceSnapshot = {
  legalEntityId: string; startDate: string; endDate: string;
  unreviewedPostedCash: number; periodCash: PeriodCash[];
  allocationCount: number; allocations: Allocation[]; truncated: boolean;
  status: "source_only_not_filing";
}
export type UkVatCashSourcePreview = {
  legalEntityId: string; startDate: string; endDate: string;
  sourceStatus: "source_only_not_filing";
  calculationValid: boolean; issueCount: number; issues: string[];
  candidateAllocationCount: number;
  excludedAllocationCount: number;
  excludedAllocations: Array<{ allocationId: string; cashId: string;
    invoiceId: string; paymentDate: string; standardAcceptedAt: string }>;
  sourceBoxesGbp: { 1: string; 4: string; 6: string; 7: string } | null;
  allocationLines: Array<{
    allocationId: string; cashId: string; paymentReviewId: string;
    invoiceId: string; paymentDate: string; lineId: string;
    evidenceId: string; treatmentReviewId: string;
    treatment: string; netGbp: string; vatGbp: string;
  }>;
}

const amountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/
function units(value: Amount | null): bigint {
  const text = String(value ?? "")
  if (!amountPattern.test(text)) throw new Error(`Invalid non-negative GBP amount: ${text}`)
  const [whole, decimal = ""] = text.split(".")
  return BigInt(whole) * 10000n + BigInt(decimal.padEnd(4, "0"))
}
function money(value: bigint): string {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? "-" : ""}${absolute / 10000n}.${String(absolute % 10000n).padStart(4, "0")}`
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

/** Exact, read-only source preview. A missing or unsupported source invalidates
 * the entire result. Nothing returned here is a return or filing approval. */
export function previewUkVatCashSources(snapshot: UkVatCashSourceSnapshot): UkVatCashSourcePreview {
  if (!snapshot.legalEntityId || !validDate(snapshot.startDate) || !validDate(snapshot.endDate)
    || snapshot.startDate > snapshot.endDate || snapshot.status !== "source_only_not_filing"
    || !Array.isArray(snapshot.periodCash) || !Array.isArray(snapshot.allocations)) {
    throw new Error("Cash VAT source snapshot is invalid.")
  }
  const issues: string[] = []
  let issueCount = 0
  const issue = (message: string) => { issueCount++; if (issues.length < 50) issues.push(message) }
  if (snapshot.truncated || snapshot.allocations.length !== snapshot.allocationCount) {
    issue("Cash allocation source exceeds the complete preview limit; no partial total is valid.")
  }
  if (snapshot.unreviewedPostedCash > 0) {
    issue(`${snapshot.unreviewedPostedCash} posted cash transaction(s) have no reviewed VAT payment date.`)
  }
  const periodCash = new Map<string, PeriodCash>()
  for (const cash of snapshot.periodCash) {
    if (periodCash.has(cash.cash_id)) issue(`Cash ${cash.cash_id} appears twice in the period source.`)
    periodCash.set(cash.cash_id, cash)
    try {
      if (!cash.posting_batch_id || !cash.payment_review_id || cash.currency_code !== "GBP"
        || !cash.fingerprint_matches || cash.allocation_count < 1
        || units(cash.cash_amount) <= 0n
        || units(cash.cash_amount) !== units(cash.allocated_amount)) {
        issue(`Cash ${cash.cash_id} has incomplete, changed or unsupported posted payment evidence.`)
      }
    } catch { issue(`Cash ${cash.cash_id} has an invalid GBP amount.`) }
    if (!validDate(cash.vat_payment_date) || cash.vat_payment_date < snapshot.startDate
      || cash.vat_payment_date > snapshot.endDate) issue(`Cash ${cash.cash_id} has an invalid period payment date.`)
  }
  const sorted = [...snapshot.allocations].sort((a, b) => a.vat_payment_date.localeCompare(b.vat_payment_date)
    || a.cash_id.localeCompare(b.cash_id) || a.allocation_id.localeCompare(b.allocation_id))
  const seenAllocations = new Set<string>()
  const paidByInvoice = new Map<string, bigint>()
  const periodAllocationCounts = new Map<string, number>()
  const totals = { 1: 0n, 4: 0n, 6: 0n, 7: 0n }
  const allocationLines: UkVatCashSourcePreview["allocationLines"] = []
  const excludedAllocations: UkVatCashSourcePreview["excludedAllocations"] = []
  let candidateAllocationCount = 0
  for (const row of sorted) {
    if (!row.allocation_id || seenAllocations.has(row.allocation_id)) {
      issue(`Duplicate or missing cash allocation ${row.allocation_id || "unknown"}.`)
      continue
    }
    seenAllocations.add(row.allocation_id)
    const inPeriod = row.vat_payment_date >= snapshot.startDate && row.vat_payment_date <= snapshot.endDate
    if (inPeriod) {
      periodAllocationCounts.set(row.cash_id, (periodAllocationCounts.get(row.cash_id) || 0) + 1)
    }
    if (!validDate(row.vat_payment_date) || row.vat_payment_date > snapshot.endDate
      || (inPeriod && (!periodCash.has(row.cash_id)
        || periodCash.get(row.cash_id)?.payment_review_id !== row.payment_review_id))) {
      issue(`Allocation ${row.allocation_id} lacks matching reviewed payment-date evidence.`)
      continue
    }
    if (!row.cash_posting_batch_id || !row.payment_review_id
      || !["customer_receipt", "supplier_payment"].includes(row.cash_type)
      || row.cash_currency_code !== "GBP" || row.allocation_status !== "allocated"
      || row.document_line_id !== null || !row.document_id
      || row.document_entity_id !== snapshot.legalEntityId
      || !row.document_date || !row.document_due_date
      || !validDate(row.document_date) || !validDate(row.document_due_date)
      || row.vat_payment_date < row.document_date
      || !row.due_within_six_months
      || row.document_currency_code !== "GBP" || String(row.document_exchange_rate) !== "1"
      || row.document_posting_status !== "posted" || !row.document_posting_batch_id
      || (row.cash_type === "customer_receipt" && row.document_type !== "sl_invoice")
      || (row.cash_type === "supplier_payment" && row.document_type !== "pl_invoice")
      || !Array.isArray(row.lines) || row.lines.length === 0) {
      issue(`Allocation ${row.allocation_id} has an unsupported, excluded or unposted invoice source.`)
      continue
    }
    let paid: bigint; let gross: bigint
    try {
      paid = units(row.allocated_amount)
      gross = units(row.document_gross_amount)
      if (gross === 0n || paid === 0n || gross !== units(row.document_local_gross_amount)) throw new Error()
    } catch {
      issue(`Allocation ${row.allocation_id} has invalid GBP invoice or payment amounts.`)
      continue
    }
    const side = row.cash_type === "customer_receipt" ? "sale" : "purchase"
    const seenLines = new Set<string>()
    let linesValid = true
    for (const line of row.lines) {
      try {
        if (!line.lineId || seenLines.has(line.lineId) || !line.evidenceId
          || line.evidenceBatchId !== row.document_posting_batch_id || !line.reviewId
          || !line.reviewedRuleId || !["standard", "annual", "cash"].includes(line.decisionScheme || "")
          || units(line.netGbp) !== units(line.evidenceNetGbp)
          || units(line.vatGbp) !== units(line.evidenceVatGbp)
          || units(line.netGbp) + units(line.vatGbp) !== units(line.grossGbp)) throw new Error()
        seenLines.add(line.lineId)
      } catch { linesValid = false; break }
    }
    if (!linesValid) {
      issue(`Invoice ${row.document_id} lacks coherent, reviewed posted VAT lines.`)
      continue
    }
    const standardSigned = row.lines.filter((line) => line.standardVatReconciledAt !== null)
    const standardAccepted = row.lines.filter((line) => line.standardProductionAcceptedAt !== null)
    if (standardSigned.length || standardAccepted.length) {
      if (standardAccepted.length !== row.lines.length
        || standardSigned.length !== row.lines.length) {
        issue(`Invoice ${row.document_id} has mixed or unaccepted Standard VAT accounting; review the scheme transition.`)
      } else if (inPeriod) {
        excludedAllocations.push({ allocationId: row.allocation_id, cashId: row.cash_id,
          invoiceId: row.document_id, paymentDate: row.vat_payment_date,
          standardAcceptedAt: standardAccepted.map((line) => line.standardProductionAcceptedAt!).sort()[0] })
      }
      continue
    }
    if (inPeriod) candidateAllocationCount++
    const paidBefore = paidByInvoice.get(row.document_id) || 0n
    try {
      const input: CashAllocationInput = {
        allocationId: row.allocation_id, invoiceId: row.document_id,
        paymentDate: row.vat_payment_date,
        periodStart: snapshot.startDate, periodEnd: snapshot.endDate,
        side, invoiceGrossGbp: money(gross), paidBeforeGbp: money(paidBefore),
        paidNowGbp: money(paid),
        lines: row.lines.map((line) => ({ lineId: line.lineId,
          treatment: line.treatment as CashAllocationInput["lines"][number]["treatment"],
          reviewedRuleId: line.reviewedRuleId!, netGbp: money(units(line.netGbp)),
          vatGbp: money(units(line.vatGbp)) })),
      }
      // The arithmetic helper requires its payment in the selected period.
      // For earlier payments, use a one-day period to validate the same source
      // and advance the cumulative paid amount without adding to this preview.
      if (!inPeriod) { input.periodStart = row.vat_payment_date; input.periodEnd = row.vat_payment_date }
      const result = calculateUkCashAllocation(input)
      paidByInvoice.set(row.document_id, paidBefore + paid)
      if (inPeriod) {
        for (const box of [1, 4, 6, 7] as const) totals[box] += units(result.sourceBoxesGbp[box])
        for (const line of result.lines) allocationLines.push({
          allocationId: row.allocation_id, cashId: row.cash_id,
          paymentReviewId: row.payment_review_id, invoiceId: row.document_id,
          paymentDate: row.vat_payment_date, lineId: line.lineId,
          evidenceId: row.lines.find((source) => source.lineId === line.lineId)!.evidenceId!,
          treatmentReviewId: row.lines.find((source) => source.lineId === line.lineId)!.reviewId!,
          treatment: line.treatment, netGbp: line.netGbp, vatGbp: line.vatGbp,
        })
      }
    } catch (cause) {
      issue(`Allocation ${row.allocation_id}: ${cause instanceof Error ? cause.message : "cash VAT source is invalid"}`)
    }
  }
  for (const cash of snapshot.periodCash) {
    if (periodAllocationCounts.get(cash.cash_id) !== cash.allocation_count) {
      issue(`Cash ${cash.cash_id} has an allocation without a supported invoice source.`)
    }
  }
  if (snapshot.periodCash.length && candidateAllocationCount + excludedAllocations.length === 0) {
    issue("Reviewed payments in this period have no matching invoice allocations.")
  }
  return { legalEntityId: snapshot.legalEntityId, startDate: snapshot.startDate,
    endDate: snapshot.endDate, sourceStatus: "source_only_not_filing",
    calculationValid: issueCount === 0, issueCount, issues,
    candidateAllocationCount,
    excludedAllocationCount: excludedAllocations.length,
    excludedAllocations,
    sourceBoxesGbp: issueCount === 0 ? { 1: money(totals[1]), 4: money(totals[4]),
      6: money(totals[6]), 7: money(totals[7]) } : null,
    allocationLines: issueCount === 0 ? allocationLines : [],
  }
}
