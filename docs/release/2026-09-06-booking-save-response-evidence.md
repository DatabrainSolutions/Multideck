# Booking save response and Job ref correction

## Scope and confirmed causes

The full Booking read already used `workspace_with_document_groups`, which adds
the applied/pending Quote-version metadata and canonical document groups. All
save paths still returned the thinner `workspace_extended` response. Replacing
the screen state after Save therefore removed the Original badge until reload.

Migration `20260906174532_booking_save_complete_workspace_response` makes normal,
allocation-only and combined saves return the same complete workspace as Open.
It preserves the underlying write/permission/stale-check chain and service-only
RPC execution. No Quote application or history rules change.

The hosted test then revealed an independent existing Job ref defect: the input
updated `draftBooking.jobRef` but not `editableDetails.jobReference`, the actual
server allowlisted field. A normal Save at `2026-09-06 17:53:05.622308+00`
returned JOB-49 instead of the test edit; the database override was still null.
The one-line client correction sends that edit through the existing detail
handler. Booking ref and master Quote ref remain locked. This is existing-field
wiring, not a new backend capability or permission surface; Dexter/watch
capabilities are unchanged by this client correction.

## Verification and development database release

- Source migration commit: `5eb2f5a`.
- Migration SHA-256: `48022a0750d39aa6c3dc31458fa97b1dd80396214741bf03c3b7b8f6e8dcb133`.
- Broad PostgreSQL lifecycle suite passed with actual save/version projection
  functions. Normal, allocation-only and combined responses equal Open;
  original/pending, later-applied and standalone cases covered. Submitted
  version rows unchanged; stale allocation, wrong actor and foreign Booking
  saves rejected. Broad Auth/workspace and document fixtures remain explicit;
  this is not a hosted private-storage test.
- 34 document/version/sync/security contract tests passed, zero failed/skipped.
- Retained development-schema rehearsal passed the exact three-migration plan
  in `2026-09-06-booking-save-response-plan.json`. The schema fingerprint is
  `42e3d4bbe8680c4cfed131520517272c56921de497d7f065b2ab3227399f267f`;
  this is the retained pre-cutoff schema, not a new populated-tenant rehearsal.
- Isolated linked CLI dry run listed exactly one new migration. Applied only
  `20260906174532` to development project `aqtwypsuijxlnvtxpuxe`, then confirmed
  the ledger and service-only grants. No roles, seeds or Edge Functions changed.
- Security-advisor identities unchanged: 1555 before/after, zero additions or
  removals. Existing findings are not certified resolved.
- Synthetic JE0991134 full Job-header fingerprint stayed
  `5bb621af6cebe323a1c1dca2fc9265c7` across the schema apply.
- Chrome after the normal Save retains `JQ20022 Original` and Documents shows
  `JQ20022.pdf`, 80 KB, Version 1 in Quote documents; one document total. Applied
  version ID remains `44e4b47b-b9b3-42dd-ad76-30df16a4db66`, no pending version,
  `in_sync`. No customer email or acceptance action occurred.
- Two executed client-callback regressions pass: Job ref reaches the save
  details, locked references/Quote metadata survive, unrelated edits do not
  invent an override, and explicit clearing reaches the existing backend.

## Hosted continuation and restoration, 6 September 2026

The continuation task verified a clean `codex/freight-workspace-foundation`
checkout at `314ffc24205ec0b90158615be6208ca60090b71e`. A fresh fetch confirmed
zero divergence from `origin/dev`. Vercel Git deployment
`dpl_wXG81n8svqfnbVYAgDB7goEMq37r` is READY for that exact commit, with
`dev.multideck.app` assigned and no alias error. The approved hostname serves
`/assets/app-AooACiQa.js`; a fresh signed-in Chrome tab loaded the Booking.
The deployment had already completed before this continuation inspected it;
no duplicate release or Vercel configuration change was performed.

The previous feature-branch deployment `dpl_CT4cuEtVFcFtNeTwipyV8MY9ah84`
at `48cec3b` failed before compilation because its product-context prebuild
guard reported `MULTIDECK_SURFACE is required on Vercel`. This corroborates
the separately recorded earlier Prefix-update failure; the exact notification
that prompted the original request was not newly identified. The successful
dev build retains the guard. Feature-branch environment repair still needs
the recorded scope decision; shared setup was not altered.

Hosted Job-ref verification used only synthetic JE0991134:

- Chrome edited Job ref to `JOB-49 QA RESPONSE TEST` and used the normal Save.
  A fresh reload displayed that value in Overview. A separate database read
  confirmed the exact override and saved timestamp
  `2026-09-06 18:18:39.327369+00`.
- Restoration used keyboard select-all/Backspace in the same field, followed
  by normal Save. The successful response restored the default `JOB-49`;
  another reload retained it. Database timestamp is
  `2026-09-06 18:20:28.861246+00`, with an explicit empty-string override.
  This restores default-reference behaviour; the JSON key is now explicitly
  empty rather than absent/null as before testing. Audit/timestamps are retained.
- Across restoration, all Job-header fields excluding editable details and
  normal update attribution retain MD5 `25d95c4031a9c643f769780c6f6e86b6`.
  Editable details excluding only `jobReference` retain MD5
  `afbf83d727dd54bc70bcc03cf6b9919e`. These comparisons bracket restoration,
  not the earlier first test save.
- Accepted Original version `44e4b47b-b9b3-42dd-ad76-30df16a4db66` still has
  full-row MD5 `5568ecb6e055ac0bd7dead5561a79436`, matching the preceding
  hosted approval/watch checkpoint. The Original badge remained after Save
  and reload. Documents still lists one `JQ20022.pdf`, 80 KB, Version 1.
  No fresh PDF rendering, download or private-storage denial test is claimed.
- The two executed Job-ref callback regressions passed again. The complete
  client TypeScript/Vite build passed with the existing large-chunk warnings.
  Chrome captured no console errors in the restoration tab; a complete network
  trace was not captured.
- Live migration inventory includes `20260906174532`; the canonical Save RPC
  still denies anon/authenticated direct execution and allows service_role.
  Development is ACTIVE_HEALTHY, Booking workflow is version 40 and Dexter
  version 160. Function inventory is not a fresh full source-bundle comparison.
  Security advisors returned 1,555 findings, equal to the previous count;
  finding identities were not compared again and are not certified resolved.

## Remaining verification

Client build, exact Git/Vercel development release and hosted Job-ref
save/reload/restore are now verified as described above. The earlier first Save
proved only metadata retention; the later test proves Job-ref persistence.
No 95% or full-lifecycle claim.
V2 send/acceptance/selective apply still requires the outstanding approval.
Customs/iCustoms, Live/Sinay, PDF logo and future charge calculator remain outside
this change. The test watch remains paused with its two retained events.
