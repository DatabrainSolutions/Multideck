import assert from "node:assert/strict"
import test from "node:test"
import { previewUkVatCashControlBridge } from "../functions/_shared/uk-vat-cash-control-bridge.mts"

const cashSource = (id, amount, type) => ({
  cash_id: id, cash_type: type, source_issue: false,
  reviewFingerprintMatches: true, native_posting_status: "posted",
  currency_code: "GBP", exchange_rate: "1.0000000000",
  cash_amount: amount, local_amount: amount, unallocated_amount: "0.0000",
  represented_amount: amount,
})
const allocation = (id, cashId, amount, type, when) => ({
  allocationId: id, cashId, allocatedAmount: amount,
  allocationStatus: "allocated", documentLineId: null,
  cashEntityId: "entity-1", cashCurrency: "GBP",
  cashPostingStatus: "posted", cashType: type,
  paymentDate: when, allocatedAt: `${when}T12:00:00Z`,
  cashPostedAt: `${when}T12:00:00Z`,
})
const line = (id, treatment, net, vat) => ({
  lineId: id, evidenceId: `evidence-${id}`,
  decisionId: `decision-${id}`, decisionScheme: "cash",
  supportedCashTreatment: true, taxPointInCashTerm: true,
  reviewedRuleId: `rule-${id}`, treatment,
  netGbp: net, vatGbp: vat, grossGbp: String(Number(net) + Number(vat)),
  evidenceNetGbp: net, evidenceVatGbp: vat,
})
const fixture = () => ({
  status: "cash_control_source_only", returnReady: false, truncated: false,
  sourceDigest: "d".repeat(64),
  context: {
    periodId: "period-1", legalEntityId: "entity-1",
    registrationId: "registration-1", schemeEntryDate: "2026-01-01",
    periodStart: "2026-04-01", periodEnd: "2026-06-30",
    projectionId: "projection-1", projectionFingerprint: "a".repeat(64),
  },
  dateAnomalies: {
    preEntryDatedPostedInvoices: 0, futureDatedPostedInvoices: 0,
    missingPostingDates: 0, digest: "e".repeat(64),
  },
  journalEvidence: {
    status: "invoice_journals_matched", digest: "f".repeat(64),
    lineCount: 3, unmatchedLines: 0, orphanTaxPostings: 0,
    lines: [
      { invoiceId: "sale-1", lineId: "sale-taxable",
        evidenceId: "evidence-sale-taxable", decisionId: "decision-sale-taxable",
        expectedVatGbp: "20.0000", postedVatGbp: "20.0000", matched: true },
      { invoiceId: "sale-1", lineId: "sale-zero",
        evidenceId: "evidence-sale-zero", decisionId: "decision-sale-zero",
        expectedVatGbp: "0.0000", postedVatGbp: "0.0000", matched: true },
      { invoiceId: "purchase-1", lineId: "purchase-taxable",
        evidenceId: "evidence-purchase-taxable", decisionId: "decision-purchase-taxable",
        expectedVatGbp: "40.0000", postedVatGbp: "40.0000", matched: true },
    ],
  },
  accountingControls: {
    status: "verified", digest: "9".repeat(64), periodCount: 1,
    uncoveredOrOverlappingDays: 0, unverifiedPeriods: 0,
    periods: [{ periodId: "accounting-quarter-1", status: "verified",
      sourceDigest: "8".repeat(64), approvalId: "approval-1", reviewId: "review-1" }],
  },
  ledgerMovements: {
    status: "period_movements_matched", digest: "7".repeat(64),
    lineCount: 1, unresolvedLines: 0, verifiedOpeningExcludedLines: 0,
    matchedInvoiceLines: 1, expectedPostingCount: 1,
    duplicateSourcePostingReferences: 0, partialAccountingPeriods: 0,
    invalidAccountingPeriodTaxLines: 0,
    invalidSourcePeriodLinks: 0,
    expectedOutputVatGbp: "0.0000", postedOutputVatGbp: "0.0000",
    expectedInputVatGbp: "40.0000", postedInputVatGbp: "40.0000",
    lines: [{ id: "input-tax-posting-1", classification: "matched_invoice" }],
  },
  paymentPreview: {
    status: "preview_only_no_cash_return_effect", amountEncoding: "decimal_strings",
    projectionId: "projection-1", legalEntityId: "entity-1",
    startDate: "2026-04-01", endDate: "2026-06-30",
    sourceFingerprint: "a".repeat(64),
    eventLineCount: 3, excludedAllocations: [],
    boxLines: {
      6: [
        { eventId: "event-s1", allocationId: "alloc-b", invoiceId: "sale-1", box: 6 },
        { eventId: "event-s2", allocationId: "alloc-b", invoiceId: "sale-1", box: 6 },
      ],
      7: [{ eventId: "event-p1", allocationId: "alloc-c", invoiceId: "purchase-1", box: 7 }],
    },
    sourceBoxesGbp: { 1: "5.0000", 4: "10.0000", 6: "40.0000", 7: "50.0000" },
  },
  invoiceInventory: {
    truncated: false, amountEncoding: "decimal_strings",
    sourceDigest: "c".repeat(64), legalEntityId: "entity-1",
    startDate: "2026-01-01", exitDate: "2026-06-30",
    invoiceCount: 2, unpostedInvoiceCount: 0,
    postedPriceChangeCount: 0, requiresPriceChangeReview: false,
    lineSourceIssueCount: 0, lineTreatmentIssueCount: 0,
    cashSourceIssueCount: 0, dueTermIssueCount: 0,
    cashSourceCount: 3, priceChanges: [],
    cashSources: [
      cashSource("cash-a", "90.0000", "customer_receipt"),
      cashSource("cash-b", "45.0000", "customer_receipt"),
      cashSource("cash-c", "60.0000", "supplier_payment"),
    ],
    invoices: [{
      invoice_id: "sale-1", document_type: "sl_invoice",
      document_date: "2026-01-05", native_posted_at: "2026-01-05T12:00:00Z",
      currency_code: "GBP", exchange_rate: "1.0000000000",
      source_exception: false, due_within_six_months: true,
      lineSourceIssueCount: 0, lineTreatmentIssueCount: 0,
      gross_amount: "180.0000", local_gross_amount: "180.0000",
      paid_through_exit: "135.0000", candidate_outstanding: "45.0000",
      lines: [line("sale-taxable", "domestic_sale", "100.0000", "20.0000"),
        line("sale-zero", "zero_rated_sale", "60.0000", "0.0000")],
      allocation_sources: [
        allocation("alloc-a", "cash-a", "90.0000", "customer_receipt", "2026-03-15"),
        allocation("alloc-b", "cash-b", "45.0000", "customer_receipt", "2026-05-20"),
      ],
    }, {
      invoice_id: "purchase-1", document_type: "pl_invoice",
      document_date: "2026-05-02", native_posted_at: "2026-05-02T12:00:00Z",
      currency_code: "GBP", exchange_rate: "1.0000000000",
      source_exception: false, due_within_six_months: true,
      lineSourceIssueCount: 0, lineTreatmentIssueCount: 0,
      gross_amount: "240.0000", local_gross_amount: "240.0000",
      paid_through_exit: "60.0000", candidate_outstanding: "180.0000",
      lines: [line("purchase-taxable", "domestic_purchase", "200.0000", "40.0000")],
      allocation_sources: [allocation("alloc-c", "cash-c", "60.0000", "supplier_payment", "2026-06-15")],
    }],
  },
})

test("Cash bridge explains prior unpaid VAT, current invoice VAT and period payments", () => {
  const result = previewUkVatCashControlBridge(fixture())
  assert.equal(result.calculationValid, true, result.issues.join("; "))
  assert.equal(result.returnReady, false)
  assert.deepEqual(result.streams.outputVatGbp, {
    openingUnpaid: "10.0000", postedInvoiceVat: "0.0000",
    closingUnpaid: "5.0000", derivedPaymentVat: "5.0000",
    projectedPaymentVat: "5.0000", difference: "0.0000",
  })
  assert.deepEqual(result.streams.inputVatGbp, {
    openingUnpaid: "0.0000", postedInvoiceVat: "40.0000",
    closingUnpaid: "30.0000", derivedPaymentVat: "10.0000",
    projectedPaymentVat: "10.0000", difference: "0.0000",
  })
})

test("Cash bridge surfaces payment mismatch and blocks incomplete source coverage", () => {
  const mismatch = fixture()
  mismatch.paymentPreview.sourceBoxesGbp[1] = "4.9999"
  const result = previewUkVatCashControlBridge(mismatch)
  assert.equal(result.calculationValid, false)
  assert.equal(result.streams.outputVatGbp.difference, "0.0001")

  const credit = fixture()
  credit.invoiceInventory.postedPriceChangeCount = 1
  credit.invoiceInventory.priceChanges = [{ id: "credit-1" }]
  assert.equal(previewUkVatCashControlBridge(credit).streams, null)
  const foreign = fixture()
  foreign.invoiceInventory.invoices[0].allocation_sources[0].cashEntityId = "entity-2"
  assert.equal(previewUkVatCashControlBridge(foreign).streams, null)
  const missingEvent = fixture()
  missingEvent.paymentPreview.boxLines[6].pop()
  assert.equal(previewUkVatCashControlBridge(missingEvent).streams, null)
  const stalePayment = fixture()
  stalePayment.invoiceInventory.cashSources[0].reviewFingerprintMatches = false
  assert.equal(previewUkVatCashControlBridge(stalePayment).streams, null)
  const missingJournal = fixture()
  missingJournal.journalEvidence.lines[0].matched = false
  assert.equal(previewUkVatCashControlBridge(missingJournal).streams, null)
  const orphanJournal = fixture()
  orphanJournal.journalEvidence.orphanTaxPostings = 1
  assert.equal(previewUkVatCashControlBridge(orphanJournal).streams, null)
  const staleMonth = fixture()
  staleMonth.accountingControls.periods[0].status = "stale"
  assert.equal(previewUkVatCashControlBridge(staleMonth).streams, null)
  const missingMonth = fixture()
  missingMonth.accountingControls.uncoveredOrOverlappingDays = 1
  assert.equal(previewUkVatCashControlBridge(missingMonth).streams, null)
  const unexplainedControl = fixture()
  unexplainedControl.ledgerMovements.unresolvedLines = 1
  assert.equal(previewUkVatCashControlBridge(unexplainedControl).streams, null)
  const controlMismatch = fixture()
  controlMismatch.ledgerMovements.postedInputVatGbp = "39.9999"
  assert.equal(previewUkVatCashControlBridge(controlMismatch).streams, null)
})
