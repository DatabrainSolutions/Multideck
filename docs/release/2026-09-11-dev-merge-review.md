# Dev merge review — 11 September 2026

- Merged origin/dev `426792c` into `codex/freight-workspace-foundation` as `ecca388`.
- Preserved local styling checkpoint in `fdac923`; resolved the sole conflicted file, `booking-components.tsx`, in favour of incoming dev. That file now matches dev. Unified Quote Goods changes remain.
- No push, deployment, migration application, or browser record writes performed in this review.

## Material changes beyond styling

- Booking Details now uses a continuous form instead of its four inner tabs; main workspace tabs remain.
- Booking edits now autosave after a short delay, with conflict/retry and navigation protections.
- New bookings start Provisional; lifecycle controls support In progress and Complete. Provisional finance restrictions and progression validation are included in database migrations.
- A cargo line without a description blocks ordinary Booking saving until described or removed.
- Incoming changes span 209 files, including Quote workflows, Dexter, email, onboarding, company Live/warehouse access, finance and Customs-related code. This was a bounded Quote/Booking review, not full regression coverage of those systems.

## Verification

- Client TypeScript build check passed using the installed client compiler.
- First focused suite: 35 passed, 1 failed. Included isolated temporary-Postgres provisional lifecycle/migration tests; no shared database writes from that test.
- Existing submitted-Quote test fails on expected `Saved payer`. Both the renderer and test are unchanged by this dev update; not established as a new regression.
- Booking-opening suite: 2 passed, 7 failed because its isolated test fixture lacks the newly introduced Dialog components. This prevents those tests from verifying opening behavior; it does not establish a production Dialog error.
- Local Chrome loaded JE0991133 with source Quote JQ20020 V2, matching displayed route/dates, main workspace tabs and an enabled Booking status selector showing In progress.
- Did not create a shared-database booking, transition status, or edit/autosave a record. End-to-end creation, status persistence and complete cross-feature regression remain unverified in this review.

Next microstep: repair the Booking-opening test fixture, investigate the saved-payer expectation, then agree a disposable-record end-to-end test before declaring a full functional all-clear.
