import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const client = read("multideck.client/src/lib/warehouse.ts")
const app = read("multideck.client/src/App.tsx")
const ordersWorkspace = read("multideck.client/src/components/multideck/warehouse-operations-components.tsx")
const purchaseOrdersWorkspace = read("multideck.client/src/components/multideck/warehouse-purchase-orders-workspace.tsx")
const ordersRoute = read("supabase/functions/warehouse/routes/orders.ts")
const purchaseOrdersRoute = read("supabase/functions/warehouse/routes/purchase-orders.ts")
const dashboardRoute = read("supabase/functions/warehouse/routes/dashboard.ts")
const warehouseIndex = read("supabase/functions/warehouse/index.ts")
const migration = read("supabase/migrations/20260819103000_warehouse_orders_register_paging.sql")
const benchmark = read("multideck.client/benchmarks/warehouse-orders-paging.mjs")

test("Warehouse order clients expose capped faceted page readers", () => {
  assert.match(client, /export async function listOperationalWarehouseOrdersPage/)
  assert.match(client, /export async function listWarehousePurchaseOrdersPage/)
  assert.match(client, /WarehouseFacetedRegisterPage/)
  assert.ok((client.match(/Math\.max\(1, Math\.min\(options\.limit \?\? 20, 50\)\)/g) ?? []).length >= 9)
})

test("order registers use server paging and defer their large action references", () => {
  assert.doesNotMatch(app, /warehouse-prefetch|prefetchWarehouseCollections/)
  assert.match(client, /export async function getWarehouseHeaderActions/)
  assert.match(client, /requestWarehouse<WarehouseDashboardSummary \| WarehouseDashboardSnapshot>\("\/dashboard\/summary"/)
  assert.match(ordersWorkspace, /listWarehouseFacilitiesPage/)
  assert.doesNotMatch(ordersWorkspace, /\blistOperationalWarehouseOrders\(/)
  assert.match(ordersWorkspace, /listOperationalWarehouseOrdersPage\(\{/)
  assert.match(ordersWorkspace, /pagination=\{\{ offset, limit: warehouseOrderPageSize, total, loading: pending/)
  assert.match(ordersWorkspace, /serverSorting=\{\{ value: sort/)
  assert.match(ordersWorkspace, /listWarehouseFacilitiesPage\(\{ sort: \{ id: "name", direction: "asc" \}, limit: 50, offset: 0 \}\)/)
  assert.match(ordersWorkspace, /const ensureReference = useCallback[\s\S]*getWarehouseOrderReference\(\)/)
  assert.match(ordersWorkspace, /setCreateOpen\(true\)[\s\S]*ensureReference\(\)/)

  assert.doesNotMatch(purchaseOrdersWorkspace, /\blistWarehousePurchaseOrders\(/)
  assert.match(purchaseOrdersWorkspace, /listWarehousePurchaseOrdersPage\(\{/)
  assert.match(purchaseOrdersWorkspace, /pagination=\{\{ offset, limit: purchaseOrderPageSize, total, loading: pending/)
  assert.match(purchaseOrdersWorkspace, /serverSorting=\{\{ value: sort/)
  assert.match(purchaseOrdersWorkspace, /order\.lineCount \?\? order\.lines\.length/)
  assert.doesNotMatch(purchaseOrdersWorkspace, /Promise\.all\(\[\s*reference \?\? getWarehousePurchaseOrderReference/)
})

test("Edge routes enforce actor scope and invoke only bounded read models", () => {
  assert.match(ordersRoute, /url\.searchParams\.has\("limit"\)/)
  assert.match(ordersRoute, /warehouse_edge_orders_page/)
  assert.match(ordersRoute, /p_allowed_facility_ids: facilityIds/)
  assert.match(ordersRoute, /p_allowed_org_ids: actor\.companyId \? null : Array\.from\(actor\.organisationIds\)/)
  assert.match(purchaseOrdersRoute, /requireInternal\(actor\)/)
  assert.match(purchaseOrdersRoute, /warehouse_edge_purchase_orders_page/)
  assert.match(purchaseOrdersRoute, /p_allowed_facility_ids: facilityIds/)
  assert.match(ordersRoute, /\["42883", "PGRST202"\][\s\S]*HttpError\(503, "Warehouse order paging/)
  assert.match(purchaseOrdersRoute, /\["42883", "PGRST202"\][\s\S]*HttpError\(503, "Warehouse purchase-order paging/)
  assert.match(ordersRoute, /Warehouse order lists require bounded paging/)
  assert.match(purchaseOrdersRoute, /Warehouse purchase-order lists require bounded paging/)
  assert.doesNotMatch(ordersRoute, /missing read-model function may use the rollout compatibility path/)
  assert.doesNotMatch(purchaseOrdersRoute, /missing read-model function may use the rollout compatibility path/)
  assert.match(warehouseIndex, /handleDashboard\(admin, actor, path\[1\] \?\? null, url\)/)
  assert.match(dashboardRoute, /warehouse_edge_dashboard_summary/)
  assert.match(dashboardRoute, /if \(!error\) return data \?\? \{ readyToReceive: 0, readyToDispatch: 0, stockHolds: 0 \}/)
})

test("database pages are capped, allowlist-scoped, service-role-only and read-only", () => {
  assert.match(migration, /create or replace function public\.warehouse_edge_orders_page/)
  assert.match(migration, /create or replace function public\.warehouse_edge_purchase_orders_page/)
  assert.match(migration, /create or replace function public\.warehouse_edge_dashboard_summary/)
  assert.equal((migration.match(/greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/g) ?? []).length, 2)
  assert.ok((migration.match(/= any\(p_allowed_facility_ids\)/g) ?? []).length >= 2)
  assert.match(migration, /p_allowed_org_ids is null or/)
  assert.equal((migration.match(/grant execute on function public\.warehouse_edge_.* to service_role;/g) ?? []).length, 4)
  assert.doesNotMatch(migration, /grant execute .* authenticated/)
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
  assert.match(migration, /Dexter exception:/)
})

test("orders proof uses 100,000 local-only records and no Supabase writes", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /const warmups = 2/)
  assert.match(benchmark, /const runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /@supabase|createClient|fetch\(|(?:supabase|client)\.from\(|(?:supabase|client)\.rpc\(|insert\(|upsert\(/i)
})
