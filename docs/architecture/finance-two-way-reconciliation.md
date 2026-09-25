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

## Period reconciliation contract

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

## Implemented local boundary

The checkpointed ERPNext discovery worker remains a notification and review
path. It does not certify a period. The new, separate period comparison reads
the exact configured ERPNext Company. It counts and pages Sales Invoice,
Purchase Invoice, Payment Entry, Journal Entry and GL Entry through the period
end, reads complete document children, then repeats the inventory. A missing,
changing or oversized source becomes `incomplete`. The comparison retains
document, payment and allocation identities, tax lines, journal lines, trial
balances, AR/AP/cash controls, mapping revision, checkpoint, source hashes and
the full local snapshot. Missing records cannot cancel out numerically. The
latest verified run becomes incomplete after 15 minutes, a saved local change,
connection change or received webhook. Unseen provider edits are bounded by
that 15-minute lifetime and require another run to be observed.

Sage 50 HyperExt currently has a verified company/status and nominal-read
path only. It deliberately records `incomplete` because the tenant connector
has no demonstrated complete, paged journal, payment allocation, tax and
trial-balance contract. The period workflow never infers completeness from
that partial read.

Bank reconciliation imports an exact-period CSV with signed amounts and
running balances, then matches lines to posted cash by bank, currency, date
and amount. The control checks every statement line, cash transaction and
bank nominal posting, including an approved opening-balance package posted in
the first native period. Verification is audited and becomes incomplete if
later ledger evidence breaks the control. Foreign-currency banks stay
incomplete until a supported currency and FX bridge exists.

A linked ERPNext opening package queues one provider Journal Entry delivery
with a frozen source hash, exact company/currency/date, reviewed nominal
mappings and a stable provider identity. Submission is followed by exact
account-line readback; only a matched readback may satisfy the opening mirror
control. Its provider Journal Entry ID links the native opening GL lines in
the period comparison. A lost provider reply is recovered by the unique
Multideck document key before any retry creates another journal. The package
source import and release gate are owned by the opening-balance workflow.
Imported CargoWise open invoices and historical unapplied cash are separate
operational subledger records. A matched opening Journal Entry does not give
those records ERPNext invoice or payment identities. The period comparison
reports each affected source reference and opening package as an explicit
incomplete blocker unless the exact ERPNext invoice or Payment Entry identity
has a submitted readback. ERPNext opening invoices and payments create their
own control-account ledger entries. The current full opening Journal Entry
already carries those AR/AP and bank control balances, so exporting the
subledger documents alongside it would double post. A reviewed clearing or
residual opening journal and exact provider subledger import/readback are
required before linked full opening packages can be released or period parity
can be signed off. Historical
unapplied cash has no current bank account match and is excluded from the
current bank statement's cash movement.

Provider-only and concurrent differences are retained for authorised manual
review. `prepare_draft` records a proposal only; it does not create an
accounting document or post to either ledger. Finance and Dexter can read the
saved evidence through role-scoped paths. Dexter watches fire on retained bank
import/verification and provider run changes, not on an unseen external edit.

These changes are implemented and locally tested. No tenant migration, Edge
deployment, connected ERPNext period run or Sage 50 period run is claimed
here. Before operational sign-off, validate the intended tenant and actual
provider tax-row/account-mapping semantics with deliberate matching and
conflicting invoices, payments, GL and control balances. Apply the migrations
in order and verify the live URL/version and Finance permissions. The
checkpointed discovery worker still requires `ERPNEXT_CATCHUP_ENABLED=true`
after its own tenant migration and verification.
