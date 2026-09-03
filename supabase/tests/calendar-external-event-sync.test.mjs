import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const providerSource = read("../functions/_shared/calendar-provider-events.ts")
// Exercise the real provider-write implementation with isolated credentials,
// database and HTTP boundaries. No live calendar is modified by this suite.
const source = providerSource.replace(/^import .*$/gm, "")
const dependencies = `
class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
async function calendarProviderAccessToken() { return "test-token" }
function cleanText(value, limit) { return typeof value === "string" ? value.trim().slice(0, limit) : "" }
`
const { pushExternalEventChange } = await import(`data:text/javascript;base64,${Buffer.from(dependencies + stripTypeScriptTypes(source, { mode: "strip" })).toString("base64")}`)

const event = {
  CALProviderEvent_ID: "event", CALProviderEvent_CompanyID: "company", CALProviderEvent_OwnerUserID: "owner",
  CALProviderEvent_ConnectionID: "connection", CALProviderEvent_ProviderID: "provider-event",
  CALProviderEvent_StartAt: "2026-09-03T09:00:00Z", CALProviderEvent_EndAt: "2026-09-03T10:00:00Z",
}
const change = { cancel: false, title: null, startAt: "2026-09-03T09:30:00Z", endAt: "2026-09-03T10:30:00Z", timeZone: "Europe/London" }

function database(status, overrides = {}) {
  const connection = {
    CALConnection_ID: "connection", CALConnection_CompanyID: "company", CALConnection_UserID: "owner",
    CALConnection_ProviderCode: "google", CALConnection_CalendarID: "primary", CALConnection_StatusCode: status, ...overrides,
  }
  const writes = []
  return {
    writes,
    from(table) {
      const predicates = []
      let updates
      const query = {
        select() { return query },
        eq(key, value) { predicates.push((row) => row[key] === value); return query },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return query },
        update(value) { updates = value; return query },
        async maybeSingle() { return { data: predicates.every((predicate) => predicate(connection)) ? connection : null, error: null } },
        async single() { assert.equal(table, "CAL_ProviderEvents"); writes.push(updates); return { data: { ...event, ...updates }, error: null } },
      }
      return query
    },
  }
}

test("connected and webhook-syncing calendars write to Google and Microsoft before updating the mirror", async (t) => {
  for (const status of ["connected", "syncing"]) {
    for (const provider of ["google", "microsoft"]) {
      const db = database(status, { CALConnection_ProviderCode: provider })
      const requests = []
      t.mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(db.writes.length, 0)
        requests.push({ url, options })
        return new Response(JSON.stringify({ etag: "revision" }), { status: 200 })
      })
      const result = await pushExternalEventChange(db, event, change)
      assert.equal(requests.length, 1)
      assert.equal(requests[0].options.method, "PATCH")
      assert.match(requests[0].url, provider === "google" ? /googleapis/ : /graph.microsoft/)
      assert.equal(result.row.CALProviderEvent_StartAt, change.startAt)
      assert.equal(result.row.CALProviderEvent_EndAt, change.endAt)
      assert.equal(db.writes.length, 1)
      t.mock.restoreAll()
    }
  }
})

test("missing, disconnected, attention and mismatched-owner connections never reach the provider", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected provider write") })
  for (const db of [database(undefined), database("disconnected"), database("attention"), database("syncing", { CALConnection_UserID: "other" }), database("syncing", { CALConnection_CompanyID: "other" }), database("syncing", { CALConnection_ID: "other" })]) {
    await assert.rejects(pushExternalEventChange(db, event, change), { status: 409 })
    assert.equal(db.writes.length, 0)
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test("syncing does not bypass expired credentials or provider write permissions", async (t) => {
  for (const [status, expected] of [[401, 409], [403, 403], [500, 502]]) {
    const db = database("syncing")
    t.mock.method(globalThis, "fetch", async () => new Response("", { status }))
    await assert.rejects(pushExternalEventChange(db, event, change), { status: expected })
    assert.equal(db.writes.length, 0)
    t.mock.restoreAll()
  }
})

test("API and Dexter agree that syncing is editable, and preserve event-driven watches", () => {
  const api = read("../functions/calendar-api/index.ts")
  const migration = read("../migrations/20260902220000_calendar_edit_while_syncing.sql")
  assert.match(api, /connection\?\.status === "connected" \|\| connection\?\.status === "syncing"/)
  assert.doesNotMatch(api, /connection\?\.status \?\? "connected"/)
  assert.match(migration, /'canEdit', connection\."CALConnection_StatusCode" in \('connected','syncing'\)/)
  assert.match(migration, /v_connection\."CALConnection_StatusCode" not in \('connected','syncing'\)/)
  assert.match(migration, /"CALConnection_CompanyID"=p_company_id and "CALConnection_UserID"=p_user_id/)
  assert.match(migration, /Calendar.ManageOwn/)
  assert.match(migration, /insert into public\."CAL_Deliveries"/)
  assert.doesNotMatch(migration, /update public\."CAL_ProviderEvents"|drop trigger/i)
})

test("overlap layout supports both contained and continuing events without rejecting either", async () => {
  const view = read("../../multideck.client/src/components/multideck/calendar-view.tsx")
  const layout = view.slice(view.indexOf("function layoutCalendarEvents("), view.indexOf("const ribbonTones:"))
  const { layoutCalendarEvents } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(`export ${layout}`, { mode: "strip" })).toString("base64")}`)
  const base = { id: "base", startAt: "2026-09-03T10:00:00Z", endAt: "2026-09-03T11:00:00Z" }
  const moved = { id: "moved", startAt: "2026-09-03T10:15:00Z", endAt: "2026-09-03T10:45:00Z" }
  assert.equal(layoutCalendarEvents([base, moved])[1].overlap, "contained")
  assert.equal(layoutCalendarEvents([base, { ...moved, endAt: "2026-09-03T11:15:00Z" }])[1].overlap, "continuing")
})

test("compact meeting editors wrap the date without separating start and finish", () => {
  const picker = read("../../multideck.client/src/components/multideck/meeting-time-picker.tsx")
  const range = picker.match(/<div className="([^"]+)" role="group" aria-label="Meeting time range">([\s\S]*?)<\/div>/)
  assert.ok(range)
  assert.match(range[1], /shrink-0/)
  assert.doesNotMatch(range[1], /flex-wrap/)
  assert.match(range[2], /label="Starts"/)
  assert.match(range[2], /label="Finishes"/)
})
