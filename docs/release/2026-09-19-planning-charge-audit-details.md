# Planning-charge audit disclosure — local staging

## Approved shared-development release — 21 September 2026

Applied only this migration to project `aqtwypsuijxlnvtxpuxe`, remote version
`20260921075102`. Live source inspected before applying; existing permission,
active identity and company checks preserved. No Edge deployment, frontend
deployment or GitHub push.

- Data-access regression rerun: 39 tests passed, including PostgreSQL fixtures.
- Live operational access preflight before/after: all 12 internal accounts passed
  with identical counts (90 Booking rows, 88 register entries, 33 Quotes).
- Null and unknown caller workspace reads rejected.
- Actual public workspace response includes revision 2 cost 100→125 and sell
  150→175, and original revision 1 addition. Saved history checksum unchanged:
  `39ac43eaf1a14e082ee8a95e2a0cfb7d`.
- Chrome localhost JI0991146 refreshed, Audit entry expanded: displayed
  `£100.00 → £125.00` and `£150.00 → £175.00`, attributed to Lee Wright.
  Left this entry open for user review. Booking remains Provisional, owner Harry.
- No charge edits/deletions performed during release verification. Added/deleted
  and non-price comparison coverage remains the local tests described below;
  live deletion acceptance and mobile visual checks remain outstanding.

The staging statements below describe the earlier checkpoint, superseded by this
release evidence.

User approved implementation; applying to the shared backend remains a separate
approval. Nothing in this microstep is pushed or deployed.

## Scope

Existing `planning_charges_saved` entries retain their summary, actor and date.
Clicking the summary expands a native keyboard-accessible disclosure. Differences
are matched by saved row ID, not table order. Code, description, supplier/customer
IDs, cost/sell, currencies, exchange rates, quantity and calculation basis are
compared. Added/deleted lines expose their saved field values. A deletion becomes
auditable when the edited charge set is saved, not when an unsaved row is removed.
Historical supplier/customer names were not captured; identifiers are labelled
honestly rather than substituting today's organisation name as historical fact.

Migration `20260919202654_booking_planning_audit_details.sql` extends only the
existing authorised workspace's event metadata projection, joining immutable
planning history by job and revision. It changes no grants, access checks, saved
events, charge writers, Quotes, Customs, financial posting or lifecycle rules.
An exact source anchor check fails closed on projection drift. Existing histories
are available without backfilling or rewriting audit records. No new Edge release
is intended. Verify the deployed source and permission boundary before release.

Dexter exception: manual planning-charge chat reads/writes and watches remain
explicitly unsupported under the existing feature boundary. This display change
does not introduce a new Dexter tool or watch capability; do not claim that it does.

## Checks

- Four diff tests pass: UK/US prices, all non-price fields, additions/deletions,
  zero/cleared values, stable identity/reordering and absent history.
- Extended disposable PostgreSQL lifecycle fixture passes with this actual
  migration and revision-matched before/after readback. Its simplified event
  projection is not full deployed-workspace authentication proof.
- Existing data-access regression runner passes (29 database/contracts plus 10
  restricted-surface contracts); this preceded the additional projection test.
- Client `tsc -b --pretty false` passes; `git diff --check` passes.
- Chrome localhost JI0991146: collapsed summaries preserved, click expansion and
  Enter collapse verified. Missing-history message is correct before deployment.
- Full populated disclosure visual/mobile and connected history verification
  remain pending the approved backend release; no live test record was modified.

## Release and acceptance

After separate approval, recheck the intended shared-development project and live
workspace definition, run access preflight, apply only this incremental migration,
then verify permitted colleague and denied caller access and immutable history.
Reload JI0991146 Audit: its existing price edit should show cost GBP100 to GBP125
and sell GBP150 to GBP175. Verify non-price edits and an explicitly authorised test
line removal/save, retaining the user's current working line. Check responsive
layout, keyboard, console/network failures, and preserved lifecycle controls.
Stop for user acceptance before Keep/Discard lifecycle testing.
