# Explicit opening direction — local client checks

Continuation from `27bf231`; the direction implementation and migration remain
unreleased. This evidence does not close the hosted Road
numbering failure.

## Verified in this batch

- `node --test multideck.client/tests/booking-open-lifecycle.test.mjs`: 9 passed.
  Production handlers wait for explicit selection and submission, send all four
  canonical directions unchanged, preserve direction and key on retry, suppress
  late navigation after leaving, and retain separate Road/general request keys.
  The generic cancellation test initially accidentally selected the fixture's
  default Road mode; using the explicit generic fixture corrected that test.
- Deno `supabase/functions/bookings-workflow/core_test.ts`: 8 passed, including
  exact direction allowlist, legacy omission, and malformed-value rejection.
- `supabase/tests/tools/verify-road-opening-browser.mjs`: isolated Chrome passed
  in en-GB and en-US. Native required validation focuses the empty direction
  control without requesting a draft; selecting alone makes no request; keyboard
  submission/retry preserves Cross-trade; delayed Import navigation is cancelled
  after leaving. No horizontal document overflow at 320, 768 and 1280 pixels.
  No console/page errors or external requests. Uses actual page components and
  existing compiled CSS, but synthetic transport and language boundaries.
- `git diff --check`: passed.

## Still required before release

The real-numbering, concurrency, current-schema and application checks below
pass locally. Still reconcile remote drift before any coordinated release.
Finally prove creation/save/reload against the
READY hosted client. These client tests do not establish database persistence,
managed Auth denial, translated copy, or successful hosted creation.

## Subsequent disposable PostgreSQL evidence

`booking-opening-direction-fixture.mjs`, appended to the existing stable-items
PostgreSQL suite, now uses the production sequence/reservation table definitions
and actual reference cleaning, rendering, reservation and allocation functions.
The suite passes with the pending migration. It first reproduces the exact old
missing-direction error and verifies no draft, audit or reservation was retained.
After applying the pending migration it verifies I/E/D/C references on a shared
counter, persisted direction/Road mode, replay preserving later operator changes,
unchanged pre-existing Job rows, invalid-direction/wrong-actor rejection, a
non-directional legacy overload, reserved-reference collision avoidance, and
service-only adapter grants. An injected canonical-save failure preserves the
full Job/audit/reservation/counter state through rollback.

The first run encountered an already-existing Company fixture table; the new
fixture now augments that existing table instead of recreating it. No production
code was changed to accommodate the test. Managed Auth and collision-source table
surroundings remain declared fixtures; concurrent sessions and current hosted
schema remain separate verification gates.

Dexter guidance now explicitly requires operator-selected direction and states
that Road does not imply Domestic. The existing unsupported blank-draft action
and new-draft watch exception remain explicit; no autonomous creation capability
or additional watch promise has been introduced.

Application checks: `npm run build` passed (TypeScript and Vite; existing large
chunk warning remains). Booking endpoint `deno check --node-modules-dir=none
--no-lock supabase/functions/bookings-workflow/index.ts` passed. The initial
default Deno check could not resolve the pinned Supabase package from local
node_modules; the supported global-cache mode resolved it without dependency or
lockfile changes.

## Concurrency and fresh-schema preflight

The PostgreSQL lifecycle suite now also launches eight independent connections:
four share a request key, four use separate keys. It passed with exactly five
distinct drafts/references, one non-reused result for the shared request and ten
canonical creation/save audit events. This is real multi-connection execution,
not mocked promise responses; it is not a load benchmark or hosted Auth proof.

A fresh read-only application-schema export from `aqtwypsuijxlnvtxpuxe` contains
7,955,195 bytes, SHA-256
`783af2f9eeb70818a7c471c68485369dc30f40c430cd77b21af3a24995851728`.
Local artifact: `/tmp/multideck-direction-preflight.Dr7vTm/development-schema.sql`.
No business data, Auth identities or Storage objects were copied.

The populated rehearsal passed using the hash-pinned
`2026-09-07-road-direction-development-plan.json`. It retains full synthetic
Quote/Booking/cargo/equipment/route/membership and registry rows, populated
numbering rules/reservations, and every existing application function body and
ACL except the deliberately replaced private three-argument opener body.
That opener's ACL remains unchanged. New public adapters are service-only with
empty search paths; the new private helper is unavailable to browser/service
roles. DG/milestone snapshots are empty in this narrow fixture, not populated
DG/milestone certification. Managed-service identities remain explicit fixtures.

The rehearsal reporter now lists this migration's actual assertions and fixture
hashes rather than the older generic test path. No old assertions were removed.
`git diff --check` passed. No live migration or Edge/client deployment occurred.

No deployment, tenant records, numbering configuration, Customs/iCustoms,
external messages or approval requirements changed in this batch.
