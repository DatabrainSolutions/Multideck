import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, warehouseAuth, warehousePortal, warehouseFacilities, warehouseDocuments, warehouseOrders, dexter, dexterSecurity, ocr, rateImport, mobileAuth, mobileApp, mobilePackage] = await Promise.all([
  read("migrations/20260830230000_security_scan_high_risk_hardening.sql"),
  read("functions/warehouse/shared/authentication.ts"),
  read("functions/warehouse/routes/portal-users.ts"),
  read("functions/warehouse/routes/facilities.ts"),
  read("functions/warehouse/routes/documents.ts"),
  read("functions/warehouse/routes/orders.ts"),
  read("functions/agent-dexter/index.ts"),
  read("functions/agent-dexter/security.ts"),
  read("functions/customs-invoice-ocr/index.ts"),
  read("../multideck.client/src/lib/rate-import-parser.ts"),
  read("../multideck.mobile/src/auth/supabase.ts"),
  read("../multideck.mobile/app.json"),
  read("../multideck.mobile/package.json"),
])

test("public views default to caller RLS and expose only reviewed browser views", () => {
  assert.match(migration, /alter view %I\.%I set \(security_invoker = true\)/)
  assert.match(migration, /revoke all privileges on table %I\.%I from public, anon, authenticated/)
  assert.match(migration, /grant select on table %I\.%I to service_role/)
  assert.match(migration, /grant select on table public\."sys_CustomsOptionCatalogue" to authenticated/)
  assert.match(migration, /grant select on table public\."App_Live_Bookings" to authenticated/)
  assert.match(migration, /grant select on table public\."App_Live_Quotes" to authenticated/)
  assert.doesNotMatch(migration, /grant select on table %I\.%I to authenticated/)
})

test("warehouse internal access requires active roles and assigned offices", () => {
  assert.match(warehouseAuth, /User_AccessStatus/)
  assert.match(warehouseAuth, /permissionValues\(admin, internal\.User_ID\)/)
  assert.match(warehouseAuth, /permissions\.has\("Warehouse\.Read"\)/)
  assert.match(warehouseAuth, /permissions\.has\("Warehouse\.Write"\)/)
  assert.match(warehouseAuth, /cmp_Users_Offices/)
  assert.match(warehouseFacilities, /companyOfficeIds\(admin, actor\)/)
  assert.match(warehousePortal, /requireInternalPermission\(actor, "Users\.Read"\)/)
  assert.match(warehousePortal, /requireInternalCustomerScope/)
  assert.match(warehouseAuth, /const manageableOrganisationIds = new Set/)
  assert.match(warehouseAuth, /const customerFacilityPairs = new Set/)
  assert.match(warehouseAuth, /const scopeIsCartesian/)
  assert.match(warehouseAuth, /customerFacilityPairs\.has\(customerFacilityPair\(orgId, facilityId\)\)/)
  assert.match(warehousePortal, /actor\.manageableOrganisationIds\.has\(customerOrgId\)/)
  assert.match(warehousePortal, /actor\.manageableOrganisationIds\.has\(targetCustomerOrgId\)/)
  assert.match(warehouseDocuments, /if \(isReview \|\| isUpload\) requireInternalWarehouseWrite\(actor\)/)
  assert.match(warehouseDocuments, /else requireInternalWarehouseRead\(actor\)/)
  assert.match(warehouseOrders, /else \{\s*requireInternalWarehouseWrite\(actor\)/)
})

test("Dexter binds every nested identifier and always prepares purchase orders for approval", () => {
  assert.match(dexterSecurity, /function actionTargetIds/)
  assert.match(dexterSecurity, /Object\.entries\(value as JsonObject\)/)
  assert.match(dexterSecurity, /proposedTargetIds\.some/)
  assert.match(dexter, /requiresExplicitActionApproval\(action\.code, accessMode\)/)
  assert.match(dexter, /function purchaseOrderActionChanges/)
  assert.match(dexter, /const lineChanges = lines\.map/)
  assert.match(dexter, /return \[\.\.\.header, \.\.\.lineChanges\]/)
  assert.match(dexter, /multideck_dexter_approve_prepared_action/)
  assert.match(migration, /AIDexterAction_AlwaysRequiresApproval/)
  assert.match(migration, /AIDexterPrepared_ApprovedAt/)
  assert.match(migration, /multideck_dexter_action_target_ids/)
  assert.match(migration, /v_key ~\* '\(\^\|_\)\(id\|ids\)\$'/)
  assert.match(migration, /TR_AI_DexterPreparedActions_intent_guard/)
  assert.match(migration, /TR_AI_DexterPreparedActions_mandatory_approval/)
})

test("OCR, spreadsheet imports and mobile sessions enforce their local safety boundaries", () => {
  assert.ok(ocr.indexOf('requirePermission(admin, actor.userId, "Customs.Write")') < ocr.indexOf("cleanupExpiredPreparedPdfs(admin)"))
  assert.match(rateImport, /maximumExpandedBytes = 32 \* 1024 \* 1024/)
  assert.match(rateImport, /maximumCompressionRatio = 200/)
  assert.match(rateImport, /filter: \(entry\) =>/)
  assert.match(mobileAuth, /expo-secure-store/)
  assert.match(mobileAuth, /AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/)
  assert.match(mobileAuth, /AsyncStorage\.removeItem\(key\)/)
  assert.match(mobileApp, /expo-secure-store/)
  assert.match(mobilePackage, /"expo-secure-store": "~15\.0\.8"/)
})
