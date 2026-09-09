# Freight migration chain rehearsal — 6 September 2026

## Verified outcome

All **29 pending freight migrations** applied in chronological order to a disposable PostgreSQL 17 database restored from the current development application's schema-only export. Post-chain assertions verified both new typed cargo tables, their RLS, and service-only execution for Quote send finalisation, reviewed Quote revision application and Dexter allocation replacement.

Exact migration hashes, the schema hash and applied filenames are recorded in [rehearsal evidence](2026-09-06-freight-chain-rehearsal.json). This is a **structural rehearsal**, not a hosted lifecycle or live-data migration certification. None of these 29 migrations was applied to the development project during this check.

## Source and boundaries

- Target development project: `aqtwypsuijxlnvtxpuxe`. Exported schemas: `public`, `private`, `quote_api`, `booking_api`, `document_api`. Schema definitions and ACLs only; no business records, Auth users, secrets or Storage objects were copied. The export is 7,574,743 bytes, retained in the private temporary directory noted in the JSON for further local checks; it is not committed to the repository.
- Supabase CLI authenticated and linked inside a separate temporary working directory, leaving the repository's connection configuration unchanged. Its standard dump operation required unavailable Docker. Native PostgreSQL `pg_dump` used the CLI's ephemeral connection preparation and its explicitly generated `--role postgres` argument. Credentials were kept out of command arguments, logs and committed evidence. No remote grants were changed to make the dump work.
- The first native attempts omitted that generated role and failed on table permissions; matching the actual prepared dump command resolved this without altering access settings. Only application schemas were exported, not managed Realtime/Auth/Storage/Vault schemas.
- Local restore fixtures were empty `auth.users` and `storage.objects` tables, `auth.uid()` returning null, `auth.role()` using the SQL role, and non-login role names required by the dump. Real native `pgcrypto`, `pg_trgm` and `btree_gist` extensions were used. The initially missing GiST operator class was resolved by loading `btree_gist`, not by deleting an index.
- Supabase-managed infrastructure, schedulers, secrets, provider delivery, real users, RLS claims and configuration rows are **not** simulated as production. The empty schema does not reproduce updates/backfills against existing records or all registry upsert conflicts. Database functions and all migration SQL come from the actual export/repository, not hand-written function substitutes.
- Before rehearsal, the read-only [prerequisite query](../../supabase/tests/freight-release-prerequisites.sql) found exactly one occurrence of each of eight expected markers in the relevant live pre-existing function bodies. Functions absent because earlier pending migrations create them were not mistaken for missing external prerequisites. Marker matching does not prove full implementation equivalence.
- An attempt to restore the older repository baseline stopped at unavailable `pg_cron`. That baseline also does not contain the current private Quote/Booking schemas. It was not stripped, modified or presented as a successful full-schema test. The fresh application dump avoids that outdated provisioning baseline and does not install or run a scheduler.

## Reproduce locally

With a current, reviewed, schema-only application dump and PostgreSQL 17 binaries installed:

```sh
node supabase/tests/tools/freight-schema-rehearsal.mjs /absolute/path/to/schema-only-dump.sql
```

`PG_TEST_BIN` may point to the installed PostgreSQL binary directory. The tool creates its own temporary cluster with no TCP listener, stops on the first failure, reports the exact stage, and stops/removes that cluster in cleanup. It does not use a live database connection. Migration order and duplicates are checked before starting. The local temporary cluster was removed after both completed rehearsals.

## Still required before release

1. Refresh live prerequisites and schema evidence immediately before deployment if other team changes have occurred.
2. Review data-dependent statements against bounded aggregate checks on development records; exercise representative populated records and registry conflicts. Empty-schema success cannot substitute for these checks.
3. Reconcile migration identity/history differences and use the reviewed explicit ordered list, not a blind push of every historical file.
4. Deploy matching schema/functions, run advisors, and prove signed-in Quote → send → customer response → private PDF/document → Booking → accepted revision → notification and Dexter/watch flows with controlled recipients.
5. Release through the existing Vercel dev configuration without changing team setup. Remaining all-mode operational depth and deferred tracking retain their original scope.
