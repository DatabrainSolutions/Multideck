/** Proposed postings only. Persisted account validation, authorisation, tax, period
 * locks, evidence approval and idempotent delivery remain the posting service's job. */
import { moneyString, moneyUnits, type Money } from "./cost-accrual-model.ts"

export type ChargeAccountGroup = {
  legalEntityId: string
  code: string
  name: string
  kind: "cost" | "revenue"
  actualAccountId: string
  accruedAccountId: string
  controlAccountId: string
}
export type GroupedLine = { accountId: string; debit: Money; credit: Money }

function validateGroup(group: ChargeAccountGroup) {
  if (!group.legalEntityId || !group.code.trim() || !group.name.trim()) throw new Error("A legal entity and named group are required.")
  if (group.kind !== "cost" && group.kind !== "revenue") throw new Error("Choose a cost or revenue group.")
  const accounts = [group.actualAccountId, group.accruedAccountId, group.controlAccountId]
  if (accounts.some(id => !id?.trim()) || new Set(accounts).size !== 3) throw new Error("Actual, accrued and balance-sheet control accounts must be distinct.")
}

function pair(debit: string, credit: string, amount: bigint): GroupedLine[] {
  return amount === 0n ? [] : [
    { accountId: debit, debit: moneyString(amount), credit: "0.0000" },
    { accountId: credit, debit: "0.0000", credit: moneyString(amount) },
  ]
}

/** Excludes tax; signed corrections/credit notes require their own approved flow.
 * remainingAccrual is the locked, unreleased ORIGINAL posting balance, not an estimate.
 * originalAccruedAccountId must come from that posting, including pre-cutover history.
 * This function deliberately cannot approve a final difference. */
export function planGroupedInvoice(input: {
  group: ChargeAccountGroup
  invoiceNet: Money
  remainingAccrual: Money
  originalAccruedAccountId: string
  originalControlAccountId: string
  settlementAccountId: string
}) {
  validateGroup(input.group)
  const invoice = moneyUnits(input.invoiceNet), outstanding = moneyUnits(input.remainingAccrual)
  if (invoice <= 0n || outstanding < 0n) throw new Error("Use a positive invoice and a non-negative outstanding accrual.")
  if (!input.originalAccruedAccountId?.trim() || !input.originalControlAccountId?.trim() || !input.settlementAccountId?.trim()) throw new Error("Original posting and settlement accounts are required.")
  if (input.originalAccruedAccountId === input.originalControlAccountId ||
      [input.group.actualAccountId, input.group.accruedAccountId, input.group.controlAccountId, input.originalAccruedAccountId, input.originalControlAccountId].includes(input.settlementAccountId)) {
    throw new Error("Settlement must use a separate receivable or payable account.")
  }
  const relieved = invoice < outstanding ? invoice : outstanding
  const cost = input.group.kind === "cost"
  const actual = cost
    ? pair(input.group.actualAccountId, input.settlementAccountId, invoice)
    : pair(input.settlementAccountId, input.group.actualAccountId, invoice)
  const relief = cost
    ? pair(input.originalControlAccountId, input.originalAccruedAccountId, relieved)
    : pair(input.originalAccruedAccountId, input.originalControlAccountId, relieved)
  return {
    actual, relief,
    relieved: moneyString(relieved), remainingAccrual: moneyString(outstanding - relieved),
    // Contribution from THIS invoice plus remaining accrual, not lifetime actuals.
    requiresFinalisationReview: outstanding > relieved,
  }
}

/** Positive cost/revenue balances, already normalised from the ledger's debit/credit sign. */
export function groupedExpectedTotal(actual: Money, outstandingAccrued: Money) {
  return moneyString(moneyUnits(actual) + moneyUnits(outstandingAccrued))
}

export type ChartTransferRow = {
  sourceCode: string
  name: string
  statement: "balance_sheet" | "profit_and_loss"
  role: "standard" | "header" | "actual" | "accrued"
  groupCode?: string
}

/** Validate a reviewed, normalised chart preview. Never infer accounting meaning
 * from a code suffix, import source balances, or convert dotted codes to numbers. */
export function validateChartTransfer(rows: readonly ChartTransferRow[]): string[] {
  const errors: string[] = [], codes = new Set<string>()
  const groups = new Map<string, ChartTransferRow[]>()
  if (rows.length === 0 || rows.length > 10000) return ["Import between 1 and 10,000 chart rows."]
  rows.forEach((row, index) => {
    const label = `Row ${index + 1}`
    if (typeof row.sourceCode !== "string" || !row.sourceCode.trim() || row.sourceCode !== row.sourceCode.trim()) errors.push(`${label}: preserve the account code as non-empty text without surrounding spaces.`)
    if (codes.has(row.sourceCode)) errors.push(`${label}: duplicate account code ${row.sourceCode}.`)
    codes.add(row.sourceCode)
    if (typeof row.name !== "string" || !row.name.trim()) errors.push(`${label}: account name is required.`)
    if (!["balance_sheet", "profit_and_loss"].includes(row.statement)) errors.push(`${label}: explicitly classify as balance sheet or profit and loss.`)
    if (!["standard", "header", "actual", "accrued"].includes(row.role)) errors.push(`${label}: invalid account role.`)
    if (["actual", "accrued", "header"].includes(row.role)) {
      if (row.statement !== "profit_and_loss") errors.push(`${label}: actual/accrued groups belong to profit and loss.`)
      if (!row.groupCode?.trim()) errors.push(`${label}: group code is required.`)
      else groups.set(row.groupCode, [...(groups.get(row.groupCode) ?? []), row])
    } else if (row.groupCode) errors.push(`${label}: standard accounts cannot belong to an actual/accrued group.`)
  })
  for (const [code, members] of groups) {
    for (const role of ["header", "actual", "accrued"] as const) {
      if (members.filter(row => row.role === role).length !== 1) errors.push(`Group ${code}: requires exactly one ${role} row.`)
    }
  }
  return errors
}
