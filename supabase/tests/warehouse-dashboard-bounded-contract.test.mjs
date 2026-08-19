import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const client = read("multideck.client/src/lib/warehouse.ts")
const page = read("multideck.client/src/pages/warehouse-page.tsx")
const calendar = read("multideck.client/src/components/multideck/warehouse-components.tsx")
const route = read("supabase/functions/warehouse/routes/dashboard.ts")
const migration = read("supabase/migrations/20260819103000_warehouse_orders_register_paging.sql")
const benchmark = read("multideck.client/benchmarks/warehouse-dashboard-bounded.mjs")

test("dashboard and calendar request purpose-sized reads", () => {
  assert.match(client, /getWarehouseDashboardSnapshot\(options: \{ mode\?: "overview" \| "calendar"/)
  assert.match(client, /`\/dashboard\$\{toQuery\(options\)\}`/)
  assert.match(page, /getWarehouseWorkspaceData\(language, \{ mode: "overview" \}\)/)
  assert.match(page, /getWarehouseWorkspaceData\(language, \{ mode: "calendar", start: calendarRange\.start, end: calendarRange\.end \}\)/)
  assert.match(page, /const \[calendarData, setCalendarData\]/)
  assert.match(calendar, /onRangeChange\?: \(range: \{ start: string; end: string \}\) => void/)
  assert.match(calendar, /total > events\.length/)
})

test("dashboard route composes bounded summary, five orders and fifty movements", () => {
  assert.match(route, /mode === "overview" \|\| mode === "calendar"/)
  assert.match(route, /warehouse_edge_dashboard_summary/)
  assert.match(route, /warehouse_edge_orders_page/)
  assert.match(route, /p_sort: "expected"/)
  assert.match(route, /p_limit: 5/)
  assert.match(route, /warehouse_edge_inventory_page/)
  assert.match(route, /p_mode: "movements"/)
  assert.match(route, /p_limit: 50/)
  assert.match(route, /warehouse_edge_calendar_page/)
  assert.match(route, /durationDays < 1 \|\| durationDays > 45/)
  assert.match(route, /missingReadModel/)
  assert.match(route, /Warehouse dashboard paging is still being prepared/)
  assert.match(route, /Choose a bounded warehouse dashboard mode/)
  assert.doesNotMatch(route, /admin\.rpc\("warehouse_edge_dashboard"/)
  assert.doesNotMatch(client, /response\.orders\.filter/)
})

test("calendar and summary read models remain scoped, capped and read-only", () => {
  assert.match(migration, /create or replace function public\.warehouse_edge_dashboard_summary/)
  assert.match(migration, /create or replace function public\.warehouse_edge_calendar_page/)
  assert.match(migration, /least\(coalesce\(p_limit, 500\), 500\)/)
  assert.match(migration, /p_allowed_org_ids is null or warehouse_order\."WMSOrder_CustomerOrgID" = any\(p_allowed_org_ids\)/)
  assert.match(migration, /v_end date := least\([\s\S]*\+ 45\)/)
  assert.match(migration, /grant execute on function public\.warehouse_edge_calendar_page[\s\S]*to service_role/)
  assert.doesNotMatch(migration, /grant execute .* authenticated/)
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)
})

test("dashboard proof uses a 100,000-record source and no Supabase writes", () => {
  assert.match(benchmark, /const recordCount = 100_000/)
  assert.match(benchmark, /const legacyOrderLimit = 500/)
  assert.match(benchmark, /const warmups = 2/)
  assert.match(benchmark, /const runs = 9/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /@supabase|createClient|fetch\(|(?:supabase|client)\.from\(|(?:supabase|client)\.rpc\(|insert\(|upsert\(/i)
})
