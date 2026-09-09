# Training workspace development deployment — 3 September 2026

The Training-ready frontend and Main backend are deployed to **https://dev.multideck.app/auth**. Training remains disabled until Luke's separate project is provisioned and paired. No other tenant or production deployment was changed.

## Deployed release

- Vercel project: `multideck-app-dev` (`prj_Z8F1DDOmYitMo4Ryl20CfO9tMux1`).
- Vercel deployment: `dpl_bX5jtXVnMWS6UFp1rmgcpaSzMKiD`, status **READY**, alias `dev.multideck.app`.
- Target: Preview, branch context `dev`. Source: CLI upload of the existing local checkout, including uncommitted Training and autofill changes; **no Git commit or push was performed**. Later Git-based deployments must include these source changes. A Vercel redeploy of this deployment uses its uploaded source.
- Main Supabase: `aqtwypsuijxlnvtxpuxe` (MultiDeck).
- Migration: local `20260903170000_training_identity_bridge.sql`, recorded remotely as `20260903104323_training_identity_bridge`. The remote version is recorded explicitly to avoid applying this migration twice.

| Edge Function | Previous version | Deployed version | JWT verification |
|---|---:|---:|---|
| training-session | Absent | 1 | Custom Main bearer authentication |
| team | 67 | 68 | Preserved: enabled |
| accept-invitation | 36 | 37 | Preserved: custom invitation verification |
| warehouse | 62 | 63 | Preserved: enabled |
| agent-dexter | 148 | 149 | Preserved: enabled |

Existing deployed bundles were retrieved before changing them. Only the reviewed Training changes and their new shared helper were added. The invitation function retained its existing deployed backend helper; its unrelated local CORS changes were not included. Readback matched **all 50 files** in the five deployed bundles.

## Verification

- Vercel completed the client TypeScript and production build. The live `/auth` returned HTTP 200 and served the new `app-CQpn2CSt.js` entry asset.
- In the browser, the deployed Training switch is visible and disabled with its setup explanation. The sign-in design and first-screen shader remain visible. Submitting an empty form shows the work-email validation and focuses that field.
- An explicit `/auth?workspace=training` shows a clear unavailable message. Return to Main restores the sign-in screen.
- Hosted SQL verified Main's Auth-to-profile insert and email-update lifecycle inside a transaction, which was rolled back. No test account or profile was retained.
- Main has zero pairing rows, its ordinary profile synchronisation remains enabled, and nine Training guards are installed. Anonymous/authenticated browser roles cannot read pairing configuration or invoke identity synchronisation.
- Live broker checks returned the expected 503 while unconfigured, 403 for a wrong origin, and 405 for an unsupported method. Existing protected team, warehouse and Dexter endpoints reject unauthenticated requests with 401.
- Main Auth still reports public signup disabled and anonymous users disabled.
- Repeated local checks: five broker tests, seven client Training tests, and the executable PostgreSQL migration test all pass. The migration test now includes an existing Auth-to-profile trigger.
- Changed-source secret-pattern scan: no findings. `git diff --check` passes.
- A separate temporary production bundle, using non-secret test values, includes `TRAINING_SUPABASE_URL` and `TRAINING_SUPABASE_ANON_KEY` and excludes a `TRAINING_SUPABASE_SERVICE_ROLE_KEY` sentinel. This confirms the exact variable names and browser allowlist; it is not a Training connection test and was not deployed.

Earlier client/recovery/Dexter regression results and the two existing theme-test source assertion failures are documented in the [setup guide](../deployment/training-workspace.md). A deployed sign-in screen and passing build do not prove the cross-project Training journey.

## Issue found and resolved before deployment

The real Main schema contains an Auth trigger that creates a new operational profile automatically. That conflicted with Training's requirement to preserve the Main profile ID. The migration now preserves the existing trigger function and gates the trigger only when a Training pairing is present. The added regression reproduces this trigger; the hosted Main transaction confirms Main behaviour is retained.

## Remaining activation work

No Training project is visible in the connected Supabase account and no `TRAINING_` Main secrets are set. A blank project needs the App schema/functions, a company and permission catalogue, an explicit Main/Training pairing, office mappings, and the documented Training Auth settings. The two public Vercel variables then enable the toggle after a rebuild; the Main secrets enable the handoff.

For this development site, set the public variables in Vercel **Preview / `dev`**, not only Production. [Luke's setup guide](../deployment/training-workspace.md) contains every exact variable name and the pairing SQL.

Hosted Training sign-in, cross-project denial, role/revocation expiry, Realtime renewal, saved-record persistence and Dexter/watch lifecycles remain pending the actual Training project. Main Auth callback allowlisting must also be checked during activation. No end-to-end Training success is claimed.

The connected Supabase tools have no Auth-config read operation. The CLI offers a config push rather than a scoped read, and a read-only attempt using its documented local credential locations/keyring entry could not obtain a credential. No broad config push was attempted. Public Auth settings were verified through the supported settings endpoint; the callback list remains unverified. Luke should explicitly check the exact Training callback described in the guide.

Sanitised machine-readable evidence: [deployment evidence](2026-09-03-training-workspace-evidence.json). Local command and source-comparison evidence is retained under `/tmp/multideck-training-deploy`.
