import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/orders.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-order-detail.tsx", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-order-detail-read.mjs", import.meta.url), "utf8")

test("one operational order is fetched directly without a broad compatibility context", () => {
  const directBranch = route.indexOf("const directOrderNumber")
  assert.ok(directBranch >= 0)
  assert.doesNotMatch(route, /orderContext|loadOrders/)
  assert.match(route, /literalOrderNumber = directOrderNumber\.replace/)
  assert.match(route, /\.in\("WMSOrder_FacilityID", facilityIds\)/)
  assert.match(route, /\.eq\("WMSOrder_IsDeleted", false\)[\s\S]*\.ilike\("WMSOrder_OrderNumber", literalOrderNumber\)[\s\S]*\.limit\(1\)/)
  assert.match(route, /if \(!actor\.companyId\) query = query\.in\("WMSOrder_CustomerOrgID", \[\.\.\.actor\.organisationIds\]\)/)
})

test("detail mapping reads only the selected order's supporting item and location rows", () => {
  assert.match(route, /const itemIds = \[\.\.\.new Set\(lines\.map/)
  assert.match(route, /const locationIds = \[\.\.\.new Set\(lines\.flatMap/)
  assert.match(route, /\.in\("WMSItem_ID", missingItemIds\)/)
  assert.match(route, /\.in\("WMSLocation_ID", missingLocationIds\)/)
  assert.match(route, /\.eq\("WMSFacility_ID", row\.WMSOrder_FacilityID\)/)
  assert.match(route, /\.eq\("Org_id", row\.WMSOrder_CustomerOrgID\)/)
  assert.match(route, /mapExactOrder\(admin, rows\[0\]\)/)
  assert.match(route, /loadExactOrderById/)
  assert.match(route, /const refreshed = await loadExactOrderById/)
})

test("the detail screen uses the exact order endpoint and bounded location search", () => {
  assert.match(client, /getOperationalWarehouseOrderByNumber[\s\S]*\/orders\/detail/)
  const detailClient = client.slice(
    client.indexOf("export function getOperationalWarehouseOrderByNumber"),
    client.indexOf("export function getOperationalWarehouseOrderAvailability"),
  )
  assert.doesNotMatch(detailClient, /listOperationalWarehouseOrders|compatibility/)
  assert.match(ui, /getOperationalWarehouseOrderByNumber\(orderNumber\)/)
  assert.doesNotMatch(ui, /listOperationalWarehouseOrders/)
  assert.doesNotMatch(ui, /getWarehouseOrderReference/)
  assert.match(ui, /listWarehouseOrderLocationsPage\(\{ facilityId, search: locationSearch, limit: 25, offset: 0 \}\)/)
  assert.match(ui, /locationSearch\.trim\(\) \? 220 : 0/)
  assert.match(ui, /line\.sourceLocationId && line\.sourceLocationCode/)
  assert.match(ui, /line\.targetLocationId && line\.targetLocationCode/)
})

test("the scale proof is synthetic and performs no Supabase writes", () => {
  assert.match(benchmark, /organisationsCount = 100_000/)
  assert.match(benchmark, /itemsCount = 100_000/)
  assert.match(benchmark, /locationsCount = 100_000/)
  assert.match(benchmark, /ordersCount = 100_000/)
  assert.match(benchmark, /warmups = 2/)
  assert.match(benchmark, /runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
