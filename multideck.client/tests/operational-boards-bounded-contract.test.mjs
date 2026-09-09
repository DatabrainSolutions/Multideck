import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")

const bookingsPage = read("multideck.client/src/pages/bookings-page.tsx")
const roadPage = read("multideck.client/src/pages/road-control-page.tsx")
const applicationApi = read("multideck.client/src/lib/application-data-api.ts")
const migration = read("supabase/migrations/20260819100000_road_control_bounded_board.sql")

test("Booking Board uses the same bounded server register page as the table", () => {
  assert.doesNotMatch(bookingsPage, /listLiveBookings[,\s]/)
  assert.match(bookingsPage, /else setBoardRecords\(result\.rows\)/)
  assert.match(bookingsPage, /const totalBookings = tableTotal/)
  assert.doesNotMatch(bookingsPage, /<BookingMetricStrip/u)
  assert.match(bookingsPage, /totalCount=\{tableSummary\.total\}/u)
})

test("Road Control requests one bounded stage page or bounded Kanban lanes", () => {
  assert.match(roadPage, /listRoadControlPage\(\{/)
  assert.match(roadPage, /stage: viewMode === "List" \? activeStage : undefined/)
  assert.match(roadPage, /offset: viewMode === "List" \? \(page - 1\) \* roadPageSize : 0/)
  assert.match(roadPage, /<Pagination/)
  assert.doesNotMatch(roadPage, /listLiveRoadJobs/)
})

test("Road Control read model preserves RLS and caps both pages and lanes", () => {
  assert.match(migration, /security invoker/)
  assert.match(migration, /greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/)
  assert.match(migration, /partition by road_stage/)
  assert.match(migration, /when v_stage is null then ordinal <= v_limit/)
  assert.match(migration, /grant execute .* to authenticated, service_role/)
  assert.doesNotMatch(migration, /insert into/i)
})

test("Only a missing read model may use the rollout compatibility path", () => {
  assert.match(applicationApi, /error\.code === "42883" \|\| error\.code === "PGRST202"/)
  assert.match(applicationApi, /if \(!missingRoadControlReadModel\(error\)\) throw error/)
  assert.match(applicationApi, /limit: Math\.max\(1, Math\.min\(input\.limit \?\? 20, 50\)\)/)
  assert.match(applicationApi, /const roadControlCompatibilityLimit = 50/)
  assert.match(applicationApi, /await listLiveBookingsPage\(\{[\s\S]*mode: "ROAD"[\s\S]*limit: roadControlCompatibilityLimit/)
  assert.match(applicationApi, /if \(page\.total > page\.rows\.length\)/)
  assert.match(applicationApi, /needs its bounded read-model update/)
  assert.doesNotMatch(applicationApi, /async function legacyRoadControlPage[\s\S]*?\.from\("App_Live_Bookings"\)/)
})
