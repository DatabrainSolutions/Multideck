# Provisional cancellation — local rules foundation

First segment only: pure backend decision policy and six passing isolated unit tests. No migration, persistence adapter, financial reporting change, UI integration, deployment or shared database write is included. These are not database integration tests.

Agreed rules: retain the Booking and its reference; cancellation remains distinct from completion; explicitly keep or discard planning charges; retain discarded evidence; reopen the same record to Provisional; flag prices/dates for review without rewriting them. Actual financial records require Finance review, not silent removal.

The policy returns an action plan, not a saved result. A future transaction must check actor/tenant/Bookings.Write and expected revision, lock the job and charges, persist full snapshots and immutable audit events, enforce cancelled-state reporting exclusions, preserve documents/reference, and prevent duplicate or discarded Quote charges returning. A reference remains reserved by retaining its original record, never allocating a replacement.

Dexter exception at this checkpoint: cancellation/reopening is not exposed to chat or Watching for you because no safe transactional capability exists yet. Do not advertise this helper as a working action. The integration segment must provide approved allowlisted writes, tenant-safe reads and deterministic audited status events, or an explicit unsupported response; no recurring LLM evaluation.

Next segment: additive migration and transactional adapter with isolated Postgres tests (scope denial, concurrent edits, cancellation charge snapshots, repeat cancel/reopen, report exclusion and unchanged financial evidence). Then UI wiring using existing controls and user testing. Shared database application, push and deployment require separate approval.

## Database segment — implemented locally

Added `20260911145259_provisional_cancellation_audit.sql` and a service-only `booking_provisional_action` transaction. It checks active company membership, Bookings.Write and a mandatory expected timestamp, locks the existing job, rejects actual financial/costing records, and writes cancellation state plus append-only snapshots and Booking audit events. Cancel/reopen retain the same job/reference and source Quote evidence. Cancellation/reopening through ordinary status saves is prevented for this flow; cancelled headers cannot be edited and retained references cannot be deleted/reassigned. Reopening records a price/date review requirement.

Planning charges in this segment are the deferred accepted-Quote snapshot, not new manually entered provisional charge lines. Keep retains those charges for exactly-once progression; Discard suppresses future transfer without rewriting the accepted Quote. Existing historical costing lines deliberately require Finance review. Manual planning-charge editing is not implemented.

Both job-finance summary views exclude the new cancellation marker. The local finance-accruals change uses the same marker for month-end candidates; it must be deployed AFTER the migration and BEFORE enabling the cancellation UI/API. Deploying it before the column exists will fail closed with a query error. Nothing has been applied or deployed.

Seven tests pass: six policy cases and one real disposable-Postgres migration suite containing previous lifecycle checks plus cancellation assertions. Checked missing/foreign/reader access, missing/stale revisions, mandatory charge choice, failed-operation rollback, source/reference retention, immutable history, cancelled finance denial, summary/month-end candidate exclusion, repeated discard cycles and kept-charge transfer exactly once. The aggregate save and selected pre-existing tables/functions are fixtures; this is not a full production schema or live end-to-end test. Concurrent-session races, full report screens and managed Supabase advisors remain unverified.

Release remains on hold: next implement the authenticated Edge adapter and permission-safe read projection, expose review/charge state in the existing UI, protect relevant child edits while cancelled, and wire Dexter approved actions/read/watch lifecycle (or explicit unsupported responses). The database function is intentionally not routed through existing generic Dexter actions or the browser yet. No claim of usable cancellation in the app or complete deployment readiness is made.

## API and UI segment — local, not deployed

Connected the explicit `provisional-action` Edge route to the verified-token actor and validated action, reason, exact loaded timestamp and charge decision. `booking_provisional_state` is permission/company scoped and supplies cancellation/reopen eligibility, charge count, Finance-review and price/date-review flags. Workspace reads and ordinary save responses include this projection; missing RPC on an older database advertises no support. These are server-side facts, not client-supplied eligibility or identity.

The Booking screen uses its existing Dialog, Button, Textarea, colours and spacing. The new section appears only when the backend advertises support and the record is Provisional or a recorded provisional cancellation. Explicit reason and Keep/Discard choice are requested where applicable. Cancelled Details are read-only. Reopening returns to Provisional with a review reminder. A successful mutation followed by failed refresh retries the refresh only; failed requests retain the reason/decision. No new shared/gallery component or tab/layout replacement was introduced.

The migration also guards direct parent-linked writes to operator-owned cargo, containers, routing, parties, references and locations for cancelled records. Existing Customs/tracking code remains untouched. This is not blanket protection of every child/attachment or integration path: indirect detail tables and attachment workflows need a final release-scope audit before shared enablement.

Dexter write exception remains explicit: charge-choice cancellation/reopening is not supported via generic update_booking; the same database guard rejects it and registry copy directs the operator to the Booking action. Existing status watches can observe cancelled/draft codes; charge-decision/review-specific watches remain unsupported. Hosted chat/watch delivery has not been verified.

Verification: client `tsc -b` passed. Sixteen focused tests pass (policy, actual Edge handler with mocked authentication/transport, disposable Postgres migration/permission/child-lock/read-state checks, and existing finance contracts). Read-only local Chrome opened JE0991133 successfully against the unchanged backend. No user records were edited. Enabled-dialog desktop/mobile, keyboard/focus and connected cancel/reload/reopen tests remain unverified; do not treat the compatibility check as end-to-end proof. No migration application, push or deployment occurred.

Deployment ordering remains mandatory: migration, finance-accruals, bookings-workflow, then frontend exposure. Obtain explicit approval for shared backend changes. Existing migration file is still unapplied and has only been amended locally. Shared enablement is not authorised by this checkpoint.
