# Road draft creation and legacy-link recovery — local implementation

## Outcome

`/road-control/new` now opens a real canonical Booking draft with Road mode.
The obsolete local-state Road form, sample documents/audit and success-only
Save/Create handlers were removed from its page. Their source remains in Git
history; no saved data, issued document or operational audit was deleted.
Existing board records already navigate to canonical Booking details through
the [preceding correction](2026-09-07-road-booking-navigation-local.md).

Old `/road-control/RD-…` links cannot uniquely identify a job because the old
mapper dropped prefixes and leading digits. They now explain that limitation
and offer Road control, without showing samples, guessing a Booking or creating
a draft. This is deliberate recovery, not successful legacy-ID resolution.

## Write boundary and retry behaviour

- Pending migration `20260907114906_booking_road_draft_atomic_open.sql` adds a
  service-only wrapper composing the existing `booking_api.open_booking` and
  `public.booking_workflow_save` in one transaction. Only a newly created draft
  receives `{"mode":"road"}`. No route, direction, customer, shipment date,
  Quote, document, cargo or equipment is invented.
- Existing permissions, actor/company resolution, reference allocation,
  idempotency and canonical audit remain authoritative. Save failure rolls
  back opening too. Reused drafts are never reinitialised, including when an
  operator has since changed the mode. No new direct browser table access.
- `bookings-workflow` explicitly allowlists `open-road`, binds the authenticated
  caller and calls that fixed RPC. Generic `open` remains unchanged.
- Road opening uses its own tenant-scoped session request key. Explicit retry
  keeps the key. Effect replay shares one pending request; unmounted consumers
  cannot navigate later or clear the retry key. Storage/request errors use the
  existing retry screen, with an announced error and contextual return action.

## Dexter and Watching scope

Saved Road Bookings retain the existing Booking read, approved-action and
listed exact-record watch interfaces. This change adds no field or watch
condition. **Explicit exception:** opening an incomplete customerless draft is
operator-only. Dexter's existing `create_booking` requires a verified customer
and other inputs; this wrapper is not added as an unreviewed Dexter action.
The prompt directs blank-draft requests to Road control, preserves full saved
references, and forbids claiming a new-draft subscription or saved progress from
a board drag. No recurring model work or autonomous transport action is added.
The older Dexter creation implementation is not newly certified by this change.

## Local verification and limits

- Thirteen focused client/navigation/bounded-board tests pass, no skips/fails.
  Production mapper, API selector, JSX callbacks, page branches and creation
  effects execute against declared hook/transport fixtures. Covers reference
  collisions/encoding, generic versus Road keys, effect replay, cancellation,
  failure/retry, storage denial and legacy-link recovery. Not rendered-browser
  or managed-Auth evidence.
- Seven Edge parser/security tests pass; both complete Booking and Dexter
  import graphs pass Deno checking.
- Actual PostgreSQL stable-items/Dexter lifecycle suite passes with the new
  wrapper, original opener and existing save chain. New assertions cover saved
  Road/draft/unknown direction, canonical attributed events, replay without
  duplicate rows/events, preservation of a later operator mode change,
  unchanged pre-existing jobs, invalid caller/key, service-only grants and
  rollback of both draft and audit on an injected save failure.
- The broad fixture still substitutes managed Auth, numbering and surrounding
  workspace assembly. Its opener prerequisites were corrected to match the
  existing migration: nullable draft customer and active `draft` status. A
  fixture sequence also needed schema qualification under the real opener's
  empty search path. Production validation was not weakened to pass the test.
  Simultaneous requests and hosted cross-user/project denial are not certified.
- Full client TypeScript/Vite build passes with existing chunk warnings;
  `git diff --check` passes. Log: `/tmp/multideck-road-open-build.log`.

UI/accessibility and React guidance kept the existing native controls and
identified lifecycle/error safeguards. No new gallery primitive or styling
system was introduced.

## Release gate

Nothing in this slice is deployed. Next: fresh current-schema/populated
preflight, rendered Road creation/legacy-link and board navigation checks, then
one coordinated development migration/Booking/Dexter/client release and hosted
synthetic create/edit/save/reload/denial verification. Do not claim creation is
live from these local tests.

Kanban stage moves still change local state only; their real operational
transition remains unfinished. Driver/appointments, CMR/POD and representative
domestic/cross-border flows remain open. All full-goal approvals and exclusions
are preserved; no Customs/iCustoms, shared setup or external messages changed.
