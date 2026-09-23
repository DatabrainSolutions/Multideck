# Independent ledgers and two-way reconciliation

## Accounting authority

Multideck and the connected package may each continue operating during an outage.
Multideck remains the canonical operator ledger. Provider-originated entries are
preserved as external evidence and enter a controlled Multideck draft, adjustment
or exception workflow; they never silently rewrite a posted Multideck entry.
Outbound delivery, inbound acknowledgement and verified reconciliation are
separate states. An invoice match is not evidence of matching cash, GL or period
balances.

## Discovery

ERPNext signed webhooks provide low-latency notifications. The accounting worker
also scans Sales Invoice, Purchase Invoice and Payment Entry through the exact
reviewed company connection. It uses a per-connection, per-type `(modified,name)`
cursor, a fixed scan upper bound and one-hour overlap. The server atomically
stores each discovered identity/version and advances the cursor. A failed page,
changed connection, stale worker revision or malformed provider response cannot
advance it. Scan observations explicitly carry `source=scan` and
`signatureVerified=false`; they are not misrepresented as signed webhooks.
Discovery pauses when 100 incoming observations are still pending, so the
bounded comparison worker can drain its backlog before more pages are queued.

The existing inbound processor reads the current provider document, not the
notification payload. It compares the approved outbound snapshot and stages
unknown, changed and cancelled records for review. Discovery and comparison do
not post native accounting transactions.

The checkpoint is an optimisation, not a certificate that the external books
are complete. A provider restore, audit purge, permission change, missed deletion,
backdated insert or incomplete API page requires a wider inventory pass. The
connected Sage 50 HyperExt audit/search cursor must be validated on the exact
tenant connector before adopting the same transport; its audit sequence cannot
be assumed to behave like ERPNext `modified`.

## Reconciliation contract to finish

For each legal entity and closed comparison period, retain a run with provider
company, account mapping revision, base currency, source cut-off, provider
checkpoint, page counts, source hashes, counts, signed totals and completeness.
Compare at least:

1. Multideck and provider document identities, status, party, tax, currency,
   totals and invoice outstanding;
2. payment identities and exact invoice allocations, unapplied amounts and
   write-offs;
3. every journal line and mapped nominal, including accrual/WIP, reversals,
   adjustments, FX and opening entries;
4. account-level trial balance and AR/AP/cash control balances.

Missing or duplicate records are differences even when totals net to zero. A
run can be `verified` only when every required page and readback succeeded,
all mappings are pinned, no unresolved material difference exists, and exact
entity/period/currency totals agree. A partial or stale run is `incomplete`,
never green. Bank-statement reconciliation remains a separate control.

Provider-only records use stable provider identity and a retained source snapshot.
Multideck-originated records are recognised by the immutable exported identity.
An external-only change may prepare a draft for authorised review; a concurrent
change compares both sides against their last verified common snapshot and opens
a conflict. Corrections to posted records use linked reversals or adjustments.
Approval, period locks, tax/nominal validation, audit and retry idempotence apply
equally to provider-originated drafts.

## Current local increment and release boundary

The checkpointed ERPNext discovery migration, scanner and PostgreSQL contract
fixture are local. The worker will scan before processing pending inbound events.
The fixed upper bound and revision are retained across partial pages. No tenant
migration or Edge deployment is claimed by this document.
`ERPNEXT_CATCHUP_ENABLED=true` is required after applying and verifying the
migration on the intended tenant. Until then the existing webhook worker runs
without querying the new table. A scan failure returns a retryable worker error
after the signed inbound and cost-finalisation stages have had their turn.

This increment does not yet implement period reconciliation, provider-created
transaction import, settlement recognition, deleted-record inventory, Sage 50
scanning, or a signed-off independent-close workflow. It must not be described
as fully reconciled merely because scan observations match delivered documents.
Raw scan cursors and unverified observations are an explicit Dexter and Watching
for you exception: they do not establish accounting truth and expose no safe
operator action. Existing verified delivery status and review-issue capabilities
remain the user-facing boundary until a role-scoped reconciliation domain and
deterministic exception events are implemented and tested together.

Before release: run the real PostgreSQL fixture and full data-access regression,
check exact tenant migration history, verify authenticated Finance and Dexter
access, test a connected ERPNext insert/edit/cancel and missed webhook, test
partial pages/retries/concurrent workers, and confirm no external or native
posting occurs from discovery. A later reconciliation release needs deliberate
discrepancies and matching period-level GL, tax, AR/AP and cash evidence.
The focused JavaScript lifecycle checks pass locally. The PostgreSQL fixture
was attempted but this host could not initialise a test database because its
shared-memory allocation failed; the SQL migration is therefore unverified.
