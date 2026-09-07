# Road control → canonical Booking, local correction

## Confirmed cause and change

The bounded Road board reads real Booking rows, but its list/card and Kanban
open callbacks used a fabricated `RD-` reference. The mapper discarded the
Booking prefix and all but the last five digits. Different saved references
could therefore share a React/drag identity, and opening a row entered the
sample-backed `DomesticRoadBookingPage` rather than its saved Booking.

The mapper now retains the complete saved Booking reference as the row ID.
Both open callbacks use `job.bookingId` and the existing encoded
`getBookingDetailPath` helper. They enter the same canonical Booking detail
workspace used by the Booking register, including existing server reads,
permission errors, canonical Save, documents, audit and Quote isolation.
No new data writer, permission, database schema or component was introduced.
Existing bounded reads, paging, lane counts and favourite persistence remain.

## Verification

- Six focused tests pass, no failures/skips. The new executable tests run the
  actual TypeScript mapper, route helper and both JSX callbacks. They cover
  differing Booking prefixes and numeric ranges sharing the old truncated
  suffix, exact saved reference navigation rather than display ID, and URL
  encoding. Existing bounded-read/RLS source contracts also pass.
- Full client TypeScript/Vite production build passes with existing large-chunk
  warnings. `git diff --check` passes.
- These are local executable and build checks, not rendered-browser,
  authenticated API, cross-project denial or hosted save/reload evidence.
  No deployment, live Booking mutation or external message occurred.

## Remaining connected Road work

- `/road-control/new` and old `/road-control/RD-…` deep links still enter the
  prototype. Its creation/save success toasts are not database persistence.
  Do not infer a canonical reference from the lossy old ID. Creation must reuse
  the canonical idempotent open/save workflow with explicit Road context; legacy
  links need safe resolution or a truthful unavailable state, not sample data.
- Kanban `moveRoadJob` changes local rows/counts only. Its stage is derived from
  operational progress on reload. Resolve the intended operational transition
  and canonical writer before claiming a drag has saved real progress.
- Run rendered list/keyboard/card and Kanban navigation with a real synthetic
  Road record, then normal edit/save/fresh reload. Verify missing/denied records
  remain the canonical errors and cannot fall back to samples. Batch this with
  the completed creation/deep-link correction and its matching development
  release rather than deploying a separate partial Road workflow now.
- Driver/appointments, CMR/POD, domestic/cross-border and mixed-mode lifecycle
  gates remain in the consolidated plan. Customs/iCustoms remain untouched;
  no tracking, PDF-logo, approval or shared deployment scope is broadened.

UI guidance favoured composing the real Booking workflow and retaining current
controls instead of extending the parallel prototype. This correction is not
completion of Road or the full freight goal.
