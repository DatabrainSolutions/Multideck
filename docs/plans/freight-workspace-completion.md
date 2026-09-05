# Freight workspace completion

User objective: `.codex/attachments/38716b06-3475-4178-8ace-87a663210c27/goal-objective.md` in the user's Codex directory. The full scope is all eight clashes plus operational depth across Sea, Air, Road and Rail, with a target of at least 95% supported by evidence. Percentages will not substitute for acceptance criteria.

## Invariants

Keep mutable autosaved drafts and immutable submitted Quote versions; master Quote references and Booking references; manual and secure-link acceptance; latest-link validity; selective accepted-version Booking updates; mode-change confirmation; Booking-only changes never modifying Quotes; PDF and operational audit history; branch-relative directions; separate planned, estimated and actual dates. Tracking connection remains deferred until Multideck Live/Sinay is ready. AI actions require approval and use existing permissions.

## Delivery and evidence ledger

| Workstream | Required outcome | Evidence gate | State |
| --- | --- | --- | --- |
| Deployment | Explain failure, restore affected deployment without altering team setup | Vercel failure logs, successful matching build and route smoke test | Investigating |
| Shared policy | Consistent mode/direction/service/stage choices, field visibility and validation | Behaviour tests across supported combinations and browser checks | In progress |
| Booking Details | Control, Parties, Route & schedule, Cargo & equipment sections with persistent job context | Keyboard, narrow/wide and reduced-motion browser checks | Implemented locally; wide browser checked; narrow/keyboard pending |
| Cargo | Editable multiple lines, dimensions, dangerous goods and equipment allocation | Save/reload, totals, conversion, revised Quote and isolation tests | Multi-line editor and stable item save implemented locally; deeper records/allocation pending |
| Quote model | Structured cargo/equipment retained through snapshots, PDFs and Booking updates | Round-trip and immutable historical-version tests | Pending |
| Typed operational data | Route, equipment and cargo fields use existing typed structures | API/database round-trip, permissions and audit checks | Pending |
| Submitted Quotes | Readable immutable summary with revision action | Version switching and customer/internal visibility tests | Pending |
| Sea | FCL/LCL, containers, seals, VGM, cut-offs, documents, milestones across directions | Representative import/export/cross-trade flows | Pending |
| Air | AWB, flight legs, ULD, dimensions, chargeable weight, screening, milestones | Representative Air flow without Sea-only fields | Pending |
| Road | Stops, vehicle/trailer/driver, appointments, CMR/POD | Domestic and cross-border flows | Pending |
| Rail and multimodal | Rail references/equipment and per-leg mixed-mode policy | Rail and mixed-mode save/reload flows | Pending |
| Dexter | Read, approved writes and event-driven Watching parity for changed backend capabilities | Matching/non-matching/pause/resume and permission tests | Pending |
| End-to-end | Quote draft/send/respond/PDF/Booking/revision/notification lifecycle | Real browser/API/database evidence, controlled test recipients only | Pending |
| Release | Reviewed commits, live schema/function parity, deployment smoke tests | Exact commit and deployed artefact evidence; migration reconciliation | Pending |

## Deployment evidence, 5 September 2026

- Project `multideck-app-dev`, team Databrain Solutions.
- Commit `72a6b6c` succeeded on `dev`: deployment `dpl_AmyJD4yzQa2GAsp5nHzwanJam3b8`.
- The same commit failed on `codex/Prefix-update`: `dpl_694HJVrNTpRs3e38Ss2VNZihJdwF`.
- Failure is explicit: `Multideck App build blocked: MULTIDECK_SURFACE is required on Vercel.` It occurs in the product-context prebuild guard, before TypeScript/Vite compilation.
- Do not remove this guard, copy tenant credentials into source, or alter team settings to hide this error. Verify branch-specific environment availability. No Vercel settings have been changed.

## Current checkpoint

Base `72a6b6c`, recovery tags retained. Implementation branch `codex/freight-workspace-foundation`. Existing integration report records 72 passing focused tests and 55 broad-suite failures already present in parent branches. Those are baseline evidence, not proof of this goal's completion.

## Foundation checkpoint, 5 September 2026

- Shared mode/service policy now drives the active Quote Details and Booking Details views. Rail and specialist modes no longer fall through to Road in register mapping. Sea/rail containers follow the service and actual legs, not just Import/Export. ULD remains a valid Air shipment choice. This is presentation policy; server-side policy and specialist route validation still require reconciliation.
- Shared package vocabulary extracted without changing existing choices. Booking cargo package type now uses it too.
- Booking Details has four context-preserving sections. Multi-line cargo list supports selecting, adding and removing a line with confirmation. Parent draft state keeps edits when changing sections; blank descriptions are blocked before save.
- Source ID and Last updated are factual read-only values. VIN is now cargo data, not a transport vehicle registration. Legacy VIN values that were actually vehicle registrations are not guessed or migrated.
- Found and corrected a save-function identity risk: ordinary saves formerly soft-deleted every cargo/container and inserted replacements. New migration `20260905110317_booking_stable_cargo_equipment_identity.sql` keeps supplied active IDs, checks job ownership, rejects duplicates/stale identities, safely renumbers cargo, preserves unexposed typed fields and JSON, and only soft-retires omitted records. Accepted Quote replacement without item IDs deliberately creates new rows while keeping old history.
- The previous save function body was compared with `pg_get_functiondef` from development project `aqtwypsuijxlnvtxpuxe` and matched before the patch. No live DDL or tenant data changes have been made for this checkpoint.
- Real PostgreSQL regression test creates its own disposable local cluster, executes the migration function and verifies repeated saves, line reordering, foreign job IDs, stale IDs, duplicate IDs, required description, atomic failure, DG/seal links, retained dimensions/VGM/JSON, new rows, soft retirement and audit. Surrounding permission/workspace functions are isolated test stubs: this is not a full RLS, tenancy or end-to-end deployment test. It skips explicitly where PostgreSQL binaries are unavailable.
- Browser proof: added an unsaved second cargo line, edited its description, switched to Route and back, selected the original line and confirmed each description remained independent, then discarded test edits. No live Booking save or customer email was sent.
- Local production build passed. Focused suite: 49 passing tests, including real PostgreSQL behaviour; tests that demanded first-line-only editing and duplicate policy dictionaries were updated to the intended behaviour. Shared Tabs motion scan: zero findings. Responsive/keyboard/reduced-motion runtime checks remain pending.
- Dexter update_booking currently has a separate older mutation path with only a first-cargo summary. Do not claim cargo-line editing or full validation parity through Dexter yet. Reconcile that approved action with the canonical booking save boundary, registry and watches before release. Existing save audit events are retained; no new public write grant was added.
- Preview environment repair awaits the user's scope choice; no Vercel project, environment or team setup was changed.

Next: finish stable cargo round-trips and Dexter parity, structured Quote cargo snapshots and summaries, then mode-specific operational records. Do not deploy this migration/UI checkpoint as a completed all-mode platform or report the 95% target achieved.
