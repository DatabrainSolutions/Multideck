# Multideck three-product platform

This document is the canonical boundary for Multideck App, Multideck Live, and Multideck Cloud. If another repository document conflicts with it, update that document and follow this one.

## Product map

| Product | Repository | Vercel project | Production hostname | Local port | Data responsibility |
|---|---|---|---|---:|---|
| Multideck App | `DatabrainSolutions/Multideck` | `multideck-app-{tenant}` | `{tenant}.multideck.app` | 3000 | Operator system and sole operational source of truth |
| Multideck Live | `DatabrainSolutions/Multideck.Live` | `multideck-live-{tenant}` | `{tenant}.multideck.live` plus approved custom domains | 3001 | Customer-safe portal over the tenant operational project |
| Multideck Cloud | `DatabrainSolutions/Multideck.Cloud` | `multideck-cloud` | `multideck.cloud` | 3002 | Internal control plane; no freight records |

Every tenant has one operational Supabase project. Its App and Live deployments use different authorised interfaces over that same project. There are no tenant source forks.

`multideck.mobile` is an Android-first native client of Multideck App, not a fourth product or a
control plane. An operator supplies a workspace slug and the mobile client discovers that tenant's
public Supabase configuration from the exact HTTPS App hostname at
`/.well-known/multideck-mobile.json`. The response must identify the same slug. Mobile never accepts
an arbitrary URL, never receives a service-role key, and connects to only the selected tenant's
Supabase project. Switching workspaces signs out and discards the previous tenant client first.

```text
Operator browser -> App Vercel -> tenant Supabase public/App APIs
Customer browser -> Live Vercel -> tenant Supabase live_api projections
Staff browser -> Cloud Vercel -> Cloud Supabase -> Vercel/Supabase management APIs
```

Cloud stores control metadata only. It never becomes a second operational database. Live never creates an independent copy of freight truth.

## Runtime direction

Supabase is the target production backend runtime for Auth, Postgres, Storage, Edge Functions, provider integrations, audit and scheduled work. Existing .NET projects are transitional tooling and parity-test surfaces. Add no new production dependency on .NET. Migrate existing endpoints to Edge Functions/Postgres in reviewed slices, parity-test them, and retire them only after cutover acceptance.

## Deployment identity and build guards

Vercel builds must provide:

- `MULTIDECK_SURFACE=app|live|cloud`.
- App/Live: `VITE_MULTIDECK_TENANT_SLUG`, `VITE_SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`, publishable key, and the exact tenant hostname.
- App/Live Vercel project name: `multideck-{surface}-{slug}`.
- Cloud Vercel project name: `multideck-cloud`.

The build guard verifies the static surface, Vercel project name, slug syntax, and agreement between the configured Supabase URL and project reference. Deployment configuration identifies a tenant; hostname and editable JWT user metadata do not.

## Security boundaries

- App and Live browsers receive only the tenant publishable key.
- Service-role keys, Carbone credentials, Vercel tokens, Supabase management tokens and provider secrets remain in Edge Function secrets or Vault.
- Edge Functions verify the caller through Supabase Auth before privileged queries.
- App authorisation includes workspace/company, office and permission checks.
- Live authorisation includes verified application membership and fixed customer-safe projections. Requests cannot submit SQL, table names, tenant IDs, or customer IDs as authority.
- Cloud requires a verified Supabase Auth user, an active database-backed staff role, and AAL2.
- Ambiguous company, environment, customer, job, document, domain or project identity fails closed.
- Private documents are delivered only by short-lived signed URLs.
- Audit records are append-only and include actor, source, time, operation, outcome, correlation/request ID and material change details.

## App document generation

Carbone is App-owned:

```text
Multideck App UI
  -> authenticated render-document Edge Function
  -> authorised fixed operational query
  -> immutable JSON snapshot in DOCB_RenderJobs
  -> Carbone template/version
  -> private tenant Storage
  -> DOCB_GeneratedDocuments + DOC_StoredObjects
  -> short-lived signed download URL
```

Carbone never connects directly to Supabase. The browser never supplies SQL or a table name. Template codes map to approved, published versions. The exact JSON supplied to Carbone is retained as the audit snapshot. Live can expose a generated file only through a separate `live_api` customer-entitlement endpoint that confirms the signed-in customer may see that job and document.

The implementation and Lee handover guide are in `multideck.server/Backend/Documents/CARBONE_DOCUMENT_BUILDER.md`.

## Cloud control plane

Cloud owns:

- tenant registration and lifecycle;
- tenant operational Supabase project reference and status;
- App/Live Vercel project identifiers and deployment status;
- standard and custom domains, DNS instructions, verification, certificate and preferred URL;
- provisioning operations and idempotent steps;
- service and connection health;
- secret references and rotation state, never secret values;
- immutable administrative audit events.

Management mutations execute only from Cloud Edge Functions. Provisioning uses idempotency keys, returns an operation ID, records every step, and is safe to retry. Provider calls remain disabled until reviewed credentials and an explicit provisioning feature flag are present.

## Custom Live domains

A custom hostname attaches to the tenant's existing dedicated Live Vercel project. Cloud displays the CNAME/TXT records returned by Vercel, polls verification and certificate state, and records the result. `{slug}.multideck.live` remains active permanently. A verified custom hostname can become the preferred link for email and navigation.

Every active origin must be added explicitly to Supabase Auth redirects and the appropriate CORS allowlist. Custom hostnames never dynamically select a tenant: the Vercel project is already bound to one tenant.

## Provisioning sequence

1. Register a tenant slug and display name in Cloud.
2. Reconcile company identity and environment; do not reuse an existing project merely because its name looks similar.
3. Create or link one operational Supabase project.
4. Apply the approved operational migrations, functions, secrets, Auth settings and Storage policies.
5. Create `multideck-app-{slug}` from the common App repository.
6. Create `multideck-live-{slug}` from the common Live repository.
7. Configure surface, slug, project ref, URL, publishable key and exact hosts.
8. Attach the standard App and Live domains.
9. Optionally attach and verify a custom Live domain.
10. Run Auth, isolation, projection, document, domain and health acceptance checks.
11. Mark the operation complete and append the immutable audit event.

Partial failures remain visible as failed steps. A retry reuses the same operation/idempotency key and does not duplicate projects or domains.

## Jenkar hold point

Jenkar's Cloud `supabase_project_ref` remains null until the legal/company identity, existing MultiDeck project ownership, and production environment are unambiguous. Do not move, delete, relink or populate production resources merely from matching names. After review, link the existing operational project rather than creating a competing source of truth.

## Acceptance

- App on port 3000 renders the operator shell and authenticated `/documents`.
- Live on port 3001 renders only the customer portal and has no document-management route.
- Cloud on port 3002 renders the cockpit and rejects users without active staff membership and AAL2.
- Wrong surface, tenant slug, Supabase reference or Vercel project name blocks deployment.
- Cross-tenant, cross-office and cross-customer access fails.
- Live reads only approved `live_api` projections.
- Carbone tests cover authorisation, snapshot, render, private upload, catalogue and signed download.
- Provisioning tests cover retry, duplicate requests and partial failure without touching live provider resources.
- Domain tests cover pending/incorrect DNS, verified TLS, preferred promotion and safe removal.
- Client builds, Edge type checks, transactional migration validation and Supabase security/performance advisors pass before staging.
