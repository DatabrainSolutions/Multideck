# Routing cut-offs — local implementation evidence

Status: implemented and tested locally; **not deployed**. The development release remains `f235088`. No tenant database, Edge Function, deployment settings, mailbox, Quote acceptance, Customs/iCustoms or tracking mutation was performed in this checkpoint.

## Operator story and model decision

Booking Details > Routing > a leg's Operational details now has a compact carrier-deadline summary and an editor. Operators enter complete UTC dates/times, apply them into the existing Booking draft, and use the existing save/autosave path. They can explicitly clear a deadline. Unknown times remain unknown; selecting a date does not invent midnight or 09:00.

Three nullable typed `Job_Routing` columns store cargo, documentation and Sea-only VGM cut-offs. They are not duplicated into legacy route JSON. Existing route permissions, ownership checks and transactional save remain authoritative. Omitted keys from older clients preserve stored deadlines. The workspace advertises `routeCutoffsSupported` only after the new database implementation is installed; the client does not offer the editor without that capability.

The existing `Job_RouteMilestones` planned/estimated/actual timestamps remain untouched. A cut-off is a latest permitted task time, not a transport departure or evidence that a task completed. DCSA describes distinct, shipment-specific cargo, documentation and VGM cut-offs that vary by carrier/terminal/service, supporting separate recorded deadlines rather than an ETD-derived default: [DCSA cut-off guidance](https://dcsa.org/newsroom/cut-off-times-in-shipping). Using the same cargo/documentation fields for non-Sea transport legs is a Multideck product decision, not a claim about DCSA or CargoWise's non-Sea implementation.

## Integrity and approval

- Explicit date, time and timezone required at the database boundary. Invalid calendar dates, date-only values, timezone-free strings, impossible offsets and non-string values reject with a product-readable validation error.
- UTC display is independent of the operator's browser timezone. Reapplying an unchanged control preserves the original database timestamp, including six-digit fractional precision.
- Mode changes clear copied deadlines and preserve before/after values, mode, route ID and actor in the existing audit events. The audit screen exposes the full values.
- Dexter's routing read, approved single-field action and deterministic change watches include the typed deadlines. Deadline edit intent is distinguished from inspection and VGM mass changes. Existing exact-record, stale-read, cross-company, approval and retry protections remain in place.
- The database-generated mode approval explicitly lists recorded deadlines that will be cleared and binds their values into its review. A prepared mode proposal from before this migration must be reviewed again; it cannot silently execute against the expanded reset.
- Watches notify on persisted changes only. There is no deadline-breach scheduler, inferred completion, autonomous edit, carrier API or tracking connection.
- Submitted Quotes, accepted snapshots, planned/actual movement dates, documents, cargo and equipment are not replaced by a deadline edit.

## Checks performed

38 unique focused Node test cases passed across:

- `booking-route-operational.test.mjs` (3): actual client updater, strict cut-off input/precision, typed-only storage and prior route persistence/access regression.
- `booking-stable-items-postgres.test.mjs` (1 integration case containing many assertions): disposable PostgreSQL executes the real migration, canonical save, workspace extension, approved action, review binding, audit and deterministic watch machinery. Deadline cases cover offset/precision round-trip, old-client omission, explicit clear, malformed values, invalid-later-leg transaction/audit rollback, company/route denial, approval, replay, matching/non-matching watch behaviour, pause/resume, stale proposals, foreign watches, Sea-only VGM, mode reset/history and retained accepted Quote evidence.
- `booking-cargo-dexter-approval.test.mjs` (25): real approval/intent helpers, including deadline reads versus writes and VGM mass versus deadline intent; broader existing cargo/equipment/routing approval regressions.
- `dexter-security-hardening.test.mjs` (9): existing source security contracts. These contracts are not hosted lifecycle evidence.

Chrome checks used the production cutoff editor, primitives, helper and real draft updater with isolated synthetic state, without tenant/provider requests. Both en-GB/Europe-London and en-US/Los-Angeles passed UTC display, unchanged precision, apply/cancel/clear, incomplete native input refusal, stale-route refusal, mode reset, VGM visibility, read-only controls, keyboard/focus return, 320/768/1280 px layout and 200% zoom. No captured page or console errors. Screenshot visually inspected: `/tmp/multideck-route-cutoffs.png` (temporary local evidence).

The existing schedule browser regression also passed in en-GB and en-US across London, Los Angeles, Kiritimati and New York, including reduced/full motion variants. The client production build passed with existing large-chunk warnings; a later TypeScript check passed after the final client corrections. `git diff --check` passed.

Test limitations: identity resolution and unrelated workspace stages are explicit fixtures. Browser state and database persistence were exercised separately, not as a complete hosted browser-to-Edge-Function-to-database transaction. Screen-reader certification, hosted audit rendering, hosted realtime deadline watches and the full operational workspace layout still require verification. These checks do not establish 95% completion of the broader freight goal.

## Controlled release still required

1. Recheck current branch/remote state and the approved development project's migration/function definitions. Keep team deployment configuration unchanged.
2. Apply `20260906143817_booking_route_cutoff_foundation.sql` only to the approved development database after preflight. Its guarded replacements intentionally stop on unexpected function drift. Do not edit already applied migrations or another tenant.
3. Release the matching App client and `agent-dexter` changes through the existing development process. Do not deploy the deferred Quote-logo function changes as a side effect.
4. Verify the served Git version and a synthetic Booking deadline save/reload, mode review, audit and access denial. Verify hosted Dexter approval/watch behaviour without sending customer communications.
5. The pending JQ20022 V2 email/acceptance test remains separate and still needs its specific approval. Do not send it, accept it or apply that revision during deadline verification.

Road/Rail appointments, Air security/DG depth, wider operational milestones and the remaining full Quote-to-Booking lifecycle evidence remain on the broad goal ledger. Tracking, Customs and calculator integration retain their agreed scope boundaries.
