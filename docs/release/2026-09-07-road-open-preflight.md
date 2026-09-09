# Road opening preflight — 7 September 2026

Follows [local implementation](2026-09-07-road-draft-open-local.md) at `a149261`.
No migration, function deployment, external message or hosted business write
was performed in this preflight.

## Rendered Chrome evidence

`supabase/tests/tools/verify-road-opening-browser.mjs` bundles the actual
`DomesticRoadBookingPage` and `BookingOpenPage`, shared controls and compiled
application CSS. It substitutes only explicitly labelled language/environment
and Booking transport fixtures. Headless Google Chrome uses an isolated profile;
all non-local requests are blocked and asserted absent.

Both en-GB and en-US contexts pass with reduced motion:

- Legacy-link explanation makes no create request; keyboard Return opens Road
  control. Layout fits 320/768/1280 widths.
- A synthetic opening failure appears in the real alert/retry surface. Keyboard
  retry sends the same request key and Road context, then follows the returned
  Booking reference exactly once under React Strict Mode.
- While the opening request is pending, leaving unmounts the page. Resolving
  it afterwards does not navigate back; only one request was made.
- No observed browser console/page errors or external requests.

The first rendered run found a real 5px overflow at 320px on the error button
row. Adding the existing `flex-wrap` utility fixed it; the passing run uses the
corrected page. A later test locator was ambiguous because the existing loader
and outer loading region both expose status; it was narrowed to the observed
opening message without changing application behaviour.

The mobile screenshot was visually inspected at
`/tmp/multideck-road-preflight.39ujrV/road-error-mobile.png`. It shows the
explicit synthetic error and both wrapped recovery buttons. The harness's
Leave fixture control is not product UI. This is rendered-page evidence, not
an actual tenant request, screen-reader session, full app navigation or hosted
save/reload test. Normal-motion/zoom and full Road board interactions are not
newly certified here.

Nine focused lifecycle/navigation tests also pass. The preceding complete
client build and Deno/PG lifecycle results remain valid evidence for their
tested scope; a full build was not repeated solely for this existing CSS class.

## Fresh schema and exact migration

A read-only query inspected the development canonical opener and Save wrapper.
Then the existing linked CLI prepared a credential-safe schema-only export of
development project `aqtwypsuijxlnvtxpuxe`. Native PostgreSQL tooling exported
application definitions only; no business rows, Auth identities, storage
objects or credentials were copied into the rehearsal.

- Export: `/tmp/multideck-road-preflight.39ujrV/development-schema.sql`,
  7,953,568 bytes; SHA-256
  `2dbbb450ecaca87ff4cfa9a7a6489157207a2905d3461010fa20a8e0fdcbae36`.
- Exact pending migration: `20260907114906_booking_road_draft_atomic_open.sql`;
  SHA-256 `be04fab1b73f606251ee83f7fad17fed65cb791d5d982068dc3404b4a688c1f2`.
- [Release plan](2026-09-07-road-open-development-plan.json) pins that one file.

The actual schema restores in disposable PostgreSQL 17. The exact migration
applies and the populated preservation rehearsal passes with empty managed
Auth/Storage fixtures. No existing column is excluded from the comparison:
synthetic Quote versions/headers, Booking headers/cargo/equipment/routes/
memberships, watch signals and registries remain identical. Existing canonical
open/save bodies and grants remain identical. The new wrapper is service-only
with an empty search path. The DG and milestone tables are compared too, but
contain no seeded rows in this narrow fixture; do not claim a fresh populated
DG/milestone preservation run from that comparison.

The initial generic after-check failed because it strips columns added by the
old freight chain from the actual side only; today's before-snapshot already
contains them. Road adds no columns. The dedicated Road before/after checks now
compare complete rows symmetrically, including all those columns. Older chain
tests remain unchanged and the narrow plan selects only the Road checks.

This schema rehearsal proves migration compatibility and preservation, not
current-schema Road opening under real Auth or live provider behaviour. The
separate actual open/save lifecycle test retains its declared numbering/Auth
fixtures; neither result substitutes for hosted verification.

## Next release gate

Reconcile incoming Git and remote migration/function drift, then perform the
controlled coordinated development release and exact client-version check.
Verify hosted synthetic Road create, edit, save and independent reload, plus
the relevant denied/missing-record paths. Keep all Quote revision approvals,
deferred work and Customs/iCustoms exclusions unchanged. Kanban stage moves
remain a separately identified non-persisting operational gap.
