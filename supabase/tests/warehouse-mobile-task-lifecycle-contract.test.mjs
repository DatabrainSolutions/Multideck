import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260904143000_warehouse_mobile_task_lifecycle.sql", import.meta.url), "utf8")
const orders = await readFile(new URL("../functions/warehouse/routes/orders.ts", import.meta.url), "utf8")
const items = await readFile(new URL("../functions/warehouse/routes/items.ts", import.meta.url), "utf8")
const tasks = await readFile(new URL("../functions/warehouse/routes/tasks.ts", import.meta.url), "utf8")
const warehouse = await readFile(new URL("../functions/warehouse/index.ts", import.meta.url), "utf8")
const dexter = await readFile(new URL("../functions/agent-dexter/index.ts", import.meta.url), "utf8")

test("one customer SKU remains one item master with bounded facility assignments", () => {
  assert.match(migration, /create table if not exists public\."WMS_ItemFacilityAssignments"/)
  assert.match(migration, /unique \("WMSItemFacility_ItemID", "WMSItemFacility_FacilityID"\)/)
  assert.match(migration, /warehouse_edge_set_item_facilities/)
  assert.match(migration, /A warehouse with stock or open orders cannot be removed from this item/)
  assert.match(migration, /join public\."WMS_ItemFacilityAssignments" assignment[\s\S]*assignment\."WMSItemFacility_IsActive"/)
})

test("item API validates assignment failures before the item write", () => {
  const validation = items.indexOf("The default warehouse must be one of the selected warehouses")
  const removalGuard = items.indexOf("A warehouse with stock or open orders cannot be removed from this item")
  const uomGuard = items.indexOf("Packaging conversions must be greater than zero")
  const itemWrite = items.indexOf('admin.from("WMS_Items").insert')
  assert.ok(validation > -1 && validation < itemWrite)
  assert.ok(removalGuard > -1 && removalGuard < itemWrite)
  assert.ok(uomGuard > -1 && uomGuard < itemWrite)
  assert.match(items, /p_facility_ids: requestedFacilityIds/)
  assert.match(items, /facilities: assignments/)
})

test("orders carry typed operational source evidence without attaching it to the item master", () => {
  for (const field of ["WMSOrder_SourceTypeCode", "WMSOrder_SourceReference", "WMSOrder_SourceRecordID"]) {
    assert.match(migration, new RegExp(field))
    assert.match(orders, new RegExp(field))
  }
  assert.match(migration, /customer_purchase_order','asn','transfer','return','manual_exception/)
  assert.match(migration, /sales_order','transfer','return_to_supplier','disposal','manual_exception/)
  assert.doesNotMatch(migration, /WMSItem_SourceTypeCode/)
})

test("legacy and Dexter order creation remains compatible through an explicit manual source", () => {
  assert.match(migration, /coalesce\(nullif\(lower\(btrim\(p_payload->>'sourceTypeCode'\)\),''\),'manual_exception'\)/)
  assert.match(migration, /nullif\(btrim\(p_payload->>'customerReference'\),''\)/)
  assert.match(migration, /where "AIDexterAction_Code"='create_warehouse_order'/)
  assert.match(dexter, /Warehouse orders have a typed customer source/)
})

test("receipt creates putaway only from a real receiving or staging location", () => {
  assert.match(migration, /TR_WMS_ReceiptLines_create_putaway/)
  assert.match(migration, /Receive stock into an active dock or staging location before putaway/)
  assert.match(migration, /'putaway','queued'/)
  assert.match(migration, /'receiptLineId'/)
})

test("outbound release allocates FIFO stock and creates pick tasks", () => {
  assert.match(migration, /warehouse_edge_release_order_mutation/)
  assert.match(migration, /order by "WMSBalance_FirstReceiptAt", "WMSBalance_ID" for update/)
  assert.match(migration, /"WMSBalance_AllocatedQuantity"="WMSBalance_AllocatedQuantity"\+v_take/)
  assert.match(migration, /insert into public\."WMS_PickTasks"/)
  assert.match(orders, /path\[2\] === "release"/)
  assert.match(orders, /rpc\("warehouse_edge_release_order_mutation"/)
})

test("task confirmation validates scan evidence and keeps physical work out of Dexter writes", () => {
  assert.match(migration, /scannedSourceLocationCode/)
  assert.match(migration, /scannedTargetLocationCode/)
  assert.match(migration, /scannedItemCode/)
  assert.match(tasks, /rpc\("warehouse_edge_confirm_task_mutation"/)
  assert.match(dexter, /Putaway and pick confirmation remain deliberately unavailable to Dexter writes/)
})

test("dispatch is gated by picked evidence and never synthesises allocation, picking, or packing", () => {
  assert.match(migration, /warehouse_edge_dispatch_mutation/)
  assert.match(migration, /v_line\."WMSOrderLine_PickedQuantity"-v_line\."WMSOrderLine_DispatchedQuantity"/)
  assert.match(migration, /Dispatch only quantities that warehouse staff have picked/)
  const dispatchFunction = migration.slice(migration.indexOf("create or replace function public.warehouse_edge_dispatch_mutation"), migration.indexOf("create or replace function public.warehouse_edge_item_selector_page"))
  assert.doesNotMatch(dispatchFunction, /WMSOrderLine_PackedQuantity"=/)
  assert.doesNotMatch(dispatchFunction, /WMSOrderLine_PickedQuantity"=/)
  assert.doesNotMatch(dispatchFunction, /WMSOrderLine_AllocatedQuantity"=greatest/)
  assert.match(orders, /rpc\("warehouse_edge_dispatch_mutation"/)
})

test("cancelling an unpicked release returns allocations and cancels its tasks", () => {
  assert.match(migration, /warehouse_edge_cancel_order_mutation/)
  assert.match(migration, /An order with received, picked, or dispatched stock cannot be cancelled/)
  assert.match(migration, /"WMSBalance_AvailableQuantity"="WMSBalance_AvailableQuantity"\+v_task\."WMSTask_Quantity"/)
  assert.match(orders, /rpc\("warehouse_edge_cancel_order_mutation"/)
})

test("task endpoints are bounded and facility scoped", () => {
  assert.match(warehouse, /path\[0\] === "tasks"/)
  assert.match(tasks, /boundedPage\(url\)/)
  assert.match(tasks, /in\("WMSTask_FacilityID", facilityId \? \[facilityId\] : facilityIds\)/)
  assert.match(tasks, /orderId/)
  assert.match(tasks, /path\[2\] === "confirm"/)
  assert.match(tasks, /requireInternalWarehouseWrite\(actor\)/)
})

test("Watching for you receives deterministic task events and Dexter can read execution evidence", () => {
  assert.match(migration, /TR_WMS_Tasks_watch_signal/)
  assert.match(migration, /insert into public\."AI_DexterWatchSignals"/)
  assert.match(migration, /AIDexterWatch_StatusCode"='active'/)
  assert.match(migration, /multideck_dexter_domain_warehouse_execution/)
  assert.match(migration, /sourceTypeCode/)
  assert.match(migration, /release_warehouse_order/)
})
