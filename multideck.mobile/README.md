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
layouts use the English left-to-right interface while keeping emails, URLs, codes, and references readable.

## Warehouse handheld workflows

The authenticated mobile shell is designed for Zebra-style scan-as-keyboard devices (DataWedge
keystroke output with an Enter suffix). Every scan field shows what it expects, checks the scan as
soon as Enter arrives, gives a matched, override or mismatch signal with vibration, and moves focus
to the next step. The on-screen keyboard stays hidden for hardware scanners; the **Type** toggle on
any scan field turns it on for manual entry and is remembered on the device. After a final step
matches, focus is released so a stray trigger pull cannot overwrite it.

The chosen warehouse is remembered per workspace until the operator changes it or signs out.
Home opens on **Scan anything** (location, pallet, order or SKU) and shows live counts for the work
queues. The live slice uses the tenant Warehouse Edge Function, with bounded paging, for:

- receiving booked goods-in orders into a scanned or one-tap dock or staging bay, either
  "everything arrived" or count by scan, with damaged, missing, lot and expiry per line; receipt
  creates putaway work;
- completing putaway tasks by scanning the source and destination;
- completing released pick tasks by scanning the source location and item, in walk order, then
  continuing to the next task;
- shipping only quantities that have already been picked and confirmed;
- location checks with system-versus-physical stock and reporting a location as empty;
- stock enquiry by SKU, pallet, lot, customer or location, and on any stock line: moving part or
  all of it, or putting it into quarantine or marking it damaged with a reason (releasing holds
  stays an office decision on the web);
- pallet lookup with contents, pallet moves with an audited override when the scanned source
  differs from Multideck, and consolidation by scanning source pallets one at a time;
- open exception review: found at the expected location, found elsewhere (scan where), or not
  found (write-off sent to a different user for approval).

Warehouse orders and their commercial source references are created in the Multideck web app. Mobile is the preferred
place for warehouse staff to execute and scan the physical Receive → Put away → Pick → Ship work;
the same operational actions remain available to authorised operators on the web when needed.

Holding-time fee configuration is intentionally not persisted yet. The financial decisions that
must be confirmed before adding its migration and audited API are recorded in
`docs/holding-time-fees.md`.
