import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/items.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-management-components.tsx", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-item-reference-load.mjs", import.meta.url), "utf8")

test("Warehouse Items initial reference reads facilities without scanning customers", () => {
  const leanBranch = route.indexOf('url.searchParams.get("scope") === "facilities"')
  assert.ok(leanBranch >= 0)
  assert.doesNotMatch(route, /itemReferenceContext|itemContext/)
  assert.match(route, /customers:\s*\[\]/)
  assert.match(route, /customersDeferred:\s*true/)
  assert.match(route, /\.select\("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name"\)/)
})

test("the client requests a lean register reference and bounded action customers", () => {
  assert.match(api, /getWarehouseItemReference\(\)[\s\S]*\/items\/reference\?scope=facilities/)
  assert.match(ui, /getWarehouseItemReference\(\)/)
  assert.doesNotMatch(api, /scope: options\.includeCustomers|"full"/)
  assert.match(api, /listWarehouseItemCustomersPage/)
  assert.match(ui, /listWarehouseItemCustomersPage\(\{ search: customerSearch, limit: 25, offset: 0 \}\)/)
})

test("create and import open immediately and search customers after opening", () => {
  assert.match(ui, /function openCreate\(\)[\s\S]*setDialogOpen\(true\)/)
  assert.match(ui, /function openImport\(\)[\s\S]*setImportOpen\(true\)/)
  assert.match(ui, /if \(!open \|\| isEditing\) return/)
  assert.match(ui, /if \(!open\) return[\s\S]*listWarehouseItemCustomersPage/)
})

test("the scale fixture is synthetic and performs no Supabase writes", () => {
  assert.match(benchmark, /customersCount = 100_000/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
