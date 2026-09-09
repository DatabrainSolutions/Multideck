import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/purchase-orders.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-purchase-orders-workspace.tsx", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-purchase-order-detail-read.mjs", import.meta.url), "utf8")

test("one purchase order is fetched directly without a broad compatibility context", () => {
  const directBranch = route.indexOf("const directPurchaseOrderId")
  assert.ok(directBranch >= 0)
  assert.doesNotMatch(route, /purchaseOrderContext/)
  assert.match(route, /\.eq\("WMSPO_ID", directPurchaseOrderId\)/)
  assert.match(route, /\.in\("WMSPO_FacilityID", facilityIds\)/)
  assert.match(route, /\.eq\("WMSPO_IsDeleted", false\)[\s\S]*\.limit\(1\)/)
})

test("detail mapping reads only the selected record's supporting rows", () => {
  assert.match(route, /const itemIds = \[\.\.\.new Set\(lines\.map/)
  assert.match(route, /const missingItemIds = itemIds\.filter/)
  assert.match(route, /\.in\("WMSItem_ID", missingItemIds\)/)
  assert.match(route, /\.eq\("WMSFacility_ID", row\.WMSPO_FacilityID\)/)
  assert.match(route, /\.eq\("Org_id", row\.WMSPO_CustomerOrgID\)/)
  assert.match(route, /mapPurchaseOrders\(admin, rows, \{ facilities, organisations, items: \[\] \}\)/)
})

test("detail editing also uses bounded reference selectors", () => {
  assert.match(ui, /WarehousePurchaseOrderDetailView[\s\S]*usePurchaseOrderReferenceSelectors\(form\?\.facilityId/)
  assert.match(ui, /selectors\.rememberOrganisation\(\{ id: found\.customerOrgId, name: found\.customerName \}\)/)
  assert.match(ui, /selectors\.rememberItems\(found\.lines\.flatMap/)
})

test("the scale proof is synthetic and performs no Supabase writes", () => {
  assert.match(benchmark, /organisationsCount = 100_000/)
  assert.match(benchmark, /itemsCount = 100_000/)
  assert.match(benchmark, /purchaseOrdersCount = 100_000/)
  assert.match(benchmark, /sourceRows: 1 \+ 1 \+ linesCount/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
