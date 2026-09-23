# Freight flow verification — 22 September 2026

## Follow-up verification — 23 September

### Local Chrome mode/guard check

- Restarted Vite on port 3000 using bundled Node (the shell's npm was unavailable).
  JD0991136 initially stayed on Loading booking; a reload recovered it. No captured
  browser console errors; root cause of initial delay not established.
- Rail Details: Rail service, CIM/SMGS and Add Wagon present. Added one incomplete
  draft leg: origin inherited prior destination; switching to Road required the
  change-mode confirmation, then displayed Vehicle registration. Original Rail
  service remained. Missing destination correctly blocked autosave with Not saved
  and a specific validation message. Some automation clicks timed out although
  actions completed; fresh state checks prevented duplicate actions.
- Discarded test changes; full reload showed original single Rail step, service
  and 7 September 16:44 timestamp. No permanent test edits or new handover.
- Domestic Send to customs disabled. Readiness says Domestic bookings do not need
  a Customs declaration, yet shows 26% and missing-field Fix prompts. This is a
  presentation inconsistency to resolve; server eligibility remains blocked.
- Local app and Chrome test tab left open. No application changes, push or release.
  Remaining browser acceptance includes a complete persisted Road/Rail handover;
  database-only creation checks above must not be presented as browser completion.

### Fresh handovers and broader invoice preparation

- Ran `supabase/tests/customs-road-rail-handoff-live-transaction.sql` against
  development `aqtwypsuijxlnvtxpuxe`: all four Road/Rail × Import/Export cases pass.
  Each scenario temporarily hides only internal JE0991148's existing declaration
  inside a subtransaction, supplies internal route/identifier values, exercises
  fresh creation, then rolls all scenario changes back. No existing document is
  replaced. Declaration reference sequence numbers are consumed despite rollback.
- Asserted Road=3/Rail=2, border reference, direction-specific arrival/departure
  reference, draft status, review-required marker, cargo count/HS/net/gross,
  linked original commercial invoice, initiator access and anonymous denial.
  Same-key retry and a second click with a new key reuse the same declaration;
  no duplicate per-user notifications. This is deployed database execution,
  not a browser or external iCustoms test.
- Post-test readback: original declaration `e8462b08-8f4d-4af9-b17a-fa9a9da22c3c`
  remains draft and not deleted. Header/routes fingerprint still
  `589d17fd4274793320ed0df64969e86f`. Scenario declarations/notifications roll back.
- Invoice preparation: `npx --no-install deno test --allow-env --no-lock
  --node-modules-dir=none supabase/tests/invoice-document-normalizer.test.ts`
  passes 12/12 with type checking. Includes 13 accepted extensions, workbook
  hidden-sheet exclusion, merged/wide tables, Unicode/CSV preservation, legacy
  Word fallback and rejection of mismatched/encrypted/macro sources, conversion
  errors, invalid PDFs and excessive page counts. External conversion is mocked.
- Test-only maintenance: explicitly allocate the helper's PDF byte array for
  current TypeScript Response typing; await all rejection assertions. No
  production implementation, package or lockfile change. No push/deployment,
  outbound email or external Customs submission. Local port 3000 was not running
  at the final check; browser journeys still require restarting the app.
- Remaining: browser Road/Rail journey, live multi-format extraction/visual checks,
  final operator walkthrough and separately approved release. Do not equate these
  automated checks with full OCR or end-to-end sign-off.

- Development project `aqtwypsuijxlnvtxpuxe`: inspected deployed readiness and
  handover functions and transport lookup. Road maps to Customs mode 3, Rail 2.
- `customs-road-rail-readiness-live-transaction.sql` passes 8 mode/direction
  eligibility/reference scenarios, 4 actual rejected Domestic/Cross-trade
  handovers, and 2 missing-reference readiness blocks, using internal JE0991148.
  Successful export readiness was checked; import eligibility was checked but
  import completeness was not asserted. No successful declaration creation ran.
- First scenario attempt exposed a fixture assumption: direction is correctly
  recalculated from route/branch, so changing only the direction cannot simulate
  Domestic. Corrected the fixture's origin/destination; no production change.
  All changes rolled back, including the failed attempt. Header/routes fingerprint
  before and after: `589d17fd4274793320ed0df64969e86f`.
- Focused OCR suites now pass 12/12. Correction to the earlier diagnosis:
  MAX_INVOICE_EVIDENCE_BLOCKS was not removed. Node's root CommonJS boundary
  prevented named imports from Edge TypeScript. Test-only in-memory bundling of
  real modules fixes this without changing production packaging or extraction.
  Purchase-order contract now checks current review wording and review timestamp;
  privacy, authentication, evidence-budget and no-invented-field checks remain.
- No production code, backend release, persistent test-data change, email,
  external Customs submission, GitHub push or frontend deployment in this pass.
  Remaining: fresh Road/Rail handover/browser coverage, broader invoice formats,
  final operator acceptance and separately approved release.

Local feature checkout, shared development Supabase `aqtwypsuijxlnvtxpuxe`.
No GitHub push or frontend deployment. Deadline: prototype tested by 26 September.

## Decisions and test scope

- Customer / Billing is always the payer, confirmed by Lee on 22 September.
  Correct future saves/PDFs; preserve already issued evidence.
- Two internal test emails to lee@databrain.solutions approved; both sent and
  delivery verified. Further test sends need fresh approval.
- JQ20029 is a repeat of internal JQ20020, clearly labelled not a live shipment.
  Original JQ20020 remains intact. Existing JI0991146 charges are not changed.
- Customs-ready handover is in scope; no iCustoms submission, tracking, PDF-logo
  redesign, supplier commercial workflow or charge catalogue implementation.

## Implemented and verified

- Shared migration `20260922105749_repeat_quote_save_guard.sql`: existing repeat
  Quotes can save again only with their unchanged original copy provenance.
  Rollback-only save, repeated save, stale/anonymous/source-change checks passed.
- Local charge roundtrip retains stable snapshot line ID, code, customer and ROE
  sources across saves/revisions. Historical selected version uses its own lines.
- Local billing payload uses visible Customer / Billing. Saved address overrides
  survive directory enrichment. Existing same-customer terms remain preserved;
  old hidden-payer defaults are replaced for future working versions only.
- Five focused executable mapping tests pass. TypeScript also passed after the
  final terms-preservation refinement; the earlier full build passed.
- JQ20029 V1: cost GBP100 / sell GBP150. Sent 11:06:13 UTC from
  lee.wright@jenkar.com; received by lee@databrain.solutions, test subject/body.
  JQ20029.pdf stored, browser preview/download successful, 80,825 bytes.
- V1 PDF exposed a legacy hidden payer address. It remains untouched as evidence;
  revised V2 must show the corrected visible customer address.
- Shared migration `20260922111756_quote_acceptance_version_order.sql`: customer
  response version-sync trigger is deferred until transaction end, but Booking
  conversion runs immediately. Accepted status is now recorded on the submitted
  version before conversion so strict charge-origin validation can succeed.
  Existing token/origin/state checks retained; no snapshot/grant/RLS changes.
- Rollback-only real response test passed before/after release: wrong origin
  denied, used link denied, exactly one open Booking, immutable Quote snapshot,
  exact inherited prices and charge origins. Deferred constraints also ran.
- All 40 access regression checks passed. These include current PostgreSQL
  access, charge provenance and deterministic Dexter watch coverage.
  Security adviser fingerprints unchanged (five existing notices, none added).
- Real browser acceptance succeeded: JE0991147 (4fd48d17-03db-496e-a562-aeacb748fc4b),
  In progress, Wakefield 41, Lee Wright, source JQ20029 V1. Charge GBP100/150 and
  accepted Quote PDF visible in Booking. Added TEST-BOOKING GBP20/30 with reason
  through audited Save charges to test independent-line preservation.
- V2 sent 11:22:55 UTC, delivered; PDF 82,598 bytes downloaded. Extracted PDF text
  confirms Demo Organisation 027 and its visible fictional billing address,
  GBP175 sell, version 2. V1 remains available, unchanged.
- V2 accepted via actual emailed response link. Same JE0991147 reused, no new
  Booking; charge prices initially remained GBP100/150 and GBP20/30.
- Real UI review defaulted to Keep for both lines, with Booking-only line locked
  to preservation. Rollback-only execution of an empty decision array proved
  every charge row byte-for-byte unchanged (default Keep).
- Explicit UI Use Quote values applied GBP125/175 to the matched Quote line;
  Booking-only GBP20/30 remained unchanged. Reload and database readback passed.
  Audit expansion includes Lee, the test reason, replace/keep and before/after.
- Non-charge review then explicitly applied the corrected payer. Booking now
  bills Demo Organisation 027 at the same address as V2; source V2, in_sync,
  old payer absent from current UI, accepted V1 evidence retained.

## Outstanding verification/findings

- Manual browser fixture JE0991148 (fad7fe4c-1c4c-4a2f-a155-95306856b6bd),
  created Sea/Export, correctly defaulted to Provisional / Lee Wright / Wakefield
  41. PO INTERNAL TEST 22SEP - CANCEL REOPEN. Added TEST-CANCEL GBP100/150.
  First cancellation exposed CK_Job_Header_customer_after_draft rejecting a
  customer-less draft cancellation. Released guarded incremental migration
  20260922115340_provisional_cancel_without_customer: only cancelled rows marked
  Job_ProvisionalCancelled may omit customer; active/complete requirements stay.
  Forty regression checks pass, including executable constraint cases.
  Browser Keep -> Cancelled -> reopen retained exact GBP100/150 line. Discard ->
  Cancelled -> reopen returned same reference to Provisional with no working
  charges. Audit shows Lee and explicit Keep/Discard reasons. No JI0991146 edits.
  Live history revision 2 retains the complete TEST-CANCEL line (GBP100/150,
  currencies, rates, quantity, code and description) before discard; after rows
  is empty. Database confirms reopened draft, cancellation flag false.
  This repairs the existing lifecycle, adds no new Dexter capability and retains
  its current chat/watch boundaries and audited lifecycle events.

- Initial converted-charge customer readback corrected by
  `20260922114402_booking_quote_charge_customer_readback.sql`: the customer was
  present in quoteCharge metadata but omitted from the Finance projection. No
  conversion or charge rows rewritten. Operator overrides, including explicit
  null clearing, retain precedence. Forty access regression checks pass with
  new executable PostgreSQL cases for inherited, overridden, cleared and absent
  customers. Shared-backend readback using the original retained Quote metadata
  returns Demo Organisation 027; current GBP125/175 values are unchanged.
  A fresh full conversion browser run remains part of final journey verification.
- Booking Documents accepted-Quote open/download gap is now resolved locally and
  against the shared backend; see the verified document-access addition below.
- Customer response PDF remained on Preparing before acceptance (download link
  existed). Confirmed a renderer failure can return an empty array which the
  response screen treated as success. Local fix now reports preview failure and
  retains direct access/download, rather than indefinitely showing Preparing.
  Three executable tests of the real effect pass (success, empty render, fetch
  failure); browser confirmation of the customer-facing failure state remains.
- Existing submitted-summary contract expects legacy saved payer visibility and
  now passes: historical differing payer details are retained in a collapsed
  Historical billing details section. New Quotes still use Customer / Billing.
  All 14 submitted-version and charge-roundtrip tests pass, plus TypeScript.
- Manual Booking and Customs-ready end-to-end evidence still to finish.
  JE0991147 live Customs readiness is 13/16: missing Exporter EORI, vessel/voyage
  or container number, and attached commercial invoice. Packing list optional.
  No handover or iCustoms submission performed. Browser left on this checklist.
  Subsequent source-save browser test exposed SQLSTATE 42725 in
  booking_api.preserve_route_mode_references: nested JSON removal lacked extraction
  parentheses. Released 20260922120140_route_reference_json_operator_precedence,
  preserving all other live function content/permissions. Real save reproduced
  failure in rollback-only probe, then passed after fix; actual browser save also
  persisted. Three route tests pass, including nested evidence preservation.
  Updated stale route fixture ADD COLUMN setup for columns already in baseline;
  no test assertions weakened.
  JE0991147 now uses test EORI GB123456789000 (existing repository test identifier)
  and transport reference INTERNAL-TEST-22SEP-NOT-LIVE. Readiness now lacks only
  commercial_invoice. This is app handover readiness, not legal filing validation.
  A clearly labelled one-page invoice fixture was generated and visually checked
  at output/pdf/internal-test-je0991147-invoice.pdf. Chrome filechooser upload was
  denied by extension file-URL permission; user action requested. No document
  uploaded, declaration created or external submission attempted.
  Trigger correction repairs existing route updates; current audited event and
  Dexter lifecycle/watch semantics remain unchanged, with no new capability.
- Charge-decision Audit now uses the changed-field renderer. Real JE0991147
  expansion shows TEST-FLOW cost GBP100 -> GBP125, sell GBP150 -> GBP175, and
  TEST-BOOKING Kept unchanged. Six charge-audit tests cover replace, preserve,
  delete, restore and editable non-price fields; no backend evidence changed.
- Removed the persistent reopened warning strip as previously requested. Actual
  JE0991148 still displays Provisional and cancellation action without the strip.
  Reopen confirmation, backend review flag and Finance-review warnings retained.
  Twelve combined Audit/lifecycle-policy tests pass.
- Food grade investigation: no data loss. This Quote has no structured cargoLines;
  Food grade is legacy shipmentFacts.cargoCharacteristics and was retained in
  JobCargo_CargoJSON. Booking now exposes this text under Earlier shipment handling
  retained, matching Quote's legacy presentation. Browser JE0991147 Details
  expansion visibly reads Food grade. No inferred per-line safety confirmation.

## Customs attachment visibility — 22 September follow-up

- User manually attached internal-test-je0991147-invoice.pdf to JE0991147;
  live Job_Documents confirms one current received commercial invoice, 2,218 bytes.
- Customs source editor now lists current invoices/packing lists persistently,
  with filename, Attached status and View/Download. Empty state is explicit.
  PDF/image preview and spreadsheet download fallback reuse existing UI primitives.
- bookings-workflow v58 adds read-only attachment-access: authorised workspace
  membership, exact Booking/document association, current/non-deleted child row,
  exact stored-object ID/Booking aggregate, active/private storage and MIME checks.
  No schema, access grants, uploads or document contents changed.
- agent-dexter v288 explicitly excludes attachment binary/private-link reads and
  open/download watches, directing operators to Customs attachments. Existing
  document metadata and workflow/watch capabilities remain unchanged.
- Retrieved deployed files match submitted bundles byte-for-byte; unrelated files
  preserved. Seventeen Edge request tests, forty access regressions, three Dexter
  exception contracts and client TypeScript pass. Anonymous live access returns 401.
- Chrome: filename/status persist after full reload; invoice PDF visibly renders
  on desktop and 390px mobile; Escape closes. Download matches original SHA256
  0fc6ad4cf6cecb6d4e810d6b3cdb656bac90371f81709c149980825ea1485c72.
  Captured browser errors empty. Viewport restored. Storage failures tested at
  handler level, not induced on live Storage. Packing-list branch implemented but
  no packing-list upload made in this follow-up.
- No GitHub push/frontend deployment or external Customs submission.

## Dexter scope

### Internal Customs handover continuation

- Actual handover exposed two existing backend blockers: ambiguous PL/pgSQL
  declaration_id in the grant conflict target, then missing customs_handoff
  sys_CommLinkTypes reference data. Released guarded additive migration
  20260922122801_customs_handoff_grant_conflict_target. Only the three conflict
  targets change to the existing primary-key constraint; missing notification
  type is inserted with ON CONFLICT DO NOTHING. No grant or tenant-rule changes.
- Rollback-only execution proves real draft creation, retry reusing the same
  draft, no duplicate recipient notifications, initiator access and anonymous
  denial. Probe saved as supabase/tests/customs-handoff-live-transaction.sql.
- Browser handover now opens draft export declaration
  26d9c9bf-2e19-4f93-a2cd-6912d0bfd2f3 / MD-CDS-EX-20260922-0064, assigned Lee.
  No iCustoms submission. Existing audited handover and deterministic watch event
  contracts retained; this repairs an existing capability, not a new action.
  Live readback: one linked Customs document, one goods item and three internal
  recipient notifications. Forty access regression checks pass after release.
- Source mapping review is NOT complete: declaration Exporter company displays
  EORI while dedicated EORI is blank; invoice numeric strings retain database
  decimal padding and trigger UI validation (60000.0000, 450.000000). Missing net
  weight appears as zero. Invoice link exists in Booking; declaration document
  viewing still to verify. Do not call this declaration-ready or legally valid.
- Lee confirmed commodity codes, net mass and party country codes must block
  handover for now, pending senior-staff review. Implemented below; never infer
  missing values or treat TBC as completion.
- Attachment UI full production build passes (existing large-chunk warning).
  Subsequent handover guard gives a message instead of silently returning when
  unsaved work/readiness prevents sending; client TypeScript passes afterwards.

These two backend fixes repair existing save/acceptance sequencing and add no new
capability. Existing chat workflow boundaries and event-driven response/watch
signals are retained. No new direct charge-editor Dexter write support is claimed;
the prior explicit unsupported exception remains in force.
The charge-customer readback fix likewise adds no new capability or workflow
event; existing explicit charge chat/watch unsupported boundaries are retained.

The two live rollback fixture scripts deliberately require a still-unaccepted
test Quote/draft. After V1 acceptance they cannot be blindly rerun on JQ20029;
prepare another authorised internal fixture or generalise the runner first.

## Accepted Quote PDF access from Booking — verified addition

- Existing document groups retained; accepted Quote rows now offer Open PDF,
  preview, Download PDF and Open in new tab. Superseded accepted versions remain
  available. No regenerated or overwritten issued PDFs.
- Read-only bookings-workflow v57 authorises through the existing Booking
  workspace, checks exact accepted-document membership and active private PDF
  storage metadata, then signs only the server-resolved path for five minutes.
  No schema, grants or RLS changes. Submitted and retrieved Edge files matched.
- agent-dexter v287 explicitly marks PDF binary/private-link retrieval and
  PDF-open/download watches unsupported in both chat and watch planning, directing
  operators to Booking Documents. Existing lifecycle watches are unchanged.
- JE0991147 browser test: V2 rendered; V1 and V2 downloaded. Both downloads are
  byte-for-byte identical to the PDFs originally downloaded from Quote Documents
  (V1 80,825 bytes; V2 82,598 bytes). Escape/Close work. Desktop dialog is 1,024px;
  at a 390px viewport its width is 358px with no horizontal content overflow.
  Desktop viewport restored; captured browser error log empty.
- Sixteen Edge-route tests pass, including unauthenticated, unrelated/deleted
  document, workspace denial and signing failure. Live anonymous request returns
  401. Forty PostgreSQL access regression checks pass; three focused Dexter
  unsupported-boundary contracts pass. Client TypeScript, full production build
  and diff check pass (existing large-chunk build warning remains).
- Recoverable errors are covered by route tests; no live storage outage was
  induced. Job/Customs attachments are not included in this Quote-PDF access route.
- No GitHub push or frontend deployment. PDF-logo work remains deferred.

## Required Customs handover fields — senior-review interim rule

- Released migration 20260922125007_customs_handover_required_cargo_countries to
  shared development project aqtwypsuijxlnvtxpuxe. Every active cargo line needs
  a 6–10-digit commodity code and positive net weight; selected shipper/exporter
  and consignee/importer need two-letter country codes. This checks completeness
  and format, not legal tariff classification or declaration validity.
- Draft saves remain available. The server gate runs before existing-declaration
  reuse, so a repeat handover cannot bypass missing information. Existing draft
  declarations are retained. No schema, grants, RLS or source-data rewrite.
- JE0991147 browser readback shows 16/20 checks, 80%, four missing-field rows and
  disabled Send to customs. Fix actions route to existing source fields; multi-line
  cargo directs operators to review each line in Booking Details. Final Fix-click
  browser check was interrupted by Chrome's open extension UI; not claimed passed.
- Rollback-only live tests pass before/after release: incomplete source denied,
  complete temporary fixture ready, second incomplete cargo blocks, archived cargo
  excluded, TBC/zero rejected, no extra declarations or handover events. Temporary
  test values were rolled back; actual Booking source values remain unchanged.
- Forty access regression checks and four focused Dexter contracts pass. Client
  TypeScript and diff checks pass. Security-advisor findings unchanged across release.
- agent-dexter v289 retrieved files match the submitted bundle byte-for-byte.
  Existing handover writes share the server gate; chat explains the rule. Full
  readiness read/check-completion watches remain explicitly unsupported; successful
  handover event watches retained. No additional recurring model calls.
- Frontend changes remain local. No GitHub push, frontend deployment or external
  iCustoms submission. Remaining main-flow work includes declaration party/EORI
  mapping, decimal formatting and declaration document-access verification.

## Booking-to-declaration field mapping — verified 22 September follow-up

- Released 20260922140741_booking_customs_field_mapping to shared development
  aqtwypsuijxlnvtxpuxe. New handovers supply company names and separate EORI fields.
  Job-related draft saves store dedicated exporter/importer/declarant identifiers,
  including deliberate clears, while retaining old-client compatibility. No changes
  to grants, access checks, provider submission, or existing source snapshots.
- Local adapter corrects only proven legacy Booking-prefill party values that still
  match their captured source and have no dedicated identifier field. Operator edits
  remain authoritative; standalone declarations are unaffected. Decimal padding is
  removed without Number conversion, rounding, code changes or filling missing data.
- Four adapter tests, TypeScript and forty access-regression checks pass. Live
  rollback-only probe proves new handover mapping, save/reload identifiers, deliberate
  empty importer identifier, original snapshot retention, numeric readback, legacy
  client compatibility and anonymous save denial. All synthetic source values and
  temporary declarations rolled back. Security advisor findings unchanged.
- Browser JE0991147 declaration: Exporter now Demo Organisation 035, EORI
  GB123456789000, Consignee Demo Organisation 009. Invoice amount 60000 and packages
  450 no longer produce padding-related errors. Missing invoice number/net weight
  and invalid N/A Incoterm remain visible; no legal readiness claim.
- Browser Save draft persisted these corrections; database readback and reload
  confirm them. IMPORTANT existing Save draft also attempts startICustomsProviderDraft
  when no provider draft exists. That attempt was rejected as not ready, producing
  a console warning/error after the successful Multideck save. Provider ID remains
  null and status draft. Do not repeat provider-capable save for a ready test record
  without authority; discuss this existing colleague-owned behaviour before changing.
- Invoice-access review confirms the current Customs declaration viewer serves
  CUST_DeclarationDocumentID (returned declaration PDF), not the Booking commercial
  invoice. Linked source-invoice controls on the declaration remain to implement;
  existing Booking Customs View/Download remain available. Do not repurpose the
  official declaration-document viewer or weaken access to expose source invoices.
- Dexter uses the existing handover/save/read/event boundaries; this mapping repair
  adds no new action or watch. Existing binary-document unsupported exception retained.
  Two focused readiness/PDF boundary contracts pass. The broader existing Customs
  contract fails on obsolete prompt wording “In Approve mode…”; HEAD already says
  “It always prepares…”. Left unchanged, not reported as a passing suite.
- No page layout changes, GitHub push, frontend deployment or external submission.

## Source invoice access and explicit provider draft actions — 22 September

- Supersedes the Save draft/provider and missing declaration source controls findings
  above. Save draft and initial draft creation now save only in Multideck. Review
  retains a separate explicit Create/Update iCustoms draft action; provider submission
  is unchanged and was not exercised. Browser save of the internal declaration
  returned to the register with a new saved timestamp, no console errors, and a live
  read confirmed CUST_iCustomsExternalID remains null.
- Booking commercial invoices already persist as private stored objects and
  Job_Documents. Booking Documents now supports viewing/downloading these attachments.
  The declaration Source documents panel exposes the exact linked invoice/packing
  list version, separately from the official returned declaration PDF.
- Deployed bookings-workflow v59 and agent-dexter v291 to the approved shared
  development project aqtwypsuijxlnvtxpuxe. Fresh deployed baselines were retrieved
  before changes; deployed files matched the submitted files. No schema/RLS/grant
  changes in this step. Declaration access uses existing server authorisation and
  validates the exact declaration link, same Booking, nondeleted document and active
  private stored object before signing. Anonymous access returns 401. Read-only
  access probe confirmed Lee and ten permitted colleagues retain access.
- Dexter chat and Watching for you explicitly distinguish local saves from provider
  draft actions. Source-document binary/download operations remain unsupported in
  Dexter and direct users to the UI; no approximate watch signal was introduced.
- Verification: 21 focused executable save/handler tests pass; 40 PostgreSQL access
  regression checks pass; three focused lifecycle and three Dexter boundary tests
  pass. TypeScript, client build and diff checks pass. Existing unrelated stale
  Customs prompt assertions are not represented as a passing full suite.
- Browser JE0991147: Booking Documents View/Download and declaration Source documents
  View/Download work. PDF visibly rendered, Escape closes the preview, and source
  attachment persists after reopening. Both browser downloads match the original
  2218-byte PDF SHA256
  0fc6ad4cf6cecb6d4e810d6b3cdb656bac90371f81709c149980825ea1485c72.
  Small-viewport controls and preview exercised; desktop viewport restored.
- Separate scope question remains: Customs Import invoice extraction uses temporary
  preview files with cleanup. Asked whether these must also become permanent source
  documents. This step does not change that separate retention policy.
- Frontend remains local, with released shared-development read routes. No GitHub
  push, frontend deployment, external submission, duplicate invoice upload or
  invented missing declaration data. Full manual Booking handover, final fresh
  Quote conversion/regression coverage, user acceptance and approved hosted release
  remain before prototype sign-off.

## Original extraction invoice retention — approved final-pass work

- User approved retaining original Customs Import invoice uploads, continuing both
  internal journeys, and fixing Mode/Direction visibility gaps. No external filing.
- Applied `20260922150258_customs_original_invoice_retention.sql` to development
  aqtwypsuijxlnvtxpuxe. Service-only registration validates active writer, draft,
  same-company Booking, exact upload identity/hash, and records Customs/Booking audit.
  Originals use private immutable paths independently of temporary OCR previews.
- Released customs-invoice-ocr v78, bookings-workflow v60 and agent-dexter v292;
  every deployed file matched its submitted bundle. Dexter was patched from its
  deployed v291 baseline, preserving unrelated deployed-only work absent locally.
  Do not redeploy the entire local Dexter entrypoint without reconciling that drift.
- Commercial-invoice extraction only: purchase-order and Finance upload workflows
  unchanged. Original bytes retained before conversion/provider extraction. A retry
  reuses the exact original; uncertain registration does not delete evidence.
- Browser uploaded internal-test-je0991147-invoice.pdf through Import invoice.
  OCR reported no item lines for this simple fixture (not a successful OCR test).
  After cancelling, original appeared in Source documents, rendered, downloaded,
  and survived reload. Download SHA256 matched the source exactly:
  0fc6ad4cf6cecb6d4e810d6b3cdb656bac90371f81709c149980825ea1485c72.
  Booking Documents also lists/opens it, without replacing its current handover
  invoice. Corrected the original's misleading Superseded badge to Retained original.
- Checks: retention PostgreSQL/access/retry contracts; 41 access-regression checks;
  20 handler checks; 3 retention helper/contract checks; 2 focused Dexter checks;
  TypeScript and client production build passed. Security advisor findings unchanged
  (existing findings remain). Twelve-account operational probe unchanged except
  expected document count 80 -> 81 from the authorised original upload.
- Local Quote presentation now uses existing customs/transport policy: domestic
  Customs agents and counts hidden; FMC limited to international sea context;
  non-transport schedule/add-leg controls hidden unless existing legs are retained.
  Location and Incoterms remain available, including Customs-only services.
- Fixed obsolete isolated Booking audit test harness missing ChevronDown dependency;
  route-mode/audit tests now pass. Broader old Quote details static suite has six
  failures against previous layout/payer/autosave expectations; do not claim it passes.
- Full final browser Mode/Direction matrix and both fresh journeys still in progress.
  No GitHub push or frontend deployment.

## Manual Booking handover final-pass evidence

- JE0991148 / JOB-96 populated through the real booking_workflow_save RPC as Lee,
  not direct operational table updates. Uses existing Demo 027/009/035 parties and
  explicitly synthetic cargo: ten cartons, gross100/net90kg, GBP1000, placeholder
  commodity123456. Notes and generated invoice state NOT FOR EXTERNAL SUBMISSION.
- Browser initially blocked Send to customs with missing freight amount/currency
  and invoice (86%); after freight data, missing invoice alone (95%). Uploaded
  internal-test-je0991148-invoice.pdf through the actual attachment control;
  visible filename and Attached state appeared and readiness reached100%.
- Added/saved TEST-HANDOVER cost100/sell150 in Finance UI. Live query confirmed
  one planning row and zero financial records while Provisional. Confirmed status
  change through UI; In progress now has exactly one Job_Costing_Lines record and
  the same100/150 values. Earlier discarded TEST-CANCEL line did not return.
- Browser Send to customs created and navigated to internal draft
  e8462b08-8f4d-4af9-b17a-fa9a9da22c3c / MD-CDS-EX-20260922-0066.
  Party mapping, EORI, countries, invoice1000/net90, and source invoice access
  checked in the declaration UI. Readback confirms cargo code/quantities, audit
  actor and document ID. A rollback-only repeated handover left exactly one
  declaration; external provider ID remains null. No console errors observed.
- This proves internal handover, not legal declaration completeness or OCR quality.
  Customs still must review structured addresses, classification and declaration
  fields. No external iCustoms draft or submission was made.

## Air Import final pass and container-projection corrections

- Repeated the internal JQ20029 into fresh JQ20031; exercised the actual selectable
  Sea, Air, Road, Rail, Multimodal, Courier, Warehouse, Customs only, Docs only and
  Other modes. Settled Air showed chargeable weight and schedules but no HBL.
  Warehouse/Customs-only/Docs-only hid transport schedule/add-leg controls without
  deleting existing saved legs. Country changes exercised Import, Export, Domestic
  and Cross-trade; Domestic hid Customs agents, Entries and Invoice lines.
  This is focused browser coverage, not every Cartesian mode/direction combination.
- A repeated Sea draft retained historical 40GP/20GP requests when changed to Air.
  UI hiding was correct, but backend projection and PDF container summary were not.
  Applied 20260922171000_quote_container_mode_projection; deployed quotes-workflow
  v92 using fresh v91 files plus only the mode-aware PDF guard. All deployed files
  retrieved and byte-compared. Local deferred logo changes were NOT deployed.
- The real conversion exposed another legacy path creating one Air ULD from that
  old sea description. Applied 20260922175000_quote_equipment_conversion_guard:
  every NEW conversion now reconciles through the mode-aware projection, not only
  Sea. Reused/existing Bookings are excluded; no migration-wide data rewrite.
- Eight live projection fixtures passed, covering Air, Sea FCL/LCL, Rail container,
  mixed sea legs, Warehouse and unclassified legacy data. Real Air conversion was
  rehearsed inside ROLLBACK before and after release: zero active equipment,
  In progress status, 200/275 charge transfer and immutable Quote snapshot passed.
  The fixture temporarily releases only JQ20031's existing-job/source uniqueness
  keys inside the rolled-back transaction; normal reference allocation can leave
  sequence gaps. A first attempt correctly hit the existing charge source key.
- Internal email sent from lee.wright@jenkar.com to lee@databrain.solutions only,
  subject INTERNAL TEST ONLY — Air Import Quote JQ20031. Customer response UI
  accepted it and created JI0991149 / JOB-97, UUID
  35939619-304c-4f07-a394-45a169bbe8a1. Wakefield41/Lee, Air Import PKKHI→GBLHR,
  Demo027 payer/customer, Demo035 shipper, Demo009 consignee, 450 Cartons,
  gross15000/chargeable16000 and TEST-AIR cost200/sell275 verified after reload.
- The single bad equipment row created during reproduction was removed from the
  working test Booking using the normal audited booking_workflow_save RPC. It is
  soft-deleted, not purged; equipment audit remains. No other Booking was repaired.
- JQ20031 V1 PDF lists AIR, no 40GP/20GP, chargeable16000 and customer sell275.
  It appeared in Quote Documents before acceptance and Booking Documents after.
  Both operator viewers opened it; downloads are byte-identical SHA256
  1ea925ef4c894cd3bc810aeaf2324fc66cf2eb77f46cdde7444d8d174e818802.
- Existing JQ20029 V1/V2 tests remain the evidence for revised Quote version and
  independent Booking-charge preservation. This fresh Air journey issued V1 only.
- Remaining: customer response page inline PDF raster preview failed, while its
  original download/fallback and both operator viewers worked. No console error
  was captured because the shared preview helper swallows rendering failures;
  root cause is not established. Do not mark customer PDF preview signed off.
  The deferred PDF logo issue is still visible and was not expanded into this work.
- Final focused suite: 26/26 passed (field policy, Booking route audit, PDF dataset,
  customer preview success/failure handling). Full client TypeScript+Vite build
  passed with existing large-chunk warnings. Historical static Quote suite still
  has six layout/payer/autosave expectation failures; it was not weakened.
- Post-change shared-data/access regression rerun: 41/41 passed, including
  original-invoice retention, colleague access, cross-company denial and private
  Finance boundaries. git diff --check passed.
- Shared-development backend releases only. No GitHub push, frontend deployment,
  external Customs draft or external submission. Full prototype sign-off remains
  pending the customer preview issue and final operator review.

## Customer preview resolution and live OCR sample — 22 September

- Customer preview root cause established: the local Vite process referenced
  `/node_modules/.vite/deps/pdfjs-dist.js?v=d6936d0b`, which returned HTTP504;
  its optimised dependency files were absent. Restarted only the verified local
  client process with `npm run dev -- --force`. No product patch was necessary.
  Temporary diagnostic HTML was removed after verification.
- Created internal repeat Quote JQ20032 and issued V1 to Lee's internal email
  only, subject `INTERNAL TEST ONLY — PDF preview JQ20032`. The actual customer
  response page rendered its PDF inline. Download produced a valid one-page A4
  PDF (82,120 bytes), verified using pdfinfo. Quote remains unaccepted; no new
  Booking was created. Deferred PDF-logo work remains untouched.
- Used the synthetic table invoice generated by
  `supabase/tests/fixtures/generate_ocr_commercial_invoice.py` on JE0991148's
  internal declaration MD-CDS-EX-20260922-0066. Live extraction
  `348f46a2-ec38-4626-8f36-67f85aeba554` finished ready using mistral-ocr-latest.
  Verified invoice QA-OCR-20260922-B, GBP1000, FCA Felixstowe, and two lines:
  Steel brackets 10×60=600, gross55/net50/2 cartons; Rubber seals 20×20=400,
  gross45/net40/8 cartons. Both origins GB. Missing commodity codes remained
  blank and flagged for review; no classifications were invented.
- Reviewed and replaced the single synthetic handover item through the normal
  import action, then Save draft. Reopened the declaration and verified both
  lines, their amounts, weights, packages and invoice links persisted. Required
  Customs fields still show outstanding; this is an internal Draft, not a
  completed or submitted declaration.
- Live readback confirmed the original's active stored object and matching
  SHA256 5fbb71889cdac7205ae0304443a501b61dd1b5021fc79135f9891163f890200b.
  It is linked to both the declaration and JE0991148, independently of the
  expiring extraction preview, and does not replace the current handover invoice.
- Customer preview tests: 3/3 passed. Combined preview/OCR run: 6 passed,
  2 failed: the older OCR unit test imports removed MAX_INVOICE_EVIDENCE_BLOCKS;
  the purchase-order contract expects superseded review-screen copy. These
  checks were not weakened or silently removed. Follow-up test maintenance
  remains; one successful synthetic invoice is not all-format OCR sign-off.
- This follow-up made no application implementation changes, shared-backend
  release, GitHub push, frontend deployment, or external Customs submission.
  The local server remains running for user testing.

## Local Customs readiness presentation follow-up — 23 September

- Domestic bookings now show **Customs not required** in the Booking header and Customs tab instead of a misleading readiness percentage. Cross-trade bookings show **Customs handover unavailable**. Eligible Import/Export bookings retain their readiness controls and handover gate. This is a local UI-only change; no backend release or deployment was made.
- Chrome check: JD0991136 displayed the Domestic state, and Air Import JI0991149 retained its incomplete readiness percentage and disabled handover. Client TypeScript check and `git diff --check` passed. Cross-trade has not yet had a browser check.
- Follow-up risk before multi-leg Customs sign-off: the Customs source editor reads `workspace.routes[0]` and saves through the single `route` payload, whereas readiness selects the main-carriage leg. The single-route save path may also update the first route. Do not assume multi-leg source edits are correct until the canonical save mapping is traced and verified. No routing change was made here.

## Main-leg Customs source correction — 23 September

- Traced the canonical Booking save: the legacy `route` payload writes the first leg, while a `routes` payload uses saved leg IDs and suppresses the legacy first-leg write. The Customs source editor now reads the marked main-carriage leg and submits all existing legs with only that leg changed; bookings with no saved legs retain the single-route creation path. Sea voyage changes now update the voyage field as well as the master reference.
- This is local client code only. TypeScript passes and the new focused contract passes. The surrounding contract file has one pre-existing failure for obsolete Audit empty-state wording; it is unrelated to this mapping and was not hidden. A signed-in multi-leg browser save/reload and hosted persistence check remain outstanding before final sign-off. No migration, shared-backend release, GitHub push, frontend deployment or Customs submission occurred.

## Signed-in multi-leg Customs save/reload — 23 September

- The development database initially had no saved active multi-leg Booking. Created internal provisional Road Import JI0991150 (JOB ref `INTERNAL QA MULTI-LEG CUSTOMS 23SEP`) through the signed-in local Chrome flow; it has no customer, charges, cargo, invoices, declaration or Customs handover. Saved A→B and B→C legs. Used the canonical Booking save function, guarded to that exact two-leg synthetic record, to mark leg 2 as main carriage for this test.
- Browser verification exposed two source-editor bugs before successful save. First, its origin/destination boxes showed older Booking-level values rather than main-leg B→C; corrected initial values to the selected leg and preserved Booking-level values on multi-leg saves. Second, saving a transport reference on a new Booking submitted an empty cargo line and was rejected with `Every cargo line needs a goods description.` The editor now omits cargo when nothing has been entered, while still sending an entered or existing line for validation.
- Repeated the browser save with `QA-MAIN-TRAILER-23SEP`. Development database readback showed two routes: leg 1 remained A→B, not main, no trailer reference; leg 2 remained B→C, main, and stored the exact test reference. Reloading the browser showed B→C and the exact trailer reference in Customs. Active cargo count remained zero. This verifies the local client → existing Edge/RPC → development database → reload path for this synthetic Road Import case. It does not certify all modes or external Customs submission.
- Final focused contract and TypeScript checks passed. Existing stale Audit copy expectation in the broader contract remains for the later cleanup pass. No GitHub push, frontend deployment, new migration, backend release or Customs submission occurred.

## Consolidated contract cleanup — 23 September

- Reconciled Quote/Booking contract assertions with the current product rules and UI: Customer/Billing is the payer; Quote ETD/ETA remain operational dates; the Booking creation dialog requires mode and direction; overview ownership uses the real owner label; Quote intelligence tests compile the Edge core explicitly. The previously stale Audit empty-state assertion was also brought up to date.
- Focused checks passed: Booking creation 9/9, Booking overview evidence 9/9, Quote intelligence snapshot 3/3, and Quote workflow backend contract 11/11. Client TypeScript (`tsc -b`) and `git diff --check` also passed. These are local checks, not new hosted acceptance evidence.
- Full client suite improved from 791/842 passing to 802/844 passing; 42 failures remain, spanning Admin, CRM, Dexter, sidebar, UI layout, standalone Customs/iCustoms, and several Quote/Booking visual/static contracts. Do not treat the full suite as green or automatically rewrite those expectations. The in-scope visual contracts still need review against the current boss-approved layout.
- No application implementation, shared backend release, GitHub push, Vercel deployment, or external Customs submission in this cleanup. The signed-in multi-leg Road Import save/reload above remains the latest hosted persistence evidence; final Air/Sea/Cross-trade and complete end-to-end sign-off remain outstanding.

## Quote and Booking presentation-contract review — 23 September

- Updated local contract checks for the currently implemented Booking overview (five stages over a two-row stage/metadata stack), scrollable tabs, and separate lifecycle and tracking status columns. The Quote shell containment test now recognises the current responsive header class. The touched presentation suites pass 9/9; no product UI was changed.
- The full client suite now reports 806/844 passing, 38 failing. The remaining Quote lookup assertion expects a removed UN/LOCODE metadata call while the present page loads the directory and exposes loading/error state; the rest of that broad merge-resolution assertion still needs targeted review. A separate sidebar test expects no `New booking` navigation item, but the current navigation data includes one. Neither is being silently rewritten because the intended navigation/lookup behaviour needs to be reconciled with the current product work.
- No GitHub push, Vercel deployment, backend release, or external Customs submission.

## Local dev reconciliation checkpoint — 23 September

- Saved the pre-merge freight checkout locally as `cb5a458`, then merged the fetched `origin/dev` at `4a5b9fd8` into `codex/freight-workspace-foundation` as `0e130e9`. One Dexter prompt conflict was resolved by keeping both dev's newer subscription/warehouse/mileage boundaries and the freight-specific unsupported-action/watch rules. The `New booking` navigation entry was left unchanged.
- Dev is now an ancestor of the local branch (no outstanding commits from `origin/dev` at this fetch). This is a Git reconciliation only: it did not apply migrations, deploy functions, push GitHub, deploy Vercel, or submit anything to Customs.
- Post-merge client TypeScript and Vite production build passed (existing large-chunk warnings). Focused freight/Dexter backend contracts passed 78/78. The access-regression runner passed 89/89 plus 10/10 second-stage checks, including PostgreSQL cases. Full client suite passed 856/888 with 32 failures; these are not resolved or signed off by the merge. The New booking/sidebar assertion remains intentionally failing pending the product decision.
- Previous signed-in multi-leg Road Import save/reload is pre-merge evidence, not proof of hosted persistence for this combined commit. Repeat browser/API/database acceptance before any release claim.
