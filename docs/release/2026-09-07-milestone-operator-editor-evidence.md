# Milestone operator editor — local checkpoint

Started on `codex/freight-workspace-foundation` at `8b97d6c`. Retained and
completed the two existing untracked editor files. The earlier Job-ref hosted
gate is closed by `2026-09-06-booking-save-response-evidence.md`, not repeated here.

## Implemented

- Booking Details > Route & schedule now renders the reusable editor for each
  exact saved leg, including modes without another operational-details panel.
  Planned, estimated and actual timestamps stay independent. No route-date,
  Quote, Customs or tracking write is introduced.
- Backend dictionary choices, source/editability, previous-mode evidence and
  recent history are preserved. Unavailable data differs from an empty list.
  Voided records are retained; previous-mode facts cannot be repurposed.
- Main Booking draft changes block direct milestone saves. All exact identities
  and optimistic timestamps reach the existing milestone API. Duplicate submits,
  stale reviews and late/wrong-view responses cannot replace the visible workspace.
  Workspace adoption does not invoke the separate Customs refresh.
- Only changed fields are submitted. Untouched offsets, microseconds, whitespace
  and legacy casing stay exact; explicit clears remain explicit. Completion
  requires an actual event time. Recent returned audit entries show operator,
  reason and allowlisted before/after fields, not a claim of complete history.
- Shared controls provide validation focus, busy feedback and modal behaviour.
  Errors retain entries; Cancel/Escape protect drafts. The form remains mounted
  during discard confirmation to preserve incomplete native date segments.
  Unsaved/in-flight browser unload is guarded; Cmd/Ctrl+Enter submits textareas.
- Required gallery source, realistic usage and found-on links are included.
  Its interactive preview has explicit read-only/failure controls and synthetic,
  in-memory saves only. No preview entry is sent to the Booking API.

## Verification

From `multideck.client`, **17 tests pass**, zero failures/skips:

```sh
node --test tests/booking-milestone-editor.test.mjs tests/booking-route-schedule.test.mjs tests/booking-job-reference-edit.test.mjs
```

Twelve milestone tests execute actual helpers and the extracted TSX submit
handler; DOM/hooks/API transport are declared fixtures. Coverage includes UTC
precision, independent dates, clears, validation, old-mode/read-only rules,
selected audit fields, exact payloads, dirty/stale refusal, failure retention,
duplicate submits and late/wrong-view response suppression. Five existing
schedule/Job-ref regressions pass too. Date formatting covers en-GB and en-US.

Chrome at `http://localhost:3000/components?component=booking-route-milestones`
verified the real component's empty state, required-type error/focus, dictionary
selection, native keyboard date entry and synthetic save. Planned
`18 September 2026 10:30 UTC` displayed correctly; estimated/actual stayed blank.
An injected failure retained notes and reason. Keep editing retained them;
confirmed discard restored focus to the exact correction trigger.

At 320 × 740, document width was 320 and dialog client/scroll widths were both
303. Screenshot inspection confirmed stacked fields, no horizontal overflow and
reachable Save/Cancel after vertical scrolling. A mobile correction saved its
note, retained planned time and displayed expected before/after audit values.
Keyboard selection and Cmd/Ctrl+Enter submission also succeeded. Read-only
preview disabled recording. Captured console errors were empty after the
save/correction checks. The temporary viewport override was reset.

Initial testing exposed a partial native-date loss on cancellation. After the
fix, entering just a day triggers confirmation; Keep editing preserves the
visible day segment and native `badInput` state. Explicit discard works.

The local real Booking `JE0991134` was opened read-only against development.
Its Route & schedule section honestly reports unavailable milestone data and
disables Record milestone. No actual Booking save was attempted. The gallery
lifecycle is not hosted persistence evidence.

The final complete TypeScript/Vite build passed with existing large-chunk
warnings. UI/layout/accessibility guidance informed shared-control reuse,
responsive flow, validation focus and draft preservation. React guidance
informed the integration review. This is a Multideck-owned internal surface.

## Remaining gates

Not deployed. The two milestone foundation/parity migrations and matching
Edge/client release need fresh schema/grant/advisor checks, controlled combined
development release and hosted create/correct/reload, approval/watch and denial
evidence. Further browser checks include the complete keyboard focus loop,
200% zoom, screen-reader behaviour, populated provider/old-mode states and en-US
rendered layout. Simulated preview saves do not prove JWT, network persistence,
notifications or cross-project access denial.

All eight clashes and deeper Sea/Air/Road/Rail/multimodal acceptance criteria
remain in scope. JQ20022 V2 send/accept/selective Booking apply and feature-preview
environment repair retain their outstanding approvals. Customs/iCustoms stays
untouched; Live/Sinay tracking, PDF-logo and calculator work remain deferred.
No shared Vercel/team change, email, acceptance or live milestone mutation
occurred. The full 95% target remains unproven.
