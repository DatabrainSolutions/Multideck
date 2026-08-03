import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260803151000_inbox_open_tracking.sql", import.meta.url), "utf8")
const reliabilityMigration = readFileSync(new URL("../migrations/20260803153000_inbox_tracking_reliability.sql", import.meta.url), "utf8")
const runtime = readFileSync(new URL("../functions/inbox-api/runtime.ts", import.meta.url), "utf8")
const core = readFileSync(new URL("../functions/inbox-api/core.ts", import.meta.url), "utf8")
const pixel = readFileSync(new URL("../functions/email-track/index.ts", import.meta.url), "utf8")
const contract = readFileSync(new URL("../../multideck.client/src/lib/inbox-contract.ts", import.meta.url), "utf8")

test("open tracking is enabled by default, can be turned off, supports a message audience and sends multipart text and HTML", () => {
  assert.match(contract, /trackOpens: boolean/)
  assert.match(contract, /trackOpens: true/)
  assert.match(runtime, /body\.trackOpens === true/)
  assert.match(runtime, /trackingAudienceHash/)
  assert.doesNotMatch(runtime, /externalRecipients\.length !== 1/)
  assert.match(core, /multipart\/alternative/)
  assert.match(runtime, /CommMessage_BodyHTML: bodyHtml/)
})

test("tracking stores only hashes and the public pixel reveals no message identifier", () => {
  assert.match(migration, /CommTrack_TokenHashSHA256/)
  assert.match(migration, /CommTrack_RecipientHashSHA256/)
  assert.doesNotMatch(migration, /CommTrack_RawToken|CommTrack_IP/)
  assert.match(pixel, /comm_record_tracking_open/)
  assert.match(pixel, /return pixel\(method\)/)
  assert.doesNotMatch(pixel, /console\.|request\.headers\.get\("x-forwarded-for"/)
})

test("the first open records an estimated event and repeated loads only increase the count", () => {
  assert.match(migration, /v_first := v_token\."CommTrack_FirstOpenedAt" is null/)
  assert.match(migration, /"CommTrack_OpenCount" = "CommTrack_OpenCount" \+ 1/)
  assert.match(migration, /if v_first then/)
  assert.match(migration, /'confidence', 'estimated'/)
  assert.match(reliabilityMigration, /'opened', null, null/)
  assert.doesNotMatch(reliabilityMigration, /'opened', 'read'/)
})

test("outbound statuses remain evidence-based and self-rendering cannot trigger the pixel", () => {
  for (const label of ["sent", "delivered", "opened_estimated", "replied", "failed", "bounced", "no_open_signal"]) assert.match(contract, new RegExp(label))
  assert.match(runtime, /row\.CommMessage_IsInbound && row\.CommMessage_BodyHTML/)
  assert.match(runtime, /openTrackingEnabled/)
  assert.match(runtime, /p_status_code: null/)
  assert.match(pixel, /if \(method !== "GET"\) return pixel\(method\)/)
})
