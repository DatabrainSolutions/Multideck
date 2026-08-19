import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/orders.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-operations-components.tsx", import.meta.url), "utf8")
const migration = readFileSync(new URL("../migrations/20260819120000_warehouse_order_selector_paging.sql", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-order-selector-paging.mjs", import.meta.url), "utf8")

test("Warehouse order setup returns only small reference data", () => {
  const setupBranch = route.indexOf('url.searchParams.get("scope") === "setup"')
  assert.ok(setupBranch >= 0)
  assert.doesNotMatch(route, /orderContext|loadOrders/)
  assert.match(route, /customers:\s*\[\][\s\S]*customersDeferred:\s*true/)
  assert.match(route, /items:\s*\[\][\s\S]*itemsDeferred:\s*true/)
  assert.match(route, /locations:\s*\[\][\s\S]*locationsDeferred:\s*true/)
})

test("item and location selectors are capped before rows reach the browser", () => {
  assert.match(route, /path\[2\] === "items"[\s\S]*boundedPage\(url, 25, 50\)/)
  assert.match(route, /warehouse_edge_item_selector_page/)
  assert.match(route, /path\[2\] === "locations"[\s\S]*requireInternal\(actor\)[\s\S]*boundedPage\(url, 25, 50\)/)
  assert.match(route, /warehouse_edge_location_selector_page/)
  assert.match(migration, /limit v_limit \+ 1[\s\S]*'hasMore'/)
})

test("selector RPCs enforce facility, organisation and active-record boundaries", () => {
  assert.match(migration, /p_facility_id = any\(coalesce\(p_allowed_facility_ids/)
  assert.match(migration, /p_customer_org_id = any\(p_allowed_org_ids\)/)
  assert.match(migration, /"WMSItem_IsActive"[\s\S]*not item\."WMSItem_IsDeleted"/)
  assert.match(migration, /"WMSLocation_IsActive"[\s\S]*not location\."WMSLocation_IsDeleted"/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_item_selector_page[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_location_selector_page[\s\S]*to service_role/)
})

test("search has matching scoped and trigram indexes", () => {
  assert.match(migration, /IX_WMS_Items_SelectorScope/)
  assert.match(migration, /IX_WMS_Items_SelectorSkuSearch/)
  assert.match(migration, /IX_WMS_Items_SelectorDescriptionSearch/)
  assert.match(migration, /IX_WMS_Locations_SelectorScope/)
  assert.match(migration, /IX_WMS_Locations_SelectorCodeSearch/)
})

test("the order dialog uses debounced server pages without whole-catalogue compatibility", () => {
  const orderSelectors = api.slice(
    api.indexOf("export function getWarehouseOrderReference"),
    api.indexOf("export function createOperationalWarehouseOrder"),
  )
  assert.match(orderSelectors, /getWarehouseOrderReference\(\)[\s\S]*\/orders\/reference\?scope=setup/)
  assert.match(orderSelectors, /listWarehouseOrderItemsPage/)
  assert.match(orderSelectors, /listWarehouseOrderLocationsPage/)
  assert.doesNotMatch(orderSelectors, /if \("facilities" in result\)|normalizeWarehouseSelectorPage/)
  assert.match(ui, /getWarehouseOrderReference\(\)/)
  assert.match(ui, /window\.setTimeout\(\(\) => \{[\s\S]*listWarehouseOrderItemsPage/)
  assert.match(ui, /listWarehouseOrderLocationsPage/)
  assert.match(ui, /Search items by SKU or description/)
  assert.match(ui, /Search locations/)
})

test("the 200,000-row proof fixture remains local-only", () => {
  assert.match(benchmark, /itemsCount = 100_000/)
  assert.match(benchmark, /locationsCount = 100_000/)
  assert.match(benchmark, /pageSize = 25/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
