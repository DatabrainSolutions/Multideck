import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")
const migration = read("supabase/migrations/20260818223000_dashboard_overview_read_model.sql")
const api = read("multideck.client/src/lib/dashboard-api.ts")
const page = read("multideck.client/src/pages/overview-page.tsx")

test("Overview uses authenticated RLS-preserving reads with a hard 50-row boundary", () => {
  assert.match(migration, /multideck_dashboard_overview/)
  assert.match(migration, /multideck_dashboard_drilldown_page/)
  assert.equal((migration.match(/security invoker/g) ?? []).length, 2)
  assert.equal((migration.match(/if auth\.uid\(\) is null/g) ?? []).length, 2)
  assert.equal((migration.match(/least\(coalesce\([^,]+, 50\), 50\)/g) ?? []).length, 2)
  assert.match(migration, /limit v_limit \+ 1/)
  assert.doesNotMatch(migration, /security definer/)
  assert.doesNotMatch(migration, /insert into|update public\.|delete from public\./i)
})

test("the dashboard response keeps exact totals while bounding both ownership scopes", () => {
  for (const field of ["activeJobs", "exceptions", "openQuotes", "readyQuotes", "totalQuotes", "priority", "priorityMine", "liveBookings"]) {
    assert.match(migration, new RegExp(`'${field}'`))
  }
  assert.match(migration, /priority_page as materialized/)
  assert.match(migration, /priority_mine_page as materialized/)
  assert.match(migration, /'priorityItems'/)
  assert.match(migration, /'priorityMineItems'/)
  assert.match(migration, /'clockQueues'/)
  assert.match(migration, /'modeDefinitions'/)
  assert.match(migration, /'statusCounts'/)
  assert.match(migration, /'quoteStages'/)
})

test("metric and region drilldowns use a stable keyset cursor and retain the full total", () => {
  assert.match(migration, /\(sort_at, row_key\) < \(p_cursor_sort_at, p_cursor_row_key\)/)
  assert.match(migration, /order by sort_at desc nulls last, row_key desc/)
  assert.match(migration, /'total', \(select count\(\*\) from eligible\)/)
  assert.match(migration, /'nextCursor'/)
  assert.match(migration, /Choose a valid dashboard operating region/)
})

test("the Overview page no longer downloads complete bookings and quotes registers", () => {
  assert.doesNotMatch(page, /\blistLiveBookings\(/)
  assert.doesNotMatch(page, /\blistSalesQuotes\(/)
  assert.match(page, /loadDashboardOverview\(range, customRange/)
  assert.match(page, /loadDashboardDrilldownPage/)
  assert.match(page, /Load 50 more/)
  assert.match(api, /readCachedRegisterPage\(session\.user\.id, resource/)
  assert.match(api, /p_row_limit: 50/)
  assert.match(api, /p_limit: 50/)
})

test("only authenticated roles can execute the dashboard functions", () => {
  assert.match(migration, /revoke all on function public\.multideck_dashboard_overview[\s\S]*from public, anon/)
  assert.match(migration, /revoke all on function public\.multideck_dashboard_drilldown_page[\s\S]*from public, anon/)
  assert.match(migration, /grant execute on function public\.multideck_dashboard_overview[\s\S]*to authenticated, service_role/)
  assert.match(migration, /grant execute on function public\.multideck_dashboard_drilldown_page[\s\S]*to authenticated, service_role/)
})

test("a staggered frontend and database rollout falls back without hiding genuine dashboard errors", () => {
  assert.match(api, /missingDashboardReadModel/)
  assert.match(api, /message\.includes\("pgrst202"\)/)
  assert.match(api, /loadLegacyDashboardOverview\(range, currentOperator, customRange, requestSignal\)/)
  assert.match(api, /loadLegacyDashboardDrilldown\(input, requestSignal\)/)
  assert.match(api, /if \(missingDashboardReadModel\(error\)\)/)
  assert.doesNotMatch(api, /catch \{\s*return loadLegacyDashboard/)
  assert.match(api, /listLiveBookingsCompatibilitySample\(signal\)/)
  assert.match(api, /listSalesQuotesCompatibilitySample\(signal\)/)
  assert.match(api, /const dashboardCompatibilityLimit = 50/)
  assert.match(api, /bookings\.length > dashboardCompatibilityLimit/)
  assert.match(api, /quotes\.length > dashboardCompatibilityLimit/)
  assert.doesNotMatch(api, /\blistLiveBookings\(/)
  assert.doesNotMatch(api, /\blistSalesQuotes\(/)
})

test("the compatibility bridge is independently capped and selects only dashboard fields", () => {
  const bookings = read("multideck.client/src/lib/application-data-api.ts")
  const quotes = read("multideck.client/src/lib/quote-api.ts")
  assert.match(bookings, /listLiveBookingsCompatibilitySample/)
  assert.match(bookings, /\.select\(dashboardBookingCompatibilityColumns\)/)
  assert.match(bookings, /\.limit\(51\)/)
  assert.match(quotes, /listSalesQuotesCompatibilitySample/)
  assert.match(quotes, /\.select\(dashboardQuoteCompatibilityColumns\)/)
  assert.match(quotes, /\.limit\(51\)/)
  assert.doesNotMatch(bookings.slice(bookings.indexOf("listLiveBookingsCompatibilitySample"), bookings.indexOf("export async function listLiveBookingsPage")), /\.select\("\*"\)/)
  assert.doesNotMatch(quotes.slice(quotes.indexOf("listSalesQuotesCompatibilitySample"), quotes.indexOf("export async function listSalesQuotesPage")), /\.select\("\*"\)/)
})
