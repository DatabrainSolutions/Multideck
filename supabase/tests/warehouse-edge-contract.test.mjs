import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const edgeFiles = [
  "functions/warehouse/index.ts",
  "functions/warehouse/routes/dashboard.ts",
  "functions/warehouse/routes/documents.ts",
  "functions/warehouse/routes/facilities.ts",
  "functions/warehouse/routes/inventory.ts",
  "functions/warehouse/routes/items.ts",
  "functions/warehouse/routes/locations.ts",
  "functions/warehouse/routes/orders.ts",
  "functions/warehouse/routes/portal-users.ts",
  "functions/warehouse/shared/authentication.ts",
]
const edgeSource = (await Promise.all(edgeFiles.map((file) => readFile(new URL(file, root), "utf8")))).join("\n")
const migration = await readFile(new URL("migrations/202608020001_warehouse_edge_functions.sql", root), "utf8")
const dashboardMigration = await readFile(new URL("migrations/20260802213000_warehouse_dashboard_snapshot.sql", root), "utf8")
const portalInviteFixMigration = await readFile(new URL("migrations/20260804100000_fix_warehouse_customer_invites.sql", root), "utf8")
const baseline = await readFile(new URL("baseline/public-schema.sql", root), "utf8")
const clientSource = await readFile(new URL("../multideck.client/src/lib/warehouse.ts", root), "utf8")

test("warehouse client uses the tenant Supabase Edge Function as its only backend", () => {
  assert.match(clientSource, /supabaseFunctionsUrl.*warehouse/s)
  assert.doesNotMatch(clientSource, /apiFetch\(/)
  assert.doesNotMatch(clientSource, /\/api\/v1\/warehouse/)
  for (const route of ["/facilities", "/items", "/inventory", "/orders", "/portal"]) {
    assert.match(clientSource, new RegExp(`Warehouse[^\\n]*|${route.replace("/", "\\/")}`))
  }
})

test("warehouse Edge Function covers every former controller area", () => {
  for (const area of ["facilities", "locations", "items", "inventory", "orders", "documents", "portal"]) {
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

test("warehouse runtime targets the current WMS schema", () => {
  for (const table of [
    "WMS_Facilities",
    "WMS_Locations",
    "WMS_InventoryBalances",
    "WMS_InventoryTransactions",
    "WMS_Documents",
  ]) {
    assert.match(edgeSource, new RegExp(table))
  }
  assert.doesNotMatch(edgeSource, /Org_Master"\)\.select\("Org_ID/)
  assert.match(edgeSource, /Org_Master"\)\.select\("Org_id,Org_Name"/)
})

test("warehouse dashboard loads through one aggregated database call", () => {
  assert.match(clientSource, /requestWarehouse<WarehouseDashboardSnapshot>\("\/dashboard", "GET"\)/)
  assert.doesNotMatch(clientSource, /const \[orders, balances, movements\] = await Promise\.all/)
  assert.match(edgeSource, /rpc\("warehouse_edge_dashboard"/)
  assert.match(dashboardMigration, /create or replace function public\.warehouse_edge_dashboard/)
  assert.match(dashboardMigration, /revoke all on function public\.warehouse_edge_dashboard[\s\S]*from public, anon, authenticated/)
  assert.match(dashboardMigration, /grant execute on function public\.warehouse_edge_dashboard[\s\S]*to service_role/)
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
})
