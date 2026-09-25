# UK accounting and VAT release contract

Status: in progress, **not HMRC filing-ready** (25 September 2026). This is a
release contract, not a claim that the listed capabilities already exist.

## Agreed scope

Multideck is the authoritative, balanced, auditable accounting ledger for each
tenant and legal entity. The first statutory release must support direct UK VAT
Making Tax Digital (MTD) submission and tax-ready financial accounts. ERPNext
and other accounting packages remain reconciled mirrors. Corporation Tax/CT600,
Companies House accounts filing, and payroll/PAYE are **not** in this release.
Do not silently treat a VAT registration number or an approved tax code as HMRC
authorisation to file.

Other countries must use versioned jurisdiction packs, not UK VAT assumptions
embedded in the shared ledger. A pack has an explicit authority, effective
dates, tax rules, reporting format, approval status and supported schemes.
Unsupported treatments fail closed, preserving the draft and explaining the
required accountant review or external filing route.

## Current evidence and blockers

| Area | Current evidence | Release gap |
| --- | --- | --- |
| Native GL | Balanced posting batches and journal PostgreSQL tests exist. | End-to-end period close, opening balance, correction, bank and mirror parity need tenant verification. |
| SL/PL and cash | Approved documents, allocation, tax-code setup and controlled provider queue exist. | VAT tax-point and scheme-specific evidence are not a return ledger. |
| Reports | Native trial balance, P&L and balance sheet use posted journal evidence. | Final accountant-reviewed year-end/tax pack and reconciliation sign-off are not implemented. |
| VAT | `gb-vat-mtd` is correctly labelled `foundation`. A backend-only standard-basis calculation kernel supports standard and annual accounting return boxes from explicit, signed GBP evidence and lists each box's source lines. A local migration adds indirect-tax period, immutable evidence, reviewed-decision and calculation tables; newly posted UK documents create unresolved evidence candidates. Service-only functions can prepare a draft period, report posted-line coverage, capture missing historical lines with an audit reason, review a posted line against its approved tax code, calculate an unreconciled draft, inspect its box sources, and compare supported source amounts to native posting lines. | The migration is locally tested only; no tenant backfill has run. Complete event extraction and other scheme rules remain outstanding. Annual instalment/payment tracking and actual HMRC period verification are not implemented. Strict control and filing-value reviews plus a reversible period review lock exist locally. HMRC obligation verification, statutory approval, adjustments and filing remain outstanding. A draft or review lock is not filing approval. |
| HMRC connection | A local sandbox-first OAuth endpoint now uses HMRC-hosted consent, PKCE, one-use state, current actor and registration checks, tenant Vault token storage and serialised refresh rotation. Its connection status exposes no token. | Live sandbox consent has not been exercised. Obligations readback, fraud-prevention headers, sandbox conformance, production approval and submission receipt are outstanding. |
| New tenants | The schema snapshot contains compliance tables. The finance jurisdiction rows were absent from baseline reference data and were added in this change. | Exercise a fresh isolated tenant provisioning run and verify the full post-snapshot migration manifest and actor access; static source checks do not prove installed data. |

## Accounting acceptance gates

1. Every sales invoice, supplier invoice, credit/debit note, receipt, payment,
   bank adjustment, accrual release and journal posts one atomic, balanced batch
   per legal entity. Drafts may be incomplete; approval may not be. Posted
   entries are immutable and corrected by linked reversal and replacement.
2. Nominal, charge-code and tax-code mappings are effective-dated and snapshotted
   on each posted line. Opening balances and migration from CargoWise must
   preserve source identifiers and reconciliation evidence. The actual/accrued
   P&L group must not count the same expense twice.
3. Accounting periods can close only after trial balance, bank reconciliation,
   customer/supplier control accounts, accruals, VAT control and external mirror
   differences are resolved or explicitly signed off. A closed period cannot be
   silently changed; later corrections are dated and traceable.
4. Management reports reconcile to the posted GL, by legal entity, currency and
   period. Exports retain provenance, not just totals. A non-zero balance or
   unknown historical migration state is disclosed and blocks finalisation.

## UK VAT acceptance gates

1. The legal entity records its VAT registration, effective dates, reporting
   basis and reviewed scheme. Every posted supply retains its tax point,
   document, party, net/VAT/gross amounts, currency conversion, treatment and
   source invoice/credit evidence. Six-year retention and deletion holds apply.
2. A VAT account and period register derive from immutable transactions and
   reviewed adjustments. The nine return boxes have per-box source-line
   drill-down, deterministic rounding, control-account reconciliation and
   exception queues. Credit notes, bad-debt relief, imports/postponed import VAT,
   exports, reverse charges, partial exemption, cash accounting and flat-rate
   schemes each need explicit reviewed rules or must be blocked as unsupported.
   The product offer is **Standard Accounting and Cash Accounting only**.
   The existing local Annual Accounting prototype is not part of that offer;
   its setup option must be retired when the Cash Accounting workflow is ready.
   Cash Accounting must derive dated VAT events from posted receipts and supplier
   payments, apportion partial payments across invoice lines and VAT rates,
   handle credits and scheme entry/exit, and reconcile those events to the
   ledger before a return can be approved. Until then, it stays blocked.
   A backend-only GBP arithmetic helper now apportions one dated part payment
   across reviewed invoice lines using cumulative payment targets and returns
   separate source amounts for Boxes 1, 4, 6 and 7. A companion helper splits
   an otherwise unallocated payment across invoices in issue-date order. They
   are calculation primitives only: the posted allocation extraction,
   multi-currency rules, source-to-ledger bridge, credits,
   statutory exclusions and entry/exit adjustments are still required before
   Cash Accounting can be offered.
   Posted cash transactions and their allocations are now source-locked:
   payment dates, values, linked invoices and allocation dates cannot be
   backdated or changed after native posting. Provider delivery may still
   advance from approved to submitted. This protects future cash VAT evidence,
   but the ledger's transaction date is not a scheme tax point. A separate
   append-only review now captures the payment method, its dated evidence,
   reviewer, reason and revisions for posted cash. Cheques use the later of
   the cheque date and received/sent date. The operator can review bank,
   card, cash and customer agent collection dates in the VAT workspace.
   A read-only source preview joins those dates to actual posted invoice
   allocations and reviewed VAT lines, applies earlier part payments, and
   shows candidate Box 1, 4, 6 and 7 source amounts only when the complete
   bounded extract passes its checks. Missing reviews, unsupported credit
   notes, advances, non-GBP sources, invoices without a due date or with payment
   due more than six months after issue, and incomplete invoice evidence block
   the preview. A payment on an invoice line evidenced in an accepted
   production Standard or Annual return is excluded with its filing time and
   allocation link, preventing a duplicate candidate amount. Mixed or merely
   signed but unaccepted Standard accounting blocks the preview for review.
   A manager can now record an immutable, audited projection of supported
   payment allocation events. The database rechecks the source and exact
   cumulative part-payment amounts before recording it; later payment-date
   changes mark the projection stale. A separate database integrity check
   re-reads the current source and verifies every stored event, exclusion,
   partial-payment amount and source-box total before a future calculator may
   consume the projection. This projection is not Cash Accounting VAT evidence
   and cannot enter a return yet.
   Previous-return errors need a separate dated correction register, not a
   blanket rule based on whether the transaction predates the previous return.
   Under HMRC Notice 700/45, aggregate the signed VAT errors discovered in the
   current period. Method 1 can adjust the current return when the net error is
   at most £10,000, or from £10,000 to £50,000 when it is at most 1% of that
   period's Box 6. Larger net errors, deliberate errors and errors above that
   1% test require Method 2, a separate HMRC error correction notification,
   not another VAT return;
   Method 2 may also be chosen below those limits. Capture discovery date,
   original period, evidence, input/output treatment, reason, time-limit check,
   reviewer and the notification outcome. Prevent duplicate correction in the
   current nine boxes and the separate notification. Ordinary VAT accounting
   adjustments, such as credit notes and bad-debt relief, have their own rules.
   A local first intake step now stores the discovery period, earlier period,
   source reference, signed VAT amount, side, conduct category and explanation
   immutably with actor and audit. A manager can append a dated conduct review
   and later revise that decision without changing the intake or prior review;
   the latest review drives the method preview and both actions are audited.
   An immutable time-limit review records the original filed-return reference,
   supporting evidence, computed ordinary four-year deadline, reviewer and
   assessment date. Underclaimed input tax uses the original return due date;
   other ordinary errors use the original period end. It has no return effect
   and must be rechecked when a correction is actually posted. Tax-point and
   deliberate-error exceptions still need specialist handling.
   A separate Method 1 posting plan can now bind every error discovered in a
   draft Standard Accounting period to the current calculation, latest conduct
   and deadline reviews, evidence references, a GBP Box 6 or Box 7 net-value
   change, and an active non-control offset nominal. It derives the final
   whole-pound Box 6 after the planned change and applies the £10,000 / 1%
   of Box 6 / £50,000 limits to the aggregate signed VAT error. The immutable
   plan is reviewed and audited but does not itself alter the return. A
   separate manager-authorised action now rechecks the latest plan, every
   source and deadline under lock after the Standard period ends. It posts a
   balanced native journal with one VAT-account line and one offset line per
   error, plus immutable VAT evidence and decisions. The next draft calculation
   includes those lines in Boxes 1/6 or 4/7 and the VAT control bridge. An
   operator must still reconcile each line, review the control and whole-pound
   projection, and lock the return. Only then can Method 1 clear the filing
   gate. Posting evidence and journal IDs are readable in the VAT screen.
   The protected VAT screen cannot tell HMRC about a Method 2 error; original
   filing evidence, conduct and the chosen route still need accountant review.
   Dexter chat and Watching for you explicitly report this sensitive intake
   as unsupported until an exact scoped read and audited event adapter exist.
   A manager-only method preview aggregates every recorded error in the
   discovery period. For net errors between £10,000 and £50,000 it uses only
   a reviewed, current whole-pound Box 6 projection and rechecks the source
   digest before testing 1%. Without one, it asks for Box 6 review. It also
   flags unresolved conduct, careless disclosure and statutory time limits.
   It flags an individual error that appears to require immediate Method 2
   notification under Notice 700/45 section 4.8, using the reviewed current
   Box 6 where available and the unconditional £50,000 limit otherwise.
   This preview is not a reviewed correction decision and creates no return
   line or HMRC notification.
   A separate operator-entered evidence record can now capture the date,
   online or letter channel, reference and selected intake items for a Method 2
   notification already made outside Multideck. Each error may be linked to one
   notification only; a reused evidence reference must be identical to be
   idempotent. The record is immutable, company-scoped and audited. It is not
   an HMRC receipt or verification, and does not approve the correction or
   adjust the current return. After notification evidence is recorded, the
   screen no longer offers those errors as a current-return adjustment; a
   later discovery requires explicit review against the notification history.
   Final filing approval, submission reservation and dispatch now reject any
   prior-return error in the discovery period unless it has either linked
   evidence of a separate HMRC notification or a posted Method 1 adjustment
   included in the active review lock's calculation. The notification evidence
   is operator-recorded and is not proof that HMRC accepted it.
   Conduct can remain undetermined at intake. A later review must resolve it:
   deliberate errors require Method 2, while a careless Method 1 correction
   may need a separate disclosure to obtain penalty reduction. The method and
   penalty disclosure are distinct decisions.
   For standard and annual accounting, an unpaid supplier invoice with
   recoverable input VAT must also be checked at six months from the later of
   supply and payment due date. An unresolved candidate blocks the period
   calculation rather than silently omitting the adjustment. A bounded,
   company-scoped readback lists the
   affected invoices, due dates, first possible clawback dates and unpaid
   source-currency balances at the selected period end. Both the cash date and
   the UK civil date when a posted allocation was recorded must fall within
   that period; a later allocation cannot retrospectively remove the risk.
   The readback does not decide the adjustment amount or allow a filing exception.
   A backend-only exact-decimal kernel now calculates the proportional input
   VAT repayment and later restoration from the original GBP input VAT,
   source-currency gross amount, cumulative payment and prior repayment. It
   follows [HMRC Notice 700/18, section 4](https://www.gov.uk/guidance/relief-from-vat-on-bad-debts-notice-70018)
   and reproduces its £200 × £700/£1,200 example. A local service-only source
   preflight now requires the
   original Box 4 line, transaction reconciliation, production acceptance and
   its receipt or matched return readback. It reconstructs supplier payments
   by UK allocation date and transaction date, and rejects credited or reversed
   invoices. The source fingerprint includes only payments effective by the
   selected period end, so later settlement cannot rewrite an earlier review.
   A service-only preparation now
   records an immutable, audited first-period repayment proposal using the
   verified source, the versioned six-month rule and the proposed negative
   Box 4 delta. Repeated preparation of the same source is idempotent. A later
   payment effective within that VAT period may create a new proposal revision
   while preserving the earlier one.
   A service-only dated review now binds the current proposal fingerprint to
   the accountant's chosen active non-control offset account. It is audited,
   immutable and can be revoked before posting; a changed payment snapshot
   must be prepared again. Proposal and review operations remain unavailable
   to Dexter and Watching for you while the operator workflow is incomplete.
   A service-only posting action now rechecks the reviewed schedule and writes
   balanced native journal lines with dated VAT evidence for the first
   six-month repayment and any supplier payments effective later in that same
   VAT period. The Standard nine-box calculation includes those events in Box
   4 only, validates their source and journal on each snapshot, and links their
   VAT control lines to the return's control bridge. A service-only later
   payment workflow now chains from the most recent review-locked repayment or
   restoration period. It rechecks each earlier payment source and journal,
   rejects an unreviewed intervening payment, and calculates dated Box 4
   restoration amounts from supplier allocations. An accountant can record an
   immutable, audited source-bound review; a separate confirmed action posts
   balanced native VAT-control entries and immutable VAT evidence. The Standard
   calculation verifies those entries and includes them in Box 4 and the
   control bridge. A payment with no whole penny of VAT effect advances the
   audited unpaid balance without inventing a tax journal or Box 4 line. These
   actions remain backend-only until the operator flow and full filing review
   are verified; no live HMRC filing is enabled by this work. Annual Accounting
   remains blocked for this adjustment pending scheme-specific validation.
3. An authorised finance user reviews the exact return snapshot, resolves
   exceptions and approves one period key. Duplicate submission, stale source
   data, changed VAT registration, closed-period edits and cross-entity access
   are rejected. The approved snapshot and confirmation are retained.
4. HMRC OAuth consent is scoped to the correct legal entity. Retrieve the
   actual open obligation from HMRC; submit only its period key. Send required
   fraud-prevention headers without putting credentials in the browser. Record
   HMRC request identity, response, receipt and later obligation readback.
   Ambiguous timeouts reconcile by readback before any retry.
   The operator flow is **Connect to HMRC → Government Gateway sign-in and
   consent on HMRC's site → return to Multideck**. The Gateway password is
   never entered into or stored by Multideck. Tokens are server-side,
   tenant-specific secrets; refresh tokens are rotated after use. HMRC access
   tokens last four hours, and renewed authority is required after 18 months.
   A refresh token is single-use. Refresh must be serialised per connection and
   replace the old encrypted token atomically. A failed refresh or revoked grant
   moves the connection to `reauthorisation_required` without exposing tokens
   to the browser. Do not automate or embed the Government Gateway sign-in page.
   The connection must be keyed by tenant project, legal entity, VRN, HMRC
   environment and granting principal. Sandbox and production credentials and
   tokens must never be interchangeable.
5. Sandbox tests include accepted and rejected returns, revoked consent,
   invalid/expired tokens, duplicate/late filing, network ambiguity, role
   revocation and tenant isolation. Production filing remains disabled until
   HMRC production access and fraud-header review are complete, followed by a
   controlled, authorised live verification.

The local HMRC OAuth migration and Edge Function implement consent, connection
status and single-use token refresh. The signed-in manager is sent to HMRC's own authorisation
page with a one-use state and PKCE challenge. The callback checks tenant
project, current account and permission, legal entity, VRN, registration,
environment and redirect URI before exchanging the code. It stores the access
and refresh tokens in the tenant Vault, returns no token to the browser, and
records connection audit. Production consent is gated by a tenant setting,
`production_verified` registration and `production_ready` UK pack. The
connection is not usable for VAT API calls yet: fraud headers, obligations and
submission still need implementation and HMRC
sandbox verification. The granting principal is the Multideck actor who
initiated consent; HMRC's Government Gateway identity is not asserted by the
token response.

The local HMRC protocol helper now builds a bounded, environment-specific VAT
obligations URL and validates returned obligation rows. HMRC period keys are
exactly four characters, sometimes beginning with `#`; longer or shorter
values are rejected. A local VAT period may
use a period key only when exactly one **open** HMRC obligation has identical
start and end dates. The key remains opaque; Multideck must never calculate it
from the dates. This contract is unit-tested but not wired to an HMRC request
or stored as verified evidence. HMRC requires fraud-prevention headers on VAT
API calls. The current Edge path cannot yet prove collection of every required
web-app-via-server value. In particular, browser JavaScript does not expose
the originating public TCP source port, and the current application has no
verified server-side record of the actual MFA method, time and reference for
each request. A server-only helper can derive a recent TOTP timestamp from
verified Supabase Auth `amr` claims and a stable reference when exactly one
verified TOTP factor belongs to that user. A second server-only helper now
checks the verified JWT subject and email against the current confirmed Auth
user before encoding the internal ID and login email for `Gov-Client-User-IDs`;
no VAT API route calls either helper yet. A local browser collector can now retain a device UUID and
format the JavaScript user agent, current screen, window and timezone for
later use. It is not wired to an HMRC call; browser screen enumeration and
actual HMRC header acceptance remain unverified. The trusted ingress/network
path, public IP and timestamp, vendor forwarding hops, public vendor IP and
software/license metadata still need a documented collection and integrity
design. A browser
body field is not proof of the TCP port, public IP or MFA event. Do not send
placeholders or call the obligations API until collection is implemented and
checked with HMRC's header Test API; seek HMRC guidance for a genuinely
unavailable field. A local builder requires all 16 web-app-via-server header
names and rejects missing, placeholder, control-character and selected
malformed structured values, private IPs and web-server ports 80/443. It
cannot prove the truth or full HMRC format compliance of supplied values;
HMRC's Test API and manual review remain required before the builder is used
for outbound VAT calls.
The [fraud-evidence gate and HMRC support draft](hmrc-fraud-evidence.md)
maps all 16 headers to their intended provenance. It records the unresolved
public TCP source port, verified MFA event, ingress chain and licence evidence
without treating any placeholder or browser assertion as proof.
The backend protocol helper can now make an obligations GET with a validated
URL, bearer token, versioned `Accept` value, complete fraud-header shape and
redirect rejection, and return parsed obligations with HMRC's validated
`X-CorrelationId` needed by the immutable observation record, without
returning tokens. A successful body without that tracking reference is
rejected. It is
intentionally not called by an Edge route or browser action while the fraud
capture and HMRC sandbox checks above are outstanding.
An immutable, service-only observation table and RPC can record one open HMRC
obligation response against the exact tenant project, connected authority,
registration, VRN and VAT period dates, with its due date, period key,
correlation ID, recording actor and audit event. This is local evidence for a
future final approval check. No Edge route calls the RPC, the period's
authority fields remain unset, and a saved observation alone never permits
submission. The final gate must fetch a fresh open obligation through HMRC
and bind that response to the dispatch attempt.
A backend-only coordinator now joins this protocol and database evidence. It
uses guarded server-side period dates and scoped authority for one HMRC GET,
requires exactly one matching open obligation, and persists the observation
before reporting it verified. It returns the due date and verification ID
without exposing the software-only period key. It has no tenant route while
trusted fraud-header provenance remains unavailable.
The HMRC period key remains in the server-side obligation, approval and
submission records for protocol matching. The operator filing-status response
and workspace omit it, following HMRC's direction that software use the key
without showing it to businesses or agents.
The protocol helper also validates a successful submission response's
processing date, 12-digit form bundle number, correlation ID, receipt ID,
receipt timestamp and optional payment and charge references. The parser is
used by a backend-only request helper, with no tenant route. A service-only submission attempt now binds
the exact approved wire body and its SHA-256 digest to the tenant, registration,
VRN and period. The one-way `reserved` to `dispatching` claim must commit
before any POST. A claimed attempt cannot be claimed again, cancelled as
unsent, or followed by approval revocation or review unlock. An uncertain
response moves it to `reconciliation_required` and remains blocking. A valid
201 response can create an immutable receipt with HMRC's form bundle number,
processing date and receipt headers, moving the attempt to `accepted`. Both
states prevent another POST. No Edge route claims or sends attempts yet.
The backend-only submit helper sends the retained body in one POST to HMRC's
environment-specific VAT endpoint with the versioned media type and validated
fraud headers. It parses a 201 receipt; timeouts, malformed success responses
and other HTTP responses remain unresolved. It has no automatic retry and is
not yet wired to the database claim or a tenant Edge route.
The backend-only view-return helper now sends an authenticated GET to HMRC's
period-key endpoint with the same validated fraud headers, URL-encodes `#`
keys, and compares all nine readback boxes with the approved payload. A 404
remains inconclusive after an uncertain submission. The helper compares raw
JSON number text using exact decimal arithmetic. Immutable readback checks
record 404, mismatched and matching responses against the claimed attempt.
Only a matching 200 moves it to `accepted_readback`; that remains distinct
from an HMRC 201 receipt, which can be recorded later. The helper has no Edge
route and has not called HMRC.
A backend-only readback coordinator now obtains the software-only period key
through a service-only, tenant- and attempt-scoped RPC. It validates current
authority and complete fraud evidence before one GET, then passes the bounded
raw response to the database for durable exact-value comparison. A mismatched
200 is retained as mismatch evidence; a 404 remains unresolved. A failed GET
or lost database write never reports acceptance or triggers another POST. The
coordinator has no public route while trusted ingress and licence evidence
remain unavailable.
An entity-scoped, read-only filing-status snapshot now projects the approval-
bound obligation observation (or the latest observation before approval),
declaration approval, attempt state, receipt references
and readback result. It excludes tokens, the exact POST body, raw HMRC responses
and the tenant project reference. The finance Edge route checks Compliance View
and company access before calling it. The VAT workspace shows these records as
historical evidence, with sandbox and unresolved states distinguished. This
read path has not been exercised against a running tenant.

A separate local return-body builder now checks the eleven required HMRC
declaration fields, exact two-decimal money strings, Box 3 and Box 5 arithmetic,
field limits, a four-character obligation key and explicit final-declaration
confirmation. It emits exact decimal JSON without converting approved GBP
amounts through JavaScript floating point. The builder rejects fractional
Boxes 6–9 because HMRC's VAT API describes these as whole-pound values, while
the audit calculation retains pence. A separate local filing-projection review
now preserves both figures and records the finance reviewer's date, reason,
source digest and `uk-whole-pound-nearest-v1` rule. It rounds each Box 6–9
aggregate to the nearest pound, with 50 pence rounded away from zero, only
after an existing control review. Recording the filing-value review revalidates
the whole-period VAT control under a lock and binds the review to that control
fingerprint, so an unlinked VAT journal cannot pass on an unchanged source
digest. The operator sees the exact proposed values before recording the
review. HMRC's published return guidance does not state
this particular rounding convention; accountant and HMRC sandbox validation
of the rule remain release gates. A changed calculation requires a new review.
The projection is not wired to submission and does not replace obligation
verification, approval, fraud headers or a durable submission state machine.

An immutable local review-lock record now binds one current calculation digest,
control review and filed-value projection after revalidating both reviews under
the period lock. The period moves from `draft` to `review_locked`; draft
recalculation and review actions then reject it. Reopening requires a separate
dated, immutable manager reason and returns the period to `draft`. Neither a
review lock nor its operator action claims statutory approval: the actual open
HMRC obligation, period key, declaration and dispatch controls are missing.
The final approval/submission gate must recheck the lock fingerprint against
current source and control evidence, and must prohibit reopening once a
submission attempt is recorded. Posted corrections after locking need a
controlled reopen and new review, or a separately audited later-period event.
The calculator now has a read-only snapshot path for draft or review-locked
periods. A backend freshness check replays the source digest and nine boxes,
then recomputes the whole-period VAT control fingerprint without adding a
calculation revision. It reports changed source or control evidence while
leaving the lock intact. This is a preflight, not a final approval: the
dispatch transition must repeat the check and bind a fresh production HMRC
obligation and confirmed declaration in a durable attempt record.
An immutable, service-only filing approval now records an explicit direct-
business declaration confirmation against the current review lock, reviewed
filing boxes and an HMRC obligation observation no more than 15 minutes old.
It repeats lock freshness and current authority checks. Production remains
blocked unless the registration is production verified and the UK pack is
`production_ready`; sandbox approvals remain test records. Agents are blocked
until the separate client-approval declaration and evidence exist. An active
approval blocks reopening the review lock until a dated, audited revocation
is recorded. The local operator workspace now displays the exact HMRC business
declaration alongside the nine locked filing values and requires an explicit
checkbox before its permissioned Edge route records approval. The tenant
project identity is derived on the server, never supplied by the browser.
No live HMRC obligation observation or authenticated approval journey has
been verified; approval does not dispatch or file. An
unclaimed reservation can be cancelled with an audited reason; a claimed,
uncertain or accepted attempt blocks revocation and unlocking.

Each tenant Edge deployment needs its own `APP_URL` and the HMRC application
secrets `HMRC_VAT_SANDBOX_CLIENT_ID`, `HMRC_VAT_SANDBOX_CLIENT_SECRET`, and
`HMRC_VAT_SANDBOX_REDIRECT_URI`. The redirect URI must exactly match the HMRC
Developer Hub entry and point at that tenant's `hmrc-vat-oauth/callback` Edge
route. The corresponding `HMRC_VAT_PRODUCTION_*` values and
`HMRC_VAT_PRODUCTION_ENABLED=true` are reserved for a separately approved
production rollout. These values are never part of the browser build.
The [HMRC Developer Hub VAT (MTD) listing](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0)
showed version 1.0 beta on 24 September 2026; pin the API `Accept` version from its own endpoint
specification when obligations and submission are implemented. The unrelated
UK VAT-number checking API has a version 2.0 and must not be used as the MTD
filing version.
Fresh-tenant reference data now points at VAT API 1.0. A separate migration
repairs the original 2.0 URL in existing `gb-v1` and `gb-vat-mtd` rows only
when it is still the seeded value, preserving any tenant override. It does
not change the obligation's `foundation` readiness or enable HMRC calls.

## Current calculation boundary

The UK VAT workspace now lets a permitted compliance manager record a nine-digit
VAT number, effective date and standard or annual scheme after confirming
invoice-basis accounting. The server derives the active `gb-vat-mtd` obligation
for the legal entity, records the actor and audit event, and sets only
`configured`. A `not_configured` placeholder can be completed once. A separate
reasoned change action records prospective VAT number or scheme terms in a new
effective-dated row. It closes the prior row only after every prepared period
under it has a confirmed accepted HMRC return, retains historical period and
HMRC references, and resets the
new row to `configured`. An immediately effective change revokes the old HMRC
connection tokens and requires renewed consent; a scheduled change makes the
old authority invalid when its terms end. A closed registration cannot acquire
new historical drafts. HMRC verification and any correction
to past registration terms still need separate controlled workflows. Cash accounting uses payment tax points, so it
remains unavailable in this invoice-source path. See [HMRC's VAT record guidance](https://www.gov.uk/charge-reclaim-record-vat/keeping-vat-records).

`supabase/functions/_shared/uk-vat-nine-box.mts` is a pure calculation kernel,
not an API or submission path. Its caller must provide complete, immutable,
posted GBP evidence for one legal entity and VAT period, including the actual
tax point, source document and line, source version and reviewed rule ID. It
aggregates at four decimal places and rounds the contributing boxes to pennies.
Box 3 is the sum of the rounded boxes 1 and 2; box 5 is the positive magnitude
of rounded box 3 less rounded box 4. This matches HMRC's validation of the
submitted values even when four-decimal source amounts differ by fractions of
a penny. The `uk-standard-v5` calculation fingerprint includes the algorithm
version and all nine rounded boxes, so a changed return calculation invalidates
earlier transaction sign-offs and control reviews. Credits and reversals carry
signed four-decimal source-line amounts and preserve their own source IDs.
Billing-party corrections that post an exact reversal now link each reversal
evidence line to the original evidence line. Posting rejects a mismatched source,
amount, currency or legal entity. A normal credit remains its own event; neither
kind is automatically classified as an error in an already submitted return.
An ordinary posted credit note can now receive a separate immutable, audited
link to one original invoice evidence line. The protected database action checks
the same legal entity, party, currency and document direction and prevents
the aggregate linked credits from exceeding the original net or VAT amount.
An invoice with an exact reversal cannot receive an ordinary credit link, and
an invoice with linked credits cannot later receive an exact reversal; both
actions take the same database lock to close concurrent races.
The original evidence and posting remain untouched. The VAT account readback
shows this link separately from an exact reversal, with access to the original
document governed by the usual ledger-view permission. The operator can search
up to 20 eligible original invoice lines by number and record a reasoned link
from the VAT account trail. Search and write routes recheck Compliance Manage
and legal-entity access; the database remains the authoritative validator.
This records an accounting relationship, not a finding that an already filed
return was wrong or an HMRC adjustment.
The VAT account readback now includes the original document reference and
its first VAT sign-off date for a linked reversal. The original document opens
from that row only when the colleague also has that ledger's view permission.
Supported inputs are ordinary domestic sales, zero-rated/exempt sales, explicitly reviewed
services with a place of supply outside the UK, domestic purchases
with explicit recoverability, and zero-rated/exempt supplier purchases with
zero VAT. Those purchases contribute only to Box 7. An outside-UK service sale
contributes only its signed net value to Box 6; the approved UK tax code must
use the distinct `outside_uk_service_box6` category, carry a zero rate and
zero source VAT, and the operator must record the tax point and review reason.
The generic `out_of_scope` category remains blocked because it also covers
items excluded from Box 6 or Box 7. This UK-return treatment does not decide
whether tax is due in another country. [HMRC VAT Notice 700/12, section 3.7](https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012)
lists place-of-supply services in Box 6 and excludes loans and other non-sales.
A reviewed zero-rate or
exempt tax code must have a zero rate and zero source/reporting VAT. No rules are inferred from a tax-code
name. A new native posting migration charges nonrecoverable purchase tax to
the purchase cost or asset nominal, with a separate posting label. The VAT
source check requires that posting and excludes its tax from Box 4. Older
postings on an input VAT account remain source mismatches and need a governed
correction before sign-off. [HMRC VAT Notice 700/12](https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012)
limits Box 4 to deductible VAT. Unsupported schemes and
treatments produce visible exceptions. Even a
valid kernel result cannot be reviewed or submitted until a period snapshot
proves extraction completeness and VAT control reconciliation.

The explicit `annual` registration scheme uses the same return-box arithmetic
as `standard`, with its own `uk-annual-v3` calculation fingerprint. This follows
[HMRC VAT Notice 700/12, section 4.3](https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012):
annual-accounting instalments do not reduce Box 5. The annual period still
needs an exact open HMRC obligation, and instalments, balancing payment and
due-date workflows remain separate work. Cash accounting, flat rate, retail,
margin and other special treatments remain blocked until reviewed rules and
complete event evidence exist.

Before this code is wired into a return, add versioned tax treatment rules and
complete posted-event extraction, including cash allocation tax points and separate
import/PVA evidence. Reconcile each source to the posted GL and prevent a source
event appearing in two periods. Store one immutable calculation snapshot with
source fingerprints and per-box drill-down. Review and approval must verify the
same fingerprint under a database lock; a later correction belongs in an
audited subsequent period, not a mutation of the approved snapshot. Dexter chat
and Watching for you require tenant-safe read/watch adapters at that point;
Dexter must not approve or submit statutory returns on a user's behalf.

The local `20260924082944_uk_vat_period_foundation.sql` migration records UK
document lines at native posting without inventing a VAT tax point. The source
event is immutable; an accountant's revised decision before transaction sign-off
is a separate immutable revision. Once signed off, the tax point and treatment
cannot be revised even within the same period; a correction needs new evidence.
A calculation line must name the reviewed revision for the same
entity, jurisdiction, scheme and period. Direct browser access is denied.
Dexter does not offer VAT transaction sign-off, treatment revision or a VAT
sign-off watch yet. Its finance domain must report these actions as unsupported
until it can expose the exact signed evidence with the same entity permissions,
approval and event-driven watch boundaries as the operator workflow.
The service-only draft functions require a current active finance actor in the
same company and reject stale registration, unsupported source kinds,
unreviewed events, missing posted-line capture and pending/reversed documents.
The reviewed decision derives ordinary standard-scheme treatment from the
approved tax code actually snapshotted on the posted line; other treatments
stay blocked. Draft calculation records the exact decision revision and a
source digest, while marking VAT control reconciliation `unreconciled` and
approval unavailable. It does not assert that imports, cash accounting or
other unimplemented source families are complete.
Draft recalculation also rejects a tax code whose effective-date window has
changed since review or no longer covers that decision's tax point. The old
decision remains as historical evidence until an authorised reviewer records
a new revision.
For supported document lines, the draft also compares net and VAT amounts
against their native posted journal lines and resolves the expected output or
input VAT nominal using the posting rules. A VAT amount on the wrong account,
or a changed tax-code account mapping, makes the source check fail and changes
the calculation fingerprint. Bounded mismatch diagnostics show account codes
and source/posted amounts. A matched
source check is still not a whole-period VAT control reconciliation: other
journal sources, accounting dates, timing differences and tax account balances
must be resolved before approval can be enabled.
The read-only GL VAT posting inventory now lists tax-labelled postings and
postings to mapped or configured VAT nominal accounts in accounting periods
overlapping the draft VAT period. It identifies lines with no source in that
draft, including journal entries without a tax label. GBP totals exclude
non-GBP lines; those lines are counted and shown in their posting currency.
Tax-labelled lines outside mapped VAT nominal accounts are separately flagged.
The inventory also separates signed GBP VAT-account movements linked to the
draft from unlinked VAT-account movements and tax-labelled movements outside
VAT accounts. This gives the reviewer a quantified bridge to investigate;
foreign-currency lines remain separately counted and outside the GBP sums.
The bridge compares unrounded source Box 1 less Box 4 with GBP net-credit
movements on VAT accounts, reports the exact difference and checks whether
accounting periods cover every VAT-period day exactly once without straddling
the VAT boundary. It also counts source VAT postings that are absent from
linked VAT-account lines. These are read-time diagnostics, not a stored
reconciliation or permission to approve a return.
Compliance managers can now record a dated, immutable control-review snapshot
after a fresh calculation confirms current source-to-ledger matching, every
transaction's dated sign-off, exact accounting-period coverage, zero unlinked
or non-GBP tax postings, zero tax-labelled postings off VAT accounts, complete
linked VAT tax lines and an exact unrounded control difference of zero. The
snapshot fingerprints the calculation, posted GL inventory and accounting
period scope. The workspace shows the latest historical review with its
reason. A changed source or journal requires a new review; a future approval
transition must revalidate these fingerprints and HMRC obligations before
locking a period. No approval or submission transition exists yet.
Accounting period overlap is not a VAT tax-point match, and postings without
an accounting period remain outside this inventory. It is a review aid, not a
reconciled VAT control balance or an approval gate.

The service-only coverage function counts all native posted UK document lines
and reports missing captures and unreviewed evidence, with bounded samples.
An entity-scoped, cursor-paged review queue lists all unresolved evidence
without assigning a tax point. The finance API accepts the reviewer's tax point and reason, while
the database derives treatment from the approved tax-code snapshot and records
an immutable decision plus audit event. The same API can list and prepare draft
periods and calculate a new immutable draft revision. Every response stays
entity-scoped; the draft explicitly reports unreconciled controls and that
approval is unavailable.
The bounded backfill records its operator and reason on each new evidence event
and writes an audit entry; reruns are idempotent. The finance API exposes these
operations to same-company Finance Compliance viewers and managers respectively.
Once a source has a dated transaction VAT sign-off, a later treatment review
cannot move its tax point outside that signed period. Database guards also
reject a privileged decision insert, calculation line or second-period sign-off
for the same source. A unique, immutable source-to-period assignment is written
with the first sign-off, so concurrent attempts cannot assign the source to
two periods. Corrections must use a distinct, linked evidence event;
the operator correction workflow has not yet been built.
The calculation detail route returns one immutable revision's registration,
boxes, source digest, control state and bounded box-line pages with exact
evidence and decision IDs. A same-company Compliance viewer can inspect a
colleague's calculation; another company's actor is denied. This makes draft
source tracing possible but does not constitute control reconciliation or
approval. A Compliance manager can explicitly sign off selected transaction
evidence only after the draft source lines match their native ledger postings.
The server records an immutable UTC reconciliation timestamp, reviewer, reason,
decision revision and source digest; retries retain the original date. This is
a transaction sign-off date, separate from the tax point, posting date and the
later VAT period approval date. A document shows its VAT reconciliation date
only when every line in its current native posting has a sign-off against the
latest treatment decision and latest stored calculation digest. The date is
historical evidence of that sign-off; the document read does not recalculate
the period. The document also retains its first complete VAT reconciliation
date when a later calculation revision makes the current sign-off pending,
so operators can see when the source became locked without treating the old
date as approval of the new draft. After the first sign-off, database triggers lock the source
document's financial content, every line and job link, its native posting batch
and journal lines, including direct writes. The job-link and journal guards
also resolve the referenced document line, so an unrelated document or batch
identifier cannot attach a new row to a signed line. The sign-off transaction takes
document advisory locks before recalculating to close the edit/sign-off race.
Before sign-off, calculation rechecks the posted document and line against the
immutable evidence. Provider delivery status and outstanding balances can
still advance; a financial correction uses a separate credit, reversal or
adjustment with its own review. The document API exposes `sourceLocked` even
when a later tax-rule or calculation change makes current sign-off pending.
Existing tenant data still requires a read-only target-tenant count and
role-aware access preflight before backfill. This migration has not been
applied to a tenant. The finance document view can display the completed
transaction sign-off date. A local UK VAT workspace lets Compliance viewers
inspect coverage, review queue, periods, nine boxes and source lines, and lets
Compliance managers capture missing historical posted lines with an audit
reason, review evidence, calculate drafts and sign off selected
transactions with a reason. The period register shows signed transactions in
its latest calculation without treating that count as return approval. It
offers direct-business declaration confirmation only after an active review
lock and fresh HMRC obligation observation are present, and allows a dated
revocation before any live submission attempt. There is no submission action.
No Dexter adapter consumes these tables, including the dated control reviews
or the source-lock state,
and no Dexter approval or submission path exists. Dexter's explicit unsupported
exception for this statutory workflow is that it must direct the
user to finance review and must never claim it can inspect, approve or submit
VAT periods until its permission-scoped read and event watch adapters exist.

The HMRC submit path additionally needs an actual open obligation for the same
VRN and dates, a human-confirmed declaration, production enablement, complete
fraud prevention headers, a durable attempt record and a receipt. The local
attempt state can record uncertainty, a 201 receipt, or a matched readback,
but it has no live submit or readback route yet. No automatic retry
may send a second declaration. The user must see the
HMRC result and any delay in obligation status once the workflow is wired.

The local HMRC OAuth connection supports tenant Vault token storage and a
single-use refresh lease. A second worker sees refresh in progress and cannot
send the same token. If HMRC rejects the refresh or its outcome is uncertain,
the token is erased and the connection requires fresh Government Gateway
consent. A lost lease also requires reauthorisation rather than reuse. Only
the HMRC site receives Government Gateway credentials. The UK VAT workspace
now starts sandbox consent, returns from HMRC to that same workspace, shows
connection and authority-expiry status, and requests server-side token renewal.
An audited service-only token read can supply only the current access token
for a named period operation after checking tenant, entity, registration,
connection, grantor and refresh state. Submission requires a reserved attempt;
readback requires a claimed unresolved attempt. The browser has no path to
this function or to the refresh token. The later sender must still claim the
dispatch in the database before making one POST and persist its outcome.
A backend-only dispatch coordinator now assembles the request evidence,
reads the scoped token, claims the reserved attempt, verifies the claimed
payload hash and rechecks the time-sensitive evidence before its single POST.
It records a complete 201 receipt or a blocking unresolved outcome. A lost
claim response sends nothing; a failed receipt write leaves the attempt
blocking and returns the HMRC reference for manual recovery. This coordinator
has no Edge route, and its injected HTTP sender has only been exercised with
local fakes. The ingress adapter and actual product licence evidence remain
release blockers.
Production consent remains gated, and connection alone cannot file a return.
This connection has
not been exercised in the sandbox or deployed to a tenant.

## Delivery order

1. Reconcile provisioning and the finance contract suite; inventory each
   active tax treatment and accounting scheme. Keep the VAT obligation status
   at `foundation` during this work.
2. Add the immutable VAT event/period model and standard-scheme nine-box
   calculation with accountant-reviewed treatment rules and actual source
   evidence. Prove it against real PostgreSQL posting and credit/reversal tests.
3. Add the period-review UI, control reconciliations, adjustment approval,
   source drill-down, record retention and audit. Exercise desktop/mobile,
   keyboard and role boundaries.
4. Add HMRC sandbox OAuth, obligations, submission and receipt/readback;
   complete fraud-header conformance and security review.
5. Obtain production access and perform the first expressly authorised live
   submission. Only then advance the UK VAT pack to `production_ready`.
   Additional-country packs repeat their own authority and scheme gates.

Official basis: [VAT Notice 700/22](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat),
[VAT record keeping](https://www.gov.uk/charge-reclaim-record-vat/keeping-vat-records),
[HMRC VAT MTD service guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/),
[HMRC fraud prevention](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/).
