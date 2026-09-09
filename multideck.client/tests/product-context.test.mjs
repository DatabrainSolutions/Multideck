import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { productContextIssues } from "../scripts/product-context.mjs"

const valid = { VERCEL: "1", MULTIDECK_SURFACE: "app", VITE_MULTIDECK_TENANT_SLUG: "example", VERCEL_PROJECT_NAME: "multideck-app-example", VITE_SUPABASE_PROJECT_REF: "example", VITE_SUPABASE_URL: "https://example.supabase.co" }
const script = fileURLToPath(new URL("../scripts/assert-product-context.mjs", import.meta.url))
const run = (environment) => spawnSync(process.execPath, [script], { env: environment, encoding: "utf8" })

test("approved Vercel and ordinary local contexts retain existing build behaviour", () => {
  for (const environment of [{}, valid, { ...valid, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" }, { ...valid, VERCEL_ENV: "production" }]) {
    const before = structuredClone(environment)
    assert.deepEqual(productContextIssues(environment), [])
    assert.equal(run(environment).status, 0)
    assert.deepEqual(environment, before, "Validation must not supply or mutate configuration")
  }
})

test("missing feature-branch configuration reports all required names and fails closed", () => {
  const environment = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/feature" }
  const result = run(environment)
  assert.equal(result.status, 1)
  for (const key of Object.keys(valid).filter(key => key !== "VERCEL")) assert.ok(result.stderr.includes(key))
  assert.match(result.stderr, /exact Git branch scope/)
  assert.match(result.stderr, /Do not disable this guard/)
  assert.equal(result.stdout, "")
  for (const key of Object.keys(valid).filter(key => key !== "VERCEL")) {
    const context = { ...valid }; delete context[key]
    assert.equal(run(context).status, 1, `Missing ${key} must block`)
  }
})

test("wrong product, malformed tenant, wrong project and database mismatch remain blocked", () => {
  for (const patch of [
    { MULTIDECK_SURFACE: "live" }, { VITE_MULTIDECK_TENANT_SLUG: "../other" },
    { VERCEL_PROJECT_NAME: "multideck-app-other" }, { VITE_SUPABASE_PROJECT_REF: "other" },
    { VITE_SUPABASE_URL: "malformed-private-value" },
  ]) assert.equal(run({ ...valid, ...patch }).status, 1)
})

test("errors never print supplied values, URL credentials or stack traces", () => {
  const privateValue = "private-test-value"
  const result = run({ ...valid, MULTIDECK_SURFACE: privateValue, VERCEL_PROJECT_NAME: privateValue, VITE_SUPABASE_URL: `https://${privateValue}:password@different.supabase.co/` })
  assert.equal(result.status, 1)
  assert.ok(!result.stderr.includes(privateValue))
  assert.ok(!result.stderr.includes("password"))
  assert.ok(!run({ ...valid, VITE_SUPABASE_URL: privateValue }).stderr.includes(privateValue))
  assert.ok(!result.stderr.includes("at file:"))
})
