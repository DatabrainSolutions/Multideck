# Freight Supabase reconciliation — 6 September 2026

Target: `aqtwypsuijxlnvtxpuxe` (MultiDeck development, eu-west-2). Confirmed against the connected project list and repository deployment record. Local freight checkpoint: `09ccd6d`. Machine-readable evidence: [parity snapshot](2026-09-06-freight-supabase-parity.json).

## Outcome

The newer freight work is **not live**. Before this check the target had 406 migration records, ending at `20260904183000`. All 29 freight migrations dated 5–6 September were absent by both exact version and exact name. Direct catalogue queries also confirmed that `quote_api.version_cargo_lines` and `booking_api.cargo_equipment_allocations` do not exist. These are release gates, not evidence that a blanket migration push is safe.

Retrieved deployed Edge Function source confirms selected divergence: the deployed Quote PDF and Quote workflow do not import `quote-document-cargo.ts`, and deployed Dexter does not import `booking-allocation-review.ts`; the local implementation does. Function versions alone are not proof of source parity. Deployed versions were quotes-workflow 73, quote-response 39, bookings-workflow 39 and agent-dexter 156. Full bundle/import-graph comparison remains required before deployment.

## Narrow security correction applied

The live advisor flagged `public.quote_workflow_finalize_customer_response_v4(uuid,text)` as executable by both `anon` and `authenticated`. Catalogue inspection confirmed both grants. The follow-up migration renames the prior restricted implementation and creates a new SECURITY DEFINER wrapper. That new function regained default PUBLIC EXECUTE; granting service_role alone did not remove it. The wrapper finalises delivery and schedules follow-up, so this is a trusted-service operation, not a customer acceptance endpoint. No misuse or actual data compromise is claimed.

Applied **only** `20260906072644_quote_finalization_service_boundary.sql` to this development project. It revokes PUBLIC/anon/authenticated execution and preserves service_role execution. The local filename was aligned to the timestamp recorded by the migration tool; no existing migration history was rewritten. Other pending freight migrations remain unapplied.

Verified after application:

- `anon`: cannot execute; `authenticated`: cannot execute; `service_role`: can execute.
- Direct calls under the live `anon` and `authenticated` SQL roles were rejected in a read-only transaction using a null target, then rolled back. This exercises the database execution boundary without a real Quote mutation; it is not a browser/customer-token test.
- The renamed underlying implementation remains inaccessible to all three roles, so it cannot bypass the wrapper.
- The wrapper definition hash remains `e4fff6b43500f08d3813651d2e24442e`; the underlying definition hash remains `9ce5777dd4a66f571122f490e04da392`. Business logic did not change.
- The advisor no longer reports either finalisation warning. No real quote was submitted or modified to test denial.
- A disposable PostgreSQL regression uses the exact production wrapper, actual role enforcement and the exact migration. It reproduces the original PUBLIC grant, rejects both untrusted roles before downstream side effects, retains the service path and verifies an idempotent ACL repair. Downstream finalisation/scheduling are declared test spies; this is not proof of actual email delivery.
- The focused finalisation/follow-up/submission/customer-response/PDF/accepted-document run passed all 28 tests with zero failures or skips. Most surrounding workflow tests are source contracts; their count is not a full hosted lifecycle certification.

This strengthens an existing server-only permission boundary rather than adding a new capability. Existing Dexter approved actions and deterministic quote events remain unchanged. No customer/Booking/Quote record, Auth setup, other tenant, provider setting, Vercel environment, alias or team configuration was changed.

## Remaining security review

After the correction the advisor reports 1,312 informational RLS-without-policy notices, 64 mutable-search-path warnings, 19 anonymous SECURITY DEFINER execution warnings, 154 authenticated SECURITY DEFINER execution warnings and one leaked-password-protection warning. They have **not** all been triaged. RLS with no policy can be intentional deny-by-default; authenticated functions may contain proper internal authorisation; trigger functions require different analysis. Neither bulk grants nor bulk revocations are justified by those counts.

References: [function execution warnings](https://supabase.com/docs/guides/database/database-linter), [RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [mutable search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).

## Next release gates

1. Reconcile earlier migration name/timestamp differences and actual prerequisite definitions before applying the 29 pending freight migrations. Do not reset the database or mark missing migrations applied merely to satisfy a CLI check.
2. Verify the complete ordered migration chain against a representative schema; focused fixtures do not establish full-schema compatibility.
3. Review the remaining relevant advisor findings and preserve real authorisation boundaries.
4. Deploy the reviewed schema and matching Edge Function import graphs to development, then prove the signed-in Quote draft/send/respond/PDF/private Storage/Booking/revision/notification and Dexter/watch flows with controlled test recipients.
5. Release the frontend through the existing dev configuration and approved hostname. Keep team setup unchanged. Deeper all-mode operational work and tracking deferral remain as recorded in the completion ledger.
