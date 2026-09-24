# Warehouse spreadsheet import: Dexter parity

Items and locations created by the reviewed spreadsheet workflow are ordinary warehouse records. The existing `warehouse_reference` domain returns their identifiers and saved values. The existing `create_warehouse_item`, `update_warehouse_item`, `create_warehouse_location` and `update_warehouse_location` actions remain allowlisted and use the authenticated Warehouse service, normal approval and audit boundaries. No bulk-import action or generic table write was added to Dexter.

File parsing, template downloads and bulk import execution through chat are explicitly unsupported. Operators must review the file in the Items or Locations register. The chat prompt and capability registry explain this limitation and link to the registers. Dexter must not convert an attached spreadsheet into an unreviewed sequence of create actions.

Saved rows use the existing `WMS_Items` and `WMS_Locations` database event adapters and the `warehouse` watch capability. Import progress, preview errors, file contents and batch completion have no durable watch source and are explicitly unsupported in the chat and watch compiler prompts and registry. No recurring model calls were introduced.

The warehouse watch evaluator now checks that the owner remains active, linked to an authentication account, in the watch's company, and permitted to read Warehouse. Consecutive distinct `changed` conditions each generate an event; no-op changes do not. The incremental migration preserves other capabilities' evaluator branches.

## Local verification

- `node supabase/tests/run-data-access-regression.mjs`: **38 core cases and 10 selected access contracts passed**, with no skips. PostgreSQL required execution outside the sandbox because its shared-memory allocation is blocked inside it. All databases were disposable and local.
- The new PostgreSQL warehouse fixture exercises the real current item/location event trigger and matcher, the evaluator with its prerequisite cargo patch, and the new warehouse access migration. It verifies multirow inserts, a matching event once per item, non-matching records, repeated field changes, no-op changes, pause/resume, company separation, notification ownership and immediate revocation/inactive/unlinked-owner denial. The fixture creates saved watch rows directly; it does not claim a browser or model-driven watch-creation journey.
- The focused warehouse Dexter contracts pass. The new import exception contract checks that no bulk action was added and both prompts preserve the unsupported boundary. Default approval contracts pass.
- The broader `agent-dexter-contract.test.mjs` run has four unrelated failures in existing Customs prompt wording, a watch placeholder, Home email intent, and Gmail/Outlook scope expectations. These were not changed to hide failures.

No live tenant migration or Edge Function deployment was performed by this parity work. Before deploying the access migration, identify the intended tenant and run role-aware read-only probes before and after applying it. Physical isolation between separate Supabase projects is not established by a local multi-company fixture.

## Spreadsheet workflow verification

The Items and Locations registers now offer import from their top-right creation menus. Download a blank Excel template, fill required fields plus any optional columns, upload for server validation, inspect real source row numbers and values, and explicitly create the reviewed records. Customer and facility are selected once for items; facility and a default location type apply to locations. Required row details are SKU and Description for items, and Code for locations. Existing records are never overwritten. Examples and instructions are separate sheets and never imported.

- Item creation uses one atomic insert. Location creation uses atomic batches of 100 and cached zone resolution; a runtime failure reports which batches were not created. The review tells operators to remove successful rows before retrying corrections.
- A read-only capabilities handshake blocks uploads to older warehouse services that do not support preview. A failed connection prompts a fresh review, allowing duplicate checks to reconcile any already-saved records.
- 11 item import behaviour tests, 11 location tests, and the import Dexter exception contract pass. These exercise actual parsing/validation and route logic with isolated database adapters; they are not live tenant upload journeys.
- 36 nearby warehouse/API contracts pass, including frontend mixed-version safety, preview scope, failed connections, default location type, and warehouse reference bounds.
- Real ExcelJS 4.4.0 generated templates pass binary save/load round-trips: entry sheets remain blank, instructions/examples are separate, and minimal rows preserve text identifiers such as 00001.
- The client production build and TypeScript checks pass. The build reports its existing large-chunk warning.
- Chrome at localhost:3000 redirects to sign-in. Authenticated happy-path uploads, responsive/keyboard dialog checks, live persistence and console/network verification remain unverified. No production fixtures or mock records were introduced to bypass sign-in.

Deployment requires the new migrations, the warehouse and agent-dexter Edge Functions, and the client release. No deployment or live tenant data changes were performed. The migrations affecting watch owner access require the tenant-specific before/after probes described above.
