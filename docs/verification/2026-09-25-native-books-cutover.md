# Native books and CargoWise cutover evidence — 25 September 2026

Status: **local implementation and PostgreSQL verification only**. No tenant
data was imported, no opening package was approved or posted in a connected
tenant, and no release or live provider reconciliation is claimed.

## Implemented boundary

- A CargoWise trial balance can be staged with its source filename, SHA-256,
  source row numbers, exact nominal codes, base-currency amounts and bank, tax,
  accrual/WIP and source reconciliation references. An operator explicitly
  approves and posts one balanced opening journal to an empty native ledger.
  By default the approver must differ from the staging operator; a bounded
  legal-entity policy can waive that second-person check, with an audit event
  recording the policy decision. No unattended opening posting is available.
  The package and rows are immutable. The GL-only path rejects open AR/AP,
  unapplied cash and a linked accounting mirror.
- The **full open-item** package stages a second source manifest and immutable
  customer/supplier invoices, credits and unapplied receipts/payments, including
  original source and base amounts, outstanding source and reviewed carrying
  amounts, historical dates, party mappings and UK prior-filing references.
  Control balances must reconcile by AR/AP nominal to the single trial-balance
  journal. After approval under the entity policy, posting creates operational documents
  and cash with reserved source IDs and an opening marker, without a second GL
  posting. Native trade control compares these links and source carrying values
  to the posted trial-balance lines. Historical opening documents are excluded
  from current VAT capture; UK posting requires the separate VAT readiness hook.
  A linked ERPNext connection blocks full posting before a ledger write. A
  full trial-balance journal including AR/AP controls cannot be mirrored safely
  alongside provider opening invoices or payments until their residual journal
  and exact source identities are reviewed. The migration panel can show and
  retry opening-journal delivery status for eligible packages.
- A posted native cash allocation against an imported opening invoice can be
  independently proposed and posted as a reviewed settlement. The settlement
  reverses the allocated cash amount from the normal cash control, applies the
  imported invoice carrying amount to its source AR/AP control, and posts the
  realised FX difference to a selected gain/loss account. It records rates,
  allocation, source document, posting batch and audit evidence. If the cash
  period is closed, posting requires a dated correction in a later open period.
  The migration panel pages through the allocated opening cash worklist and
  shows proposal, posting and correction controls. A bounded entity policy can
  waive the second-person check for an explicit FX post in the original open
  period. Closed-period corrections continue to require another operator.
- Charge-to-nominal mappings have an independently approved effective-dated
  snapshot. Document approval pins the actual nominal and mapping provenance;
  month-end charge accrual/WIP selects the accrued nominal from the same
  snapshot effective at period end. Edits to a proposed mapping cannot change
  either posting. Backdated activation is rejected when charge documents or
  accrual/WIP close journals have already posted in its date range.
- Manual journal reversal creates a draft linked to the original posted
  journal, with the exact opposite of its posted lines and a recorded reason.
  Posting continues through the normal permission, open-period and mirror path.
  Committed native posting batches and lines reject updates and deletes; a
  correction requires a new entry.
- Dexter explicitly reports opening packages, mapping cutovers and linked
  reversal relationships as unsupported chat/watch capabilities. Existing
  ordinary general-ledger status and mirror-status reads/watches remain
  available. The exception is intentional until exact scoped reads, reviewed
  writes and deterministic event adapters exist for these sensitive records.

## Evidence checked locally

| Check | Result |
| --- | --- |
| `node --test supabase/tests/opening-balance-cutover-postgres.test.mjs` | Passed: independent approval, exact posting, GL agreement, source and access denials. |
| `node --test supabase/tests/opening-full-cutover-postgres.test.mjs` | Passed: full source staging, default second-person denial and bounded same-operator policy waiver, exact AR/AP control, one TB batch, operational invoices/credits and unapplied cash, source immutability, cross-tenant and linked-provider denial, EUR gain/loss settlements, closed-period second-person control, and trade control agreement. |
| `node --test supabase/tests/finance-release-manifest-postgres.test.mjs` | Passed: ordered Finance migrations install on the tenant baseline with service-only access. |
| `node --test supabase/tests/charge-mapping-cutover-postgres.test.mjs` | Passed: independent dated cutovers, document correction pinning, later editable-map drift, accrued nominal selection and backdated activation denials. |
| `node --test supabase/tests/general-ledger-postgres.test.mjs` | Passed: exact linked reversal and journal mirror lifecycle. |
| `node --test supabase/tests/accounting-migration-reconciliation.test.mjs` | Passed: source TB/control agreement and foreign-currency carrying-value preflight. |
| `npx tsc -b --pretty false` in `multideck.client` | Passed. |

## Release limits

The production CargoWise cutover is still blocked. The full source package and
workflow are locally implemented, but no real CargoWise extract, party mapping,
source workbook archive, tenant VAT return, or live provider readback has been
reviewed. A matched ERPNext opening journal does not create or verify matching
provider invoices, credits and payments. Provider period comparison must keep
those source items as an explicit unmatched subledger blocker.

Existing cash approval records allocations at the document exchange rate.
The local test proves the later reviewed cash-rate adjustment and source-control
reclassification for one customer and one supplier case; real imported rates,
bank statements and posted balances have not been reconciled in a tenant.
Large (up to 50,000-row) source payload and processing performance has not been exercised.
Tenant-specific GL, subledger, bank, VAT, accrual and external-mirror agreement,
period close, and live URL/version checks are required before calling the books
released. The browser verification attempt was blocked by the Chrome request
header policy loader, so UI interaction and responsive checks are unverified.
