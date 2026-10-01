# Direct Booking creation: Mode and Direction

Released to shared development with Lee's explicit one-off backend approval. Frontend changes remain local; no GitHub push or Vercel deployment.

## Behaviour

- New booking requires Mode and Direction. It uses the existing Select/dialog styling, keyboard controls and regional English copy layer. No reusable UI component was introduced.
- Mode options come from the active Booking mode catalogue under authenticated Bookings.Write permission, not the Quote catalogue. Browser verification found that Quote choices include Customs only/Docs only, which the active Booking catalogue does not support. Those were not enabled or added to the database by this change.
- New road job keeps Road preselected and fixed. Ordinary New booking offers all active Booking modes.
- One database transaction opens the Booking using the existing creator, branch, billing-entity and reference rules, then saves the selected mode through the existing operational save workflow. Errors roll back the opening; replayed request keys return the original Booking without reassigning its mode/direction/owner or duplicating its audit.
- Older clients omitting Mode retain their existing API route. Invalid/inactive modes are rejected. New mode-aware calls require Direction.
- Dexter creation is explicitly unsupported in chat and unsaved-dialog watches; use New booking. Existing saved Booking mode read/watch capabilities are not changed. Only these limitation sentences were added to the deployed Dexter prompts; no generic write access or new watch capability was introduced.

## Backend provenance

Target: MultiDeck `aqtwypsuijxlnvtxpuxe` only.

| Local migration | Remote version | Name |
| --- | --- | --- |
| 20260919194350 | 20260919194632 | booking_open_mode |
| 20260919194818 | 20260919194846 | booking_open_mode_options |

Do not reapply these files in a bulk migration push: MCP assigned the remote versions shown above.

- bookings-workflow v53 → v54 → **v55** (mode action followed by authoritative options read); JWT verification retained. Retrieved deployed v55 matches all three candidate files exactly.
- agent-dexter v283 → **v284**; two prompt additions patched onto the freshly retrieved deployed source, preserving all 55 dependency files. All 56 retrieved files match the candidate.
- Evidence and saved backend bundles: `/tmp/multideck-opening-mode.vsMtro`.

## Verification

- TypeScript build and git diff checks passed.
- 15 request/Edge-handler tests passed, including mode parsing, authenticated actor routing, options reads, legacy omission and rejection of non-Road mode through open-road. The two ownership/default regression tests also passed.
- Real shared-database rollback checks exercised all ten active modes, saved Direction, Provisional state, initial owner, billing entity, idempotent replay without mutations/extra events, invalid mode rejection, and RPC grants. Rehearsal records were rolled back; database sequences can consume values during checks.
- Chrome localhost: Mode and Direction empty initially; creation disabled with either missing; keyboard typing selected Sea; Export selection enabled creation. 375px viewport screenshot showed both fields/actions fitting correctly; viewport reset afterwards.
- Browser created internal test **JE0991145** (`0452323d-5744-4a74-97c7-5f43c3b951e8`): Sea/Export, Provisional, Lee Wright, Wakefield 41. Database confirmed mode `sea`, direction `export`, status `draft`, owner equals creator, and a billing entity is present. Reload retained these values; no captured browser console errors. Header's existing Sea display alias is OCEAN.
- JE0991145 remains in the system as an internal test Booking; no charges, emails or Customs submission were created. Existing Bookings were not modified. User can now retest creation and ownership reassignment/audit together.

Customs/iCustoms, Quote conversion, charge rules and unrelated colleague work remain unchanged. Approval for this release does not extend to future backend releases.
