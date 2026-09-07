# Milestone API and Dexter parity — local checkpoint

Started from clean `94fd6ef` on `codex/freight-workspace-foundation`.
The prior foundation is extended, not replaced. No hosted data, migration,
function or frontend release was performed in this checkpoint.

## Connected in source

- The Booking Edge action `save-milestone` binds the authenticated caller to
  the canonical milestone RPC and returns the complete workspace. Stale data
  produces a recoverable conflict, never a success. Client API types expose
  the exact-leg evidence and save call; the operator editor is still pending.
- Two scoped Dexter domains expose saved operational milestones and the active
  milestone dictionary. New events use a separately read exact routing leg.
  Unknown or provider sources are read-only; Customs release is excluded.
  Limited search results are not described as complete history.
- One allowlisted `record_booking_milestone` action creates or corrects an
  exact event. Explicit changed-field pairs permit Actual time and Completed
  to be approved together without replacing planned/estimated values. The
  canonical permission, identity, timestamp, source and audit guards remain
  authoritative. New identities are generated on execution, not guessed by AI.
- Both streamed and persisted approval paths use current source evidence,
  readable Booking/leg/mode/milestone labels and exact before/after values.
  Timezone and microsecond detail survive review in en-GB and en-US. Creation
  explicitly reviews its milestone type and default Planned status. Old-mode
  evidence cannot be repurposed; voiding retains its history.
- Full access still requires explicit approval, in both the Edge decision and
  database executor. Opaque prepared-action replay does not repeat the write.
  Intent checks, registry descriptions, prompt guidance and watch target labels
  are updated with the capability.
- Deterministic watches target one saved operator milestone. They support
  changes to an allowlisted field or reaching a particular saved status, such
  as Completed. No timers, provider polling, recurring model calls or autonomous
  writes. Notifications identify the exact Booking/leg/event with readable
  field labels and retained Booking navigation evidence.

## Verification

The focused run passes **45 tests**, zero failures/skips:

```sh
node --test supabase/tests/booking-milestone-review.test.mjs supabase/tests/booking-cargo-dexter-approval.test.mjs supabase/tests/booking-route-review.test.mjs supabase/tests/booking-milestone-edge.test.mjs supabase/tests/booking-stable-items-postgres.test.mjs
```

The PostgreSQL test executes the real migrated milestone adapters, registry,
approval/execute/replay functions, watch evaluator and notification writes.
For each of Sea, Air, Road and Rail it verifies approved creation and completion,
no pre-approval mutation in Approve or Full access, exact reads, independent
dates, replay, matching and non-matching signals, pause/resume, explicit clears
and no-ops. Status-specific completion watches fire once and rearm after a
correction returns the event to Planned. Other assertions cover stale/invalid
proposals, foreign Booking/actor/record denial, rejected autonomous/timer rules,
revoked owner suppression, owner versus other-user history, current-permission
read/list/history denial, singular readable notifications and unchanged route
and submitted Quote evidence. Existing freight lifecycle tests remain included.

The first revoked-read fixture failed because it replaced a permission function
inside the same stable-read statement. The final fixture changes permission
state between requests, asserts the permission is actually false, then verifies
denial. No production permission check or acceptance assertion was weakened.

Review tests execute both actual response branches. A separate preparation
test captures the real server preparation function's single unapproved row
insert. Edge tests execute its actual milestone branch with a fake transport,
proving caller binding, complete response handling and errors without claiming
hosted JWT/CORS verification. Database Auth and broad workspace fixtures remain
explicit; they are not real cross-project authentication or private Storage tests.

Both backend entrypoints pass Deno type checking with global-cache npm resolution
(`--node-modules-dir=none --no-lock`); no repository dependency setup was changed.
The complete client TypeScript/Vite build passes with existing chunk warnings.
There were no visual component edits and no new browser verification is claimed.

The five-migration retained-schema rehearsal passes using
`2026-09-07-milestone-parity-plan.json`. It checks the actual application schema,
service-only adapter grants, mandatory approval registry and enabled milestone
watch trigger. Retained schema SHA-256 is
`42e3d4bbe8680c4cfed131520517272c56921de497d7f065b2ab3227399f267f`.
This is a local structural rehearsal, not a fresh populated-tenant rehearsal.
Supabase guidance informed the private adapter permissions, event-driven watch
implementation and database verification.

## Remaining release gates and full goal

Build the exact-leg operator editor with source/history, empty/error/read-only,
explicit timezone, keyboard and responsive states, plus its required component
gallery entry if reusable. Verify UI save/reload and failure behaviour, then
fresh schema/grant/advisor checks, controlled combined development release and
hosted persistence/approval/watch and cross-project denial evidence. Do not
deploy the foundation/parity migrations alone or mark milestones complete yet.

The earlier hosted Job-ref gate remains closed by its recorded evidence, not by
these tests. All eight clashes and deeper Sea/Air/Road/Rail/multimodal acceptance
criteria remain in scope. Revised JQ20022 V2 send/accept/selective-apply approval
and feature-preview environment repair scope remain outstanding. Customs/iCustoms
was not changed; Live/Sinay tracking, PDF-logo work and the calculator stay deferred.
No email, acceptance, shared Vercel setup change, live mutation or 95% claim.
