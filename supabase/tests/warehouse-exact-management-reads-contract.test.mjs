import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const inventory = read("supabase/functions/warehouse/routes/inventory.ts")
const items = read("supabase/functions/warehouse/routes/items.ts")
const locations = read("supabase/functions/warehouse/routes/locations.ts")
const warehouseClient = read("multideck.client/src/lib/warehouse.ts")
const locationMigration = read("supabase/migrations/20260819134000_warehouse_location_delete_guard.sql")
const importMigration = read("supabase/migrations/20260819135000_warehouse_item_import_lookup.sql")

test("inventory Edge reads have no retired whole-register implementation", () => {
  assert.match(inventory, /rpc\("warehouse_edge_inventory_page"/)
  assert.match(inventory, /Warehouse inventory lists require bounded paging/)
  assert.doesNotMatch(inventory, /from\("WMS_(?:InventoryBalances|InventoryTransactions|Exceptions|Items|Locations|InventoryLots|HandlingUnits)"\)/)
  assert.doesNotMatch(inventory, /\.limit\((?:250|500)\)/)
})

test("item details, mutations and imports inspect only exact or uploaded records", () => {
  assert.match(items, /async function loadExactItem/)
  assert.match(items, /\.eq\("WMSItem_ID", itemId\)[\s\S]*?\.limit\(1\)/)
  assert.doesNotMatch(items, /itemReferenceContext|itemContext/)
  assert.doesNotMatch(items, /admin\.from\("Org_Master"\)\.select\("Org_id,Org_Name"\)(?!\.eq)/)
  assert.match(items, /rows\.length > 2_000/)
  assert.match(items, /rpc\("warehouse_edge_existing_item_skus"/)
  assert.doesNotMatch(items, /context\.items/)

  assert.match(warehouseClient, /getWarehouseItemReference\(\)[\s\S]*\/items\/reference\?scope=facilities/)
  assert.doesNotMatch(warehouseClient, /An older Warehouse Edge treats the deeper path/)
})

test("location detail and delete checks do not materialise facility-wide history", () => {
  assert.match(locations, /\.eq\("WMSLocation_ID", locationId\)[\s\S]*?\.limit\(1\)/)
  assert.match(locations, /rpc\("warehouse_edge_location_has_open_order"/)
  assert.doesNotMatch(locations, /from\("WMS_OrderLines"\)/)
  assert.doesNotMatch(locations, /from\("WMS_Locations"\)\.select\("\*"\)\.eq\("WMSLocation_FacilityID", facilityId\)/)

  assert.match(locationMigration, /select exists \(/)
  assert.match(locationMigration, /limit 1/)
  assert.match(locationMigration, /grant execute on function public\.warehouse_edge_location_has_open_order\(uuid, uuid\) to service_role/)
  assert.doesNotMatch(locationMigration, /grant execute .* authenticated/)
})

test("import SKU lookup is input-bounded, indexed and service-role-only", () => {
  assert.match(importMigration, /"WMSItem_CustomerOrgID", lower\("WMSItem_SKU"\)/)
  assert.match(importMigration, /lower\(item\."WMSItem_SKU"\) = any/)
  assert.match(importMigration, /grant execute on function public\.warehouse_edge_existing_item_skus\(uuid, text\[\]\) to service_role/)
  assert.doesNotMatch(importMigration, /grant execute .* authenticated/)
})
