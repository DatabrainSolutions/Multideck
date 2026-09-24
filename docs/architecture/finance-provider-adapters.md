# Finance provider adapters

Multideck owns the canonical accounting ledger and operator experience for
finance. It holds the reviewed configuration, drafts, approvals, balanced
journals, financial reports, evidence and provider mappings. A third-party
accounting package is an external mirror: useful for backup, migration,
accountant access and independent reconciliation, but not the source of truth.

Each legal entity chooses one explicit mirror policy:

- `disabled`: post and report entirely inside Multideck;
- `optional`: mirror when an active reviewed connection exists, without
  blocking native accounting when it does not;
- `required`: require an active mirror before a finance approval can complete.

This policy never removes the adapter boundary. External accounting
connections are a permanent product capability even when a tenant chooses to
operate without one.

## Provider-neutral contract

Manual GL journals use the `finance-ledger` boundary and the dedicated ERPNext
Journal Entry adapter. They post into the existing canonical batches/lines,
then retain independent, retryable delivery state. See
[GL journal scope and rollout](../verification/2026-09-18-general-ledger-journals.md)
for the base-currency/non-control-account scope, exact readback, unique identity
prerequisite and the distinction between local implementation and live rollout.

Every enabled provider must implement the same product capabilities:

- Validate a connection and list legal companies.
- Resolve customers, suppliers, charge codes, tax treatments, bank accounts and
  control accounts through explicit reviewed mappings. Never guess a provider
  identifier or create a provider master record as a side effect of posting.
- Apply a reviewed chart, tax treatment and bank configuration without
  deleting, renaming or overwriting existing provider records.
- Create a draft document, submit it only after finance approval, and return
  the immutable external reference.
- Create a payment/receipt and its controlled allocations.
- Receive verified provider changes and report reconciliation failures.
- Where the provider APIs allow it, read back journals and trial-balance
  evidence so P&L and balance-sheet parity can be tested rather than assumed.

The canonical Multideck records (`FIN_Documents`, `FIN_CashTransactions`,
allocations, finance configuration runs, authorisation records and audited
provider mappings) must not contain a provider-specific data model. Provider
document payloads and external IDs are recorded as evidence alongside the
canonical record.

Finance > Mappings shows the full local nominal chart against each active
connection. ERPNext account choices are read from the exact connected Company,
including accounts beyond the first API page. Sage 50 choices come from the
tenant HyperExt [`GET /api/nominal/`](https://www.postman.com/hypersage/sage-50-api-by-hyperext/documentation/ebvu2xu/hyperext-sage-50-api) response after checking connector health and
the exact configured Sage company; inactive nominals are excluded. Other
connectors still show their account-list limitation. Nominal mapping reads,
writes and watches are deliberately unsupported in Dexter until a tenant-safe
domain and deterministic change events are available.

ERPNext Journal Entry delivery resolves each posted debit and credit through
the active `nominal:<FINNom_ID>` mapping for its exact connection. The legacy
free-text nominal mapping hint is not a posting link. A missing, inactive or
conflicting mapping blocks delivery before an ERPNext document is created;
ERPNext then validates the target Company, currency, posting-account status and
balance-sheet/P&L root class before creating a Journal Entry.
An already claimed journal keeps its frozen delivery payload and external
identity on retry rather than silently changing the target after a mapping edit.

## Finance demonstration endpoint

The shared ERPNext finance demonstration uses the exact provider origin
`https://demo-finance.multideck.app`. The tenant Supabase project must store it
as `ERPNEXT_BASE_URL`; the API key, API secret and webhook signing secret remain
separate tenant Edge secrets.

This hostname belongs to ERPNext/Frappe Cloud. It is not a Multideck operator
application hostname and must not be used as `APP_URL`,
`VITE_MULTIDECK_TENANT_HOST`, the Supabase Auth Site URL, an OAuth redirect
origin or a passkey RP ID. Keeping those origins separate prevents an
accounting-provider login from being mistaken for a tenant application or
authentication boundary.

## Native ledger and mirror lifecycle

Multideck owns one lifecycle whether or not a mirror is connected:

1. An operator prepares a tenant-scoped sales invoice, customer credit,
   purchase invoice, supplier credit, customer receipt or supplier payment.
2. A document can be linked to its freight job, where the job's legal entity
   and customer or supplier must match, or entered manually for ad hoc and
   ancillary services.
3. Multideck calculates signed document totals and reviewed base-currency
   values inside one database transaction. Foreign-currency records require an
   explicit positive exchange rate.
4. The draft is sent for finance review. Approval and rejection are retained
   in the authorisation and audit records.
   An authorised reviewer may run the real provider preflight while the record
   is awaiting approval. It reuses the exact canonical export and ERPNext
   company, party, item, account, currency and tax-template checks but stops
   before provider creation or submission.
5. Cash allocations are proposed in the draft and applied only on approval,
   while the affected invoice rows are locked and revalidated.
   The ERPNext adapter also verifies that both mapped payment accounts use the
   transaction currency before it sends the reviewed source and target rates.
6. Approval posts one balanced, idempotent journal to the Multideck ledger and
   locks the source transaction. Native posting status is separate from mirror
   delivery status.
7. When the mirror policy and connection require delivery, approval claims one
   idempotent integration-queue item. The adapter either submits the external
   document, blocks on a missing mapping, or records a retryable failure and
   reconciliation issue. No queue item is created for a disabled mirror or an
   optional mirror with no active connection.
8. A provider-created reference is retained when submission or delivery
   verification fails. A retry reads that exact record first; if it is already
   submitted and matches, delivery is recovered without submitting again.

ERPNext now reads back the exact draft before submission and the persisted
document afterwards. The delivery comparison checks identity, Company, party,
date, currency, exchange rate, invoice/credit polarity, document and base totals,
line count, item/account mappings, quantities, rates, net amounts and aggregate
tax. Cash checks also cover both accounts and their currencies, base amounts,
exact allocations, unallocated amounts and unexpected deductions or taxes.
Invoice rounding adjustments are blocked; there is no implicit tolerance.
Decimal comparisons use integer arithmetic with up to nine decimal places and
reject missing or malformed evidence.

A mismatch retains the provider reference and structured differences, blocks
delivery and creates a `provider_delivery_mismatch` issue. Native posting stays
intact. A successful delivery retry resolves only delivery-related issues on
the same connection, leaving independent reconciliation discrepancies open.
The retained success evidence explicitly has scope `document_delivery`.

This is a delivery check, not journal, tax-account, subledger-control or
period reconciliation. The delivery check itself does not detect later provider changes, establish
complete ledger parity, or remove the race between reading a draft and provider
submission; the post-submit check detects discrepancies at that boundary.
Provider-enforced unique Multideck identities recover create requests whose
responses are lost. Signed inbound events now trigger fresh document reads and
review exceptions for later changes. Missed-event catch-up and period
reconciliation remain implementation work.

Dexter document reads reuse existing posting-error/export-status evidence and
document watches reuse the deterministic export-status event. Provider mutation
and retry remain manual-only. Raw readback differences and cash delivery error
details are explicitly unsupported as Dexter reads/watches in this increment:
the existing cash adapter does not expose those fields or emit export-status
events. Dexter must state the limitation and direct operators to Finance setup.
Extending the cash evidence/event lifecycle requires its own database change
and role-aware lifecycle tests before that capability can be advertised.

### ERPNext inbound receipt boundary

The receiver verifies Frappe's HMAC-SHA256 signature against the original body
bytes and enforces a 256 KiB limit, including streamed requests. Supported
events require string `doctype`, `name`, `company` and `modified` fields;
`event` is optional and defaults to `updated`. `modified` is the provider's
document timestamp, with seconds and up to six fractional digits. Configure
the ERPNext webhook template to send these fields before deploying this
receiver; incomplete older templates will receive an error rather than being
silently accepted.

The service-only `multideck_erpnext_receive_webhook` RPC parses the original
signed text in PostgreSQL, preserving financial decimals beyond JavaScript's
precision. It resolves the exact company to one active ERPNext connection and
active legal entity. Missing, inactive, foreign or ambiguous connections fail
closed. Raw receipt tables remain inaccessible to browser roles.

Receipt identity consists of company, doctype, document ID, event and provider
modification timestamp. A unique index makes concurrent deliveries idempotent.
An equivalent retry returns the original event ID without changing evidence,
receipt time or processing state. Conflicting payloads for the same identity
return a conflict and retain the original evidence. The receipt includes its
connection, original text, JSON, SHA-256 and source timestamp. Legacy rows are
preserved without fabricating missing provenance.

Acceptance means **durably queued**, not applied or reconciled. Late events are
retained; no timestamp-based freshness assumption can update accounting records.
The future consumer must recheck connection ownership and source versions,
read authoritative provider records, prevent loops and stage discrepancies for
review. Duplicate delivery protection is not a substitute for that consumer or
for scheduled catch-up reconciliation. No accounting record is mutated by the
receipt RPC.

Raw webhook intake is intentionally not a Dexter read, write or watch
capability: a signed notification is not verified accounting state. The future
consumer must expose reviewed outcomes through tenant-safe finance evidence and
deterministic events; chat must not claim that a queued receipt is reconciled.

Blocked, failed and stale provider deliveries remain visible in Finance setup
with their exact mapping or provider error. An authorised integration manager
can retry the same idempotent queue item after correcting the issue.

Provider preflight must complete before the adapter creates any provider
document. For ERPNext it verifies the exact Company and default currency;
customer or supplier; Item and tax-template mappings; nominal, bank and control
accounts; account ownership, enabled state and required account currency; and
the submitted external references used by cash allocations. Missing or
conflicting setup blocks the queue item with a corrective message. Posting must
never repair an accounting master, select an arbitrary duplicate mapping or
silently substitute a currency.

Finance administrators may load a tenant-scoped, read-only provider catalogue
to choose those exact mappings. The catalogue returns no credentials and is
available only through the Finance integration permission boundary. It is not
exposed as a Dexter data domain or a `Watching for you` signal: provider master
data is setup-only, can be high-volume, and has no operator-facing Multideck
change event. Approved mappings and their operational consequences remain
available through the existing finance evidence and event adapters.

An integration manager can save a party mapping only through the protected
provider mapping boundary. The boundary resolves the connection through the
signed-in workspace, rejects blocked Multideck organisations and accounting
profiles, re-reads the exact enabled provider customer or supplier, prevents
one provider party being assigned to two local organisations, and records the
verified change in `ACCI_SyncEvents`. Posting rechecks customer credit holds,
supplier payment holds and blocked statuses before any provider mutation.

Manual sales invoices and customer credits check this mapping as soon as an
operator selects a customer. A missing mapping opens an explicit choice: keep
the record as a local Multideck draft, link the exact existing provider
customer, or enter the provider-specific customer wizard. Provider customer
creation is never a side effect of posting. ERPNext requires its reviewed
Customer Type, Customer Group and Territory; Sage 50 requires its permanent
account reference and runs through the tenant HyperExt route. The wizard shows
the CRM billing data being copied, previews the external change and requires
`Finance.Integration.Manage` before it creates or links anything. ERPNext may
create a linked billing Address after the Customer; a partial address failure
keeps the verified customer mapping and emits a warning audit event instead of
duplicating the Customer on retry.

The Sage 50 customer path calls the HyperExt Accounts API only from the tenant
backend. The `AuthToken` and exact HTTPS URL are tenant Edge secrets and are
never returned to browser code. The adapter rechecks HyperExt status, SDO and
ODBC readiness and the expected Sage company before creating a customer, then
stores only the Sage account reference in `ACCI_PartyMappings`. This customer
onboarding path does not enable Sage document posting: the broader Sage 50
adapter remains disabled until it passes the complete posting, idempotency,
reconciliation and local-agent contract.

Provider-customer creation and party mapping remain deliberately unsupported
as Dexter writes or watches. They are high-impact setup actions that require a
provider catalogue, provider-specific fields and an integration-manager review
surface. Dexter must state that limitation and direct the operator to the
manual invoice customer wizard rather than guessing or creating a provider
identity. `ACCI_SyncEvents` retains deterministic audit evidence, while
document, queue and reconciliation consequences remain visible through the
normal finance evidence and event adapters. No idle watch or recurring LLM
call is introduced for provider master data.

Blocked and failed document postings are recoverable from the transaction
workspace. The finance evidence domain exposes the retained provider error,
attempt count, last attempt and exact transaction route, so Dexter can explain
what is blocked without guessing. Watching for you already reacts to the real
document posting-status change and therefore observes blocked, failed, retried
and posted outcomes without polling or an LLM call. The retry and return-to-draft
controls are deliberately not Dexter writes: retry can mutate an external
ledger, while return-to-draft revokes a finance approval and cancels the queue
item. Both remain permission-checked manual actions on the document workspace,
with retained status history and audit evidence. Dexter must direct the operator
to that workspace and must never claim to have retried, reopened or repaired a
posting.

The adapter also contains one exact-host, idempotent bootstrap action for a
non-stock `MULTIDECK-DEMO-SERVICE` item. The action checks the approved demo
hostname, requires Finance integration permission and records an
`ACCI_SyncEvents` audit event if ERPNext permits creation. Provider credentials
may intentionally lack Item creation permission; that rejection is final and
must not be bypassed. A controlled test may instead use an existing demo Item
behind a clearly isolated Multideck demo-only charge code. The bootstrap action
is unavailable on every production provider origin, is never called as a
posting side effect, and is not available to Dexter or watches.

After posting, an integration manager may verify only a Multideck-retained
external reference. The read boundary follows its tenant-scoped connection,
allows only Sales Invoice, Purchase Invoice and Payment Entry, fetches the
exact ERPNext identifier, verifies its Company and returns a restricted
accounting summary without credentials. It does not provide generic provider
document browsing and is not a Dexter or watch capability.

If a legal entity has never had a base currency configured, an administrator
may initialise it only while approving Finance Setup, from the exact default
currency returned by the selected provider Company and retained in the setup
evidence. An existing valid legal-entity currency is never overwritten; a
mismatch blocks approval. Ordinary invoice, credit, receipt, payment and Dexter
flows cannot perform this initialisation.

Multideck also revalidates approved source state at every lifecycle boundary:
legal entity, party and job agreement; invoice-versus-credit polarity; dates;
header and line totals; exchange-rate arithmetic; active bank and matching
bank currency; allocation uniqueness and open balance; approval state; and
idempotent external references. These checks are repeated at approval and
delivery so a master-data change made after draft creation cannot slip through.

Credits retain negative ledger polarity in Multideck while the provider
adapter translates them into the provider's return or credit representation.
Ageing includes approved and submitted credits in the correct sales or
purchase ledger and excludes drafts and rejected records.

## Finance administration boundary

`Admin > Finance` is the single configuration workspace for each legal entity.
It manages native ledger ownership, the external mirror policy and connection,
operating and base currencies, exchange
rate rules, multiple currency-specific bank accounts, the generic or freight
forwarder chart, tax jurisdictions and treatments, document sequences, payment
terms, provider mappings, posting locks, tolerances and approval controls.

An authorised finance administrator saves those values as one approved,
versioned revision. The protected Finance Edge Function performs the write in
one database transaction and keeps the legal entity, bank, tax and mapping
records scoped to the signed-in company. Browser roles cannot write the
underlying configuration tables directly. Full bank identifiers and provider
credentials are never returned to the client; the configuration stores only
masked endings and tenant Edge secrets.

New chart accounts are approved before they become selectable as bank or tax
control mappings. This two-stage rule prevents an unsaved account definition
from being mistaken for a real ledger identifier. Existing provider accounts
are mapped or supplemented only: Multideck never silently renames, deletes or
overwrites them.

Universal tax categories are setup suggestions, not transaction master data.
They become selectable only after a finance administrator has entered the
legal entity's statutory rate, direction and effective period, confirmed local
tax advice, and saved an approved revision. The Finance Edge Function resolves
each line to that controlled treatment and replaces any caller-supplied rate
with the approved rate. A database trigger repeats the legal-entity, direction,
effective-date and approval checks and derives the tax and local-currency totals
before storage. Missing advice, expired rules and overlapping effective rules
all fail closed before review or provider delivery.

The shared ERPNext sandbox has one non-statutory exception for integration
testing. Finance may approve only the zero-rate `DEMO-NONTAX` treatment when
the connection endpoint has been verified as the exact sandbox hostname and
the approved revision is explicitly marked demo-only. The same revision cannot
claim statutory local advice, no other active tax treatment is accepted in that
mode, and the ordinary human review-and-post approval is still required. The
database repeats these conditions for every line and status transition, so a
production connection can never inherit the demo treatment.

Dexter may read the latest approved revision with source evidence and
`Watching for you` receives a database event when that revision changes.
Dexter deliberately has no finance-configuration write action because tax,
bank and statutory controls require the full administrator review surface.
Ordinary watch evaluation remains deterministic and makes no recurring LLM
calls.

Each customer or supplier keeps its transaction defaults on the organisation's
Financial workspace. The Accounts Receivable tab holds its sales legal entity,
account status, credit control, currency, payment term, tax treatment, invoice
grouping, reference rules and statement delivery. Accounts Payable holds the
equivalent supplier status, purchase legal entity, payment term, tax treatment,
matching tolerance, payment run and remittance controls. Bank Details supports
multiple currency-specific counterparty accounts, usage purposes, effective
dates and verification evidence while retaining masked identifiers only.

Changing those party settings requires Finance Configuration permission;
changing the counterparty bank register additionally requires Bank Management
permission. The organisation record references only approved legal entities,
terms and tax treatments returned by the tenant's Finance configuration. Dexter
can explain the approved values and watch real changes, but it has no action for
editing statutory party settings or counterparty bank details.

## Delivery order

| External mirror | Connection model | Product state |
| --- | --- | --- |
| ERPNext | REST API token and signed webhooks | Enabled for invoices, credits, payment entries and allocations |
| Xero | OAuth 2, Accounting API and webhooks | Planned after Sage 50 |
| QuickBooks Online | OAuth 2 accounting API | Planned after Sage 50 |
| Sage Accounting | Cloud API | Planned |
| Sage Intacct | REST, OAuth and signed webhooks | Planned |
| Sage 50 | Tenant HyperExt Accounts API route backed by Sage SDO/ODBC | Next after ERPNext acceptance; customer onboarding wizard available for an active reviewed connection; document posting remains planned |
| Sage 200 | Tenant-installed Windows local agent | Planned; never a browser credential |
| Dynamics 365 Business Central | OAuth / OData APIs | Planned |
| Oracle NetSuite | SuiteTalk REST | Planned |
| Zoho Books | OAuth 2 accounting API | Planned |

Adding an external mirror means implementing this contract in a protected tenant Edge
Function, storing its credentials only in that tenant’s Supabase secrets, and
passing the same integration, permission and cross-tenant tests as ERPNext.
It does not mean creating another receivables, payables, cash or setup screen.

The provider registry is deliberately broader than the enabled connector list.
“Recognised” means the integration shape and connection model are known;
“enabled” means the listed delivery capabilities are available; complete integration acceptance must be established separately by the recorded checks and limitations. The product must show
that distinction and fail closed for a recognised but unavailable package.

## Safety boundary

The browser never receives provider tokens, API keys or webhook secrets.
Sage Desktop connectors run through a tenant-local agent because the accounting
database and desktop SDK are not safely reachable as a cloud integration. A
non-ERPNext provider is shown as recognised in the setup interface, but cannot
be selected for provisioning until its adapter is enabled and verified.

Dexter reads the same tenant-scoped document and cash evidence. Its only finance
writes are allowlisted draft actions routed through the real Finance Edge
Function; chat approval never bypasses finance posting approval. Watching for
you reacts to database document and cash changes through stored deterministic
rules and event signals, with no recurring LLM calls.

## Automatic customer/supplier lifecycle (16 September 2026)

Account creation and changes now produce transactional, provider-neutral
`ACCI_PartySyncQueue` intent per connection and role. The ERPNext worker uses
provider-enforced unique identities, exact readback, source revision and lease
fencing, controlled external-conflict handling and atomic mapping/audit completion.
A daily catch-up checks previously verified accounts. Explicit account health and
recheck controls are in the register's existing sync dialog. Enabled automatic
sync requires a verified matching party before document or cash export.

The flow is deployed to the named sandbox with explicit defaults and ERPNext
identity fields. Sage automatic readback/recovery is unsupported;
its existing manual connector remains separate. Full ledger reconciliation remains outstanding. The incoming document consumer is deployed and a real signed change to an unlinked ERP draft produced a review exception. See
[scope, verification and rollout](../verification/2026-09-16-accounting-party-lifecycle.md).

See [incoming checks, recovery and remaining sign-off work](../verification/2026-09-17-erpnext-inbound-and-recovery.md) for the current implementation and deployment boundary.

### Fenced external export completion (17 September 2026)

The finance Edge boundary checks user permissions and resolves the canonical
export, then calls service-only `multideck_finance_begin_export`. It verifies
the active actor/entity/connection, reserves a 15-minute UUID lease and creates
the batch/item in one transaction. The reviewed ERP site must match the
configured transport before financial export.

`multideck_finance_finish_export` checks the lease and current source/connection
again. Reference, batch, item, queue, mirror status, related delivery issues and
audit commit together. A failed audit write rolls everything back; an expired
worker cannot overwrite a replacement attempt. ERP success requires the exact
retained canonical snapshot and matched readback. Provider failures can retain
an external ID without a successful-sync timestamp. Native posting is preserved
and independent ledger discrepancies remain open.

These are internal safeguards for the existing permissioned export workflow,
not new Dexter write actions. Existing document status reads and deterministic
export-status watches remain the supported interface; raw attempt/lease controls
and cash error watches remain explicitly unsupported. Full ledger reconciliation
and automatic missed-event recovery are separate, unfinished capabilities.
