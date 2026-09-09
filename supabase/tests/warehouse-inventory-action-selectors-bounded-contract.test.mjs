import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")
const migration = read("supabase/migrations/20260819124000_warehouse_action_location_selector.sql")
const route = read("supabase/functions/warehouse/routes/handling-units.ts")
const client = read("multideck.client/src/lib/warehouse.ts")
const workspace = read("multideck.client/src/components/multideck/warehouse-inventory-workspace.tsx")
const benchmark = read("multideck.client/benchmarks/warehouse-inventory-action-selectors.mjs")

test("the shared location page stays capped and includes action attributes", () => {
  assert.match(migration, /least\(coalesce\(p_limit, 25\), 50\)/)
  assert.match(migration, /'statusCode', row\.status_code/)
  assert.match(migration, /'typeCode', row\.type_code/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_location_selector_page[^;]+authenticated/s)
  assert.match(migration, /grant execute on function public\.warehouse_edge_location_selector_page[^;]+service_role/s)
})

test("handling-unit reference never loads the full location catalogue", () => {
  assert.match(route, /locations:\s*\[\]/)
  assert.match(route, /locationsDeferred:\s*true/)
  assert.doesNotMatch(route, /deferLocations|scope"\) === "setup"/)
  assert.doesNotMatch(client, /deferLocations|scope: options/)
})

test("inventory actions use bounded searchable customers and locations", () => {
  assert.match(workspace, /getWarehouseOrderReference\(\)/)
  assert.match(workspace, /getWarehouseHandlingUnitReference\(actionFacilityId\)/)
  assert.match(workspace, /listWarehouseOrderCustomersPage\(\{ search: search\.trim\(\) \|\| undefined, limit: 25 \}\)/)
  assert.match(workspace, /listWarehouseOrderLocationsPage\(\{ facilityId, search: search\.trim\(\) \|\| undefined, limit: 50 \}\)/)
  assert.ok((workspace.match(/useWarehouseActionLocations\(/g) ?? []).length >= 6)
})

test("the 100,000-row action-selector proof is local and write-free", () => {
  assert.match(benchmark, /const customersCount = 100_000/)
  assert.match(benchmark, /const itemsCount = 100_000/)
  assert.match(benchmark, /const locationsCount = 100_000/)
  assert.match(benchmark, /supabase_writes: 0/)
})
