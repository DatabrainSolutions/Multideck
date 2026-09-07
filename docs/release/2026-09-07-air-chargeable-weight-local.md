# Air chargeable-weight validation — local foundation only

Pending migration `20260907124841_booking_chargeable_weight_validation.sql`
extends the existing cargo normalizer, preserving all prior numeric checks.
Chargeable weight uses exact decimal string transport and the Quote cargo
upper bound, without silently rounding to gross-weight precision. Omission
stays omitted; null/blank are explicit clears. Malformed, negative, non-scalar,
oversized and over-range input is rejected.

The disposable PostgreSQL lifecycle suite includes the actual public and
canonical save paths. Checks cover zero, high-precision decimals, maximum value,
grouped input, omission, clears, invalid later-line atomic rollback, private
helper privileges and unchanged Quote-version rows. No managed Auth or hosted
Air persistence is certified by this fixture.

**Do not release this foundation alone.** Typed Booking storage and its legacy
projection boundary, revision application, visible line/aggregate semantics,
Dexter read/approved-write/watch parity, current-schema preservation and hosted
Air verification remain required in this body of work. No AWB, screening,
Customs/iCustoms or live data changes have been made.
