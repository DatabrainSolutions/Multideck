import { moneyString, moneyUnits } from "./cost-accrual-model.ts"

export type MigrationAccount = { id: string; code: string; active: boolean; control: "receivables" | "payables" | null }
export type TrialBalanceRow = { accountCode: string; debit: string; credit: string }
export type OpeningItem = {
  sourceId: string; partyCode: string; reference: string; accountCode: string
  kind: "customer_invoice" | "customer_credit" | "customer_receipt" | "supplier_invoice" | "supplier_credit" | "supplier_payment"
  documentDate: string; dueDate?: string; currency: string
  originalAmount: string; originalBaseAmount: string; outstandingAmount: string; outstandingBaseAmount: string
}
export type MigrationReconciliationInput = { cutoffDate: string; baseCurrency: string; trialBalance: TrialBalanceRow[]; openItems: OpeningItem[] }
type Issue = { area: "batch" | "trial_balance" | "open_items" | "control"; row?: number; message: string }
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim()
const kinds = new Map<OpeningItem["kind"], { control: MigrationAccount["control"]; sign: bigint }>([
  ["customer_invoice", { control: "receivables", sign: 1n }],
  ["customer_credit", { control: "receivables", sign: -1n }],
  ["customer_receipt", { control: "receivables", sign: -1n }],
  ["supplier_invoice", { control: "payables", sign: -1n }],
  ["supplier_credit", { control: "payables", sign: 1n }],
  ["supplier_payment", { control: "payables", sign: 1n }],
])

/** Read-only financial reconciliation, NOT posting approval. Accounts and base
 * currency must come from the authorised entity, never the uploaded workbook.
 * Source FX carrying amounts are preserved; no current-rate revaluation occurs.
 * Party mapping, opening banks/WIP, source hashes, approval and existing-target
 * reconciliation remain separate mandatory cutover gates. */
export function reconcileAccountingMigration(input: MigrationReconciliationInput, accounts: MigrationAccount[], entityBaseCurrency: string) {
  const issues: Issue[] = []
  const add = (area: Issue["area"], message: string, row?: number) => issues.push({ area, row, message })
  const index = new Map<string, MigrationAccount[]>()
  for (const account of accounts) index.set(account.code, [...(index.get(account.code) ?? []), account])
  if (!date(input?.cutoffDate)) add("batch", "Choose a valid cutover date in YYYY-MM-DD format.")
  if (!/^[A-Z]{3}$/.test(entityBaseCurrency) || input?.baseCurrency !== entityBaseCurrency) add("batch", "The trial balance must use the selected legal entity's base currency.")
  const trial = Array.isArray(input?.trialBalance) ? input.trialBalance : []
  const items = Array.isArray(input?.openItems) ? input.openItems : []
  if (!Array.isArray(input?.trialBalance) || trial.length < 1 || trial.length > 10000) add("batch", "Provide between 1 and 10,000 trial-balance rows.")
  if (!Array.isArray(input?.openItems) || items.length > 50000) add("batch", "Provide an open-item list of up to 50,000 rows, including an empty list when there are none.")
  if (trial.length > 10000 || items.length > 50000) return { reconciled: false, postingAuthorised: false as const, issues, controls: [], totals: null }
  const amount = (value: unknown, area: Issue["area"], row: number, label: string) => {
    try {
      const units = moneyUnits(value as string)
      if (units < 0n) throw new Error()
      return units
    } catch { add(area, `${label}: use a non-negative decimal string with up to four decimal places.`, row); return 0n }
  }
  const accountFor = (code: unknown, area: Issue["area"], row: number) => {
    const matches = typeof code === "string" ? index.get(code) : undefined
    if (!text(code) || matches?.length !== 1 || !matches[0].active) {
      add(area, "Map this exact source account code to one active nominal in the selected legal entity.", row); return null
    }
    return matches[0]
  }
  const trialBalances = new Map<string, bigint>(), details = new Map<string, bigint>()
  let debitTotal = 0n, creditTotal = 0n
  const seenCodes = new Set<string>(), seenItems = new Set<string>()
  trial.forEach((entry, offset) => {
    const row = offset + 1
    if (!entry || typeof entry !== "object") { add("trial_balance", "Expected an account balance row.", row); return }
    const account = accountFor(entry.accountCode, "trial_balance", row)
    const debit = amount(entry.debit, "trial_balance", row, "Debit"), credit = amount(entry.credit, "trial_balance", row, "Credit")
    if (debit > 0n && credit > 0n) add("trial_balance", "Import a closing balance on one side only, not debit and credit turnover.", row)
    if (seenCodes.has(entry.accountCode)) add("trial_balance", "Duplicate account balance. Consolidate the base-currency balance before import.", row)
    seenCodes.add(entry.accountCode)
    debitTotal += debit; creditTotal += credit
    if (account) trialBalances.set(account.id, (trialBalances.get(account.id) ?? 0n) + debit - credit)
  })
  if (debitTotal !== creditTotal) add("batch", `Trial balance does not balance: debit less credit is ${moneyString(debitTotal - creditTotal)} ${entityBaseCurrency}.`)
  for (const total of [debitTotal, creditTotal]) {
    try { moneyUnits(moneyString(total)) } catch { add("batch", "Trial-balance totals exceed the ledger amount limit.") }
  }
  items.forEach((item, offset) => {
    const row = offset + 1
    if (!item || typeof item !== "object") { add("open_items", "Expected an open transaction row.", row); return }
    if (!text(item.sourceId)) add("open_items", "Retain a unique source transaction ID as text.", row)
    else if (seenItems.has(item.sourceId)) add("open_items", "Duplicate source transaction ID.", row)
    seenItems.add(item.sourceId)
    if (!text(item.partyCode) || !text(item.reference)) add("open_items", "A source party code and document reference are required.", row)
    if (!date(item.documentDate) || item.documentDate > input.cutoffDate) add("open_items", "Document date must be valid and on or before cutover.", row)
    if (item.dueDate && !date(item.dueDate)) add("open_items", "Due date must be a valid YYYY-MM-DD date.", row)
    if (typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency)) add("open_items", "Retain the three-letter transaction currency.", row)
    const original = amount(item.originalAmount, "open_items", row, "Original amount")
    const originalBase = amount(item.originalBaseAmount, "open_items", row, "Original base amount")
    const outstanding = amount(item.outstandingAmount, "open_items", row, "Outstanding amount")
    const base = amount(item.outstandingBaseAmount, "open_items", row, "Outstanding base amount")
    if (original === 0n || originalBase === 0n || outstanding === 0n || outstanding > original || base === 0n) add("open_items", "Import positive original and unpaid amounts with source base-currency carrying values.", row)
    if (item.currency === entityBaseCurrency && (base !== outstanding || originalBase !== original)) add("open_items", "A base-currency transaction must have equal source and base amounts.", row)
    if (outstanding > 0n && base > 0n) {
      const exchangeRate = (base * 10000000000n + outstanding / 2n) / outstanding
      const represented = (outstanding * exchangeRate + 5000000000n) / 10000000000n
      if (represented !== base) add("open_items", "The source FX carrying value cannot be represented at the ledger exchange-rate precision.", row)
    }
    const kind = kinds.get(item.kind), account = accountFor(item.accountCode, "open_items", row)
    if (!kind) add("open_items", "Choose a supported invoice, credit or unapplied cash transaction type.", row)
    else if (account && account.control !== kind.control) add("open_items", "Use the corresponding receivables or payables control account.", row)
    else if (account) details.set(account.id, (details.get(account.id) ?? 0n) + base * kind.sign)
  })
  const controls = accounts.filter(account => account.control && (trialBalances.has(account.id) || details.has(account.id))).map(account => {
    const balance = trialBalances.get(account.id) ?? 0n, detail = details.get(account.id) ?? 0n
    if (balance !== detail) add("control", `${account.code}: open items differ from the trial balance by ${moneyString(detail - balance)} ${entityBaseCurrency}.`)
    return { accountId: account.id, accountCode: account.code, ledger: account.control, trialBalance: moneyString(balance), openItems: moneyString(detail), difference: moneyString(detail - balance) }
  })
  return { reconciled: issues.length === 0, postingAuthorised: false as const, issues, controls,
    totals: { debit: moneyString(debitTotal), credit: moneyString(creditTotal), difference: moneyString(debitTotal - creditTotal), baseCurrency: entityBaseCurrency },
    postingStrategy: "trial_balance_once_open_items_without_additional_gl" as const }
}
