# Accepted Quote revisions: explicit clearing of Booking details

## Confirmed defect

The canonical apply function stripped nulls from the selected editable-details
payload. When a newer accepted Quote intentionally removed terms, the typed
Booking header was cleared but its compatibility field retained the previous
wording. The current Booking projection then fell back to that old wording.
The review could finish as applied despite this stale value.

The disposable PostgreSQL test reproduced:
`Cleared accepted terms reappeared from legacy details`.

## Correction

Migration `20260906113622_quote_sync_explicit_detail_clears.sql` retains an
explicit JSON null for each **selected** shipment type, customer-notes, terms
or subject-to-terms field. Unselected keys remain absent from the save payload,
so their current Booking values are retained.

The migration changes only that payload-building block in the existing
canonical function. It requires exactly one matching block and fails closed on
unexpected source drift. Existing permission checks, stale-review protection,
mode confirmation, cargo guards, wrappers and audit events remain unchanged.
It performs no backfill and does not rewrite issued Quotes or existing jobs.

## Evidence and limits

- The real local PostgreSQL projection/apply chain passes the original
  mixed cargo/notes partial-apply, stale-review, retry, explicit mode review,
  transaction rollback, source preservation and role-denial checks.
- Added 12 cases: four detail fields × null, empty string and whitespace-only
  accepted values. Each checks the canonical read, legacy field, unselected
  details, original submitted snapshot and before/after audit.
- The larger focused run has 13 passing tests, zero failures/skips. It combines
  the PostgreSQL lifecycle suite with existing review contracts and actual
  client comparison/callback tests. The 12-case matrix runs inside the one
  PostgreSQL test, not as 12 independent end-to-end browser tests.
- Identity/permission resolution and broad workspace/document reads remain
  explicit local fixtures in the parent suite. Version acceptance is seeded;
  no email, customer-link acceptance or hosted tenant lifecycle is proved here.
- No client or Edge Function changed, so no new UI/build/Edge deployment claim.
  git diff --check passes.

## Dexter and release boundary

This corrects an existing selected-field apply outcome; it introduces no new
write authority, domain or event type. Existing quote-update audit events now
contain the cleared value. Direct accepted-revision application through Dexter
remains the explicitly unsupported adapter in the current prompt: the operator
must use the Booking comparison screen. Do not claim a generic Dexter edit or
watch gains that capability from this migration. Completing that adapter is
still part of the broader freight goal.

This migration is **local and unapplied**. Before deployment, recheck the exact
target function and current migration ledger, rehearse on the current full
schema, run advisors, and verify the hosted selected-field readback. Do not
reapply or silently repair historical accepted changes without review.

PDF logo work and tracking remain deferred. No provider call, live customer
record, mailbox, financial transaction or team deployment setting was changed.

The Supabase/PostgreSQL skills informed the permission-preserving function
change and explicit verification limits; see the official
[database-function guidance](https://supabase.com/docs/guides/database/functions).
