# Freight release: preserve active screening source

## Compatibility finding

Read-only development inspection found two screening sources: inactive `uk_ofsi_consolidated` and active `uk_sanctions_list`. Deployed screening code additionally contains UKSL designation/name deduplication and bounded parallel imports. The local `20260903120000_screening_automatic_freshness.sql` is absent from live history and assumes the legacy source. Applying it unchanged would move status and checks back to the inactive source. The original four-function release plan was therefore not safe to apply.

The reviewed plan now uses `20260906082224_screening_active_source_freshness.sql` instead. This migration retains freshness leases, fail-closed checks and service-only execution, but selects the existing active approved UKSL source without modifying source metadata, activation or historical snapshot provenance. It also supports an existing active legacy-named source already configured with the approved UKSL URL. It does not reactivate a retired feed or invent a successful verification time. The old migration file remains intact but is explicitly excluded from this development release.

The shared importer preserves the live worker's 1,000-row batches with at most 12 pending inserts and UKSL Unique ID/name deduplication. Failed concurrent writes are drained before reporting failure or releasing the lease. Existing legacy parsing remains available. Screening and its worker join Quote, Quote response, Booking and Dexter in the release plan because all consumers must share the new freshness contract. Their existing JWT settings remain unchanged.

## Evidence before deployment

- Fresh schema-only development export differs from the earlier export only in pg_dump's random restrict/unrestrict marker; application DDL is unchanged.
- All 30 reviewed migrations pass against that current schema with real application constraints/triggers and synthetic existing Quote, Booking and screening data. Both active and inactive source records, current and importing snapshots, entries, timestamps and Quote/Booking history remain intact. [Exact rehearsal evidence](2026-09-06-freight-active-source-rehearsal.json).
- 80 focused tests pass, none skipped, including real PostgreSQL lifecycle/lease checks for the original migration, active legacy-named UKSL and active canonical UKSL; failure preservation; 20,001-row bounded concurrent ingestion; source selection; and Quote/Dexter protections.
- Screening, screening worker and Dexter type-check under the Deno runtime. Quote, Quote response and Booking entrypoints also passed the preceding release type-check.
- Supabase CLI 2.111.0 `migration fetch --linked` downloaded the actual 407 live migration records into a fresh temporary project. Only the 30 reviewed migrations were added. `db push --linked --include-all --dry-run` reports exactly those 30, with zero seeds and zero roles. Every staged migration and all six local function graphs match the release plan hashes.
- No migration history was repaired, renamed or fabricated. Repository migration files, tenant configuration and Vercel/team settings were not overwritten. Raw fetched history and schema exports remain outside the repository.

This is pre-release evidence, not hosted lifecycle certification. A controlled development migration/function release, post-release permission/data checks, client deployment and browser-to-email/PDF/Booking/Dexter tests remain required. Operational depth across all modes remains part of the original goal.

CLI behaviour reviewed at the pinned release: [pending-list handling](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/migration/up/up.go), [history fetch](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/migration/fetch/fetch.go), [dry-run and push](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/db/push/push.go).
