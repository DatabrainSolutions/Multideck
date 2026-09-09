# Road opening development release — 7 September 2026

Target: development project `aqtwypsuijxlnvtxpuxe` and the existing Git `dev`
deployment. No shared Vercel/team/environment/domain setting was changed.

## Reconciliation and backend verification

- Incoming `0189b58` / `32ea189` were merged cleanly as
  `fdbb9ba9c0e5b88e9edf2e51ce61a72c56d2416a`. Teammate finance/navigation and
  Customs-readiness edits were preserved exactly; the latter file matches
  incoming dev. This Road change does not author a Customs modification.
- Merged client TypeScript/Vite build passes with existing chunk warnings.
  Log: `/tmp/multideck-road-merged-build.log`.
- Downloaded all 26 source files for the two affected live functions and
  compared against pre-release origin/dev: no mismatch. Remote migration
  inventory retains the prior teammate lifecycle identities unchanged.
- Isolated CLI dry run listed exactly
  `20260907114906_booking_road_draft_atomic_open.sql`, matching the pinned
  [plan](2026-09-07-road-open-development-plan.json). Applied only that migration;
  no seed/role application. Remote ledger presence and service-only RPC grants
  confirmed: anon/authenticated execute false, service_role true.
- Deployed only Booking and Dexter. Downloaded all 26 resulting source files;
  each matches the exact merged release commit. Other function metadata is
  unchanged and no functions were removed.
- Booking **44**, ACTIVE, JWT true; bundle SHA-256
  `0dc04ea221c7f798fb6b1d85bec1818cdb2fbf93359df46527a27e36c0cb139d`.
- Dexter **166**, ACTIVE, JWT true; bundle SHA-256
  `5cfb7efba45f187d22697095ad30ff8c991156128a9d7d3a1aa9cd60c11ad143`.
- Security advisors: 1,555 before and after, no added/removed identities using
  name, level, cache key and metadata. Existing findings are not certified safe.
- Final fetch before push showed no incoming commits. Normal push of exact
  `fdbb9ba` to dev succeeded without force; local and origin/dev were identical.

## Client and hosted gate

Vercel deployment `dpl_CiueGi8XWvHoZxGpteEQSM8FFW49` is **READY** for
exact `fdbb9ba`; immutable URL:
`multideck-app-86nqv38nx-databrain-solutions.vercel.app`.
The approved `dev.multideck.app` alias is assigned with no alias error and serves
`/assets/app-C8-pcupv.js`. A fresh signed-in Chrome tab shows complete saved
Booking references on Road cards, not truncated RD identifiers.

## Hosted creation failed safely — concrete numbering gap

Normal New road job in fresh Chrome tab `1772487987` returned:
**A valid direction is required for a directional reference rule.**
The real alert/retry screen is visible; no success or created reference is claimed.

Read-only SQL confirms the enabled default Booking pattern is
`J{DIRECTION:1}{NUMBER:7}`. The canonical `booking_api.open_booking` calls
the two-argument `allocate_reference(company,sequence)`, which delegates to the
three-argument function with a null direction. The renderer correctly rejects
that null for the DIRECTION token. The Road wrapper cannot set mode afterwards
because reference allocation fails first. This is an existing blank-opener /
directional-numbering incompatibility exposed by the connected Road workflow,
not a reason to change the saved numbering rule or invent Domestic direction.

The local lifecycle fixture explicitly substituted numbering, so it did not
exercise this configuration. The current-schema rehearsal installed the wrapper
and verified preservation but did not execute opening under real Auth. Neither
earlier result proves a passing hosted creation; this failure remains open.

Independent before/after reads show exact full-row preservation:

- Job headers: 77 before/after, MD5 `ded6088661d3914b15d7b98459e5406e`.
- Quote versions: 38 before/after, MD5 `3d895dfb11d9a871affe9f88dbb96831`.

No orphan Road draft was created. No customer, route, transport instruction,
email, document or acceptance was added. Unauthenticated POST to `open-road`
returns HTTP 401; this is not authenticated cross-project denial coverage.

Next: gather explicit direction in the creation workflow and carry it through
the canonical opener/reference allocation without changing the configured rule,
guessing from Road mode, overwriting replays or weakening unknown-versus-known
data. Add executable real directional-numbering coverage before another release,
then retry this retained hosted request through the normal UI. Hosted successful
creation/edit/save/reload and full Road acceptance remain unfinished.
All existing Quote revision approvals and deferred work remain unchanged.
