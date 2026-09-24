# Grouped accounting and CargoWise transition

## Status — 22 September 2026

The pure posting proposal and normalised chart-validation model is implemented in
`supabase/functions/_shared/grouped-accrual-model.ts` with executable tests.
The persisted group/member/charge-mapping schema and authenticated ledger endpoints
are now implemented locally in `20260922091752_nominal_groups_charge_relationships.sql`
and `finance-ledger`, with a typed client API. A real PostgreSQL fixture verifies
valid cost/revenue mappings, wrong-entity and wrong-type rejection, stale revisions,
disabled-account revalidation, immutable snapshots and colleague access boundaries.
Headers are separate records, never posting accounts. Finance Admin's ledger tab
now includes a page-local group setup and charge-mapping workflow using these APIs.
It uses saved, entity-scoped accounts, excludes already assigned members, offers
eligible P&L/control accounts, blocks edits while the chart has unsaved changes,
and refreshes mapping revisions after saves. Data Table's gallery entry links to
the nominal setup surface. Authenticated browser verification is still pending.
These mappings are not yet used by the posting workflows.
The read-only `POST finance-ledger/migration/reconcile` endpoint now checks a
normalised trial balance against open AR/AP invoices, credits and unapplied cash.
It uses the authenticated entity's saved accounts and base currency, not uploaded
account definitions. The pure reconciliation model uses four-decimal integer
arithmetic, checks each control independently, preserves source FX carrying values,
and rejects duplicate identities, invalid dates and inconsistent amounts. Eight
executable model tests cover these cases. This is a preflight only: it always
returns `postingAuthorised: false`, does not persist a batch or post transactions,
and does not yet resolve source parties, bank detail or job accrual/WIP detail.
The financial-report screen now consumes the saved nominal structure for a grouped
P&L breakdown: actual account movements, accrued account movements and their period
total, with expandable account detail. Unmapped/legacy accounts stay separate and
contribute exactly once. Seven executable presentation-model tests verify the join,
four-decimal aggregation, source code preservation, scope, membership, classifications
and reconciliation to the canonical ledger total. Invalid or unavailable group data
shows an explicit warning and preserves the flat ledger report. Group metadata does
not activate posting rules or retrospectively separate mixed historical balances.
Period accrued movement is explicitly distinguished from lifetime outstanding job
accruals; this report does not claim to calculate expected job cost. The report now
discards stale entity requests and displays up to four decimal places in the user's
English locale. TypeScript passes; authenticated browser verification is still pending
(the local app renders sign-in on port 3000).
Finance Admin's ledger page now includes a CSV/XLSX opening-balance preflight.
Operators explicitly choose the worksheet, header row, source columns, decimal/date
formats, amount convention and transaction-type mapping. The file reader retains
source SHA-256, worksheet, row numbers, text identifiers and Excel's 1900/1904 date
system. CSV supports comma, semicolon or tab and UTF-8 / BOM-marked UTF-16. Formulas,
ambiguous/invalid mappings, numeric Excel identifiers and invalid rows stop conversion;
no partial subset is submitted as a successful import. A typed client calls the
existing read-only reconciliation endpoint and maps its row issues back to the source.
The preview is browser-memory only, not durable staging or an approved import.
The model is **not wired into posting services**, and is not deployed.
No tenant has been switched, no source balances imported, and no new accounting
entries have been posted by this change. This document defines the remaining
implementation and release gates, not completed capabilities.

## Target chart

Separate balance-sheet accounts from profit-and-loss accounts. Each job revenue
or cost category has a non-posting group header and two posting accounts:

- Actual: invoiced amounts.
- Accrued: recognised amounts still awaiting an invoice.
- Expected total: actual plus outstanding accrued; a calculated total, not another posting.

Keep the original estimate separately for variance analysis. Expected is the current
best supported expectation, not a guarantee that the supplier will invoice that amount.
Never add balance-sheet control balances to the P&L group total.

Shared balance-sheet accrual and WIP controls can serve multiple charge groups.
Retain job, charge, supplier/customer and original posting identifiers on every movement
so detailed ageing does not depend on creating a control nominal per charge code.
Manual adjustments need their own explicit attribution; source adjustment accounts
must not silently be discarded or classified as actual invoices.

## Example, excluding tax

| Event | Debit | Credit | Actual cost | Outstanding accrued cost | Expected |
| --- | --- | --- | ---: | ---: | ---: |
| Recognise £100 estimate | Accrued cost £100 | BS accrual control £100 | £0 | £100 | £100 |
| Receive £96 invoice | Actual cost £96 | Trade payables £96 | £96 | £100 | £196 temporarily |
| Matched relief in the same atomic workflow | BS accrual control £96 | Accrued cost £96 | £96 | £4 | £100 |
| Approved final difference | BS accrual control £4 | Accrued cost £4 | £96 | £0 | £96 |

Invoice posting and matched relief must commit together so the temporary £196 state
is never a committed financial result. Finalisation remains a separate evidence- and
policy-controlled action. An invoice alone does not prove that no more charges will arrive.
Revenue uses reversed signs with trade receivables and the WIP/unbilled-income control.
Tax, exchange differences, credit notes, cancellations and reopened charges require
their existing explicit posting rules and additional integration verification.

## Tenant-safe transition

The old `_multideck_finance_derive_report_category` trigger guessed report category
from numeric code prefixes and overwrote classification on insert. The new local
`20260922095716_explicit_nominal_report_classification.sql` migration removes that
inference, honours explicit categories and derives defaults only from recognised
account types. Ambiguous types such as Tax require explicit classification. Existing
categories are not rewritten. The atomic administration writer now persists explicit
classifications; chart setup exposes BS/P&L category choices and filters. A real
PostgreSQL test runs the original nominal-write block, the migration patch and the
new trigger, including CargoWise WIP/accrual codes, leading zeros, explicit overrides,
updates and legacy-client upserts. This remains undeployed; imported charts must not
be applied to a tenant still running the old trigger.

1. Prepare a versioned plan for one legal entity and base currency. Preserve current
   account codes, posted transactions and audit history.
2. Review each group's actual/accrued nominals and BS controls. Validate account
   activity, statement class, currency, control status and exact external mappings.
3. Reconcile open accrual/WIP balances to their original posting lines. Never merely
   relabel an account with historical actual and accrued balances mixed together.
4. Choose a cutover period. Either leave legacy charges on their original posting
   accounts until settlement, visibly marked as legacy, or explicitly approve balanced
   reclassification journals and update the release provenance atomically. Do not
   rewrite historical postings or change provenance without a recorded transfer.
5. Independently approve the plan and reconciliation totals; activate once, under
   a transaction lock. Recheck revisions and permissions at activation.
6. Pin posting mappings. Reverse the original posted nominal, not the current mapping.
   Missing mappings block posting; there is no fallback into an arbitrary nominal.

## CargoWise migration

The supplied chart workbook is a reference, not permission to import its balances.
Preserve dotted and leading-zero codes as text. Offer a simpler chart to new tenants,
but preserve existing codes for migrating clients through an explicit mapping.

The normalised chart validator rejects duplicate codes, missing statement classes,
and incomplete actual/accrued groups. Chart-file parsing and application remain to
build; the new CSV/XLSX reader currently serves the trial-balance and open-item
preflight. It never infers chart classification from suffixes or applies accounts.

Required migration stages still to build:

1. Staging and provenance: source file hash, source system, batch, legal entity,
   currency, accounting date and immutable row-level validation results.
2. Chart preview: BS/P&L classification, non-posting headers, actual/accrued pairs,
   manual adjustment mappings and source-to-target code crosswalk.
3. Opening position: approved balanced trial balance, open AR/AP documents and
   allocations, bank positions, tax balances, and job-level open accrual/WIP detail.
   Control balances and subledger detail must reconcile without posting them twice.
4. Linked package setup: exact nominal mappings or reviewed account creation;
   journal/document identity and read-back verification. Never blindly duplicate
   existing external opening balances.
5. Dry-run and independent approval: source totals = staged totals = destination
   totals, with resolved exceptions and an explicit migration boundary.
6. Idempotent execution and reconciliation report. Retrying a batch must not duplicate
   accounts, invoices, journals or external delivery. Posted migration corrections use
   authorised reversals, not deletion.

## Integration and verification gates

### Whole-product coverage — source review, 22 September 2026

The transition is not complete until the following surfaces consume the same
persisted, legal-entity-scoped account classifications and charge mappings.
This matrix records requirements and source-review findings, not passing UI tests.

| Surface | Required behaviour / release check |
| --- | --- |
| Finance Admin / chart of accounts | Separate BS and P&L; non-posting group headers with actual/accrued children; searchable original codes; valid type and role combinations; no header selectable for posting. Current `LedgerTab` in `finance-setup-page.tsx` is still flat. |
| Charge-code setup | Explicit cost and revenue group mappings per legal entity, with actual/accrued and BS controls resolved visibly. Shared charge definitions must not leak one entity's nominal IDs into another. Current `FIN_ChargeAccountingRules` has a single nominal per rule, not the complete relationship. |
| Quote and job charge entry | Select the commercial charge code; derive accounting from approved mappings. Preserve estimates separately from posted accruals. An unposted quote is not an accrual. Check freight and other operational charge sources, not just manual jobs. |
| Sales and purchase invoices / credits | Resolve actual nominal from charge and entity; show account code and read-only description where accounting detail is exposed. Link relief to the exact charge and original accrual posting. Block wrong-role overrides and missing mappings server-side. |
| Job costing and profitability | Show actual, outstanding accrued and expected for both sales and costs, plus original estimate and variance. Expected margin uses expected revenue less expected cost. Existing charge profitability and lifetime review need group identifiers and separate nominal roles. |
| Accrual/WIP review and finalisation | Display both actual and accrued nominals, group and BS control. Initial recognition uses accrued; invoice relief and approved final differences reverse original accrued postings. Do not confuse period movements with lifetime outstanding balances. |
| Journals, reversals and journal imports | Posting accounts only; preserve dotted codes as text; code-only selected value and read-only description. Any authorised accrued-account adjustment must preserve job/charge reconciliation or be explicitly identified as an unallocated exception. Both UI and backend enforce restrictions. Current journal account contract has no group/role fields. |
| GL transactions and account enquiries | Drill down group → posting account → balanced source transaction; show actual/accrued role without duplicating descriptions. Both debit and credit remain visible. Historical account identity must remain readable after deactivation. |
| P&L, trial balance and balance sheet | Local P&L now groups actual and accrued **period movements**, reconciles to the canonical total and preserves ungrouped accounts. This is not lifetime expected job cost. BS controls appear only on BS; headers/subtotals never contribute a second time. Trial balance remains posting-account based. Still verify authenticated rendering, exports and opening/current/closing periods after deployment. |
| Cashbook, bank setup and reconciliation | Bank and settlement selectors accept appropriate BS posting accounts, never P&L headers or accrued expense/revenue accounts. Receipt/payment settlement must not recognise job profit a second time. |
| Tax, FX, control-account settings | Restrict selections to the correct account purpose and entity; retain tax/FX rules. Do not guess BS/P&L from a free-text external mapping hint or numeric code prefix. |
| ERPNext and other linked packages | Map each posting nominal exactly; treat report headers as non-posting. Recognition, actual invoice, relief, variance and reversal must all reconcile across systems with idempotent delivery. Existing provider item mappings are not a substitute for the four nominal roles. |
| CargoWise transfer and opening balances | Preview source/target codes, group, statement and role; block incomplete relationships. Reconcile opening GL against AR/AP, banks and open job accruals without duplicating control balances. Preserve migration provenance. |
| Documents, spreadsheets and exports | Include the same classifications and totals as the underlying authorised report. Customer-facing invoices need not expose internal accrual accounts. Templates must not infer roles from code suffixes. |
| Dexter and Watching for you | Use the same scoped classification and evidence. No claim that mapping, transition or import actions are supported until allowlisted, approval-safe adapters and deterministic events are tested. |
| Tenant provisioning and existing tenants | New tenants receive a coherent chart plus charge mappings. Existing tenants require reviewed cutover; no silent template append or global remap. Test permission revocation, inactive accounts, and entity changes. |

#### Cross-screen acceptance scenarios

1. A mapped charge carries the same group and posting accounts from setup through
   job, invoice, GL, report, export and linked-package read-back.
2. A £100 cost accrual, £60 partial invoice, £36 subsequent invoice and approved £4
   final release show expected cost £100, £100, £100 and £96 respectively. Each
   posting balances; the final accrued P&L and BS control residuals are zero.
3. Run the corresponding sales/WIP scenario and reconcile expected margin.
4. Exercise missing/disabled/wrong-entity mappings, group-header selection, credits,
   closed periods, repeated delivery, mapping changes and imported dotted codes.
5. Reconcile both group totals and individual posting-account totals; verify mobile,
   keyboard, empty/loading/error states and persisted settings in the real browser.
6. Do not reset existing demo transactions until scope is confirmed and an export,
   dependency inventory and matching external-accounting plan have been prepared.

- Wire initial accrual and WIP recognition to accrued P&L nominals.
- Keep actual invoices on actual nominals; prove atomic matched relief and finalisation.
- Add immutable, authorised group setup and migration staging with tenant isolation.
- Add grouped P&L and job enquiry, including clearly identified legacy balances.
- Replicate all relevant recognition, invoice relief, finalisation and reversal entries;
  reconcile native and linked ledgers, not merely invoice delivery status.
- Exercise partial/multiple invoices, overspend, final shortfall, changed estimates,
  credits, FX, closed periods, retries, concurrency and mapping changes.
- Verify standard-colleague access and cross-company denial with the PostgreSQL
  access suite; independently approved writes and an immutable audit trail are required.
- Dexter currently has no dedicated group-transition/import tool. This is explicitly
  unsupported until its allowlisted reads, approved writes and deterministic watches
  are implemented alongside the corresponding service. Existing GL access is unchanged.

Local model check: `node --test supabase/tests/grouped-accrual-model.test.mjs supabase/tests/cost-accrual-model.test.mjs`

### Current release failures

The 22 September broad source-contract run of
`supabase/tests/finance-subledger-foundation-contract.test.mjs` is **not green**:
Five obsolete UI/source expectations have now been corrected and pass: the cash
mapping explanation, customer-link wizard, live GL routes, Finance Admin labels and
invoice spreadsheet formulas. The formula contract now checks quantity × rate × ROE
and the tax/gross formulas, rather than multiplying quantity by the currency column.
The broad suite now has 34 passes and 13 unresolved failures. All remaining failures
expect historical migration text inside the provisioning snapshot. The baseline
README documents a schema-only snapshot instead, but replacing these checks still
requires executable proof of equivalent current provisioning behaviour; changing
the asserted labels or deleting the checks would not establish that equivalence.
Do not waive these checks or treat new import-model passes as a release pass.
Reconcile each assertion with the current implementation and executable provisioning
behaviour before release. No migration/deployment was performed during this preflight
implementation. Authenticated tenant-screen and connected-service verification remain
outstanding; isolated browser component tests are not substitutes for that journey.
