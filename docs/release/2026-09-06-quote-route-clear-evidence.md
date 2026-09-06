# Accepted Quote revisions: selected route clearing

## Outcome

Corrected a confirmed local Quote-to-Booking mismatch: applying an accepted
revision with a cleared departure date removed the header date but retained the
old route date. The Booking summary could therefore continue showing the old
date after the update was marked applied.

The same selected-field payload dropped clears for arrival, service level,
carrier and collection/delivery addresses. Replacing a coded origin or
destination with a named place could also retain the previous UN/LOCODE, which
took precedence over the new place in Booking reads.

Migration `20260906122039_quote_sync_selected_route_clears.sql` translates selected
clears into the existing singular-route save contract (empty string clears;
omitted key preserves). Selected origin/destination changes explicitly replace
or clear their corresponding header and route codes. It patches only the
canonical accepted-revision payload builder, with exact-match guards that stop
on unexpected source drift. No applied migration was edited.

## Evidence

- Before correction, the executable database regression failed with
  `Selected route clear retained old projection: estimatedDeparture / null`.
- The new 25-case matrix covers eight individual review fields, null/empty
  values, whitespace where supported, and coded-port to named-place changes.
  These are cases within the existing PostgreSQL test, not 25 browser tests.
- The canonical review/apply/read chain verifies: no Booking change before
  approval; exact selected results; unselected fields and route identity kept;
  populated actual timestamps, vessel, carrier reference and unrelated route
  evidence preserved; original and revised submitted snapshots unchanged;
  before/after audit; retry without another mutation or audit entry.
- Focused run: **13 tests pass, zero failures/skips**, covering the PostgreSQL
  lifecycle, review contracts and actual client review callbacks/rendering.
  The parent suite also retains partial application, stale-review, mode
  confirmation, transaction rollback and foreign-actor denial checks.
- A disposable populated full-application-schema rehearsal passed the prior
  29-migration freight chain plus both pending clear fixes. It retained the
  synthetic pre-existing Quote/Booking rows, typed quantities, registry and
  watch records and checked service-only entry points. The schema export was
  retained from 6 September morning, SHA-256
  `51aea33b08b19362112924c5f58fd5000c50330a3f28e1437c30d152bb5e0547`;
  this is **not a freshly verified hosted schema**.
- `git diff --check` passes. No client or Edge implementation changed.

Reproduce the focused checks:

```sh
node --test supabase/tests/quote-cargo-readiness-postgres.test.mjs supabase/tests/quote-booking-sync-review-contract.test.mjs multideck.client/tests/booking-quote-routing-review.test.mjs
```

The retained full-schema rehearsal tool accepts a checksum-bound release plan;
this local rehearsal used the 29 files in the existing freight parity manifest
followed by `20260906113622_quote_sync_explicit_detail_clears.sql` and the new
route-clear migration. Its managed Auth/Storage boundaries and populated rows
are explicit synthetic fixtures. Acceptance is seeded in the focused database
test; this does not prove sending incomplete Quotes, email acceptance, provider
delivery or a signed-in hosted Booking lifecycle.

## Scope and release boundary

Both clear fixes remain **local and unapplied**. Hosted function/ledger
reconciliation, advisors and selected-field browser readback are still required
before reporting them released. There is no data backfill or historical repair.

No iCustoms call, declaration, hosted Booking, mailbox, issued PDF, payment,
Calculator, tenant credential or team deployment setting was changed. Customs
is treated as potentially live and excluded from mutation. Logo and tracking
work remain deferred.

No new action or watch authority was introduced. The existing Dexter prompt
explicitly directs accepted-revision application to the Booking comparison;
the dedicated approved revision adapter remains a broader-goal gap, not a
capability claimed by this correction. Existing audit/event boundaries remain
in use. The Supabase/PostgreSQL guidance informed the scoped, permission-
preserving patch and explicit distinction between local and hosted evidence.

This is progress toward the original freight goal, not its completion.
