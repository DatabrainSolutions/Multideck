import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const supabaseRoot = new URL("../", import.meta.url)
const repoRoot = new URL("../", supabaseRoot)
const readSupabase = (path) => readFile(new URL(path, supabaseRoot), "utf8")
const readRepo = (path) => readFile(new URL(path, repoRoot), "utf8")

const [account, team, customers, finance, shared, config, api, customerApi, financeApi, env] = await Promise.all([
  readSupabase("functions/account/index.ts"),
  readSupabase("functions/team/index.ts"),
  readSupabase("functions/customers/index.ts"),
  readSupabase("functions/finance/index.ts"),
  readSupabase("functions/_shared/backend.ts"),
  readSupabase("config.toml"),
  readRepo("multideck.client/src/lib/api.ts"),
  readRepo("multideck.client/src/lib/customer-api.ts"),
  readRepo("multideck.client/src/lib/finance-api.ts"),
  readRepo("multideck.client/.env.example"),
])

test("the client has no alternate application-server configuration", () => {
  for (const source of [api, customerApi, financeApi, env]) {
    assert.doesNotMatch(source, /VITE_API_BASE_URL|localhost:5273|\/api\/auth|\/api\/v1\/users|\/api\/authorization|\/api\/v1\/customers|\/api\/finance/)
  }
  assert.match(api, /edgeFetch\("account"/)
  assert.match(api, /edgeFetch\("team"/)
  assert.match(customerApi, /edgeFetch\("customers"/)
  assert.match(financeApi, /edgeFetch\("finance"/)
})

test("all replacement functions authenticate and keep privileged access server-side", () => {
  for (const source of [account, team, customers, finance]) assert.match(source, /authenticate\(request\)/)
  assert.match(shared, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(api + customerApi + financeApi, /SERVICE_ROLE/)
  for (const name of ["account", "team", "customers", "finance", "warehouse"]) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\][\\s\\S]*?verify_jwt = true`))
  }
})

test("tenant auth remains invite-only with manual identity linking", () => {
  assert.match(config, /\[auth\][\s\S]*?enable_signup = false/)
  assert.match(config, /enable_manual_linking = true/)
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup = false/)
  assert.match(team, /inviteUserByEmail/)
})

test("team and customer mutations remain permission checked", () => {
  for (const permission of ["Users.Read", "Users.Invite", "Users.Manage", "Authorization.Read", "Authorization.Manage"]) assert.match(team, new RegExp(permission.replace(".", "\\.")))
  assert.match(customers, /Customers\.Read/)
  assert.match(customers, /Customers\.Write/)
  assert.match(finance, /Quotes\.Read/)
})
