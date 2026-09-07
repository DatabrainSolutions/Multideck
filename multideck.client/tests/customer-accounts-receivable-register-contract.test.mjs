import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const app = read("multideck.client/src/App.tsx")
const accountPage = read("multideck.client/src/pages/crm-accounts-page.tsx")
const customerApi = read("multideck.client/src/lib/customer-api.ts")
const customersEdge = read("supabase/functions/customers/index.ts")

function between(source, start, end, description) {
  const startAt = source.indexOf(start)
  assert.notEqual(startAt, -1, `Missing start of ${description}`)
  const endAt = source.indexOf(end, startAt + start.length)
  assert.notEqual(endAt, -1, `Missing end of ${description}`)
  return source.slice(startAt, endAt)
}

const columnsDefinition = between(
  accountPage,
  "const accountColumns = useMemo",
  "function clearAccountFilters()",
  "account register columns",
)
const customerColumns = between(
  columnsDefinition,
  "if (customerAccounts) {",
  "return [\n      {",
  "customer account columns",
)
const genericColumns = columnsDefinition.slice(columnsDefinition.indexOf("return [\n      {") + "return [\n      {".length)
const listAccountsPage = between(
  customerApi,
  "export async function listAccountsPage(",
  "export async function listContactsPage(",
  "account register API",
)
const financialRoute = between(
  customersEdge,
  "const financialAccess = organisationType === \"customer\"",
  "throw new HttpError(400, \"Organisation lists require bounded paging.\")",
  "customer register finance response",
)

test("the /customers route selects the accounts-receivable register without changing CRM companies or suppliers", () => {
  assert.match(app, /route === "\/customers"[\s\S]*?<CrmAccountsPage[^>]*organisationType="customer"/)
  assert.match(app, /route === "\/crm\/accounts"[\s\S]*?<CrmAccountsPage[^>]*currentUser=\{currentUser\}/)
  assert.match(app, /route === "\/suppliers"[\s\S]*?<CrmAccountsPage[^>]*organisationType="supplier"/)
  assert.match(accountPage, /const customerAccounts = organisationType === "customer"/)
  assert.match(accountPage, /customerAccounts \? "Customer accounts"/)
  assert.match(accountPage, /customerAccounts \? "Accounts receivable" : "Organisations"/)
  assert.match(accountPage, /Balances, overdue invoices, credit limits, payment terms and accounting status in one place\./)
  assert.match(accountPage, /toolbarTabs=\{customerAccounts \? undefined/)
  assert.match(accountPage, /toolbarFilters=\{customerAccounts \? undefined/)

  for (const id of ["company-types", "temperature", "relationship", "owner", "last-contact", "contacts", "marketing"]) {
    assert.match(genericColumns, new RegExp(`id: "${id}"`), `The generic CRM branch should retain ${id}.`)
  }
})

test("customer rows lead with receivables and credit-control information", () => {
  for (const [id, label] of [
    ["balance-due", "Balance due"],
    ["overdue", "Overdue"],
    ["credit", "Credit limit"],
    ["payment-terms", "Payment terms"],
    ["account-status", "Account status"],
  ]) {
    assert.match(customerColumns, new RegExp(`id: "${id}", label: "${label}"`))
  }

  assert.match(customerColumns, /id: "owner"[^\n]*defaultHidden: true/)
  assert.match(customerColumns, /id: "contacts"[^\n]*defaultHidden: true/)
  assert.doesNotMatch(customerColumns, /id: "temperature"/)
  assert.doesNotMatch(customerColumns, /label: "Legal entity"/i)
})

test("customer finance reads are fresh and never load engagement temperature", () => {
  const customerEarlyReturn = listAccountsPage.indexOf('if (input.organisationType === "customer") return page')
  const engagementRead = listAccountsPage.indexOf("getCrmEngagementSignals(")
  const customerFreshRead = listAccountsPage.indexOf('if (input.organisationType === "customer") return loadPage()')
  const genericCachedRead = listAccountsPage.indexOf("return readCachedCrmResource(", customerFreshRead)

  assert.ok(customerEarlyReturn >= 0 && customerEarlyReturn < engagementRead, "Customer rows should return before CRM engagement enrichment.")
  assert.ok(customerFreshRead >= 0 && customerFreshRead < genericCachedRead, "Customer rows should bypass the CRM read cache.")
  assert.match(listAccountsPage, /return readCachedCrmResource\(session\.user\.id, `accounts:page:\$\{query\}`, loadPage, options\)/)
})

test("the customers Edge Function delegates bounded finance projection behind both permission gates", () => {
  assert.equal((customersEdge.match(/multideck_finance_customer_account_snapshot/g) ?? []).length, 1)
  assert.match(customersEdge, /const accountIds = \[\.\.\.new Set\(requestedIds\)\]\.slice\(0, 100\)/)
  assert.match(customersEdge, /admin\.rpc\("multideck_finance_customer_account_snapshot", \{[\s\S]*?p_account_ids: accountIds,[\s\S]*?p_include_accounting_sync: includeAccountingSync/)
  assert.match(financialRoute, /permissions\.includes\("Finance\.Receivables\.View"\)/)
  assert.match(financialRoute, /const accountingSyncAccess = financialAccess && permissions\.includes\("Finance\.Integration\.Manage"\)/)
  assert.match(financialRoute, /financialAccess[\s\S]*?accountingSyncAccess[\s\S]*?financeReady[\s\S]*?financeCurrencyCode[\s\S]*?financialSummary/)
  assert.doesNotMatch(customersEdge, /\.from\(["'`]FIN_Documents["'`]\)/)
})

test("the customer DataTable has fresh storage, refresh, accessible rows and finance-aware export", () => {
  assert.match(accountPage, /key=\{customerAccounts \? "customer-accounts-receivable-v2"/)
  assert.match(accountPage, /storageKey=\{customerAccounts \? "customer-accounts-receivable-v2"/)
  assert.match(accountPage, /ariaLabel=\{customerAccounts \? "Customer accounts receivable register"/)
  assert.match(accountPage, /rowAriaLabel=\{\(account\) => customerAccounts \?[\s\S]*?balance due/)
  assert.match(accountPage, /exportConfig=\{customerAccounts \? \{[\s\S]*?fileName: "customer-accounts-receivable"[\s\S]*?collectExportPages[\s\S]*?organisationType: "customer"[\s\S]*?forceRefresh: true/)
  assert.match(accountPage, /customerAccounts \? <RegisterRefreshButton[^>]*onRefresh=\{\(\) => setReloadToken/)
})

test("currency display comes from the tenant snapshot and fails closed when base currency is unavailable", () => {
  assert.doesNotMatch(accountPage, /currency:\s*["']GBP["']/)
  assert.doesNotMatch(customerColumns, /["'`]GBP["'`]/)
  assert.match(accountPage, /formatAccountMoney\(financialSummary\.balanceDue, financeCurrencyCode, language/)
  assert.match(customerColumns, /currency=\{account\.financial\?\.baseCurrencyCode\}/)
  assert.match(accountPage, /Complete the tenant base-currency setup in Finance before customer balances and available credit are compared\./)
  assert.match(accountPage, /if \(value == null \|\| !currency \|\| !\/\^\[A-Z\]\{3\}\$\/\.test\(currency\)\) return "—"/)
})
