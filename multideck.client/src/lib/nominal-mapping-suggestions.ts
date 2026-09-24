export type NominalMappingSource = {
  code: string
  name: string
  reportCategoryCode: string
  accountTypeCode: string
  isActive?: boolean
}

export type NominalMappingTarget = {
  name: string
  account_name?: string
  account_number?: string
  root_type?: string
  account_type?: string
  account_currency?: string
  is_group?: boolean | number
  disabled?: boolean | number
}

const aliases: Record<string, string> = {
  "Wages and salaries": "Salary",
  "Rent and rates": "Office Rent",
  "Bank charges": "Bank Charges",
  "Retained earnings": "Retained Earnings",
  "Share capital": "Capital Stock",
  "GBP bank": "Multideck Sandbox GBP",
  "Trade receivables": "Debtors",
  "Prepayments": "Prepaid Expenses",
  "Trade payables": "Creditors",
  "Accrued job costs": "Accrued Expenses",
}

export function expectedRootType(nominal: NominalMappingSource) {
  if (nominal.reportCategoryCode === "direct_cost" || nominal.reportCategoryCode === "expense") return "Expense"
  if (nominal.reportCategoryCode === "finance") return nominal.accountTypeCode === "Income Account" ? "Income" : "Expense"
  return ({ asset: "Asset", liability: "Liability", equity: "Equity", income: "Income" } as Record<string, string>)[nominal.reportCategoryCode] ?? null
}

export function suggestNominalAccount(nominal: NominalMappingSource, accounts: NominalMappingTarget[], baseCurrency: string) {
  if (nominal.isActive === false) return null
  const root = expectedRootType(nominal)
  if (!root) return null
  const currency = nominal.name === "EUR bank" ? "EUR" : nominal.name === "USD bank" ? "USD" : baseCurrency
  const valid = accounts.filter((account) => account.name && account.root_type === root && account.account_currency === currency &&
    account.is_group !== true && account.is_group !== 1 && account.disabled !== true && account.disabled !== 1 &&
    (nominal.accountTypeCode === "Bank" ? account.account_type === "Bank" :
      nominal.accountTypeCode === "Receivable" ? account.account_type === "Receivable" :
      nominal.accountTypeCode === "Payable" ? account.account_type === "Payable" :
      !["Bank", "Cash", "Receivable", "Payable"].includes(account.account_type ?? "")))
  // A provider code is authoritative when it exactly matches the local code.
  const byCode = valid.filter((account) => account.account_number === nominal.code)
  if (byCode.length === 1) return byCode[0]
  if (byCode.length > 1) return null
  // Keep actual and accrued ledgers distinct. Never infer one from a generic
  // Sales, Service or Cost of Goods Sold account.
  const byName = valid.filter((account) => account.account_name?.toLowerCase() === nominal.name.toLowerCase())
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) return null
  const alias = aliases[nominal.name]
  if (!alias) return null
  const matches = valid.filter((account) => account.account_name?.toLowerCase() === alias.toLowerCase())
  return matches.length === 1 ? matches[0] : null
}
