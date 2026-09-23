# Booking planning charges — backend release approval

Status: approved by Lee and backend deployed 19 September 2026. Connected editor read verified; charge save/lifecycle testing is blocked on the test Booking's missing legal entity (see execution record below).

## Execution record — 19 September 2026

- Explicit approval: “yes i approve”. No GitHub push, merge or Vercel deployment performed.
- Preflight: package SHA-256 checks passed; deployed function versions remained 51/281; source comparisons and all four captured SQL definitions matched. Prerequisites were present; six new migrations and three planning tables were absent.
- All six migrations applied successfully through Supabase. The service assigned the following remote versions, different from the prepared local filenames. **Do not bulk-push/reapply these local migrations; reconcile these recorded identities before a future migration push.** No migration-history repair was performed.

| Migration suffix | Prepared local version | Applied remote version |
| --- | --- | --- |
| booking_planning_charge_foundation | 20260919095813 | 20260919160346 |
| booking_manual_planning_cancellation | 20260919102445 | 20260919160356 |
| booking_planning_charge_release | 20260919102957 | 20260919160357 |
| booking_planning_charge_access | 20260919110708 | 20260919160358 |
| booking_planning_charge_parties | 20260919113132 | 20260919160359 |
| booking_planning_charge_readback | 20260919151833 | 20260919160404 |

- `bookings-workflow` v52 and `agent-dexter` v282 are ACTIVE with JWT verification retained. Freshly fetched deployed files match all candidate files exactly (3 and 56 respectively).
- All three planning tables have RLS and deny direct anon/authenticated SELECT. Both public planning RPCs deny anon/authenticated EXECUTE and allow service_role. A null-actor read returned 42501; unauthenticated Edge access returned HTTP 401.
- Security advisors: the three private planning tables report informational RLS-without-policy notices, intentionally fail-closed with checked service wrappers. Other project-wide warnings were not altered; this was not a full project security audit. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Chrome localhost JD0991142 → Finance loads the new planning workspace and returns the real backend blocked reason. Database inspection confirms `Job_LegalEntityID IS NULL` (status `draft`, displayed Provisional). No legal entity/base currency was guessed or assigned, and no test charge or lifecycle mutation was made.
- Next: agree a correctly configured internal Provisional Booking or the intended legal entity for JD0991142. Then test save/reload, Keep/Discard/Audit and confirmation transfer. Connected write persistence, cross-company denial with real identities, report exclusion, and generated Dexter behaviour remain unverified. Prior disposable/fixture evidence is not substituted for these checks.
- Original staged manifest remains an immutable pre-approval snapshot; this execution record supersedes its historical NOT APPROVED text.

## Target and package

- Shared development Supabase project: `aqtwypsuijxlnvtxpuxe`, verified against localhost configuration.
- Checkout: `codex/freight-workspace-foundation`, HEAD `b4e73e8` plus recorded local changes.
- Staged package: `/tmp/multideck-planning-release.n0D6NY` (temporary local directory; rebuild if unavailable).
- `manifest.json` lists ordered migrations, entrypoints and original versions.
- `sha256.json` fingerprints 126 staged files. Before/after function bundles include all deployed dependencies.
- Verified 118 function files byte-for-byte against the captured originals/intended candidates.

## Requested approval

Enable manual Provisional planning charges on this shared development backend for
localhost testing. This affects the backend used by other development clients;
it is not a private/local database change. No GitHub push, dev-branch merge,
Vercel/frontend deployment, customer email, invoice posting or unrelated release.

Apply only these six new migrations in order:

1. `20260919095813_booking_planning_charge_foundation.sql` — private planning rows and immutable history.
2. `20260919102445_booking_manual_planning_cancellation.sql` — Keep/Discard and reopen integration, preserving prior source-Quote discard decisions.
3. `20260919102957_booking_planning_charge_release.sql` — transfer retained planning charges once when confirming In progress.
4. `20260919110708_booking_planning_charge_access.sql` — permission-checked read/save endpoints and permitted currency checks.
5. `20260919113132_booking_planning_charge_parties.sql` — scoped parties, validation and editor capability.
6. `20260919151833_booking_planning_charge_readback.sql` — original/base currency evidence in Booking Finance.

These are not exclusively new tables: they extend existing cancellation and charge
readback functions and backfill a discard-preservation flag from existing decisions.
They do not recreate historical discarded charges, rewrite accepted Quotes, or post
invoices. Confirmation to In progress creates operational costing records by design.

Then deploy only the checked function candidates:

- `bookings-workflow`: v51 is the captured original. Only index.ts and core.ts
  change, adding planning read/save dispatch and request validation. The existing
  upload cancellation check and shared authentication dependency stay intact.
- `agent-dexter`: v281 is the captured original. Only two instruction additions
  in index.ts; all 55 other files are preserved exactly, including the newer
  inbox signatures dependency. Do not deploy the checkout's complete Dexter tree.
- Preserve both functions' existing JWT setting (`true`) and entrypoint paths.
- No `finance-accruals` deployment is required for this package.

## Preflight and evidence

Read-only live checks confirm the freight-domain and cancellation prerequisites
(`20260915174500`, `20260919080625`) are already applied. Do NOT reapply their
locally modified files. All six new migrations and all three planning tables are
absent. Existing Finance upsert and CRM account-access signatures match the callers.

23 targeted tests pass. The disposable PostgreSQL lifecycle rehearsal also passes
with freshly retrieved live cancellation action/state and Quote-release definitions,
plus the current charge SELECT. It does not clone the entire production schema or
prove real authentication, concurrency between sessions, or connected reporting.
Earlier local browser/editor, TypeScript and keyboard/layout evidence is in the
planning ledger. Four unrelated Dexter contract failures predate these changes;
the new unsupported-boundary contract passes. Live generated Dexter responses are
still a connected-test requirement, not a claimed success.

## Execution safeguards after approval

1. Recheck project, deployed versions/source checksums and targeted function
   definitions immediately before release. Stop on drift and reconcile first.
2. Ask operators to avoid editing the test Booking during the short migration and
   function update window. Treat all six migrations as one controlled release;
   do not invite testing against a partially applied sequence.
3. Apply only the listed migrations, recording each result. Do not use a bulk
   push of every outstanding repository migration.
4. Deploy the staged candidates with their preserved dependencies/settings.
5. Verify deployment versions, schema capability, access denial, and localhost
   readback before handing over. Do not label it verified merely because deployment
   succeeded.
6. On failure: stop testing, retain charge/audit data and captured before-bundles;
   do not drop planning tables or blindly undo migrations. Inspect the exact failed
   stage and agree the narrow repair/restoration before resuming.

## Operator test checklist after enablement

Use an agreed internal Provisional Booking, not a customer-facing Quote conversion.

- Add a cost/sell line, save, refresh and confirm values/currencies remain.
- Edit without saving; try another tab, navigation and browser Back. Entries remain
  and leaving is blocked until saved or explicitly reloaded/discarded.
- Cancel with Keep; reopen to Provisional; retained charges remain excluded from
  operational financial figures.
- Cancel with Discard; reopen; working charges stay empty and Audit retains them.
- Add fresh charges after a discard; cancel/reopen independently of the old decision.
- Confirm In progress on a designated test record; each retained charge transfers
  once with the correct currencies/base amounts. Reload must not duplicate it.
- Ask Dexter about manual planning-charge reads/edits/watches: it must explain the
  unsupported capability rather than infer information or create a substitute watch.

Adding later In progress charges is a separate microstep. Cancellation of In progress
Bookings awaits the boss's decision. Customs/iCustoms, tracking and PDF-logo work
remain outside this release. Stop for Lee's feedback after the connected test.

## Connected save-charge microstep — 19 September 2026

User authorised using their newly tested Booking and existing internal test parties.
The actual record is **JI0991146** (Import), not JD0991146; verified in Chrome and
the database. Job ID: `dd740f94-22cf-4761-882d-bb902f6d3569`.

- Through localhost UI, populated customer/payer Recycling Buddy (CUS0001), shipper
  Demo Organisation 035 (QDEMO-SHP), consignee Demo Organisation 009 (QDEMO-CON),
  and customer PO `INTERNAL TEST - PLANNING CHARGES`. Preserved Harry Phillips as
  owner, Wakefield 41 branch, Air/Import and Provisional status.
- Blank-description save correctly displayed validation and retained the row.
- Saved one explicitly synthetic `TEST-FRT` line, description `Internal test -
  freight planning charge`, supplier Demo Organisation 045 (QDEMO-SUP), customer
  CUS0001, GBP cost 100 / sell 150, both ROE 1, quantity 1, fixed calculation.
- UI confirmed saved. Full browser reload retained the parties and Finance line,
  including GBP50 profit. Browser error log returned no entries.
- Read-only live database check confirmed planning set revision 1, matching row,
  and before/after history attributed to current Lee account's internal user
  `4467c131-7068-4a7e-8ebc-e51d2d4af01c`, not Booking owner Harry.
- Job_Costing_Lines count remained **0**. This verifies separation for this save;
  it is not yet an end-to-end monthly-report verification.

Existing implementation passed this microstep; no application code or backend
release was needed. Test data writes used the localhost app connected to shared
development services. No GitHub push or Vercel deployment. Left Finance open for
user acceptance. Keep/Discard/reopen and confirmation-to-In-progress tests remain
separate, not executed during this microstep.
