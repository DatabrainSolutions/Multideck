# Multideck AI Working Instructions

These instructions apply to anyone using AI coding tools in this repo, including Codex, Cursor, Claude, or similar assistants.

## Product Boundary

This repository is Multideck App: the operator application and sole operational source of truth. Follow the [canonical three-product architecture](docs/architecture/three-product-platform.md).

- Keep customer portal product work in `DatabrainSolutions/Multideck.Live`.
- Keep tenant/deployment/domain control-plane work in `DatabrainSolutions/Multideck.Cloud`.
- App owns operational workflows, Carbone document creation, tenant Auth, private operational Storage, integrations and audit.
- Supabase is the production backend target. Treat .NET as transitional tooling/parity code and add no new production dependency to it.
- Run App on port 3000 and deploy tenant projects only as `multideck-app-{slug}`.

## Product Mindset

Build Multideck like a premium, modern freight-forwarding product for real operators.

Prioritise:
- Product quality
- UX clarity
- Speed
- Simplicity
- Maintainability
- Practical shipping

Avoid:
- Generic SaaS templates
- Overengineered abstractions
- Visual clutter
- Random one-off styling
- Code that is clever but hard to understand

The user is a non-technical founder with strong product instincts. Explain decisions simply and focus on the outcome, the product reason, and the user impact.

## Frontend Scope

Keep all client UI work inside `multideck.client`.

Use the existing structure:
- `src/components/ui` for shared UI primitives.
- `src/components/multideck` for Multideck-specific product components.
- `src/pages/components-gallery-page.tsx` for the components page.
- `src/data/multideck-data.ts` for component-gallery metadata.
- Root `design.md` for the current design system direction.

Do not place client components, design docs, or frontend config in the server folder.

## Backend Scope

Multideck has no separate application server. Keep all backend implementation inside root `supabase`.

Use the existing structure:
- `supabase/functions` for Edge Functions and privileged server-side operations.
- `supabase/functions/_shared` for backend-only shared TypeScript.
- `supabase/migrations` for reviewed incremental database changes.
- `supabase/baseline` for the schema-only tenant provisioning snapshot.
- `supabase/tests` for Edge Function and database contracts.

Do not place server credentials, service-role code, Edge Functions,
database migrations, or other backend implementation in `multideck.client`.

## Dexter Capability Parity Rule

Dexter is a product interface to Multideck, not a separate feature that is updated only occasionally. Whenever backend functionality, data, integrations, permissions, or workflows are added or changed, update both **Dexter chat** and **Watching for you** in the same body of work.

For every new or changed backend capability:

1. Add or update Dexter's tenant-safe read support so chat can inspect the new records through an explicit data domain, query function, or capability adapter. Return source identifiers and evidence metadata where accuracy matters.
2. Add allowlisted Dexter write actions when users should be able to change the new data. Reuse the backend's real validation and permission boundary, show the proposed change clearly, require approval by default, and audit the result. Never give Dexter generic table or SQL write access.
3. Add a **Watching for you** event adapter when a meaningful record change could matter to an operator. Watches must react to real database, webhook, provider, or domain events; they must not repeatedly poll an LLM for updates.
4. Keep runtime watch evaluation deterministic and inexpensive. The LLM may translate the user's natural-language request into a validated rule when the watch is created, but ordinary change detection must use stored rules and event signals without additional LLM calls.
5. Update Dexter's capability registry, prompts, mention/search metadata, notification routing, and English descriptions so chat and watch mode accurately describe what is now supported.
6. Apply the same tenant, user, role, provider-mailbox, RLS, and permission boundaries used by the underlying product. A Dexter read, write, or watch must never broaden access.
7. Test the real lifecycle: chat can read the new data; any write is allowlisted, approval-safe, and audited; a watch can be created; a matching change fires once; a non-matching change does not; pause/resume works; and another user or tenant cannot see or trigger the watch.

Do not silently leave a new backend feature unavailable to Dexter. If exposing it would be unsafe, misleading, too costly, or technically unsupported, document that exception in the change and make Dexter return a clear unsupported response rather than guessing or claiming access.

## Component Reuse Rule

When adding any new section, screen, panel, workflow, or UI feature:

1. First check the existing components in `multideck.client/src/components`.
2. Reuse the existing components wherever they fit the job.
3. Compose existing components before creating new ones.
4. Only create a new component when the UI pattern is genuinely reusable or clearly improves readability.
5. Do not duplicate an existing component under a new name.
6. Do not create one-off visual patterns that bypass the design system.

If a new product component is needed, add it in `multideck.client/src/components/multideck`.

## English-Only Interface Rule

Multideck product interfaces, Dexter responses, generated documents, notifications, and system-authored messages must be English only.

- Support `en-GB` as the default and `en-US` as the optional regional English variant.
- Do not add non-English locale codes, translation packs, translated interface copy, or non-English language choices.
- Keep the existing English copy layer where it provides British/American spelling or regional date and number formatting.
- Test new UI in both supported English variants when regional formatting or spelling is relevant.
- Preserve user-entered names, addresses, messages, documents, and other source data in their original form; English-only applies to product-authored interface copy.

English-only support is part of the definition of done. A reusable component or product screen is incomplete if it introduces or depends on a non-English interface locale.

## Components Page Rule

Any new reusable component must also be added to the components page.

Important: full screens, pages, routes, workspaces, and multi-step flows are not components.

Do not add a full screen preview to `/components` and call it a component. For example:
- Do not add `Auth Flow` as one component.
- Do not add `Bookings Table` as a scaled full bookings page.
- Do not add `Booking Detail Workspace` as a scaled full detail route.

Instead, break the screen into its real reusable parts and add those:
- A KPI box is a component.
- A segmented view switch is a component.
- A filter chip row is a component.
- A checklist is a component.
- A sign-in form panel is a component.
- A verification code input is a component.
- A signed-out recap panel is a component.

Before adding anything to `/components`, do a component inventory:
1. Identify the full screen or flow being built.
2. List the smaller UI parts it is composed from.
3. Reuse existing entries where the part already exists.
4. Add only the genuinely new reusable parts to the components page.
5. Keep the full assembled screen on its product route, not as a gallery component.

That means:
- Add the component to the gallery metadata in `multideck.client/src/data/multideck-data.ts`.
- Add or update the preview in `multideck.client/src/pages/components-gallery-page.tsx`.
- Include a plain-English description of when to use it.
- Include the component source code for the Code tab.
- Include a realistic usage snippet for the Usage tab.
- Include quick links to every page or screen where the component is used.
- Make sure it can be inspected from the `/components` route.

The components page is the source of truth for the app's reusable UI system. If AI creates a component but does not add it there, the work is not finished.

When reusing an existing component on a new page or screen, update that component's quick links on the components page in the same change. The goal is that someone inspecting any component can immediately jump to the real product surfaces where it appears.

## Design Rules

Use layout hierarchy before decoration.

Prefer organisation through:
- Spacing
- Typography
- Alignment
- Rows and columns
- Clear visual rhythm

Avoid:
- Cards inside cards
- Containers inside containers
- Random bordered sections
- Dashboard clutter
- Repeated layouts that do not match the workflow

Typography should stay calm and readable. Prefer SF Pro-style system fonts, regular and medium weights, and restrained sizes.

Do not use monospaced typefaces anywhere in the Multideck interface, including identifiers, references, data-element labels, tables, charts, previews, and code samples. Use the app-wide sans-serif stack instead. Do not add `font-mono`, `--font-mono`, SF Mono, `ui-monospace`, or similar monospaced fallbacks.

Use the Multideck design tokens and CSS variables instead of hardcoded one-off colours, spacing, shadows, or radius values.

## Corner Radius Rule

Corners must always nest correctly.

When one rounded surface sits inside another, the inner radius should be smaller than the outer radius by the amount of spacing between them.

Use this relationship:
- Outer radius = inner radius + padding
- Inner radius = outer radius - padding

Example:
- Parent radius: 16px
- Parent padding: 4px
- Child radius: 12px

Avoid using the same radius for a parent and child surface. Matching radii on nested elements make the spacing feel uneven and less premium.

Apply this to cards, panels, buttons, inputs, modals, sidebars, dropdowns, overlays, and any nested UI surface.

## Interaction Rules

Interactions should feel fast, calm, and precise.

Prefer subtle:
- Opacity changes
- Small scale changes
- Smooth easing
- Clear hover and focus states

Avoid loud motion, bouncy effects, excessive animation, or anything that makes the product feel less serious.

## Contextual Top-Bar Action Rule

The top-right primary action must always reflect the page or workflow the operator is currently using.

- Use the active product noun and outcome: `New booking` in Bookings, `New quote` in Quotes, `New account` in CRM Accounts, `New contact` in CRM Contacts, `Goods in` in Goods in, `Goods out` in Goods out, and equivalent route-specific wording elsewhere.
- Never use `New booking` as a generic fallback outside a booking context. If a page has no honest, useful primary action, omit the button.
- Reuse the page's real creation dialog, wizard, validation and permission boundary. The top bar may navigate to that flow or signal the mounted page to open it; it must not duplicate a second implementation or show placeholder success.
- When a page has several closely related primary actions, use one contextual top-bar dropdown in the established style. Inventory, for example, exposes `New warehouse object` and `Report a location empty` from that menu.
- Once a creation action exists in the top bar, do not duplicate it inside the page or table toolbar. Keep table toolbars focused on view switches, import tools, search, filters and columns. A purposeful empty-state action may remain when it helps a first-time user recover from having no records.
- Do not repeat the action on a creation wizard or record screen when that screen already owns the relevant controls.
- Whenever a new route is added, define its top-bar action in English, verify its mobile treatment, and test that activating it reaches the real workflow.

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

## Browser Rule

The user's default browser is Atlas, not Chrome or Safari.

When opening or testing in a browser, assume Atlas unless the user explicitly asks for another browser.

## Final Check Before Finishing

Before saying the work is done:
- Confirm the UI uses existing components where possible.
- Confirm new user-facing text is English and supports the approved UK/US regional variants where relevant.
- Confirm no non-English locale, translated interface copy, or non-English language choice was introduced.
- Confirm any new reusable component appears on the components page.
- Confirm tenant code is connected only to the intended Supabase project and exact hostname.
- Confirm public sign-up remains disabled and no client-side sign-up path was introduced.
- Confirm Supabase Site URL, redirect allow list, provider callbacks, and passkey RP ID match the intended tenant domain.
- Confirm cross-tenant denial checks have been run when auth, routing, storage, or backend access changes.
- Confirm every new or changed backend capability has corresponding Dexter chat read/write support and a Watching for you event adapter where relevant, or a documented explicit exception.
- Confirm watch evaluation is event-driven and makes no recurring LLM calls while idle or while processing ordinary source changes.
- Check that the result still feels calm, premium, and believable.
- Check that nested corners follow the radius rule.
- Run the most relevant local check for the files changed when practical.
