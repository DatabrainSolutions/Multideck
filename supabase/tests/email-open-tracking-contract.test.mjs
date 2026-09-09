import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260803151000_inbox_open_tracking.sql", import.meta.url), "utf8")
const reliabilityMigration = readFileSync(new URL("../migrations/20260803153000_inbox_tracking_reliability.sql", import.meta.url), "utf8")
const sendIndexMigration = readFileSync(new URL("../migrations/20260803164000_inbox_tracking_send_index.sql", import.meta.url), "utf8")
const prefetchGuardMigration = readFileSync(new URL("../migrations/20260803171500_inbox_tracking_prefetch_guard.sql", import.meta.url), "utf8")
const integrityMigration = readFileSync(new URL("../migrations/20260810075358_inbox_email_tracking_event_integrity.sql", import.meta.url), "utf8")
const collisionGuardMigration = readFileSync(new URL("../migrations/20260810083159_inbox_delivery_event_collision_guard.sql", import.meta.url), "utf8")
const messageIndexMigration = readFileSync(new URL("../migrations/20260810083843_inbox_delivery_event_message_index.sql", import.meta.url), "utf8")
const timestampAccuracyMigration = readFileSync(new URL("../migrations/20260810084103_inbox_delivery_event_timestamp_accuracy.sql", import.meta.url), "utf8")
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

test("tracking keeps message and send foreign-key lookups indexed", () => {
  assert.match(migration, /IX_Comm_MessageTrackingTokens_message_active/)
  assert.match(sendIndexMigration, /IX_Comm_MessageTrackingTokens_send/)
  assert.match(sendIndexMigration, /CommTrack_SendID/)
})

test("the first open records an estimated event and repeated loads only increase the count", () => {
  assert.match(migration, /v_first := v_token\."CommTrack_FirstOpenedAt" is null/)
  assert.match(migration, /"CommTrack_OpenCount" = "CommTrack_OpenCount" \+ 1/)
  assert.match(migration, /if v_first then/)
  assert.match(migration, /'confidence', 'estimated'/)
  assert.match(reliabilityMigration, /'opened', null, null/)
  assert.doesNotMatch(reliabilityMigration, /'opened', 'read'/)
})

test("explicit prefetches are ignored without discarding a genuine immediate open", () => {
  assert.match(prefetchGuardMigration, /CommMessage_SentAt/)
  const currentOpenFunction = integrityMigration.slice(integrityMigration.lastIndexOf("create or replace function public.comm_record_tracking_open"))
  assert.doesNotMatch(currentOpenFunction, /interval '60 seconds'/)
  assert.match(pixel, /isExplicitPrefetch/)
  assert.match(pixel, /"purpose", "sec-purpose", "x-purpose", "x-moz"/)
})

test("outbound statuses remain evidence-based and self-rendering cannot trigger the pixel", () => {
  for (const label of ["sent", "delivered", "opened_estimated", "replied", "failed", "bounced", "no_open_signal"]) assert.match(contract, new RegExp(label))
  assert.match(runtime, /row\.CommMessage_IsInbound && row\.CommMessage_BodyHTML/)
  assert.match(runtime, /openTrackingEnabled/)
  assert.match(runtime, /p_status_code: null/)
  assert.match(pixel, /if \(method !== "GET" \|\| isExplicitPrefetch\(request\)\) return pixel\(method\)/)
})

test("delivery events are scoped to one provider connection and deduplicated", () => {
  assert.match(integrityMigration, /CommDelivery_ConnectionID/)
  assert.match(integrityMigration, /on conflict \("CommDelivery_ConnectionID", "CommDelivery_ProviderEventID"\)/)
  assert.match(integrityMigration, /CommSend_MessageID" = p_message_id/)
  assert.match(integrityMigration, /from public, anon, authenticated/)
})

test("a duplicate provider event cannot be reassigned to another message", () => {
  assert.match(collisionGuardMigration, /CommDelivery_ConnectionID/)
  assert.match(collisionGuardMigration, /CommDelivery_ProviderEventID/)
  assert.match(collisionGuardMigration, /v_existing_message_id is distinct from new\."CommDelivery_MessageID"/)
  assert.match(collisionGuardMigration, /raise exception 'A provider delivery event cannot be attached to a different message\.'/)
  assert.match(collisionGuardMigration, /before insert or update of/)
})

test("message delivery timelines remain indexed as tracking history grows", () => {
  assert.match(messageIndexMigration, /IX_Comm_DeliveryEvents_message_event_at/)
  assert.match(messageIndexMigration, /CommDelivery_MessageID/)
  assert.match(messageIndexMigration, /CommDelivery_EventAt" desc/)
})

test("delayed provider receipts preserve their evidence timestamp", () => {
  assert.match(timestampAccuracyMigration, /p_payload_json ->> 'eventAt'/)
  assert.match(timestampAccuracyMigration, /CommMessage_DeliveredAt" = coalesce\("CommMessage_DeliveredAt", v_event_at\)/)
  assert.match(timestampAccuracyMigration, /CommMessage_ReadAt" = case when p_status_code = 'read' then coalesce\("CommMessage_ReadAt", v_event_at\)/)
})
