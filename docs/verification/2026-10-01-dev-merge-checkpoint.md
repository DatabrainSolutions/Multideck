# Dev merge checkpoint 1 October 2026

## Result

Merged dev successfully without conflicts. Local work is retained. No push or shared-service release was performed. **Release hold:** hosted document services have advanced independently and need reconciliation with the local transport/privacy/publishing work.

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
| Diff whitespace check | Pass |

The initial PostgreSQL run failed one Finance Director dashboard fixture. Its September cash rows omitted the accounting date, inheriting `CURRENT_DATE` (October) instead of the transaction's September date. Added explicit September accounting dates only in the fixture. The focused test and complete regression then pass; no expected value, product SQL or applied migration was changed.

The pre-merge client comparison ran from a temporary `git archive` of c78e17c8, with the same Node command and a symlink to the installed client dependencies. No worktree was created, and the user's checkout was not reset. This comparison detects no new failing tests from the incoming dev changes; it does not waive existing failures or prove all hosted workflows.

## Fresh Chrome observations

- JE0991153 Documents shows existing Booking Draft/Final and two FIATA Draft rows. Create document loads Booking confirmation. Both FIATA options report Not ready to generate. No new file created.
- JQ20032 V2 uses the unified read-only issued charges grid with saved values and disabled edits. V3 already existed as a working draft; version selection did not send or save anything.
- JE0991151 Customs shows four cargo lines with one row per line. Unknown weights/codes stay empty. No declarations or Customs attachments on that record. Formatted full-address controls repeat the address in their accessible value; this needs follow-up.
- Supplier intake page was opened read-only to inspect the incoming Finance surface; no approval, payment or invoice posting was performed.

No fresh send/accept/decline transaction, save/reload mutation, OCR upload, template publication, invoice posting or iCustoms submission was performed in this review.

## Shared development readback

Confirmed project `aqtwypsuijxlnvtxpuxe` (MultiDeck). Production `cigjelkrwqrwcbkpqkag` was not changed.

| Function | Version read |
| --- | --- |
| render-document | 62 |
| document-studio | 73 |
| bookings-workflow | 64 |
| quotes-workflow | 101 |
| quote-response | 49 |
| agent-dexter | 311 |
| document-download | 55 |
| customs-invoice-ocr | 81 |
| finance-accruals | 29 |

Retrieved current deployed bundles before considering any release. Private local snapshots were retained under a temporary QA directory; they are diagnostic recovery evidence, not a permanent release package or files to commit to GitHub.

### Reconciliation required

- Earlier transport transaction evidence concerns renderer 61 / studio 71. Renderer 62 no longer includes the local transport review/mapping modules, returns no transport protocol-2 readiness and blocks sea/air generation. The browser agrees with this readback.
- Preserve renderer 62 issuer/logo freezing, expected-template-version and Final issuer checks while restoring reviewed Draft mappings.
- Studio 73 adds history, version source, default restoration and approve-reviewed-version/source-hash identity. Local `approveDocumentStudioTemplate` still sends template ID alone. Reconcile frontend/server identity rather than weakening review.
- Studio 73 also protects transport uploads and uses a separate Booking preview path. Audit embedded static-data privacy and preserve the intended protected-source workflow. Required tags plus fictional dynamic values do not prove a source has no customer text.
- Hosted migrations `20261001171457_booking_document_final_readiness` and `20261001171500_document_template_review_identity` were read and are not in this checkout. They must be retained/reconciled before any release.
- Some earlier local/hosted migration filename versions differ (including template source upload, published-template reads and library controls). Match names and deployed SQL; do not run a blanket pending-migration push or edit applied SQL.

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

Keep local checkpoint/merge history. Prepare an additive compatibility repair against freshly retrieved hosted services and retain newer branding, readiness, review identity and privacy protections. Reconcile the migration ledger, run focused and mandatory tests, then request exact push/deployment approval. Restore only the immediately previous compatible services/selections if an approved release fails; retain schema additions, generated versions and audit. Do not roll back shared development to stale local function bundles.

The detailed operator/engineering continuation brief is `docs/handovers/2026-10-01-harry-freight-handover.md`.
