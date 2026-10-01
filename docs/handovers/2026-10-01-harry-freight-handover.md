# Multideck handover for Harry

Prepared for Lee's annual leave on 1 October 2026. This is the continuation brief for Harry and his Codex, covering Quotes, Bookings, Customs readiness and Documents. It separates what we have built from what is currently usable, and records the decisions we must not guess.

## Read this first

We have pulled and merged the current dev branch into our freight work without conflicts. We have also completed the identified document-service compatibility repair locally, preserving the newer shared-development workflow. The frontend build, both document-service type checks and mandatory backend/access checks pass. **The known compatibility repair is completed locally; it is not a merge conflict left for Harry.** Following Lee's specific approval, the two missing Quote-to-Booking database fixes have now been applied and verified in shared development. No push/merge into remote dev or document-service deployment has been performed. The application still has the 43 previously recorded client-test failures, and the repaired document generation has not yet been exercised against the deployed provider. Lee clarified that this tie-off is a self-contained handover, not a request to deploy the whole project.

- Local work is preserved on `codex/freight-workspace-foundation`. The pre-merge checkpoint is `c78e17c8`; the dev merge is `b1922c30`, incorporating dev `654bbf28`.
- The incoming four dev commits refine supplier invoice intake, approvals and payment views. They changed five frontend files and added no database migrations in this pull.
- Local frontend: `http://localhost:3000`. It connects to shared-development Supabase `aqtwypsuijxlnvtxpuxe`. A local build is not a hosted frontend release.
- No GitHub push, shared document-service deployment or production change was performed. The only shared writes in the final tie-off were the two explicitly approved database migrations below; fictional verification party rows were rolled back.
- Production is out of scope. Issued files, published template history and operational data must stay retained.
- The full client suite now passes 920/963 checks, including three new publishing tests. Its same 43 failures reproduce before the dev merge; they are not newly introduced by this merge or compatibility repair. They remain unresolved, not waived.

### Agreed priorities

1. Release and verify the locally reconciled document services after explicit approval, first checking that nobody has advanced dev or the hosted bundles again.
2. Verify Quote sending and customer response through to one Booking and the correct notifications using an approved test recipient.
3. Verify Booking changes, split cargo persistence and Customs handoff with operators.
4. Finish document generation family by family, starting with Booking transport Drafts and Finance-owned invoices.
5. Obtain the senior-staff decisions below before enabling transport Originals or Copies.
6. Prepare an exact release plan and ask Lee for confirmation before pushing or changing shared services.

### Start here: no conversation archaeology required

The sections below are the authoritative handover, not a list of work Harry must infer from chat. Do not treat a local repair, a published layout, a preview or a database migration as equivalent to an end-to-end released workflow.

| Item | Exact status at handover | Harry's next step / safe default |
| --- | --- | --- |
| Two missing Quote-to-Booking fixes | Applied and verified in shared development; no historical records backfilled | Do not reapply. Use the recorded ledger versions and verification scripts below. |
| Freight/dev code compatibility | Fixed and tested locally on this branch; not pushed to remote dev | Read the checkpoint, compare newer dev/hosted services before release, preserve newer code. GitHub approval is still required. |
| 35 catalogue document families | Editable layout drafts, not 35 working Booking generation choices | Map, refine, privacy-review, publish and connect one family at a time to its proper record owner. |
| HBL/HAWB | Code integration retained; latest saved sources not privacy-signed-off by this tie-off | Inspect the exact latest version/hash, static text, images and tags. Keep unreviewed sources blocked; do not overwrite newer House work. |
| Transport Original/Copy | Intentionally disabled, not an unfinished button to enable | Continue with Drafts. Obtain document-type and issuing-authority decisions from senior Jenkar staff, not from Lee's availability. |
| Booking confirmation manager draft | Earlier v11 source ownership mismatch recorded; published v10 retained | Re-read current source metadata. Restore/save a correctly owned draft through the supported source/version flow, then fictional preview/review; never relax the ownership check or publish the invalid draft. |
| Regression/demo acceptance | Mandatory checks pass; 43 existing client failures and the additional legacy fixture issue are documented | Use the exact failure list/checkpoint and tie-off note. Triage as engineering work; do not claim a regression-clean demo or ask Lee to reconstruct the failures. |

Harry can investigate and continue these technical items without Lee. Issuing decisions belong to senior Jenkar operations/authorised issuers, with the safe Draft-only rule already chosen. Release permission is a separate outstanding approval, not a missing product answer to guess while Lee is away.

### Two database issues closed before handover

- **Loaded container weight:** applied `20260925095733_stop_quote_cargo_weight_copy_to_container.sql` to shared development as hosted migration **20261001203200**. A Quote's cargo gross weight no longer becomes the container's loaded gross weight; VGM remains unknown unless separately recorded. Packages, equipment count, known cargo weight and mode guards are retained. Existing containers were not rewritten.
- **Shipper/consignee contacts:** applied `20260929132713_quote_party_contact_handoff.sql` as hosted migration **20261001203201**. Initial accepted-Quote party rows now retain source contact/email values; later reviewed Quote updates include party emails. Explicit Booking contacts and subsequent blank overrides are preserved. Unrelated party roles and manually created Bookings are not backfilled.
- Mandatory PostgreSQL/access regression now passes **143/143 + 9/9** with both cases included. Focused PostgreSQL/contact/container contracts pass **9/9**.
- Shared-development verification executes the real deployed projection and party trigger against typed party storage with fictional temporary rows, then rolls back. All five live assertions pass; the 12-operator access probe passes before/after with unchanged counts. No customer acceptance, mail delivery or full browser conversion was performed in this tie-off.
- Deployed function readback proves the only old-function changes were one container-weight expression and two Quote-sync email fields. Existing 340 Jobs, 51 parties, 26 containers and 43 active templates remain unchanged after rollback. Existing security-advisor findings are unchanged after ignoring observation timestamps; they are not waived.
- All 54 branch migration files now have matching named records in shared development. **32 use different hosted timestamps**, so this is not permission to run a blanket `db push` or rewrite migration history. The full local-file/hosted-version crosswalk is `docs/verification/2026-10-01-freight-migration-ledger.json`; the two newly applied SQL records were read back and match their local files exactly.
- Reproducible commands, recovery evidence, permission boundaries and the additional legacy fixture failure are in `docs/verification/2026-10-01-quote-handoff-tie-off.md`. That note is the next starting point, not this conversation.

## Quotes

### What we have done

- Kept the familiar Quote charges grid after submission, rather than replacing it with the old long-form saved-charge summary. Submitted charges use the saved version, with editing disabled and the same column/selected-line layout as entry.
- Preserved submitted amounts and exchange rates. Missing historic values are not backfilled from today's records or silently treated as zero. Operators create a new version to revise an issued Quote.
- Added current-user ownership defaults for new Quotes, without changing an existing explicit owner. Sender identity is separate from customer contact and customer reference.
- Corrected the PDF contact mapping to the operator who sent the Quote, rather than placing the customer reference in Contact. Cargo handling flags such as Fragile feed the customer document.
- Added mode-aware route/PDF labels and preserved repeating cargo information. Collection and delivery remain explicit shipment facts; they are not assumed from a company's registered address.
- Closed the missing contact handoff in shared development: shipper/consignee contact/email snapshots carry into initial Booking parties and reviewed Quote updates, without refilling later operator-cleared values. This does not retroactively repair existing records.
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
- Closed the missing shared-development conversion fix: cargo gross weight is no longer automatically copied into a loaded container's gross-weight field. Quantities and valid equipment choices remain; existing recorded weights/VGM are unchanged.
- Added repeatable vehicle identifiers and retained planning/operational charge boundaries. Planning changes are not automatically posted invoices or accounting entries.
- Kept the audit compact, with changed information and further detail available on demand.
- Added Booking document creation controls and retained the historical separate Draft/Final Booking confirmation files. The newer shared-development direction treats Booking confirmations as received carrier/partner files: upload them into Job documents. The reconciled picker does not generate outgoing confirmations. If an outgoing customer Booking advice is required, agree a distinct family and ownership rather than undoing this direction.
- Reconciled Draft creation for the newer House bill/House air waybill defaults and our reviewed FIATA/Air layouts. That compatibility repair is local until released; the unchanged hosted renderer still reports transport layouts unavailable.

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
- Release and verify the completed local document compatibility repair before promising FIATA/Air/House Draft generation is currently available.

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

### Important: template availability is not generation readiness

**Not all 35 catalogue templates are wired into Bookings.** They remain visible, editable layout drafts in Documents, with drag-and-drop thumbnail ordering, saved per-user preferences and the three-dot move/remove menu. Having a tile or a clean fictional preview does not make it a document that Create document can produce from a Booking. Each unfinished family still needs its own correct fields, document-specific layout review, privacy/source review, publication and workflow connection. Finance and Warehouse documents belong to those owners; do not enable every catalogue draft through a generic Booking dataset.

**House bills still need exact latest-source checks.** The latest metadata readback in this tie-off is HBL published v6 / HAWB published v5; earlier v3/v2 observations below are historical, not current instructions to restore those versions. Their static text, artwork, tags, identity and exact version/hash were not inspected or approved here. Preserve those newer sources and fail closed until a qualified source review is recorded.

**Original and Copy remain blocked for FIATA, Air and House transport bills.** This is the agreed safe default while senior Jenkar staff confirm document classification and issuing arrangements. Do not enable them for a demo, infer authority from an employee login, or wait for Lee to decide questions he explicitly cannot answer. Harry should take the structured questions in Decisions for senior Jenkar staff to the appropriate staff and keep Draft-only operation meanwhile.

### What we have done

- Matched the BoxTop catalogue and sample inventory to 35 editable draft document families. The crosswalk accounts for 189 entries: 55 matched to new families, 8 reusing existing families, 17 controlled-form cases and 109 report/undefined cases.
- Added catalogue drafts for freight invoices/proformas, packing lists, instructions, notices, manifests, warehouse outputs, vehicle handover and release requests. These are layout foundations, not 35 completed live-record generation workflows.
- Made templates visible as editable items in Documents, with drag-and-drop thumbnail ordering, saved per-user order, menu-based move/remove and recoverable removed templates. Removed the non-working six-dot control, not the tile's drag-and-drop behaviour. Operations requirements is not an operational template to restore by accident.
- Kept template editing independent of Job numbers. Word source editing, fictional-data preview, review and publication are separate from creating a document from a real Booking.
- Built a separate FIATA reference layout with the replaceable Multideck logo. Preserved the other FIATA form as a separate template, rather than substituting one for the other.
- Created clean versions of Master Air Waybill, MNG Air Waybill and FIATA -Waybill after discovering embedded customer data in their imported sources. Provider data substitution alone cannot remove live text already baked into a Word file.
- Added source-fingerprint privacy checks and fixed fictional preview fixtures. Both the library thumbnail and manager preview must use only a reviewed clean source; unchecked sources must fail closed.
- Added all-page Draft watermarking, issue metadata and retained PDF versions. Template Draft/Published and document Draft/Final are different lifecycles.
- Earlier shared-development work published four reviewed clean transport revisions and generated four saved Draft PDFs using recorded Booking cargo, equipment and allocation data. These historic files remain visible; the newer hosted renderer still blocks transport generation until the completed local repair is released.
- Preserved the newer own-issuer House bill of lading (HBL) and House air waybill (HAWB) defaults, protected carrier/licensed layouts, historical source retrieval, restore-default, immutable version-specific source paths, legal-entity/Admin branding and exact-source approval. Added the missing compatible client contract rather than reverting those safeguards.
- Restored the Draft-only review/mapping/freeze flow locally and strengthened Booking/House preview privacy. Reviewed defaults and earlier clean revisions receive fictional server-owned samples; unreviewed sources cannot reach the preview provider.
- Kept Original and Copy blocked for transport forms while Jenkar confirms their type and issuing arrangements. Any active Jenkar employee with the existing access was Lee's preferred employee policy; that is not, on its own, authority to issue a licensed/carrier document.

### Compatibility resolved; release still outstanding

- Fresh readback is renderer v63 / studio v78, newer than the first checkpoint's v62/v73. The local repair is based on those newer sources, not our old v61/v71 release.
- The exact saved version and source hash now travel from the completed manager preview to publication. Changed source/template or a late preview invalidates that review. The server's exact-source approval and permission checks remain intact.
- Booking and House preview routes now check reviewed source fingerprints as well as required tags; inspected fixed default text/artwork and server-owned fictional values stay separate from operational job data. Unknown uploaded Word files require a privacy review before they can be previewed. This deliberately means Word editing alone does not grant preview/publication approval.
- Draft transport readiness is restored locally for the two FIATA layouts, MAWB, MNG AWB, HBL and HAWB, only when a published source matches the reviewed fingerprint. The renderer freezes the mapped source and current issuer identity before conversion/save, and rejects a stale Booking review or selected template version. Original/Copy remain blocked.
- Received Booking confirmation is no longer an outgoing generation choice. The restarted local Chrome picker on JE0991153 shows the two FIATA forms and HBL, all currently Not ready to generate against the unchanged hosted renderer; historic four Job files remain listed. The safe block is expected until release.
- Five already-applied hosted migrations are now retained verbatim under their matching local names: final readiness `20261001171457`, review identity `20261001171500`, confirmation price label `20261001175904`, version sources `20261001180929`, House review layouts `20261001185549`. No shared database was changed and these must not be applied again.
- There is no unresolved Git conflict or known publishing-contract incompatibility left for Harry from this repair. Fresh deployed generation, provider conversion and saved-file persistence still need approval and real verification. Do not confuse that remaining release gate with a code merge conflict.
- Earlier read-only template inspection found separate hosted metadata/preview work: Booking confirmation v11 Draft pointed at v10's source object, so the reader rejected it even though published v10 existed. Re-read that state before a draft-only repair; shared-data approval is still needed. Do not relax source ownership or publish the invalid draft. Earlier HBL v3 / HAWB v2 observations are superseded by this tie-off's HBL v6 / HAWB v5 metadata. The latest exact source fingerprints still need review by the continuing engineer; do not replace newer layouts blindly with defaults.

### Document-flow judgement retained for Harry

- Adopt the newer received-confirmation workflow, own-issuer House defaults and protected issuer forms. They express document ownership more clearly than treating every layout as an interchangeable editable Job PDF.
- Keep our strict static-source privacy gate and immutable reviewed Draft snapshots: fictional dynamic fields cannot clean customer text or imagery already baked into an uploaded source. Do not remove these checks to make a demo thumbnail appear.
- Our four reviewed FIATA/Air forms retain their normal-flow cargo/equipment/allocation schedules. The newer HBL/HAWB projection currently has no explicit per-container split-allocation schedule. Review whether to add one to the House layouts; preserve unknown weights and VGM rather than distributing them automatically. This is a product enhancement to assess, not a reason to reject the clean integration.
- House Drafts need a recorded legal issuer and one unambiguous main carriage. Multiple main-carriage consignments require an agreed cargo-allocation document scope; neither route order nor template choice is an adequate substitute.

### Guide to editing templates

1. Open Documents. Pick the template tile, or choose Manage templates and select the template by name. Ordering/removal belongs in the tile's top-right menu.
2. Check whether the template is Draft or Published. For a published layout, edit a new draft revision; keep the current published layout in use until the replacement is reviewed.
3. Download template source and open the DOCX in Word. Keep the Carbone field tags and repeating-row markers intact. Carbone fills an edited Word layout; it is not an in-browser drag-and-drop page designer.
4. Edit layout, labels or the replaceable company-logo area. Do not insert customer names, actual addresses, signatures or issued references into reusable source text. Use approved placeholders and fictional examples only.
5. Upload edited Word source where the family allows editing. MAWB/MNG/FIATA issuer sources are protected in the newer studio; use the approved issuer-source process rather than bypassing it. HBL/HAWB defaults are the own-issuer Draft path. A successful upload/save is not publication. Preserve the source version and hash that will be reviewed.
6. Preview with server-owned fictional sample data in Manage templates. A Job number is not needed. If the source is not privacy-reviewed, the preview stays blocked: inspect static text, metadata and artwork, then add only that exact clean fingerprint and its safe fixture through an approved development release. Do not weaken the guard or whitelist by filename. The older catalogue README's manual sample-JSON instructions are historical, not permission to feed live data into previews.
7. Inspect every page: repeated cargo/equipment, long addresses, page breaks, logos, static text, unresolved tags and Draft marking. Check thumbnails as well as the full preview.
8. Mark I inspected the preview only for that exact version/source. Publish reviewed version after permissions and source checks pass. Changing the draft must invalidate the old review.
9. After the compatibility release is verified, open Booking > Documents > Create document, choose an eligible published transport layout and review the record data. Draft is the only transport issue option. Add received Booking confirmations through the document upload flow instead. Do not generate from an unpublished catalogue draft.
10. Save a separate PDF version. Refresh and reopen it through authorised download. Never relabel or overwrite an earlier issued file.

Step 8's publishing contract is fixed locally and awaits the approved frontend release. A Job-data Studio preview does not authorise template publication; publishing controls there remain disabled with a Manage templates instruction. A failed publication must remain visibly failed. Backend history/version-source/default-restoration routes are preserved; do not claim every route has a corresponding new UI control or fresh live acceptance test in this repair.

### What is still left to do

- Release the locally reconciled renderer/studio/frontend and run actual approved Draft generation for the four earlier layouts and the newer HBL/HAWB defaults. Check required issuer/source facts, frozen mapping, all-page watermark, private save/download and refresh/reopen. No fresh Carbone/save transaction was performed in this repair.
- Obtain approval for the narrow Booking confirmation draft-source metadata repair and inspect the newer HBL/HAWB Word sources. The compatibility release does not modify those records or automatically privacy-approve/publish them. This template readiness work is not an outstanding branch merge conflict, but is relevant to a demo of the manager/House documents.
- Review each specialist layout with the relevant operators. Many catalogue drafts intentionally look similar and need family-specific layout work. Carrier/licensed forms must not be recreated and presented as authorised Originals.
- Wire generation to the correct record owner: immutable issued Quote snapshot, Booking operational facts, Finance invoice/tax/numbering, Warehouse stock facts and consolidation records. A generic Job dataset is not sufficient for every section.
- Prioritise Finance invoice/proforma generation and retention with Finance staff. Preserve posted-invoice correction rules; a Booking Original toggle must not bypass invoice posting or tax controls.
- Complete each family with real authorised generation, persistence, refresh/reopen, failure, version retention and private-data exclusion checks. Representative Carbone previews are not all-family operational sign-off.
- Keep Customs certificates/declarations, dangerous-goods declarations, CMR/FCR and release authority gated to their qualified workflows. A release request is not a release approval; a working commercial invoice is not the customer's issued original.
- Add Dexter only when authorised reads, approved writes, deterministic events and audit are implemented together. Template review, transport generation and Original/Copy remain manual-only exceptions, not claimed AI capabilities.

## Decisions for senior Jenkar staff

Lee cannot confirm these before annual leave. **These are decisions for senior Jenkar staff/authorised issuers, not questions that require Lee to return.** Harry should obtain answers rather than choose issuing rules based on a template title or a watermark. Keep transport Draft-only until the answers are agreed and implemented; this safe default lets technical work continue without enabling unapproved issuance.

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
- Exact reviewed template identity, immutable source history, legal-entity/Admin branding and distinct House layouts are useful newer shared-development safeguards now integrated locally. Final Booking readiness SQL is retained, but outgoing received-confirmation generation remains explicitly disabled by the newer workflow.
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
- After compatibility repair: repeated frontend build and both Deno service type checks pass; the mandatory database runner again passes 141 checks plus 9 contracts. Enhanced exact-source template approval and the isolated Finance migration manifest tests pass.
- Compatibility tests: 25 backend handler/studio/transport checks and three new client publishing/stale-preview checks pass. The actual service handlers run with isolated fictional provider, Storage and RPC mocks; this is not a live Carbone conversion or deployed transaction.
- The renderer handler check now exercises all six transport codes. The real PostgreSQL source/freeze fixture also exercises the newer HBL/HAWB freeze function, preserving issuer/audit metadata and rejecting the wrong shipment, route, layout, Original and repeated overwrite.
- Latest full client run: 920/963 pass, the same 43 failing titles. The three new client checks pass; existing failures were not removed or relaxed.
- Restarted the local server and reloaded Chrome: updated transport-only picker, retained files, safe blocked generation, dropdown/dialog Escape handling, 390 × 844 blocked-state layout without horizontal overflow, no framework overlay and no captured warning/error logs. The temporary viewport was reset. No document or operational record was saved.
- Final narrow database tie-off: mandatory checks pass 143/143 + 9/9, focused checks 9/9, deployed fictional trigger/typed-storage and container projection 5/5, exact function changes verified, 12-account access counts unchanged, two exact SQL history records read back, 43 active templates retained. See the tie-off note for limits; this does not certify browser Quote acceptance or the document renderer.

### Not verified by this review

- Hosted frontend deployment, production or customer delivery.
- A fresh Quote response transaction, customer mail delivery or notification toast.
- New Booking persistence, invoice posting/payment, OCR or iCustoms submission.
- All 35 document generation families, legal Originals/Copies or the released transport happy-path mobile/keyboard workflow. The local blocked-state mobile/keyboard check is not a substitute.
- Fresh approval/render/save/download against deployed compatibility services; those services have not been released in this review.

### Existing client failures to triage

- The 43 failures include Quote/Booking mode and lookup contracts, standalone Customs, shared tables/gallery, Admin/navigation, Finance route expectations, direct-read bounds, Inbox/Dexter and wizard/theme contracts.
- Some tests inspect source structure, but do not assume all failures are stale tests. The direct-read-bound and permission-related cases require substantive review.
- The comparison establishes the merge did not add these failures under the same runner. It does not make the current application fully regression-green.
- An additional optional run of `booking-stable-items-postgres.test.mjs` fails during fixture loading: `booking-cargo-client-fixture.mjs` transforms a helper with local imports to CommonJS, then evaluates it without `require`. A temporary bundled diagnostic reached further pre-existing baseline/fixture column collisions. The diagnostic edits were reverted; no partial harness repair is shipped. The exact reproduction, file names and next repair step are in the tie-off note. This failure was not counted as a pass, is separate from the 43 client failures, and is not an error in either of the two deployed migration checks.

## Release and recovery plan

1. Re-fetch dev and inspect current local work before doing further edits. Keep this branch and checkpoints; do not reset or discard concurrent work.
2. Retrieve current shared-development renderer/studio and dependencies again. They can change while this handover is being read. Compare with local changes and preserve newer routes/protections.
3. Confirm the five imported hosted migration files match their already-applied SQL. The two approved handoff fixes are now applied as 20261001203200 / 20261001203201 and must not be applied again. Use the complete 54-file ledger crosswalk and tie-off evidence to check historical local/hosted filename differences; name matches alone are not blanket SQL-equivalence proof. The document compatibility repair needs no additional shared-development migration. Do not blindly push locally pending migrations, edit applied SQL or apply unrelated schema changes.
4. Review the locally prepared compatible frontend and full document-studio/render-document dependency bundles. Local access/privacy/exact-source/stale-review/failure checks are recorded above. If newer work appeared since readback, reconcile it before release; do not overwrite it.
5. Report the exact target branch/environment, required migration/function/template order, affected workflows and recovery plan. Ask Lee for confirmation before GitHub push or shared/production writes.
6. For this compatibility release, after explicit approval push/merge the feature into dev, deploy the reconciled studio/renderer with complete helpers to shared development and update the intended dev frontend. No new template publication or database mutation is required/included by this repair. Obtain separate approval for any additional schema or published-selection changes. Re-read deployed versions.
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
- Fresh document-service versions used for compatibility: renderer 63, studio 78. Other services read at the earlier checkpoint: bookings-workflow 64, quotes-workflow 101, quote-response 49, agent-dexter 311, document-download 55, customs-invoice-ocr 81, finance-accruals 29. Recheck before release. The public quote-response token endpoint intentionally differs from signed-in JWT endpoints.
- Current checkpoint details and the complete client failure list are in `docs/verification/2026-10-01-dev-merge-checkpoint.md`.
- Final handoff-fix evidence: `docs/verification/2026-10-01-quote-handoff-tie-off.md`; full migration crosswalk: `docs/verification/2026-10-01-freight-migration-ledger.json`; pre-release recovery definitions: `docs/verification/2026-10-01-quote-handoff-pre-release.json`; rolled-back deployed check: `supabase/tests/quote-handoff-live-verification.sql`.
- Build: run `npm run build` inside `multideck.client`. Backend/access: `node supabase/tests/run-data-access-regression.mjs` with PostgreSQL 17 available. Client: `node --experimental-strip-types --test multideck.client/tests/*.test.mjs` from repository root, using the configured project Node runtime.

## Continuation prompt for Harry

Please continue the Multideck freight work from this handover, its checkpoint report and the final quote-handoff tie-off note; do not rely on the old chat. First verify the branch, working-tree changes, latest dev and hosted document-service versions. The known document-service compatibility repair is implemented and tested locally against renderer v63/studio v78; do not redo it or deploy stale bundles. The two missing Quote-to-Booking database fixes are applied and verified in shared development as 20261001203200 / 20261001203201: do not reapply them. Use the 54-file ledger crosswalk, preserving applied history and newer work. Preserve received-confirmation upload semantics, newer House layouts/protected issuer forms, legal branding, exact source-review identity, static-source privacy and our frozen Draft transport mappings. The 35 catalogue families are editable draft layouts, not 35 completed Booking generation choices. Inspect the exact latest House sources before approving them; the tie-off metadata was HBL v6 / HAWB v5, not a permanent latest-version claim. Keep FIATA/Air/House Originals and Copies blocked; obtain the issuing answers from senior Jenkar staff rather than waiting for Lee. Prepare/confirm any future release scope and recovery plan and obtain the required explicit permission before GitHub/shared writes. Triage the 43 unchanged client failures and documented legacy PostgreSQL/Dexter fixture mismatch. This handover is self-contained engineering context, not demo-wide readiness or permission to send mail, accept real terms, post invoices, make payments or submit Customs. Preserve issued snapshots, generated versions and private data.
