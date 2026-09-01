import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260819121000_warehouse_order_availability_read.sql", import.meta.url), "utf8")
const route = readFileSync(new URL("../functions/warehouse/routes/orders.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-order-detail.tsx", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-order-availability-read.mjs", import.meta.url), "utf8")

test("outbound availability is a capped service-role-only database read", () => {
  assert.match(migration, /create or replace function public\.warehouse_edge_order_availability/)
  assert.match(migration, /security definer/)
  assert.match(migration, /v_per_item integer := greatest\(1, least\(coalesce\(p_limit_per_item, 25\), 50\)\)/)
  assert.match(migration, /v_total integer := greatest\(1, least\(coalesce\(p_total_limit, 500\), 1000\)\)/)
  assert.match(migration, /where item_rank <= v_per_item[\s\S]*limit v_total/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_order_availability[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_order_availability[\s\S]*to service_role/)
})

test("the availability index matches dispatch's facility, owner, item, customs and FIFO shape", () => {
  assert.match(migration, /"IX_WMS_Balances_OrderAvailability"/)
  for (const column of ["WMSBalance_FacilityID", "WMSBalance_CustomerOrgID", "WMSBalance_ItemID", "WMSBalance_CustomsStatusCode", "WMSBalance_FirstReceiptAt"]) {
    assert.match(migration, new RegExp(`"${column}"`))
  }
  assert.match(migration, /where "WMSBalance_InventoryStatusCode" = 'available'[\s\S]*"WMSBalance_AvailableQuantity" > 0/)
})

test("the Edge path enforces an internal actor and authorised facilities without broad order context", () => {
  const availabilityBranch = route.indexOf("const availabilityOrderId")
  assert.ok(availabilityBranch >= 0)
  assert.doesNotMatch(route, /orderContext|loadOrders/)
  assert.match(route, /if \(availabilityOrderId\) \{[\s\S]*requireInternalWarehouseRead\(actor\)[\s\S]*companyFacilityIds\(admin, actor\)/)
  assert.match(route, /warehouse_edge_order_availability[\s\S]*p_allowed_facility_ids: facilityIds[\s\S]*p_limit_per_item: 25[\s\S]*p_total_limit: 500/)
})

test("the outbound detail asks only for order-scoped FIFO stock", () => {
  const availabilityClient = client.slice(
    client.indexOf("export function getOperationalWarehouseOrderAvailability"),
    client.indexOf("export function checkOperationalWarehouseOrderDraftAvailability"),
  )
  assert.match(client, /getOperationalWarehouseOrderAvailability[\s\S]*\/orders\/\$\{orderId\}\/availability/)
  assert.doesNotMatch(availabilityClient, /listWarehouseInventory|compatibility/)
  assert.match(ui, /getOperationalWarehouseOrderAvailability\(orderId, facilityId\)/)
  assert.doesNotMatch(ui, /listWarehouseInventory/)
  assert.match(ui, /balance\.itemId === line\.itemId && balance\.customsStatusCode === line\.customsStatusCode/)
})

test("the 100,000-balance proof is local-only and performs no Supabase writes", () => {
  assert.match(benchmark, /balancesCount = 100_000/)
  assert.match(benchmark, /itemsCount = 100_000/)
  assert.match(benchmark, /locationsCount = 100_000/)
  assert.match(benchmark, /lotsCount = 100_000/)
  assert.match(benchmark, /warmups = 2/)
  assert.match(benchmark, /runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
