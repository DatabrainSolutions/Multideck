# Milestone watch setup correction

This is verified progress toward the full freight goal, following the two
failed setup paths in the [previous lifecycle test](2026-09-07-milestone-approval-watch-evidence.md).
It does not replace the eight-clash/all-mode objective with a watch-only goal.

## Exact target and truthful chat handoff

Source `5b70f31ac9a4b966cf9bfa230a1e8b9f82f27ebd` adds a milestone-only resolver.
An explicitly named milestone ID in the operator request takes precedence over
compiler-generated descriptive search text. Every milestone target, including
an ID without search text, is verified through the signed-in operator's existing
`multideck_dexter_query_domain` boundary. No service-role lookup is substituted.
The returned identity must match an exact ID; multiple, absent, inaccessible,
retired or non-operator records fail closed. The saved display label is derived
from verified Booking/leg/milestone evidence, not the model's proposed label.
The final create RPC independently retains its current-access and rule checks.

Ordinary chat now explains the dedicated Watchers → Watch something else or
`/watch` flow when the milestone domain is connected. A missing chat creation
action is not described as a disconnected workspace. Chat does not silently
create a watch or claim success. Compiler guidance preserves explicit milestone
IDs and uses supported identifiers rather than descriptive sentences for search.

Only the milestone capability takes the new resolver branch. Customs/iCustoms
paths, other watch types, permissions, approvals and watch evaluation are
unchanged. No schema, domain, write action or recurring LLM event evaluation is
added. Chat and watch setup are updated together; existing deterministic watch
lifecycle and denial tests remain the evidence for downstream evaluation.
Trust-critical copy stays Multideck-owned, in the existing English interface.

## Local verification and release

Two tests executing the actual pre-change Edge target-resolution branch failed
before integration: a supplied ID became a descriptive search, and an unchecked
model ID reached the later save boundary. Both pass after the correction.
The initial test harness needed its TypeScript fragment wrapped in a function;
that harness syntax error was corrected before collecting the behavioural failures.

Fifty-one unique focused tests pass, including six new executable resolver/Edge
branch/chat-instruction tests, email-intent/security regressions and the actual
PostgreSQL Booking/milestone/approval/watch/isolation lifecycle. Both en-GB and
en-US chat instruction cases pass. Complete Dexter import-graph Deno checking
and diff validation pass. The previously recorded unrelated Settings-copy
contract failure is not changed or claimed fixed; this is not an all-suite pass.

Fresh Git fetch found no incoming dev commits. Before release, all 20 deployed
Dexter 162 source files matched the expected checkout. Deployed only Dexter to
development `aqtwypsuijxlnvtxpuxe`: version 163, ACTIVE, JWT verification retained,
bundle SHA-256 `6075dac0f4da09a25dcacc881952af6b8dabfbef1c89339730d691d8102817a5`.
All 21 re-downloaded files match the reviewed candidate. Other function metadata
is unchanged; none removed. Anonymous access returns 401, not proof of hosted
cross-project/revoked-user denial. Supabase guidance informed exact source parity,
operator-scoped lookup and refusal to broaden access. No database migration,
frontend source or shared Vercel/team configuration change occurred.

Separate retained bundles: `/tmp/multideck-watch-target-before.YFsRLo` and
`/tmp/multideck-watch-target-after.KBKYKf`. Source was pushed to origin/dev through
the existing Git workflow, without a force push.
The exact remote ref is verified at `5b70f31`; Vercel deployment
`dpl_5Rgr4u78nneaCmWJpPZ5977E74kc` is READY for that SHA, with
`dev.multideck.app` assigned and no alias error (about 141 seconds building).
The hostname serves the unchanged frontend asset `/assets/app-DdoXZh8s.js`.
No frontend rebuild is presented as proof of the backend or hosted interactions.

## Hosted success, persistence and denial

Normal approved creation in Chrome conversation
`83b007b8-5526-4dbb-8f7d-dba14513db75` made synthetic Cargo ready milestone
`270f47eb-fe65-42ea-b9b7-c91722f3f6cd` on JE0991134 Sea leg 1. Exact external
reference: `QA-WATCH-SETUP-20260907-NOT-A-SHIPMENT`. Prepared action
`2e96fff0-dbc1-408a-b6d2-cad62609b225` succeeded after review/approval.
Creation time 10:10:55.414847 UTC; planned 18 September 2026 10:30 UTC,
estimated and actual null. No real cargo movement or prior milestone edit.

The formerly failing ordinary-chat watch request now reads the record and
provides the correct dedicated-flow handoff. Database count is zero watches
before using that flow. A fresh conversation page retains the handoff and does
not claim creation or disconnection.

The dedicated form then accepted the original style of descriptive request:
exact milestone UUID plus Booking, Sea leg and external reference, asking for
estimated-time changes/clears only. Watch
`5e82c85f-d3a2-49d3-a331-3315999bc6b3` was created at 10:12:29.292439 UTC with
the exact target, `estimatedAt` / `changed`, and null action JSON. Saved label
and visible Applies to both read `JE0991134 · Leg 1 · Cargo ready`. No email or
autonomous action was created.

The watch was paused through its normal control and the synthetic milestone
voided through the explicit Void milestone control at 10:13:34.666622 UTC.
Dates/source/reference/history remain; estimated and actual remain null.
The saved paused watch is visible in a fresh page, with zero events/notifications.

A fresh Watch something else request for that same retired ID returned
“Choose an active operator-recorded milestone you can access in this workspace.”
Database inspection confirms only the original paused watch, no duplicate.
This is a hosted retired-target denial, not a hosted foreign-user/tenant test.
The earlier tab did not submit a follow-up while monitor detail remained open;
fresh setup was used rather than counting an unsubmitted request as a denial.
The cause of that in-place continuation behaviour is not established and remains
a bounded browser/flow follow-up, not concealed as a passed interaction.

Full fingerprints of 38 Quote versions, 45 routes and both older milestones are
unchanged: `48f5e0efb6d918d4019edbf8d9e47a28`,
`c4ccff3971ca6b28c9dc6f1db3260130`, `9d27ac0632f63916ca0b3e914c7a87b9`
(JSON-text sorted aggregation). No provider mail, PDF or private-storage test is
claimed. No console errors were captured in the observed setup tab.

## Next full-goal work

Continue operational depth beyond milestones. Current Booking cargo exposes a
Hazardous flag but no typed dangerous-goods child records in its API or editor.
The existing `Job_CargoDangerousGoods` foundation contains per-line UN number,
shipping name, class, packing group, flashpoint, flags, emergency contact and
notes; a read-only development count is zero rows. This is an integration gap,
not authority to invent classifications or certify transport compliance. Reuse
the typed foundation with stable cargo identities, attributed corrections,
operator editing, approved Dexter parity and deterministic watches together.

Air screening, Road driver/appointments, Rail scheduling, per-leg readiness,
broader hosted isolation and full Quote revision/email/PDF/Booking acceptance
remain in scope. Existing approvals for JQ20022 V2 send/accept/selective apply and
feature-preview environment repair remain. Customs/iCustoms stays untouched;
tracking, PDF-logo and calculator remain deferred. Full 95% is not established.
