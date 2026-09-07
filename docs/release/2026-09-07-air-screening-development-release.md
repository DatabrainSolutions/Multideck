# Screening development release — hosted lifecycle still pending

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
