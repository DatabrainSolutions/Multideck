import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const attendeeStatus = read("../src/components/multideck/meeting-attendee-status.tsx")
const detailsPopover = read("../src/components/multideck/meeting-details-popover.tsx")
const calendarApi = read("../../supabase/functions/calendar-api/index.ts")
const calendarWorker = read("../../supabase/functions/calendar-worker/index.ts")
const attendeeMigration = read("../../supabase/migrations/20260904110000_calendar_provider_event_attendees.sql")
const attendeeSyncStateMigration = read("../../supabase/migrations/20260904113000_calendar_provider_event_attendee_sync_state.sql")

test("meeting details always explain the guest list and show the full roster when present", () => {
  assert.match(detailsPopover, /<DetailRow icon=\{Users\}>/)
  assert.match(detailsPopover, /invitees\.length \? `\$\{invitees\.length\} invited` : "No one invited"/)
  assert.match(detailsPopover, /<MeetingAttendeeList participants=\{participants\} maxVisible=\{4\}/)
  assert.match(detailsPopover, /Guest list unavailable/)
  assert.match(detailsPopover, /attendeeListState === "unavailable" \? "Guest list unavailable" : "No one invited"/)
  assert.match(detailsPopover, /This event has no invitees\./)
})

test("attendee rows use profile photos with initials as their fallback", () => {
  assert.match(attendeeStatus, /<AvatarImage src=\{photoUrl\} alt="" loading="lazy" \/>/)
  assert.match(attendeeStatus, /<AvatarFallback/)
  assert.match(attendeeStatus, /photoUrl=\{participant\.photoUrl\}/)
  assert.match(attendeeStatus, /participant\.role !== "organiser"/)
})

test("Calendar enriches tenant attendees and organisers without exposing private provider guests", () => {
  assert.match(calendarApi, /loadCalendarPeoplePresentation\(admin, actor\.Company_ID, meetingRows, participants/)
  assert.match(calendarApi, /\.storage\.from\("profile-photos"\)\.createSignedUrls\(paths, 900\)/)
  assert.match(calendarApi, /id: `organiser:\$\{organiser\.id\}`/)
  assert.match(calendarApi, /const participants = row\.CALProviderEvent_IsPrivate \? \[\] : storedProviderParticipants/)
  assert.match(calendarApi, /attendeeListState: row\.CALProviderEvent_IsPrivate \? "hidden"/)
  assert.match(calendarWorker, /const providerAttendees = providerParticipants\(payload, provider, connectionEmail\)/)
  assert.match(calendarWorker, /const participants = isPrivate \? \[\] : providerAttendees/)
  assert.match(calendarWorker, /CALProviderEvent_AttendeesJSON: participants/)
  assert.match(calendarWorker, /CALProviderEvent_AttendeesSyncedAt: attendeeSyncAt/)
  assert.match(calendarWorker, /const PROVIDER_MIRROR_BATCH_SIZE = 20/)
  assert.match(calendarWorker, /await Promise\.all\(batch\.map\(\(event\) => mirrorProviderEvent/)
  assert.match(attendeeMigration, /add column if not exists "CALProviderEvent_AttendeesJSON" jsonb not null default '\[\]'::jsonb/)
  assert.match(attendeeSyncStateMigration, /CALProviderEvent_AttendeesSyncedAt" timestamptz/)
})
