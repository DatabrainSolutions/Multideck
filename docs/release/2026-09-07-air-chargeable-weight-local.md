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

The direct Quote writers are now integrated locally by pending migration
`20260907125826_quote_booking_typed_chargeable_handover.sql`. Initial conversion
copies typed Quote chargeable weight; selective revision application writes the
typed Booking value only for selected fields, including explicit null, and copies
it when inserting a selected new cargo line. Exact-single-match guards preserve
the existing function bodies, permissions, approval checks, locks and audit.

Verification: `node --test supabase/tests/quote-cargo-readiness-postgres.test.mjs
supabase/tests/booking-stable-items-postgres.test.mjs` passed both PostgreSQL 17
suites. Added executable assertions cover initial conversion precision, unchanged
unselected weight, exact selected updates and new-line weights, stale weight
approval rejection, explicit typed/JSON clearing and unchanged submitted snapshots.
Existing cross-workspace, replay, provenance, removal/history and event-adapter
assertions still pass. The handover harness loads the actual typed-column and
comparison sections from the preceding migration; the separate stable-items suite
exercises the full canonical typed-save migration and Dexter lifecycle.

All four Air migrations remain local and withheld. No customer response or hosted
data was changed. UI, subtotal/unknown/override semantics, full schema rehearsal,
and hosted persistence/Dexter verification remain release gates; this is not
evidence of a complete Air operational workflow.

## Local cargo UI and exact subtotals

The existing Booking cargo editor now edits `chargeableWeightKg` per selected
line, retaining raw decimal strings through the existing draft callback. Its
table shows line weights. A BigInt-based decimal subtotal avoids floating-point
rounding, treats zero as known, and labels partial/invalid coverage explicitly.
The accepted Quote value is separate and read-only; the existing shipment JSON
override is labelled separately and no longer falls back to the Quote when blank.
No automatic allocation, billable-weight calculation or AWB mutation is added.
The UI/accessibility skills guided reuse of the existing labelled controls and
semantic table/definition-list structure; no new visual component was introduced.

Verification: three `booking-chargeable-weight.test.mjs` tests passed, covering
exact totals, boundaries, missing/invalid coverage and the actual draft callback's
preservation of Quote/source metadata and shipment overrides. `npm run build`
passed (existing bundle-size warning). Isolated Chrome at localhost:3000, internal
Air test booking JI0991132, confirmed the missing-weight state; an unsaved edit to
1234.123456789 appeared exactly in the row and total; `bad` produced invalid-line
coverage rather than a total; zero displayed as a complete recorded total. Tab
left the input normally. The draft was discarded without saving to hosted data.

Still open: full keyboard/mobile/visual checks, field-level validation and the
existing shipment override's server validation/meaning across consumers. This
summary is operational information, not a new canonical billable-weight result.
Hosted save/reload remains withheld with the backend migration release.

## Validation follow-through

Pending migration `20260907131127_booking_shipment_weight_override_validation.sql`
validates the existing shipment override inside `save_booking_detail_fields`,
after its permission/tenant/row-lock checks. It reuses the cargo decimal validator
without allocating weights or adding a parallel save action. Blank becomes JSON
null; omission preserves the previous override. Existing helper grants remain.
The stable-items PostgreSQL suite now replaces its declared detail-stage stub
with the actual production function for this fixture. Public-save checks passed
for exact grouped decimal input, omission, clear, invalid values and atomic
rollback, unchanged cargo/Quote records, and unchanged private browser access.

The client Save guard now selects the invalid cargo line (or shipment override),
opens Cargo & equipment, focuses the field and links its inline error using
aria-invalid/aria-describedby. Four client tests and the production build passed.
Fresh isolated Chrome on local JI0991132 confirmed Save leaves `bad` line input
unsaved and focuses its error; a separate `-2` shipment override test focused its
own error. All test drafts were discarded; no hosted Save was submitted.

Dexter's new approved cargo action/watch remains explicitly per-line. This
validation patch adds no shipment-override action or permission. A shipment
override must not be interpreted as a cargo-line edit or distributed by Dexter;
shipment-level read/write/watch semantics remain a separate open parity gate
before the Air release. Mobile/full keyboard, fresh-schema rehearsal and hosted
verification remain open. There are now five pending Air migrations, none applied.

## Shipment override Dexter parity — local

Pending `20260907131646_dexter_shipment_weight_override_parity.sql` extends the
existing shipment-values domain/watch projection with the distinctly named
`chargeableWeightOverrideKg`. Existing monetary fields and actions are retained;
the domain scope now identifies shipment operational values. The proposal renderer
recognises both old and new scope labels so monetary before-values remain visible.

The dedicated `update_booking_weight_override` action requires exact Booking ID,
current timestamp, explicit decimal text/null and a reason. It uses ordinary
Booking save, validates through the shared normalizer, and records before/after kg
in audit. The database and Edge guards require approval in approve and full modes.
Dexter's intent gate, proposal changes/description and guidance distinguish this
override from cargo-line weights, money, Quote history and AWB documents.

Verification passed: actual PostgreSQL prepared-action lifecycle in both modes,
no unapproved mutation, exact domain reads, replay without duplicate writes,
changed-only notifications, no-op/unrelated changes, pause/resume/clear,
foreign-actor and stale/invalid-write rejection, unchanged cargo/Quote records,
and private action access. Existing shipment-watch target/permission restrictions
are reused. The 31 Edge approval/intent tests pass, including both English variants
and preserved monetary previews; Deno check passes with no dependency/lock changes.

This closes the local shipment-override parity gap, not hosted certification.
All six Air migrations and the Edge update remain undeployed. Next release gates:
fresh full-schema rehearsal, remaining visual/mobile checks, then controlled
deployment and hosted persistence/permission/Dexter evidence.

## Fresh deployed-schema compatibility rehearsal

Schema-only export on 2026-09-07: 7,959,312 bytes, SHA-256
`9cc902d283d5ea5b3c6af7061309d8bfe02f8890886ed41f9509e3e04a7da8f0`.
Source project: `aqtwypsuijxlnvtxpuxe`; export path:
`/tmp/multideck-air-preflight.GHr9Qx/development-schema.sql`.
No business rows, credentials or managed Auth/Storage contents were copied.
The live ledger now includes `20260907123952_preserve_undirected_booking_references`,
which is absent from this checkout and must be retained during release-history
reconciliation. The fresh schema includes it; no hosted migration was applied.

All six hash-pinned migrations in `2026-09-07-air-weight-migration-plan.json`
passed the populated PostgreSQL 17 rehearsal. Synthetic existing cargo exercised
high-precision text, explicit null and zero. Full old cargo columns/JSON, Quotes,
Booking headers, equipment, routes, memberships and watch signals were unchanged.
All pre-existing function ACLs and every function body outside the explicit
Air-change allowlist were unchanged. The new override action is service-only,
mandatory approval is retained and monetary watch fields remain available.

The first preservation assertion used search-path-dependent function signatures;
the fixture now takes and compares schema-qualified signatures consistently.
No migration or preservation requirement was weakened to pass the rehearsal.
Registry rows are explicitly synthetic surrounding fixtures, not a copy of live
registry configuration. Managed Auth/Storage remain empty declared fixtures.

Reproduce with `node supabase/tests/tools/freight-schema-rehearsal.mjs
/absolute/schema.sql --populated
--release-plan=/Users/leewright/repo/Multideck/docs/release/2026-09-07-air-weight-migration-plan.json`.
This proves fresh-schema compatibility and populated preservation, not live
permission denial, real data backfill eligibility or hosted save/reload.

## Shared development branch reconciliation

Fetched `origin/dev` at `a274304be78885cf54568f1dc4a80022064e97ae`.
Vercel lists its deployment
`multideck-app-btq1nmzd5-databrain-solutions.vercel.app` as READY. No deployment
configuration or alias was changed. The team branch contains Finance work, copy
updates and the deployed undirected-reference migration; these are now merged
into the freight branch instead of being overwritten by a later freight push.

The only textual merge conflict was the cargo table: keep the team's en-dash
empty-value convention and the new chargeable-weight column. All Finance,
Customs/iCustoms, baseline and reference files match the fetched team branch;
they were not manually edited for this integration. The deployed reference
migration is now present locally and must still be preserved in release history.

Post-merge checks passed: 35 client/Edge approval tests, both PostgreSQL freight
regression suites, Deno check for agent-dexter, and the production client build.
This is a local merge only, not a push or Air deployment. Mobile verification
remains open; earlier isolated Chrome tabs are no longer present.

## Local mobile and keyboard weight surface

`node supabase/tests/tools/booking-weight-browser.mjs` passes eight Chromium
cases: widths 320, 390, 768 and 1280, in en-GB and en-US. The harness extracts
the real cargo table/summary JSX, weight control, draft callback, Save guard and
focus effects. Surrounding state and the final validation receipt are synthetic;
external requests are blocked. It does not substitute for hosted persistence or
the complete application shell on a phone.

Verified: unknown weight stays incomplete; exact summed decimals; invalid line
and override inputs focus their respective aria-linked errors and do not reach
the local validation receipt; valid input proceeds; Tab leaves the input;
read-only mode has no editable inputs; page width does not overflow; narrow table
scrolling works via keyboard. No page JavaScript errors were observed. The table
is now an explicitly labelled/focusable scroll region, and decimal weight inputs
use 16px text below the small breakpoint to avoid mobile input zoom. Existing
desktop density and team copy remain unchanged. Production build passes.

Screenshots inspected at 320px (read-only and editing); latest artifacts:
`/var/folders/04/gmvqjprd4v787c8s72rprxk80000gn/T/multideck-air-mobile-lYiXtV/`.
Machine-readable run output: `/tmp/multideck-air-mobile-results.json`.

Fresh read-only hosted inventory: 21 cargo weight keys absent, 2 explicit null,
and all 78 shipment override keys absent. No existing non-null weight values
need backfill conversion at this observation. Recheck before deployment if data
changes. The Air release and hosted lifecycle/permission checks remain pending.
