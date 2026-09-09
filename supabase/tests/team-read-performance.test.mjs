import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

const team = read("supabase/functions/team/index.ts")
const readModel = read("supabase/functions/_shared/team-read-model.ts")
const migration = read("supabase/migrations/20260819141000_team_admin_survival_guard.sql")
const benchmark = read("multideck.client/benchmarks/settings-users-paging.mjs")

test("team roster and authorization endpoints cannot enumerate the workspace or Auth directory", () => {
  assert.match(team, /Workspace user lists require bounded paging/)
  assert.match(team, /listTeamPage\(admin, current, request\)/)
  assert.match(team, /authorizationCatalogueReadModel\(admin\)/)
  assert.doesNotMatch(team, /teamReadModel|authorizationReadModel/)
  assert.doesNotMatch(readModel, /export async function teamReadModel|export async function authorizationReadModel/)
  assert.doesNotMatch(readModel, /auth\.admin\.listUsers|AUTH_USERS_PER_PAGE/)
})

test("visible team pages hydrate only their capped user IDs", () => {
  assert.match(readModel, /teamUsersPageCompatibilityReadModel/)
  assert.match(readModel, /\.range\(input\.offset, input\.offset \+ input\.limit - 1\)/)
  assert.match(readModel, /\.in\("User_ID", userIds\.slice\(0, 50\)\)/)
  assert.match(readModel, /\.limit\(50\)/)
  assert.match(readModel, /fallbackAuthUsers\(admin, authUserIds\)/)
})

test("administrator survival is a service-role-only existence check", () => {
  assert.match(team, /rpc\("multideck_other_active_admin_exists"/)
  assert.doesNotMatch(team, /otherActiveUsers|otherIds/)
  assert.match(migration, /select exists \(/)
  assert.match(migration, /limit 1/)
  assert.match(migration, /grant execute on function public\.multideck_other_active_admin_exists\(uuid, uuid, uuid\[\]\) to service_role/)
  assert.doesNotMatch(migration, /grant execute .* authenticated/)
})

test("the team scale proof remains 100,000 local-only records", () => {
  assert.match(benchmark, /userCount = 100_000/)
  assert.match(benchmark, /supabase_writes: 0/)
  assert.doesNotMatch(benchmark, /createClient|\.insert\(|\.upsert\(/)
})
