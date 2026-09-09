# Freight workspace deployment preflight — 6 September 2026

## Confirmed current state

- Repository: `DatabrainSolutions/Multideck`; project: `multideck-app-dev` (`prj_Z8F1DDOmYitMo4Ryl20CfO9tMux1`); team: Databrain Solutions. No project/team/domain/environment settings changed.
- Fetched `origin/dev`: `129b687e526d95094e376c24ef3a0faff2c74bf1`. At the start of this check the clean implementation branch `3a34c83` contained it and was 26 commits ahead, zero behind. These newer changes are not deployed by this check.
- Latest deployment in the connected listing: `dpl_9mmLSZae1jaEEbx8UYXp3q7K7MmN`, commit `129b687`, branch `dev`, state **READY**, Preview target. This is not a production promotion or evidence for newer local commits.
- The approved address `https://dev.multideck.app/auth` redirects the existing signed-in browser session to `/app` and renders the operator workspace. No login credentials were entered and no operational record was edited.
- Both that address and the immutable deployment URL `https://multideck-app-az57d68xp-databrain-solutions.vercel.app/auth` return HTTP 200 with entry asset `/assets/app-0TlnHEEa.js`. The immutable URL renders a workspace-domain denial; the approved hostname renders the workspace. HTTP 200/READY alone is therefore not sufficient release evidence. This is the intended fail-closed hostname boundary, not a reason to disable it.

## Why the feature-branch deployments failed

Confirmed in build logs:

- `dpl_694HJVrNTpRs3e38Ss2VNZihJdwF`, branch `codex/Prefix-update`, commit `72a6b6c`: `MULTIDECK_SURFACE is required on Vercel.`
- `dpl_CT4cuEtVFcFtNeTwipyV8MY9ah84`, branch `codex/safety-cargo-review-draft-2026-09-05`, commit `48cec3b`: same error.
- The same `72a6b6c` commit succeeded on `dev` in `dpl_AmyJD4yzQa2GAsp5nHzwanJam3b8`.

Read-only inspection of Environment Variables, without revealing values, showed these App identity keys scoped to Preview / `dev`, Preview / `test`, and separately Production:

- `MULTIDECK_SURFACE`
- `VITE_MULTIDECK_TENANT_SLUG`
- `VITE_SUPABASE_PROJECT_REF`
- `VITE_MULTIDECK_TENANT_HOST`
- `VITE_MULTIDECK_ROOT_HOST`

The failing feature branch does not receive another branch's scoped configuration. The first missing key stops the build before client compilation. It is not evidence that the same source cannot compile. [Vercel documents branch-specific Preview variables](https://vercel.com/docs/environment-variables/manage-across-environments).

This audit did not reveal secret values, prove every key's value, change system-variable access, alter branch scopes, copy credentials, disable hostname checks, or redeploy the failed branch. A connector attempt to fetch the protected URL could not create a shareable URL; direct HTTP and the existing authenticated browser supplied the bounded checks above instead.

## Correction and release path

1. Preserve the existing branch-specific setup. Do not turn every feature branch into a tenant-connected preview and do not hardcode `app`, a tenant slug or database credentials to make the guard green.
2. Finish schema/function reconciliation and full lifecycle checks before publishing the implementation branch. The local full-goal work is not release-ready merely because its build passes.
3. Publish the reviewed release through the established `dev` branch and its existing Preview / `dev` configuration. Re-fetch before integration, preserve concurrent work and verify the exact deployed commit, database/function versions, and approved-host browser flows afterwards. No push, merge or deployment is performed by this preflight.
4. If a separate feature-branch preview is required before that, the project owner must approve its exact tenant configuration and hostname treatment. That is a settings decision and is outside the instruction to leave the team's setup unchanged. Never silently reuse another tenant's credentials or broaden allowed hosts.

## Build diagnostic improvement

`multideck.client/scripts/assert-product-context.mjs` now reports all missing required Vercel configuration names together, explains the environment/branch scope, and retains wrong-product/project/tenant/database rejection. The pure validator does not supply defaults or mutate the environment. Messages do not print supplied values or malformed URL contents. Ordinary local-build behaviour is retained; no environment configuration or deployment command changed.

Verification: four executable tests exercise the real CLI process for valid local/Preview/Production contexts, each missing key, wrong product/project/tenant/database values, malformed URLs and redacted diagnostics. All passed. The actual root `node build-deployment.mjs` completed TypeScript and Vite successfully; existing large-chunk warnings remain. This is a local build, not a hosted lifecycle pass.

The deployment failure cause is confirmed and future diagnostics improved. The failed feature deployment itself remains ERROR; the existing approved development site works. The newer freight implementation still requires controlled release and end-to-end evidence.
