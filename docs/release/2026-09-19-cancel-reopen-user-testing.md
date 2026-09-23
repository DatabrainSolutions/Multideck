# Cancel / Reopen: local acceptance testing

Status: backend released; first no-charge connected journey verified and ready
for Lee's local acceptance test. Keep/Discard browser testing remains outstanding.
The localhost app uses a shared backend; opening localhost does not isolate data.
Do not test on a real operational Booking. Choose designated internal test records.
The backend release was subsequently authorised and completed below. GitHub push
and frontend deployment remain outside that approval.

## Completed backend release and first connected test

Target: MultiDeck (`aqtwypsuijxlnvtxpuxe`), 19 September 2026.

- Applied freight-charge migration, then cancellation migration. The deployment
  tool generated history versions `20260919083333` and `20260919083338`; only those
  two exact name/version records were aligned transactionally to repository versions
  `20260915174500` and `20260919080625` to avoid later duplicate application.
- Deployed `finance-accruals` v24, then `bookings-workflow` v51, both with JWT
  verification retained. Retrieved deployed files match the approved local files;
  shared authentication helpers match the prior deployments unchanged.
- Required regression checks: 29 + 10 passed, no skips. Role-aware read probes
  before/after passed for all 12 active internal accounts with identical counts.
- Security advisor WARN counts unchanged. Two additional informational
  RLS-without-policy notices are expected for private cancellation tables: all
  browser/service-role table privileges are revoked; controlled functions own access.
  Existing unrelated advisor warnings were not modified.
- Chrome at localhost:3000, documented QA Booking JD0991142: blank reason rejected;
  cancel persisted after full reload; reopening persisted after full reload as
  Provisional with the price/date review reminder. Initial focus was Go back and
  returned to the action button; controls disabled while saving.
- Database confirmed exclusion from both finance summaries while cancelled,
  two immutable cancellation-history rows, zero costing rows and unchanged
  retained-header hash `90c7b50c73c94a7a63e4c69250456a05` before/after (excluding
  lifecycle marker/status and update actor/time). QA record left Provisional.
- Audit tab visibly shows both cancellation and reopening actions and actor/time.
  Reasons are stored in history/event metadata but the current Audit UI does not
  display that metadata. This is a remaining presentation gap.
- Other observed UI gaps: Attach document remains offered while cancelled, though
  the backend rejects uploads; the progress rail shows Booked 100% while cancelled.
  Do not count these presentation issues as completed. No tracking redesign done.
- Keep/Discard, populated-document view/download during cancellation, narrow
  screens, complete keyboard traversal and refresh-failure recovery remain unverified
  in the connected browser. Isolated Keep/Discard/backend tests are not a substitute.
- No GitHub push or frontend deployment. This is a first-test handover, not final
  acceptance of the entire feature. Earlier preparation sections below are historical.

## Local presentation follow-up

- Lee accepted the header placement and responsive reason-entry microstep.
- Audit now displays saved cancellation/reopening reasons and explicit Keep/Discard
  decisions where recorded. Verified the four existing reasons in Chrome on
  localhost:3000/bookings/jd0991142 without writing to the shared database.
- Cancelled provisional Overview replaces the progress rail with a paused-progress
  message; stored progress is unchanged and the existing rail returns on reopening.
- The Documents header attachment control and hidden file input are disabled while
  cancelled, with guards before opening the picker and starting an upload.
- TypeScript build and git diff whitespace checks passed. Cancelled-state display,
  attachment blocking and restoration on reopening await Lee's next local test.
- These supersede the presentation-gap notes above for implementation only, not
  connected acceptance. No backend changes, push or deployment in this microstep.

## Before handing over to Lee

- Verify attachment UI availability and actual Storage behaviour against the
  enabled backend. Local Edge and document-row protections now pass isolated tests.
- Verify the enabled dialog in the browser: keyboard, narrow screen, validation,
  repeat clicks and refresh failure. These remain unverified.
- Confirm the target development backend and obtain explicit approval before
  applying the migration or deploying either backend function.
- Verify the actual connected save, reload and reopen journey on test records.
- Keep existing Quote Charges work, Customs/iCustoms and tracking unchanged.

## First test: cancel and reopen without charges

1. Open a designated Provisional test Booking with no charges. Record its reference,
   a recognisable goods description and any existing document names.
2. Save any pending edits. Select Cancel booking.
3. First choose Go back: nothing should change.
4. Open the action again. An empty reason must not submit. Enter a test reason and confirm.
5. Expect Cancelled, the same reference and retained details/documents. Refresh:
   it must still be Cancelled. Editing must be blocked; existing documents should
   remain available to view/download.
6. Reopen with a reason. Expect Provisional, never automatically In progress.
7. Refresh again. The same details/documents/reference must remain. Prices and
   dates must be flagged for review, not silently changed.
8. Check Audit for both actions and their reasons. Report any missing evidence.

Stop for Lee's feedback before proceeding to the charge scenarios.

## Second test: Keep / Discard planning charges

Use separate designated Provisional test Bookings with deferred accepted-Quote
charges. Do not add posted invoices or other actual finance records for this test.

- Neither choice should be selected automatically. A choice is required to cancel.
- Keep: cancel and reopen; retained planning charges should remain available.
- Discard: cancel and reopen; discarded charges must not return as working charges.
  Original Quote evidence and cancellation history must remain intact.
- Both cases remain financially excluded while Provisional or Cancelled.
- Actual finance/costing records require Finance review, not this Discard action.

Finance exclusion and full audit evidence need connected verification, not just
checking the status label. Do not progress to In progress merely to test a button:
that changes financial eligibility and needs a separately agreed test.

## How to explain it to colleagues

“Provisional is our draft Booking. If the customer postpones or cancels, cancel it
with a reason; we keep the Booking and its reference for audit. If it has planning
charges, choose whether to keep or discard them. If the customer returns, reopen
the same Booking as Provisional and review the old prices and dates. Discarded
charges do not come back. Existing financial activity needs Finance review.”

## Preparation evidence, 19 September

- Localhost responded successfully on port 3000.
- Twelve focused policy, Edge-handler and disposable PostgreSQL tests passed
  before the additional safeguards below.
- Extended the unapplied migration to protect nested cargo/route details and
  private cargo allocations, and retain the displayed Booking reference after
  reopening. No applied migration was edited.
- Added executable PostgreSQL checks for dimension insert/update/delete/detach
  denial while cancelled, dimension editing after reopening and reference retention.
- After those edits, the database lifecycle suite and all eleven policy/handler
  cases passed. The required shared-data regression runner passed all 29 cases
  plus 10 access contracts, with no skips. Its lifecycle case overlaps the focused suite.
- `git diff --check` passed. No shared records were changed.
- These are isolated database fixtures, not proof of shared-backend or browser behaviour.

## Follow-up: attachment safeguards and read-only deployed compatibility

- Added an authenticated cancellation-state check before Booking document upload
  reservation/storage writes. Missing capability retains older-backend compatibility;
  other state-read errors fail closed.
- Added `Job_Documents` to the cancelled-Booking detail guard. This protects
  document links/content metadata if cancellation occurs after upload starts;
  upload completion then fails and the existing Edge cleanup handles the new blob.
  Storage cleanup itself has not been exercised against the shared service.
- Executable local tests confirm cancelled upload denial before reservation,
  document insert/update/delete denial, preserved document metadata, and restored
  document editing after reopening. All 13 focused cases passed.
- No Customs/iCustoms implementation was edited. The Job document guard deliberately
  applies to writes against a cancelled Booking regardless of the caller.

Read-only checks against `MultiDeck` / `aqtwypsuijxlnvtxpuxe`, confirmed as the
localhost target in `.env.local`:

- Project healthy; deployed `bookings-workflow` version 50 and `finance-accruals`
  version 23 retrieved. Booking function does not contain the new provisional action.
- Cancellation state table/RPCs are absent, as expected.
- All three existing function-body anchors targeted by our migration match live.
- **Release prerequisite:** live `release_provisional_quote_charges()` does not
  include `JobCostingLine_DomainCode`, although the column exists. Migration
  `20260915174500_booking_quote_charge_domain.sql` is not recorded in live migration
  history. Our local tests include this colleague-authored change before cancellation.
- Do not apply only the cancellation migration and claim parity with dev. Agree
  the missing prerequisite with the release owner and verify the combined sequence.
- No shared migration, record mutation, function deployment or GitHub push occurred.

Enabled-dialog browser checks and connected Cancel/reload/Reopen remain outstanding.
This is not a completed user-testing handover.

## Release sequence approval

Lee approved including the existing freight-charge migration in the backend
release sequence. Git records its author and committer as `luk3phillip5`, commit
`eac0ec2` (15 September 2026), “Keep quote charge domain through booking release”.

After remaining readiness checks, the backend sequence is:

1. Apply `20260915174500_booking_quote_charge_domain.sql`.
2. Apply `20260919080625_provisional_cancellation_audit.sql`.
3. Deploy the checked `finance-accruals` function.
4. Deploy the checked `bookings-workflow` function.
5. Verify Cancel/reload/Reopen using designated internal test records from localhost.

This records approval and ordering, not completed deployment. Enabled-browser
checks remain outstanding. GitHub pushes and frontend deployment remain separate
approval requirements.
