import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const edgeFiles = [
  "functions/warehouse/index.ts",
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
})

test("the Edge Function authenticates users and resolves internal or portal scope before using the service role", () => {
  assert.match(edgeSource, /userDb\.auth\.getUser\(\)/)
  assert.match(edgeSource, /Portal_ExternalIdentities/)
  assert.match(edgeSource, /WMS_CustomerFacilityAccess/)
  assert.match(edgeSource, /requireCapability/)
})
