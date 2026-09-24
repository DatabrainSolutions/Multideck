# Accounting integration requirements

Product direction confirmed on 15 September 2026.

## Ownership and delivery order

Multideck maintains the full accounting system: double-entry bookkeeping,
General Ledger, sales and purchase subledgers, cash book, allocations and
financial reports. Transactions are prepared, validated, approved and posted
in Multideck, then replicated into the connected accounting package.

Complete and verify ERPNext first. Sage 50 is the next integration and must
reuse the same provider-neutral accounting lifecycle, reconciliation process
and acceptance criteria. Other providers follow afterwards.

The integration is two-way. External changes must be captured and reconciled
without silently replacing approved Multideck accounting records. An external
adjustment must become a reviewed, traceable Multideck transaction or an
explicit discrepancy requiring resolution; it must never disappear in sync.

External accounting packages support the statutory reporting workflow until
Multideck has the necessary sign-off and verified capabilities for the relevant
jurisdiction, including MTD and VAT returns. Native ledger availability does
not establish statutory readiness. Eventually the external package becomes an
optional customer choice, with the integration capability retained.

This document records requirements, not verified implementation or regulatory
approval. Every checklist item below remains open until supported by evidence.
Existing mirror policies must not be interpreted as statutory sign-off.

## Implementation progress

15 September 2026: the first backend increment adds ERPNext draft and submitted
document readback checks, structured mismatch evidence, retained-reference
recovery and connection-scoped delivery-issue resolution. Shared decimal
comparison rules are reusable by Sage 50. This is document-delivery validation;
the full two-way and ledger-reconciliation checklist remains open.

Signed, company-scoped inbound receipts, atomic deduplication and a fresh-provider
comparison worker are deployed to the ERPNext sandbox. Invoice and allocated
receipt delivery have passed connected acceptance. Incoming differences currently
produce review exceptions; automatic import and settlement reconciliation are not
yet implemented. Receipt acceptance never changes the books.

## External alterations and inbound import — confirmed 18 September 2026

The user requires changes made in either ERPNext or Sage 50 to be detected and
brought back into Multideck. Sage 50 must use the tenant's HyperExt Accounts API.
This is part of the integration, not an optional one-way export feature.

- Detect changes to customers, suppliers and accounting addresses, plus financial
  documents, journals, cash movements, allocations, cancellations and deletions.
- Persist each provider identity, version, source snapshot and field-level
  difference before applying an import. Missing events need recoverable scans;
  a webhook-only implementation does not meet this requirement.
- Use the last verified common snapshot to distinguish an external-only change
  from a simultaneous local/external conflict. Never choose a winner by timestamp
  alone or replace current Multideck data from a stale event.
- Import eligible new financial records into the existing controlled draft and
  approval flow. Amendments to posted accounts use linked adjustments/reversals.
  Preserve tax, nominal, currency, party, bank and period validation.
- Recognise Multideck-originated exports and payments as acknowledgements, not
  new transactions. Verify settlement changes against the actual allocations so
  the same payment cannot be posted twice or an unrelated write-off hidden.
- Expose imported, unchanged, conflicting, blocked and failed outcomes separately,
  with reviewed resolution and deterministic Dexter watch parity.
- For HyperExt, verify the configured endpoint, exact Sage company identity,
  version and SDO/ODBC readiness before reads or writes. Confirm the supported
  audit/search paging and change fields against its deployed API contract;
  recover safely after a Sage restore or audit purge.

At the 18 September live check, this tenant had only an active ERPNext connection;
no Sage 50 connection was present. HyperExt company and secure configuration
location are required before connected Sage acceptance. This section records the
required behaviour and does not claim the inbound importer is implemented.

See the [verification record](../docs/verification/2026-09-15-erpnext-delivery-readback.md)
for local checks and outstanding release evidence.

## ERPNext acceptance checklist

### Native accounting

- [ ] Sales invoices, purchases, credits, receipts, payments, journals,
  allocations and reversals post through one approved accounting lifecycle.
- [ ] Every journal balances; posting is atomic and idempotent; posted records
  are immutable and corrections use linked reversals or adjustments.
- [ ] Sales and purchase subledgers reconcile to their General Ledger control
  accounts; the cash book reconciles to bank ledger accounts.
- [ ] Trial balance, profit and loss, balance sheet and aged receivables/payables
  agree with the underlying journals for the same entity, period and basis.
- [ ] Opening balances, period locks, year-end entries, accruals/WIP, partial
  settlements, overpayments, write-offs and credit allocations are covered.
- [ ] Currency precision, exchange rates, realised/unrealised FX, tax rounding
  and effective tax treatments are explicit and reproducible.

### Two-way delivery and reconciliation

- [ ] Reviewed mappings cover entity, parties, nominal/control accounts, tax,
  bank accounts, currencies and required provider dimensions; ambiguity blocks.
- [ ] Outbound entries preserve approved accounting meaning and retain source
  IDs, provider IDs, versions, payload evidence and correlation IDs.
- [ ] Retries after timeout or partial submission recover the same external
  record; concurrent workers cannot create duplicate accounting entries.
- [ ] Inbound changes are authenticated, company-scoped, deduplicated and
  protected against replay and sync loops, with durable checkpoints.
- [ ] Missed events are recovered through incremental reads and periodic full
  reconciliation; pagination, late events and out-of-order events are tested.
- [ ] Provider-created entries, amendments, cancellations, deletions and
  allocations are detected and staged for controlled review where necessary.
- [ ] Conflicts, locked periods and unmapped external records enter a visible
  exception workflow; neither system silently overwrites approved entries.
- [ ] Reconciliation compares individual documents, journal lines, taxes,
  currencies, allocations and outstanding balances, plus account totals,
  trial balance, subledger controls and cash book balances.
- [ ] Each run records entity, period, currency, cut-off/checkpoint, completeness,
  counts, totals, mapping version and evidence. Partial or stale reads cannot
  report success. Bank-statement reconciliation remains a separate control.
- [ ] Tolerances are approved and explicit; missing or duplicate records cannot
  be hidden by netting totals. Exceptions retain owner, reason, resolution,
  approval and successful recheck evidence.
- [ ] Operators can distinguish native posting, delivery, acknowledgement and
  verified reconciliation, with actionable failures and safe recovery controls.

### Security, operations and sign-off

- [ ] Provider credentials stay in the tenant backend; exact provider/company
  identity, least privilege, role checks and cross-tenant denial are verified.
- [ ] Financial writes and reconciliation adjustments require the appropriate
  approvals and preserve append-only actor/source/change audit evidence.
- [ ] Outages, rate limits, credential rotation, restore/replay and backlog
  recovery are tested without data loss or duplicate posting.
- [ ] Dexter reads and Watching for you expose permitted reconciliation evidence
  and deterministic events. Writes use approved allowlisted actions; unsafe or
  unsupported capabilities have explicit documented exceptions.
- [ ] Representative end-to-end ERPNext evidence covers happy paths, realistic
  failures, concurrent retries, inbound changes and deliberate discrepancies.
- [ ] Local checks, connected sandbox tests, deployment and confirmed live
  results are reported separately. Finance-owner acceptance is recorded.
- [ ] Statutory reporting readiness is assessed separately by jurisdiction and
  reporting obligation before offering Multideck as the standalone solution.

## Sage 50 replication gate

- [ ] Confirm the target Sage 50 edition, country, version, company identity and
  supported tenant connector route before implementing provider operations.
- [ ] Reuse canonical Multideck records and shared finance screens; keep
  provider-specific transformations and credentials behind the backend adapter.
- [ ] Run the entire ERPNext acceptance suite against Sage 50 with explicit
  evidence for provider limitations and approved alternatives.
- [ ] Verify local connector availability, permissions, interrupted operations,
  restart recovery, locking and backup/restore behaviour where applicable.
- [ ] Keep Sage posting unavailable until the complete contract passes;
  customer onboarding alone does not establish accounting integration readiness.

## Architecture and implementation boundaries

Frontend workflows belong in `multideck.client`; privileged integration logic,
ledger persistence and reconciliation belong in root `supabase`. This brief
does not move accounting execution or credentials into the browser.

Follow the [provider adapter contract](../docs/architecture/finance-provider-adapters.md),
[product architecture](../docs/architecture/three-product-platform.md),
[data access policy](../docs/agent-policies/data-access.md),
[tenant/auth policy](../docs/agent-policies/tenant-auth.md) and
[Dexter parity policy](../docs/agent-policies/dexter.md).

The delivery order above supersedes older roadmap wording that places Xero or
QuickBooks ahead of Sage 50. It does not mark any provider capability complete.

## Account-first lifecycle (16 September 2026)

Customers and suppliers must be created in each applicable connected accounting
system from durable Multideck account-change events. They must retain a stable,
reviewed provider identity; name matching alone is insufficient. Creation,
updates, retries, external changes and missing/disabled records require evidence
and visible exceptions. Finance exports must not bypass a pending account check.

The ERPNext party-master backend is deployed and has passed connected customer
creation and party/address readback checks. The client is tested locally; full
financial reconciliation remains outstanding. See [verification and outstanding scope](../docs/verification/2026-09-16-accounting-party-lifecycle.md).
This is separate from full platform and ledger reconciliation; Sage must pass the
same recovery and readback contract before automatic sync is enabled.
