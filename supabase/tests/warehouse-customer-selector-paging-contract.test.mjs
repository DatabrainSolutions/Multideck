import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(new URL("../functions/warehouse/routes/items.ts", import.meta.url), "utf8")
const api = readFileSync(new URL("../../multideck.client/src/lib/warehouse.ts", import.meta.url), "utf8")
const ui = readFileSync(new URL("../../multideck.client/src/components/multideck/warehouse-management-components.tsx", import.meta.url), "utf8")
const migration = readFileSync(new URL("../migrations/20260819115000_warehouse_customer_selector_search.sql", import.meta.url), "utf8")
const benchmark = readFileSync(new URL("../../multideck.client/benchmarks/warehouse-customer-selector-paging.mjs", import.meta.url), "utf8")

test("Warehouse customer lookup is an exact capped server page", () => {
  assert.match(route, /path\[2\] === "customers"/)
  assert.match(route, /const \{ limit, offset \} = boundedPage\(url\)/)
  assert.match(route, /select\("Org_id,Org_Name", \{ count: "exact" \}\)/)
  assert.match(route, /\.range\(offset, offset \+ limit - 1\)/)
  assert.match(route, /hasMore: offset \+ limit < total/)
})

test("customer lookup retains internal and portal organisation boundaries", () => {
  assert.match(route, /requireCapability\(actor, "warehouse_items:read"\)/)
  assert.match(route, /if \(!actor\.companyId && actor\.organisationIds\.size === 0\)/)
  assert.match(route, /query = query\.in\("Org_id", \[\.\.\.actor\.organisationIds\]\)/)
})

test("both item actions use debounced server search without an unbounded compatibility adapter", () => {
  assert.equal((ui.match(/listWarehouseItemCustomersPage\(\{ search: customerSearch, limit: 25, offset: 0 \}\)/g) ?? []).length, 2)
  assert.match(ui, /window\.setTimeout\(\(\) => \{[\s\S]*listWarehouseItemCustomersPage/)
  assert.match(api, /requestWarehouse<WarehouseRegisterPage<\{ id: string; name: string \}>>/)
  assert.doesNotMatch(api, /customers\.slice\(offset, offset \+ limit\)|older Warehouse Edge/)
})

test("literal customer search has a matching trigram index", () => {
  assert.match(migration, /create extension if not exists pg_trgm/)
  assert.match(migration, /IX_Org_Master_WarehouseCustomerNameSearch/)
  assert.match(migration, /lower\(coalesce\("Org_Name", ''\)\) extensions\.gin_trgm_ops/)
})

test("the 100,000-customer proof fixture is local-only", () => {
  assert.match(benchmark, /customersCount = 100_000/)
  assert.match(benchmark, /pageSize = 25/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /supabase-js|\.insert\(|\.upsert\(/)
})
