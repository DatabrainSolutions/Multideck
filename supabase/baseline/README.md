# Multideck tenant baseline

This directory is the clean provisioning snapshot captured from the shared Dev/Test Supabase project on 15 September 2026. It contains the current Multideck database structure and approved product reference catalogues, but no Auth users, companies, operational records, uploaded objects or credentials.

Install a fresh isolated, empty tenant in this order. The committed schema dump
has a finance patch tail that depends on the later journal table, so it cannot
be uploaded as one SQL file or applied in the original five-file order:

1. `required-extensions.sql`
2. `public-schema.sql` through the marker `-- A committed ledger posting must be a complete, balanced double-entry journal.`
3. `migrations/20260918123733_general_ledger_journals.sql`
4. the remaining finance patch tail of `public-schema.sql`
5. `function-access.sql`
6. `system-reference-data.sql`
7. `storage.sql`
8. `migrations/20260923002429_harden_provisioned_finance_reporting_views.sql`
9. the Cloud-owned installation and customer-identity contract
10. post-snapshot migrations approved in the release manifest, then the matching Edge Functions and Auth settings

`node supabase/tests/provision-baseline-project.mjs <exact-project-ref> --apply`
automates steps 1–8 for an explicitly named **empty, disposable** Supabase
project. Omit `--apply` to inspect the plan. The script verifies that the
target has no public application tables or Auth users and divides the dump into
SQL-endpoint-sized, ordered batches. Do not run it on an existing tenant.
Afterwards, run
`node supabase/tests/check-finance-provisioning.mjs <exact-project-ref>`;
its thirteen checks inspect the installed schema, catalogues and access
privileges. They are not a substitute for actor-level workflow tests.

Do not replay the entire historical `supabase/migrations` directory over this
snapshot. It represents many older migrations, but the journal dependency above
and other post-snapshot changes require an explicit, ordered release manifest.
The finance smoke check does not certify that every later migration is present.

`system-reference-data.sql` deliberately excludes the large `sys_RefUNLOCO`, `sys_Airlines`, screening-list entries/snapshots/sources and all tenant/provider settings. UN/LOCODE and airline lookup files are shipped as application assets; screening sources are configured and refreshed separately. iCustoms catalogue values are present, but no iCustoms credentials or connection are included.

The reference data includes seven Multideck-owned `MD-` starter charge codes.
It does not include CargoWise customer codes, tax defaults, prices, provider
items or legal-entity nominal mappings. Configure the latter against each
entity's approved chart before booking or posting these codes.

`storage.sql` creates the approved buckets and object policies only. It contains no objects. The `tenant-brand-assets` bucket is the sole public bucket because those allowlisted brand assets are intentionally externally served; operational, document, warehouse, rate, customs and profile buckets remain private.

`function-access.sql` is required because Supabase's hosted default privileges grant function execution to API roles. It restores the effective Dev/Test execution rights for every captured function after the schema has been created; omitting it would make privileged internal functions callable when Dev/Test denies them.

The schema dump also carries broad `GRANT` statements for finance reporting
views. The reporting-access migration in step 8 reasserts the intended
service-role-only access and `security_invoker` setting for all eighteen views.
Omitting it exposes reports to browser database roles, even though the view
definitions themselves are present.

The staged baseline and reporting fix were exercised on a new hosted,
disposable Supabase project on 23 September 2026: thirteen installed-database
finance checks passed; it had zero Auth users, zero legal entities and zero
postings. This was a provisioning smoke test, not a Cloud-installed or
end-to-end customer tenant. A release is not customer-ready until Cloud pins it
to an exact approved App commit, applies the full later-migration manifest,
packages every required Edge Function, configures tenant-specific
Auth/secrets/hostnames and passes the data-access and end-to-end tenant checks.
