# Routing cut-offs: development release

## Scope and preflight

Development only: Supabase `aqtwypsuijxlnvtxpuxe`, existing Vercel `multideck-app-dev` project `prj_Z8F1DDOmYitMo4Ryl20CfO9tMux1`. No Customs/iCustoms records, declarations, tracking connection, PDF-logo code, emails or Quote acceptance were changed. The pending JQ20022 V2 send/accept/apply remains separate.

- Clean source checkpoint `37574071545e767d1fd520a2d6db431c3da6c2ee`, two commits ahead of `origin/dev`, zero behind after fresh fetch.
- Refreshed schema-only export, no business/Auth/Storage rows: SHA256 `42e3d4bbe8680c4cfed131520517272c56921de497d7f065b2ab3227399f267f`.
- Actual development schema restored into disposable PostgreSQL 17; exact cut-off migration applied successfully with all guarded function replacements and existing service-boundary assertions intact. Managed Auth/Storage are explicitly empty fixtures, not hosted certification.
- Migration SHA256 `773217cada34dc58c9ce5561080d76bae6db933d7f5b8043c8cb4f3fbaabedfb`.
- Downloaded deployed Dexter 158: 18 source files, 16 identical to local; only index/security differ, and both deployed copies exactly match prior release `f235088`. Reviewed diff contains only cut-off prompt/intent changes, no new imports.
- Fresh focused run: 38 tests pass, zero failures/skips. Client TypeScript/Vite production build passes; existing large-chunk warning remains.

## Backend release evidence

Fetched the actual remote migration history into an isolated temporary CLI project. Added only `20260906143817_booking_route_cutoff_foundation.sql`; dry run listed exactly that migration, zero seeds and zero roles. Applied using the same CLI target and verified its original identity in the remote ledger. No migration history repair or baseline rewrite.

CLI reported a post-apply local catalogue-cache warning because Docker is absent. Remote ledger and catalogue reads independently confirm successful application; no retry or duplicate application was attempted.

Before/after preservation, immediately after migration and before hosted test edits:

| Records | Count | Original-fields MD5 fingerprint, unchanged |
| --- | ---: | --- |
| Job routing | 45 | `1f70ed8d049cd08040668abed284e53a` |
| Quote versions | 38 | `894027e2d6b2a49fef53d81af5dd0810` |

Routing comparison excludes only the three new nullable columns. Zero existing routes received invented deadlines. These fingerprints prove preservation at those reads, not a claim that teammates cannot subsequently edit records.

Live grants checked: cut-off helpers/triggers and the wrapped old workspace are inaccessible directly to anon, authenticated and service roles; current workspace/save/approved route action remain service-only. Security advisor comparison: no new or removed findings (1,314 INFO, 241 WARN). Existing findings are not declared resolved or safe by this release.

Deployed **only agent-dexter**, now ACTIVE version 159, `verify_jwt: true`, bundle SHA256 `1f783215aef40d4577c5eb52f38f0dcfe88bc8318488e3d26142c3a2e4022000`. Re-downloaded all 18 files; all match local reviewed source exactly. Other Edge Function metadata is unchanged. Shared Customs-related imports were byte-identical, not modified implementations; no Customs function was separately deployed or invoked.

## Frontend and hosted verification

Fast-forward pushed `3757407` to `origin/dev`; remote SHA read back. Local recovery tag `codex/freight-before-cutoff-release-20260906` retains `f235088` (source recovery, not a database rollback instruction).

Existing Git integration created development Preview deployment `dpl_DmkCToSYE8nmNmHoZK5hfWB4ESmD`, URL `https://multideck-app-841jdqh51-databrain-solutions.vercel.app`, now **READY**, exact Git SHA verified. Both that URL and approved `https://dev.multideck.app` return HTTP 200 and entry `/assets/app-CKrM6TV6.js`. Project identity, framework, Node version, domains and configuration-updated timestamp match the pre-release snapshot. No team setup, environment or domain settings changed.

Signed-in Chrome on the approved hostname, synthetic Booking **JE0991134** (customer reference `QA-FREIGHT-20260906-NOT-A-SHIPMENT`):

- Details > Route & schedule > Operational details displays the capability-gated carrier cut-off editor, with all three deadlines initially blank on its Sea leg.
- Set cargo `2026-09-18T10:30:00Z`, documentation `2026-09-17T12:00:00Z`, VGM `2026-09-17T16:00:00Z`; Apply then the normal Booking Save persisted exactly those typed UTC values. Independent database read confirms the selected route and recorded actor. Full page reload shows all three saved values.
- Selecting Air opens the explicit mode review warning, including cut-off clearing and retained history. Selected **Keep current mode**, leaving Sea intact; did not save a mode change.
- Cleared all three through the native browser controls, Apply and Save. Database confirms null deadlines and retained Sea mode. A second full reload displays `Not recorded` for all three.
- Audit tab shows exactly two deadline events (set and clear), both attributed to Lee Wright. Expanded latest event shows the original three timestamps alongside current `Not recorded` values. Screenshot visually inspected; readable previous/current columns, no overlap. Captured warn/error console logs are empty for these bounded interactions.
- All 38 Quote versions still match the original pre-release fingerprint after these Booking-only edits. Existing planned movement dates remain blank. Only the synthetic Booking was intentionally saved; normal save timestamps and the two audit entries are retained, not erased.

One automation discrepancy is retained rather than hidden: the browser extension's Playwright `fill('')` visibly blanked datetime controls but did not update the controlled form state, so Apply made no change. Initially reported as a possible product failure, then isolated by using native `setValue`, which updated the draft and persisted successfully. No application patch or direct database cleanup was used. The isolated real-Playwright tests had also passed clears; use native controls for this hosted test. The cancelled intermediate editor attempt is not counted as a verified changed-draft cancellation because it used the same helper.

Remaining cut-off verification: hosted Dexter chat-to-approval execution, watch delivery/pause/resume and cross-project denial are not certified by source parity or the local PostgreSQL lifecycle. Hosted malformed-input and confirmed mode-clear save remain covered locally rather than by this bounded hosted exercise. No second test email, customer response, financial transaction or declaration was submitted.

The full eight-clash/all-mode goal remains active. Wider hosted Dexter/watch lifecycle, accepted-revision lifecycle and deeper operational modes remain on the main ledger; this release does not prove the 95% target.
