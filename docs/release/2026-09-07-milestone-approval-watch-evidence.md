# Hosted milestone approval and watch lifecycle

This continues the complete freight objective, following the
[Dexter email-intent correction](2026-09-07-dexter-email-intent-evidence.md).
Development client `c3b258a` is READY, Dexter is 162 and Booking workflow is 42.
No further implementation/deployment or shared configuration change was needed
to perform this test. All records below are synthetic/internal, not shipments.

## Approval before creation

Chrome conversation `13fd14d9-2e5b-4d92-a1d4-a3ff570aa216` requested a new Cargo
ready milestone on JE0991134 Sea leg 1, route
`bfae1c4c-28b1-43fd-9d0f-6cc072f10030`. The proposal clearly displayed the exact
Booking/leg/mode/type, Planned status, 18 September 2026 10:30 UTC and reference
`QA-DEXTER-MILESTONE-20260907-NOT-A-SHIPMENT`, with a synthetic-test reason.
It did not propose changes to the existing voided milestone, Quote or route.

Prepared action `09272ef4-b150-4cd1-8471-6db4ebb30c92` was
`record_booking_milestone`, `prepared`, Approve mode at 09:53:13.766979 UTC.
The database still contained only the earlier single milestone before approval.
After reviewing and clicking the normal Approve control, the action became
`succeeded` and the UI confirmed the approved change was saved.

New milestone `78c5d03b-2388-4214-8a83-d9d5b05aad22` was created at
09:53:38.911546 UTC. It is operator-sourced, recorded as Sea, Planned, with the
exact planned time and reference. Estimated and actual were null. Actor
`4467c131-7068-4a7e-8ebc-e51d2d4af01c` is recorded in both the normal milestone
audit and the approved-Dexter audit. A fresh Booking page displayed these values.

## Two failed setup paths — retain as open defects

1. An ordinary chat request to set up this exact watch correctly read the
   milestone, but incorrectly said “Watching for you is not connected in this
   workspace”. Source inspection confirms watch creation has a separate
   `create-watch` operation, not an ordinary chat action. The reply should guide
   the operator to the connected Watchers flow; it must not falsely describe
   the workspace as disconnected. Do not add generic autonomous actions merely
   to avoid this wording.
2. In Watchers → Watch something else, the natural-language request included
   the exact milestone UUID, Booking, leg and external reference. The compiler
   searched the descriptive phrase “Booking JE0991134, Sea leg 1, external
   reference QA-DEXTER-MILESTONE-20260907-NOT-A-SHIPMENT” in `booking_milestones`
   and returned no match. The domain currently resolves exact milestone/leg/job
   IDs or exact Booking references, not arbitrary combined descriptions. The
   watch-creation branch searches non-empty `targetSearch` even when a target
   ID may be present. No watch or milestone mutation occurred on this failure.

A simpler exact-ID request then succeeded through the same real Watchers form.
This is evidence for the saved watch and event lifecycle below, **not** a pass
for the failed natural-language setup or ordinary-chat handoff. Improve exact
target resolution and truthful handoff without broadening record permissions,
switching to a similarly named milestone or altering Customs/iCustoms paths.

## Exact saved watch and deterministic behaviour

Watch `f4a583c3-faad-49f0-a16e-f157d5c41d6d`, “QA milestone estimated time changes”,
uses capability `booking_milestones`, the exact new milestone ID, and
`{"field":"estimatedAt","operator":"changed","value":""}`. The owner is the
same operator above. Its action JSON is null: notifications only, no email or
autonomous action. The rule was verified in the database before the first edit.

All milestone edits and watch pause/resume used normal signed-in UI controls;
SQL was read-only evidence gathering, not a substitute writer.

| Saved transition | Watch state | Cumulative events / notifications |
| --- | --- | ---: |
| Estimated null → 18 September 2026 11:45 UTC | Active | 1 / 1 |
| Notes-only test text; estimate unchanged | Active | 1 / 1 |
| Estimated 11:45 → null | Paused | 1 / 1 |
| Estimated null → 11:45 | Resumed/active | 2 / 2 |
| Estimated 11:45 → null; temporary notes cleared | Active | 3 / 3 |
| Explicit unchanged save | Active | 3 / 3 |
| Planned → Voided, estimate still null | Active | 3 / 3 |

The visible alert identifies JE0991134, Leg 1, Cargo ready and “estimated time
changed”, and directs the operator to the saved milestone. The watch detail
shows the rule, state and alert count. Each matching change created one event
and one notification, not one per audit row. Pause and resume were independently
confirmed in the database before the relevant edits. Final watch state is
**paused**, with all three events/notifications retained.

Native date-field partial deletion first produced the correct recoverable
“complete, valid date and time ... or clear” validation. Automated blank fill
alone also failed to commit React changes and resulted in “No milestone fields
changed”; neither attempt is counted as a successful clear. Native input events
plus complete field clearing persisted null, confirmed by separate database
reads. Notes were cleared with keyboard selection/Backspace. No application
patch or DOM-state bypass was used to conceal this browser-tool limitation.

## Final state and preservation

The new milestone was voided at 10:00:58.632654 UTC; it cannot be reactivated.
Its planned time remains 18 September 2026 10:30 UTC; estimated, actual and
notes are null; the synthetic external reference and source remain. A fresh
Chrome load displays Voided / Read-only and the independent dates. This test
never recorded an actual cargo event. Eight attributed audit rows remain:
seven canonical milestone events and one approved-Dexter event. No-op and
invalid-form attempts did not add milestone history.

All 45 route rows and 38 Quote versions retain their full pre-test fingerprints
(`c4ccff3971ca6b28c9dc6f1db3260130` and
`48f5e0efb6d918d4019edbf8d9e47a28`, sorted by JSON text). The older voided
milestone remains full-row hash `d82d2b0da5589c7a76db22bbf851c10e`.
The Booking header's normal update timestamp changes with successful milestone
writes; it is not claimed unchanged. JQ20022 Original remains visible and Job
ref remains JOB-49. No new PDF/private-storage proof is claimed. No console
errors were observed in the operator edit and final reload tabs.

## Next work and remaining acceptance

Fix and test the two watch-setup defects above, then verify the improved normal
request through the real hosted path. Preserve exact target evidence and the
working deterministic watch implementation. Broader hosted revoked-user and
cross-project denial, relevant accessibility, remaining mode depth and full
Quote revision/email/PDF/accepted-version Booking application gates remain open.
This Sea creation/estimated-time watch test does not certify all watch operators,
every approved correction, other users or representative hosted Air/Road/Rail.

All existing approvals remain, including JQ20022 V2 send/accept/selective apply
and feature-preview environment repair. Customs/iCustoms is untouched; tracking,
PDF-logo and calculator remain deferred. The full goal remains active, not 95%.
