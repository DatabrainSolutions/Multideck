# Screening development release — operator lifecycle verified; Dexter/watch pending

Development project `aqtwypsuijxlnvtxpuxe` now has both exact hash-pinned screening
migrations from the development plan: ledger 462 → 464, no seeds/roles/unrelated
migrations. The new evidence table has zero records.

Before/after full-row fingerprints match exactly:

- 38 Quote versions: `48f5e0efb6d918d4019edbf8d9e47a28` (ordered by full JSON).
- 78 Booking headers: `f331327c8bf1dd795e573f25ed9bacfd` (ordered by Job_ID).

Only two function metadata entries changed, with no removals:

- Booking v46 ACTIVE, JWT true, bundle
  `0b9bd99d7dbe5a17bc69825598ce80e5cd8dc68f072dcc7af0fb858eb7602cd0`.
- Dexter v169 ACTIVE, JWT true, bundle
  `30382e88ac952c6dd48aca4e665e32d195928f384f9aa96d18c74d665a5dfaf2`.

Finance-subledger v38 and every unrelated function entry are unchanged. Existing
shared dependencies were bundled normally; no Customs/iCustoms source or function
was modified. Downloaded-source byte comparison remains a verification step.

Advisors: 1,555 → 1,556, with no removed identities. The sole addition is INFO
`rls_enabled_no_policy` on the new private evidence table. Live checks confirm
RLS enabled, anon/authenticated reads denied, direct service UPDATE denied,
private writer EXECUTE denied to service_role, browser Save EXECUTE denied and
public service Save EXECUTE granted. This is an intentional private boundary,
not a reason to add a browser policy. Existing warnings remain unresolved;
[advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The client final build and 27 tests passed before release. Fresh fetch shows no
incoming changes from origin/dev (`54d6da2`). Next: normal dev push, exact Vercel
version/READY/alias verification, then internal hosted save/reload/correction/
void and approved Dexter/watch checks. No hosted screening lifecycle or 95%
completion is claimed. Quote revision approvals, configuration holds and all
recorded exclusions remain intact.

## Exact client release and backend-source checkpoint

Normal non-force push advanced dev from `54d6da2` to
`7947c01e2b43abfd6baa32fe0931528e8029b14b`. Its existing Vercel deployment is
`dpl_5jhERcB7Ve6LmoTimBCS62nQaV64`, URL
`multideck-app-38vba4cnw-databrain-solutions.vercel.app`.
Latest inspection is BUILDING, not READY; the development alias is not yet
confirmed. Build logs show prebuild context checks followed by TypeScript and
Vite, currently transforming. No replacement deployment or setting change.

Downloaded Booking/Dexter sources in
`/tmp/multideck-screening-source.LM2PGy` contain 28 files, all byte-for-byte equal
to the checkout. This closes the downloaded-source comparison, not hosted UI
or action lifecycle. Continue the same deployment ID, then exact-version
hosted verification on the internal Air Booking.

## Hosted operator lifecycle — verified 7 September 2026

The retained deployment `dpl_5jhERcB7Ve6LmoTimBCS62nQaV64` was subsequently
observed READY at exact client commit `7947c01e2b43abfd6baa32fe0931528e8029b14b`,
with `dev.multideck.app` assigned and no alias error. This supersedes the
BUILDING checkpoint above; no replacement deployment or configuration change.

A fresh isolated Chrome session on `https://dev.multideck.app/bookings/ji0991132`
exercised the actual operator editor against the development backend. Target:

- Booking `JI0991132`, job `78313622-1542-4aec-bbb2-c300a7ef5d57`.
- Retained synthetic cargo 2 `35b0dfa1-c72b-422b-92f3-f15408b4a3cd`,
  labelled `INTERNAL QA Air second line - not a shipment`.
- New evidence `3b155b97-5fba-4f8b-b07a-d163b9849e10`.

The database confirmed no evidence on that cargo before the test. Browser Save
created a record with status `INTERNAL QA — NOT CLEARANCE`, explicitly synthetic
method/source/notes and an operator reason. A full page reload, reselecting the
cargo and reopening its editor, retained the supplied values. A correction
cleared agent reference `QA-AIR-20260907` to SQL NULL and replaced the notes;
the database and reopened editor both confirmed the change.

The operator then voided the record with an explicit retirement reason. A second
full page reload showed `Voided Read-only`, no correction action, retained source
and notes, and `Not recorded` for the cleared agent reference. Expanded recent
history displayed all three create/correct/void events, Lee Wright as actor,
verbatim reasons, and before/after values. Database evidence independently
confirmed those three events and final `voided` state at
`2026-09-07 14:59:32.863802+00`.

Final full-row Quote fingerprint: all 38 `CusQuote_Versions` rows remain
`48f5e0efb6d918d4019edbf8d9e47a28`, using JSON-text ordering as before release.
The QA cargo and voided evidence remain intentionally retained for audit; no
test evidence remains active from this check. No screening actually occurred,
and this is not clearance, agent verification or AWB evidence.

This closes only the hosted operator create/reload/correct/clear/void/read-only
gate. Hosted fractional-time entry, stale-conflict recovery, Dexter read and
mandatory approval, matching/nonmatching watch lifecycle, and hosted access
denial remain unproven here. Local evidence is not substituted for those gates.
Customs/iCustoms, held Quote revision actions and all deferred work remain untouched.
