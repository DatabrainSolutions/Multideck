import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260819122000_warehouse_draft_order_availability.sql", import.meta.url), "utf8")
const route = readFileSync(new URL("../functions/warehouse/routes/orders.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-operations-components.tsx", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-draft-order-availability-read.mjs", import.meta.url), "utf8")
const createDialog = ui.slice(ui.indexOf("function CreateOrderDialog"), ui.indexOf("const orderScopes"))

test("draft availability is capped, scoped and service-role-only", () => {
  assert.match(migration, /create or replace function public\.warehouse_edge_draft_order_availability/)
  assert.match(migration, /security definer/)
  assert.match(migration, /jsonb_array_length\(p_queries\) > 100/)
  assert.match(migration, /p_facility_id = any\(coalesce\(p_allowed_facility_ids/)
  assert.match(migration, /p_allowed_org_ids is not null[\s\S]*p_customer_org_id = any\(p_allowed_org_ids\)/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_draft_order_availability[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_draft_order_availability[\s\S]*to service_role/)
})

test("each visible query returns one exact positive-available total", () => {
  assert.match(migration, /join public\."WMS_Items" item[\s\S]*"WMSItem_DefaultFacilityID" = p_facility_id[\s\S]*"WMSItem_CustomerOrgID" = p_customer_org_id/)
  assert.match(migration, /"WMSBalance_InventoryStatusCode" = 'available'/)
  assert.match(migration, /"WMSBalance_AvailableQuantity" > 0/)
  assert.match(migration, /requirement\.location_id is null or balance\."WMSBalance_LocationID" = requirement\.location_id/)
  assert.match(migration, /requirement\.lot_number is null[\s\S]*"WMSLot_LotNumber" = requirement\.lot_number/)
  assert.match(migration, /'available', total\.available/)
})

test("the Edge route validates actor scope and sanitises at most 100 structured checks", () => {
  const branch = route.indexOf('path[1] === "availability-check"')
  assert.ok(branch >= 0)
  assert.doesNotMatch(route, /orderContext|loadOrders/)
  assert.match(route, /requireCapability\(actor, "warehouse_orders:create_outbound"\)/)
  assert.match(route, /requireCustomerScope\(actor, customerOrgId, facilityId\)/)
  assert.match(route, /input\.queries\.length > 100/)
  assert.match(route, /itemId: uuid\(entry\.itemId, "item"\)/)
  assert.match(route, /p_allowed_org_ids: actor\.companyId \? null : \[\.\.\.actor\.organisationIds\]/)
})

test("the create-order dialog requests only visible aggregates without a full-inventory fallback", () => {
  const availabilityClient = client.slice(
    client.indexOf("export function checkOperationalWarehouseOrderDraftAvailability"),
    client.indexOf("export async function listOperationalWarehouseOrdersPage"),
  )
  assert.match(client, /checkOperationalWarehouseOrderDraftAvailability[\s\S]*\/orders\/availability-check[\s\S]*readOnly: true/)
  assert.doesNotMatch(availabilityClient, /listWarehouseInventory|compatibility/)
  assert.match(createDialog, /draftAvailabilityQueries[\s\S]*\.slice\(0, 100\)/)
  assert.match(createDialog, /checkOperationalWarehouseOrderDraftAvailability/)
  assert.match(createDialog, /window\.setTimeout\([\s\S]*180\)/)
  assert.doesNotMatch(createDialog, /listWarehouseInventory\(/)
})

test("the 100,000-balance proof is local-only and performs no Supabase writes", () => {
  assert.match(benchmark, /balancesCount = 100_000/)
  assert.match(benchmark, /itemsCount = 100_000/)
  assert.match(benchmark, /queriesCount = 50/)
  assert.match(benchmark, /warmups = 2/)
  assert.match(benchmark, /runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
