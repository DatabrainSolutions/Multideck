import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const migration = read("supabase/migrations/20260818220000_customer_directory_server_paging.sql")
const edge = read("supabase/functions/customers/index.ts")
const api = read("multideck.client/src/lib/customer-api.ts")
const page = read("multideck.client/src/pages/customers-page.tsx")
const benchmark = read("multideck.client/benchmarks/customer-directory-paging.mjs")

test("the customer directory RPC bounds rows and preserves authenticated account scope", () => {
  assert.match(migration, /create or replace function public\.multideck_customer_directory_page/)
  assert.match(migration, /least\(coalesce\(p_limit, 20\), 50\)/)
  assert.match(migration, /multideck_crm_accessible_account_ids\(v_context\.company_id\)/)
  assert.match(migration, /_multideck_crm_has_permission\(v_context\.user_id, 'Customers\.Read'\)/)
  assert.match(migration, /v_scope = 'all' or owner_id = v_context\.user_id/)
  assert.match(migration, /when 'A' then 'Premium'/)
  assert.match(migration, /when 'Premium' then 'Premium'/)
  assert.match(migration, /when 'Trial' then 'Trial'/)
  assert.match(migration, /when 'New' then 'New'/)
  assert.match(migration, /'statusCounts'/)
  assert.match(migration, /jsonb_agg\(id order by ordinal\)/)
  assert.match(migration, /revoke all on function public\.multideck_customer_directory_page[\s\S]*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_customer_directory_page[\s\S]*to authenticated, service_role/)
})

test("the Customers Edge route hydrates only ordered directory identifiers", () => {
  assert.match(edge, /parts\[0\] === "directory"/)
  assert.match(edge, /userDb\.rpc\("multideck_customer_directory_page"/)
  assert.match(edge, /p_scope: params\.get\("scope"\) \|\| "all"/)
  assert.match(edge, /p_status: params\.get\("status"\) \|\| "All"/)
  assert.match(edge, /customerRows\(admin, current\.Company_ID, null, null, false, ids\)/)
  assert.match(edge, /ids\.flatMap\(\(id\) => rowMap\.get\(id\)/)
  assert.ok(edge.indexOf('parts[0] === "directory"') < edge.indexOf("if (parts[0]) return json"))
})

test("the client requests one cached directory page and invalidates it after mutations", () => {
  assert.match(api, /export async function listCustomerDirectoryPage/)
  assert.match(api, /customerRequest<CustomerDirectoryPage>\(`\/directory\$\{query\}`/)
  assert.match(api, /`customer-directory:page:\$\{query\}`/)
  assert.match(api, /invalidateCrmResources\(session\.user\.id, \[[^\]]*"customer-directory:"/)
})

test("the Customers page no longer aggregates every account page in the browser", () => {
  assert.doesNotMatch(page, /loadAllCustomerAccounts/)
  assert.doesNotMatch(page, /while \(offset < total\)/)
  assert.match(page, /listCustomerDirectoryPage\(\{/)
  assert.match(page, /limit: rowsPerPage/)
  assert.match(page, /offset: \(page - 1\) \* rowsPerPage/)
  assert.match(page, /totalItems=\{total\}/)
  assert.doesNotMatch(page, /visibleCustomers\.slice/)
})

test("the scale benchmark is local-only and cannot seed Supabase", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /@supabase|createClient|fetch\(|\.insert\(|\.upsert\(/i)
})
