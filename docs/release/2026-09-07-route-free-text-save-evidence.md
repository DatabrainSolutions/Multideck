# Route free-text save correction

Status: deployed to development; hosted Rail Save, database persistence and full
reload verified. Work stopped at the user's requested usage-saving checkpoint.

## Released checkpoint

Fresh schema-only export SHA-256
`015df8f310eb718492c468196f54f108af1044765f970e419c86108314e0c9d4`
passed the structural rehearsal with the exact release-plan migration hash.
The CLI dry run and actual linked push each contained only this migration;
no roles, seeds, client, Edge Functions or platform configuration changed.
Development migration ledger advanced from 464 to 465.
The live writer now has body MD5 `26d49153d4a86af1f2b5018fd8f2e6e2` and retains
its security-definer setting, empty search path and postgres/service_role grants.
Security advisor comparison by name/level/detail: 1,556 before and after,
zero added or removed findings (not a claim that all existing findings are safe).

Chrome Save on JD0991136 created route
`429ac9ff-b472-4aa7-8ff7-54779e40c2d3`. Read-only SQL confirms Rail mode, exact
synthetic origin/destination/service below, null UN/LOCODE aliases, planned
departure/arrival at 00:00 UTC on 21/22 September, and null actual dates.
Full browser reload followed by Details → Route & schedule shows the same
saved names, service and dates. Quote-version fingerprint remains
`48f5e0efb6d918d4019edbf8d9e47a28`.

### Resume here

Do not repeat the successful migration or basic route persistence gate.
The reloaded Overview and Details summary still show blank origin/destination
despite saved free-text names. Overview calls the planned arrival ETA. Trace
those projections/labels next without inventing estimated dates. Hosted invalid
location recovery, mixed Road/Rail legs, equipment/cargo and remaining wider
acceptance gates remain unfinished. No new work should start until the user
resumes the goal; user requested a pause to retain usage for other projects.

The earlier sections below retain the pre-release diagnosis and local evidence;
their future-tense deployment gate is superseded by this released checkpoint.

## Failure and correction

Hosted synthetic Booking JD0991136 (`5f8e7597-382d-47fc-b1d7-add28ebdecee`)
retains its saved QA reference and Rail mode, but the attempted free-text route
did not persist. Its draft places are INTERNAL QA RAIL ORIGIN and INTERNAL QA
RAIL DESTINATION; planned departure/arrival are 21/22 September 2026 and service
is INTERNAL QA RAIL SERVICE — NOT BOOKED. Reuse this record, not a new Booking.

The editor clears UN/LOCODE aliases to empty strings when a place name is typed.
The canonical route writer coalesced the code before trimming/testing it, so a
blank code masked a valid name. The actual PostgreSQL regression reproduced
`Each routing step needs an origin and destination.` before the correction.

New migration `20260907153932_booking_route_free_text_location_validation.sql`
checks each trimmed code and name independently. It patches exactly the two
expected expressions in the existing function and fails closed if they differ.
It does not replace later route extensions, change grants, introduce a new
capability, or alter Quote evidence. Applied migrations remain untouched.
SHA-256: `aa488be84caee1a735ca11f39b6a654d5092a09b48aa51592cf93127a3dfdb54`.

## Verified locally

`node --test supabase/tests/booking-stable-items-postgres.test.mjs` passes,
with no skipped tests, against disposable PostgreSQL 17 and actual production
save functions. Added coverage verifies blank and whitespace code aliases on
Road/Rail creation, persisted names/null codes, code-only existing-leg updates,
clearing codes back to names with stable identity, and missing-location rejection
without route/audit mutation. The existing suite also exercises Dexter route
reads, approved writes, watches and isolation; those interfaces remain unchanged.
An invalid six-character code typo in the added fixture was corrected to GBFXT;
no production validation was weakened to accommodate it.

Logs: `/tmp/multideck-route-free-text-before.log` and
`/tmp/multideck-route-free-text-after.log` (ephemeral).

## Live boundary and next gate

Read-only development query on project `aqtwypsuijxlnvtxpuxe` confirms the original
validator remains present. Function body MD5 is
`b645e33cc75c02dae05fa52e2dcd1c35`; security-definer, empty search path, and
execute grants limited to postgres/service_role remain in place.

Next: rehearse this exact migration against a fresh schema-only development
export, verify scoped release/advisors, then deploy only this migration under
the existing development-release authority. No Edge/client release is needed
for this validator fix. Verify hosted Save, database values, full reload and
failure recovery on JD0991136 before claiming the route gate closed.

Rail/multimodal depth remains unfinished. Customs/iCustoms, tracking, PDF-logo,
held Quote-version actions, Road board semantics and all other recorded approval
requirements remain unchanged. This checkpoint does not support 95% completion.
