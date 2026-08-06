# Multideck Mobile

Android-first React Native client for Multideck App. It shares the web product's calm freight
operations palette, spacing, type scale, radius hierarchy, invite-only authentication, and physical
tenant-isolation model.

## Tenant discovery

The mobile binary does not contain every customer's Supabase key and does not ask the operator for
an arbitrary server URL. On first launch:

1. The operator enters a validated workspace slug such as `dev`.
2. Production requests only `https://dev.multideck.app/.well-known/multideck-mobile.json`.
3. The response must use schema version `1`, identify `dev`, and contain an HTTPS Supabase URL plus
   the tenant's public publishable key.
4. The app creates a Supabase client whose persisted Auth session belongs to that tenant project.
5. Changing workspace signs out locally, releases the client, and removes the saved selection.

Each `multideck-app-{slug}` Vercel build emits its own discovery document from the same environment
already used by the web client. The publishable key is designed for client use; RLS and server-side
authorization remain mandatory. Never add a service-role key to this contract or to the mobile app.

## Local setup

```bash
cp .env.example .env
npm ci
npm run android
```

For an Android Emulator against a local tenant web client, set
`EXPO_PUBLIC_MULTIDECK_DISCOVERY_ORIGIN=http://10.0.2.2:3000`. This override is ignored by production
builds. Configure the local web client with the matching `VITE_MULTIDECK_TENANT_SLUG`, Supabase URL,
and publishable key.

## Adding screens

Add product screens under `src/screens` and register them in the authenticated stack in `App.tsx`.
Shared native components belong in `src/components`; tokens stay in `src/theme/tokens.ts`. General
copy belongs in `src/i18n/index.ts` and warehouse copy in `src/warehouse/i18n.ts`. Directional
layouts must use `isRtl` and keep emails, URLs, codes, and references left-to-right.

## Warehouse handheld workflows

The authenticated mobile shell is designed for Zebra-style scan-as-keyboard devices. Inputs use
large targets, accept scanner suffix Enter, and keep operational codes left-to-right. The first
live warehouse slice uses the existing tenant Warehouse Edge Function for:

- location checks and system-versus-physical stock comparison;
- stock enquiry by SKU, pallet, lot, customer, or location;
- stock-item and pallet lookup;
- pallet moves, including an audited reason when the scanned source overrides the system location;
- pallet consolidation with an explicit destructive-action review;
- open exception review, location-empty reporting, and resolving stock found at its expected location.

Holding-time fee configuration is intentionally not persisted yet. The financial decisions that
must be confirmed before adding its migration and audited API are recorded in
`docs/holding-time-fees.md`.
