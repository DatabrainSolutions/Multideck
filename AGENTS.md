# Multideck working instructions

## Product and code boundaries

This repository is Multideck App, the operator application and sole operational source of truth. App owns operational workflows, Carbone documents, tenant Auth, private Storage, integrations, and audit. Customer portal work belongs in `DatabrainSolutions/Multideck.Live`; tenant/deployment/domain control-plane work belongs in `DatabrainSolutions/Multideck.Cloud`. Read [the canonical architecture](docs/architecture/three-product-platform.md) before changing those boundaries.

- Run App on port 3000; tenant deployments are named `multideck-app-{slug}`.
- Supabase is the production backend. .NET is transitional tooling/parity code; add no new production dependency to it.
- Client UI and frontend configuration belong in `multideck.client`. Shared primitives: `src/components/ui`; product components: `src/components/multideck`.
- Backend implementation belongs in root `supabase`: `functions` for privileged operations, `functions/_shared` for backend-only TypeScript, `migrations` for incremental changes, `baseline` for the schema-only provisioning snapshot, and `tests` for backend contracts. Never put credentials or service-role code in the client. Never edit applied migrations; add a migration.

## Working approach

Build a calm, premium freight-forwarding product for real operators. Prefer clear workflows, simple maintainable code, and existing product language. Explain outcomes and meaningful tradeoffs plainly to a capable, non-technical founder.

- Complete authorized work using reasonable, reversible assumptions. Ask only for consequential missing information or authority; do independent preparation first.
- Preserve concurrent edits and keep changes scoped. Work locally, including Codex tasks; do not create worktrees.
- Use Chrome unless the user requests another browser.
- Read `.agents/memory/project.md` when relevant; treat it as potentially stale and prefer current code/live evidence. Load only relevant documents and skills. Boost OS commands are optional unless explicitly requested; no mandatory `/os` detour.
- Use available tools for authorized external-platform work. Do not modify unrelated code; provide manual steps only when direct execution is unavailable.

## Required policies: read when relevant

These linked files are binding instructions, loaded only for the affected work:

- **Backend capabilities, data, integrations, permissions, workflows, or Dexter:** read [Dexter parity](docs/agent-policies/dexter.md). Update chat and Watching for you together, or document an explicit unsupported exception. Reads/writes/watches must preserve access boundaries; writes are allowlisted, approved by default, and audited. Watch evaluation is deterministic and event-driven, with no recurring LLM calls.
- **UI, branding, emails, documents, notifications, or shared outputs:** read [branding policy](docs/agent-policies/branding.md). Multideck owns the default identity and all security/Admin surfaces. Tenant branding is limited to the allowlist and the personal accent exception. External surfaces ignore individual, stored, browser, and system theme preferences.
- **Auth, routing, tenant setup, deployments, storage, or backend access:** read [tenant/auth policy](docs/agent-policies/tenant-auth.md). Each customer has a separate complete Supabase project. Never substitute a shared tenant database or client-selected project. Keep least-privilege RLS, private storage, server authorization, and audit. Browser configuration contains only the intended tenant's public configuration and fails closed on hostname mismatch. Accounts are invite-only; public sign-up stays disabled; magic links use `shouldCreateUser: false`.

## UI and component system

Before visual implementation, read root `design.md` and the applicable design tokens. Inspect existing components and compose them before introducing new patterns. Use semantic tokens, the app-wide sans-serif stack, restrained regular/medium type, subtle motion, and clear focus states. No monospaced fonts anywhere in the interface, including identifiers and code previews. Nested corners follow `inner radius = outer radius - padding`.

Establish hierarchy through spacing, typography, alignment, and information order. Avoid nested cards and decorative clutter. Design around the operator's primary action, with supporting detail available progressively. Handle relevant loading, empty, disabled, success, and recoverable error states, responsive layouts, and keyboard accessibility.

Every new reusable component must be inspectable at `/components` in the same change:

- Add metadata in `multideck.client/src/data/multideck-data.ts` and a preview in `multideck.client/src/pages/components-gallery-page.tsx`.
- Include a usage description, source in the Code tab, a realistic Usage snippet, and quick links to every product surface using it.
- Update quick links when reusing a component on a new surface. Gallery entries are reusable parts, never scaled full pages, workspaces, or multi-step flows.

## Language and primary actions

Product-authored UI, Dexter responses, documents, notifications, and messages are English only: `en-GB` default, optional `en-US`. Preserve source/user-entered content in its original language. Do not introduce other interface locales or translation packs. Retain the regional English copy layer and test both variants when spelling/formatting is affected.

The top-right primary action must match the active workflow (`New quote`, `New account`, `Goods in`, etc.). Never use `New booking` as a generic fallback. Omit an action with no useful purpose; use one contextual dropdown for closely related actions. Reuse the real creation flow, validation, and permissions. Do not duplicate it in page/table toolbars or on creation/record screens that already own the controls; a purposeful empty-state action may remain. Verify new route actions on mobile and through the real workflow.

## Verification and completion

Run checks proportionate to the changed behavior. For meaningful UI changes, verify the real happy path, a realistic failure, relevant states, responsive layouts, keyboard behavior, and console/network errors; check persistence where applicable. Auth/routing/storage/backend-access changes require cross-tenant denial checks. Backend capability changes require the Dexter lifecycle tests in its policy.

Do not add implementation-mirroring tests for low-impact edits. Once relevant checks pass, broaden or repeat only for new edits, failures, or unresolved risks. Never weaken tests/validation, hide errors, or introduce mock production data to pass checks.

Report what changed, the checks performed, and material limitations concisely. Distinguish implemented, locally tested, connected to live services, deployed, and confirmed live. A build or screenshot does not prove an integration or deployment; verify the live URL/version before claiming it is live.
