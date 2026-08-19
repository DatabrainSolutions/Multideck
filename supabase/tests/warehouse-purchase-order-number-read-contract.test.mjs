import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")
const route = read("supabase/functions/warehouse/routes/purchase-orders.ts")
const migration = read("supabase/migrations/20260819131000_warehouse_purchase_order_number_read.sql")

test("purchase-order number suggestions stay inside the database", () => {
  assert.match(route, /rpc\("warehouse_edge_next_purchase_order_number"/)
  assert.doesNotMatch(route, /\.select\("WMSPO_Number"\)[\s\S]*const used = new Set/)
  assert.match(route, /HttpError\(503, "Warehouse purchase-order numbering is still being prepared/)
  assert.doesNotMatch(route, /purchaseOrderContext|loadPurchaseOrders/)
  assert.match(route, /\.select\("WMSFacility_ID,WMSFacility_Code"\)[\s\S]*\.limit\(1\)/)
})

test("purchase-order writes reload only the changed record", () => {
  assert.match(route, /rpc\("warehouse_edge_purchase_order_mutation"/)
  assert.match(route, /\.eq\("WMSPO_ID", data\)[\s\S]*\.limit\(1\)/)
  assert.doesNotMatch(route, /\.from\("WMS_PurchaseOrders"\)\.select\("\*"\)[\s\S]*\.limit\(500\)/)
  assert.match(route, /references must use deferred, paged selectors/)
})

test("the number lookup is indexed, scoped and service-role-only", () => {
  assert.match(migration, /IX_WMS_PurchaseOrders_NumberSequence/)
  assert.match(migration, /p_facility_id = any\(coalesce\(p_allowed_facility_ids/)
  assert.match(migration, /order by \(substring\(purchase_order\."WMSPO_Number"/)
  assert.match(migration, /greatest\(4, length\(v_sequence_text\)\)/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_next_purchase_order_number[\s\S]*authenticated/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_next_purchase_order_number[\s\S]*service_role/)
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
})
