# Dev merge checkpoint 1 October 2026

## Result

Merged dev successfully without conflicts. Local work is retained. The subsequent document-service compatibility repair is now implemented and tested locally against the newer hosted renderer v63 / studio v78. **Release approval is still required:** no push, dev-branch update or shared-service deployment was performed. This resolves the identified integration work locally; it is not fresh live document-generation sign-off or a fully green application regression.

## Git boundary

- Branch: `codex/freight-workspace-foundation`.
- Remote: `DatabrainSolutions/Multideck`.
- Protected local checkpoint: `c78e17c8`.
- Incoming dev commit: `654bbf28`.
- Merge: `b1922c30`.
- Incoming commits: `654bbf28`, `d81f2fe1`, `a4cb1d63`, `aa63ef01`.
- Incoming files: app breadcrumbs, Multideck metadata, Finance page, new Finance payment page, Finance purchase-intake page. Five files, 260 insertions and 75 deletions; no backend/migration changes in that incoming delta.
- No Git conflict resolutions were needed. Older September merge notes describe an earlier checkpoint, not this merge.

## Checks

| Check | Result |
| --- | --- |
| Frontend TypeScript/Vite build | Pass; existing chunk/dynamic-import warnings |
| Mandatory PostgreSQL access/lifecycle suite | 141/141 pass |
| Additional access contracts in that runner | 9/9 pass |
| Focused documents/privacy/transport/Quote backend checks | 35/35 pass |
| Focused Quote charges/notifications/Booking cargo/Customs/lifecycle client checks | 65/65 pass |
| Full client suite after merge | 917/960 pass; 43 fail |
| Full client suite at pre-merge c78e17c8 | 917/960 pass; same 43 failures |
| Normalised failing-test title comparison | Identical |
| Full client suite after compatibility repair | 920/963 pass; same 43 failing titles, three new tests pass |
| Compatibility handler/transport/studio checks | 25/25 pass; actual handlers with isolated mocked provider, Storage and RPC boundaries |
| Exact publication client/late-preview checks | 3/3 pass |
| Quote PDF/cargo/Customs focused client checks | 21/21 pass |
| Enhanced template-review PostgreSQL check | Pass; exact version/hash, stale rollback and denied actors |
| Enhanced House Draft freeze PostgreSQL check | Pass for HBL/HAWB with the real authorised source; wrong job/route/layout, Original and overwrite rejected |
| Repeated mandatory PostgreSQL and access contracts after repair | 141/141 and 9/9 pass |
| Deno type checks for both document services | Pass |
| Diff whitespace check | Authored edits pass; staged verbatim hosted helper/SQL imports retain trailing-blank-line warnings |

The initial PostgreSQL run failed one Finance Director dashboard fixture. Its September cash rows omitted the accounting date, inheriting `CURRENT_DATE` (October) instead of the transaction's September date. Added explicit September accounting dates only in the fixture. The focused test and complete regression then pass; no expected value, product SQL or applied migration was changed.

The pre-merge client comparison ran from a temporary `git archive` of c78e17c8, with the same Node command and a symlink to the installed client dependencies. No worktree was created, and the user's checkout was not reset. This comparison detects no new failing tests from the incoming dev changes; it does not waive existing failures or prove all hosted workflows.

## Fresh Chrome observations

- Before repair, JE0991153 Documents showed existing Booking Draft/Final and two FIATA Draft rows, with Booking confirmation initially selected. After restarting/reloading the current local frontend, those files remain listed; the picker offers two FIATA layouts and House bill of lading, not outgoing Booking confirmation. All three remain Not ready to generate against the unchanged hosted renderer. No new file created.
- The updated blocked-state review fits a 390 × 844 viewport (366 px dialog, 364 px client/scroll width), has no horizontal overflow or Vite error overlay, and Escape dismisses the dropdown and then the dialog without saving. Captured Chrome warning/error logs are empty. This does not test the released backend happy path.
- Template manager opens but Booking confirmation v10 reports source unavailable. Read-only database inspection identifies a newer draft v11 pointing to the source object owned by v10 (`aggregate_matches=false`), while v10's own source and stored object exist. The source-reader selects the newest draft before checking its source ownership and therefore returns null. Do not weaken the version-ownership check or pretend the published bytes are the draft. This is existing hosted template metadata, not a merge conflict; repairing it or restoring a correctly version-owned draft requires separate shared-data approval.
- Current House layout data has also advanced: HBL v3 is published with a different, not-yet-audited fingerprint; HAWB v2 remains Draft with another changed fingerprint. Neither is newly allowlisted by this repair. The compatibility release alone must not promise those two generation choices are ready. Inspect their exact sources before any privacy approval/publication or use a separately approved clean-default revision, retaining current history.
- JQ20032 V2 uses the unified read-only issued charges grid with saved values and disabled edits. V3 already existed as a working draft; version selection did not send or save anything.
- JE0991151 Customs shows four cargo lines with one row per line. Unknown weights/codes stay empty. No declarations or Customs attachments on that record. Formatted full-address controls repeat the address in their accessible value; this needs follow-up.
- Supplier intake page was opened read-only to inspect the incoming Finance surface; no approval, payment or invoice posting was performed.

No fresh send/accept/decline transaction, save/reload mutation, OCR upload, template publication, invoice posting or iCustoms submission was performed in this review.

## Shared development readback

Confirmed project `aqtwypsuijxlnvtxpuxe` (MultiDeck). Production `cigjelkrwqrwcbkpqkag` was not changed.

| Function | Version read |
| --- | --- |
| render-document | 63; fresh compatibility readback |
| document-studio | 78; fresh compatibility readback |
| bookings-workflow | 64 |
| quotes-workflow | 101 |
| quote-response | 49 |
| agent-dexter | 311 |
| document-download | 55 |
| customs-invoice-ocr | 81 |
| finance-accruals | 29 |

Retrieved current deployed bundles before considering any release. Private local snapshots were retained under a temporary QA directory; they are diagnostic recovery evidence, not a permanent release package or files to commit to GitHub.

### Compatibility repair completed locally

- Rebased the studio implementation on the retrieved v78 source, preserving history, exact historical source retrieval, restore-default, immutable version-specific Storage paths, protected licensed/carrier forms, and exact reviewed-version/source-hash approval. Required shared helpers are retained in the repository.
- The publication client now sends the exact saved version and SHA-256 from a completed fictional-data preview. Source/template changes and late preview responses cannot authorise publication. Job-data Studio previews do not authorise template publication; use Manage templates.
- Booking and House preview/approval test paths now also require an exact privacy-reviewed source fingerprint before reaching Carbone. Required tags are not a substitute for checking static text, metadata and images. Inspected Multideck Booking/HBL/HAWB default sources are recognised; the four earlier clean FIATA/Air revisions remain recognised. Unchecked edits fail closed and need an explicit privacy review before being added to the catalogue.
- Renderer v63's direction is retained: Booking confirmations are **received carrier/partner documents**, uploaded to the Job, not generated outgoing PDFs. Historic locally generated confirmations are retained. If an outgoing customer Booking advice is wanted, agree a separate document family rather than reusing this received-file code.
- Restored protocol-2 Draft review and generation locally for fingerprint-approved FIATA/MAWB/MNG and the newer own-issuer HBL/HAWB defaults, using current legal-entity/Admin identity, expected-template-version checks, source review tokens and frozen mapped snapshots. Originals, Copies, unreviewed sources and stale reviews remain blocked. House forms require an identified legal issuer and one unambiguous main carriage; missing issue particulars remain blank.
- Preserved the newer House projection/layout rather than replacing it with our legacy form shape. Our four earlier FIATA/Air schedules still carry recorded cargo/equipment allocations. The newer HBL/HAWB layout has no explicit split-allocation schedule; Harry should review whether it needs one before promising per-container breakdown there. This is a documented product follow-up, not an unresolved merge conflict.
- Imported five **already-applied** hosted SQL records into matching local filenames, without changing their SQL or applying them again: `20261001171457_booking_document_final_readiness`, `20261001171500_document_template_review_identity`, `20261001175904_booking_confirmation_price_label`, `20261001180929_document_template_version_sources`, `20261001185549_house_transport_review_layouts`.
- The Finance release-manifest test now explicitly classifies those five operational migrations. Its isolated Finance installation passes; no broad migration exclusion or permission relaxation was added.
- Earlier local/hosted filename differences still require ledger checking at release. Do not run a blanket pending-migration push or edit applied SQL. This compatibility repair introduces no new shared-development schema change.

## Existing failing client checks

All names below fail both before and after this dev merge. Classify individually; source-pattern failures are not automatically safe to dismiss.

- Admin exposes management, commercial and audit screens as real routes.
- DataTable quick links point to the Admin routes.
- Unassigned, loading, missing data and denied states never invent customer details.
- Contacts must belong to the account; selected contact leads; saved channel restrictions are honoured.
- Demo company fixtures use explicit anonymous identities.
- Every gallery component is navigable and has one live preview.
- Working screens do not advertise prototype-only CRM destinations.
- Customers and suppliers are views of the one Companies register, and their old addresses land there.
- Currency display comes from the tenant snapshot and fails closed when base currency is unavailable.
- Repeatable Customs item groups remain addable, removable, and mapped to iCustoms.
- Declaration document actions stay hidden until an accepted state has an MRN.
- Standalone declaration header keeps its title context separate from responsive actions.
- Review fixes disclose focused editable fields in place.
- Inline fixes cover grouped form and provider issues.
- Catalogue-backed Customs fields share a searchable structured combobox.
- Submission persists current edits and passes server validation before confirmation.
- Known failed-provider issues reduce readiness until correction is confirmed.
- Customs sections share one gliding selection surface.
- Canonical toolbar sits outside the rounded table and keeps columns last.
- Operator tables use DataTable instead of one-off table markup.
- Pinned table surfaces avoid stale backdrop-filter compositor layers.
- Dexter settings expose microphone, shortcut and private custom vocabulary controls.
- Posted billing-party changes explain reversal and replacement.
- Account recovery deep links open the existing provider sync workflow.
- Booking overall mode changes wait for approval, preserve routes and clear incompatible service only on confirm.
- Booking stale record, mode, service or routing invalidates pending approval.
- Booking aliases, read-only and permission changes cannot cause an unintended edit.
- Every attachment image surface uses the same square preview and viewer.
- Thread rows warm only for the active Inbox route.
- Manually created finance documents are always ad hoc.
- Both usage and finance retain recognised routes and their real page handlers.
- Quote lookups retain manual overrides, provenance and the location directory.
- Booking Board uses the same bounded server register page as the table.
- Transcript presents one Agent-to-Handler conversation while keeping provenance in audit detail.
- Luna imports a reviewable draft rather than saving automatically.
- All CRM overview variants use the same resilient eager shader wrapper.
- Reordering preserves real handlers and distinct sign-out styling.
- New booking remains a workflow route but is not a sidebar destination.
- Every direct browser Supabase table read has an explicit row bound.
- Impact choices use severity pills with an animated selected icon.
- Transcription settings use the reusable tag field and the gallery documents it.
- Home follow-ups show the real subject and open the exact Inbox thread.
- Wizard step states remain distinct in light and dark themes.

## Recovery and next approval boundary

Keep local checkpoint/merge history. The compatibility repair is ready for an approval-gated release candidate, not yet demonstrated live. Re-fetch dev and retrieve current hosted bundles immediately before release because others are editing the same services. Confirm the five imported SQL records match the applied ledger and do not reapply them. With explicit approval, push/merge the feature into dev, deploy the reconciled document-studio and render-document bundles with their complete dependencies to shared development, and update the intended dev frontend. No new template publication, database mutation or production release is included in this compatibility scope.

After release, verify actual fictional preview and exact-source publication (only if separately approved), approved transport Draft generation, frozen source/issuer, all-page watermark, private save/download, refresh/reopen and retained previous versions. Local handler tests cover all six transport layout codes but mock provider/Storage/RPC boundaries; they do not prove Carbone conversion or a deployed save. The five newly imported migrations have not each received a full new dedicated database scenario here; exact-source approval and the updated HBL/HAWB freeze function have. Original/Copy remain blocked pending senior decisions. The 43 existing client failures and the current hosted source-metadata/privacy-review issues remain unresolved and must be assessed before calling the entire demo regression-clean.

Recovery is the immediately preceding compatible hosted bundles and frontend, not stale pre-reconciliation local services. Preserve additive schema, generated versions, published selections and audit history; this release does not intentionally change those selections.

The detailed operator/engineering continuation brief is `docs/handovers/2026-10-01-harry-freight-handover.md`.
