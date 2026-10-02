# Supplier finance register

## Implemented locally

- `/suppliers` uses the customer finance register pattern for Accounts payable: open balance, overdue invoices, payment terms, payment holds, optional accounting sync and supplier creation. Customer credit-limit controls remain customer-only. The header stacks on narrow screens.
- Legacy `/crm/accounts?view=suppliers` links resolve to `/suppliers`; the existing `/crm/suppliers` alias remains supported.
- The customers Edge Function obtains supplier financial data only for current `Customers.Read` and `Finance.Payables.View` permission holders. Accounting sync additionally requires `Finance.Integration.Manage`.
- The new service-role-only supplier snapshot is company scoped, bounded to 100 requested rows, and preserves the complete register summary. Only approved/submitted supplier invoices and signed debit notes contribute; historical inactive entities remain included and incompatible base currencies suppress monetary totals.
- The provisioning baseline and Finance migration manifest include the new migration. No live migration, function deployment or frontend deployment was performed.

## Dexter parity exception

This is a read-only register projection, not a new persisted workflow. Existing permission-gated Finance document reads and deterministic document lifecycle watches remain the supported chat/watch surfaces. Exact supplier-register aggregates and payment-term summaries are explicitly unsupported in both chat guidance and watch planning, which direct operators to `/suppliers`. Partial document results must not be presented as full-register totals. No new writes, recurring LLM evaluation or synthetic watch events were introduced.

## Verification

- Production frontend build passed; subsequent TypeScript check passed after the mobile header adjustment. Existing bundle-size warnings remain.
- Supplier PostgreSQL fixture and permission tests passed. Checked signed supplier credits, exclusion of receivables/drafts/foreign documents, account eligibility, full-summary versus requested-row scope, purchase terms, supplier holds, direct anonymous/authenticated denial, separate integration access and incompatible currencies.
- The full PostgreSQL access regression run completed with 136/138 passing. The new migration initially required a release-manifest entry; after adding it, the Finance release installation test passed. The remaining independently rerun failure is the existing CRM weekly-history assertion `foreign earlier history does not extend coverage` in `crm-sales-insight-series-postgres.test.mjs`. It remains a release blocker; no assertions were weakened.
- Authenticated Chrome at localhost:3000 verified Finance navigation, the legacy supplier URL, supplier-only rows, empty-search and clear-search recovery, New supplier with Supplier preselected, Escape dismissal, the customer credit-limit view, and desktop/390px mobile layout. No supplier was created or edited.
- Browser console inspection found storage-context errors also attributed to a Chrome extension. The register rendered and fetched rows. The connected service still runs the old backend and returns supplier financial access as false; populated balances, financial happy-path browser behaviour, full save/persistence and live tenant probes remain unverified pending deployment of the new snapshot and Edge Function. No mock financial data was substituted.

## CRM regression follow-up

The remaining CRM weekly-history failure was traced to DST-sensitive expected timestamps in its test fixture and corrected without changing production CRM behaviour. The full access runner now passes: 140 main tests and 9 access-contract tests, zero failures or skips. See `2026-09-29-crm-history-dst-regression.md`. The release-test blocker is cleared; the supplier changes still have not been deployed.
