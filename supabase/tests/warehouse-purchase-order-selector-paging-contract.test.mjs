import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/purchase-orders.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-purchase-orders-workspace.tsx", import.meta.url), "utf8")
const gallery = readFileSync(new URL("../../multideck.client/src/data/multideck-data.ts", import.meta.url), "utf8")
const migration = readFileSync(new URL("../migrations/20260819120000_warehouse_order_selector_paging.sql", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-purchase-order-selector-paging.mjs", import.meta.url), "utf8")

test("purchase-order setup defers both large selector catalogues", () => {
  const setupBranch = route.indexOf('url.searchParams.get("scope") === "setup"')
  assert.ok(setupBranch >= 0)
  assert.match(route, /organisations:\s*\[\][\s\S]*organisationsDeferred:\s*true/)
  assert.match(route, /items:\s*\[\][\s\S]*itemsDeferred:\s*true/)
})

test("stock owners and items are separate capped server pages", () => {
  assert.match(route, /path\[2\] === "organisations"[\s\S]*boundedPage\(url, 25, 50\)/)
  assert.match(route, /\.range\(offset, offset \+ limit\)/)
  assert.match(route, /path\[2\] === "items"[\s\S]*warehouse_edge_item_selector_page/)
  assert.match(route, /requireInternalWarehouseRead\(actor\)/)
  assert.match(migration, /p_facility_id = any\(coalesce\(p_allowed_facility_ids/)
  assert.match(migration, /p_customer_org_id = any\(p_allowed_org_ids\)/)
})

test("create and detail screens use debounced remote pages without whole-catalogue compatibility", () => {
  const selectors = api.slice(
    api.indexOf("export function getWarehousePurchaseOrderReference"),
    api.indexOf("export function getNextWarehousePurchaseOrderNumber"),
  )
  assert.match(selectors, /getWarehousePurchaseOrderReference\(\)[\s\S]*\/purchase-orders\/reference\?scope=setup/)
  assert.match(selectors, /listWarehousePurchaseOrderOrganisationsPage/)
  assert.match(selectors, /listWarehousePurchaseOrderItemsPage/)
  assert.doesNotMatch(selectors, /if \("facilities" in result\)|normalizeWarehouseSelectorPage/)
  assert.match(ui, /function usePurchaseOrderReferenceSelectors/)
  assert.match(ui, /getWarehousePurchaseOrderReference\(\)/)
  assert.match(ui, /window\.setTimeout\(\(\) => \{[\s\S]*listWarehousePurchaseOrderOrganisationsPage/)
  assert.match(ui, /listWarehousePurchaseOrderItemsPage\(\{ facilityId, customerOrgId/)
  assert.equal((ui.match(/usePurchaseOrderReferenceSelectors\(/g) ?? []).length, 3)
})

test("document extraction matches each SKU through bounded item search", () => {
  assert.match(ui, /Promise\.all\(result\.lines\.map/)
  assert.match(ui, /search: line\.sku\.trim\(\), limit: 25/)
  assert.match(ui, /selectors\.rememberItems\(matchedItems\)/)
  assert.doesNotMatch(ui, /reference\?\.items\.filter/)
})

test("the reusable line editor and gallery describe server paging", () => {
  assert.match(ui, /remoteSearch loading=\{itemLoading\} hasMore=\{itemsHaveMore\}/)
  assert.match(gallery, /Item options arrive as a bounded server-search page/)
  assert.match(gallery, /items=\{itemPage\.rows\}/)
  assert.match(gallery, /onItemSearch=\{setItemSearch\}/)
})

test("the 200,000-row proof fixture remains local-only", () => {
  assert.match(benchmark, /organisationsCount = 100_000/)
  assert.match(benchmark, /itemsCount = 100_000/)
  assert.match(benchmark, /pageSize = 25/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
