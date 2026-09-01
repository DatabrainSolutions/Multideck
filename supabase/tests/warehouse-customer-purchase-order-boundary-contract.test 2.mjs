import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const boundaryMigration = read("../migrations/20260831210050_clarify_warehouse_customer_purchase_orders.sql")
const warehouseRoute = read("../functions/warehouse/routes/purchase-orders.ts")
const warehouseUi = read("../../multideck.client/src/components/multideck/warehouse-purchase-orders-workspace.tsx")
const navigation = read("../../multideck.client/src/data/navigation-data.ts")
const financeSubledger = read("../functions/finance-subledger/index.ts")
const financeAccruals = read("../functions/finance-accruals/index.ts")
const universalCharges = read("../migrations/20260831061903_universal_job_charge_accounting.sql")
const dexter = read("../functions/agent-dexter/index.ts")

test("warehouse purchase orders have an explicit customer inbound role", () => {
  assert.match(boundaryMigration, /WMSPO_RecordRoleCode/)
  assert.match(boundaryMigration, /customer_inbound_instruction/)
  assert.match(boundaryMigration, /Not a finance or accounts-payable purchase order/)
  assert.match(warehouseRoute, /recordRoleCode: row\.WMSPO_RecordRoleCode \?\? "customer_inbound_instruction"/)
})

test("the finance purchase-order menu no longer opens the warehouse register", () => {
  assert.match(navigation, /label: "Supplier purchase orders", value: "Planned"/)
  assert.doesNotMatch(navigation, /label: "Supplier purchase orders"[^\n]*route: "\/warehouse\/purchase-orders"/)
  assert.match(navigation, /label: "Customer purchase orders"[^\n]*route: "\/warehouse\/purchase-orders"/)
})

test("warehouse purchase-order values cannot feed AP, accruals or job charges", () => {
  assert.doesNotMatch(financeSubledger, /WMS_PurchaseOrders|WMS_PurchaseOrderLines/)
  assert.doesNotMatch(financeAccruals, /WMS_PurchaseOrders|WMS_PurchaseOrderLines/)
  assert.doesNotMatch(universalCharges, /WMS_PurchaseOrders|WMS_PurchaseOrderLines/)
  assert.match(universalCharges, /WMS_BillingEvents/)
})

test("warehouse UI and Dexter explain the operational boundary", () => {
  assert.match(warehouseUi, /Customer purchase orders/)
  assert.match(warehouseUi, /Values are reference-only and never enter the purchase subledger/)
  assert.match(warehouseUi, /Confirm for goods in/)
  assert.match(dexter, /never finance supplier purchase orders/)
  assert.match(dexter, /never enter the purchase subledger/)
})
