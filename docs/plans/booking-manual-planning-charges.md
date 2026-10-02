# Booking manual planning charges

## Approved product rules

- Accepted Quote conversion continues as In progress for a linked customer.
- Direct Provisional bookings may contain editable planning costs and sell prices,
  but no financial records or financial-report contributions.
- In progress bookings can receive additional operational charges. Expected costs
  and revenue are distinct from issued/posted invoices.
- Provisional cancellation requires Keep/Discard when planning charges exist;
  retain audit evidence, reopen to Provisional, never resurrect discarded rows.
- New charges added after reopening are a fresh set, not subject to an old discard.
- Cancellation of In progress jobs awaits Lee's boss's decision. Do not implement
  deletion, reversal or reporting exclusion on an assumed basis.
- Quote evidence, colleague's charge editor, Customs and posted Finance remain intact.

## Local checkpoint — 19 September 2026

Implemented foundation only in `20260919095813_booking_planning_charge_foundation.sql`.
Private planning sets use independent revisions and immutable before/after history.
Saves lock the Booking, enforce active-company/Bookings.Write access, validate row
shape and numeric bounds, and leave Booking details and source snapshots unchanged.
No writes go to Job_Costing_Lines or FIN tables. No access is granted to anon,
authenticated or service_role; no Edge route or frontend capability is enabled.

This is an unfinished staged capability, not a deployable user feature. A temporary
database guard prevents status changes/deletion for jobs with manual planning rows
until lifecycle handling is connected. Empty sets do not block existing workflows.
The guard must be replaced atomically by tested Keep/Discard and progression handling
before activation. Do not apply this migration to the shared backend in isolation.

Verification: the disposable PostgreSQL lifecycle runner applies the real migration
and passes planning save/readback, validation rollback, permissions, foreign-company
denial, stale revision, no-op audit deduplication, immutable history, removal history,
financial exclusion and lifecycle hold checks, alongside existing Cancel/Reopen tests.
This does not prove production schema parity, true concurrent-session races, browser
behaviour, or deployed operation. No live data was changed.

## Local checkpoint — manual Keep/Discard integration

`20260919102445_booking_manual_planning_cancellation.sql` extends cancellation and
the existing state endpoint to include manual planning rows in the charge count and
require a fresh explicit decision. Keep retains the working rows. Discard empties
the working set, increments its revision, and retains the complete rows, currencies,
rates and before/after state in immutable history. Reopening does not restore discarded
rows. The accepted Quote snapshot remains unchanged.

Source-Quote discard is tracked separately from the latest manual-charge decision:
new manual charges can be kept after an earlier discard without reviving old Quote
charges. Planning saves now update the Booking timestamp so an already-open
cancellation confirmation is rejected if somebody changes the charges first.

The initial lifecycle hold now permits the existing reviewed cancel/reopen transaction
but still blocks progression with retained manual charges until transfer is implemented.
No manual planning read/write grants, Edge route or editor capability are enabled.
Both migrations remain local and unapproved for shared deployment.

Verification: 7 Node tests pass, including the disposable PostgreSQL runner. Its
existing cancellation suite runs both before and after this migration. Added SQL
checks cover manual Keep/Discard/reopen, fresh decisions after discard, mixed Quote
and manual sources, stale cancellation rejection, denied users, immutable evidence,
financial exclusion and the progression hold. This is not browser or hosted proof.

## Local checkpoint — progression to operational charges

`20260919102957_booking_planning_charge_release.sql` replaces the progression hold
with transactional transfer through the existing `_multideck_finance_upsert_job_charge`
function. It validates the Booking's active, same-company legal entity and matching
planning base currency. It preserves amounts, rates, currency codes, planning row IDs
and calculation information in source metadata, with an immutable release snapshot
linking the planning revision to the resulting costing IDs. Quote release runs first
so mixed sources do not suppress each other. No changes to accepted Quote evidence.

Currency catalogue IDs are UUIDs, while legacy Job_Costing_Lines currency IDs are
integers. This change deliberately leaves the legacy IDs null, preserves codes in
source metadata and calculates local amounts using the shared editor's amount/ROE
convention. The Booking read adapter/editor must consume those codes, not infer them
from the job currency. Party validation and active-currency settings remain editor
integration requirements; this staged foundation is still unexposed.

Local PostgreSQL checks pass for exactly-once transfer, source/currency retention,
no double multiplication by quantity, mixed Quote/manual release, failed mid-transfer
rollback (including Quote inserts), missing/mismatched/foreign legal entities,
permission denial, report inclusion after progression, release-audit immutability
and no resurrection after discard. The real Finance upsert function is extracted
from the schema baseline into the fixture, not mocked. Report views remain fixture
views: actual hosted report calculations and concurrent-session races are not proven.

No frontend, Edge, grant or shared-backend deployment was enabled. The full pending
migration sequence requires a release review and Lee's approval before deployment.

## Remaining microsteps

1. Complete planning editor integration using the existing Quote charge component.
   Add authorised read/Edge access, party and active currency lookups and validation,
   preserve currency/rate semantics, expose recoverable saves and navigation protection.
   The private foundation currently rejects party IDs rather than trusting unvalidated
   identifiers; those validations are required before exposing it to the editor.
2. Verify the implemented manual cancellation/reopening backend through the editor
   and real browser: Keep, Discard, reload and fresh charges after a previous discard.
3. Verify the implemented progression transfer through the UI and connected reports,
   retaining source IDs, base amounts, currencies and history.
4. Enable additional In progress charges through existing Finance rules, protecting
   invoice-linked/posted records. Test expected reporting independently of posting.

Stop for Lee's testing at each usable checkpoint. Shared backend release, GitHub
push and deployment require explicit approval. No new UI has shipped at this checkpoint.

## Local checkpoint — editor data adapter

Added `multideck.client/src/lib/booking-planning-charges.ts` as the narrow adapter
between private planning sets and the existing Quote charge editor. It validates
Booking identity, revision and row data before hydration, preserves saved rates by
pinning them to the editor's explicit-rate mode, and serialises only supported
planning fields. UI-computed totals and supplied caller identity are not persisted.
Quantity is retained, not multiplied into amounts again. Empty discarded sets stay
empty; audit snapshots are never used as a fallback for missing working rows.

Supplier/customer selections currently fail explicitly rather than being silently
stripped, pending the authorised party-lookup and backend validation work. Active
currency catalogue checks also remain a backend integration requirement. This
adapter is not yet mounted in a Booking screen or connected to a public save route;
it does not claim to provide a usable manual-charge editor or navigation protection.

Verification: six adapter tests and the seven existing lifecycle/Edge tests pass
(13 total), including actual disposable PostgreSQL lifecycle checks. No shared data,
deployed functions, migrations, Quote controls or live Booking screens were changed
in this adapter step. Continue with the authorised read/save endpoint and editor
integration before requesting operator testing or approval to release.

## Dexter exception during foundation work

Manual planning-charge reads, writes and watches are unsupported and unexposed.
There is no new callable tool, public RPC grant or generic-table permission for them.
Existing generic lifecycle writes reach the temporary database hold. Before exposing
the feature, update chat and Watching for you with tenant-safe adapters and lifecycle
tests, or an explicit user-facing unsupported response and capability descriptions.
Do not advertise detailed charge watches based only on existing status watches.

## Local checkpoint — authorised read/save endpoints

`20260919110708_booking_planning_charge_access.sql` adds narrow service-role-only
read/save wrappers around the private planning store. The read returns the actual
set and revision, permitted currency settings and an explicit editable/blocked
state. Missing legal-entity configuration is not replaced with a guessed base
currency. Entity-specific currency settings override global settings, including
disabled overrides. Saves recheck those settings and base-currency rates, then use
the existing audited writer while holding the Booking lock. There are no direct
table grants and the unvalidated foundation function remains inaccessible to the
service role. Quote data and operational charges are not written by these endpoints.

Local `bookings-workflow` now has `planning-charges` and `save-planning-charges`
actions; caller identity comes only from authentication. An absent database RPC
returns unsupported for reads and a clear failure for saves. Permission, stale-save
and other errors are not masked as missing capability. Client API methods decode
the response and reject malformed or mismatched sets. No Booking screen invokes
these methods yet. Supplier/customer IDs are still rejected explicitly; party
lookup/validation and the editor/navigation integration remain required before
release. Do not deploy this intermediate checkpoint in isolation.

Verification: 17 targeted Node tests pass, including the disposable PostgreSQL
suite applying all four pending migrations. Added checks cover actual execution
as service_role, read-only/foreign/inactive users, private-table restrictions,
currency overrides, validation rollback, no-op audit deduplication, stale revisions,
no operational charges, Keep/Discard/reopen through public endpoints and retained
discard audit. Edge tests exercise the actual handler with a simulated database
transport; they do not prove hosted authentication or HTTP-to-live-database operation.
Client TypeScript checks passed. No backend release, GitHub push or shared data writes.

The pending migration adds explicit unsupported descriptions for manual planning
charges to both Dexter data-domain and watch-capability registries. Detailed charge
reads/writes/watches remain unsupported; no new Dexter tool or watch is advertised.
The actual chat/watch unsupported response still needs verification before release.

## Local checkpoint — planning editor and party validation

The Booking Finance tab now composes the existing Quote charge editor when the
backend explicitly advertises `planningEditorSupported`. Older backends retain
their existing screen. Save and Reload are explicit; pending changes guard tab,
navigation and lifecycle actions. A successful save followed by a failed Booking
refresh offers Retry refresh, without submitting the charges again.

The fifth pending migration, `20260919113132_booking_planning_charge_parties.sql`,
adds company-scoped supplier/customer choices and server-side validation. Supplier
IDs carry into operational charges on confirmation; customer IDs remain in source
metadata. Deleted or out-of-scope parties are rejected. No shared migration applied.

Browser verification used the actual editor in a clearly labelled, in-memory local
fixture, not the shared database: add/edit amounts, failed-save retention, saved-but-
refresh-failed recovery (revision remained 1), discard-unsaved confirmation and
read-only controls passed. The real localhost Booking still shows the older Finance
screen because the backend capability has not been released. TypeScript passed.
The targeted suite passes 18 tests, including the disposable PostgreSQL contracts
for all five pending migrations and discarded-party audit preservation.

Remaining release checks include real parent navigation/lifecycle browser guards,
responsive/keyboard coverage, source-currency financial readback and Dexter's actual
unsupported response. In-progress manual charge entry remains a separate microstep.
This is not hosted persistence evidence or approval to deploy. No GitHub push,
deployment or shared-record write was performed in this checkpoint.

## Local checkpoint — transferred-charge currency readback

`20260919151833_booking_planning_charge_readback.sql` is the sixth pending migration.
It adds original cost/sell and base currency codes to the existing authorised Booking
charge projection, only for freight rows sourced from manual planning. The migration
asserts its exact source anchor before replacing it; unexpected backend drift fails
rather than overwriting a changed function. No permission, grant, amount, operational
ledger or Quote projection is changed.

Booking Finance uses those codes to show both cost and sell in original currency,
alongside their stored base amounts. Missing amounts/currencies are explicit rather
than inferred from the Booking headline. Legacy charge rendering is unchanged.

Verification: 20 targeted tests pass; TypeScript and diff whitespace checks pass.
The disposable PostgreSQL runner executes the actual baseline charge SELECT with
the new migration against transferred rows (including EUR/USD), checking stored
amounts and source codes. It omits unrelated aggregate sections and does not prove
the full hosted workspace/authorisation path. Two client tests cover source/base
distinction, zero/missing amounts and unchanged legacy behaviour.

Code review confirms sidebar/navigation and browser Back dispatch the existing
cancellable navigation event, handled by the Booking pending-charge guard. This
is code-level evidence, not completed full-Booking browser testing. Remaining gates:
full-screen navigation/lifecycle testing, responsive/keyboard checks, Dexter's actual
unsupported responses, and shared schema/deployment review with explicit approval.
No push, deployment, shared-data write or migration application was performed.

## Local safety review — 19 September 2026

- Browser-tested the actual editor in the isolated in-memory fixture using keyboard
  add, currency type-ahead, manual ROE, invalid save, valid save and Reload/Escape.
  Fixed confirmation focus restoration to the Reload button. No console errors.
- Checked 375px/768px layouts visually and 320px document reflow (320px scroll width).
  The two-dimensional charge table scrolls within its own container. This does not
  certify the entire Booking shell or screen-reader behaviour.
- Three executable tests run the actual parent navigation handlers: dirty planning
  charges block navigation/unload/tab changes without queuing a surprise navigation;
  clean state allows navigation; existing Booking-details autosave queuing is retained.
  These are handler tests, not full mounted Booking/browser Back integration evidence.
- Added explicit unsupported instructions to both Dexter chat and watch compilation.
  Its contract test passes. No live LLM response has been claimed or tested. The broad
  Dexter suite has four existing failures, reproduced against HEAD: Customs provider
  controls, watch compilation, Home email subjects, and Gmail/Outlook access modes.
  Those unrelated implementations/tests were not changed or weakened.
- 23 targeted navigation/charge/backend tests pass; client TypeScript passes.

Read-only release comparison against the localhost target `aqtwypsuijxlnvtxpuxe`:
the cancellation migration is applied; all six new planning migrations are absent.
`bookings-workflow` is v51; its deployed difference from HEAD is the already-retained
cancelled-document-upload check. `agent-dexter` is v281: 54/56 retrieved files match
HEAD exactly; index.ts contains newer accounting/address instructions, and the
bundled inbox-api/signatures.ts also differs. **Do not deploy the local Dexter tree
wholesale.** Prepare the two prompt additions on the freshly retrieved deployed
bundle, preserving all other files, then recheck before any approved deployment.

Release remains approval-gated: six ordered migrations, the checked Booking function
and the narrow Dexter prompt patch. Verify live function anchors/schema and retain
current deployed bundles before execution. No GitHub push or frontend deployment is
implied. Connected internal-record testing must cover full Booking navigation/status,
Keep/Discard/reopen, financial release and actual Dexter unsupported responses after
enablement. No shared data was written during this review.

## Release package prepared — awaiting explicit approval

See `docs/release/2026-09-19-planning-charges-approval.md` for the exact six-migration,
two-function scope, staged package path, preserved live dependencies, failure plan
and operator checklist. A disposable rehearsal against the freshly retrieved live
Cancel/Reopen definitions passes. The optional `BOOKING_RELEASE_DEFINITIONS` test
input allows repeating that rehearsal without connecting tests to the shared database.
No deployment, migration application, GitHub push or shared-record mutation occurred.
