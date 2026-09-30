# Native Accounts in-app demonstration — 25 September 2026

## Observed in Chrome

Scope: authenticated local client at `http://localhost:3000`, using the
existing Databrain Test legal entity and its connected development backend.
This was a read-only review of existing non-commercial test records; no
accounting document, bank statement, close pack or tenant was created.

| Step | In-app evidence |
| --- | --- |
| Sales subledger | `SI-000003` is a submitted, native-posted GBP 1.00 sales invoice with GBP 0.00 outstanding. Its history shows draft, review and approval, and its posted lines are locked. |
| Cashbook | `RCPT-000001` is a submitted, native-posted GBP 1.00 customer receipt with GBP 0.00 unallocated. |
| General ledger | `NATIVE-SI-000003` debits trade receivables GBP 1.00 and credits freight revenue GBP 1.00. `NATIVE-RCPT-000001` debits the GBP bank GBP 1.00 and credits trade receivables GBP 1.00. The transaction drill-down is read-only. |
| Financial reports | The January–September 2026 trial balance shows GBP 109.01 debit and GBP 109.01 credit movement. Its bank nominal shows GBP 1.00 debit movement; trade receivables show GBP 7.00 debit and GBP 1.00 credit across the selected period. |

These observations establish one existing native sales-to-cash posting chain
and a balanced report. They do not establish a complete Accounts release or
the accuracy of the existing test entity's comparative balances.

## Current in-app blockers

- Bank reconciliation renders its scope but its new tenant Edge endpoint is
  unavailable. The screen now reports that the tenant service could not be
  reached. Its real import, match and verification flow cannot be demonstrated
  until the preview-scoped backend is deployed and checked.
- The Accruals & WIP screen renders the accounting close controls, but the
  connected backend returns `Accrual and WIP endpoint not found` for the new
  close path. A close cannot be claimed from this browser session.
- Financial reports warn that three approved historical records are outside
  the native ledger. They require a reviewed opening cutover before those
  comparative totals can be relied on. The existing test entity also contains
  an internal job with GBP 400,000,000 of expected revenue; its WIP totals are
  unsuitable for a representative product demonstration.

## Native demo acceptance path

Use a separately reviewed native-only legal entity after its scoped draft,
cash, UI and Dexter access paths pass multi-entity and cross-tenant checks.
On the preview deployment, demonstrate a realistic sales invoice and receipt,
supplier invoice and payment, matched bank statement, GL account drill-down,
trial balance and reports, VAT evidence, and an independent period close.
Every screen must retain that exact legal entity; the bank selector now reads
and writes the validated Accounts session selection. Recheck the app's network
and console errors and confirm the preview version before describing any
step as live.
