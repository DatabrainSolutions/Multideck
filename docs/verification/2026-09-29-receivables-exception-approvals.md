# Receivables exception approvals — local verification

## Implemented

- Separate, versioned receivables policy under Finance admin → Posting & approval controls → Controls & audit.
- Same exception rules for sales invoices and customer credit notes: absolute gross value in base currency, and the minimum whole-job expected margin excluding tax. A 0% minimum catches expected losses.
- Expected job sales and costs are the benchmark. Partial posted invoices/costs are not substituted, and this document is not added to expected sales a second time. Every linked job is checked separately. Missing costing or unverifiable job scope requires review.
- Existing document policy remains the fallback until a receivables policy is saved. No threshold has been chosen or activated for a live entity. Supplier policy and core posting checks remain in place.
- Review reasons appear in the approvals register; document details show expected costing at submission. Saved decisions and policy revisions retain audit evidence.
- Dexter can read the policy and decision. Deterministic policy/document watches expose the new fields and recheck each recipient's current access. Policy edits and transaction approval remain manual Finance controls.

## Checks

- Client production build passed; existing bundle-size warnings remain. Client TypeScript check passed again after the final validation-copy edit.
- Deno checks passed for `finance-subledger` and `agent-dexter`.
- Real PostgreSQL policy/submission fixture passed: invoice and credit eligibility, exact amount/margin boundaries, expected losses, incomplete and missing costing, zero-cost break-even, multiple linked jobs, standalone documents, currency controls, policy persistence/audit, foreign-job evidence exclusion, denied foreign/inactive/direct-client calls, and unchanged payables selection. The fixture substitutes the underlying document transition; it tests the new policy path, not a fresh end-to-end native-ledger posting.
- Full finance migration manifest installs successfully against the committed tenant baseline, including function/table privilege checks.
- Real deterministic PostgreSQL watch lifecycle passed: matching/non-matching decisions, no duplicate on unchanged evidence, pause/resume, exact target, foreign-company denial, revoked/inactive/unlinked owners, and an unauthorised watcher sharing an authorised watcher's signal.
- Required data-access runner: **135 passed, 1 failed (136 total)**. The unchanged CRM weekly-history test fails `foreign earlier history does not extend coverage`; it also fails in isolation. Its fixture does not apply the receivables migration. No CRM code or tests were changed.
- Authenticated Chrome at `http://localhost:3000/finance/controls`, reading **Multideck Accounts Demo (Sandbox)**: policy loading, empty/unsaved defaults, amount and margin inputs, invalid 101% margin keeping Save disabled, valid values enabling Save, keyboard focus, desktop and 390 × 844 layouts. No policy was saved. Temporary viewport reset. Captured console errors were browser-extension storage errors; no approval-component error was observed.

## Limits

Local code and isolated PostgreSQL tests only. No tenant migration, Edge deployment, production deployment, or live threshold activation was performed. Browser save/reload persistence and live end-to-end invoice/credit posting remain unverified until the backend is deployed to an intended test tenant. The new held-document notice is type-checked but was not exercised against a newly held live document.
