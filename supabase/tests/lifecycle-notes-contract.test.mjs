import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const appRoot = new URL("../../", import.meta.url)
const readApp = (path) => readFile(new URL(path, appRoot), "utf8")

const [migration, api, component, quotePage, bookingComponents, customsPage, galleryData, galleryPage, dexterEdge] = await Promise.all([
  readApp("supabase/migrations/20260825170000_quote_booking_customs_lifecycle_notes.sql"),
  readApp("multideck.client/src/lib/lifecycle-notes-api.ts"),
  readApp("multideck.client/src/components/multideck/lifecycle-notes.tsx"),
  readApp("multideck.client/src/pages/quotes-page.tsx"),
  readApp("multideck.client/src/components/multideck/booking-components.tsx"),
  readApp("multideck.client/src/pages/customs-declarations-page.tsx"),
  readApp("multideck.client/src/data/multideck-data.ts"),
  readApp("multideck.client/src/pages/components-gallery-page.tsx"),
  readApp("supabase/functions/agent-dexter/index.ts"),
])

test("lifecycle notes are immutable RPC-only tenant data", () => {
  assert.match(migration, /create table public\."OPS_LifecycleNotes"/)
  assert.match(migration, /create table public\."OPS_LifecycleNoteMentions"/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\."OPS_LifecycleNotes", public\."OPS_LifecycleNoteMentions" from public, anon, authenticated/)
  assert.match(migration, /"LifecycleNote_CompanyID" uuid not null references public\."cmp_Company"/)
  assert.match(migration, /char_length\("LifecycleNote_Body"\) <= 4000/)
  assert.doesNotMatch(api, /updateLifecycleNote|deleteLifecycleNote/)
  assert.doesNotMatch(migration, /grant (?:update|delete).*OPS_LifecycleNotes/i)
})

test("quote notes flow one way into the linked booking and Customs declaration", () => {
  assert.match(migration, /lower\(btrim\(p_subject_type\)\) = 'quote'[\s\S]*note\."LifecycleNote_QuoteID" = v_context\.quote_id/)
  assert.match(migration, /lower\(btrim\(p_subject_type\)\) = 'booking'[\s\S]*note\."LifecycleNote_SubjectType" = 'quote'[\s\S]*note\."LifecycleNote_SubjectType" = 'booking'/)
  assert.match(migration, /lower\(btrim\(p_subject_type\)\) = 'customs'[\s\S]*note\."LifecycleNote_SubjectType" = 'quote'[\s\S]*note\."LifecycleNote_SubjectType" = 'booking'[\s\S]*note\."LifecycleNote_SubjectType" = 'customs'/)
  assert.match(migration, /job\."Job_SourceQuoteID" = v_context\.quote_id/)
  assert.match(migration, /declaration\."CUST_JobID" = v_context\.job_id/)
})

test("reads and writes reuse the exact quote, booking and Customs permission boundaries", () => {
  assert.match(migration, /quote_api\.has_permission\(p_auth_user_id, case when p_write then 'Quotes\.Write' else 'Quotes\.Read' end\)/)
  assert.match(migration, /booking_api\.has_permission\(p_auth_user_id, case when p_write then 'Bookings\.Write' else 'Bookings\.Read' end\)/)
  assert.match(migration, /booking_api\.customs_access\(p_auth_user_id, p_subject_id, p_write\)/)
  assert.match(migration, /v_company_id <> v_actor\."Company_ID"/)
  assert.match(migration, /workspace_user\."Company_ID" = v_context\.company_id/)
})

test("mention targets are exact active recipients who can read the selected record", () => {
  assert.match(api, /p_subject_type: subjectType/)
  assert.match(api, /p_subject_id: subjectId/)
  assert.match(migration, /multideck_lifecycle_note_recipient_authorised/)
  assert.match(migration, /workspace_user\."User_AccessStatus" = 'active'/)
  assert.match(migration, /department\."Department_IsActive"/)
  assert.match(migration, /from public\."cmp_Users_Departments" membership/)
  assert.match(migration, /That person is not active or cannot read this record/)
  assert.match(migration, /That department has no active member who can read this record/)
})

test("person and department tags produce one permission-safe notification per recipient", () => {
  assert.match(migration, /with tagged_recipients as/)
  assert.match(migration, /select mention\."LifecycleNoteMention_TargetID" as user_id[\s\S]*"LifecycleNoteMention_TargetType" = 'user'/)
  assert.match(migration, /join public\."cmp_Users_Departments" membership/)
  assert.match(migration, /select distinct recipient\."User_ID"/)
  assert.match(migration, /recipient\."User_ID" <> v_context\.actor_user_id/)
  assert.match(migration, /insert into public\."Comm_Notifications"/)
  assert.match(migration, /'event_type', 'lifecycle_note_mention'/)
  assert.match(migration, /'action_url', v_action_url/)
})

test("Dexter can read, add and deterministically watch lifecycle notes", () => {
  assert.match(migration, /multideck_dexter_domain_lifecycle_notes/)
  assert.match(migration, /multideck_dexter_domain_lifecycle_note_targets/)
  assert.match(migration, /'lifecycle_note_targets', 'Note tag targets'/)
  assert.match(migration, /'visibleOn'/)
  assert.match(migration, /multideck_dexter_action_add_lifecycle_note/)
  assert.match(migration, /public\._multideck_add_lifecycle_note/)
  assert.match(migration, /'add_lifecycle_note', 'lifecycle_notes'/)
  assert.match(migration, /'lifecycle_notes', 'Operational notes'/)
  assert.match(migration, /insert into public\."AI_DexterWatchSignals"/)
  assert.match(migration, /watch\."AIDexterWatch_TargetID" = p_subject_id/)
  assert.match(migration, /v_note\."LifecycleNote_SubjectType" = 'quote'[\s\S]*v_note\."LifecycleNote_SubjectType" = 'booking'/)
  assert.match(migration, /multideck_lifecycle_note_target_authorised/)
  assert.match(dexterEdge, /lifecycle_notes data domain/)
  assert.match(dexterEdge, /Resolve person and department tags through lifecycle_note_targets/)
  assert.match(dexterEdge, /Watching for you evaluates new note signals deterministically/)
  assert.doesNotMatch(migration, /setInterval|cron|http_post/i)
})

test("the reusable UI is mounted on all three real workspaces and documented in the gallery", () => {
  assert.match(quotePage, /<LifecycleNotes subjectType="quote" subjectId=\{currentQuoteId\}/)
  assert.match(bookingComponents, /<LifecycleNotes subjectType="booking" subjectId=\{record\.workspace\?\.booking\.jobId \?\? null\}/)
  assert.match(customsPage, /<LifecycleNotes subjectType="customs" subjectId=\{declarationId \?\? null\}/)
  assert.match(galleryData, /id: "lifecycle-notes"/)
  assert.match(galleryData, /Quote notes[\s\S]*Booking notes[\s\S]*Job-related Customs notes/)
  assert.match(galleryPage, /id === "lifecycle-notes"/)
  assert.match(galleryPage, /previewState=\{previewLifecycleNotes\}/)
})

test("composer covers loading, empty, error, read-only, keyboard and direction-safe states", () => {
  for (const copy of [
    "Loading notes",
    "Notes could not be loaded",
    "No notes yet",
    "Save this record before adding notes",
    "You can read these notes, but your role cannot add a note here.",
    "The note could not be added. Your text is still here.",
  ]) assert.match(component, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(component, /aria-autocomplete="list"/)
  assert.match(component, /event\.metaKey \|\| event\.ctrlKey/)
  assert.match(component, /event\.key === "ArrowDown"/)
  assert.match(component, /event\.key === "Escape"/)
  assert.match(component, /data-i18n-skip dir="auto"/)
  assert.match(component, /sm:flex-row/)
  assert.match(component, /text-start/)
  assert.match(component, /\{t\("Notes"\)\}/)
})
