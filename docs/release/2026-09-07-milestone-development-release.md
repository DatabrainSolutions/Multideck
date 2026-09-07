# Operational milestone development release

Release candidate `a9f8e6263aeafc13eaa03e6b6dd2df3c47fc02b5` on
`codex/freight-workspace-foundation`. This extends the original full freight
goal; milestone release alone is not evidence of 95% completion.

## Database and preservation

The previously started isolated CLI push completed. A fresh authoritative
ledger read confirmed both exact planned migrations present, so neither was
reapplied during recovery:

- `20260906182852_booking_route_milestone_foundation`
- `20260907075838_dexter_booking_milestone_parity`

The earlier isolated dry run listed exactly these two migrations, no seeds or
roles. The source hashes remain those in
`2026-09-07-milestone-development-plan.json`. The additional development finance
and two company-lifecycle-note migrations are retained; they were not our changes.

The old rehearsal process handle was no longer available after continuation.
A new disposable populated rehearsal against the retained latest schema passes:
SHA-256 `51f1b82b5c3881bfcb2de1ed3ae5c31a07c42f4b010ac439a81f7056ffe6ae6c`.
This schema includes the newer lifecycle-note migrations. All pre-existing
Quote/Booking fields and representative legacy milestone values, precision,
source and history are preserved. Managed Auth/Storage remain empty fixtures;
this is not hosted user authentication evidence.

Before any new synthetic milestone, live fingerprints exactly match the
immediate before-apply baseline:

| Relation | Rows | Full-row aggregate MD5 |
| --- | ---: | --- |
| Job_Header | 77 | `1dd399889709f7f0b7d508b779930bdf` |
| Job_Routing | 45 | `e51edb2cfbea046a0174ea07c05af212` |
| CusQuote_Versions | 38 | `73ee68f0a8424f20165f7c54e6187e10` |

Zero milestone rows existed at this check. The new registries have exactly two
domains, one action and one watch capability. The separate finance function's
definition MD5 remains `90ec980217e0828c7903917b6278a732`, with its service-only
ACL unchanged. Accepted Original `44e4b47b-b9b3-42dd-ad76-30df16a4db66` remains
full-row MD5 `5568ecb6e055ac0bd7dead5561a79436`.

Live milestone RLS is enabled. The public milestone Save RPC denies direct
anon/authenticated execution and permits service_role; its private mutation
helper is executable only by its owner. Explicit search paths remain set.
Security advisors have 1,555 findings before/after, with **zero added or removed
identities** compared by cache key, name and severity. Existing findings are
not declared safe or resolved; see the
[Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter).

## Matching backend and client release

Only `agent-dexter` and `bookings-workflow` were deployed to development
`aqtwypsuijxlnvtxpuxe`: versions 161 and 41 respectively, both ACTIVE with JWT
verification retained. No other function version/hash changed, none removed.
All 23 re-downloaded source files match the reviewed checkout byte-for-byte.
Private before/after source bundles are retained in separate temporary folders.

Fast-forward push of exact `a9f8e62` to `origin/dev` succeeded and was verified
with a remote ref read. Existing Git/Vercel deployment
`dpl_Cai1HhdhnZNHtAmLGg6EenvaKPBm` reached READY for that exact commit, with
`dev.multideck.app` assigned and no alias error. Build duration was about
145 seconds. The hostname serves `/assets/app-CtumeyCO.js`.
No Vercel/team/project/environment/domain configuration was changed. The
before-release project metadata remains unchanged. The source recovery tag
`codex/freight-before-milestone-release-20260907` points to `314ffc2`; it is not
authority or instructions for reversing database history.

## Hosted save, correction, stale rejection and retirement

Signed-in Chrome used synthetic JE0991134, exact Sea leg
`bfae1c4c-28b1-43fd-9d0f-6cc072f10030`. New milestone
`273b8213-e3d3-448a-b28d-77c70661ae8b` is marked
`QA-MILESTONE-20260907-NOT-A-SHIPMENT`. All writes used the normal operator UI.

- Created Cargo ready / Planned at `2026-09-07 09:15:42.710118+00`, with
  planned time `2026-09-18 10:30:00+00`, estimated/actual null and operator
  attribution. A fresh page load displayed the exact saved evidence.
- Corrected only estimated time to `2026-09-18 11:45:00+00`, saved at
  `2026-09-07 09:16:43.52593+00`. Planned remained exact, actual stayed null.
  Database audit records the attributed before/after and reason.
- An older open editor attempted a notes change. The database retained the
  newer record, but the original hosted request remained on Saving for several
  minutes. This was a real failed recoverability test, not a successful check.
- Retired the test through normal Void at `2026-09-07 09:20:37.645707+00`.
  A later fresh load shows Voided / Read-only, both independent dates and all
  three attributed create/correct/void history entries. No record was deleted,
  no actual event invented, and the voided record cannot be reactivated.
- The final page retains JQ20022 Original and one `JQ20022.pdf`, 80 KB,
  Version 1. Accepted Original full-row MD5 remains unchanged. All 45 route and
  38 submitted Quote rows retain their full pre-release fingerprints.
- Chrome reported no console errors in the observed verification tabs. This
  is not a complete captured network trace or a new PDF/private-storage test.

Chrome's automated datetime fill first displayed a value but did not commit it
to React; a later field edit restored blank. Native keyboard segment entry
worked and survived a subsequent edit, Save and reload. This tool discrepancy
was not addressed by bypassing the real form or inventing persisted evidence.

## Corrected non-retryable milestone conflicts

A rollback-only direct database diagnostic returned `40001` immediately for
the same stale snapshot. The business guard used a serialization-failure code
even though retrying identical operator input cannot succeed. PostgREST
[documents the historical repeated-retry problem](https://github.com/PostgREST/postgrest/issues/3673)
and supports [explicit HTTP error codes](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes).
The installed PostgREST version was not independently captured; the live
before/after result supports this diagnosis without claiming a captured retry log.

Source `6e52f45` adds only migration
`20260907092126_booking_milestone_nonretryable_conflicts`, SHA-256
`e6db42a2b042bde2d96b7f9b12f39c3f9183787e8ed09ceb431617cbcdf54682`.
It replaces exactly three business-conflict SQLSTATE values with `PT409` in the
private milestone helper. It does not catch genuine engine serialization
failures, relax guards or change unrelated Booking/Quote conflict paths.
The Edge branch returns the existing clear 409 message for both codes.
Dexter uses the same canonical mutation helper; approval, audit and deterministic
watch behaviour remain in place, with no separate write path or new capability.

- All 45 focused backend tests pass. The actual PostgreSQL suite then passes
  again with explicit assertions for stale Booking, leg and milestone snapshots
  and a missing prior milestone, requiring PT409 and unchanged evidence/audit.
  Approved Dexter writes, replay, watch lifecycle and denial tests also pass.
  Full Booking Edge import-graph Deno checking passes.
- Retained latest-schema structural rehearsal passes the foundation/parity/fix
  chain. The first temporary plan was rejected because hashes were omitted;
  hashes were supplied, not bypassed. Existing populated evidence remains
  separately described above, not relabelled as a new hosted identity test.
- Isolated live dry run and apply listed exactly the one new fix migration,
  no seeds/roles. Ledger presence is verified. The private function's definition
  differs **only** in those three codes: MD5 `dae08a756090b90708be5df13fb76fb7`
  before, `0b2a1b249ae8490c61ae03609d83d55c` after.
- Booking workflow is now version 42, ACTIVE, JWT retained; all three downloaded
  source files match `6e52f45`. Dexter remains 161 and other functions unchanged.
- After the fix, the original pending request became terminal with its old
  generic error. Repeating the same stale draft through the current backend
  promptly returned the explicit reload/review conflict. Entries remained
  intact and controls usable. Cancel opened the dirty confirmation; explicit
  Discard removed only the unsaved rejected test text.
- Full header/route/Quote/milestone hashes and all 39 Booking events are unchanged
  across the fix and repeat rejection. Milestone notes remain null; only its
  three successful historical events exist. Security-advisor identities remain
  1,555 with zero additions/removals. Initial unauthenticated checks of both
  deployed Edge endpoints returned 401; these are not cross-tenant JWT proofs.

## Concurrent development work

Before publishing the follow-up source, a fresh fetch found teammate commits
`00bef64` and `eb0f667` on dev. The non-fast-forward push was rejected without
changing the remote. Merged their finance/navigation changes into the local
branch as `32c2233`, with no conflicts or edits to their implementation. All
17 focused client tests and the complete TypeScript/Vite build pass in the
combined checkout (existing large-chunk warnings remain). Their two lifecycle-note
migration files have different timestamps from the previously applied ledger
entries: retain them, but do not blindly run a root-wide db push or reapply them.

Verified fast-forward push of combined `32c22334e3e79971db13beab3ccab80de4ecd992`
to origin/dev. Deployment `dpl_2uCgKkK56KkmKBK86eyppi57Cw9b` is READY for that
exact commit, approved alias assigned without error, about 140 seconds build
duration. The hostname serves `/assets/app-DdoXZh8s.js`. Project/team, framework,
Node version, configuration update timestamp and domains are unchanged in the
returned project metadata. These reads do not claim an export of every secret
or environment setting.
A fresh signed-in Chrome load on the combined release again shows Cargo ready
as Voided / Read-only with planned 10:30 UTC, estimated 11:45 UTC and actual
Not recorded. No console errors were captured in that tab. The complete earlier
write sequence was not repeated merely for this unrelated teammate merge.

## Failed read-only Dexter response — priority next step

Conversation `f50f977b-cfb5-40b5-9d11-74f08ece78b7` asked to inspect the exact
saved milestone, explicitly prohibiting changes, watches and email sending.
Dexter returned the correct saved values (Voided, operator, planned 10:30 UTC,
estimated 11:45 UTC, actual unknown, not editable) **inside an email draft**.
The response is therefore not a passed read-only chat lifecycle.

No Send control was clicked. Database action
`709702dc-3b74-4d1b-9755-77505b3804d0` is `send_email`, status `prepared`,
access mode `approve`, created `2026-09-07 09:31:29.467357+00`; not executed.
The unsent draft and conversation remain as diagnostic evidence. Do not approve,
send or retry that email action. Its recipients and subject are blank.

Concrete source reproduction: the actual `isExplicitEmailWritingRequest` and
`requestedEmailAction` helpers in `agent-dexter/index.ts` return
`{ writing: true, action: 'send' }` for the read-only request containing
"Do not ... send an email ...". Both use unscoped positive keyword matches and
ignore negation. This is a verified routing defect, not evidence that the model
invented the milestone values. Correct this intent boundary, including both
streamed/persisted preparation and Full access behaviour, before further hosted
milestone Dexter action/watch tests. Preserve genuine affirmative draft/send
requests, current approval and mailbox permissions. No provider/send test is
authorised merely by this failure; use local denied-send regressions first.

## Still open

Hosted approved milestone Dexter/watch lifecycle, broader cross-project and
revoked-user denial, remaining accessibility checks and representative hosted
Air/Road/Rail/multimodal depth remain unproven. The operator Sea milestone path
and its recovered conflict are evidence, not completion of the whole feature or
the full freight objective. Other existing logical-conflict paths using 40001
are an explicit follow-up risk; do not bulk-rewrite them without reproducing,
scoping and testing their complete lifecycle.

JQ20022 V2 send/accept/selective Booking apply and feature-preview environment
repair retain their existing approval requirements. Customs/iCustoms is
untouched; tracking, PDF-logo and calculator work remain deferred. All eight
clashes and deeper Sea/Air/Road/Rail/multimodal acceptance remain in scope.
