import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const api = await readFile(new URL("../src/lib/application-data-api.ts", import.meta.url), "utf8")
const hook = await readFile(new URL("../src/lib/starred-jobs.ts", import.meta.url), "utf8")

test("job star toggles persist through the authenticated database API", () => {
  assert.match(api, /rpc\("multideck_set_job_starred"/)
  assert.match(api, /invalidateRegisterPages\("bookings:"\)/)
  assert.match(hook, /await setLiveJobStarred\(id, !starred\)/)
  assert.match(hook, /catch \(error\)[\s\S]*rollback/)
})
