# Booking save response and Job ref correction

## Scope and confirmed causes

The full Booking read already used `workspace_with_document_groups`, which adds
the applied/pending Quote-version metadata and canonical document groups. All
save paths still returned the thinner `workspace_extended` response. Replacing
the screen state after Save therefore removed the Original badge until reload.

Migration `20260906174532_booking_save_complete_workspace_response` makes normal,
allocation-only and combined saves return the same complete workspace as Open.
It preserves the underlying write/permission/stale-check chain and service-only
RPC execution. No Quote application or history rules change.

The hosted test then revealed an independent existing Job ref defect: the input
updated `draftBooking.jobRef` but not `editableDetails.jobReference`, the actual
server allowlisted field. A normal Save at `2026-09-06 17:53:05.622308+00`
returned JOB-49 instead of the test edit; the database override was still null.
The one-line client correction sends that edit through the existing detail
handler. Booking ref and master Quote ref remain locked. This is existing-field
wiring, not a new backend capability or permission surface; Dexter/watch
capabilities are unchanged by this client correction.

## Verification and development database release

- Source migration commit: `5eb2f5a`.
- Migration SHA-256: `48022a0750d39aa6c3dc31458fa97b1dd80396214741bf03c3b7b8f6e8dcb133`.
- Broad PostgreSQL lifecycle suite passed with actual save/version projection
  functions. Normal, allocation-only and combined responses equal Open;
  original/pending, later-applied and standalone cases covered. Submitted
  version rows unchanged; stale allocation, wrong actor and foreign Booking
  saves rejected. Broad Auth/workspace and document fixtures remain explicit;
  this is not a hosted private-storage test.
- 34 document/version/sync/security contract tests passed, zero failed/skipped.
- Retained development-schema rehearsal passed the exact three-migration plan
  in `2026-09-06-booking-save-response-plan.json`. The schema fingerprint is
  `42e3d4bbe8680c4cfed131520517272c56921de497d7f065b2ab3227399f267f`;
  this is the retained pre-cutoff schema, not a new populated-tenant rehearsal.
- Isolated linked CLI dry run listed exactly one new migration. Applied only
  `20260906174532` to development project `aqtwypsuijxlnvtxpuxe`, then confirmed
  the ledger and service-only grants. No roles, seeds or Edge Functions changed.
- Security-advisor identities unchanged: 1555 before/after, zero additions or
  removals. Existing findings are not certified resolved.
- Synthetic JE0991134 full Job-header fingerprint stayed
  `5bb621af6cebe323a1c1dca2fc9265c7` across the schema apply.
- Chrome after the normal Save retains `JQ20022 Original` and Documents shows
  `JQ20022.pdf`, 80 KB, Version 1 in Quote documents; one document total. Applied
  version ID remains `44e4b47b-b9b3-42dd-ad76-30df16a4db66`, no pending version,
  `in_sync`. No customer email or acceptance action occurred.
- Two executed client-callback regressions pass: Job ref reaches the save
  details, locked references/Quote metadata survive, unrelated edits do not
  invent an override, and explicit clearing reaches the existing backend.

## Remaining verification

Client build, controlled Git/Vercel release and hosted Job-ref save/reload/restore
are pending at this checkpoint. The first hosted Save verifies metadata
retention, not persistence of the edited Job ref. No 95% or full-lifecycle claim.
V2 send/acceptance/selective apply still requires the outstanding approval.
Customs/iCustoms, Live/Sinay, PDF logo and future charge calculator remain outside
this change. The test watch remains paused with its two retained events.
