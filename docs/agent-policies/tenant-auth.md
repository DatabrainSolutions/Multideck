## Supabase, Tenant, and Authentication Architecture

Multideck uses physical tenant isolation. It is not a conventional multi-tenant application with every company stored in one shared database.

### Tenant Isolation Rule

Every customer must have its own complete Supabase project, including its own:
- Postgres database.
- Auth user directory and identities.
- Storage buckets and objects.
- Row Level Security policies.
- Edge Functions, secrets, provider credentials, and operational logs where used.

Examples:
- `jenkar.multideck.app` connects only to the Jenkar Supabase project.
- `databrain.multideck.app` connects only to the Databrain Supabase project.

Never introduce a shared `tenants` table, shared tenant database, or client-selected Supabase project as the security boundary unless the product owner explicitly changes this architecture. A `tenant_id` column is not a substitute for the separate-project boundary.

The frontend for a tenant must be built or configured with only that tenant's public Supabase URL and publishable/anon key. It must never contain another tenant's credentials. Supabase service-role keys and admin credentials must never be exposed in browser code.

Separate projects provide the main isolation boundary, but each project must still use least-privilege Row Level Security, private storage policies, server-side authorization, and appropriate audit logging. Do not treat physical separation as permission to weaken security inside a tenant project.

### Domain and Routing Model

The intended production domains are:
- `multideck.app` for public entry and workspace selection.
- `<company>.multideck.app` for the customer's isolated application and authentication flow.

`multideck.app` is a stateless workspace router. A user enters or selects the company's safe workspace slug, and the router redirects them to `https://<slug>.multideck.app/auth`.

Authentication must happen on the tenant subdomain, using that tenant's Supabase Auth project. A session created by one Supabase project cannot be safely transferred into another project, so the root domain must not create a central Supabase session and attempt to pass it to a tenant.

Workspace routing must:
- Normalise and validate the workspace slug.
- Allow only valid company subdomains beneath the configured Multideck root domain.
- Reject reserved, malformed, or externally controlled destinations.
- Never accept an arbitrary redirect URL.
- Never silently fall back to another tenant when a workspace is unknown or misconfigured.

Each production tenant deployment must be bound to its exact expected hostname. Use `VITE_MULTIDECK_TENANT_HOST` and `VITE_MULTIDECK_ROOT_HOST` with the tenant's own `VITE_SUPABASE_URL` and publishable/anon key. Production must fail closed if the browser hostname does not match the configured tenant or root host.

The application is currently hosted on Vercel while the permanent domains are being configured. Temporary production URLs must be added explicitly to the relevant Supabase project's URL configuration. Do not use `production.multideck.app`; the permanent public root is `multideck.app`.

### Invite-Only Account Rule

Multideck does not offer public self-registration.

- Disable public user sign-ups in every tenant's Supabase Auth settings.
- Multideck administrators create accounts from an approved customer roster using a trusted server-side or Supabase administrative workflow.
- Email/password and magic-link flows may authenticate an existing account only. Magic-link calls must set `shouldCreateUser: false`.
- Do not add a sign-up screen, create-account call to action, or browser-side `signUp` call.
- Never use the Supabase Admin API or service-role key from the client application.

If a company supplies a list of staff, provision those users into that company's Supabase project only. Check for duplicate addresses and confirm the target project before creating or inviting anyone.

### Login Providers and Identity Linking

Supported sign-in methods are email/password, email magic link where enabled, Google, LinkedIn through OIDC, Facebook, Microsoft/Azure, and passkeys.

The safe lifecycle is:
1. An administrator creates the user's tenant account.
2. The user signs in with their existing approved method.
3. From Profile Settings, the signed-in user links Google, LinkedIn, Facebook, Microsoft, or a passkey to that existing account.
4. After linking, that identity can be used for future sign-ins to the same tenant.

Manual identity linking must remain enabled in the tenant's Supabase project. Provider linking must use Supabase's authenticated identity-linking flow and must not create a second user record. Public sign-up remaining disabled is a required defence against an unapproved OAuth identity creating a new account.

Each social provider must be configured independently for each tenant project with that project's exact callback URL, as shown in the Supabase dashboard. Keep provider switches disabled until valid client IDs, secrets, consent-screen settings, and callback URLs are available and have been tested.

Sign-out must call Supabase Auth sign-out and clear the tenant's local authenticated state. Do not implement a cosmetic redirect that leaves the session active.

### Supabase URL Configuration

For every tenant project:
- Set the Site URL to that tenant's exact live application origin.
- Add only the tenant's approved production callback paths and necessary local-development URLs to the redirect allow list.
- Avoid a broad wildcard that lets one tenant project redirect to every `*.multideck.app` subdomain.
- Remove obsolete preview, test, or incorrect production origins when they are no longer required.
- Configure provider consoles with the exact Supabase callback URL shown for that project; do not guess it from another tenant.

Vercel preview URLs are not permanent tenant identity domains. Use them only as explicit temporary URLs while deploying or testing, and remove them from production auth configuration when the permanent hostname is live.

### Passkey Domain Rule

Passkeys are bound to a stable relying-party domain. Do not enable passkeys for a tenant until:
- The permanent tenant subdomain resolves publicly.
- HTTPS and its certificate are working correctly.
- Supabase Site URL and redirect URLs use that permanent domain.
- The passkey RP ID is the exact tenant hostname, for example `jenkar.multideck.app`.
- Registration and sign-in have been tested on the real domain.

Do not use a Vercel preview hostname as the permanent passkey RP ID. Changing the RP ID later can make existing passkeys unusable. Passkey registration belongs in Profile Settings after the user has signed in to their pre-created account.

### New Tenant Provisioning Checklist

Before a tenant is considered live:
1. Create a dedicated Supabase project in the correct organisation and region.
2. Apply the approved schema, migrations, RLS policies, storage policies, functions, and secrets.
3. Disable public sign-up and anonymous sign-in; enable manual identity linking.
4. Create approved administrators and users in this tenant project only.
5. Configure email delivery and the exact Site URL and redirect allow list.
6. Create a tenant deployment containing only this project's public Supabase configuration and exact expected hostname.
7. Configure the `<company>.multideck.app` DNS record and verify HTTPS.
8. Configure and test each OAuth provider separately using the tenant project's callback URL.
9. Enable and test passkeys only after the permanent domain is stable.
10. Test sign-in, sign-out, password reset, linked identities, revoked access, and direct deep links.
11. Run explicit cross-tenant denial tests: a user, token, URL, storage path, or API request from one project must not access another tenant's application or data.
12. Record the project's owner, recovery process, credential rotation owner, backups, monitoring, and incident contacts.

Never copy live user data, Auth users, secrets, provider credentials, or storage objects between tenant projects as part of normal setup. Use reviewed migrations and controlled administrative tooling instead.
