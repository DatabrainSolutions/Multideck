# Development freight client release — 6 September 2026

## Release identity

- Repository: `DatabrainSolutions/Multideck`, branch `dev`.
- Published commit: `dac990995856feaa578312c81111bc5cbe58304f`.
- Previous development commit: `129b687e526d95094e376c24ef3a0faff2c74bf1`.
- Integration: fast-forward; 33 commits ahead, zero behind after fetching. No conflicts or upstream commits discarded. Remote SHA verified after push.
- Local recovery tag: `codex/freight-before-client-release-20260906`, pointing to the previous development commit. This is a frontend source checkpoint, not an instruction to roll back the separately deployed database/functions.
- Vercel project: `multideck-app-dev` (`prj_Z8F1DDOmYitMo4Ryl20CfO9tMux1`), existing Databrain Solutions team.
- Deployment: `dpl_9j6QLoTmu1jpR89u1B95LykUyxsi`, Git source, `dev`, Preview target, **READY**.
- Approved site: <https://dev.multideck.app>.
- Immutable deployment: `multideck-app-2pnbbj9bo-databrain-solutions.vercel.app`.
- Both origins served entry asset `/assets/app-hM_86ZHq.js`; the approved site previously served `/assets/app-0TlnHEEa.js`.

The existing Git integration performed the release. No team/project/environment/domain settings, credentials, hostname guards, or production target were changed. The build passed the product-context precheck, TypeScript and Vite; Vercel reported deployment completed at 08:46:38 UTC. Existing large-bundle warnings remain.

## Bounded verification

- Root `node build-deployment.mjs` passed locally.
- 71 focused checks passed, zero failures or skips across three runs: Quote cargo mapping/submitted versions/Booking review/equipment/route operations (31), product-context and routing review boundaries (15), allocation/schedule/mode/route policy (25). These include behavioral and source contracts; they do not replace hosted lifecycle tests.
- Signed-in Chrome, approved development origin, hard reload after READY: accepted JQ20020 V2 renders the new immutable summary. Original JQ20020 remains selectable with `Changes requested`, the original submission timestamp, and its saved 400 packages; V2 retains 450. No version or operational values were edited.
- Quote Documents shows three previously issued PDFs: V2 once and the original twice, with recorded send descriptions. This verifies listing preservation, not fresh generation, file bytes, or delivery.
- Linked Booking JE0991133 opens with master Quote JQ20020 and applied V2. The Details sections are Control, Parties, Route & schedule, and Cargo & equipment.
- Cargo & equipment loads one saved goods line and two separate equipment rows, 40GP and 20GP, with blank individual quantities retained. Shipment value and line value are presented separately; no allocation was invented.
- Route & schedule loads matching ETD/ETA, the Sea leg and optional operational details.
- Booking Documents lists only accepted `JQ20020 - V2.pdf`, one file; the earlier unaccepted version is not carried over.
- Air Booking JI0991132 loads `Add ULD`, chargeable weight and Flight number, without Sea container rows, Vessel or HBL mode controls in the checked sections. Its existing ambiguous legacy `Hazardous` text produces the source-review warning while leaving the saved flags unchanged. This is read-only visibility evidence, not a completed Air/DG workflow.
- Captured browser warning/error logs were empty for these reads. This is a bounded browser observation, not a claim that all backend/runtime logs are clean.
- The immutable Vercel hostname still displays `This deployment is not authorised for this workspace domain.` No sign-in or guard bypass was attempted there.

## Remaining gates

The frontend now matches the reviewed [development backend release](2026-09-06-freight-development-backend-release.json). The Booking client forwards the server review token; no stale-client exception was introduced. Actual selective revision application has **not** been exercised in this smoke test.

Still required: controlled synthetic draft/save/reload/send/response tests, hosted PDF bytes and private Storage access, initial and revised Booking mutations, rejection/idempotence/stale-review boundaries, notification queue/retry behavior, and signed-in Dexter approved-write/watch lifecycles. Sea/Air/Road/Rail/multimodal depth and remaining responsive/accessibility checks stay in scope. No new email, Quote, Booking, acceptance or customer response was submitted by this release verification.

This is a verified development deployment and read-only smoke checkpoint, **not** 95% completion or production certification.
