# Dexter routing review: hosted finding and correction

## Scope and observed failure

The broad freight goal remains active. This checkpoint follows the actual
development Dexter chat through its read and prepare/deny paths for synthetic
Booking JE0991134, not customer acceptance or shipment execution.

- Development hostname: `https://dev.multideck.app`.
- Supabase project: `aqtwypsuijxlnvtxpuxe` (MultiDeck, eu-west-2).
- Conversation: `de62097b-92d4-4938-92a9-7877e7684414`.
- Booking ID: `093a6d3f-4507-4e7f-b0ce-571d3a7239e5`.
- Routing leg: `bfae1c4c-28b1-43fd-9d0f-6cc072f10030`, Sea, step 1.

Dexter correctly reported the exact leg and three unrecorded cut-offs. Database
readback confirmed all three NULL. Preparing a cargo deadline produced an opaque,
unexecuted action, but its card displayed `field`, `value`, route ID and concurrency
timestamps as five purported changes. It did not show the actual saved before
value or clearly identify the Booking and leg in its heading.

Root cause: the generic action preview selected `currentRecordsById[target_id]`
(the Booking header), whereas routing domain records are keyed by route ID.
It then rendered action arguments instead of the one operational field.

The unclear proposal `fe97e99e-782f-4264-9c31-f4a5410db251` was denied through
the normal UI. Database status is `declined`, execution audit count is zero,
and the routing row fingerprint stayed `237a775e5a43d965b6798c4e7cec73a6`.
Conversation and denial history are retained. No Booking mutation, customer
email, watch, Quote acceptance, Customs action or financial action occurred.

## Correction

Both streamed and persisted Dexter responses now use one routing review helper.
It selects this request's permission-checked `Job_Routing` record by exact leg ID,
checks Booking ID and both timestamps, requires the actual field's presence,
and refuses missing/stale/mismatched evidence. It cannot borrow another leg or
accept model-supplied before values. The existing canonical executor still
checks permission, approval, exact identities and freshness under database locks.

The existing review component receives a Booking/leg/mode heading and one
human-readable field change. Technical identity/concurrency arguments remain
intact for execution but are not presented as edited business fields. Null and
blank clears retain the saved before value; dates preserve explicit timezone and
fractional-second precision. UK and US English date formats are supported.
Off-mode fields and malformed/date-only deadlines cannot produce a review.

No database schema, grants, watch semantics, client component, branding,
notification settings or Customs implementation changes are needed. This is a
Multideck-owned approval surface using its existing controls.

## Local verification

- `node --test supabase/tests/booking-route-review.test.mjs supabase/tests/booking-cargo-dexter-approval.test.mjs`: 33 passed, zero failed/skipped.
- `node --test supabase/tests/dexter-security-hardening.test.mjs`: 9 passed, zero failed/skipped.
- Full `agent-dexter/index.ts` import graph passes Deno checking with
  `--no-config --no-lock --node-modules-dir=none`.
- `git diff --check` passes.
- Actual streamed/persisted branch tests confirm exact execution arguments are
  retained, card and stored proposal match, technical fields are absent from the
  review, and stale evidence never reaches preparation. Other cargo/allocation,
  mode-review and approval/intent regressions remain green.

## Release gate

Before release, fresh deployed Dexter 159 (JWT enabled) contains 18 files.
Seventeen are byte-identical to the checkout. The only changed existing file is
`agent-dexter/index.ts`; `booking-route-review.ts` is new. The planned release is
only `agent-dexter`, with JWT retained, and requires downloaded-source comparison
plus a fresh hosted proposal/deny check. No other Edge Function is included.

## Development release and hosted readback

Released source commit `09b7a7c` as Dexter **160 ACTIVE**, JWT verification
retained. Bundle SHA-256:
`37b61ffd09ab3e158ce8161826f5fb75c734bee92e9dfc87683f9e20131d9f92`.
Downloaded all 19 files after release: every file exactly matches the reviewed
release. All other Edge Function metadata is unchanged; no schema or project
configuration change was made.

A fresh real Dexter prompt produced proposal
`4538ecf2-c007-4068-9ac6-f40892d0d618` with heading
`Edit JE0991134 · Leg 1 · Sea` and one `Cargo cut-off` addition,
`18 Sept 2026 at 10:30:00 UTC`. The saved proposal has `before: null`,
`beforeKnown: true`, and the original ISO value/identities/concurrency tokens
remain in its execution arguments. The technical argument list is no longer
presented as business changes.

Chrome visual inspection confirms the readable card and normal controls.
Full page reload retained the same proposed change. Normal Deny completed;
both test proposals are now `declined`, this conversation has zero execution
audit rows, and the routing row retains the identical fingerprint recorded
above. Captured browser warning/error logs after reload and denial are empty.
No Booking field was applied. The chat/denial history is intentionally retained.

This proves the hosted read → proposed review → reload → deny path, not the
positive approved-write or watch lifecycle. Fresh responsive/keyboard and US
English browser review checks were not run; both English formats are covered
by the helper tests. No frontend source changed.

Positive hosted approved-write/watch lifecycle, accepted Quote revision/partial
apply and wider all-mode operational depth remain unfinished. This evidence does
not establish 95% completion. PDF-logo, live tracking, calculator and Customs
work remain outside this checkpoint.
