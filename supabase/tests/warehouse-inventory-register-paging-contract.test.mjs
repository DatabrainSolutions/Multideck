import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")

const client = read("multideck.client/src/lib/warehouse.ts")
const workspace = read("multideck.client/src/components/multideck/warehouse-inventory-workspace.tsx")
const inventoryRoute = read("supabase/functions/warehouse/routes/inventory.ts")
const handlingRoute = read("supabase/functions/warehouse/routes/handling-units.ts")
const migration = read("supabase/migrations/20260819102000_warehouse_inventory_register_paging.sql")
const benchmark = read("multideck.client/benchmarks/warehouse-inventory-paging.mjs")

test("inventory client exposes four capped faceted page readers", () => {
  for (const name of [
    "listWarehouseInventoryPage",
    "listWarehouseHandlingUnitsPage",
    "listWarehouseInventoryMovementsPage",
    "listWarehouseInventoryExceptionsPage",
  ]) assert.match(client, new RegExp(`export async function ${name}`))
  assert.ok((client.match(/Math\.max\(1, Math\.min\(options\.limit \?\? 20, 50\)\)/g) ?? []).length >= 7)
  assert.match(client, /WarehouseFacetedRegisterPage/)
})

test("inventory workspace fetches only its active page and defers action reference data", () => {
  assert.doesNotMatch(workspace, /\blistWarehouseInventory\b/)
  assert.doesNotMatch(workspace, /\blistWarehouseHandlingUnits\b/)
  assert.doesNotMatch(workspace, /\blistWarehouseInventoryMovements\b/)
  assert.doesNotMatch(workspace, /\blistWarehouseInventoryExceptions\b/)
  assert.match(workspace, /mode === "Stock" \? await listWarehouseInventoryPage/)
  assert.match(workspace, /mode === "Objects" \? await listWarehouseHandlingUnitsPage/)
  assert.match(workspace, /pagination=\{\{ offset, limit: inventoryPageSize, total: totals\[mode\]/)
  assert.match(workspace, /serverSorting=\{\{ value: sort/)
  assert.match(workspace, /listWarehouseFacilitiesPage\(\{ limit: 50 \}\)/)
  assert.match(workspace, /if \(!createOpen && !emptyOpen\) return[\s\S]*getWarehouseOrderReference\(\)/)
})

test("Edge routes scope and invoke bounded inventory read models", () => {
  assert.match(inventoryRoute, /url\.searchParams\.has\("limit"\)/)
  assert.match(inventoryRoute, /warehouse_edge_inventory_page/)
  assert.match(inventoryRoute, /p_allowed_facility_ids: allowed/)
  assert.match(inventoryRoute, /p_allowed_org_ids: actor\.companyId \? null : Array\.from\(actor\.organisationIds\)/)
  assert.match(inventoryRoute, /path\[1\] === "exceptions" && !actor\.companyId/)
  assert.match(handlingRoute, /warehouse_edge_handling_units_page/)
  assert.match(handlingRoute, /p_customer_org_id/)
  assert.match(inventoryRoute, /\["42883", "PGRST202"\][\s\S]*HttpError\(503, "Warehouse inventory paging/)
  assert.match(handlingRoute, /\["42883", "PGRST202"\][\s\S]*HttpError\(503, "Warehouse object paging/)
  assert.match(inventoryRoute, /Warehouse inventory lists require bounded paging/)
  assert.match(handlingRoute, /Warehouse object lists require bounded paging/)
  assert.doesNotMatch(inventoryRoute, /missing read-model function may use the rollout compatibility path/)
  assert.doesNotMatch(handlingRoute, /missing read-model function may use the rollout compatibility path/)
})

test("database pages are allowlist-scoped, service-role-only and read-only", () => {
  assert.match(migration, /create or replace function public\.warehouse_edge_inventory_page/)
  assert.match(migration, /create or replace function public\.warehouse_edge_handling_units_page/)
  assert.match(migration, /least\(coalesce\(p_limit, 20\), 50\)/)
  assert.match(migration, /= any\(p_allowed_facility_ids\)/)
  assert.match(migration, /p_allowed_org_ids is null or/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_inventory_page[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_handling_units_page[\s\S]*to service_role/)
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
  assert.match(migration, /Dexter exception:/)
})

test("inventory proof uses 100,000 local-only records and no Supabase writes", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /const warmups = 2/)
  assert.match(benchmark, /const runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /createClient|supabase\.from|fetch\(/)
})
