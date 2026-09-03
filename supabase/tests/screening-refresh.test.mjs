import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { refreshOfsiList, ensureScreeningList } from "../functions/_shared/screening-ingest.ts"
import { parseOfsiEntries, UK_OFSI_CSV_URL } from "../functions/_shared/screening.ts"

const csv = "Report Date: 03-Sep-2026\nUnique ID,OFSI Group ID,Name 1,Name 6,Name type,Designation Type,Regime Name,Address Country,Date Designated,UK Statement of Reasons\nRUS1234,,ALFA,SHIPPING LTD,Primary Name,Entity,Russia,GB,01/03/2022,Listed for logistical support\n"
const hash = (text) => createHash("sha256").update(text).digest("hex")

function workspace({ current = null, fresh = false, insertError = false, publishError = false } = {}) {
  const source = { ScreeningListSource_DownloadUrl: UK_OFSI_CSV_URL }
  const state = { current, fresh, token: null, failed: false, fetches: 0, publications: 0, entries: [], snapshots: [], source }
  const status = () => ({ loaded: Boolean(state.current), stale: !state.fresh || state.failed, refreshing: Boolean(state.token), snapshotId: state.current?.ScreeningListSnapshot_ID, downloadedAt: state.current?.ScreeningListSnapshot_DownloadedAt })
  const admin = {
    async rpc(name, args = {}) {
      if (name === "cmp_screening_list_status") return { data: status(), error: null }
      if (name === "cmp_claim_screening_refresh") {
        if (state.token) return { data: "busy" }
        if (state.fresh && !state.failed) return { data: "current" }
        if (state.failed) return { data: "cooldown" }
        state.token = args.p_token
        return { data: "acquired" }
      }
      if (name === "cmp_finish_screening_refresh") {
        if (publishError) return { error: { message: "Publication failed" } }
        assert.equal(args.p_token, state.token)
        assert.ok(args.p_entry_count > 0)
        state.current = state.current?.ScreeningListSnapshot_ID === args.p_snapshot_id ? state.current : state.snapshots.find(s => s.ScreeningListSnapshot_ID === args.p_snapshot_id)
        state.token = null; state.fresh = true; state.failed = false; state.publications++
        return { error: null }
      }
      if (name === "cmp_fail_screening_refresh") { state.failed = true; state.token = null; return { error: null } }
      throw new Error(`Unexpected RPC: ${name}`)
    },
    from(table) {
      let operation = "select", payload, filters = []
      const query = {
        select() { return query }, eq(key, value) { filters.push([key, value]); return query }, lt() { return query }, in() { return query }, order() { return query },
        insert(value) { operation = "insert"; payload = value; return query },
        update(value) { operation = "update"; payload = value; return query }, delete() { operation = "delete"; return query },
        maybeSingle() { return query },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === "sys_ScreeningListSources") return { data: source }
            if (operation === "insert") {
              if (table === "sys_ScreeningListEntries") {
                if (insertError) return { error: { message: "Entry insert failed" } }
                state.entries.push(...payload)
              } else state.snapshots.push(payload)
            }
            if (operation === "select") return { data: filters.some(([k,v]) => k === "ScreeningListSnapshot_StatusCode" && v === "current") ? state.current : [] }
            return { error: null }
          }).then(resolve, reject)
        },
      }
      return query
    },
  }
  return { admin, state }
}

const old = { ScreeningListSnapshot_ID: "old", ScreeningListSnapshot_ContentSha256: hash(csv), ScreeningListSnapshot_EntryCount: 1, ScreeningListSnapshot_GroupCount: 1, ScreeningListSnapshot_DownloadedAt: "2026-08-20T10:00:00Z", ScreeningListSnapshot_FeedUrl: UK_OFSI_CSV_URL }

test("reads UKSL identifiers even without an OFSI group, and preserves listing evidence", () => {
  const [entry] = parseOfsiEntries(csv)
  assert.equal(entry.groupId, "RUS1234")
  assert.equal(entry.ukRef, "RUS1234")
  assert.equal(entry.name, "ALFA SHIPPING LTD")
  assert.equal(entry.groupType, "Entity")
  assert.equal(entry.listedOn, "2022-03-01")
  assert.equal(entry.otherInformation, "Listed for logistical support")
  assert.throws(() => parseOfsiEntries(csv + 'RUS2,,"broken'), /quoted field/)
  assert.throws(() => parseOfsiEntries(csv + 'RUS2,,partial\n'), /incomplete record/)
})

test("first load imports and publishes before declaring the list ready", async (t) => {
  const { admin, state } = workspace()
  t.mock.method(globalThis, "fetch", async url => { assert.equal(url, UK_OFSI_CSV_URL); state.fetches++; return new Response(csv) })
  const result = await ensureScreeningList(admin)
  assert.equal(result.ready, true)
  assert.equal(result.refresh.status, "updated")
  assert.equal(state.entries.length, 1)
  assert.equal(state.publications, 1)
  assert.equal(state.current.ScreeningListSnapshot_FeedUrl, UK_OFSI_CSV_URL)
})

test("unchanged source verifies the existing snapshot without faking a new download date", async (t) => {
  const { admin, state } = workspace({ current: old })
  t.mock.method(globalThis, "fetch", async () => new Response(csv))
  const result = await ensureScreeningList(admin)
  assert.equal(result.ready, true)
  assert.equal(result.refresh.status, "unchanged")
  assert.equal(result.refresh.downloadedAt, old.ScreeningListSnapshot_DownloadedAt)
  assert.equal(state.snapshots.length, 0)
  assert.equal(state.publications, 1)
})

test("fresh verified reuse makes no provider request", async (t) => {
  const { admin } = workspace({ current: old, fresh: true })
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected download") })
  assert.equal((await ensureScreeningList(admin)).ready, true)
})

for (const failure of ["http", "stream", "empty", "insert", "publish"]) {
  test(`${failure} failure preserves the previous snapshot and never returns ready`, async (t) => {
    const { admin, state } = workspace({ current: { ...old, ScreeningListSnapshot_ContentSha256: hash("older") }, insertError: failure === "insert", publishError: failure === "publish" })
    t.mock.method(globalThis, "fetch", async () => {
      if (failure === "http") return new Response("Unavailable", { status: 503 })
      if (failure === "stream") return new Response(new ReadableStream({ start(controller) { controller.error(new Error("Connection lost")) } }))
      return new Response(failure === "empty" ? "<html>Service error</html>" : csv)
    })
    const result = await ensureScreeningList(admin)
    assert.equal(result.ready, false)
    assert.equal(result.refresh.status, "failed")
    assert.equal(state.current.ScreeningListSnapshot_ID, "old")
    assert.equal(state.publications, 0)
    assert.equal((await refreshOfsiList(admin)).status, "failed", "shared cooldown prevents an immediate retry storm")
  })
}

test("concurrent use shares the lease: only its owner downloads; the other caller is pending", async (t) => {
  const { admin, state } = workspace()
  let release
  const waiting = new Promise(resolve => { release = resolve })
  t.mock.method(globalThis, "fetch", async () => { state.fetches++; await waiting; return new Response(csv) })
  const first = ensureScreeningList(admin)
  const second = await ensureScreeningList(admin)
  assert.equal(second.ready, false)
  assert.equal(second.refresh.status, "pending")
  release()
  assert.equal((await first).ready, true)
  assert.equal(state.fetches, 1)
  assert.equal((await ensureScreeningList(admin)).ready, true)
  assert.equal(state.fetches, 1)
})

test("retired feeds cannot be re-labelled as a current UKSL snapshot", async (t) => {
  const { admin, state } = workspace()
  state.source.ScreeningListSource_DownloadUrl = "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv"
  t.mock.method(globalThis, "fetch", () => { throw new Error("Must not download retired feed") })
  assert.equal((await ensureScreeningList(admin)).ready, false)
  assert.equal(state.publications, 0)
})
