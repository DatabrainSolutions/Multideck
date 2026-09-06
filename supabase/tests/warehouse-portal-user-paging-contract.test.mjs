import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const route = read("supabase/functions/warehouse/routes/portal-users.ts")
const index = read("supabase/functions/warehouse/index.ts")
const client = read("multideck.client/src/lib/warehouse.ts")
const view = read("multideck.client/src/pages/customer-detail-page.tsx")
const migration = read("supabase/migrations/20260819140000_warehouse_portal_user_paging.sql")

test("portal user lists are server-paged and exact access-link reads stay bounded", () => {
  assert.match(index, /handlePortal\(request, path, url, admin, actor\)/)
  assert.match(route, /boundedPage\(url\)/)
  assert.match(route, /rpc\("warehouse_edge_portal_users_page"/)
  assert.doesNotMatch(route, /rpc\("warehouse_edge_portal_users"/)
  assert.match(route, /\.eq\("PortalUser_ID", portalUserId\)[\s\S]*?\.limit\(1\)/)
  assert.match(route, /\.eq\("PortalUserOrg_OrgID", targetCustomerOrgId\)[\s\S]*?\.limit\(1\)/)
})

test("customer access UI requests and navigates 20-user pages", () => {
  assert.match(client, /listWarehousePortalUsersPage/)
  assert.doesNotMatch(client, /listWarehousePortalUsers\(customerOrgId/)
  assert.match(view, /listWarehousePortalUsersPage\(customerId, \{ limit: userPageSize, offset: userOffset \}\)/)
  assert.match(view, /onPageSizeChange=\{setUserPageSize\}/)
  assert.match(view, /setUsers\(nextUsers\.rows\)/)
  assert.match(view, /totalItems=\{userTotal\}/)
})

test("database user pages are capped, indexed and service-role-only", () => {
  assert.match(migration, /greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/)
  assert.match(migration, /IX_Portal_UserOrganisations_OrgStatusUser/)
  assert.match(migration, /limit v_limit[\s\S]*offset v_offset/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_portal_users_page\(uuid, integer, integer\) to service_role/)
  assert.doesNotMatch(migration, /grant execute .* authenticated/)
})
