# Freight remaining acceptance — 7 September 2026

This is the consolidated gap review at clean checkout `c256faf`, not a new or
narrower objective. The original eight clashes and all-mode depth remain the
acceptance scope. Historical release reports prove only their stated scope;
their older “pending” paragraphs must not override later evidence.

## Evidence already earned — do not repeat without a relevant change

- [Job ref](../release/2026-09-06-booking-save-response-evidence.md): exact
  `314ffc2` release and hosted normal Save, fresh reload, database override and
  restoration passed. The initial continuation gate is closed.
- [Original Quote issue/acceptance](../release/2026-09-06-quote-issued-acceptance-roundtrip.md):
  controlled recipient received the PDF; secure acceptance created exactly one
  Booking with two cargo lines and two active equipment rows. Accepted-link
  reload did not duplicate conversion. This is not revised-version coverage.
- [Public response boundary](../release/2026-09-06-quote-public-response-boundary.md):
  internal fields positively excluded in RPC and Edge projections; local active
  response tests and hosted terminal-link branding passed. Fresh active hosted
  projection remains part of the controlled revision gate.
- [Milestone lifecycle](../release/2026-09-07-milestone-approval-watch-evidence.md)
  and [setup correction](../release/2026-09-07-milestone-watch-setup-evidence.md):
  hosted synthetic Sea approval, persistence, exact watch and retirement checks.
- [DG operator lifecycle](../release/2026-09-07-dangerous-goods-development-release.md)
  and [DG approval/watch](../release/2026-09-07-dangerous-goods-approval-watch-evidence.md):
  normal persistence, stale conflict, supplied-source fidelity, approval,
  matching/unrelated/no-op changes, pause/resume and retired-target denial.
  These are not all-mode, Full-access or cross-project certification.
- Latest recorded application release is `e186908`, READY, Dexter 165 / Booking
  43; `c256faf` adds evidence only. This review does not newly poll deployment
  state or certify that no remote drift occurred afterwards.

## Eight-clash completion map

| Original clash | Current evidence and remaining gate |
| --- | --- |
| 1. Dictionaries and policy drift | Shared policy and combination tests exist; representative hosted mode/direction/service transitions still required. Do not infer every route uses it. |
| 2. First-line-only Booking cargo | Multi-line and typed allocations implemented; original hosted conversion preserves two lines. DG now connected and hosted-tested. Complete representative mode-specific cargo/equipment lifecycles remain. |
| 3. Flat Quote snapshots | Typed version cargo/equipment, local roundtrips and original hosted PDF/conversion exist. Revised-version acceptance and selective/all apply remain approval-gated. |
| 4. Operational JSON versus typed data | Cargo, routes, equipment, milestones and DG use typed boundaries. Air chargeable weight still reads/writes Booking editable JSON. Existing AWB tables must be traced before introducing another source. |
| 5. Submitted Quote disabled forms | Immutable summary/version model exists and original submitted state was hosted-observed. Revised-version switching, selective apply and history preservation need their complete hosted lifecycle. |
| 6. Scattered mode relevance | Shared mixed-leg policy and equipment-kind checks exist. Full Air/Road/Rail user journeys and irrelevant-field exclusion remain unproven. |
| 7. Release/parity uncertainty | Exact development release evidence exists; checkout is clean on the retained local branch. Preserve teammate migration identities. Feature-preview environment repair remains separately approval-gated. |
| 8. Contract-only verification | Real browser/email/database evidence now exists for original acceptance, Job ref, Sea milestones and DG. Hosted access-denial, revision and representative other-mode evidence still incomplete. |

## Concrete implementation gaps found in current source

### Road: live board opens a prototype detail flow

Development release and hosted blocker: [exact release / numbering failure](../release/2026-09-07-road-open-development-release.md).
`fdbb9ba` is READY, Booking 44 / Dexter 166 match the release, but normal Road
creation fails because the existing blank opener supplies no direction to the
configured `J{DIRECTION:1}{NUMBER:7}` reference rule. No draft was created and
all existing Job/Quote fingerprints are unchanged. Fix explicit creation
direction through canonical numbering next; do not treat deployment as a
successful Road workflow or replace the numbering rule to hide the failure.

Preflight now recorded: [rendered Road opening and fresh-schema preservation](../release/2026-09-07-road-open-preflight.md)
pass within the stated fixture limits. A real mobile error-row overflow was
corrected. Next is remote drift reconciliation and coordinated development
release, followed by hosted synthetic persistence/denial verification. This
does not close the Kanban transition or deeper Road operational gates.

Further local implementation: [Road draft opening and legacy-link recovery](../release/2026-09-07-road-draft-open-local.md)
replace the non-persisting creation page with atomic canonical open/save and
truthful old-link recovery. Local database, client and type/build checks pass;
current-schema, rendered-browser and hosted release gates remain. Kanban stage
persistence and deeper operations are not completed by that correction.

Local follow-up: [canonical Booking navigation correction](../release/2026-09-07-road-booking-navigation-local.md)
connects both board views and preserves full reference identities. Local tests
and build pass; not yet deployed/browser-verified. Creation and legacy deep
links still need correction. Kanban stage moves were also confirmed to mutate
local state only and are not saved operational progress. The initial diagnosis
below is retained to explain the correction, not to claim it remains unchanged.

`multideck.client/src/pages/road-control-page.tsx` loads bounded backend rows but
its card and board actions navigate to `/road-control/${job.id.toLowerCase()}`.
`App.tsx` renders `DomesticRoadBookingPage` for this route. That page resolves
the ID against imported `domesticRoadJobs` sample rows, initialises local sample
addresses/cargo/legs and constructs illustrative documents/audit entries.
It does not load the selected canonical Booking through the Booking API.
Its `saveDraft` and `createRoadJob` handlers only show success toasts (and, for
creation, navigate away); neither persists a record. The creation message even
uses fixed sample reference `RD-10684`. A successful-looking toast here cannot
be counted as saved freight data.

Therefore a live board is not proof of a connected Road detail workflow. This
is a confirmed source-level integration gap; this review did not execute a
hosted Road click. Prioritise connecting existing records and creation to the
canonical Booking workflow, with correct ID mapping, permissions, loading,
not-found/error handling, saves and reloads. Do not replace the board's bounded
backend reads or treat sample audit/documents as real records. Retain useful
Road-specific controls while eliminating the parallel in-memory writer.

### Air: reuse the existing document model deliberately

The baseline contains `AWB_Header` linked by `AWB_JobID`, typed
`AWB_GoodsItems.AWBG_ChargeableWeight`, routing legs, versions, audit and
`AWB_SecurityScreening` linked to an AWB and optional goods item. Screening
includes supplied status/method, regulated-agent snapshots and time. No
`AWB_SecurityScreening`/`AWBSS_` integration was found in the searched client or
Edge source; this is not proof that no SQL integration exists.

Booking's visible `chargeableWeightKg` still comes from editable-details JSON.
Before wiring Air operations, resolve document versus operational ownership,
existing SQL writers and issued-document immutability. Do not silently treat
AWB document weights as interchangeable with Booking planning values, create
an AWB merely to save a Booking field, or infer screening clearance.

### Road/Rail scheduling: existing route and warehouse boundaries

`Job_Routing` already stores ordered origin/destination address snapshots,
planned/estimated/actual pickup/departure/arrival/delivery, vehicle/trailer,
rail service and transport references. Reuse those for leg/stop progression;
do not add duplicate schedule JSON or conflate estimated and actual events.
`WMS_AppointmentSlots` has a Job link, driver and appointment interval but also
requires a warehouse facility. It is not a generic arbitrary road-stop record.
Inspect the warehouse integration before choosing whether a route appointment
is a linked warehouse slot or a genuinely missing operational structure.

## Remaining verification batches

1. Connected Road record/create workflow plus representative domestic and
   cross-border save/reload; then driver/appointments and CMR/POD integration.
2. Air operational/document ownership and connected screening/weight flow;
   Rail/mixed-leg schedule and equipment journey. Include mode relevance and
   existing Dexter read/approved-write/watch parity or an explicit supported
   exception, never a generic bypass.
3. Consolidated hosted security matrix: authenticated wrong-scope/revoked-user
   reads and writes, private documents, prepared actions and watches. Current
   disposable fixtures and unauthenticated 401 checks are not substitutes.
   Use only authorised accounts/projects; do not create credentials or change
   memberships to manufacture a denial test without required authority.
4. Controlled JQ20022 V2 issue, fresh active public response, acceptance,
   selective/all application, mode-change confirmation, stale review and
   history/Quote isolation. **Existing send/accept/apply approval remains held.**
5. Reuse isolated notification queue evidence for timer/retry behaviour;
   verify hosted delivery/readiness/persistence during the controlled response
   flow. Do not rerun the full queue harness merely because this audit changed.

Customs/iCustoms remain untouched. Tracking/Live/Sinay, PDF-logo and calculator
work remain deferred. No shared Vercel/team/environment changes, external
messages, live data changes or reset redemption are authorised by this review.
No 95% claim or new time estimate is supported by this audit.
