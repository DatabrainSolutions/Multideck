# Milestone development preflight

Fresh checks on 7 September 2026, before any milestone release. Started from
clean `04c9fa2`, four commits ahead and zero behind `origin/dev` after fetch.
The previous turn was verified progress; the full eight-clash/all-mode goal
and all recorded exclusions/approval requirements remain unchanged.

## Current development state

- Supabase `aqtwypsuijxlnvtxpuxe` is ACTIVE_HEALTHY. Zero existing milestones,
  no new milestone columns/helpers and zero conflicting milestone domain,
  action or watch registry rows. Both pending milestone migrations are absent.
- `dev.multideck.app` still points to READY deployment
  `dpl_wXG81n8svqfnbVYAgDB7goEMq37r`, exact commit `314ffc2`. The prior feature
  preview's fresh error log still reports `MULTIDECK_SURFACE is required on
  Vercel`. No team, project, environment, guard or domain change was made.
- Downloaded both deployed function bundles into an isolated temporary
  directory. All 22 files match `314ffc2` byte-for-byte. Five existing files
  differ from the milestone candidate, plus its new review helper; no
  unexpected remote source drift. Booking remains version 40, Dexter 160.
- Development has a newer `20260907080245_customer_account_finance_register`
  migration not in this checkout. Its recorded statements define one separate,
  read-only service-role finance projection and its ACL/comment; no milestone,
  Booking or Dexter references. It is retained, not rolled back or overwritten.
- Read-only preflight captures fingerprints of 77 Job headers, 45 routes and
  38 Quote versions in the adjacent JSON. These are comparison baselines, not
  a claim that teammates cannot subsequently edit records. Accepted Original
  `44e4b47b-b9b3-42dd-ad76-30df16a4db66` still matches MD5
  `5568ecb6e055ac0bd7dead5561a79436`, unchanged from the hosted Job-ref evidence.

## Fresh schema and populated rehearsal

Exported current application schemas only using the existing isolated CLI
connection preparation and native PostgreSQL 17 dump. No business/Auth/Storage
rows or credentials were copied or logged. Schema SHA-256:
`7086dee27a1ae010c9ca6d15fbabb97dd113292a4acea60b768a0637676a26f0`.
Retained privately at
`/tmp/multideck-milestone-release.NfAkZ6/development-schema.sql`.

The exact two-migration plan is `2026-09-07-milestone-development-plan.json`.
Do not apply the older five-entry retained-schema plan to development: its
three prerequisites are already installed.

The first populated run applied both migrations locally but then failed the
old `freight-chain-after.sql` Job-header comparison. That fixture was designed
for the original 29 migrations: it removes newly introduced shipment-value
columns only from the after-row, but those columns now exist in the before-row
too. Its registry checks also expect the older cargo migrations to reactivate
legacy entries. Neither assumption describes the milestone-only release.

Added a separate exact-pair fixture, without changing the older fixture or
weakening production guards. It compares **all** pre-existing Quote/Booking
fields without exclusions. Four synthetic legacy milestones exercise operator,
provider, unknown and null sources, independent microsecond timestamps, original
notes and raw payload. Only the four genuinely new milestone columns are
excluded from the old-row comparison; they are separately checked for no
invented mode/actor and a present update timestamp. All legacy events remain
read-only. Old registries, signals and the newer finance function/ACL stay exact.

The final populated rehearsal passes, along with private/service grants, RLS,
mandatory approval registry and deterministic watch-trigger assertions:

```sh
node supabase/tests/tools/freight-schema-rehearsal.mjs /tmp/multideck-milestone-release.NfAkZ6/development-schema.sql --release-plan=/Users/leewright/repo/Multideck/docs/release/2026-09-07-milestone-development-plan.json --populated
```

Managed Auth/Storage are explicit empty fixtures. This proves schema and
representative legacy-data compatibility, not hosted authentication or writes.
Temporary rehearsal clusters were cleaned up by the test runner.

## Other verification and security

- All 45 focused milestone/route/approval/PostgreSQL tests pass again, no
  failures/skips. Both complete Edge entrypoints pass Deno checking.
- Chrome's real local component completes a 13-stop Tab loop inside the dialog
  and returns to the starting control. Escape closes the clean editor and,
  after the shared closing transition, restores focus to Record milestone.
  Earlier mobile/error/partial-date/save checks remain in the operator evidence.
  Browser-level 200% zoom and actual screen-reader speech remain unverified.
- Fresh security advisors report 1,555 findings (1,314 INFO, 241 WARN). Counts
  alone do not prove identity parity or safety. Before-release finding keys,
  names, severity and remediation links are retained at
  `/tmp/multideck-milestone-release.NfAkZ6/security-before.json` for an actual
  post-release comparison. No bulk permission or Auth repair was attempted.
  See the [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter)
  when reviewing these existing findings individually.
- Supabase/Postgres guidance informed the separate-project target, explicit
  function grants, fresh schema and populated preservation checks. Current
  function-grant guidance was checked in the
  [official documentation](https://supabase.com/docs/guides/database/functions).

## Next controlled step / not complete

No migration, Edge Function or client was deployed in this checkpoint. Prepare
an isolated CLI ledger from the actual remote history, dry-run exactly the two
pending migrations, refresh fingerprints/advisor identities, and release the
matching schema/functions/client together through the existing development
Git/Vercel setup. Re-download source, verify READY/exact commit/alias, then prove
synthetic hosted milestone create/correct/reload and approved Dexter/watch
lifecycle with denial checks. Preserve retained history when retiring test data.

JQ20022 V2 send/accept/selective apply and feature-preview environment repair
still require their recorded approvals. No emails or acceptance occurred.
Customs/iCustoms remains untouched; tracking, PDF-logo and calculator work stay
deferred. Milestone completion and the broader 95% target are not claimed.
