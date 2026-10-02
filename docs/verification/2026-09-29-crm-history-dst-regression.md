# CRM weekly-history daylight-saving regression

The failed `foreign earlier history does not extend coverage` assertion came from the test fixture's time arithmetic. On 29 September 2026, the snapshot correctly returned coverage at `2026-09-07T12:00:00Z`; the test switched its session to `Pacific/Auckland` and recalculated the expected timestamp using calendar-day subtraction. Crossing Auckland's daylight-saving transition produced `2026-09-08 01:00:00+12` (13:00 UTC), one hour later than the stored observation.

The test now uses elapsed-hour offsets for UTC fixture instants and includes actual/expected timestamps in a failure. The earlier foreign-company observation is anchored to the fixture clock too. All existing assertions remain: company isolation, complete loss history after reopening, Sunday/Monday UTC boundaries, partial-week coverage, distinct evidence, current owner/pipeline filters, stage distributions, denied/revoked access and Dexter's canonical snapshot.

Added fixed-clock runs on 29 September and 7 April 2026 to exercise both Auckland daylight-saving transitions regardless of the date CI runs. Only the disposable fixture's pre-series snapshot clock is frozen; the production weekly-series implementation is exercised unchanged. No application, permission, database migration or deployment change is needed.

Verification:

- CRM insight-series suite: 7/7 passed. Final focused clock/UTC cases: 3/3 passed after anchoring the foreign-company observation.
- `PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node supabase/tests/run-data-access-regression.mjs`: passed, with 140 main tests and 9 access-contract tests; zero failures or skips. This includes the supplier finance tests and Finance release manifest.
- `git diff --check`: passed.

The previously reported CRM regression release blocker is cleared. Changes remain local; no deployment was performed.
