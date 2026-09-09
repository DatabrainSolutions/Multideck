import { HttpError } from "./backend.ts"
import { erpNextCreate, erpNextList, erpNextOrigin, erpNextSubmit } from "./erpnext.ts"

export type AccountingProviderCode =
  | "erpnext"
  | "xero"
  | "quickbooks_online"
  | "sage_accounting"
  | "sage_intacct"
  | "sage_50"
  | "sage_200"
  | "business_central"
  | "netsuite"
  | "zoho_books"

export type AccountingProviderDefinition = {
  purpose: "external_mirror"
  code: AccountingProviderCode
  name: string
  connectionModel: "api_token" | "oauth2" | "local_agent"
  enabled: boolean
  requiresLocalAgent: boolean
  capabilities: readonly ("documents" | "credits" | "cash" | "allocations" | "webhooks" | "journals" | "ledger_readback" | "trial_balance")[]
  unavailableReason: string | null
}

export type CanonicalFinanceLine = {
  description: string
  quantity: number
  unitAmount: number
  taxRatePercent: number
  providerTaxCode: string | null
  providerItemCode: string | null
  providerAccountCode: string | null
}

export type CanonicalFinanceAllocation = {
  amount: number
  providerDocumentType: "Sales Invoice" | "Purchase Invoice"
  providerDocumentId: string
}

export type CanonicalFinanceExport = {
  providerCode: AccountingProviderCode
  externalCompany: string
  baseCurrencyCode: string
  localTable: "FIN_Documents" | "FIN_CashTransactions"
  localId: string
  localNumber: string
  typeCode: "sl_invoice" | "credit_note" | "pl_invoice" | "debit_note" | "customer_receipt" | "supplier_payment"
  documentDate: string
  dueDate: string | null
  currencyCode: string
  exchangeRate: number
  amount: number
  localAmount: number
  reference: string | null
  partyProviderId: string | null
  bankProviderAccount: string | null
  receivableProviderAccount: string | null
  payableProviderAccount: string | null
  lines: CanonicalFinanceLine[]
  allocations: CanonicalFinanceAllocation[]
  existingExternalId: string | null
  existingExternalObjectType: string | null
}

export type AccountingExportResult = {
  externalObjectType: string
  externalId: string
  externalNumber: string | null
  externalUrl: string | null
  requestPayload: Record<string, unknown>
  responsePayload: Record<string, unknown>
}

export class AccountingProviderPartialError extends Error {
  constructor(
    message: string,
    readonly externalObjectType: string,
    readonly externalId: string,
    readonly requestPayload: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const accountingProviders: readonly AccountingProviderDefinition[] = [
  { purpose: "external_mirror", code: "erpnext", name: "ERPNext", connectionModel: "api_token", enabled: true, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: null },
  { purpose: "external_mirror", code: "xero", name: "Xero", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: "The Xero OAuth adapter has not passed the tenant integration contract yet." },
  { purpose: "external_mirror", code: "quickbooks_online", name: "QuickBooks Online", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: "The QuickBooks Online adapter has not passed the tenant integration contract yet." },
  { purpose: "external_mirror", code: "sage_accounting", name: "Sage Accounting", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations"], unavailableReason: "The Sage Accounting adapter has not passed the tenant integration contract yet." },
  { purpose: "external_mirror", code: "sage_intacct", name: "Sage Intacct", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: "The Sage Intacct adapter has not passed the tenant integration contract yet." },
  { purpose: "external_mirror", code: "sage_50", name: "Sage 50 Desktop", connectionModel: "local_agent", enabled: false, requiresLocalAgent: true, capabilities: ["documents", "credits", "cash", "allocations"], unavailableReason: "Sage 50 requires the reviewed tenant-local Windows agent." },
  { purpose: "external_mirror", code: "sage_200", name: "Sage 200", connectionModel: "local_agent", enabled: false, requiresLocalAgent: true, capabilities: ["documents", "credits", "cash", "allocations"], unavailableReason: "Sage 200 requires the reviewed tenant-local Windows agent." },
  { purpose: "external_mirror", code: "business_central", name: "Dynamics 365 Business Central", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: "The Business Central adapter has not passed the tenant integration contract yet." },
  { purpose: "external_mirror", code: "netsuite", name: "Oracle NetSuite", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: "The NetSuite adapter has not passed the tenant integration contract yet." },
  { purpose: "external_mirror", code: "zoho_books", name: "Zoho Books", connectionModel: "oauth2", enabled: false, requiresLocalAgent: false, capabilities: ["documents", "credits", "cash", "allocations", "webhooks"], unavailableReason: "The Zoho Books adapter has not passed the tenant integration contract yet." },
] as const

export function accountingProvider(code: string) {
  return accountingProviders.find((provider) => provider.code === code) ?? null
}

function required(value: string | null, message: string) {
  if (!value) throw new HttpError(409, message)
  return value
}

function currency(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : ""
  return /^[A-Z]{3}$/.test(code) ? code : null
}

function namedRecord(records: Record<string, unknown>[], name: string) {
  return records.find((record) => record.name === name) ?? null
}

function disabled(record: Record<string, unknown>) {
  return record.disabled === true || record.disabled === 1 || record.disabled === "1"
}

async function assertErpNextCompany(input: CanonicalFinanceExport) {
  const expectedCurrency = currency(input.baseCurrencyCode)
  if (!expectedCurrency) throw new HttpError(409, "Configure a valid base currency for this legal entity before exporting.")
  const companyName = required(input.externalCompany, "Choose the ERPNext Company for this legal entity before exporting.")
  const companies = await erpNextList("Company", ["name", "default_currency"], [["name", "=", companyName]])
  const company = namedRecord(companies, companyName)
  if (!company) throw new HttpError(409, `ERPNext Company ${companyName} is no longer available. Review Finance Setup, then retry.`)
  const companyCurrency = currency(company.default_currency)
  if (!companyCurrency) {
    throw new HttpError(409, `ERPNext Company ${companyName} has no valid default currency. Set Default Currency to ${expectedCurrency} in ERPNext, then retry.`)
  }
  if (companyCurrency !== expectedCurrency) {
    throw new HttpError(409, `ERPNext Company ${companyName} uses ${companyCurrency}, but this legal entity uses ${expectedCurrency}. Align the base currencies, then retry.`)
  }
}

async function assertErpNextParty(input: CanonicalFinanceExport, party: string, sales: boolean) {
  const doctype = sales ? "Customer" : "Supplier"
  const records = await erpNextList(doctype, ["name", "disabled"], [["name", "=", party]])
  const record = namedRecord(records, party)
  if (!record) throw new HttpError(409, `Mapped ERPNext ${doctype.toLowerCase()} ${party} does not exist. Correct the party mapping, then retry.`)
  if (disabled(record)) throw new HttpError(409, `Mapped ERPNext ${doctype.toLowerCase()} ${party} is disabled. Enable it or correct the party mapping, then retry.`)
}

async function assertErpNextItems(itemCodes: string[]) {
  const uniqueCodes = [...new Set(itemCodes)]
  if (!uniqueCodes.length) return
  const records = await erpNextList("Item", ["name", "item_code", "disabled"], [["name", "in", uniqueCodes]])
  for (const itemCode of uniqueCodes) {
    const record = namedRecord(records, itemCode)
    if (!record) throw new HttpError(409, `Mapped ERPNext Item ${itemCode} does not exist. Correct the charge-code mapping, then retry.`)
    if (disabled(record)) throw new HttpError(409, `Mapped ERPNext Item ${itemCode} is disabled. Enable it or correct the charge-code mapping, then retry.`)
  }
}

async function assertErpNextTaxTemplates(input: CanonicalFinanceExport, templateNames: string[]) {
  const uniqueNames = [...new Set(templateNames)]
  if (!uniqueNames.length) return
  const records = await erpNextList("Item Tax Template", ["name", "company"], [["name", "in", uniqueNames]])
  for (const templateName of uniqueNames) {
    const record = namedRecord(records, templateName)
    if (!record) throw new HttpError(409, `Mapped ERPNext tax template ${templateName} does not exist. Correct the tax mapping, then retry.`)
    if (record.company !== input.externalCompany) {
      throw new HttpError(409, `ERPNext tax template ${templateName} belongs to a different Company. Correct the tax mapping, then retry.`)
    }
  }
}

async function assertErpNextAccounts(input: CanonicalFinanceExport, expectedCurrencies: Map<string, string>) {
  const names = [...expectedCurrencies.keys()]
  if (!names.length) return
  const accounts = await erpNextList("Account", ["name", "account_currency", "company", "disabled"], [["name", "in", names]])
  for (const accountName of names) {
    const expectedCurrency = expectedCurrencies.get(accountName)!
    const account = namedRecord(accounts, accountName)
    if (!account) throw new HttpError(409, `ERPNext account ${accountName} is not available. Correct the account mapping, then retry.`)
    if (disabled(account)) throw new HttpError(409, `ERPNext account ${accountName} is disabled. Enable it or correct the account mapping, then retry.`)
    if (account.company !== input.externalCompany) throw new HttpError(409, `ERPNext account ${accountName} belongs to a different Company. Correct the account mapping, then retry.`)
    const accountCurrency = currency(account.account_currency)
    if (!accountCurrency) {
      throw new HttpError(409, `ERPNext account ${accountName} has no valid account currency. Set Account Currency to ${expectedCurrency} in ERPNext, then retry.`)
    }
    if (accountCurrency !== expectedCurrency) {
      throw new HttpError(409, `ERPNext account ${accountName} uses ${accountCurrency}, but this posting requires ${expectedCurrency}. Correct the account currency or mapping, then retry.`)
    }
  }
}

async function erpNextDocumentPayload(input: CanonicalFinanceExport) {
  const sales = input.typeCode === "sl_invoice" || input.typeCode === "credit_note"
  const credit = input.typeCode === "credit_note" || input.typeCode === "debit_note"
  const partyField = sales ? "customer" : "supplier"
  const accountField = sales ? "income_account" : "expense_account"
  if (!input.lines.length) throw new HttpError(409, "The approved finance document has no lines to export.")
  const party = required(input.partyProviderId, "Map this customer or supplier to ERPNext before exporting.")
  const itemCodes: string[] = []
  const taxTemplates: string[] = []
  const accountCurrencies = new Map<string, string>()
  const items = input.lines.map((line, index) => {
    if (!line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitAmount) || line.unitAmount < 0 || !Number.isFinite(line.taxRatePercent) || line.taxRatePercent < 0 || line.taxRatePercent > 100) {
      throw new HttpError(409, `Finance line ${index + 1} is no longer valid. Correct the Multideck draft, then retry.`)
    }
    const itemCode = required(line.providerItemCode, `Map finance line ${index + 1} to an ERPNext Item before exporting.`)
    const taxTemplate = line.taxRatePercent > 0 ? required(line.providerTaxCode, `Map finance line ${index + 1} to an ERPNext tax template before exporting.`) : undefined
    const account = required(line.providerAccountCode, `Map finance line ${index + 1} to an ERPNext account before exporting.`)
    itemCodes.push(itemCode)
    if (taxTemplate) taxTemplates.push(taxTemplate)
    accountCurrencies.set(account, input.baseCurrencyCode)
    return {
      item_code: itemCode,
      description: line.description,
      qty: credit ? -Math.abs(line.quantity) : line.quantity,
      rate: line.unitAmount,
      item_tax_template: taxTemplate,
      [accountField]: account,
    }
  })
  await Promise.all([
    assertErpNextCompany(input),
    assertErpNextParty(input, party, sales),
    assertErpNextItems(itemCodes),
    assertErpNextTaxTemplates(input, taxTemplates),
    assertErpNextAccounts(input, accountCurrencies),
  ])
  return {
    doctype: sales ? "Sales Invoice" : "Purchase Invoice",
    payload: {
      company: input.externalCompany,
      [partyField]: party,
      posting_date: input.documentDate,
      due_date: input.dueDate ?? undefined,
      currency: input.currencyCode,
      conversion_rate: input.exchangeRate,
      is_return: credit ? 1 : 0,
      remarks: `Multideck ${input.localNumber}`,
      items,
    },
  }
}

async function erpNextPaymentPayload(input: CanonicalFinanceExport) {
  const receipt = input.typeCode === "customer_receipt"
  const party = required(input.partyProviderId, "Map this customer or supplier to ERPNext before exporting.")
  const bank = required(input.bankProviderAccount, "Map the selected bank account to ERPNext before exporting.")
  const control = receipt
    ? required(input.receivableProviderAccount, "Map the trade receivables control account to ERPNext before exporting.")
    : required(input.payableProviderAccount, "Map the trade payables control account to ERPNext before exporting.")
  if (bank === control) throw new HttpError(409, "The ERPNext bank and control account mappings must use different accounts.")
  if (input.allocations.some((allocation) => !allocation.providerDocumentId)) {
    throw new HttpError(409, "Every cash allocation must reference an exported ERPNext invoice.")
  }
  if (input.allocations.some((allocation) => !Number.isFinite(allocation.amount) || allocation.amount <= 0)) throw new HttpError(409, "Every cash allocation must have a positive finite amount.")
  await Promise.all([
    assertErpNextCompany(input),
    assertErpNextParty(input, party, receipt),
    assertErpNextAccounts(input, new Map([[bank, input.currencyCode], [control, input.currencyCode]])),
  ])
  return {
    doctype: "Payment Entry",
    payload: {
      company: input.externalCompany,
      payment_type: receipt ? "Receive" : "Pay",
      party_type: receipt ? "Customer" : "Supplier",
      party,
      posting_date: input.documentDate,
      reference_no: input.reference ?? input.localNumber,
      reference_date: input.documentDate,
      paid_from: receipt ? control : bank,
      paid_to: receipt ? bank : control,
      paid_amount: input.amount,
      received_amount: input.amount,
      source_exchange_rate: input.exchangeRate,
      target_exchange_rate: input.exchangeRate,
      references: input.allocations.map((allocation) => ({
        reference_doctype: allocation.providerDocumentType,
        reference_name: allocation.providerDocumentId,
        allocated_amount: allocation.amount,
      })),
      remarks: `Multideck ${input.localNumber}`,
    },
  }
}

async function exportToErpNext(input: CanonicalFinanceExport): Promise<AccountingExportResult> {
  const request = input.localTable === "FIN_Documents" ? await erpNextDocumentPayload(input) : await erpNextPaymentPayload(input)
  if (input.existingExternalId && input.existingExternalObjectType && input.existingExternalObjectType !== request.doctype) {
    throw new HttpError(409, "The existing provider reference has a different accounting document type.")
  }
  let externalId = input.existingExternalId
  if (!externalId) {
    const created = await erpNextCreate(request.doctype, request.payload)
    externalId = String(created.name)
  }
  let submitted: Record<string, unknown>
  try {
    submitted = await erpNextSubmit(request.doctype, externalId)
  } catch (error) {
    if (!input.existingExternalId) {
      throw new AccountingProviderPartialError(
        error instanceof Error ? error.message : "ERPNext created the draft but did not submit it.",
        request.doctype,
        externalId,
        request.payload,
      )
    }
    throw error
  }
  return {
    externalObjectType: request.doctype,
    externalId,
    externalNumber: typeof submitted.name === "string" ? submitted.name : externalId,
    externalUrl: `${erpNextOrigin()}/app/${request.doctype.toLowerCase().replaceAll(" ", "-")}/${encodeURIComponent(externalId)}`,
    requestPayload: request.payload,
    responsePayload: submitted,
  }
}

export async function preflightFinanceRecord(input: CanonicalFinanceExport) {
  const provider = accountingProvider(input.providerCode)
  if (!provider) throw new HttpError(409, "The selected accounting provider is not recognised.")
  if (!provider.enabled) throw new HttpError(409, provider.unavailableReason ?? "This accounting provider adapter is not enabled.")
  if (provider.code !== "erpnext") throw new HttpError(409, "This accounting provider adapter is not enabled.")
  const request = input.localTable === "FIN_Documents" ? await erpNextDocumentPayload(input) : await erpNextPaymentPayload(input)
  return {
    providerCode: provider.code,
    externalObjectType: request.doctype,
    externalCompany: input.externalCompany,
    baseCurrencyCode: input.baseCurrencyCode,
    transactionCurrencyCode: input.currencyCode,
    localNumber: input.localNumber,
    checkedAt: new Date().toISOString(),
  }
}

export async function exportFinanceRecord(input: CanonicalFinanceExport) {
  const provider = accountingProvider(input.providerCode)
  if (!provider) throw new HttpError(409, "The selected accounting provider is not recognised.")
  if (!provider.enabled) throw new HttpError(409, provider.unavailableReason ?? "This accounting provider adapter is not enabled.")
  if (provider.code === "erpnext") return await exportToErpNext(input)
  throw new HttpError(409, "This accounting provider adapter is not enabled.")
}
