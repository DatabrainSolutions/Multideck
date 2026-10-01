# Harry handover: Git publication

## Authority and scope

Lee explicitly approved pulling, pushing and merging without conflicts to make the complete work available to Harry. This is approval to publish the frontend, backend source, SQL migrations, tests, template sources and handover into GitHub/dev. It is not permission to overwrite newer hosted functions, publish unreviewed templates or release production.

## Publication checkpoint

- Repository: `DatabrainSolutions/Multideck`; destination: `dev`.
- Feature branch: `codex/freight-workspace-foundation`.
- Existing pull request: https://github.com/DatabrainSolutions/Multideck/pull/27.
- Pre-publication work checkpoint: `7cb0bae3`; dev readback: `654bbf289d3c2fd345dfac86352708991d22ff16`.
- Latest dev is already an ancestor of the complete branch. The delta is 359 files, including backend functions/helpers, 54 freight migration files, clean Word sources, catalogue fixtures/builders, tests and documentation. No conflict resolution or force push is needed at this checkpoint.
- **Published and merged:** PR #27 merged on `2026-10-01T21:33:57Z`, producing dev commit **`76beb8ec8e8b08faa16b11ec0dc1341f0ead69d6`**. The merged source head is `8f901761ede11530d340f06be2684025101bba82`. GitHub readback confirms the PR is MERGED; the local branch fast-forwarded to dev without conflicts. This final status/Slack-note commit follows the merge and is published to both branches. Fetch current `origin/dev` rather than using a local-only checkout.
- Both GitHub **Data access regression** runs and both **Dexter regression** runs passed on that exact source head before merging. No failed access check was bypassed; no force push/admin merge was used. Normal post-merge/notes-only checks and hosting builds may run again; their status is separate from the successful pre-merge source checks.
- Main/production was not updated. No Supabase function deployment, migration application, template publication, private asset export or configuration change was performed by this Git publication.

## Fresh pre-push checks

- Frontend TypeScript/Vite build: pass; existing chunk/dynamic-import warnings remain.
- Mandatory PostgreSQL/access regression: **143/143**, plus **9/9** access contracts; no skips.
- Dexter regression: **344/344**; no skips.
- Selected document studio, transport and exact-review checks: **21 pass**. The separately included `template-preview-privacy.test.mjs` fails during fixture loading, before its assertions: its single-line import stripping removes only the first import from the newly dependent helper, leaving an ES import inside `vm.runInContext`. A diagnostic bundle also needs an explicit Deno `npm:fflate@0.8.3` resolver. No test assertions or production privacy checks were relaxed; no partial fixture repair is included. Fix the fixture's module/dependency loader, then run all its existing assertions, including static source hash checks and the actual preview-handler branch. This is separate from the previously documented 43 client failures and legacy cargo fixture failure.
- Targeted read-only scan of the 359 changed files found no private keys, service-role JWTs, Supabase secret keys, GitHub tokens, Slack tokens or AWS access-key matches. This is a scoped heuristic scan, not a complete historical secret audit.
- GitHub workflows are regression-only; they do not deploy Supabase or apply migrations. The existing dev GitHub deployment is Vercel **Preview**, project `multideck-app-dev`; no `main`/production ref is being updated.
- The connected Vercel project-details/log tools failed, so read-only authenticated CLI inspection was used. Project readback confirms production branch **main**. Required Preview context values are explicitly scoped to **dev**, not this feature branch. The failed feature Preview `dpl_5w3foJP5RMnv5ioMK2hMqdm7G6SP` is explained by its actual build log: missing `MULTIDECK_SURFACE`, `VITE_MULTIDECK_TENANT_SLUG` and `VITE_SUPABASE_PROJECT_REF`. Tenant/configuration guards were not disabled and environment scopes were not broadened. The normal dev Preview is triggered separately by the merge; its exact deployed commit and workflow readiness must be checked, not inferred from the feature-branch error or Git success.
- Independent read-only verification of all **44** registered clean source files found matching SHA-256 fingerprints and no matches for the previously exposed customer names/references in their DOCX XML. This targeted text/hash check does not replace visual image review or the optional privacy-handler fixture that currently fails to load.

## Backend and saved assets Harry must use

Shared-development Supabase: `aqtwypsuijxlnvtxpuxe`. Do not use production `cigjelkrwqrwcbkpqkag` for this handover.

Fresh function inventory has advanced beyond the earlier compatibility readback:

| Function | Active version at publication preflight |
| --- | --- |
| document-studio | 84 |
| render-document | 65 |
| document-download | 56 |
| quotes-workflow | 108 |
| quote-response | 49 |
| bookings-workflow | 64 |
| document-builder-workspace | 56 |

The local compatibility work was reconciled against studio 78 / renderer 63. **The published code is available for comparison, not an instruction to deploy it over these newer hosted bundles.** Retrieve and reconcile the complete current bundles/dependencies before any separate approved backend release. Existing hosted changes were not overwritten in this publication.

The two handoff database fixes are already applied as `20261001203200` and `20261001203201`; fresh ledger readback confirms both names. Their evidence and code-only recovery definitions are committed. All 54 freight migration names are mapped in `2026-10-01-freight-migration-ledger.json`; timestamp aliases do not authorise a blanket database push.

Fresh read-only library count: **44 active templates**, including **35 active catalogue templates**, plus **one recoverably removed template**. The earlier 43-template count is historical; the newer library was preserved unchanged. Personal saved order is retained and was not rewritten by this Git release.

The clean template sources are committed under `supabase/templates/document-catalogue`, `supabase/templates/demo-safe-waybills`, `supabase/templates/fiata-bill-of-lading` and `supabase/templates/booking-information`. Their fixtures, crosswalks and maintenance scripts travel with the repo. Saved template versions, per-user order, issued files, private Storage and provider registrations remain in shared development; Git does not export or recreate those records. Use Harry's normal authorised project access, not Lee's browser session or private local temporary folders. Existing clean output files do not require Lee's original customer reference PDFs in order to edit them; rebuilding some historical derivation scripts does require their documented external reference inputs and is not necessary to continue from the committed clean sources.

## Handover versus demo readiness

Publication makes the work accessible. It does not certify an isolated demo dataset, every customer response, all 35 catalogue generation adapters or legal issuing authority. The main handover retains precise next steps, Draft-only Original/Copy safeguards, the Booking confirmation draft-source issue and latest House-source review requirements. No mail, customer response, invoice posting/payment, Customs submission, template publication or new backend deployment is performed by Git publication.

Read `docs/handovers/2026-10-01-harry-freight-handover.md` first. Historical checkpoint statements saying 'not pushed' describe their earlier observation; this publication note owns the final Git status.

The paste-ready Slack message is `docs/handovers/2026-10-01-harry-slack-message.md`. No Slack message was sent automatically.
