# Planned schedule labels — development release verified

## Development release checkpoint

Read-only Chrome verification against the local client confirmed the actual
Booking Details summary and Route & schedule form display Planned departure/
arrival, with UTC on editable controls. Desktop screenshot inspection found
the longer labels readable without overlap; the separate milestone explanation
continues to distinguish planned, estimated and actual events. No Booking Save
or other data mutation was performed during this label verification. This is
not a new mobile certification.

Fetched `origin/dev` had advanced to `5209c75` through teammate support and
Finance/ERPNext changes. All ten incoming files were non-overlapping and merged
normally, with no conflict or manual rewrite. Merged client build and 24 focused
tests (including incoming client Finance contracts) passed. No Edge Function or
migration was redeployed by this frontend release.

Normal non-force push advanced dev to
`2ef8927a7e5a242c6b920d2cbd129e8e27314be8`. Existing Git integration created
`dpl_7dhroUCjJGyVGXhE3puTmBQnuVeb`,
`multideck-app-69ac2pdlz-databrain-solutions.vercel.app`, observed BUILDING at
this checkpoint. Await that deployment's exact-version READY/alias evidence,
then verify hosted labels. No Vercel/team/environment setting changed.

Final deployment observation: the same ID is READY at exact
`2ef8927a7e5a242c6b920d2cbd129e8e27314be8`, assigned to `dev.multideck.app`,
with null alias error. A fresh hosted Chrome tab on internal `JI0991132`
confirmed Planned departure/arrival in the Details summary and Planned
departure/arrival (UTC) in both service and routing-step date controls. The
milestone panel still explicitly distinguishes planned, estimated and actual.
No data was edited. This supersedes BUILDING/local-only checkpoints below;
it closes this label correction's development release gate, not broader Rail
or all-product schedule semantics.

During Rail/mixed-leg review, `BookingRouteSummary` and the Route & service
date controls were found displaying ETD/ETA labels while reading and writing
`plannedDepartureAt` / `plannedArrivalAt`. This misleadingly presented planned
dates as estimates. Routing-step date labels also omitted the planned qualifier.

The existing components now say Planned departure/arrival; editable date
labels explicitly include UTC. Variable names match the source. The summary's
no-route fallback no longer substitutes `booking.eta` for an absent planned
arrival. No persistence field, timestamp, migration, estimated/actual milestone,
Quote record, Customs code or service setting changed. Existing styling and
components are retained; this is Multideck-owned operator UI.

Verification: 19 focused schedule, overview rendering and visual-contract tests
pass. Actual summary rendering is checked in en-GB and en-US for UTC rollover,
explicit planned labels, missing plans and no ETA fallback. Existing date/time
helpers still pass fractional preservation, clears and invalid-value checks.
Full client build passes; existing >500 kB chunk warning remains.

The broader `booking-detail-workspace-polish.test.mjs` also produced two failures:
its immediate `activeTab` prop-order regex and its expected `Commercial close-out`
label. Both expected patterns were independently checked against HEAD before
this change and were already absent. The newer overview evidence test explicitly
requires field presence not to be labelled commercial close-out. These unrelated
tests were neither weakened nor repaired here.

Pending: browser layout check of the longer labels, controlled normal dev
release/exact-version verification, and hosted representative Rail/mixed-leg
journeys. This correction does not certify all ETA-labelled product surfaces;
other summaries/register projections require their own source trace. The full
goal and recorded approval holds remain unchanged.
