# Standard VAT sample batch 20260925

Created in Databrain Test (a8e98266-f5f4-4620-b45a-e3d991a38209) through multideck_finance_create_document_draft using the active operator and deterministic per-document idempotency keys. Every line is explicitly labelled SANDBOX VAT TEST, fictional and non-commercial. Existing approved Standard VAT code: 20%, recoverable purchases, GBP.

| Document | Type | Date | Net GBP | VAT GBP |
|---|---|---|---:|---:|
| SI-000004 | Sales invoice | 2026-09-10 | 10000 | 2000 |
| SI-000005 | Sales invoice | 2026-09-12 | 2500 | 500 |
| PI-000002 | Purchase invoice | 2026-09-14 | 4000 | 800 |
| PI-000003 | Purchase invoice | 2026-09-16 | 750 | 150 |
| CN-000002 | Sales credit | 2026-09-20 | -500 | -100 |
| DN-000001 | Purchase credit | 2026-09-22 | -100 | -20 |

Expected batch-only boxes after posting, credit linking and VAT review: Box 1 = 2400; Box 2 = 0; Box 3 = 2400; Box 4 = 930; Box 5 = 1470 payable; Box 6 = 12000; Box 7 = 4650; Boxes 8 and 9 = 0.

Current state: all six samples submitted and approved through the normal finance workflow RPCs on 2026-09-25, and confirmed posted in the native ledger. Each has three ledger lines with equal debits and credits. Live document totals confirm sales VAT 2500 less sales credit VAT 100 = 2400; purchase VAT 950 less purchase credit VAT 20 = 930, giving expected batch VAT payable 1470.

External mirror is disabled following the user's confirmation that ERPNext is switched off. Live verification found zero FIN_IntegrationQueue records for all six sample IDs after posting. The native ledger remains enabled.

This verifies native posting and sample arithmetic, not a reconciled or submitted VAT return. Existing non-VAT demo lines and other pending documents still need supported disposition before a complete entity return can pass. Credit notes must be linked to the matching test invoices through the normal reviewed workflow; VAT review and reconciliation remain outstanding. No HMRC return was submitted.

## Return build attempt

Created provisional Standard VAT period 1 July–30 September 2026, ID `ee766f1e-26c0-4eba-9b16-457ca83a853a`. Dates are not yet verified against an HMRC obligation. All six samples now have saved VAT treatment reviews. Sales and purchase credits have saved links to SI-000004 and PI-000002 respectively.

The real calculation RPC was attempted and rejected incomplete entity coverage: zero missing captured lines, three pending-migration documents (SI-000001, CN-000001, PI-000001), four unreviewed DEMO-NONTAX lines on SI-000002/SI-000003, zero unsupported source kinds. No calculation, reconciliation or review lock was created. The existing non-tax code cannot pass the UK VAT review's approved VAT-rule requirement.

Sandbox submission could not run: the current implementation exposes OAuth but no outbound obligations/submission route. Verified fraud-prevention ingress evidence remains unresolved, as documented in docs/architecture/hmrc-fraud-evidence.md. No sandbox VAT submission or receipt was produced. Expected sample-only figures remain a worksheet expectation, not a completed return.

## Outside-scope review implementation

The historical demo code is named “Demo only — no statutory tax”, with type `none` but category `zero_rated`. It must not silently become a statutory zero-rated supply. A new incremental migration supports an explicitly approved `out_of_scope` category with zero source VAT. Such sources retain a zero calculation contribution for audit, reconciliation and permanent transaction locking. A zero rate or `none` type with any other category still fails review.

The PostgreSQL lifecycle test covers successful review, zero box totals, retained source trace, reconciliation and rejection of later treatment edits. It also rejects the ambiguous non-tax/zero-rated combination. Existing tenant and permission guards are retained. Dexter exception: VAT source review/calculation remains under the existing documented unsupported VAT adapter exception; no Dexter write or watch capability is being advertised by this change.

The three historical pending-migration documents were posted using the existing native posting function, with balanced batches (CN-000001 GBP 10, PI-000001 GBP 1, SI-000001 GBP 1). No posted source amounts were edited.

## Live return rebuilt and locked — supersedes earlier blockers

Applied migration `20260925153903_uk_vat_reviewed_outside_scope` to project `aqtwypsuijxlnvtxpuxe`. Corrected only Databrain Test's explicitly non-statutory DEMO-NONTAX category from `zero_rated` to `out_of_scope`, retaining type `none`, zero tax rate and every posted amount. Recorded the correction in Audit_Events and reviewed all seven historical source lines through the existing review RPC.

The genuine period calculation succeeded with all 13 sources matched and no missing, pending or unreviewed sources. Nine boxes: 2400, 0, 2400, 930, 1470, 12000, 4650, 0, 0. All 13 sources were reconciled at `2026-09-25T15:40:02.194896Z`. A live rollback-only negative test confirmed a reconciled source rejects a new treatment decision.

Created the missing July accounting month through the existing period function. The quarter now has exact accounting coverage, six linked tax postings, zero unlinked postings and zero VAT-control difference. Recorded control review and whole-pound filing review. Review lock `d329f474-7057-4fec-8ae0-7b108dafd99b` succeeded at `2026-09-25T15:41:04.302662Z`; final calculation `a66ea5ea-0829-4d5d-aeab-37b5a4eabcc9`, source digest `2532606a070b87bec1cc3a1bf1396b5eab76a8abeee83116706a707f8dee995e`.

Chrome verification on localhost confirmed all nine figures, source coverage complete, 13/13 dated reconciliations, source locks, the review lock and zero control difference. It also exposed an existing `Finance endpoint not found` alert on later supplier-payment followups: local frontend and deployed finance-subledger routes differ. No frontend deployment was performed.

Checks: targeted PostgreSQL lifecycle test passed; complete data-access regression passed (132 lifecycle tests plus 9 source contracts). Supabase advisor preflight has existing unrelated warnings; the changed functions retain their fixed search path and service-only execute grants. No access grants or RLS policies were broadened.

Submission is NOT complete. Filing status has no HMRC obligation observation, no declaration, no attempt and no receipt. The browser submission route remains unavailable pending verified ingress/header handling. The user was asked for authority to send the prepared missing-header question to HMRC support; no answer or sending has occurred. Do not claim a sandbox submission, HMRC acceptance or production sign-off from the successful internal review lock.
