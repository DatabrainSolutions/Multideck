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
| Quote model | Structured cargo/equipment retained through snapshots, PDFs and Booking updates | Round-trip and immutable historical-version tests | Typed version cargo foundation tested locally; editor, documents and handover pending |
| Typed operational data | Route, equipment and cargo fields use existing typed structures | API/database round-trip, permissions and audit checks | Pending |
| Submitted Quotes | Readable immutable summary with revision action | Version switching and customer/internal visibility tests | Pending |
| Sea | FCL/LCL, containers, seals, VGM, cut-offs, documents, milestones across directions | Representative import/export/cross-trade flows | Pending |
| Air | AWB, flight legs, ULD, dimensions, chargeable weight, screening, milestones | Representative Air flow without Sea-only fields | Pending |
| Road | Stops, vehicle/trailer/driver, appointments, CMR/POD | Domestic and cross-border flows | Pending |
| Rail and multimodal | Rail references/equipment and per-leg mixed-mode policy | Rail and mixed-mode save/reload flows | Pending |
| Dexter | Read, approved writes and event-driven Watching parity for changed backend capabilities | Matching/non-matching/pause/resume and permission tests | Exact cargo-line read/edit/watch implemented and tested locally; live and broader parity pending |
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
- Repository code for Dexter `update_booking` has a separate older mutation path with only a first-cargo summary. A subsequent read-only live check found that function is absent from development, and its booking action registry currently lists only complete, reopen and send-to-customs. This is concrete deployment-parity drift, not just a UI limitation. Do not claim cargo-line editing or full validation parity through Dexter yet. Add the approved action through the canonical booking save boundary, registry and watches before release. Existing save audit events are retained; browser roles are explicitly denied direct execution of the privileged save function.
- Preview environment repair awaits the user's scope choice; no Vercel project, environment or team setup was changed.

Next: finish stable cargo round-trips and Dexter parity, structured Quote cargo snapshots and summaries, then mode-specific operational records. Do not deploy this migration/UI checkpoint as a completed all-mode platform or report the 95% target achieved.

## Dexter cargo verification checkpoint, 5 September 2026

- Resumed the isolated cargo draft from safety commit `74dca12` on the implementation branch after the source-control checkpoint. This work is not yet pushed or deployed.
- Added an explicit `booking_cargo` read domain and one-field approved edit action using the canonical Booking save and measurements boundaries. Reads contain exact line/Booking identities and update evidence, not prices, margins or raw commercial JSON. Ordinary saves retain other lines and declared values; numeric values, units, safety flags and nullable clears are validated.
- Approval is mandatory in both chat modes and in the database registry. Discovered and corrected the executor's cargo-specific conflict between a newly resolved target and a subsequently recorded explicit approval. Company, intent, session grant, current permissions and stale Booking checks remain enforced. The executor's unrelated action behavior is unchanged.
- The Booking audit records the exact before/after field and operator reason. Replaying a successful prepared action returns its previous result without a second Booking mutation.
- Cargo watches use exact line IDs and notify only. The evaluator emits each distinct changed event, remains quiet on no-op/nonmatching changes, respects pause/resume, and rechecks active ownership and Booking permission. Restrictive owner-history access and the privileged list wrapper also enforce current Booking access without replacing the existing private-support or CRM guards.
- Local PostgreSQL tests execute the actual save, measurements, registered domain dispatch, action, prepared-action executor, approval trigger, watch creation/evaluation, notification insertion and owner RLS. They cover foreign lines/actors/workspaces, invalid and financial fields, stale approvals, dimensions/clears, preserved values, repeated changes, retries, permission loss and history isolation. Auth/permission resolution, unrelated product domains and the broad workspace read use declared isolated fixtures; these are not full live tenant, browser/AI or full RLS deployment tests.
- JavaScript behavior tests exercise mandatory approval, operator edit versus read intent, and exact identity storage in a prepared (not executed) action. Existing Dexter/security contracts are also rerun.
- Focused result: 24 tests passed with no skips. No Deno executable is available in this checkout environment, so a full Edge Function type-check is not claimed.
- Still required before release: full live migration reconciliation, schema advisors, actual user-scoped Dexter chat and watch round trips, and the broader cargo allocation/DG/Quote model work. Adding/removing cargo, financial edits and detailed DG/equipment allocation are explicitly unsupported by this one-field Dexter action until their canonical workflows are completed.
- Vercel read-only verification: merged `dev` commit `390de336ae6003228fe91ffce4c63218331be621` is READY as `dpl_7k1PA1WhsHX2EURAiciDMCK6vCvT`. This proves successful deployment of the previous integrated client checkpoint, not the new local cargo action or database migration. Earlier feature-branch environment failure remains distinct; no team/project configuration was changed.

## Structured Quote cargo foundation, 5 September 2026

- Added an unapplied migration defining `quote_api.version_cargo_lines`: typed quantities, weights, volume, dimensions, package type, commodity, origin, HS code and basic safety flags, keyed by Quote version and stable cargo-line ID. Commercial values and detailed DG/allocation records are not silently folded into this shape.
- The existing version snapshot remains immutable evidence. Triggers validate/project structured `quote.shipmentFacts.cargoLines` atomically. Draft saves keep the existing version ID, update surviving line IDs in place, remove only omitted draft lines, and cascade only the legacy helper's transient draft version. Submitted versions retain their original snapshot and lines.
- Incomplete descriptions can autosave but cannot cross the submitted-version boundary. Numeric, flag, identifier, duplicate, unit, country-code and unsupported-field errors reject the whole save. Legacy flat snapshots are not rewritten or split into guessed allocations.
- The table has RLS, no browser grants and no independent application-role write permission. Only internal version triggers write its projection; service-role read access is private and is not an authorisation boundary for a future API.
- Real disposable PostgreSQL test executes the new migration, existing immutable-version guard and current customer-identity/draft-collapse function. It covers repeat saves, reordering, linked-record preservation, a revised version, immutable history, incomplete draft/submission, invalid-save atomicity and role denial. The older broad Quote save is an explicit fixture; full tenant save, browser, send, conversion and live advisors remain unverified.
- Focused verification: 14 tests passed, zero failed, zero skipped, combining the new Quote PostgreSQL lifecycle with Booking cargo approval, Booking/PostgreSQL watch lifecycle and Dexter security tests. No client UI changed in this checkpoint; no fresh browser or client-build proof is claimed.
- **Not a release-ready structured cargo feature yet:** Quote UI/payload mapping, header/snapshot consistency, pre-send readiness, PDF/public response rendering, initial Booking conversion and accepted-revision comparison/apply must all use the same lines before enabling it. Current Booking revision conversion still builds one summary cargo row. Do not deploy or expose this partial feature as complete.
- Explicit temporary Dexter exception: individual Quote cargo read/edit/watch is unsupported until canonical line-level handover and permission-safe adapters are connected. The prompt now states this limit rather than treating a Quote summary as line-level evidence. Existing Quote lifecycle and Booking cargo capabilities are unchanged; no new recurring AI evaluation was added.
- Additional evidence found while tracing documents: `quotePdfDataset` currently prefers today's payer CRM terms over the version's saved terms. Historical PDF rendering must be corrected to use issued-version commercial evidence, with a regression test for later payer changes. No terms correction is claimed in this checkpoint.
- Next work remains structured cargo throughout the editor, snapshots, document/readiness and Booking paths, followed by operational mode depth and controlled live parity. No percentage or overall completion claim is justified by this foundation test.
