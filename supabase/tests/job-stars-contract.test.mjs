import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260821113000_persist_user_job_stars.sql", import.meta.url), "utf8")

test("job stars are private, authenticated and database backed", () => {
  assert.match(migration, /create table if not exists public\."App_UserJobStars"/)
  assert.match(migration, /"User_ID" = auth\.uid\(\)/)
  assert.match(migration, /multideck_set_job_starred/)
  assert.match(migration, /star\."User_ID" = auth\.uid\(\)/)
  assert.doesNotMatch(migration, /false as "Is_Favourite"/)
  assert.match(migration, /revoke all on function public\.multideck_set_job_starred\(text, boolean\) from public, anon/)
})
