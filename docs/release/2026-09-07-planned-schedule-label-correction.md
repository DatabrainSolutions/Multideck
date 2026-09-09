# Planned schedule labels — local correction, not deployed

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
