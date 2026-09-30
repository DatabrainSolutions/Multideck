import assert from "node:assert/strict"
import test from "node:test"
import { previewUkVatCashSources } from "../functions/_shared/uk-vat-cash-preview.mts"

const invoice = "invoice-1"
const line = { lineId: "line-1", netGbp: "1000.0000", vatGbp: "200.0000",
  grossGbp: "1200.0000", evidenceId: "evidence-1", evidenceBatchId: "invoice-batch",
  evidenceNetGbp: "1000.0000", evidenceVatGbp: "200.0000", reviewId: "review-1",
  standardVatReconciledAt: null,
  standardProductionAcceptedAt: null,
  linkedCreditCount: 0,
  treatment: "domestic_sale", decisionScheme: "standard", reviewedRuleId: "UK20" }
const allocation = (id, cashId, date, amount) => ({ allocation_id: id,
  allocated_amount: amount, allocation_status: "allocated", document_line_id: null,
  cash_id: cashId, cash_type: "customer_receipt", cash_currency_code: "GBP",
  cash_posting_batch_id: `batch-${cashId}`, payment_review_id: `payment-review-${cashId}`,
  vat_payment_date: date, document_id: invoice, document_type: "sl_invoice",
  document_entity_id: "entity-1", document_currency_code: "GBP",
  document_date: "2026-01-01", document_due_date: "2026-06-30",
  due_within_six_months: true,
  document_exchange_rate: 1, document_posting_status: "posted",
  document_posting_batch_id: "invoice-batch", document_gross_amount: "1200.0000",
  document_local_gross_amount: "1200.0000", lines: [line] })
const snapshot = { legalEntityId: "entity-1", startDate: "2026-07-01", endDate: "2026-09-30",
  unreviewedPostedCash: 0, postedPeriodCreditCount: 0, priorPartyCreditCount: 0,
  unsupportedPostedCashCount: 0, unsupportedPostedCashTypes: [],
  periodCash: [{ cash_id: "cash-2", cash_type: "customer_receipt",
    cash_amount: "420.0000", currency_code: "GBP", posting_batch_id: "batch-cash-2",
    payment_review_id: "payment-review-cash-2", vat_payment_date: "2026-09-15",
    fingerprint_matches: true, allocated_amount: "420.0000", allocation_count: 1 }],
  allocationCount: 2, allocations: [
    allocation("allocation-2", "cash-2", "2026-09-15", "420.0000"),
    allocation("allocation-1", "cash-1", "2026-06-15", "780.0000"),
  ], truncated: false, status: "source_only_not_filing" }

test("cash preview applies prior settlement before current payment and traces reviewed source", () => {
  const result = previewUkVatCashSources(snapshot)
  assert.equal(result.calculationValid, true)
  assert.deepEqual(result.sourceBoxesGbp, { 1: "70.0000", 4: "0.0000",
    6: "350.0000", 7: "0.0000" })
  assert.equal(result.candidateAllocationCount, 1)
  assert.equal(result.excludedAllocationCount, 0)
  assert.deepEqual(result.allocationLines.map(({ allocationId, paymentReviewId, evidenceId,
    treatmentReviewId }) => ({ allocationId, paymentReviewId, evidenceId, treatmentReviewId })),
  [{ allocationId: "allocation-2", paymentReviewId: "payment-review-cash-2",
    evidenceId: "evidence-1", treatmentReviewId: "review-1" }])
})

test("cash preview fails closed for missing dates, credits, unsupported currency and incomplete source", () => {
  const unreviewed = previewUkVatCashSources({ ...snapshot, unreviewedPostedCash: 1 })
  assert.equal(unreviewed.calculationValid, false)
  assert.equal(unreviewed.sourceBoxesGbp, null)
  assert.match(unreviewed.issues[0], /no reviewed VAT payment date/)
  const unallocatedCredit = previewUkVatCashSources({ ...snapshot, postedPeriodCreditCount: 1 })
  assert.equal(unallocatedCredit.calculationValid, false)
  assert.equal(unallocatedCredit.sourceBoxesGbp, null)
  assert.match(unallocatedCredit.issues.join(" "), /price-change and refund review/)
  const earlierCredit = previewUkVatCashSources({ ...snapshot, priorPartyCreditCount: 1 })
  assert.equal(earlierCredit.calculationValid, false)
  assert.equal(earlierCredit.sourceBoxesGbp, null)
  assert.match(earlierCredit.issues.join(" "), /reviewed application or refund evidence/)
  const refund = previewUkVatCashSources({ ...snapshot, unsupportedPostedCashCount: 1,
    unsupportedPostedCashTypes: [{ type: "refund", count: 1 }] })
  assert.equal(refund.calculationValid, false)
  assert.equal(refund.sourceBoxesGbp, null)
  assert.match(refund.issues.join(" "), /posted refund or other cash event/)
  assert.throws(() => previewUkVatCashSources({ ...snapshot, unsupportedPostedCashCount: undefined }),
    /source snapshot is invalid/)
  assert.throws(() => previewUkVatCashSources({ ...snapshot, unsupportedPostedCashCount: 1,
    unsupportedPostedCashTypes: [] }), /source snapshot is invalid/)
  assert.throws(() => previewUkVatCashSources({ ...snapshot, postedPeriodCreditCount: undefined }),
    /source snapshot is invalid/)
  assert.throws(() => previewUkVatCashSources({ ...snapshot, priorPartyCreditCount: undefined }),
    /source snapshot is invalid/)
  const credit = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    row.allocation_id === "allocation-2" ? { ...row, document_type: "credit_note" } : row) })
  assert.equal(credit.calculationValid, false)
  assert.match(credit.issues.join(" "), /unsupported, excluded or unposted invoice/)
  const linkedCredit = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    ({ ...row, lines: [{ ...line, linkedCreditCount: 1 }] })) })
  assert.equal(linkedCredit.calculationValid, false)
  assert.equal(linkedCredit.sourceBoxesGbp, null)
  assert.match(linkedCredit.issues.join(" "), /linked credit or debit note/)
  const missingCreditEvidence = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    ({ ...row, lines: [{ ...line, linkedCreditCount: undefined }] })) })
  assert.equal(missingCreditEvidence.calculationValid, false)
  const foreignCurrency = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    row.allocation_id === "allocation-2" ? { ...row, document_currency_code: "EUR" } : row) })
  assert.equal(foreignCurrency.sourceBoxesGbp, null)
  const longCredit = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    row.allocation_id === "allocation-2" ? { ...row, document_due_date: "2026-08-01",
      due_within_six_months: false } : row) })
  assert.equal(longCredit.calculationValid, false)
  assert.match(longCredit.issues.join(" "), /excluded or unposted invoice/)
  const paymentBeforeInvoice = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    row.allocation_id === "allocation-2" ? { ...row, document_date: "2026-09-16" } : row) })
  assert.equal(paymentBeforeInvoice.calculationValid, false)
  assert.match(paymentBeforeInvoice.issues.join(" "), /unsupported, excluded or unposted invoice/)
  const missingAllocation = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.slice(0, 1) })
  assert.equal(missingAllocation.calculationValid, false)
  assert.match(missingAllocation.issues.join(" "), /complete preview limit/)
  const missingLine = previewUkVatCashSources({ ...snapshot, allocations: snapshot.allocations.map((row) =>
    row.allocation_id === "allocation-2" ? { ...row, lines: [{ ...line, reviewId: null }] } : row) })
  assert.equal(missingLine.calculationValid, false)
  assert.match(missingLine.issues.join(" "), /reviewed posted VAT lines/)
  const standardAccounted = previewUkVatCashSources({ ...snapshot,
    allocations: snapshot.allocations.map((row) => ({ ...row, lines: [{ ...line,
      standardVatReconciledAt: "2026-06-30T09:00:00Z" }] })) })
  assert.equal(standardAccounted.calculationValid, false)
  assert.equal(standardAccounted.sourceBoxesGbp, null)
  assert.match(standardAccounted.issues.join(" "), /unaccepted Standard VAT accounting/)
  const alreadyFiled = previewUkVatCashSources({ ...snapshot,
    allocations: snapshot.allocations.map((row) => ({ ...row, lines: [{ ...line,
      standardVatReconciledAt: "2026-06-30T09:00:00Z",
      standardProductionAcceptedAt: "2026-07-10T09:00:00Z" }] })) })
  assert.equal(alreadyFiled.calculationValid, true)
  assert.deepEqual(alreadyFiled.sourceBoxesGbp, { 1: "0.0000", 4: "0.0000",
    6: "0.0000", 7: "0.0000" })
  assert.equal(alreadyFiled.candidateAllocationCount, 0)
  assert.equal(alreadyFiled.excludedAllocationCount, 1)
  assert.equal(alreadyFiled.excludedAllocations[0].invoiceId, invoice)
})
