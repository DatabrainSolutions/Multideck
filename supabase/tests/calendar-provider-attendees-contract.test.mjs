import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260904110000_calendar_provider_event_attendees.sql", import.meta.url), "utf8")
const syncStateMigration = readFileSync(new URL("../migrations/20260904113000_calendar_provider_event_attendee_sync_state.sql", import.meta.url), "utf8")
const api = readFileSync(new URL("../functions/calendar-api/index.ts", import.meta.url), "utf8")
const worker = readFileSync(new URL("../functions/calendar-worker/index.ts", import.meta.url), "utf8")
const popover = readFileSync(new URL("../../multideck.client/src/components/multideck/meeting-details-popover.tsx", import.meta.url), "utf8")
const attendeeStatus = readFileSync(new URL("../../multideck.client/src/components/multideck/meeting-attendee-status.tsx", import.meta.url), "utf8")

test("provider attendee presentation is bounded, private-safe and returned by Calendar", () => {
  assert.match(migration, /CALProviderEvent_AttendeesJSON" jsonb not null default '\[\]'::jsonb/)
  assert.match(migration, /jsonb_typeof\("CALProviderEvent_AttendeesJSON"\) = 'array'/)
  assert.match(worker, /const providerAttendees = providerParticipants\(payload, provider, connectionEmail\)/)
  assert.match(worker, /const participants = isPrivate \? \[\] : providerAttendees/)
  assert.match(worker, /CALProviderEvent_AttendeesJSON: participants/)
  assert.match(syncStateMigration, /CALProviderEvent_AttendeesSyncedAt" timestamptz/)
  assert.match(worker, /CALProviderEvent_AttendeesSyncedAt: attendeeSyncAt/)
  assert.match(worker, /const PROVIDER_MIRROR_BATCH_SIZE = 20/)
  assert.match(worker, /await Promise\.all\(batch\.map\(\(event\) => mirrorProviderEvent/)
  assert.match(worker, /await mirrorProviderEvents\(admin, connection, Array\.isArray\(payload\.items\)/)
  assert.match(worker, /attendee\.organizer === true/)
  assert.match(worker, /attendee\.optional === true/)
  assert.match(worker, /const organiser = object\(payload\.organizer\)/)
  assert.match(worker, /attendees,organizer,isOrganizer,responseStatus,responseRequested,transactionId/)
  assert.match(api, /storedProviderParticipants\(row\.CALProviderEvent_AttendeesJSON, people\)/)
  assert.match(api, /row\.CALProviderEvent_IsPrivate \? \[\]/)
  assert.match(api, /attendeeListState: row\.CALProviderEvent_IsPrivate \? "hidden"/)
  assert.match(api, /CALProviderEvent_AttendeesSyncedAt \|\| participants\.length \? "available" : "unavailable"/)
})

test("meeting details present organiser, invitee status, email and available photos", () => {
  assert.match(api, /role: "organiser", response: "accepted", external: false/)
  assert.match(api, /createSignedUrls\(paths, 900\)/)
  assert.match(api, /photoUrl: profile\?\.photoUrl \?\? null/)
  assert.match(popover, /MeetingAttendeeList participants=\{participants\}/)
  assert.match(popover, /MeetingResponseSummary participants=\{participants\}/)
  assert.match(popover, /Guest list unavailable/)
  assert.match(popover, /attendeeListState === "unavailable" \? "Guest list unavailable" : "No one invited"/)
  assert.match(attendeeStatus, /photoUrl \? <AvatarImage src=\{photoUrl\}/)
  assert.match(attendeeStatus, /participant\.role !== "organiser"/)
})

test("the edit title is a borderless H2-scale inline field without a leading provider mark", () => {
  assert.match(popover, /mode !== "reschedule" \? <MeetingProviderMark/)
  assert.match(popover, /aria-label="Meeting title"/)
  assert.match(popover, /border-0 bg-transparent p-0 text-\[20px\]! font-medium! leading-7!/)
  assert.doesNotMatch(popover, /mode === "reschedule"[^\n]*<Input aria-label="Meeting title"/)
})
