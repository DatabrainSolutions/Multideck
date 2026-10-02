# Booking charge preservation — implementation checkpoint

## Current checkpoint: 21 September development release

The operational Finance editor and preservation-first Quote charge review are
implemented. The approved shared backend is released; the frontend remains local.
See [release evidence and explicit limits](../release/2026-09-21-operational-booking-charges.md).
Earlier staged-only sections below are retained as history, not current status.
JI0991146 add/edit/remove/audit browser tests passed; its original GBP200/275 line
remains unchanged. Temporary test charges were removed with history retained.
Historical unmapped lines remain protected, and a populated accepted-Quote review
still needs a complete browser acceptance journey when a suitable revision exists.
No push/frontend deployment or change to the live-job cancellation policy.

## Approved scope

### 22 September: user acceptance and next microstep

User accepted the local Finance editor as the intended behaviour. Next is the
real accepted-Quote revision to Booking charge-review acceptance journey.
Read-only shared-development inspection found no suitable later submitted
revision awaiting acceptance. Existing converted Quotes have historical charges
without the new provenance; do not guess source mappings to manufacture this test.

Use a fresh, clearly labelled internal Quote with one GBP100/150 charge. Submit
through the normal PDF/email flow, record test acceptance using the supported
workflow, and convert it to an In-progress Booking. Add a separate Booking-only
line. Create and submit a revised Quote at GBP125/175, accept it, and verify:

1. Booking charges do not change automatically.
2. Review defaults to Keep and retains the Booking-only line.
3. Explicitly applying the Quote line changes only that line.
4. Audit records the real actor, reason and before/after values; reload persists.
5. Original accepted Quote evidence/documents remain unchanged.

Two clearly labelled internal test emails to lee@databrain.solutions are approved
for this journey. On 22 September, created JQ20029 through the normal repeat-Quote
UI from JQ20020. The original remains intact. V1 was emailed and received at
lee@databrain.solutions; its PDF opened and downloaded. Customer acceptance
created In-progress Booking JE0991147 after the acceptance-order correction.
V2 also sent/received with corrected billing; acceptance reused JE0991147 without
overwriting charges. Keep rehearsal passed; explicit per-line apply changed only
the matched Quote charge to GBP125/175, retaining Booking-only GBP20/30.
Payer review then applied the visible customer; Booking is in sync with V2.
Both approved test emails are now used.
The first save exposed the persisted repeat-copy reason being rejected on edits.
Migration 20260922105749 fixes only that guard, retaining original provenance and
all outer version/access guards. Shared release and rollback-only real-schema
save/stale/anonymous/source-preservation tests passed; 40 access tests passed.
No GitHub push or frontend deployment authorised.

Customer / Billing is always the payer (user confirmed 22 September). New saves
and future PDFs must use that visible customer/address, not an older hidden payer.
Already issued PDFs and version snapshots remain immutable. Verification details
are recorded in `docs/release/2026-09-22-freight-flow-verification.md`.

### Completion scope and deadline

Prototype ready, including testing, by 26 September 2026. Work in order: finish
Quotes and issued/versioned PDF evidence; accepted Quote conversion and charge
review; manual Provisional Booking, charges and cancel/reopen; Customs-ready
handover for the Customs team. Fix blocking bugs in grouped batches. Ask about
unclear business rules. No iCustoms submission. Supplier commercial decisions,
predefined charge-code catalogue, tracking and PDF-logo work remain deferred.
In-progress cancellation and Complete financial corrections remain undecided.

Future charge-code direction supplied by the user: predefined codes managed in
a separate tab, selected from Finance through a dropdown or type-to-search code
input. This is a future catalogue/selector, not authorised implementation in this
microstep. Preserve current free-entry behaviour and historical audit values.

Reuse the Quote charge editor in Booking Finance for direct and Quote-converted
In progress bookings. Preserve accepted Quote evidence. Quote revisions require
an explicit line-level review; never replace the entire Booking charge list.
Booking-added lines remain independent. Removed Quote lines require explicit
restoration. Financially linked/posted lines require a correction workflow.
Audit additions, changes, removals and review decisions under the authenticated
operator, independently of Booking ownership. Cancelled records remain read-only;
Complete corrections and In progress cancellation remain separate product decisions.

Shared backend release is authorised only after compatibility/safety checks.
No GitHub push or frontend deployment is authorised by this work.

## 21 September 2026: local decision-planner checkpoint

Added `supabase/functions/_shared/booking-charge-review.mts` and ten executable
tests. The planner returns explicit operations and before/after decision evidence;
it does not perform writes or provide an access boundary. Missing selections keep
all records. It rejects stale tokens, duplicate decisions/identities, incompatible
actions and ambiguous mappings. It preserves Booking-added and unknown-origin
rows, and blocks unmatched additions while unknown rows could be duplicates.

Read-only shared development probe (`aqtwypsuijxlnvtxpuxe`) found 12 costing rows
with no source table or source-line ID, and one planning-origin row with a source
line ID. Do not infer provenance from description, price or row order. Existing
unknown-origin rows need explicit matching, not an automatic backfill. Future
conversion must record stable source lineage. These counts are a point-in-time
observation, not a permanent assumption.

Verification: `node --test supabase/tests/booking-charge-review.test.mjs` passes
10 tests; `git diff --check` passes. No shared writes, migration, release, browser
acceptance or application integration has happened in this checkpoint. The old
charge replacement path is still present: this checkpoint does NOT protect live
records yet and must not be described as an enabled feature.

## Required continuation before release

1. Add durable source mapping and removal evidence without rewriting historic
   Quotes or assuming origins of legacy charges. Explicit legacy mapping must
   require authorised operator review and record that decision.
2. Build the authorised review/read and atomic apply transaction. Re-read under
   lock; token must cover Quote revision, current charges, mappings, removals and
   financial links. Recheck links and permissions at save time. Persist stable
   costing IDs and before/after audit; never use delete-all/reinsert.
3. Integrate the line-level review into the existing Quote update screen, including
   keep/replace/remove/add/restore, missing-source mapping and protected-line copy.
   Retire or guard every old callable bulk replacement path for the affected jobs.
4. Connect the shared editor to audited operational charge saving, independently
   of Quote origin. Keep planning and financial inclusion rules distinct. Protect
   individual linked lines without disabling unrelated eligible lines.
5. Cover authorised colleagues, denied callers, stale saves, rollback, mixed
   origins, removals, financial links, Quote updates after Booking edits and
   non-resurrection with executable PostgreSQL tests. Integrate required access
   regression and Dexter read/write/watch support or an explicit exception.
6. Compare current deployed definitions/bundles immediately before release;
   preserve concurrent changes. Run pre/post access probes and browser acceptance
   against authorised internal records. Do not deploy a stale Dexter bundle.

Unit tests are not proof of transaction safety, live authorisation, persistence,
reporting or the intended UI. Do not release the planner alone.

## 21 September 2026: private database provenance foundation

Added `20260921144654_booking_charge_provenance.sql`, generated through Supabase
CLI. This is staged, **not applied to shared development**. No existing routines
are replaced and no charge amounts, Quote records or historical data are backfilled.

The private mapping writer checks active authenticated identity, Bookings.Write,
same-company Booking/line membership, In progress status, exact row freshness,
accepted source Quote membership and unique source identity. Existing source
version/line IDs cannot be relabelled. It records the operator's reason and source
snapshot in the same transaction as the Booking audit and update timestamp.
Recorded mappings are immutable; correction support is intentionally not exposed.
Private tables have RLS and no browser/service-role grants. No callable Edge
action, public RPC or UI is enabled by this intermediate migration.

Financial protection checks document links, accruals, WIP, releases and period
allocations, including draft evidence. Future charge mutation must coordinate
with concurrent financial linking; this mapping foundation alone does not prove
that race is solved. Its restrictive costing foreign key means removal must use
retained/soft-removed charge identities, not delete/reinsert. Do not deploy it
until the replacement review flow handles those retained identities end to end.

Verification: actual PostgreSQL test passes authorised-colleague mapping, denied
unknown/inactive/read-only/foreign callers, stale row rejection, all five financial
evidence categories, accepted-version and duplicate-line checks, duplicate mapping
rollback, immutable mappings, unchanged amounts/Quote snapshots and transaction
rollback. It uses minimal dependency fixtures, not the entire production schema;
the permission helper is a test fixture. Access regression now includes this test:
40 checks passed; 10 existing planner tests passed; whitespace check passed.
No simultaneous-session race or browser flow has been tested for this capability.

Dexter exception while staged: origin matching and charge-revision decisions have
no exposed reads/writes/watches. Before release, integrate approved deterministic
capability support or a clear unsupported response into the current deployed
Dexter bundle. Do not advertise this intermediate private foundation as available.

Next: transactional review/apply and retained removal state, guard old bulk-save
paths, then the review/editor UI and release gates. Existing shared bulk replacement
behaviour remains unchanged until that verified release; no live protection claim.

## 21 September 2026: private audited removal transaction

Added staged `20260921145254_booking_charge_removal.sql`. It archives the complete
costing row, its stable ID, reason and authenticated actor before deleting that
single active row. The origin mapping remains immutable. This avoids leaving a
zero-value placeholder in active financial charge lists and does not alter the
accepted Quote. The whole operation, Booking timestamp and audit are atomic.

This supersedes the earlier proposed soft-removal representation: only our new,
unreleased provenance table's costing FK is replaced by a same-Booking insert
check and audited-delete guard. Existing financial FKs are not changed. No live
data or shared schema has been modified. Unknown origins must be explicitly
mapped before removal; financial evidence blocks removal. The private function
has no caller grants or API route, so it remains unavailable to UI and Dexter.

The real PostgreSQL fixture now executes both migrations and covers successful
removal, archived exact values, stable origin history, correct actor audit,
unchanged Quote and other Booking charges, stale/foreign/unknown caller denial,
financial-document protection, Complete-state denial, rejected direct deletion,
repeated removal and transaction rollback. This does not establish concurrency
with live financial linking or protection against legacy Quote-sync reinsertion.

Remaining before release: protect source lineage across new conversions, guarded
update/add/restore transactions and old bulk save/sync paths, line-level review
and operational editor integration, compatibility/readback checks, Dexter parity,
and browser acceptance. Do not deploy the staged provenance/removal migrations
alone. User's conditional backend approval remains recorded; no new approval is
needed unless a material risk or scope change is identified.

## 21 September 2026: repeat removal and explicit restoration

Staged `20260921145852_booking_charge_restoration.sql` gives each removal its
own immutable event identity and records explicit restoration separately. An old
removal cannot authorise another unlogged deletion. A restored-and-removed-again
line cannot be restored using the earlier removal decision. Direct reinsertion
of an outstanding removed identity is rejected. The private restoration checks
active authorised actor, company, status, exact archived snapshot, financial
evidence and duplicate restoration, and atomically restores the full saved row
with an actor-attributed audit event. Original line metadata is retained; the
restoration actor/time is recorded separately rather than rewriting history.

This does not restore provisional discarded planning charges, and is never called
by Booking reopen. Explicit operational restoration remains a future reviewed
action, not an automatic side effect of receiving an updated Quote.

PostgreSQL fixtures verify repeated remove/restore cycles, retained histories,
rollback, denied direct deletion/reinsertion, stale/unauthorised/status/evidence
rejection, actor audit, unchanged unrelated charges and accepted Quote. These
are isolated schema fixtures, not live concurrency or full production-schema
verification. The function and tables remain private and unexposed. No shared
release, push, frontend deployment or test-record change occurred.

The remaining integration/release gates above still apply. In particular the
operational editor and safe Quote-sync replacement are not completed by this
checkpoint; no additional user-facing capability is available for testing yet.
