import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const migration = read("../migrations/20260904123000_calendar_provider_event_join_links.sql")
const api = read("../functions/calendar-api/index.ts")
const worker = read("../functions/calendar-worker/index.ts")
const dexter = read("../functions/agent-dexter/index.ts")
const preview = read("../../multideck.client/src/lib/local-calendar-preview.ts")
const popover = read("../../multideck.client/src/components/multideck/meeting-details-popover.tsx")
const providerMark = read("../../multideck.client/src/components/multideck/meeting-provider-mark.tsx")

test("provider mirrors retain native Google and Microsoft online meeting links", () => {
  assert.match(migration, /CALProviderEvent_JoinURL" text/)
  assert.match(worker, /payload\.hangoutLink/)
  assert.match(worker, /entryPointType === "video"/)
  assert.match(worker, /object\(payload\.onlineMeeting\)\.joinUrl/)
  assert.match(worker, /CALProviderEvent_JoinURL: joinUrl \|\| null/)
  assert.match(api, /joinUrl: row\.CALProviderEvent_JoinURL/)
  assert.match(preview, /https:\/\/meet\.google\.com\/abc-defg-hij/)
})

test("the existing compact join row opens and copies Meet, Zoom and Teams links", () => {
  assert.match(popover, /meetingProviderForJoinUrl/)
  assert.match(popover, /meet\.google\.com/)
  assert.match(popover, /zoom\.us/)
  assert.match(popover, /teams\.microsoft\.com/)
  assert.match(popover, /\{event\.joinUrl \? \(/)
  assert.match(popover, /<DetailRow icon=\{Video\}>/)
  assert.match(popover, /target="_blank" rel="noreferrer"/)
  assert.match(popover, /Join with \$\{meetingProviderLabels\[joinProvider\]\}/)
  assert.match(popover, /: "Open meeting"/)
  assert.match(popover, /aria-label=\{copied \? "Link copied" : "Copy join link"\}/)
})

test("event details use a source logo only when no recognised meeting link exists", () => {
  assert.match(providerMark, /google-calendar\.svg/)
  assert.match(providerMark, /auth\/microsoft\.svg/)
  assert.match(providerMark, /provider === "multideck" && calendarSource/)
  assert.match(providerMark, /calendarSource === "google" \? googleCalendarMark : microsoftMark/)
  assert.match(popover, /calendarSource=\{external \? event\.calendarSource : null\}/)
  assert.match(popover, /const provider = event\.provider === "calendar" \? urlProvider \?\? "multideck" : event\.provider/)
})

test("event details offer RSVP only for recognised Meet, Zoom or Teams invitations", () => {
  assert.match(popover, /external && event\.canRespond && joinProvider/)
  assert.match(popover, /if \(onDomain\("meet\.google\.com"\)\) return "google_meet"/)
  assert.match(popover, /return "zoom"/)
  assert.match(popover, /return "microsoft_teams"/)
})

test("Dexter and Watching for you expose join-link readiness without polling", () => {
  assert.match(migration, /'joinUrl', event\."CALProviderEvent_JoinURL"/)
  assert.match(dexter, /joinUrl is provider-supplied evidence/)
  assert.match(dexter, /never infer a link from the calendar source alone/)
  assert.match(migration, /CAL_ProviderEvents_JoinWatchSignal/)
  assert.match(migration, /old\."CALProviderEvent_JoinURL" is not distinct from new\."CALProviderEvent_JoinURL"/)
  assert.match(migration, /'joinReady'/)
  assert.match(migration, /insert into public\."AI_DexterWatchSignals"/)
})
