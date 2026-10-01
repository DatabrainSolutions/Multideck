# Harry handover: Git publication

## Authority and scope

Lee explicitly approved pulling, pushing and merging without conflicts to make the complete work available to Harry. This is approval to publish the frontend, backend source, SQL migrations, tests, template sources and handover into GitHub/dev. It is not permission to overwrite newer hosted functions, publish unreviewed templates or release production.

## Publication checkpoint

- Repository: `DatabrainSolutions/Multideck`; destination: `dev`.
- Feature branch: `codex/freight-workspace-foundation`.
- Existing pull request: https://github.com/DatabrainSolutions/Multideck/pull/27.
- Pre-publication work checkpoint: `7cb0bae3`; dev readback: `654bbf289d3c2fd345dfac86352708991d22ff16`.
- Latest dev is already an ancestor of the complete branch. The delta is 359 files, including backend functions/helpers, 54 freight migration files, clean Word sources, catalogue fixtures/builders, tests and documentation. No conflict resolution or force push is needed at this checkpoint.
- Publication/merge is being completed under this approval. The final remote commit and check results will be recorded here after readback.

## Fresh pre-push checks

- Frontend TypeScript/Vite build: pass; existing chunk/dynamic-import warnings remain.
- Mandatory PostgreSQL/access regression: **143/143**, plus **9/9** access contracts; no skips.
- Dexter regression: **344/344**; no skips.
- Selected document studio, transport and exact-review checks: **21 pass**. The separately included `template-preview-privacy.test.mjs` fails during fixture loading, before its assertions: its single-line import stripping removes only the first import from the newly dependent helper, leaving an ES import inside `vm.runInContext`. A diagnostic bundle also needs an explicit Deno `npm:fflate@0.8.3` resolver. No test assertions or production privacy checks were relaxed; no partial fixture repair is included. Fix the fixture's module/dependency loader, then run all its existing assertions, including static source hash checks and the actual preview-handler branch. This is separate from the previously documented 43 client failures and legacy cargo fixture failure.
- Targeted read-only scan of the 359 changed files found no private keys, service-role JWTs, Supabase secret keys, GitHub tokens, Slack tokens or AWS access-key matches. This is a scoped heuristic scan, not a complete historical secret audit.
- GitHub workflows are regression-only; they do not deploy Supabase or apply migrations. The existing dev GitHub deployment is Vercel **Preview**, project `multideck-app-dev`; no `main`/production ref is being updated.
- The connected Vercel project-details tool failed input validation; GitHub's existing deployment/status records establish the Preview target. Do not interpret that tool failure as permission to alter hosting configuration.

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

The two handoff database fixes are already applied as `20261001203200` and `20261001203201`. Their evidence and code-only recovery definitions are committed. All 54 freight migration names are mapped in `2026-10-01-freight-migration-ledger.json`; timestamp aliases do not authorise a blanket database push.

The clean template sources are committed under `supabase/templates/document-catalogue`, `supabase/templates/demo-safe-waybills`, `supabase/templates/fiata-bill-of-lading` and `supabase/templates/booking-information`. Their fixtures, crosswalks and maintenance scripts travel with the repo. Saved template versions, per-user order, issued files, private Storage and provider registrations remain in shared development; Git does not export or recreate those records. Use Harry's normal authorised project access, not Lee's browser session or private local temporary folders. Existing clean output files do not require Lee's original customer reference PDFs in order to edit them; rebuilding some historical derivation scripts does require their documented external reference inputs and is not necessary to continue from the committed clean sources.

## Handover versus demo readiness

Publication makes the work accessible. It does not certify an isolated demo dataset, every customer response, all 35 catalogue generation adapters or legal issuing authority. The main handover retains precise next steps, Draft-only Original/Copy safeguards, the Booking confirmation draft-source issue and latest House-source review requirements. No mail, customer response, invoice posting/payment, Customs submission, template publication or new backend deployment is performed by Git publication.

Read `docs/handovers/2026-10-01-harry-freight-handover.md` first. Historical checkpoint statements saying 'not pushed' describe their earlier observation; this publication note owns the final Git status.
