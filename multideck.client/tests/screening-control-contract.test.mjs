import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [page, api, edge, migration] = await Promise.all([
  read("multideck.client/src/pages/screening-page.tsx"),
  read("multideck.client/src/lib/screening-api.ts"),
  read("supabase/functions/screening/index.ts"),
  read("supabase/migrations/20260820082034_platform_screening_controls.sql"),
])

test("screening supports workflow context, optional fuzzy review and manual outcomes", () => {
  assert.match(page, /Workflow context/)
  assert.match(page, /Include similar names/)
  assert.match(page, /82% similarity threshold/)
  assert.match(page, /Mark as clear/)
  assert.match(page, /Mark as sanctioned/)
  assert.match(page, /\[recentPageSize, setRecentPageSize\] = useState\(defaultPaginationPageSize\)/)
  assert.match(page, /onLimitChange: setRecentPageSize/)
  assert.match(api, /sourceArea\?: ScreeningSourceArea/)
  assert.match(api, /decideScreeningCheck/)
})

test("screening reports show control evidence and export every check", () => {
  assert.match(page, /Run report/)
  assert.match(page, /Download report/)
  assert.match(page, /Review required/)
  assert.match(edge, /listReportChecks/)
  assert.match(edge, /const pageSize = 1000/)
  assert.match(edge, /offset \+ pageSize - 1/)
  assert.match(edge, /searchParams\.get\("format"\) === "csv"/)
})

test("screening decisions and rescreens are stored in the database audit trail", () => {
  assert.match(migration, /Screening\.Decide/)
  assert.match(migration, /"CMP_ScreeningDecisions"/)
  assert.match(migration, /cmp_run_screening_check_v2/)
  assert.match(migration, /ScreeningCheck_RescreenDueAt/)
  assert.match(migration, /interval '30 days'/)
  assert.match(migration, /revoke all on function public\.cmp_run_screening_check_v2/)
})
