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

## Development backend deployment completed

The 30 reviewed migrations were applied with their original filename identities. Live history now has 437 entries (407 + 30); the legacy-only screening prerequisite remains absent. No historical ledger rows were changed. CLI reported a post-apply local catalogue-cache warning because Docker is unavailable; all migration identities and live structures were subsequently verified independently, so this was not a failed database apply.

All six functions are ACTIVE and their original JWT settings are preserved: Quote 74, public response 40, Booking 40, Dexter 157, screening 45 and screening worker 47. Each deployed bundle was downloaded into its own isolated directory and all 47 planned source-file instances exactly matched reviewed SHA256 values. Other deployed functions remained unchanged.

Before/after whole-row fingerprints match for all 37 Quote versions, 27 Quote headers, 76 Bookings, 21 cargo rows, 10 equipment rows, 44 routing rows, 2 screening sources, 3 screening snapshots and 38,069 screening entries. Newly introduced nullable columns were excluded from the comparison; separate checks confirm zero invented shipment values, cargo projections or allocations. The active source remains `uk_sanctions_list`. No customer email or operational Booking update was initiated.

Unauthenticated HTTP requests are denied by Quote/Booking/Dexter/screening (401); the worker denies a missing shared secret (401). Public response rejects an unrelated origin (403) and an invalid token from the approved development origin (404). Authenticated SQL-role checks with no bound user deny both watch helpers, both private schemas, trusted Quote finalization, revision application and screening refresh. These are negative boundary checks, not a successful signed-in end-to-end flow or cross-tenant certification.

Security advisors add two expected no-policy INFO findings for the typed service-only tables and two authenticated SECURITY DEFINER warnings for boolean RLS watch helpers. Reviewed the latter: each binds `auth.uid()` to an active user in the exact company and checks the relevant Quote/Booking permission. No new anonymously executable SECURITY DEFINER function was reported. Existing broader security findings remain outstanding; they were not blanket-dismissed or changed during this release.

[Machine-readable deployment evidence](2026-09-06-freight-development-backend-release.json). **Client deployment and real hosted lifecycle verification are still pending.** In particular, accepted-Quote revision application requires the updated client to carry the server's review token; do not weaken that guard to accommodate a stale client. The next release step is the matching client build/deployment without changing team configuration, followed by signed-in flow checks and the remaining all-mode operational work.

CLI behaviour reviewed at the pinned release: [pending-list handling](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/migration/up/up.go), [history fetch](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/migration/fetch/fetch.go), [dry-run and push](https://github.com/supabase/cli/blob/v2.111.0/apps/cli-go/internal/db/push/push.go).
