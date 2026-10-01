# Multideck handover for Harry

Prepared for Lee's annual leave on 1 October 2026. This is the continuation brief for Harry and his Codex, covering Quotes, Bookings, Customs readiness and Documents. It separates what we have built from what is currently usable, and records the decisions we must not guess.

## Read this first

We have pulled and merged the current dev branch into our freight work without conflicts. The combined frontend builds and the mandatory backend/access checks pass. **Do not push or release yet:** newer document services in shared development are not compatible with all of our local document work. This is a service-version mismatch, not a Git merge conflict.

- Local work is preserved on `codex/freight-workspace-foundation`. The pre-merge checkpoint is `c78e17c8`; the dev merge is `b1922c30`, incorporating dev `654bbf28`.
- The incoming four dev commits refine supplier invoice intake, approvals and payment views. They changed five frontend files and added no database migrations in this pull.
- Local frontend: `http://localhost:3000`. It connects to shared-development Supabase `aqtwypsuijxlnvtxpuxe`. A local build is not a hosted frontend release.
- No GitHub push, shared backend deployment, shared database mutation or production change was performed during this checkpoint review.
- Production is out of scope. Issued files, published template history and operational data must stay retained.
- The full client suite has 43 failures. The same 43 failures reproduce before the dev merge; they are not newly introduced by this merge. They remain unresolved, not waived.

### Agreed priorities

1. Reconcile the newer hosted document services with our Draft mappings and privacy checks, preserving everyone else's safeguards.
2. Verify Quote sending and customer response through to one Booking and the correct notifications using an approved test recipient.
3. Verify Booking changes, split cargo persistence and Customs handoff with operators.
4. Finish document generation family by family, starting with Booking transport Drafts and Finance-owned invoices.
5. Obtain the senior-staff decisions below before enabling transport Originals or Copies.
6. Prepare an exact release plan and ask Lee for confirmation before pushing or changing shared services.

## Quotes

### What we have done

- Kept the familiar Quote charges grid after submission, rather than replacing it with the old long-form saved-charge summary. Submitted charges use the saved version, with editing disabled and the same column/selected-line layout as entry.
- Preserved submitted amounts and exchange rates. Missing historic values are not backfilled from today's records or silently treated as zero. Operators create a new version to revise an issued Quote.
- Added current-user ownership defaults for new Quotes, without changing an existing explicit owner. Sender identity is separate from customer contact and customer reference.
- Corrected the PDF contact mapping to the operator who sent the Quote, rather than placing the customer reference in Contact. Cargo handling flags such as Fragile feed the customer document.
- Added mode-aware route/PDF labels and preserved repeating cargo information. Collection and delivery remain explicit shipment facts; they are not assumed from a company's registered address.
- Built sent-Quote document retention and authorised PDF opening/download. A stored file and an expired preview link are different problems; opening a file must obtain fresh authorised access.
- Repaired accepted-Quote charge provenance during Booking conversion. The recorded JQ20035 acceptance created JE0991153; repeated response attempts must not create another Booking.
- Added sender as well as creator notification coverage, with recipient/privacy boundaries. An existing decline or acceptance is a recorded response, not something to overwrite to make another button work.
- Added manual acceptance as a controlled operator workflow. This does not authorise an agent to accept real commercial terms during testing.

### What is still left to do

- Run a fresh approved Quote lifecycle after service reconciliation: create, save, send, open the correct version, accept, confirm one Booking, then verify creator/sender notifications and saved documents. The current review did not send mail or submit a customer response.
- Cover acceptance, decline, change request, expired link, old-version link, repeated confirmation and conversion failure. The page should accurately explain a previously recorded response and not leave an apparently usable confirmation action.
- Confirm toast/pop-up behaviour separately from notification persistence. A notification record does not prove a toast was shown, and no new toast sign-off is claimed here.
- Check at least Air Import and Sea Export PDFs, plus Road/Rail labels and mixed-leg routes. Existing test evidence is not proof that every mode/direction combination has been exercised end to end.
- Validate the actual pickup/delivery arrangement with operators. Lee's earlier sample parties and route countries were deliberately random; do not use them to invent an automatic address rule.
- Decide which quotation template is the operational source. The editable Customer quotation catalogue draft exists, but it is not automatically the generator used by Send quote. Later editing must preserve the exact issued PDF and submitted snapshot.
- Investigate the existing broad-suite Quote lookup failure rather than changing its assertion merely to pass the suite.

### Useful checks

- Fresh Chrome check in this review: JQ20032 V2 displays the unified charge grid, disabled editing, saved GBP 200 cost / GBP 275 sell and a read-only issued-price notice. V3 was already a working draft; viewing V2 did not create or send a version.
- Existing architecture/release notes hold earlier sending and conversion evidence. Treat these as dated transaction evidence, not proof of today's hosted frontend state.

## Bookings

### What we have done

- Preserved the accepted Quote handoff, source/version references and charge identity. Booking operational edits do not rewrite the issued customer Quote.
- Added mode-aware shipment/equipment choices and routing details, with recorded planned dates separate from estimated/actual milestones.
- Kept package type separate from equipment. Cartons and pallets describe cargo packaging; containers, vehicles or ULDs describe transport equipment. Do not copy a package type into Equipment / load simply because the names look related.
- Added whole-line assignment, multiple lines in one container and splitting one cargo line across multiple containers.
- Replaced the clunky split flow with a cargo-first Load plan sheet. It shows the line's package total, assigned quantity, remainder and per-container entries, with more detailed weights/leg information available when needed.
- Added over-allocation checks, stable cargo/equipment identities and precise quantity handling. Package distribution must never calculate an invented container weight or verified gross mass (VGM).
- Added repeatable vehicle identifiers and retained planning/operational charge boundaries. Planning changes are not automatically posted invoices or accounting entries.
- Kept the audit compact, with changed information and further detail available on demand.
- Added Booking document creation controls and retained separate Draft/Final Booking confirmation files. Transport Draft availability is currently affected by the service mismatch described under Documents.

### How to split a cargo line

1. Open the Booking and its Details tab. Make sure the required containers/equipment rows exist.
2. Open the cargo line's Load plan action. Start from the goods, not from a second copy of the cargo line.
3. Select a container and enter the number of packages assigned to it. Add another container row for the remaining packages.
4. For JE0991153, the recorded example is one line of 40 packages split 20 and 20 across two containers. This is an example, not a compulsory equal split.
5. Check the remainder and validation. Above 40 is invalid; an unknown quantity is not silently a complete allocation.
6. Save the Load plan, then save the Booking Details changes. The sheet updates the Booking edit state; closing it is not proof that the server has persisted the change.
7. Refresh and reopen the line to confirm both allocations persist. Record weights/VGM independently only when the operator has valid evidence.

### What is still left to do

- Repeat save/reload checks on split lines, multiple lines, deletion of linked equipment, stale records and partially unknown quantities. Earlier 20/20 and invalid-41 checks passed; no fresh Booking mutation was made in this review.
- Confirm operators can find Load plan immediately and understand the difference between saving the sheet and saving Details. Improve that signposting if they miss it.
- Finish realistic Air/Road/Rail operational cases and equipment compatibility checks. Avoid treating a complete UI as completed carrier integration.
- Review the broad-suite failures around Booking mode changes, stale confirmation, Board/register parity and shared table usage. They reproduce before this merge, but still need triage.
- Finish document service reconciliation before promising FIATA/Air Draft generation is currently available.

## Customs readiness inside Bookings

### What we have done

- Displayed every Booking cargo line in the Customs screen. Each line uses a compact, single-row set of fields, with horizontal scrolling when needed and full editable values rather than deleting overflow text.
- Added per-line descriptions, package counts/type, gross/net kg, commodity code, origin country and goods value/currency, instead of using only the first line or assuming one shipment value belongs to every line.
- Separated consignor, consignee and importer roles. Importer is the legal importing party; it is not automatically the shipper or Jenkar because Jenkar is arranging the job.
- Provided an explicit Use consignee details shortcut where appropriate, instead of silently treating every consignee as the importer. Registration type/number is separate from an internal customer code; a code such as CUS0003 is not an EORI.
- Added commercial invoice and packing-list source attachments and kept related declarations visible alongside the Booking source information.
- Kept operator source collection separate from the specialist declaration workflow. Customs readiness does not mean submitted, accepted, cleared or released.
- Preserved foreign-company/revoked-user boundaries and tested child-row visibility without broadening write permissions.

### What is still left to do

- Have Customs staff review whether the Booking source provides enough customer-supplied information, including importer/registration, freight and goods valuation, origin, weights and attached evidence. Do not duplicate every specialist declaration field in Booking.
- Validate OCR with approved fictional/sandbox invoices and multiple item lines, then check operator correction and retained original evidence. This review did not upload a customer invoice or submit to iCustoms.
- Run the actual authorised source-to-declaration handoff and check every mapped item/party/document. A ready percentage or related-record count does not prove that mapping.
- Resolve the existing standalone Customs client-test failures around item groups, provider validation/readiness, MRN-dependent document actions and form structure.
- Investigate a display issue seen in this review: full-address controls on JE0991151 show the formatted address repeated in their accessible value. No saved party address was changed to hide it.
- Keep the unsupported dedicated importer/Dexter action explicit until there is a safe approved adapter for both chat and Watching for you.

### Current evidence

- Fresh Chrome check: JE0991151 Customs contains all four cargo rows. Empty gross/net weights and codes remain empty. There are no attached Customs documents or declarations on that record.
- The earlier Customs verification note includes real importer save/reload and four-line persistence evidence, plus the scope of mode/direction contract checks. Those tests are not sixteen actual customs submissions.

## Documents

### What we have done

- Matched the BoxTop catalogue and sample inventory to 35 editable draft document families. The crosswalk accounts for 189 entries: 55 matched to new families, 8 reusing existing families, 17 controlled-form cases and 109 report/undefined cases.
- Added catalogue drafts for freight invoices/proformas, packing lists, instructions, notices, manifests, warehouse outputs, vehicle handover and release requests. These are layout foundations, not 35 completed live-record generation workflows.
- Made templates visible as editable items in Documents, with saved per-user order, menu-based move/remove and recoverable removed templates. Removed the non-working six-dot control. Operations requirements is not an operational template to restore by accident.
- Kept template editing independent of Job numbers. Word source editing, fictional-data preview, review and publication are separate from creating a document from a real Booking.
- Built a separate FIATA reference layout with the replaceable Multideck logo. Preserved the other FIATA form as a separate template, rather than substituting one for the other.
- Created clean versions of Master Air Waybill, MNG Air Waybill and FIATA -Waybill after discovering embedded customer data in their imported sources. Provider data substitution alone cannot remove live text already baked into a Word file.
- Added source-fingerprint privacy checks and fixed fictional preview fixtures. Both the library thumbnail and manager preview must use only a reviewed clean source; unchecked sources must fail closed.
- Added all-page Draft watermarking, issue metadata and retained PDF versions. Template Draft/Published and document Draft/Final are different lifecycles.
- Earlier shared-development work published four reviewed clean transport revisions and generated four saved Draft PDFs using recorded Booking cargo, equipment and allocation data. These historic files remain visible; current generation has subsequently been blocked by a newer hosted renderer.
- Kept Original and Copy blocked for transport forms while Jenkar confirms their type and issuing arrangements. Any active Jenkar employee with the existing access was Lee's preferred employee policy; that is not, on its own, authority to issue a licensed/carrier document.

### Current blocker

- Shared development now has `render-document` v62 and `document-studio` v73. Our previous verified transport extension used renderer v61 and studio v71.
- Renderer v62 preserves useful newer issuer/logo snapshots and template-version checks, but does not contain our transport review/mapping path. It blocks sea/air outputs and does not report protocol 2 transport readiness.
- Fresh Chrome check on JE0991153 confirms FIATA choices say Not ready to generate. Booking confirmation remains selectable and historic Draft/Final/transport files remain listed. No new file was generated in this review.
- Studio v73 adds history/source retrieval, default restoration and stronger reviewed-version/source-hash publication checks. Our local approval client still supplies only template ID, so it needs updating to the newer contract before publication can be signed off.
- The newer Booking preview route also needs a privacy audit: fictional field values and required tags do not prove that embedded static customer details are absent. Do not assume that route has retained our exact clean-source checks.
- Two newer hosted migrations are missing from this checkout: `20261001171457_booking_document_final_readiness` and `20261001171500_document_template_review_identity`. Their deployed SQL was read, not changed. Preserve their Final-readiness and exact-source-review controls.
- Reconcile these changes additively. Do not deploy our older local bundles over the newer hosted bundles or remove protections just to restore the picker.

### Guide to editing templates

1. Open Documents. Pick the template tile, or choose Manage templates and select the template by name. Ordering/removal belongs in the tile's top-right menu.
2. Check whether the template is Draft or Published. For a published layout, edit a new draft revision; keep the current published layout in use until the replacement is reviewed.
3. Download template source and open the DOCX in Word. Keep the Carbone field tags and repeating-row markers intact. Carbone fills an edited Word layout; it is not an in-browser drag-and-drop page designer.
4. Edit layout, labels or the replaceable company-logo area. Do not insert customer names, actual addresses, signatures or issued references into reusable source text. Use approved placeholders and fictional examples only.
5. Upload edited Word source. A successful upload/save is not publication. Preserve the source version and hash that will be reviewed.
6. Preview with server-owned fictional sample data. A Job number is not needed. The older catalogue README's manual sample-JSON instructions are historical, not permission to feed live data into previews.
7. Inspect every page: repeated cargo/equipment, long addresses, page breaks, logos, static text, unresolved tags and Draft marking. Check thumbnails as well as the full preview.
8. Mark I inspected the preview only for that exact version/source. Publish reviewed version after permissions and source checks pass. Changing the draft must invalidate the old review.
9. For operational generation, open Booking > Documents > Create document, choose an eligible published layout and review the record data. Do not generate from an unpublished catalogue draft.
10. Save a separate PDF version. Refresh and reopen it through authorised download. Never relabel or overwrite an earlier issued file.

At this checkpoint, step 8 requires the local/hosted publishing contract reconciliation. A failed publication should remain visibly failed; do not weaken the server review requirement. Transport editing is additionally protected in the newer hosted studio and must be reconciled with the approved clean-source workflow, not bypassed.

### What is still left to do

- Reconcile renderer/studio, restore Draft-only transport readiness, and retest the four layouts. Preserve newer branding, version checking, source-hash review, private storage and Final readiness.
- Review each specialist layout with the relevant operators. Many catalogue drafts intentionally look similar and need family-specific layout work. Carrier/licensed forms must not be recreated and presented as authorised Originals.
- Wire generation to the correct record owner: immutable issued Quote snapshot, Booking operational facts, Finance invoice/tax/numbering, Warehouse stock facts and consolidation records. A generic Job dataset is not sufficient for every section.
- Prioritise Finance invoice/proforma generation and retention with Finance staff. Preserve posted-invoice correction rules; a Booking Original toggle must not bypass invoice posting or tax controls.
- Complete each family with real authorised generation, persistence, refresh/reopen, failure, version retention and private-data exclusion checks. Representative Carbone previews are not all-family operational sign-off.
- Keep Customs certificates/declarations, dangerous-goods declarations, CMR/FCR and release authority gated to their qualified workflows. A release request is not a release approval; a working commercial invoice is not the customer's issued original.
- Add Dexter only when authorised reads, approved writes, deterministic events and audit are implemented together. Template review, transport generation and Original/Copy remain manual-only exceptions, not claimed AI capabilities.

## Decisions for senior Jenkar staff

Lee cannot confirm these before annual leave. Harry should obtain answers rather than choose issuing rules based on a template title or a watermark. Keep transport Draft-only until the answers are agreed and implemented.

### Which document are we issuing

- For the template called FIATA -Waybill, choose whether it represents a negotiable FIATA Bill of Lading (FBL) or a non-negotiable FIATA Waybill (FWB). The historic form mixes FBL and Waybill wording; choose the actual business document before changing labels or enabling issue.
- Identify which other forms are House bills/House air waybills and which are carrier Master bills/Master air waybills. A template existing in the library does not tell us who may issue it.

### Whose issuing authority applies

- Confirm whether Jenkar issues on its own authorised FIATA forms, as an appointed agent for a named carrier, or uses carrier-provided documents. Supply the approved form, terms and evidence of the arrangement for each family.
- Confirm any licence, membership, insurance or agent/carrier approval the responsible staff say is required. Codex must not invent that approval from a logo or employee account.
- Lee's employee preference is any active Jenkar employee with normal document/Booking permissions, not manager-only. Staff still need to confirm how issuing authority, signatures and accountability fit that policy.

### What must be approved before issue

- Name the required party, cargo, route and freight particulars, required customer review, and who records approval of the exact draft version.
- Decide what operational evidence is required, including any on-board statement/date. Do not assume job completion is the universal trigger or manufacture loading evidence.
- Confirm whether signatures are needed and how they are authorised. Existing scans or sample signatures must not be reused as live approval.

### How Originals and Copies are controlled

- For negotiable bills, agree original count/numbering, who receives them, release/surrender/cancellation rules and the treatment of replacement or amended bills. Do not default to three Originals without the issuing arrangement.
- Agree that a Copy comes from the stored issued document/snapshot, not a new render of today's Booking. Mark it clearly without implying another Original has been issued.
- For non-negotiable waybills, agree their issue/release process separately; do not automatically inherit a negotiable bill's original-set rules.
- For air waybills, confirm carrier/agent authority and paper or e-AWB arrangements. MAWB and HAWB need distinct treatment; ocean title-transfer/surrender rules are not an air default.

### Where to find the earlier research

- `docs/architecture/booking-document-issuance.md` records the earlier FIATA, IATA, CargoWise and carrier references and the implementation boundary. It is a product recommendation, not legal clearance.
- No public BoxTop Original/Copy specification was verified. Our BoxTop catalogue helps document coverage, not issuing authority.
- Obtain qualified operational/legal confirmation where needed, then implement approved rules and tests before making Original/Copy selectable.

## Finance and other changes worth retaining

### What the new dev work helps with

- Supplier intake, invoice review and payment navigation are more developed. Reuse their actual workflows rather than adding a parallel document-only approval process.
- Final Booking document readiness and exact reviewed template identity are useful newer shared-development safeguards, even though they currently need integration with our work.
- Existing party/registration, finance source identity, retained records and access boundaries provide foundations for correct document mappings. Their presence does not prove a complete issuing workflow.

### What still needs attention

- Finance owns invoice number, legal entity, tax, posting and corrections. Agree invoice PDF retention/provider behaviour with the Finance owner before connecting the catalogue template.
- Do not infer authorisation to post invoices, make payments, accept customer terms, submit Customs or send mail from this handover. Those workflows need their ordinary permissions and explicit test/release authority.
- Do not broaden tenant access for colleagues to fix a missing row. Test standard colleagues, related cargo/documents, restricted users and cross-tenant denial.
- The App is the operational source of truth. Portal work belongs in Multideck.Live and tenant/deployment control-plane work in Multideck.Cloud; do not move privileged document/Storage logic into the client.
- Demo privacy applies to template previews and thumbnails. It does not authorise changing existing customer documents or silently sanitising saved operational records.

## Checkpoint verification

### Passed in this review

- Frontend TypeScript/Vite production build after the dev merge. Existing large-chunk and dynamic/static-import warnings remain.
- Mandatory PostgreSQL/access regression: 141/141, followed by 9/9 additional access contracts.
- Focused document/privacy/transport/Quote backend checks: 35/35.
- Focused Quote charges, notifications, cargo allocations, Customs source, vehicle identifiers and Booking lifecycle client checks: 65/65.
- A Finance Director dashboard test failed because September cash fixtures inherited October's current accounting date. We pinned those fixtures' accounting dates to September; the focused test and full mandatory suite then passed. No product query or expected result was weakened.
- Full client suite comparison: 917/960 pass, 43 fail both before and after this merge, with identical failing test titles. No new client-suite failures from the five incoming frontend files were detected by this comparison.
- Fresh Chrome read-only checks: issued Quote grid, four-line Booking Customs, document list retention and the current transport readiness block. No operational record was saved during these checks.

### Not verified by this review

- Hosted frontend deployment, production or customer delivery.
- A fresh Quote response transaction, customer mail delivery or notification toast.
- New Booking persistence, invoice posting/payment, OCR or iCustoms submission.
- All 35 document generation families, legal Originals/Copies or complete mobile/keyboard flows after backend reconciliation.

### Existing client failures to triage

- The 43 failures include Quote/Booking mode and lookup contracts, standalone Customs, shared tables/gallery, Admin/navigation, Finance route expectations, direct-read bounds, Inbox/Dexter and wizard/theme contracts.
- Some tests inspect source structure, but do not assume all failures are stale tests. The direct-read-bound and permission-related cases require substantive review.
- The comparison establishes the merge did not add these failures under the same runner. It does not make the current application fully regression-green.

## Release and recovery plan

1. Re-fetch dev and inspect current local work before doing further edits. Keep this branch and checkpoints; do not reset or discard concurrent work.
2. Retrieve current shared-development renderer/studio and dependencies again. They can change while this handover is being read. Compare with local changes and preserve newer routes/protections.
3. Reconcile the missing hosted migrations and historical local/hosted filename differences by name and SQL, not by blindly pushing every locally pending migration. Never edit an applied migration or apply unrelated pending migrations.
4. Prepare compatible frontend, functions, database and template revisions. Test the merged implementation locally, including access/privacy/stale review and failure handling.
5. Report the exact target branch/environment, required migration/function/template order, affected workflows and recovery plan. Ask Lee for confirmation before GitHub push or shared/production writes.
6. After approval, apply only required additive schema changes, deploy compatible services, review/publish only approved clean revisions, then update the intended frontend. Re-read deployed versions.
7. Test real approved transactions and saved-file persistence on that environment. A successful build/push/deploy is not user-workflow verification.
8. Recovery should restore the immediately preceding compatible service/frontend and published selections while retaining additive schema, generated files and audit history. Do not revert to an obsolete renderer that drops someone else's controls.

## Technical starting points for Harry and Codex

- Repository: `/Users/leewright/repo/Multideck`; branch `codex/freight-workspace-foundation`. No worktrees should be created.
- Local frontend: `multideck.client`; privileged backend: root `supabase/functions`, shared helpers and incremental `supabase/migrations`.
- Read root `AGENTS.md`, applicable agent policies and canonical architecture before making changes. The optional `.agents/memory/project.md` was not present during this review.
- Documents: `multideck.client/src/pages/documents-page.tsx`, `src/lib/document-builder-api.ts`, `supabase/functions/document-studio/index.ts`, `supabase/functions/render-document/index.ts`.
- Transport/privacy: `supabase/functions/_shared/transport-document.ts`, `transport-layouts.ts`, `template-preview-safety.ts`, `document-issue.ts`.
- Booking source/load plan: `booking-components.tsx`, `booking-cargo-load-plan-sheet.tsx`, relevant allocation/Customs source helpers and the Booking workflow migrations.
- Catalogue: `supabase/templates/document-catalogue/README.md`, `TEMPLATE_INDEX.md`, crosswalk and fictional fixtures. Do not upload reference customer samples.
- Dated evidence: `docs/verification/2026-09-28-booking-customs-source.md`, `docs/verification/2026-09-30-dev-merge-checkpoint.md`, `docs/architecture/document-template-layout-editing.md`, `docs/architecture/booking-document-issuance.md`.
- Current hosted versions read during this review: renderer 62, studio 73, bookings-workflow 64, quotes-workflow 101, quote-response 49, agent-dexter 311, document-download 55, customs-invoice-ocr 81, finance-accruals 29. Recheck before release. The public quote-response token endpoint intentionally differs from signed-in JWT endpoints.
- Current checkpoint details and the complete client failure list are in `docs/verification/2026-10-01-dev-merge-checkpoint.md`.
- Build: run `npm run build` inside `multideck.client`. Backend/access: `node supabase/tests/run-data-access-regression.mjs` with PostgreSQL 17 available. Client: `node --experimental-strip-types --test multideck.client/tests/*.test.mjs` from repository root, using the configured project Node runtime.

## Continuation prompt for Harry

Please continue the Multideck freight work from this handover and its checkpoint report. First verify the branch, working-tree changes and latest dev state. Resolve the local/shared-development document-service drift without losing the newer issuer branding, Final readiness, exact source-review identity, privacy checks or our Draft transport mappings. Do not deploy stale bundles. Keep FIATA/Air Originals and Copies blocked until senior Jenkar staff answer the recorded issuing questions. Then verify the agreed Quote, Booking, Customs and document workflows using approved fictional/test data. Preserve issued snapshots, generated versions and private data. Prepare the complete release scope and recovery plan, and obtain Lee's confirmation before any GitHub push or shared/production change. Do not treat this handover as permission to send mail, accept real terms, post invoices, make payments or submit Customs.
