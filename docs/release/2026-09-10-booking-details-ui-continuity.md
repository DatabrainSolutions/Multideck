# Booking Details UI continuity — local microstep

## Correction after user review

The user clarified that only field appearance should match Quote; the Booking tabs and layout must remain. The continuous-form change below was withdrawn. Control, Parties, Route & schedule and Cargo & equipment tabs, original section order, original section shells and validation tab-selection behaviour have all been restored. The remaining code change only scopes field presentation to Booking Details (labels, input typography and existing shared field tokens). No save or data logic changes remain. Earlier notes below describe the superseded first attempt, not the current UI.

## Scope

Booking Details now follows the Quote's continuous form flow: Job data, parties, Route & service, Goods/equipment and Customer terms. The four inner tabs are removed; the main workspace tabs remain. Existing Quote `CompactSectionShell` supplies section styling, with scoped Booking Details CSS placing labels above fields. Booking's separate payer controls and operational fields are retained; this is not a billing or data-model change.

All existing edit callbacks remain. Cargo weight validation still selects/focuses the failing input; allocation validation scrolls to the visible cargo section. No Customs tab, backend, Quote snapshot, document, save or permission changes.

## Checks

- TypeScript passed and git diff whitespace checks passed.
- 21 of 22 selected checks passed across Details layout, Job reference, route schedule, chargeable weight and allocation tests. The allocation-save fixture failed with `bookingChargeableWeightError is not defined`; the production save handler was not edited.
- Chrome localhost JE0991133 showed the continuous Details sections, saved parties and operational values at desktop width.
- A temporary unsaved Job ref edit exposed Save/Discard. Discard restored JOB-48. Save was not pressed; no test record was persisted.

## User review still required

Review spacing and section order on localhost. Mobile/tablet widths, the full mode-specific workflow matrix and saved persistence were not reverified in this styling step. Overview, top-level header/tab styling and a Quote-like expandable Booking cargo editor are not part of this microstep. No push or deployment performed.
