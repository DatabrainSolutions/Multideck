# Provisional charge confirmation acceptance

21 September 2026. User authorised adding an existing internal test route and
continuing the fresh-charge confirmation test on JI0991146
(`dd740f94-22cf-4761-882d-bb902f6d3569`).

- Normal localhost UI saved the Air import route AEDXB → GBLHR, matching an
  existing internal test route. No shipment dates were invented. Existing test
  party addresses, Harry Phillips ownership and Wakefield 41 were preserved.
- Missing origin/destination previously blocked confirmation. Completing the
  route allowed the normal status confirmation to save In progress (`open`).
- Finance displays exactly one operational line: TEST-NEW, GBP200 cost / GBP275
  sell, description “Internal test - fresh charge after discard”.
- Read-only database verification found one costing line
  `44908b2d-cd82-47a0-a811-0bca0137d489`, sourced from planning revision 4.
  There is one planning_charges_released event, chargeCount 1, followed by the
  Provisional → In progress event. Both record Lee's current internal user ID
  `4467c131-7068-4a7e-8ebc-e51d2d4af01c`, not the Booking owner.
- Full browser reload retained In progress and the same single GBP200/GBP275
  Finance line. Post-refresh database read confirmed one line and one release.
- Discarded TEST-FRT GBP125/GBP175 did not return. Revision 3 discard history
  remains present. No invoice was raised.

This verifies confirmation and persistence, not every financial report or
concurrent/repeated-request idempotency. No source changes, migration, deployment
or GitHub push were needed. Authorised test-record changes persist in shared
development; the browser app remains localhost. In-progress cancellation remains
out of scope pending the boss's decision. Stop for user review of Finance/Audit.
