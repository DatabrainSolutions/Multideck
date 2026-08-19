import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const migration = read("supabase/migrations/20260818153000_crm_account_contact_register_paging.sql")
const edge = read("supabase/functions/customers/index.ts")
const backend = read("supabase/functions/_shared/backend.ts")
const api = read("multideck.client/src/lib/customer-api.ts")
const accountsPage = read("multideck.client/src/pages/crm-accounts-page.tsx")
const contactsPage = read("multideck.client/src/pages/crm-contacts-page.tsx")
const customersPage = read("multideck.client/src/pages/customers-page.tsx")
const crmPage = read("multideck.client/src/pages/crm-page.tsx")
const dataTable = read("multideck.client/src/components/multideck/data-table.tsx")

test("account and contact register RPCs bound rows, filter before paging, and retain totals", () => {
  assert.match(migration, /multideck_crm_account_register_page/)
  assert.match(migration, /multideck_crm_contact_register_page/)
  assert.equal((migration.match(/least\(coalesce\(p_limit, 50\), 100\)/g) ?? []).length, 2)
  assert.equal((migration.match(/ordinal > v_offset and ordinal <= v_offset \+ v_limit/g) ?? []).length, 2)
  assert.equal((migration.match(/jsonb_agg\(id order by ordinal\)/g) ?? []).length, 2)
  assert.equal((migration.match(/'total', \(select count\(\*\) from filtered\)/g) ?? []).length, 2)
  assert.match(migration, /Customers\.Read/)
  assert.match(migration, /multideck_crm_accessible_account_ids\(v_context\.company_id\)/)
  assert.match(migration, /grant execute on function public\.multideck_crm_account_register_page[\s\S]*to authenticated, service_role/)
})

test("the Customers Edge function hydrates only the ordered page identifiers", () => {
  assert.match(backend, /export function authenticatedClient\(token: string\)/)
  assert.match(edge, /params\.has\("limit"\)/)
  assert.match(edge, /userDb\.rpc\("multideck_crm_account_register_page"/)
  assert.match(edge, /userDb\.rpc\("multideck_crm_contact_register_page"/)
  assert.match(edge, /customerRows\(admin, current\.Company_ID, null, null, false, ids\)/)
  assert.match(edge, /contactRows\(admin, current\.Company_ID, null, null, null, false, ids\)/)
  assert.match(edge, /ids\.flatMap\(\(id\) => rowMap\.get\(id\)/)
})

test("CRM account and contact pages use server filtering, sorting, and pagination", () => {
  assert.match(api, /export async function listAccountsPage/)
  assert.match(api, /export async function listContactsPage/)
  assert.doesNotMatch(api, /legacyAccountRegisterPage|legacyContactRegisterPage/)
  assert.doesNotMatch(api, /customerRequest<ApiCustomer\[]>\(""|customerRequest<ApiContact\[]>\("\/contacts"/)
  assert.match(api, /customerRequest<AccountRegisterPage>\(query/)
  assert.match(api, /customerRequest<ContactRegisterPage>\(`\/contacts\$\{query\}`/)
  assert.match(accountsPage, /listAccountsPage\(\{/)
  assert.match(contactsPage, /listContactsPage\(\{/)
  assert.doesNotMatch(accountsPage, /const filtered = useMemo/)
  assert.doesNotMatch(contactsPage, /const filtered = useMemo/)
  assert.match(accountsPage, /serverSorting=\{\{ value: sort/)
  assert.match(accountsPage, /pagination=\{\{ offset, limit: accountPageSize, total/)
  assert.match(contactsPage, /pagination=\{\{ offset, limit: contactPageSize, total/)
})

test("the canonical DataTable exposes accessible server-owned paging", () => {
  assert.match(dataTable, /pagination\?: \{/)
  assert.match(dataTable, /serverSorting\?: \{/)
  assert.match(dataTable, /if \(serverSorting\) return rows/)
  assert.match(dataTable, /aria-label=\{t\("Previous page"\)\}/)
  assert.match(dataTable, /aria-label=\{t\("Next page"\)\}/)
  assert.match(dataTable, /aria-live="polite"/)
})

test("remaining customer surfaces avoid the unbounded account API", () => {
  assert.doesNotMatch(customersPage, /\blistCustomers\(/)
  assert.doesNotMatch(crmPage, /\blistCustomers\(/)
  assert.match(customersPage, /listCustomerDirectoryPage\(/)
  assert.match(crmPage, /listAccountsPage\(/)
  assert.match(customersPage, /limit: rowsPerPage/)
  const followUpDialog = crmPage.slice(crmPage.indexOf("function FollowUpRecordDialog"), crmPage.indexOf("function DealDetailDrawer"))
  assert.match(followUpDialog, /search: accountSearch\.trim\(\)/)
  assert.match(followUpDialog, /limit: 25/)
  assert.doesNotMatch(followUpDialog, /while \(offset < total\)|loadAllCrmAccounts/)
})
