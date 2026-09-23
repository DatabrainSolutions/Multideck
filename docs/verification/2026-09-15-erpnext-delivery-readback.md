# ERPNext delivery and inbound receipt verification

Date: 15 September 2026. Status: implemented locally; not deployed or confirmed
against a live ERPNext tenant.

## Implemented

- Exact draft readback before submission and persisted document readback after
  submission. Differences block delivery and retain the external reference and
  structured evidence. Recovery recognises an already-submitted matching record
  without another create or submit.
- Document/base totals, polarity, currencies, rates, dates, line/item/account
  mappings, net amounts and aggregate taxes are checked. Cash also checks both
  accounts, currencies, allocations and unexpected deductions/taxes. There is
  no implicit rounding tolerance. Scope is explicitly `document_delivery`.
- A successful retry only resolves delivery issues for the same connection;
  independent ledger discrepancies remain open.
- Signed inbound receipt with a 256 KiB limit, exact company/connection binding,
  original UTF-8 evidence and PostgreSQL parsing of financial decimals. Atomic
  deduplication preserves the first receipt and acknowledges equivalent retries.
  Conflicting versions fail without replacing evidence. No financial mutation
  occurs on receipt.
- Provider-party identifiers are narrowed to non-empty strings before mapping,
  fixing the two existing Edge Function type errors in that path.

## Evidence

| Check | Result |
| --- | --- |
| `node --test supabase/tests/erpnext-delivery-readback.test.mjs` | 12 passed; pure comparisons and production adapter/queue orchestration with mocked network/database boundaries |
| `node --test supabase/tests/erpnext-webhook-receipt.test.mjs supabase/tests/erpnext-webhook-receipt-postgres.test.mjs` | 9 passed; signed transport behaviour and real PostgreSQL receipt, role and concurrency checks |
| `PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node supabase/tests/run-data-access-regression.mjs` | 33 passed across the main and filtered contract runs; no skipped PostgreSQL fixtures |
| `npx --yes deno@2.9.6 check supabase/functions/_shared/accounting-providers.ts` | Passed |
| `npx --yes deno@2.9.6 check supabase/functions/erpnext-webhook/index.ts supabase/functions/finance-subledger/index.ts` | Passed |
| Full finance foundation and native compliance source contracts | 49 passed, 6 existing failures; the same six failures reproduced with this task's source changes replaced by HEAD inside an isolated test process |

PostgreSQL 17 was installed locally for disposable fixtures. Tests start and
stop isolated Unix-socket databases; no tenant database or provider records were
changed. No background database service was started.

The six existing finance source-contract failures concern `Compliance
obligations`, an old bank-currency error message, the invoice Excel formula,
`Existing ERPNext customer`, `Accounts & controls` and `Accounting systems`.
They have not been weakened or hidden. Existing merge conflicts in
`account-operations-workspace.tsx` and `organisation-foundation-panel.tsx` remain
outside this integration change. A whole-client build/browser journey is not
claimed.

## Migration and deployment order

The new migration is
`20260915104214_erpnext_webhook_receipt_guardrails.sql`; its exact SQL is also in
the provisioning baseline. No applied migration was edited.

Before any tenant rollout, identify the intended tenant and check the active
ERPNext connections, legal entities and provider Company names. Resolve
ambiguity through reviewed setup. Confirm the webhook template supplies
`doctype`, `name`, `company` and `modified` (and preferably `event`). Apply the
migration before deploying the new receiver. Repeat role and company probes
after deployment and deliver signed test events against the intended tenant.
No live preflight, migration, deployment or connected-provider test has occurred.

## Explicit remaining work

- Durable inbound consumer, connection/version revalidation, loop prevention,
  provider-created adjustments, missing/deleted records and an approved conflict
  resolution workflow.
- Incremental catch-up/checkpoints and complete period reconciliation of GL
  entries, trial balance, tax accounts, subledger controls and cash balances.
- Provider-side recovery when a create response is lost before an ID is known,
  stronger queue leasing and atomic delivery finalisation. Existing multi-table
  delivery updates still need transactional persistence/error handling review.
- Mapping and comparing invoice control/tax accounts and complete GL dimensions;
  checking document amounts alone is not proof of ledger equivalence.
- Raw readback and webhook receipts are explicitly unsupported as Dexter
  reads/watches. Document errors reuse existing evidence and deterministic
  export-status events. Cash delivery-error read/watch parity remains a separate
  database capability; its full lifecycle must pass before advertising it.
- Connected ERPNext tests including provider recalculation, rounding, timeouts,
  event templates and end-to-end recovery. Statutory readiness remains separate.
- Sage 50 adapter implementation and the same acceptance suite after ERPNext
  completion; shared decimal comparison is only the first reusable element.

## Provider references

The transport follows [Frappe webhook signatures](https://docs.frappe.io/framework/user/en/guides/integration/webhooks)
and [Frappe REST document readback](https://docs.frappe.io/framework/user/en/api/rest).
Field checks were cross-checked against ERPNext's
[Sales Invoice definition](https://github.com/frappe/erpnext/blob/version-15/erpnext/accounts/doctype/sales_invoice/sales_invoice.json)
and [Payment Entry definition](https://github.com/frappe/erpnext/blob/version-15/erpnext/accounts/doctype/payment_entry/payment_entry.json).
The exact deployed provider version still needs connected validation.
