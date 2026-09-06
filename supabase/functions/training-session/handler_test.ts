import assert from "node:assert/strict"
import { createTrainingSessionHandler } from "./handler.ts"
import { HttpError } from "../_shared/backend.ts"

const actorId = "00000000-0000-4000-8000-000000000001"
const companyId = "00000000-0000-4000-8000-000000000010"
const env: Record<string, string> = { SUPABASE_URL: "https://main.supabase.co", TRAINING_SUPABASE_URL: "https://training.supabase.co", TRAINING_SUPABASE_SERVICE_ROLE_KEY: "server-secret", TRAINING_SUPABASE_ANON_KEY: "public-key", TRAINING_SOURCE_COMPANY_ID: companyId }
function fixture(options: { env?: Record<string, string>; profileCompany?: string; denied?: boolean; pair?: boolean; collision?: boolean; missing?: boolean; seconds?: number } = {}) {
  const calls: string[] = []
  const profile = { User_ID: "operator-record", Company_ID: options.profileCompany ?? companyId, User_Email: "operator@example.invalid" }
  const shadow = { id: actorId, email: options.collision ? "existing@example.invalid" : `${actorId}@training.multideck.invalid`, app_metadata: { training_main_project: env.SUPABASE_URL } }
  const main = { from(table: string) { calls.push(`main:${table}`); return { select() { return this }, eq: async () => ({ data: [], error: null }) } } }
  const training = {
    rpc: async (name: string) => { calls.push(name); return { data: name === "assert_training_pair_v1" ? options.pair === false ? null : "training-company" : null, error: null } },
    auth: { admin: {
      getUserById: async () => ({ data: { user: options.missing ? null : shadow }, error: options.missing ? { status: 404 } : null }),
      createUser: async (input: Record<string, unknown>) => { calls.push("create-user"); assert.equal(input.id, actorId); assert.equal(input.password, undefined); return { data: { user: shadow }, error: null } },
      generateLink: async () => { calls.push("generate-link"); return { data: { user: shadow, properties: { hashed_token: "server-only-hash" } }, error: null } },
    } },
  }
  const verifier = { auth: { verifyOtp: async () => ({ data: { session: { access_token: "training-bearer", refresh_token: "never-return-refresh", expires_at: Math.floor(Date.now() / 1000) + (options.seconds ?? 300), user: shadow } }, error: null }) } }
  const handler = createTrainingSessionHandler({
    env: name => (options.env ?? env)[name], allowedOrigins: () => new Set(["http://localhost:3000"]),
    authenticate: async () => { calls.push("authenticate-main"); if (options.denied) throw new HttpError(401, "Sign in again."); return { admin: main, user: { id: actorId }, token: "main-token" } as never },
    currentInternalUser: async () => profile,
    createClient: ((_url: string, key: string) => { calls.push("create-target-client"); return key === "server-secret" ? training : verifier }) as never,
  })
  return { handler, calls }
}
const request = (method = "POST", origin = "http://localhost:3000") => new Request("https://main.supabase.co/functions/v1/training-session", { method, headers: { Origin: origin, Authorization: "Bearer main-token" } })

Deno.test("handoff returns only the paired access token and preserves the Auth UUID", async () => {
  const { handler, calls } = fixture({ missing: true })
  const response = await handler(request())
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(Object.keys(result).sort(), ["accessToken", "authUserId", "expiresAt", "projectUrl"])
  assert.equal(result.authUserId, actorId)
  assert.equal(result.projectUrl, env.TRAINING_SUPABASE_URL)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert(calls.indexOf("authenticate-main") < calls.indexOf("create-target-client"))
  assert(calls.indexOf("assert_training_pair_v1") < calls.indexOf("create-user"))
  assert(calls.indexOf("sync_training_identity_v1") < calls.indexOf("generate-link"))
})
Deno.test("wrong origin and invalid source access cannot touch Training", async () => {
  for (const denied of [false, true]) {
    const { handler, calls } = fixture({ denied })
    const response = await handler(request("POST", denied ? "http://localhost:3000" : "https://other.example"))
    assert.equal(response.status, denied ? 401 : 403)
    assert(!calls.includes("create-target-client"))
  }
})
Deno.test("wrong company, missing configuration and same-project target fail closed", async () => {
  for (const options of [{ profileCompany: "another-company" }, { env: {} }, { env: { ...env, TRAINING_SUPABASE_URL: env.SUPABASE_URL } }]) {
    const { handler, calls } = fixture(options)
    const response = await handler(request())
    assert(response.status >= 400)
    assert(!calls.includes("create-target-client"))
  }
})
Deno.test("unpaired projects and existing conflicting identities never receive a session", async () => {
  for (const options of [{ pair: false }, { collision: true }]) {
    const { handler, calls } = fixture(options)
    const response = await handler(request())
    assert(response.status >= 400)
    assert(!calls.includes("generate-link"))
  }
})
Deno.test("a long-lived target JWT is refused and credentials never reach error responses", async () => {
  const { handler } = fixture({ seconds: 3600 })
  const response = await handler(request())
  assert.equal(response.status, 503)
  const text = await response.text()
  assert.match(text, /300 seconds/)
  assert.doesNotMatch(text, /training-bearer|server-secret|never-return-refresh|server-only-hash/)
})
