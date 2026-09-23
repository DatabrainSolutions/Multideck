import test from "node:test"
import assert from "node:assert/strict"
import { createDexterActivityTracker } from "../functions/agent-dexter/activity.ts"
import { mergeDexterActivity, parseDexterActivities, type DexterActivity } from "../../shared/dexter-activity.ts"

test("activity starts with the operation, settles only after its result and never copies arguments", async () => {
  const events: Record<string, unknown>[] = []
  const tracker = createDexterActivityTracker(event => events.push(event))
  let finish!: (result: unknown) => void
  const pending = tracker.run("search_email", { provider: "gmail", query: "private search phrase", token: "secret" }, ["gmail", "outlook"],
    () => new Promise(resolve => { finish = resolve }))
  assert.equal(events.length, 1)
  assert.deepEqual(tracker.activities[0].providers, ["gmail"])
  assert.equal(tracker.activities[0].label, "Searching Gmail")
  assert.equal(tracker.activities[0].status, "running")
  finish({ items: [] })
  await pending
  assert.equal(tracker.activities[0].label, "Searched Gmail")
  assert.equal(tracker.activities[0].status, "completed")
  assert.equal((events[0].activity as DexterActivity).status, "running")
  assert.equal((events[1].activity as DexterActivity).status, "completed")
  assert.doesNotMatch(JSON.stringify(events), /private search phrase|secret|token/)
})

test("multi-provider searches resolve each subsequent thread and attachment to trusted results", async () => {
  const tracker = createDexterActivityTracker(() => {})
  await tracker.run("search_email", {}, ["gmail", "outlook"], async () => ({ items: [
    { threadId: "gmail-thread", provider: "gmail" }, { threadId: "outlook-thread", provider: "outlook" },
  ] }))
  assert.deepEqual(tracker.activities[0].providers, ["gmail", "outlook"])
  await tracker.run("read_email_thread", { threadId: "outlook-thread" }, ["gmail", "outlook"], async () => ({
    threadId: "outlook-thread", provider: "outlook", messages: [{ attachments: [{ attachmentId: "file" }] }],
  }))
  assert.deepEqual(tracker.activities[1].providers, ["outlook"])
  await tracker.run("read_email_attachment", { attachmentId: "file" }, ["gmail", "outlook"], async () => ({ loaded: true }))
  assert.deepEqual(tracker.activities[2].providers, ["outlook"])
  await tracker.run("read_email_thread", { threadId: "unknown" }, ["gmail", "outlook"], async () => ({ error: "denied" }))
  assert.deepEqual(tracker.activities[3].providers, [])
  assert.equal(tracker.activities[3].status, "failed")
})

test("unavailable providers, failed results and exceptions cannot become successful branded operations", async () => {
  const tracker = createDexterActivityTracker(() => {})
  await tracker.run("search_email", { provider: "outlook" }, ["gmail"], async () => ({ error: "not selected" }))
  assert.deepEqual(tracker.activities[0].providers, [])
  assert.equal(tracker.activities[0].label, "Could not search email")
  await assert.rejects(tracker.run("query_data_domain", { domain: "bookings" }, [], async () => { throw new Error("offline") }), /offline/)
  assert.equal(tracker.activities[1].status, "failed")
  assert.equal(tracker.activities[1].label, "Could not check workspace records")
})

test("concurrent reads settle independently, without ending another active step", async () => {
  const tracker = createDexterActivityTracker(() => {})
  let finish!: () => void
  const first = tracker.run("query_data_domain", { domain: "bookings" }, [], () => new Promise<void>(resolve => { finish = resolve }))
  await tracker.run("query_data_domain", { domain: "contacts" }, [], async () => ({ data: [] }))
  assert.deepEqual(tracker.activities.map(item => item.status), ["running", "completed"])
  finish()
  await first
  assert.deepEqual(tracker.activities.map(item => item.status), ["completed", "completed"])
})

test("client replay and persisted metadata retain one step per operation and reject malformed activity", () => {
  const activity: DexterActivity = { id: "step", label: "Searching Gmail", status: "running", providers: ["gmail"] }
  let values = mergeDexterActivity([], activity)
  values = mergeDexterActivity(values, { ...activity, label: "Searched Gmail", status: "completed" })
  values = mergeDexterActivity(values, activity)
  assert.equal(values.length, 1)
  assert.equal(values[0].status, "completed")
  assert.deepEqual(parseDexterActivities(JSON.parse(JSON.stringify(values))), values)
  assert.deepEqual(parseDexterActivities([null, { id: "a", label: "hi", status: "invented" }]), [])
  assert.deepEqual(parseDexterActivities([{ ...activity, providers: ["gmail", "gmail", "made-up-service"], secret: "hidden" }]), [activity])
})

test("failure tooltips retain safe reasons and recovery without leaking raw provider errors", async () => {
  const tracker = createDexterActivityTracker(() => {})
  for (const code of ["thread_page_limit", "reauthorization_required", "permission_denied", "unknown_provider_code"]) {
    await tracker.run("read_email_thread", {}, ["gmail"], async () => ({ code, error: "private message token=secret" }))
  }
  assert.match(tracker.activities[0].detail!, /three-page email limit/)
  assert.match(tracker.activities[1].detail!, /Reconnect it in Settings/)
  assert.match(tracker.activities[2].detail!, /administrator/)
  assert.match(tracker.activities[3].detail!, /Try asking it to check the email again/)
  assert.doesNotMatch(JSON.stringify(tracker.activities), /private message|token=secret|unknown_provider_code/)
  assert.deepEqual(parseDexterActivities(JSON.parse(JSON.stringify(tracker.activities))), tracker.activities)
  assert.equal(parseDexterActivities([{...tracker.activities[0], detail: "x".repeat(1000)}])[0].detail?.length, 500)
})
