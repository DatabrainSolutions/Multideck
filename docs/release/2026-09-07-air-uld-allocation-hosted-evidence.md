# Hosted Air ULD and leg allocation verification

7 September 2026, development client `7947c01`. Signed-in Chrome operator UI
on internal Booking `JI0991132`, job `78313622-1542-4aec-bbb2-c300a7ef5d57`.
SQL was used only for independent reads. This is synthetic planning verification,
not an actual aircraft loading, dangerous-goods or clearance decision.

## Save and full reload

Initial canonical allocation projection showed two cargo lines, one Air leg,
no active equipment and no allocations. Cargo 1
`6a21c245-ba08-4123-9d7f-608ebc441fe9` retained 1,000 packages, 650 kg and 1 CBM;
QA cargo 2 retained unknown quantities.

The real Add ULD flow created `QA-AIR-ULD-20260907` with offered type
`Aircraft container`. Allocation remained disabled until the equipment was
saved. Database identity: `2c3dcc59-ef04-45cb-b37d-d572a7746c20`.

The operator then assigned Cargo 1 to that saved ULD for Air leg
`80fa184b-e0a8-4311-bc49-70b04f3ff23a` (NLAAM → GDGND), using 10 packages,
6.50 kg and 0.01 CBM. Allocation identity:
`5f62144d-b50b-4b30-a034-5385775c54fd`. SQL confirmed exact cargo/equipment/leg
identities and typed values. UI balances were 990 packages, 643.5 kg and
0.99 CBM. Cargo totals remained unchanged; no equipment total was inferred.

A full page reload and fresh Details → Cargo & equipment navigation retained
the ULD number/type, Cargo 1 selection, exact Air-leg scope and all three
allocation quantities.

## Failure and restoration

Changing the allocation to 1,001 packages displayed `Over by 1`. Save was
blocked with the message that allocations exceed the cargo line's recorded
total, and focus moved to the offending packages field. SQL independently
confirmed the saved allocation remained 10 packages, not 1,001.

After restoring the draft quantity, the operator confirmed removal of the
allocation and then only the named QA ULD, and saved. Both confirmation dialogs
explained history retention and initially focused Keep. Final SQL confirmed
both rows retained with their archive flags true. Two equipment-identity and
two allocation-change audit events reference the test identities.

The final allocation projection exactly matches the initial projection: no
active equipment/allocations, same two cargo records/quantities and same Air
route. A second full reload showed no equipment and no quantified allocations,
with Add allocation disabled. All 38 Quote versions retain JSON-ordered full-row
fingerprint `48f5e0efb6d918d4019edbf8d9e47a28`.

## Scope limits

This closes one hosted Air ULD create/save/reload and leg-scoped quantitative
allocation save/reload/over-allocation rejection/archive journey. It does not
prove multi-ULD splits, successive-leg balances, flight schedule editing,
equipment kind changes, hosted Dexter allocation lifecycle or cross-scope
denial. Existing local matrices are separate evidence. AWB and wider mode
depth remain open; Customs/iCustoms, held Quote actions and deferrals untouched.
