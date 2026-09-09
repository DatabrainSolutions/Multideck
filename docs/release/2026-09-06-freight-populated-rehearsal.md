# Freight populated migration rehearsal — 6 September 2026

## Verified outcome

All 29 pending freight migrations passed against the current development application schema with synthetic existing Quote and Booking records. Real application triggers, foreign keys and constraints remained enabled. [Machine-readable evidence](2026-09-06-freight-populated-rehearsal.json) contains migration/schema/fixture hashes and the exact check list.

- Four pre-existing Quote versions cover submitted and draft, legacy summaries and structured multi-line cargo. Every saved version row and Quote header remained identical after migration, including original whitespace, country-code case and snapshot JSON. Only the new typed projection normalises values.
- Legacy snapshots received no invented cargo lines. Structured versions received their two projected lines, preserving precise numeric values, zero versus unknown and hazardous status.
- Existing Booking, cargo, equipment, routing and unquantified packing membership values remained unchanged. Checks include source Quote/version references and snapshot, precise VGM and reefer values, planned and actual timestamps, legacy JSON, record IDs and timestamps. New shipment-value and Quote-line source fields remained null; quantified allocations remained empty.
- Existing cargo domain/action/watch rows exercised actual conflict-update branches. Required action approval and Bookings permissions were applied. An unrelated disabled registry row remained unchanged. Existing watch signals remained unchanged, so this fixture's upgrade did not manufacture operational changes.
- After the full chain, actual submitted-version edit and delete attempts were rejected by the immutable-history guard. An explicit JSON-null cargo list on a draft was rejected. Each failure rolled back and the subsequent before/after comparison passed.

The first Booking fixture run exposed a missing **test configuration row** for the pre-existing `bookings` watch capability. Added that synthetic row; did not disable the real signal trigger or remove its foreign key. The final complete run passed and its owned temporary PostgreSQL cluster was cleaned up.

## Read-only live checks

Confirmed development project: `aqtwypsuijxlnvtxpuxe`. Aggregate checks found 37 Quote versions, 13 submitted, **zero structured cargo snapshots**, and zero explicit-null cargo lists. Thus the structured-cargo backfill currently has no live rows to process. This is a point-in-time observation, not a permanent assumption; re-run [the preflight](../../supabase/tests/freight-release-data-preflight.sql) immediately before release. If structured records appear, validate their contents before applying the backfill rather than suppressing errors or rewriting submitted evidence.

No existing live rows use the six new domain/watch codes or seven action codes inserted by this chain. This includes the actual `booking_routes` / `update_booking_route` identifiers. No business records or configuration payloads were copied locally, no emails were sent, and no live schema or history was changed.

## Migration-history caution

Refreshed live inventory still has 407 migration records, including the previously applied finalisation permission repair. All 29 freight migrations remain unapplied. Comparing 470 tracked local file entries finds 182 exact name/version matches, 189 same-name/different-timestamp entries, six timestamp/name collisions, and 93 entries absent by both exact identity fields. There are 32 live-only entries under that comparison. These counts include tracked duplicate ` 2.sql` variants and are **not** counts of missing capabilities.

Two collisions assign the same timestamp to unrelated screening versus road/warehouse migrations. Other collisions involve duplicate finance filenames. Earlier Quote migrations often exist under different live timestamps. Names alone do not prove SQL equivalence or absence. No files were deleted, timestamps renamed, ledger rows repaired or old migrations re-run. The release must use the explicitly reviewed freight list against current schema evidence; a blanket historical push remains inappropriate.

`origin/dev` was refreshed successfully; the current branch contains that fetched commit. This does not mean newer local freight work has been pushed or released.

## Reproduce and limits

```sh
node supabase/tests/tools/freight-schema-rehearsal.mjs /absolute/schema-only-dump.sql --populated
```

The existing no-flag structural mode remains available. Both modes own a fresh local PostgreSQL cluster with no TCP listener and clean it up. Auth/Storage remain the explicit empty managed-service fixtures from the structural rehearsal. Sample records are synthetic direct SQL seeds, not a signed-in user lifecycle; the fixture has no active watchers or real provider delivery. It proves these representative migration-time cases, not all customers, all mode operations, complete RLS authorization, notification dispatch or hosted end-to-end behavior.

Next release work still includes resolving relevant history/prerequisite differences, matching Edge Function source, remaining relevant security findings, controlled deployment and full hosted Quote → send/PDF → response → Booking → accepted revision → notification/Dexter/watch verification. Deeper all-mode operational work remains in scope. Tracking stays deferred. No Vercel or team settings were changed.
