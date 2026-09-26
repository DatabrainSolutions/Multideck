import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const read = path => readFile(new URL(path, import.meta.url), "utf8")
const core = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(await read("../functions/event-location-search/core.ts")))}`)
const source = await read("../functions/address-search/index.ts")
const backend = await read("../functions/_shared/backend.ts")
class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
const internalSource = backend.slice(backend.indexOf("export async function currentInternalUser"), backend.indexOf("export async function permissionValues"))
const currentInternalUser = new Function("HttpError", `${stripTypeScriptTypes(internalSource).replace("export ", "")}; return currentInternalUser`)(HttpError)
const makeHandler = new Function("authenticate", "currentInternalUser", "corsHeaders", "failure", "HttpError", "json", "locationQuery", "locationSuggestions", "Deno", "fetch",
  stripTypeScriptTypes(source.replace(/^import .*\n/gm, "")).replace("Deno.serve(", "return ("))

function setup({ profile = { Company_ID: "workspace", User_AccessStatus: "active" }, providerFails = false } = {}) {
  const calls = []
  const admin = { from: table => {
    assert.equal(table, "cmp_Users", "Search must not read operational records or event settings")
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }
  } }
  const handler = makeHandler(async request => {
    if (request.headers.get("Authorization") !== "Bearer tenant-session") throw new HttpError(401, "Unauthorised")
    return { admin, user: { id: "colleague-without-events-permission" } }
  }, currentInternalUser, () => ({}), (_, error) => Response.json({ detail: error.message }, { status: error.status || 500 }), HttpError,
  (_, body) => Response.json(body), core.locationQuery, core.locationSuggestions, { env: { get: () => undefined } }, async url => {
    calls.push(new URL(url))
    if (providerFails) return new Response("Unavailable", { status: 503 })
    return Response.json({ features: [{ properties: { name: "Boom Battle Bar", street: "George Street", city: "Leeds", postcode: "LS2 7JD", country: "United Kingdom", countrycode: "GB" } }] })
  })
  return { handler, calls }
}
const request = (query = "Leeds", token = "tenant-session") => new Request("https://example.test/address-search", {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
})

test("active colleagues can search without Events permissions; only the public query reaches the provider", async () => {
  const { handler, calls } = setup()
  const response = await handler(request("booom battle bar leeds"))
  assert.equal(response.status, 200)
  const { items } = await response.json()
  assert.equal(items[0].address.countryCode, "GB")
  assert.deepEqual([...calls[0].searchParams.keys()].sort(), ["lang", "limit", "q"])
  assert.equal(calls[0].searchParams.get("q"), "booom battle bar leeds")
  await handler(request("booom battle bar leeds"))
  assert.equal(calls.length, 1, "Repeated query uses bounded cache")
})

test("anonymous, unlinked, inactive and company-less profiles cannot search", async () => {
  const anonymous = setup()
  assert.equal((await anonymous.handler(request("Leeds", "invalid-project-token"))).status, 401)
  assert.equal(anonymous.calls.length, 0)
  for (const profile of [null, { Company_ID: "workspace", User_AccessStatus: "inactive" }, { Company_ID: null, User_AccessStatus: "active" }]) {
    const { handler, calls } = setup({ profile })
    assert.equal((await handler(request())).status, 403)
    assert.equal(calls.length, 0)
  }
})

test("invalid queries and provider failure return recoverable errors", async () => {
  const { handler, calls } = setup()
  assert.equal((await handler(request("ab"))).status, 400)
  assert.equal(calls.length, 0)
  const failure = setup({ providerFails: true })
  const response = await failure.handler(request())
  assert.equal(response.status, 503)
  assert.match((await response.json()).detail, /enter your own address/)
})
