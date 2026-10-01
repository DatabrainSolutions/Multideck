# Quote-to-Booking database tie-off

> Later update: Lee approved full Git publication and conflict-free dev merge. See `2026-10-01-handover-publication.md` for final remote status. The no-push statements in this dated database tie-off describe its original boundary; the database fixes remain applied and must not be repeated.

## Outcome and authority

Lee approved fixing the two missing database issues before handover, then clarified that he wants self-contained continuation context, **not deployment of the whole project**. Both fixes are now applied and verified in shared-development Supabase `aqtwypsuijxlnvtxpuxe`. No GitHub push/remote dev merge, document-service deployment, template publication, production change, customer acceptance or mail delivery is included.

Existing Jobs, contacts, containers, template preferences and issued files were not backfilled or rewritten. An older Booking with a missing email remains an existing operator-reviewed record; this migration does not silently amend it.

## Applied records

| Fix | Existing local file | Hosted ledger version |
| --- | --- | --- |
| Cargo weight is not loaded-container gross weight | `20260925095733_stop_quote_cargo_weight_copy_to_container.sql` | `20261001203200_stop_quote_cargo_weight_copy_to_container` |
| Accepted Quote party contacts reach Booking | `20260929132713_quote_party_contact_handoff.sql` | `20261001203201_quote_party_contact_handoff` |

SQL was retrieved from `supabase_migrations.schema_migrations.statements` after application. Both records match their local files exactly. Applied migration contents were not edited.

- Weight fix changes one expression in `booking_api.quote_container_rows(jsonb,text,uuid)` to keep projected loaded weight unknown. Cargo weight, quantities/type, equipment count, volume, mode/service guards and the 100-container limit remain. VGM is not invented.
- Contact fix adds the private INSERT trigger `fill_accepted_quote_party_contact_before_insert` on `public."Job_Parties"`, backed by `booking_api.fill_accepted_quote_party_contact()`. Initial shipper/consignee source contact/email values carry through. Explicit contacts, later edit payloads containing `role`, other party roles and manual Bookings are excluded from automatic refilling.
- The existing private `public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)` gains only the two proposed party email fields. Existing company/office, permission, review and audit controls remain intact.
- No RLS relaxation, new caller-facing action or client credential was added. The trigger function is not directly executable by `anon`, `authenticated` or `service_role`; the existing authorised aggregate workflow invokes it internally.

## Verification performed

Commands run from the repository root:

```sh
PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node supabase/tests/run-data-access-regression.mjs
PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node --test supabase/tests/quote-container-weight-postgres.test.mjs supabase/tests/quote-party-contact-handoff-postgres.test.mjs supabase/tests/quote-booking-container-allocation-contract.test.mjs
```

- Mandatory suite passes **143/143 PostgreSQL/access tests plus 9/9 access contracts**, with the two narrow handoff fixtures now included (previous count: 141 + 9).
- Focused suite passes **9/9**. Actual disposable PostgreSQL executes the projection, migrations and contact trigger. Assertions cover single/multiple equipment, retained cargo/recorded weights, mode/service guards, quantity limit, current/legacy contacts, manual Booking exclusion, explicit clear/retained contact and private-trigger denial. Its small reviewed-sync fixture checks email mapping, not the entire hosted acceptance pipeline.
- `supabase/tests/quote-handoff-live-verification.sql` runs on shared development and passes **5/5** assertions: deployed projection, actual party trigger/typed storage, operator/clear preservation, unchanged existing evidence and private-trigger denial. Fictional `example.test` rows are inserted temporarily on an eligible Quote-sourced Booking and rolled back. No fake party, customer response or document remains.
- `supabase/tests/operational-access-preflight.sql` passes before/after for **12 active operators**, using authenticated RLS and real registers. Counts remain 340 Jobs, 221 Quotes, 33 cargo rows, 56 route rows, 26 Quote lines, 38 organisations and 169 stored documents; register totals remain 338 Bookings / 221 Quotes. This is database evidence, not browser proof.
- Exact readback proves **one weight expression and two sync email fields only** changed in the pre-existing functions. Container projection MD5: `92c8f5e5f761226f53caae1ddb11e155` → `79cdacf116256c024480afcb9aec257c`. Sync MD5: `cffb516c70efdbce24d0eb82655d2129` → `4b6134fd22f19c28f2d4c8ad529c6d39`.
- After live rollback: **340 Jobs, 51 parties, 26 containers, 43 active templates**, matching pre-release counts. No ordering preference, template pointer or source was modified.
- Security-advisor findings are unchanged, ignoring observation timestamps. Existing findings are not waived: 1,472 informational [RLS-without-policy findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 64 [mutable-search-path warnings](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), 24 [anonymous SECURITY DEFINER execution warnings](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), 222 [authenticated execution warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Inventory actual guards and intended private/RPC boundaries individually; do not blanket-grant/revoke or change Auth settings without approval.

No full browser/HTTP Quote acceptance-to-Booking transaction, notification toast, Carbone conversion, PDF save/download, invoice posting/payment or Customs submission was performed. Successful SQL does not certify those workflows.

## Ledger reconciliation

`docs/verification/2026-10-01-freight-migration-ledger.json` maps **all 54** branch migration files to shared-development history: 22 timestamp/name matches and 32 name matches with different hosted timestamps. The two previously missing fixes are now recorded in those 32 aliases. No migration name in this branch delta remains unmatched at this readback.

This is not automatic CLI history repair or SQL-equivalence proof for every older migration. **Do not blanket `db push`, reapply either fix, mark an alias unapplied, edit applied SQL or rewrite history.** Future releases must calculate the actual deployed delta. Any historical-ID repair requires body comparison and its own recorded scope. A Git push carries source files, not saved template/provider assets or automatic database application. A new tenant needs a separate template/source bootstrap, not copied customer data.

## Dexter boundary

These are corrections to existing conversion/review data, not new assistant capabilities. Existing authorised Booking/container reads and deterministic watches consume the same saved fields; loaded weight stays unknown. No direct contact-trigger action or generic SQL write is exposed. Existing approval/audit/source-event boundaries remain unchanged. Template review, generation and Original/Copy remain manual-only exceptions recorded in the handover. Mandatory existing Dexter/access tests pass; the additional legacy all-in-one fixture below is not claimed as passing lifecycle evidence.

## Additional legacy fixture issue: precise next step

This optional command was also attempted:

```sh
PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node --test supabase/tests/booking-stable-items-postgres.test.mjs
```

It fails before lifecycle assertions: `ReferenceError: require is not defined in ES module scope` in `booking-cargo-client-fixture.mjs`. The production `booking-cargo-handling.ts` now imports `./cargo-handling`; the fixture transforms to CommonJS but evaluates without a module resolver/bundle. A temporary bundled diagnostic reached further pre-existing fixture/baseline collisions (`Job_BookingReference` in `Job_Header`, then `AIDexterAction_AlwaysRequiresApproval` in `sys_AIDexterActions`). Diagnostic edits were fully reverted; no partial harness repair or weakened assertion is shipped.

Harry can resolve this without Lee: provide proper local dependency resolution/bundling, then align historical-stage fixture tables/columns with the chosen baseline without altering production SQL. Preserve all types and approval/watch/foreign-user assertions; rerun the full lifecycle before claiming it passes. This is separate from the 43 documented client failures and from the passing deployed migration checks, not a reason to hide either.

## Document facts and safe defaults

- **35 catalogue families are editable draft layout foundations, not 35 wired Booking workflows.** Complete mappings, record ownership, family-specific layout/privacy review, publication and real generation per family. Finance/Warehouse forms must not use a catch-all Booking dataset.
- **43 active templates remain**, with tile drag/drop, saved profile order and menu move/remove retained. No fresh browser drag/save transaction ran here; no ordering data changed.
- Latest metadata during this tie-off: **HBL published v6 / HAWB published v5**. Exact source text, artwork, tags, identity/hash are not signed off here. Re-read before release, preserve newer sources and block unreviewed fingerprints.
- **FIATA/Air/House Original and Copy are intentionally blocked.** Harry should obtain the structured document-type, issuer, signature and original-set decisions from senior Jenkar staff. Draft-only is the already-agreed interim rule; technical work does not need Lee to return.
- Document-service compatibility is fixed locally, not deployed or live-render verified. The manager draft-source mismatch and other remaining work are explained in the main handover, not left as unexplained failures.

## Recovery and continuation

`docs/verification/2026-10-01-quote-handoff-pre-release.json` retains exact pre-change function definitions/hashes (code only, no credentials/customer data). Recovery requires a reviewed compensating migration: inspect current definitions, preserve newer changes, and only if still appropriate restore the prior two definitions and remove the specifically added trigger/function. Do not restore an old whole database, delete operational records, edit applied migrations or reset history. Reverting reintroduces the original defects; it does not undo saved Bookings or authorise a backfill.

Read `docs/handovers/2026-10-01-harry-freight-handover.md` and the dev checkpoint alongside this note. GitHub, production, document-service deployment, publication and other shared changes still need their explicit approval. Lee's approval for these two fixes is not blanket release authority. The handover records technical next actions and senior-staff decisions so Harry does not need the old chat or Lee's laptop.
