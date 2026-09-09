import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const migration = read("supabase/migrations/20260819130000_crm_transfer_user_selector_paging.sql")
const leadApi = read("multideck.client/src/lib/lead-api.ts")
const crmPage = read("multideck.client/src/pages/crm-page.tsx")
const app = read("multideck.client/src/App.tsx")
const authUser = read("multideck.client/src/lib/auth-user.ts")
const accountsPage = read("multideck.client/src/pages/crm-accounts-page.tsx")
const customersPage = read("multideck.client/src/pages/customers-page.tsx")
const customersFunction = read("supabase/functions/customers/index.ts")
const benchmark = read("multideck.client/benchmarks/crm-transfer-user-selector.mjs")

test("CRM transfer targets are company-scoped, active-only and capped before reaching the browser", () => {
  assert.match(migration, /multideck_crm_transfer_users_page\(/)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 50\)/)
  assert.match(migration, /workspace_user\."Company_ID" = v_context\.company_id/)
  assert.match(migration, /workspace_user\."Auth_User_ID" is not null/)
  assert.match(migration, /coalesce\(workspace_user\."User_AccessStatus", 'active'\) = 'active'/)
  assert.match(migration, /p_exclude_user_id is null or workspace_user\."User_ID" <> p_exclude_user_id/)
  assert.match(migration, /offset v_offset\s+limit v_limit/)
  assert.match(migration, /'total', \(select count\(\*\) from eligible\)/)
  assert.match(migration, /'currentUser', \(select payload from current_operator\)/)
  assert.match(migration, /_multideck_crm_has_permission\(v_context\.user_id, 'CRM\.Read'\)/)
  assert.match(migration, /revoke all on function public\.multideck_crm_transfer_users_page[\s\S]*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_crm_transfer_users_page[\s\S]*to authenticated, service_role/)
})

test("transfer search is server-owned, cached and never downloads the company directory", () => {
  assert.match(leadApi, /export async function listCrmTransferUsersPage/)
  assert.match(leadApi, /supabase\.rpc\("multideck_crm_transfer_users_page"/)
  assert.match(leadApi, /p_search: input\.search\?\.trim\(\) \|\| null/)
  assert.match(leadApi, /p_exclude_user_id: input\.excludeUserId \|\| null/)
  assert.match(leadApi, /Math\.min\(input\.limit \?\? 25, 50\)/)
  assert.match(leadApi, /transfer-users:page:/)
  assert.match(leadApi, /readCachedCrmResource\(/)
  assert.match(leadApi, /if \(!missingRegisterRpc\(error\)\)/)
  assert.match(leadApi, /CRM user search is still being prepared/)
  assert.doesNotMatch(leadApi, /multideck_crm_list_transfer_users|listCrmTransferUsers\(\)/)
})

test("lead registers use bootstrap identity and lead details defer transfer targets until the popover opens", () => {
  assert.match(app, /<CrmLeadsPage navigate=\{navigate\} currentUser=\{currentUser\}/)
  assert.match(crmPage, /const currentLeadOwnerId = currentUser\?\.internalUserId \?\? null/)
  const leadsPage = crmPage.slice(crmPage.indexOf("export function CrmLeadsPage"), crmPage.indexOf("export function CrmLeadDetailPage"))
  assert.doesNotMatch(leadsPage, /listCrmTransferUsers/)

  const leadDetail = crmPage.slice(crmPage.indexOf("export function CrmLeadDetailPage"), crmPage.indexOf("export function CrmListsPage"))
  const initialLoad = leadDetail.slice(0, leadDetail.indexOf("const currentTransferUser"))
  assert.doesNotMatch(initialLoad, /listCrmTransferUsers/)
  assert.match(leadDetail, /if \(!transferOpen \|\| !canDirectTransfer \|\| !lead\) return/)
  assert.match(leadDetail, /setTimeout\(\(\) => setDebouncedTransferSearch\(transferSearch\.trim\(\)\), 250\)/)
  assert.match(leadDetail, /listCrmTransferUsersPage\(\{/)
  assert.match(leadDetail, /limit: 25/)
  assert.match(leadDetail, /transferUsersState === "loading"/)
  assert.match(leadDetail, /transferUsersState === "error"/)
  assert.match(leadDetail, /Search by name or email to narrow the list/)
})

test("the shared authenticated profile exposes its internal actor id without another directory request", () => {
  assert.match(authUser, /internalUserId: string \| null/)
  assert.match(authUser, /internalUserId: profile\?\.id \?\? null/)
  assert.match(accountsPage, /const currentOwnerId = currentUser\?\.internalUserId \?\? null/)
  assert.doesNotMatch(accountsPage, /reference\?\.owners\.find/)
})

test("account reference data no longer includes an unbounded company-user query", () => {
  const referenceRoute = customersFunction.slice(
    customersFunction.indexOf('if (parts[0] === "reference")'),
    customersFunction.indexOf('if (parts[0] === "directory")'),
  )
  assert.doesNotMatch(referenceRoute, /admin\.from\("cmp_Users"\)/)
  assert.match(referenceRoute, /owners: \[\]/)
  assert.match(referenceRoute, /Org_Types/)
  assert.match(referenceRoute, /sys_CRMRelationshipStatuses/)
  assert.match(accountsPage, /if \(!createOpen \|\| reference\) return/)
  assert.match(customersPage, /if \(!createOpen \|\| customerReference\) return/)
  assert.match(customersPage, /customerReferenceState !== "ready"/)
})

test("the 100,000-user browser proof is repeatable and performs no Supabase writes", () => {
  assert.match(benchmark, /const userCount = 100_000/)
  assert.match(benchmark, /const pageSize = 25/)
  assert.match(benchmark, /const warmups = 2/)
  assert.match(benchmark, /const runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /\.from\(["']|\.insert\(|\.update\(|\.delete\(/)
})
