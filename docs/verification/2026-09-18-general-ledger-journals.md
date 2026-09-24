# General ledger and journal entry — local implementation

## Operator workflow

- Finance > General ledger > Transactions: posted native ledger lines, period range and paginated results. Select a transaction number to inspect all its debit and credit lines.
- Account enquiries: choose a nominal account, then inspect opening balance, debits, credits and closing balance across complete accounting months. The totals cover the entire selection, not only the visible page.
- Journals: New journal in the top-right action, save a draft, review it, then explicitly confirm posting. Drafts may be unbalanced; posting may not. Posted entries are read-only and feed the existing financial reports through `FIN_PostingBatches` and `FIN_PostingLines`.
- Chart of accounts remains at `/finance/ledger`; the operational workspace is `/finance/general-ledger`.

Initial scope is legal-entity base currency, up to 200 lines, four decimal places, active non-control nominals permitted for manual posting. AR/AP/bank/control adjustments must use the relevant subledger. Foreign-currency journals, automated reversal schedules, a dedicated reversal workflow, attachments, tax journals, opening-balance imports and job dimensions are not included. A correction currently requires a separately reviewed balancing journal. This change does not implement the separate outstanding continuous job-accrual request.

## Posting and access

`finance-ledger` authenticates the active internal user, derives the company and permits only its active legal entities. It reuses the assigned `Finance.Management.View`, `.Prepare` and `.Post` permissions. The service-only journal RPC repeats actor, entity and action checks. Tables have RLS and no browser grants. Posting locks the journal and period, rejects closed periods, rechecks accounts and exact balance, atomically writes the native batch and all lines, retains audit and queues delivery. Repeated posting returns the same batch. Draft versions prevent stale overwrites.

## Accounts system delivery

ERPNext is the first supported journal adapter. Posting attempts delivery when the existing mirror policy requires it. Delivery errors remain separate from native posting and are visible on the journal, with an explicit Retry delivery action. Work interrupted before delivery remains queued; there is no new background polling worker in this slice.

Prerequisites:

1. Deploy `20260918123733_general_ledger_journals.sql` and the `finance-ledger` Edge Function to the intended tenant. The baseline includes the same provisioning changes. Deploy the updated Dexter function for accurate capability descriptions.
2. Install the Journal Entry custom field in `supabase/integrations/erpnext/document-identity-fields.json` in the intended ERPNext site. The identity field must be Data and unique; delivery fails closed without it.
3. Review the exact active connection, ERPNext site origin and company/base currency. Give the integration user the required Journal Entry create/read/submit and Company/Account/Custom Field read rights.
4. Set each journal nominal's external mapping hint to its exact ERPNext Account name. No account is guessed or created during posting. Group, disabled, wrong-company, wrong-currency and AR/AP/bank/cash provider accounts are rejected.

The first attempted payload pins the reviewed connection, site, company, account mapping and amounts. Unique tenant/source identity recovers a lost create response. A five-minute fenced lease prevents competing completion; retries recover an already-submitted journal without submitting again. Readback compares company, accounting date, document state, account, currency, exchange rate and exact debit/credit amounts. A known external ID is retained even if submit/readback fails. This proves that individual delivery, not full-ledger reconciliation or ongoing ERPNext change monitoring. Other packages remain unsupported for journal delivery.

## Dexter

The `general_ledger` domain exposes journal evidence under `Finance.Management.View`; its watch capability supports deterministic `status` and `mirrorStatus` changes. The evaluator rechecks the watch owner's current access. Revoked users lose journal-watch history access. Notifications use the existing private watch destination; source evidence provides the journal register route.

Explicit write exception: journal preparation, posting, correction and retry remain manual GL controls because nominal selection and the complete balanced entry require operator review. Dexter's prompt and registry state this rather than offering generic writes. No journal write action is allowlisted. Journal watches do not cover subsequent changes made independently in ERPNext.

## Verification and remaining rollout

- Client TypeScript check and production build passed (the existing large-chunk warnings remain).
- Deno type check of the new Edge Function passed.
- Real PostgreSQL tests cover balanced posting, idempotency, rollback on imbalance, closed periods, control/foreign accounts, stale draft versions, colleague enquiries, cross-company/inactive/unlinked/anonymous denial, revocation, deactivated creator history, mirror leases, pinned payloads and audit.
- Real deterministic journal watch tests cover matching/non-matching state, no-op repost, pause/resume, repeated delivery changes, foreign-company read isolation and revoked access/history.
- Adapter tests cover exact decimals, invalid accounts/company, unbalanced payloads, lost-submit recovery, changed readback and cancelled external journals. Existing identity tests cover missing custom field, lost-create response, concurrent identity recovery and conflicting records.
- Shared access regression: all 27 tests plus 10 scoped contracts passed, including the final watch-history additions. The eight journal/identity adapter tests also passed.
- Port 3000 was confirmed listening. Browser automation reached the real sign-in screen; authenticated happy/failure paths, responsive layout and keyboard interaction remain unverified because the fresh Chrome session is not signed in.

No tenant migration, Edge deployment, ERPNext custom-field installation or live journal posting was performed. Live deployment and end-to-end replication are not yet confirmed. Existing unrelated working-tree changes and unmerged CRM files were preserved.
