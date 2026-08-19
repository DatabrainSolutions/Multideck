import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")
const migration = read("supabase/migrations/20260819123000_warehouse_item_detail_read.sql")
const route = read("supabase/functions/warehouse/routes/items.ts")
const handlingUnitsRoute = read("supabase/functions/warehouse/routes/handling-units.ts")
const client = read("multideck.client/src/lib/warehouse.ts")
const detail = read("multideck.client/src/components/multideck/warehouse-item-detail.tsx")
const benchmark = read("multideck.client/benchmarks/warehouse-item-detail-read.mjs")

test("item detail SKU lookup is indexed, scoped and service-role-only", () => {
  assert.match(migration, /IX_WMS_Items_DetailSku/)
  assert.match(migration, /lower\("WMSItem_SKU"\)/)
  assert.match(migration, /p_allowed_facility_ids/)
  assert.match(migration, /p_allowed_org_ids/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_item_id_by_sku[^;]+authenticated/s)
  assert.match(migration, /grant execute on function public\.warehouse_edge_item_id_by_sku[^;]+service_role/s)
})

test("the exact detail route has no broad item context and loads only supporting rows", () => {
  const detailBranch = route.indexOf('path[1] === "detail"')
  assert.ok(detailBranch > 0)
  assert.doesNotMatch(route, /itemReferenceContext|itemContext/)
  assert.match(route, /async function loadExactItem/)
  assert.match(route, /warehouse_edge_item_id_by_sku/)
  assert.match(route, /WMSItemUOM_ItemID", item\.WMSItem_ID/)
  assert.match(route, /Org_id", item\.WMSItem_CustomerOrgID/)
  assert.match(route, /WMSFacility_ID", item\.WMSItem_DefaultFacilityID/)
})

test("the item screen uses exact detail without a whole-register compatibility fallback", () => {
  assert.match(client, /requestWarehouse<WarehouseItem>\(`\/items\/detail/)
  assert.doesNotMatch(client, /export function listWarehouseItems\b/)
  assert.doesNotMatch(client, /const matches = await listWarehouseItems/)
  assert.match(detail, /getWarehouseItemBySku\(sku\)/)
  assert.doesNotMatch(detail, /listWarehouseItems\(/)
})

test("one warehouse object loads only its exact rows and related content", () => {
  assert.match(handlingUnitsRoute, /\.eq\("WMSHU_ID", requestedId\)/)
  assert.match(handlingUnitsRoute, /\.eq\("WMSHUEvent_HU_ID", requestedId\)[\s\S]*\.limit\(25\)/)
  assert.match(handlingUnitsRoute, /\.in\("WMSItem_ID", itemIds\)/)
  assert.match(handlingUnitsRoute, /\.in\("WMSLot_ID", lotIds\)/)
  assert.doesNotMatch(handlingUnitsRoute, /WMS_HandlingUnits"\)\.select\("\*"\)[\s\S]*\.limit\(500\)/)
})

test("the scale proof uses 100,000 local records and no Supabase writes", () => {
  assert.match(benchmark, /const itemsCount = 100_000/)
  assert.match(benchmark, /const organisationsCount = 100_000/)
  assert.match(benchmark, /const facilitiesCount = 100_000/)
  assert.match(benchmark, /supabase_writes: 0/)
})
