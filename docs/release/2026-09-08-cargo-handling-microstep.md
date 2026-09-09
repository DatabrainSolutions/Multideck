# Cargo handling microstep — 8 September 2026

## User feedback amendment — supersedes original Quote gating below

User confirmed their real Quote save/reload retained cargo details and new lines
started independently. New handling selections now default Details TBC to false;
previously saved selections are not changed. Incomplete handling details are
allowed through Quote issue and accepted-snapshot normalisation even without
explicit TBC. Schema/type validation and unrelated Quote readiness remain intact.
Booking still detects missing details independently of the checkbox and blocks
operational readiness and final completion. Migration
`20260908151239_quote_handling_incomplete_allowed` applied to shared development.
Updated PostgreSQL regression passed for incomplete non-TBC issue allowance,
submitted normalisation and retained Booking blocking. No Quote was sent or
converted during these checks. No push or frontend deployment.

## Authority and boundaries

User approved scoped changes to the shared development Quote/Booking database
after confirming they are the only operator working in this area. Frontend stays
local; no GitHub push, Vercel deployment, email, Quote issue/acceptance or revision
apply was authorised as part of this verification. Customs/iCustoms, tracking,
supplier workflow, invoice implementation and PDF-logo work remain untouched.
Earlier keyboard-shortcut edits are preserved, uncommitted.

## Implemented

- Per-cargo-line Hazardous, Temperature controlled, Oversized, Fragile and Food
  grade controls; new lines start with no selections.
- Hazardous and temperature dialogs, acknowledgement, explicit Details TBC.
- Dimensions remain in the existing fields; fragile/food-grade instructions use
  the goods description. Unknown details are not numeric zero or safety approval.
- Optional `handlingDetailsJson` follows the existing version snapshot and initial
  accepted-Quote cargo JSON handover. Booking edits use its existing save path.
- Draft/Open Bookings can retain outstanding details. Deferred database checks
  reject Booked, In transit, Arrived, Delivered, Completed, Ready for invoice and
  Complete with unresolved new handling details. Completion readiness lists them.
- Explicit TBC allows Quote issue; incomplete selected details without TBC do not.
- Existing issued snapshots are not rewritten. Legacy dangerous-goods evidence
  is not automatically copied or certified as complete.

## Shared development changes applied

Project `aqtwypsuijxlnvtxpuxe` only:

- `20260908145528_cargo_line_handling_tbc`
- `20260908145931_cargo_handling_dexter_boundary`

Local migration filenames match the remote ledger. No tables/rows were deleted,
no Quote or Booking test records were changed by the browser verification.
Submitted-version count remained 14 and fingerprint remained
`f08401bc1fca42bcd61a8dc15cb4cb5b` before/after.

## Verification

- TypeScript build check passed.
- Four handling-model tests and nine existing Quote cargo load/save/PDF projection
  tests passed.
- A disposable PostgreSQL test applied the real migrations and checked TBC issue
  allowance, invalid input, safety-flag agreement, all seven blocked statuses,
  resolution, completion readiness and anonymous helper denial. Its surrounding
  tables/readiness scaffold are minimal: this is not a full tenant rehearsal.
- Shared database read-only helper check returned no Quote issue missing items
  for a TBC hazardous FCL line and one outstanding Booking handling item.
- Chrome component-gallery test: negative temperature saved in preview; hazardous
  TBC warning shown; next cargo line had no selections; dialog focus returned to
  its trigger. Screenshot reviewed at desktop size.

## Explicit limits / next verification after user feedback

- This is ready for local Goods interaction review, not full release sign-off.
- Real Quote save/reload, actual accepted-Quote conversion, Booking resolution
  save/reload and status transitions still need end-to-end operator testing.
  Do not issue or accept a Quote merely to manufacture that proof.
- Mobile and en-US browser verification remain outstanding.
- Customer PDF rendering has not been extended to show the new detail payload;
  do not claim the new TBC annotations are already on customer PDFs.
- Provisioning baseline refresh remains outstanding before wider rollout.
- Older hosted frontends may reject the new cargo extension; use the local editor
  for records edited with this feature until a separately approved frontend release.

## Dexter parity exception

The existing single-field adapters cannot faithfully edit or watch this new
multi-field, supplied-requirement record. Their read/action/watch descriptions now
explicitly say the new handling/TBC feature is unsupported and direct operators
to the cargo editor. No permissions, action allowlists or watch fields were
expanded, no recurring LLM calls added, and no safety classification is inferred.
Full Dexter handling read/write/watch support and lifecycle verification are not
claimed complete. This exception keeps this product-review microstep bounded.

Stop for user feedback on Goods before starting another section.
