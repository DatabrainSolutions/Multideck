import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const client = read("multideck.client/src/lib/warehouse.ts")
const view = read("multideck.client/src/components/multideck/warehouse-management-components.tsx")
const facilities = read("supabase/functions/warehouse/routes/facilities.ts")
const items = read("supabase/functions/warehouse/routes/items.ts")
const locations = read("supabase/functions/warehouse/routes/locations.ts")
const migration = read("supabase/migrations/20260819101000_warehouse_management_register_paging.sql")
const benchmark = read("multideck.client/benchmarks/warehouse-management-paging.mjs")

test("Warehouse management pages request bounded cached registers", () => {
  assert.match(client, /export async function listWarehouseFacilitiesPage/)
  assert.match(client, /export async function listWarehouseItemsPage/)
  assert.match(client, /export async function listWarehouseLocationsPage/)
  assert.ok((client.match(/Math\.max\(1, Math\.min\(options\.limit \?\? 20, 50\)\)/g) ?? []).length >= 3)
  assert.match(view, /pagination=\{\{ offset, limit: warehouseRegisterPageSize, total, loading, onOffsetChange: setOffset \}\}/)
  assert.equal((view.match(/serverSorting=\{\{ value: sort, onChange: setSort \}\}/g) ?? []).length, 3)
  assert.doesNotMatch(view, /\blistWarehouse(?:Facilities|Items|Locations)\(/)
})

test("Facilities execute exact-count filtering and range on the server", () => {
  assert.match(facilities, /select\("\*", \{ count: "exact" \}\)/)
  assert.match(facilities, /\.range\(offset, offset \+ limit - 1\)/)
  assert.match(facilities, /postgrestSearchPattern/)
  assert.match(facilities, /return \{ rows: \(data \?\? \[\]\).*total: count \?\? 0, limit, offset \}/s)
})

test("Items and locations use allowlisted service-role paging RPCs", () => {
  assert.match(items, /rpc\("warehouse_edge_items_page"/)
  assert.match(locations, /rpc\("warehouse_edge_locations_page"/)
  assert.match(items, /p_allowed_org_ids: actor\.companyId \? null : \[\.\.\.actor\.organisationIds\]/)
  assert.match(locations, /p_allowed_facility_ids: scoped/)
  assert.match(items, /\["42883", "PGRST202"\][\s\S]*HttpError\(503, "Warehouse item paging/)
  assert.match(locations, /\["42883", "PGRST202"\][\s\S]*HttpError\(503, "Warehouse location paging/)
  assert.match(items, /path\.length === 1[\s\S]*Warehouse item lists require bounded paging/)
  assert.match(locations, /!tail\.length[\s\S]*Warehouse location lists require bounded paging/)
  assert.doesNotMatch(items, /missing RPC may continue|in-memory path below/)
  assert.doesNotMatch(locations, /missing read-model function may use the rollout compatibility path/)
})

test("Database pages are capped, allowlist-scoped and service-role-only", () => {
  assert.equal((migration.match(/greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/g) ?? []).length, 2)
  assert.match(migration, /"WMSItem_DefaultFacilityID" = any\(p_allowed_facility_ids\)/)
  assert.match(migration, /p_facility_id = any\(coalesce\(p_allowed_facility_ids, array\[\]::uuid\[\]\)\)/)
  assert.equal((migration.match(/grant execute on function public\.warehouse_edge_.* to service_role;/g) ?? []).length, 2)
  assert.doesNotMatch(migration, /grant execute .* authenticated/)
  assert.doesNotMatch(migration, /insert into|update public|delete from/i)
})

test("The proof fixture is 100,000 local-only records with no Supabase writes", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /warmups = 2/)
  assert.match(benchmark, /runs = 9/)
  assert.doesNotMatch(benchmark, /@supabase|createClient|fetch\(|(?:supabase|client)\.from\(|(?:supabase|client)\.rpc\(|insert\(|upsert\(/i)
})
