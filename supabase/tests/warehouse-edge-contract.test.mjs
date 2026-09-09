import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const edgeFiles = [
  "functions/warehouse/index.ts",
  "functions/warehouse/routes/dashboard.ts",
  "functions/warehouse/routes/documents.ts",
  "functions/warehouse/routes/facilities.ts",
  "functions/warehouse/routes/inventory.ts",
  "functions/warehouse/routes/inventory-actions.ts",
  "functions/warehouse/routes/handling-units.ts",
  "functions/warehouse/routes/items.ts",
  "functions/warehouse/routes/locations.ts",
  "functions/warehouse/routes/orders.ts",
  "functions/warehouse/routes/purchase-orders.ts",
  "functions/warehouse/routes/portal-users.ts",
  "functions/warehouse/shared/authentication.ts",
]
const edgeSource = (await Promise.all(edgeFiles.map((file) => readFile(new URL(file, root), "utf8")))).join("\n")
const migration = await readFile(new URL("migrations/202608020001_warehouse_edge_functions.sql", root), "utf8")
const dashboardMigration = await readFile(new URL("migrations/20260802213000_warehouse_dashboard_snapshot.sql", root), "utf8")
const ordersPagingMigration = await readFile(new URL("migrations/20260819103000_warehouse_orders_register_paging.sql", root), "utf8")
const portalInviteFixMigration = await readFile(new URL("migrations/20260804100000_fix_warehouse_customer_invites.sql", root), "utf8")
const portalAccessLinkAuditMigration = await readFile(new URL("migrations/20260804110000_warehouse_portal_access_link_audit.sql", root), "utf8")
const portalRoleReactivationMigration = await readFile(new URL("migrations/20260804120000_fix_warehouse_portal_role_reactivation.sql", root), "utf8")
const inventoryHandlingMigration = await readFile(new URL("migrations/20260804160000_warehouse_inventory_handling_units.sql", root), "utf8")
const inventoryDexterMigration = await readFile(new URL("migrations/20260804161000_warehouse_inventory_dexter_parity.sql", root), "utf8")
const rescheduleMigration = await readFile(new URL("migrations/20260808090000_warehouse_order_reschedule.sql", root), "utf8")
const purchaseOrderMigration = await readFile(new URL("migrations/20260805100500_warehouse_purchase_orders.sql", root), "utf8")
const optionalPurchaseOrderSupplierMigration = await readFile(new URL("migrations/20260812143000_optional_purchase_order_supplier.sql", root), "utf8")
const fullWarehouseCapabilitiesMigration = await readFile(new URL("migrations/20260811145223_dexter_full_warehouse_capabilities.sql", root), "utf8")
const baseline = await readFile(new URL("baseline/public-schema.sql", root), "utf8")
const clientSource = await readFile(new URL("../multideck.client/src/lib/warehouse.ts", root), "utf8")
const orderSource = await readFile(new URL("functions/warehouse/routes/orders.ts", root), "utf8")
const httpSource = await readFile(new URL("functions/warehouse/shared/http.ts", root), "utf8")
const portalSource = await readFile(new URL("functions/warehouse/routes/portal-users.ts", root), "utf8")

test("purchase orders keep a unique, atomic migration version", async () => {
  const migrationFiles = await readdir(new URL("migrations/", root))
  assert.deepEqual(migrationFiles.filter((file) => file.startsWith("20260805100500_")), ["20260805100500_warehouse_purchase_orders.sql"])
  assert.match(purchaseOrderMigration, /^--[^\n]*\n(?:--[^\n]*\n)*\s*begin;/i)
  assert.match(purchaseOrderMigration, /commit;\s*$/i)
})

test("warehouse client uses the tenant Supabase Edge Function as its only backend", () => {
  assert.match(clientSource, /supabaseFunctionsUrl.*warehouse/s)
  assert.doesNotMatch(clientSource, /apiFetch\(/)
  assert.doesNotMatch(clientSource, /\/api\/v1\/warehouse/)
  for (const route of ["/facilities", "/items", "/inventory", "/handling-units", "/orders", "/purchase-orders", "/portal"]) {
    assert.match(clientSource, new RegExp(`Warehouse[^\\n]*|${route.replace("/", "\\/")}`))
  }
})

test("warehouse Edge Function covers every former controller area", () => {
  for (const area of ["facilities", "locations", "items", "inventory", "orders", "purchaseOrders", "documents", "portal"]) {
    assert.match(edgeSource, new RegExp(`handle${area[0].toUpperCase()}${area.slice(1)}`))
  }
  for (const operation of ["reference", "import", "movements", "receive", "dispatch", "cancel", "review", "download", "invitations"]) {
    assert.match(edgeSource, new RegExp(`["]${operation}["]`))
  }
})

test("stock-changing order operations use a service-role-only database transaction", () => {
  assert.match(edgeSource, /rpc\("warehouse_edge_order_mutation"/)
  assert.match(migration, /create or replace function public\.warehouse_edge_order_mutation/)
  assert.match(migration, /revoke all on function public\.warehouse_edge_order_mutation[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_order_mutation[\s\S]*to service_role/)
})

test("calendar rescheduling accepts every Postgres UUID shape and persists through the secured order mutation", () => {
  assert.match(orderSource, /path\[2\] === "reschedule"/)
  assert.match(rescheduleMigration, /if p_action = 'reschedule'/)
  assert.match(baseline, /if p_action = 'reschedule'/)
  assert.match(httpSource, /\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}/)
  assert.doesNotMatch(httpSource, /\[1-5\]\[0-9a-f\]\{3\}/)
  assert.doesNotMatch(httpSource, /\[89ab\]\[0-9a-f\]\{3\}/)
})

test("non-final warehouse order details can be edited only through the scoped service procedure", () => {
  assert.match(orderSource, /request\.method === "PUT" && orderId && path\.length === 2 \? "update"/)
  assert.match(orderSource, /rpc\("warehouse_edge_update_order_mutation"/)
  assert.match(fullWarehouseCapabilitiesMigration, /create or replace function public\.warehouse_edge_update_order_mutation/)
  assert.match(fullWarehouseCapabilitiesMigration, /"WMSOrder_StatusCode" in \('complete', 'cancelled'\)/)
  assert.match(fullWarehouseCapabilitiesMigration, /"WMSOrder_FacilityID" = any\(p_allowed_facility_ids\)/)
  assert.match(fullWarehouseCapabilitiesMigration, /"WMSOrder_CustomerOrgID" = any\(p_allowed_organisation_ids\)/)
  assert.match(fullWarehouseCapabilitiesMigration, /revoke all on function public\.warehouse_edge_update_order_mutation[\s\S]*from public, anon, authenticated/)
  assert.match(fullWarehouseCapabilitiesMigration, /grant execute on function public\.warehouse_edge_update_order_mutation[\s\S]*to service_role/)
})

test("all new inventory changes enter through the Warehouse Edge Function and service-only atomic procedures", () => {
  for (const action of ["create_hu", "move_balance", "move_hu", "consolidate", "change_status", "sample", "report_empty", "resolve_location_exception"]) {
    assert.match(edgeSource, new RegExp(`"${action}"`))
  }
  assert.match(edgeSource, /rpc\("warehouse_edge_inventory_mutation"/)
  assert.match(orderSource, /rpc\("warehouse_edge_receive_mutation"/)
  for (const procedure of ["warehouse_edge_inventory_mutation", "warehouse_edge_receive_mutation"]) {
    assert.match(inventoryHandlingMigration, new RegExp(`create or replace function public\\.${procedure}`))
    assert.match(inventoryHandlingMigration, new RegExp(`revoke all on function public\\.${procedure}[\\s\\S]*from public,\\s*anon,\\s*authenticated`))
    assert.match(inventoryHandlingMigration, new RegExp(`grant execute on function public\\.${procedure}[\\s\\S]*to service_role`))
  }
  assert.doesNotMatch(clientSource, /\.from\(["']WMS_/)
  assert.doesNotMatch(clientSource, /\.rpc\(["']warehouse_edge_/)
})

test("quantity, handling-unit and exception invariants are enforced in the database transaction", () => {
  for (const field of ["WMSItem_QuantityBasisCode", "WMSItem_MinimumMovementQuantity", "WMSHU_LifecycleStatusCode", "WMSTransaction_MovementGroupID", "WMSException_ExpectedLocationID"]) {
    assert.match(inventoryHandlingMigration, new RegExp(field))
    assert.match(baseline, new RegExp(field))
  }
  for (const invariant of ["location_empty", "SYSTEM-UNLOCATED", "pending_approval", "A different warehouse user must approve", "pallet_consolidation", "sample_withdrawal", "location_override"]) {
    assert.match(inventoryHandlingMigration, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
  }
  assert.match(inventoryHandlingMigration, /WMS_InventoryOperations/)
  assert.match(inventoryHandlingMigration, /_warehouse_edge_validate_quantity/)
  assert.match(inventoryHandlingMigration, /This counted product must move in whole units/)
  assert.match(baseline, /WMS_InventoryOperations/)
})

test("receiving distinguishes present damage from missing quantity and can create a pallet atomically", () => {
  assert.match(inventoryHandlingMigration, /newHandlingUnit/)
  assert.match(inventoryHandlingMigration, /missingQuantity/)
  assert.match(inventoryHandlingMigration, /stock_shortage/)
  assert.match(clientSource, /newHandlingUnit/)
  assert.match(clientSource, /missingQuantity/)
})

test("Dexter can read and watch quantity-aware stock while physical writes stay allowlisted", () => {
  assert.match(inventoryDexterMigration, /handlingUnitCode/)
  assert.match(inventoryDexterMigration, /locationCode/)
  assert.match(inventoryDexterMigration, /TR_WMS_InventoryTransactions_dexter_watch/)
  assert.match(inventoryDexterMigration, /TR_WMS_HandlingUnitEvents_dexter_watch/)
  assert.match(inventoryDexterMigration, /quarantine_inventory/)
  assert.match(inventoryDexterMigration, /must be completed through the Warehouse Edge Function/)
})

test("purchase orders save header and lines atomically and can create real inbound work", () => {
  for (const table of ["WMS_PurchaseOrders", "WMS_PurchaseOrderLines", "WMS_PurchaseOrderEvents"]) {
    assert.match(purchaseOrderMigration, new RegExp(table))
    assert.match(baseline, new RegExp(table))
  }
  assert.match(edgeSource, /rpc\("warehouse_edge_purchase_order_mutation"/)
  assert.match(purchaseOrderMigration, /create or replace function public\.warehouse_edge_purchase_order_mutation/)
  assert.match(purchaseOrderMigration, /revoke all on function public\.warehouse_edge_purchase_order_mutation[\s\S]*from public,anon,authenticated/)
  assert.match(purchaseOrderMigration, /grant execute on function public\.warehouse_edge_purchase_order_mutation[\s\S]*to service_role/)
  assert.match(purchaseOrderMigration, /Match every line to a warehouse item before issuing/i)
  assert.match(purchaseOrderMigration, /'create_inbound'/)
  assert.match(purchaseOrderMigration, /purchaseOrderLineId/)
  assert.doesNotMatch(clientSource, /\.from\(["']WMS_Purchase/)
})

test("purchase order numbers can be generated against the selected warehouse database", () => {
  assert.match(edgeSource, /path\[1\] === "next-number"/)
  assert.match(edgeSource, /WMSPO_FacilityID/)
  assert.match(edgeSource, /WMSPO_Number/)
  assert.match(clientSource, /getNextWarehousePurchaseOrderNumber/)
})

test("purchase order supplier remains optional free text across UI, database and Dexter", () => {
  assert.doesNotMatch(purchaseOrderMigration, /Enter the supplier name/u)
  assert.match(optionalPurchaseOrderSupplierMigration, /supplier_name/u)
  assert.match(optionalPurchaseOrderSupplierMigration, /supplier_org_id/u)
  assert.doesNotMatch(purchaseOrderMigration, /"required":\[[^\]]*"supplier_name"/u)
})

test("purchase orders have Dexter read, approval-safe write and event-driven watch parity", () => {
  assert.match(purchaseOrderMigration, /multideck_dexter_domain_purchase_orders/)
  assert.match(purchaseOrderMigration, /create_purchase_order/)
  assert.match(purchaseOrderMigration, /must be completed through the Warehouse Edge Function/)
  assert.match(purchaseOrderMigration, /TR_WMS_PurchaseOrders_dexter_watch/)
  assert.match(purchaseOrderMigration, /AI_DexterWatchSignals/)
  assert.doesNotMatch(purchaseOrderMigration, /cron|http|llm/i)
})

test("warehouse runtime targets the current WMS schema", () => {
  for (const table of [
    "WMS_Facilities",
    "WMS_Locations",
    "WMS_InventoryBalances",
    "WMS_Documents",
  ]) {
    assert.match(edgeSource, new RegExp(table))
  }
  assert.doesNotMatch(edgeSource, /Org_Master"\)\.select\("Org_ID/)
  assert.match(edgeSource, /Org_Master"\)\.select\("Org_id,Org_Name"/)
  assert.match(edgeSource, /rpc\("warehouse_edge_inventory_page"/)
})

test("warehouse dashboard loads through small bounded database read models", () => {
  assert.match(clientSource, /requestWarehouse<WarehouseDashboardSnapshot>\(`\/dashboard\$\{toQuery\(options\)\}`, "GET"\)/)
  assert.doesNotMatch(clientSource, /const \[orders, balances, movements\] = await Promise\.all/)
  assert.match(edgeSource, /rpc\("warehouse_edge_dashboard_summary"/)
  assert.match(edgeSource, /rpc\("warehouse_edge_orders_page"[\s\S]*p_limit: 5/)
  assert.match(edgeSource, /rpc\("warehouse_edge_inventory_page"[\s\S]*p_limit: 50/)
  assert.match(edgeSource, /rpc\("warehouse_edge_calendar_page"[\s\S]*p_limit: 500/)
  assert.doesNotMatch(edgeSource, /rpc\("warehouse_edge_dashboard"/)
  assert.match(dashboardMigration, /create or replace function public\.warehouse_edge_dashboard/)
  assert.match(ordersPagingMigration, /create or replace function public\.warehouse_edge_dashboard_summary/)
  assert.match(ordersPagingMigration, /revoke all on function public\.warehouse_edge_dashboard_summary[\s\S]*from public, anon, authenticated/)
  assert.match(ordersPagingMigration, /grant execute on function public\.warehouse_edge_dashboard_summary[\s\S]*to service_role/)
})

test("the Edge Function authenticates users and resolves internal or portal scope before using the service role", () => {
  assert.match(edgeSource, /userDb\.auth\.getUser\(\)/)
  assert.match(edgeSource, /import \{ many, one, oneOrNull \} from "\.\/database\.ts"/)
  assert.match(edgeSource, /Portal_ExternalIdentities/)
  assert.match(edgeSource, /WMS_CustomerFacilityAccess/)
  assert.match(edgeSource, /requireCapability/)
})

test("warehouse customer invitations use the complete portal organisation conflict key", () => {
  const conflictKey = /on conflict \("PortalUserOrg_PortalUserID","PortalUserOrg_OrgID","PortalUserOrg_AudienceTypeCode"\)/
  assert.match(
    baseline,
    /ADD CONSTRAINT "Portal_UserOrganisations_unique_org" UNIQUE \("PortalUserOrg_PortalUserID", "PortalUserOrg_OrgID", "PortalUserOrg_AudienceTypeCode"\)/,
  )
  assert.match(baseline, conflictKey)
  assert.match(
    portalInviteFixMigration,
    conflictKey,
  )
  assert.doesNotMatch(
    portalInviteFixMigration,
    /on conflict \("PortalUserOrg_PortalUserID","PortalUserOrg_OrgID"\) do update/,
  )
})

test("warehouse customer invitation retries recover an existing Supabase Auth identity", () => {
  assert.match(edgeSource, /rpc\("warehouse_edge_auth_user_id_by_email"/)
  assert.match(portalInviteFixMigration, /create or replace function public\.warehouse_edge_auth_user_id_by_email/)
  assert.match(
    portalInviteFixMigration,
    /revoke all on function public\.warehouse_edge_auth_user_id_by_email\(text\) from public,anon,authenticated/,
  )
  assert.match(
    portalInviteFixMigration,
    /grant execute on function public\.warehouse_edge_auth_user_id_by_email\(text\) to service_role/,
  )
  assert.match(portalSource, /shouldDeliverAccessLink = true/)
  assert.match(portalSource, /action === "invite" && shouldDeliverAccessLink && inviteEmail && data\?\.user\?\.id/)
  assert.match(portalSource, /await deliverPortalAccessLink\(admin, actor, targetCustomerOrgId, data\.user\.id, inviteEmail\)/)
})

test("warehouse customer roles reactivate after revocation without duplicate keys", () => {
  const roleConflict = /on conflict on constraint "Portal_UserRoles_unique_role" do update set/
  assert.match(portalRoleReactivationMigration, roleConflict)
  assert.match(portalRoleReactivationMigration, /"PortalUserRole_StatusCode"='active'/)
  assert.match(portalRoleReactivationMigration, /"PortalUserRole_ValidUntil"=null/)
  assert.match(baseline, roleConflict)
})

test("warehouse portal access loads only its bounded facility catalogue", () => {
  assert.doesNotMatch(orderSource, /orderContext|loadOrders/)
  assert.doesNotMatch(portalSource, /import \{ orderContext \}/)
  assert.match(portalSource, /companyFacilityIds\(admin, actor\)/)
  assert.match(portalSource, /select\("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name"\)/)
  assert.doesNotMatch(portalSource, /Org_Master|WMS_Items|WMS_Locations/)
})

test("warehouse customer access links are tenant-scoped, invite-only, and audited", () => {
  assert.match(edgeSource, /path\[5\] === "access-link"/)
  assert.match(edgeSource, /actor\.manageableOrganisationIds\.has\(targetCustomerOrgId\)/)
  assert.match(edgeSource, /PortalAudit_EventTypeCode: "access_link_delivery"/)
  assert.match(edgeSource, /signInWithOtp/)
  assert.match(edgeSource, /shouldCreateUser: false/)
  assert.match(portalAccessLinkAuditMigration, /'access_link_delivery'/)
  assert.match(clientSource, /sendWarehousePortalAccessLink/)
})
