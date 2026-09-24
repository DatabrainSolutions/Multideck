import type { CanonicalFinanceExport } from "./accounting-providers.ts"
import { accountingComparison, accountingDecimal } from "./accounting-readback.ts"

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Checks delivery parity only. This is not GL, balance or period reconciliation. */
export function compareErpNextReadback(input: CanonicalFinanceExport, document: unknown, externalId: string, expectedStatus: 0 | 1) {
  const actual = object(document)
  const check = accountingComparison()
  const cash = input.localTable === "FIN_CashTransactions"
  const sales = input.typeCode === "sl_invoice" || input.typeCode === "credit_note"
  const credit = input.typeCode === "credit_note" || input.typeCode === "debit_note"
  const sign = credit ? -1 : 1
  const doctype = cash ? "Payment Entry" : sales ? "Sales Invoice" : "Purchase Invoice"
  check.text("name", externalId, actual.name)
  check.text("doctype", doctype, actual.doctype)
  check.text("company", input.externalCompany, actual.company)
  check.decimal("docstatus", expectedStatus, actual.docstatus)
  check.text("posting_date", input.documentDate, actual.posting_date)

  if (!cash) {
    check.text(sales ? "customer" : "supplier", input.partyProviderId, actual[sales ? "customer" : "supplier"])
    check.text("currency", input.currencyCode, actual.currency)
    check.decimal("conversion_rate", input.exchangeRate, actual.conversion_rate)
    check.decimal("is_return", credit ? 1 : 0, actual.is_return)
    check.decimal("grand_total", sign * input.amount, actual.grand_total)
    check.decimal("base_grand_total", sign * input.localAmount, actual.base_grand_total)
    // ERPNext may post rounded_total instead of grand_total. No unapproved
    // rounding adjustment is permitted even when the unrounded total matches.
    check.decimal("rounding_adjustment", 0, actual.rounding_adjustment)
    check.decimal("base_rounding_adjustment", 0, actual.base_rounding_adjustment)
    if (accountingDecimal(actual.disable_rounded_total) !== 1_000_000_000n) {
      check.decimal("rounded_total", sign * input.amount, actual.rounded_total)
      check.decimal("base_rounded_total", sign * input.localAmount, actual.base_rounded_total)
    }
    if (input.dueDate) check.text("due_date", input.dueDate, actual.due_date)
    const items = Array.isArray(actual.items) ? actual.items : []
    check.decimal("items.length", input.lines.length, Array.isArray(actual.items) ? items.length : null)
    let net = 0n
    let tax = 0n
    let validTotals = true
    for (const [index, line] of input.lines.entries()) {
      const row = object(items[index])
      const field = (name: string) => `items[${index}].${name}`
      check.text(field("item_code"), line.providerItemCode, row.item_code)
      check.text(field(sales ? "income_account" : "expense_account"), line.providerAccountCode, row[sales ? "income_account" : "expense_account"])
      check.decimal(field("qty"), sign * line.quantity, row.qty)
      check.decimal(field("rate"), line.unitAmount, row.rate)
      check.decimal(field("net_amount"), sign * line.netAmount, row.net_amount)
      if (line.taxRatePercent > 0) check.text(field("item_tax_template"), line.providerTaxCode, row.item_tax_template)
      else if (row.item_tax_template) check.record(field("item_tax_template"), null, row.item_tax_template)
      const lineNet = accountingDecimal(line.netAmount)
      const lineTax = accountingDecimal(line.taxAmount)
      if (lineNet === null || lineTax === null) validTotals = false
      else { net += BigInt(sign) * lineNet; tax += BigInt(sign) * lineTax }
    }
    for (const [field, expected] of [["net_total", net], ["total_taxes_and_charges", tax]] as const) {
      if (!validTotals || accountingDecimal(actual[field]) !== expected) check.record(field, validTotals ? decimalText(expected) : null, actual[field])
    }
  } else {
    const receipt = input.typeCode === "customer_receipt"
    check.text("payment_type", receipt ? "Receive" : "Pay", actual.payment_type)
    check.text("party_type", receipt ? "Customer" : "Supplier", actual.party_type)
    check.text("party", input.partyProviderId, actual.party)
    check.text("paid_from", receipt ? input.receivableProviderAccount : input.bankProviderAccount, actual.paid_from)
    check.text("paid_to", receipt ? input.bankProviderAccount : input.payableProviderAccount, actual.paid_to)
    for (const field of ["paid_from_account_currency", "paid_to_account_currency"]) check.text(field, input.currencyCode, actual[field])
    for (const field of ["paid_amount", "received_amount"]) check.decimal(field, input.amount, actual[field])
    for (const field of ["source_exchange_rate", "target_exchange_rate"]) check.decimal(field, input.exchangeRate, actual[field])
    for (const field of ["base_paid_amount", "base_received_amount"]) check.decimal(field, input.localAmount, actual[field])
    check.decimal("difference_amount", 0, actual.difference_amount)
    // This adapter does not export deductions or payment taxes. Reject additions
    // rather than allowing offsetting changes to hide behind a matching total.
    for (const field of ["deductions", "taxes"]) {
      check.decimal(`${field}.length`, 0, Array.isArray(actual[field]) ? actual[field].length : null)
    }
    const references = Array.isArray(actual.references) ? actual.references : []
    check.decimal("references.length", input.allocations.length, Array.isArray(actual.references) ? references.length : null)
    const key = (type: unknown, id: unknown) => JSON.stringify([type, id])
    const seen = new Set<string>()
    let allocated = 0n
    let validTotal = true
    for (const [index, allocation] of input.allocations.entries()) {
      const identity = key(allocation.providerDocumentType, allocation.providerDocumentId)
      const matches = references.map(object).filter(row => key(row.reference_doctype, row.reference_name) === identity)
      if (seen.has(identity) || matches.length !== 1) check.record(`references[${index}].identity`, "one unique allocation", matches.length)
      seen.add(identity)
      check.decimal(`references[${index}].allocated_amount`, allocation.amount, matches[0]?.allocated_amount)
      const amount = accountingDecimal(allocation.amount)
      if (amount === null) validTotal = false
      else allocated += amount
    }
    const amount = accountingDecimal(input.amount)
    if (!validTotal || accountingDecimal(actual.total_allocated_amount) !== allocated) check.record("total_allocated_amount", validTotal ? decimalText(allocated) : null, actual.total_allocated_amount)
    if (!validTotal || amount === null || accountingDecimal(actual.unallocated_amount) !== amount - allocated) check.record("unallocated_amount", validTotal && amount !== null ? decimalText(amount - allocated) : null, actual.unallocated_amount)
  }
  return { scope: "document_delivery" as const, status: check.differences.length ? "mismatch" as const : "matched" as const, differences: check.differences }
}

function decimalText(value: bigint) {
  const sign = value < 0n ? "-" : ""
  const digits = (value < 0n ? -value : value).toString().padStart(10, "0")
  return `${sign}${digits.slice(0, -9)}.${digits.slice(-9)}`
}
