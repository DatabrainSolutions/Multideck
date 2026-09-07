# Air chargeable-weight validation — local foundation only

Pending migration `20260907124841_booking_chargeable_weight_validation.sql`
extends the existing cargo normalizer, preserving all prior numeric checks.
Chargeable weight uses exact decimal string transport and the Quote cargo
upper bound, without silently rounding to gross-weight precision. Omission
stays omitted; null/blank are explicit clears. Malformed, negative, non-scalar,
oversized and over-range input is rejected.

The disposable PostgreSQL lifecycle suite includes the actual public and
canonical save paths. Checks cover zero, high-precision decimals, maximum value,
grouped input, omission, clears, invalid later-line atomic rollback, private
helper privileges and unchanged Quote-version rows. No managed Auth or hosted
Air persistence is certified by this fixture.

**Do not release this foundation alone.** Typed Booking storage and its legacy
projection boundary, revision application, visible line/aggregate semantics,
Dexter read/approved-write/watch parity, current-schema preservation and hosted
Air verification remain required in this body of work. No AWB, screening,
Customs/iCustoms or live data changes have been made.

## Typed cargo foundation

Pending `20260907125119_booking_typed_chargeable_weight.sql` adds unconstrained-
scale numeric `JobCargo_ChargeableWeightKg` with the existing Quote weight bound.
Validated legacy per-line JSON is converted without rewriting its source value;
invalid legacy data aborts for review. No shipment total is distributed to lines.
The migration extends the existing stable-identity insertion/upsert with strict
single-match source guards, preserving existing permission, locking and audit
logic. Omitted weight retains the stored typed value; explicit null clears it.

`cargo_decimal_values` supplies exact typed text to the existing workspace
projection. `current_source_cargo_lines` uses the typed operational value for
Quote revision comparison. The PostgreSQL suite passes with populated legacy
conversion, high-precision values, omission/clear checks, invalid-write rollback,
unchanged Quote versions and a deliberately stale compatibility JSON value that
cannot override the typed value in revision comparison.

Fixture setup initially lacked the real comparison function and its source-line
columns; the fixture now loads their original function/DDL including the actual
Quote-line foreign key. An ambiguous fixture variable was qualified. No production
check was weakened to make these tests pass. Complete revision application,
Dexter field capability, UI line/total semantics and hosted/current-schema
validation remain open; do not release this migration chain yet.

## Dexter chargeable-weight parity — local

Pending `20260907125533_dexter_chargeable_weight_parity.sql` adds typed exact-text
chargeable weight to the existing cargo domain and its deterministic watch
projection, plus the existing approved action's field allowlist and registry.
It adds no action endpoint or direct table access and retains required approval.
The existing Edge label map already names chargeableWeightKg.

The PostgreSQL suite passes executable prepared-action tests in approve and full
modes: no unapproved mutation, approval executes exact decimal text, replay does
not repeat the mutation, and the domain reads the exact typed result without
financial fields. A changed-field watch fires for each distinct weight change,
not for no-op or unrelated-description edits; paused edits do not fire, resumed
clearing does. Foreign-actor and negative-value actions are rejected. These are
disposable fixtures, not hosted Auth/permission certification.

Next release-critical integration: `insert_accepted_quote_cargo` and
`apply_quote_cargo_fields` perform direct cargo inserts/updates, not the ordinary
canonical save. Their chargeable-weight JSON currently does not populate the new
typed column. Extend these existing paths and test conversion, selective updates,
clears and unchanged unselected/operator fields before any release. Merely
changing the comparison reader is insufficient; both pending typed and Dexter
migrations remain withheld until this and the UI/readiness gates are complete.
