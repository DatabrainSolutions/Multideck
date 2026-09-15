# Multideck tenant baseline

This directory is the clean provisioning snapshot captured from the shared Dev/Test Supabase project on 15 September 2026. It contains the current Multideck database structure and approved product reference catalogues, but no Auth users, companies, operational records, uploaded objects or credentials.

Install a fresh isolated tenant in this order:

1. `required-extensions.sql`
2. `public-schema.sql`
3. `function-access.sql`
4. `system-reference-data.sql`
5. `storage.sql`
6. the Cloud-owned installation and customer-identity contract
7. only migrations created after this baseline's approved source commit
8. the Edge Functions and Auth settings sealed in the same release manifest

Do not replay the historical `supabase/migrations` directory over this snapshot. The snapshot already represents their final effect, including the calendar, reports, warehouse, customs, finance, document, Dexter and email-signature structures that were previously listed as post-baseline work.

`system-reference-data.sql` deliberately excludes the large `sys_RefUNLOCO`, `sys_Airlines`, screening-list entries/snapshots/sources and all tenant/provider settings. UN/LOCODE and airline lookup files are shipped as application assets; screening sources are configured and refreshed separately. iCustoms catalogue values are present, but no iCustoms credentials or connection are included.

`storage.sql` creates the approved buckets and object policies only. It contains no objects. The `tenant-brand-assets` bucket is the sole public bucket because those allowlisted brand assets are intentionally externally served; operational, document, warehouse, rate, customs and profile buckets remain private.

`function-access.sql` is required because Supabase's hosted default privileges grant function execution to API roles. It restores the effective Dev/Test execution rights for every captured function after the schema has been created; omitting it would make privileged internal functions callable when Dev/Test denies them.

The baseline was restored successfully into a disposable local Supabase with zero Auth users, zero Storage objects and zero populated non-system application tables. A release is not customer-ready until Cloud pins it to an exact approved App commit, packages every required Edge Function, configures tenant-specific Auth/secrets/hostnames and passes the data-access and end-to-end tenant checks.
