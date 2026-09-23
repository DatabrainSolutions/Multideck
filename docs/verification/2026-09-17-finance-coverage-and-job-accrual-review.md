# Finance coverage and automatic job accrual review

Reviewed 17 September 2026. This is a source assessment, not confirmation of deployed or live accounting behaviour. Existing finance changes and unresolved CRM merge conflicts were preserved.

## Coverage found

| Area | Evidence and limits |
| --- | --- |
| Sales ledger | Invoice/credit lifecycle, receipts, allocations and credit-control routes in `finance-page.tsx`; native document posting in the migration chain. |
| Purchase ledger | Supplier invoices/credits, approval and supplier payments/allocations. |
| Cashbook | Customer receipts and supplier payments with native journals. The reconciliation route filters unallocated cash and mirror exceptions; this is not full statement reconciliation. |
| General ledger | Nominal accounts, balanced posting batches and lines, accounting periods, native P&L, balance sheet and trial balance. The GL route currently selects the ledger configuration tab; a complete operator journal register/editor is not established by this review. |
| Job accounting | Canonical job charge lines, expected costs/revenue, exact invoice-to-charge links, period-close accrual/WIP posting and automatic release on actual posting. |

Additional completion areas to verify/build: bank statement imports/feeds and matching; transfers, fees and non-party cash entries; manual and recurring journals; prepayments/deferred income; realised/unrealised FX; aged debtors/creditors and statements; supplier payment runs/remittances; tax returns and reconciliations; period/year-end close and opening balances; fixed assets/depreciation; cash-flow forecasting; budgets and intercompany/consolidation where required. Existing configuration or schema does not establish a working end-to-end feature. Payroll is a separate scope decision.

## Accrual findings

1. `finance-accruals/index.ts` calculates candidates from expected job charge amounts and posted actuals. Creating, approving and posting a period-close review remains an explicit workflow. Continuous automatic creation/update of all job estimates was not found.
2. `20260830215402_charge_line_accrual_wip_profitability.sql` releases existing WIP/accruals against the exact linked job charge when an SL/PL invoice posts. Releases are capped by invoice value and remaining accrual. A final invoice below estimate therefore leaves a residual unless explicitly cleared.
3. Candidate calculations currently subtract actuals within the selected management month, retaining outside-month actuals separately. This requires a cross-period regression before using the same calculation for continuous outstanding estimates.
4. `FIN_JobChargeProfitability` recognises actuals plus posted open WIP/accruals, not every unposted expected amount. It cannot establish continuous expected P&L before accrual posting.
5. Credit notes are explicitly excluded from the existing automatic-release path. Cancellation, credit, reopening and rebilling need defined lifecycle coverage.

## Required behaviour for the requested continuous flow

- An eligible confirmed job charge contributes its expected net sales and cost immediately to management P&L; sales are unbilled revenue/WIP and costs are accrued costs.
- Partial actuals replace the matched portion and retain only the expected remainder. Final actuals replace the full estimate and expose the variance.
- Edits, cancellation, credits and reopening recompute remaining exposure without duplicate journals or loss of audit evidence.
- Preserve legal entity, job, charge, nominal, currency/FX and management-period provenance. Keep locked periods protected and adjustment evidence explicit.
- Distinguish management expectations from statutory recognition; define when estimates should become GL postings.
- Reconcile job totals to accrual/WIP controls and GL. Preserve Dexter read evidence and deterministic watch signals through the same lifecycle.

Decision needed before changing the release calculation: should a matched invoice be final by default, with an explicit partial-invoice option, or always consume its amount and leave the residual estimate? For example, does a £90 supplier invoice close a £100 estimate or leave £10 accrued?

## Verification performed

Ran the five finance accrual/WIP, automatic release, charge profitability, universal job charge and native global compliance source-contract suites: 24 passed, one failed because the native-compliance suite expects the UI text `Compliance obligations`. No test was changed. These are source contracts, not executed accounting transactions.

No ledger data, deployment, migration or production setting was changed by this assessment. Automatic accrual is not yet certified as meeting the requested continuous lifecycle. Required next verification is an isolated PostgreSQL lifecycle fixture covering estimate creation/editing, partial/final actuals, cross-period posting, credits, cancellation, retries, concurrency, balance reconciliation, access denial and Dexter watches.
