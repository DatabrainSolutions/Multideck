# Paired Training workspace setup

The frontend and Main backend were deployed on 3 September 2026 to `dev.multideck.app` and Supabase project `aqtwypsuijxlnvtxpuxe`. Luke must provision and pair the Training project before enabling it. No Training project has been created. See [deployment evidence](../release/2026-09-03-training-workspace-deployment.md).

## What operators experience

The sign-in screen has a Training switch. It is disabled, with an explanation, when the public Training configuration is absent. Users use their existing Main password, OAuth identity or passkey. Training is a separate operational Supabase project, selected for this browser tab, with a persistent **TRAINING** sidebar label. Switching recreates the clients and clears the in-memory workspace; operational browser drafts and recovery copies have separate storage keys.

Main remains the only account authority. Invitations, password recovery, identity linking and passkey management use Main. Training does not let operators administer separate accounts or permissions. Each operator receives the same Auth UUID and Multideck User_ID in Training, with their current Main role permissions and explicitly mapped training offices. No passwords, provider credentials, operational records or Main storage objects are copied.

This is a bounded exception to App's normal one-project-per-tenant deployment: both projects belong to the **same tenant**. Neither the browser nor the broker accepts an arbitrary project URL from a user or request body. The deployed configuration and a server-only database pairing define the allowed destination.

## Exact Vercel environment variables

Add these to the tenant's existing App Vercel project in each deployment environment where Training is required, then rebuild/redeploy the frontend:

For the current development deployment, use project `multideck-app-dev`, **Preview / branch `dev`**. Adding values to Production alone will not configure `dev.multideck.app`. Redeploy the Training-enabled deployment after changing them.

| Exact name | Value | Browser visible? |
|---|---|---|
| `TRAINING_SUPABASE_URL` | That tenant's Training project URL, e.g. `https://<training-project-ref>.supabase.co` | Yes |
| `TRAINING_SUPABASE_ANON_KEY` | Training's public anon key or publishable key | Yes |

Keep the existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY` and tenant hostname variables pointing at **Main**. Training variables deliberately have no `VITE_` prefix: Vite explicitly exposes only the two names above. Never expose a service-role key through Vercel/client build variables.

A temporary build with non-secret test values confirmed these exact two names are included in the frontend and a `TRAINING_SUPABASE_SERVICE_ROLE_KEY` sentinel is excluded. This build check does not replace connection testing against the actual Training project.

## Exact secrets on the MAIN Supabase project

Set these as Edge Function secrets on Main, not on Vercel:

| Exact name | Value |
|---|---|
| `TRAINING_SUPABASE_URL` | Same Training URL as Vercel, without a trailing slash |
| `TRAINING_SUPABASE_ANON_KEY` | Same Training public key as Vercel |
| `TRAINING_SUPABASE_SERVICE_ROLE_KEY` | Training's server-only service-role key |
| `TRAINING_SOURCE_COMPANY_ID` | Main's `cmp_Company.Company_ID` UUID for this tenant |

Main's existing `APP_URL` must be the exact App origin. Keep its existing approved local/preview origins if needed. Built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` remain Main's own credentials. There is no `TRAINING_MODE` variable; the Training database pairing is authoritative.

## Provision and pair, in this order

1. Provision a fresh dedicated Training Supabase project for this tenant. Apply the approved App baseline, required reference seeds and subsequent migrations. Apply `20260903170000_training_identity_bridge.sql` to **both** Main and Training, following the repository's migration process. **Already applied to the current development Main project** under remote migration version `20260903104323`; do not apply it there again. Its pairing table remains **empty on Main**. Other tenant Main projects still require this migration.
2. In Training, seed its own company, offices and complete permission catalogue. Do not restore Main Auth users, operational customer data, provider tokens, private files or delivery credentials. The bridge rejects conflicting pre-existing identities rather than taking them over.
3. In Training Auth settings, set **JWT expiry to 300 seconds**. Keep public sign-ups and anonymous sign-in disabled. Disable external sign-in providers, manual identity linking, passkeys and MFA enrolment in Training; those all belong to Main. Keep the email Auth endpoint available for the server-side session exchange. Training does not require delivery of sign-in emails.
4. Before pairing, confirm Training has no ordinary Auth users or registered authentication factors. The migration installs database guards on Auth users, identities and MFA, and on `auth.webauthn_credentials` when present. If that optional table is introduced later, install its guard before enabling the feature; leave Training passkeys disabled.
5. Pair **only Training** using the SQL below. Use the actual IDs from each project. Map each Main office used by eligible operators to an office belonging to the Training company. An unmapped office is denied, not silently widened to every office.
6. Set the four Main secrets above. Deploy `training-session` to Main. Deploy the updated `team`, `accept-invitation`, `warehouse` and `agent-dexter` functions to both projects after the migration. **These five Main deployments are already complete for the current development project.** Deploy the rest of the normal App operational functions to Training. The `training-session` function needs no separate deployment to Training and must not have Main project secrets there.
7. Add Main Auth's approved callback URL `https://<tenant-host>/auth?workspace=training` alongside its existing callbacks. Do the equivalent for localhost or approved preview origins used for testing. Do not add broad cross-tenant wildcard callbacks. Provider callbacks continue to belong to **Main Auth**.
8. Add the two public Vercel variables and deploy the frontend. Configure any Training-only provider connections separately, using sandbox/test destinations. Physical database isolation does not turn an email send, Customs provider submission or finance integration into a simulation.

Run this in **Training's** SQL editor after its company and offices exist:

```sql
insert into public.training_configuration
  (singleton, main_project_url, main_company_id, training_company_id)
values
  (true, 'https://<main-project-ref>.supabase.co',
   '<main-company-uuid>', '<training-company-uuid>');

insert into public.training_office_links (main_office_id, training_office_id)
values ('<main-office-uuid>', '<training-office-uuid>');
-- Add a mapping for each permitted Main office.
```

These tables and synchronisation RPCs are unavailable to browser roles. Do not populate the pairing table on Main or pair projects belonging to different tenants.

## Session and security behaviour

Main validates the bearer and active company profile before contacting Training. Training must confirm the configured Main URL/company pair. A credentialless shadow Auth identity uses `<main-auth-uuid>@training.multideck.invalid`; `cmp_Users` retains the operator's real work email. The temporary magic-link hash is verified entirely on the server and is never emailed or sent to the browser. This uses Supabase's [admin create-user](https://supabase.com/docs/reference/javascript/auth-admin-createuser) and [admin generate-link](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) APIs.

Supabase internally generates a password for an admin-created user when omitted. The migration strips it during Training identity creation and blocks later credentials, email/phone changes, identity linking, MFA and passkey creation. The broker never returns a Training refresh token. Access tokens remain in memory and renew through Main before expiry; concurrent requests share a handoff. Invalidated or superseded responses cannot refill the cache.

Main deactivation, role changes and session revocation are rechecked at renewal. An already issued Training bearer may remain usable until its **five-minute expiry**; this is not instant cross-project revocation. A schema or handoff failure never opens Main as a substitute. Leaving Training restarts the app on Main and preserves each project's separate drafts.

Training data reads, Storage, Realtime, Edge Functions and Dexter use the Training client/project. Main Auth is used only for identity/security operations and authorising the handoff. Customer public URLs never inherit a private operator's Training choice: ordinary public links resolve Main; an explicit `?workspace=training` selects Training for a local/public preview. Existing generated public links are not automatically rewritten; review their destination before sharing a Training preview externally.

## Dexter and Watching for you

Dexter receives the actual database environment in its server instructions. Existing allowlisted reads/writes and deterministic watch signals run in the selected project with that project's permissions and mailbox grants. It cannot query Main from Training. Account and role administration is denied in Training, including attempts through backend routes.

The session handoff is an internal security mechanism, intentionally **not** an allowlisted Dexter action or watch capability. It never returns secrets to the model or accepts model-written identity changes. Identity changes emit a Training audit event only when the source profile/roles/offices change; a routine unchanged grant renewal is not a new watch event. Existing operational watch adapters remain unchanged and require the usual Training worker deployment.

The existing Auth-to-operational-profile trigger continues running in Main. The migration gates that trigger when the Training pairing exists, so it cannot create a conflicting profile before the same-ID handoff. The original trigger function body is preserved.

## Verification and remaining activation checks

Confirmed locally:

- Client build and TypeScript checks pass.
- Broker tests verify correct UUID/project, no refresh-token disclosure, wrong-origin/source-company rejection, unpaired targets, identity collisions and excessive JWT expiry.
- A real temporary PostgreSQL 17 instance executed the migration against a minimal schema fixture. Assertions cover Main remaining unchanged, credential stripping, identity consistency, idempotent audit, role/office removal, wrong pair/missing mappings, missing permissions, credential/factor denial and service-only access. This is not a hosted Supabase lifecycle test.
- Client tests cover grant deduplication, expiry, failed retry, sign-out invalidation, identity races and separate draft keys. Existing Inbox/Customs recovery, Dexter navigation and recent-context tests pass.
- Browser: disabled Training switch, explicit unavailable-Training error and Return to Main work. At a 390px viewport the document has no horizontal overflow. The desktop sign-in appearance is retained.
- Two pre-existing `theme-first-paint.test.ts` source assertions still fail: they expect `applyDocumentTheme(mode)` while the unchanged provider now uses `applyDocumentTheme(forcedTheme ?? mode)`. The provider and those tests were not modified by this work. Other focused regression checks pass.

**Luke's paired hosted projects are not configured yet.** Before enabling Training for operators, verify using a dedicated invited Main test user:

1. Password and an existing linked provider/passkey sign in through Main and open Training without a second account prompt; the sidebar displays TRAINING on expanded, collapsed and mobile navigation.
2. Create/update a dedicated Training quote, refresh and verify persistence; prove the Main project contains no matching mutation. Switch back and confirm Main drafts and records remain Main's.
3. Leave a Realtime/watch flow open across two token renewals. Change the user's Main role/office assignment, then deactivate the Main profile; check renewal denial and the expiry boundary. Test sign-out and same-browser account changes.
4. Reject a Main token at Training REST/Storage and a Training token at Main; reject another tenant's Main bearer and a wrong company/pair. Verify Training direct password, provider, OTP/recovery, MFA and passkey sign-in cannot bypass Main.
5. Confirm account invitation, password recovery and security settings still target Main. Confirm an existing identity conflict or missing office mapping produces a useful error without granting access.
6. Run a Dexter read, approved write and matching/non-matching watch with dedicated Training records. Verify one event, pause/resume and user/mailbox isolation. Provider flows need Training-specific connections.

Verified after development deployment: the live sign-in page displays the disabled Training switch, required-field validation works, and an explicit Training URL fails closed with Return to Main. All 50 deployed source files match the reviewed function bundles. Hosted SQL assertions confirmed Main Auth profile creation and email updates, then rolled back the test transaction. Browser roles cannot read pairing data or execute identity sync. Main public signup and anonymous access remain disabled.

The Training project is absent from the connected account, and the four Main Training secrets are not set. Consequently, hosted cross-project sign-in, Training persistence, token renewal and denial tests remain unverified. A blank Supabase project needs the schema, pairing, office mappings and Auth configuration above; environment variables alone cannot initialise it. No other tenant or production rollout was performed.
