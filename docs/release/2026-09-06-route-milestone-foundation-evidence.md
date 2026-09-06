# Route milestone groundwork — local, not released

## Current release and scope

Continuation started from clean `d0805cd` on
`codex/freight-workspace-foundation`. Fresh `git ls-remote` still reports
`314ffc24205ec0b90158615be6208ca60090b71e` for `origin/dev`.
Vercel deployment `dpl_wXG81n8svqfnbVYAgDB7goEMq37r` remains READY for that
exact commit, with `dev.multideck.app` assigned and no alias error. The hostname
still serves `/assets/app-AooACiQa.js`. No Vercel configuration was changed.

Read-only development inspection still finds zero `Job_RouteMilestones` rows.
Accepted Original `44e4b47b-b9b3-42dd-ad76-30df16a4db66` retains
`md5(to_jsonb(version_row)::text)` = `5568ecb6e055ac0bd7dead5561a79436`.
Use the same JSONB serialisation when comparing this fingerprint; `row_to_json`
has different ordering/formatting. No hosted business record was written.
The previous hosted Job-ref save/reload/restore evidence remains authoritative;
it was not repeated here.

## Implemented locally

Migration `20260906182852_booking_route_milestone_foundation.sql` reuses the
existing typed milestone table rather than introducing a parallel JSON store:

- Separate planned, estimated and actual timestamps. Unknown values stay blank;
  no route-date defaults, automatic completion or tracking ingestion.
- One exact-leg, exact-record mutation with current Booking, route and milestone
  timestamps. Active membership, company ownership and Booking Read/Write
  permission checks precede mutation. The public RPC is service-only; its
  mutation helper is not directly executable by browser or service roles.
- Active dictionary choices, excluding Customs release. Source, tracking link,
  arbitrary payload, record type and leg identity cannot be rewritten by edits.
- Explicit clears retain unselected values. Completed requires an actual time.
  Supported statuses are Planned, Completed, Exception and Voided. Corrections
  require a reason and retain attributed before/after evidence in Booking audit.
- A new record captures the leg's mode and operator identity. Existing provider
  or unknown-source evidence is read-only, with raw provider JSON excluded.
  A later mode change does not relabel the old event: it remains readable and
  may be voided, not repurposed. Voiding retains times and source; no deletion
  or resurrection is exposed.
- Workspace reads return milestones under their exact leg, route update tokens,
  a supported marker and active type names. The milestone save returns the same
  complete workspace as Open, retaining document/version projections.
- Identical corrections are no-ops: no extra audit event or update timestamp.
  A stale repeated create does not create another event.

The Supabase instructions informed explicit-offset validation, private helper
permissions, consistent lock ordering and local database verification. Current
Supabase changelog and database-function documentation were checked; no relevant
platform change requires altering this design.

## Executed checks

`node --test supabase/tests/booking-stable-items-postgres.test.mjs` passes:
one broad executable PostgreSQL suite, zero failures/skips. Do not describe each
SQL assertion as a separately counted test. The added fixture exercises real
milestone save/read functions alongside the existing cargo, equipment, routing,
allocation, version projection, approved-action and deterministic-watch suites.

New assertions cover Sea, Air, Road and Rail round-trips; three distinct date
values with an explicit offset; clear and omission behaviour; complete Save/Open
response equality; actor attribution; no-op and stale retry; stale Booking/leg/
milestone tokens; malformed IDs; wrong Booking, actor or leg; revoked actor;
invalid dates, offsets, field types, lengths and status; unavailable dictionary
types; provider/unknown-source protection; mode-history preservation; voiding;
and unchanged route/transport data and submitted Quote rows.

The retained-schema rehearsal also passes with the exact four-migration plan in
`2026-09-06-route-milestone-foundation-plan.json`. Schema fingerprint:
`42e3d4bbe8680c4cfed131520517272c56921de497d7f065b2ab3227399f267f`.
This restores the retained pre-cutoff application schema into disposable local
PostgreSQL and applies the three previously released prerequisites plus the
new migration. Additional checks confirm existing milestone RLS, RPC grants,
private helper access and offset/clear conversion. This is a structural rehearsal,
not a fresh populated-tenant or cross-project Auth test. The executable lifecycle
suite has explicit broad Auth/workspace fixtures and synthetic dictionary rows;
it is not hosted browser, private-storage or new milestone-watch certification.

## Unfinished body of work and release gates

**Do not deploy this milestone migration alone or count the feature complete.**
There is not yet a Booking Edge action, client editor, Dexter milestone domain/
approved write or deterministic milestone watch. Existing approval/watch tests
prove regression preservation, not milestone parity. These interfaces must be
completed and verified together before release; this is an unfinished capability,
not an approved exception to the Dexter parity policy.

Next work: connect the exact-leg operator editor and clear source/history states;
add scoped Dexter reads, clearly reviewed approved writes and deterministic
matching/non-matching/pause/resume/current-permission milestone watches; verify
the real UI and failure paths; then rehearse and release the complete reviewed
slice under the existing controls. Fresh cross-project denial and hosted
milestone persistence/audit/watch proof remain required.

All eight clashes and the broader Sea/Air/Road/Rail/multimodal operational depth
remain in the goal. The V2 email/acceptance/selective Booking apply and preview
environment repair scope still need their recorded approvals. Customs/iCustoms
is untouched; tracking/Live/Sinay, PDF-logo work and the future calculator remain
deferred. No 95% claim, deployment, email, acceptance or live tenant mutation.
