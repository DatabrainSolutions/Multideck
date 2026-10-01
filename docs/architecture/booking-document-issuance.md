# Booking document status and issuance

Research checked 1 October 2026. This is a product workflow recommendation, not an assertion that every freight document follows one legal rule.

## Two independent lifecycles

- A template is Draft or Published: whether its layout has been reviewed for use.
- A generated document is Draft, Final, Original or Copy: what this saved file represents.

Changing a watermark does not issue a negotiable instrument. A completed job is not a universal prerequisite for issuance: loading evidence, authority and the document's own rules matter instead.

## Recommended choices by document family

| Family | Proposed workflow | Boundary |
| --- | --- | --- |
| Booking confirmation, packing list, instructions, arrival notice and operational manifests | Draft for review; Final after source review | Final is reviewed information, not proof of carriage or legal authority. This is our product recommendation. |
| House bill / negotiable FIATA FBL | Draft; controlled Original set; Copy of the stored issued document | Agree issuer authority, approved particulars, on-board evidence where applicable, original count, release, surrender and amendment/reissue rules. Never regenerate a Copy from current Booking data. |
| Non-negotiable sea waybill | Draft; issued/final document; stored copy | Do not apply a negotiable bill's original-set or title-transfer rules automatically. |
| Master/House air waybill | Draft; carrier/agent-approved issue and copies | Respect the issuing party and paper/e-AWB workflow; do not treat an AWB like a negotiable ocean bill. |
| Freight invoices | Draft; Finance posting/issue | Invoice numbers, tax and corrections belong to Finance. Proforma is a separate document, not an Original toggle. |
| Customs declarations, certificates and signed compliance documents | Their authorised workflow | A Booking PDF cannot substitute for provider acceptance, certification or a signature. |

## Evidence and limits

- [CargoWise electronic bills of lading](https://cargowise.com/solutions/electronic-bills-of-lading/) separates carrier Master issuance from forwarder House issuance and supports controlled amendments and surrender. This supports an issuance lifecycle rather than a cosmetic Original label.
- [FIATA digital bills of lading](https://fiata.org/digital-bill-of-lading/) requires verified issuers and provides identity, integrity and audit safeguards. A recreated Word layout does not establish authorisation to issue an FBL.
- [IATA e-freight/e-AWB](https://www.iata.org/en/programs/cargo/e/efreight/) describes the AWB carriage contract and removal of paper requirements through the applicable e-AWB agreement. Air and ocean workflows are not interchangeable.
- [OOCL/CargoSmart Draft B/L review](https://moc.oocl.com/onlinehelp/CustomerHelp/FlashHelp/CargoSmartHelp_All_Users/Bill_of_Lading_Document_Manager/process_draft_bills_of_lading.htm) has permissioned review, change requests and acceptance of a particular draft before preparing the Original.
- [Maersk shipping-instruction review](https://www.maersk.com/support/faqs/review-step-shipping-instructions) checks required parties and cargo particulars before a Draft B/L is available.
- No public BoxTop issue-status specification was verified. The supplied document catalogue is coverage evidence, not authority for Original issuance.

## Carbone implementation

[Carbone's current render API](https://carbone.io/documentation/developer/http-api/generate-reports.html) supports PDF `convertTo.formatOptions.Watermarks` (multiple marks from version 5.3.0). Omitting page bounds applies the marking to every page, independently of the Word layout.

Booking Draft uses a restrained diagonal DRAFT and a DRAFT - FOR REVIEW ONLY footer. Final uses a small FINAL footer. Marked Booking output is PDF only. All status choices are checked on the server, frozen alongside the source snapshot and recorded in generated-file metadata. Each render retains a separate file/version; historic documents are not relabelled or overwritten.

The initial release enables Booking confirmation Draft/Final. A provisional Booking cannot produce Final. FIATA/AWB choices explain their pending readiness; generation is blocked until clean sources, complete repeating cargo/equipment mappings and publication are reviewed. Original and Copy are explicitly blocked on the server.

## Dexter exception

Document issue-status reads, Draft/Final generation and legal Original/Copy issuance have no dedicated safe Dexter adapter. They remain manual under Booking > Documents > Create document. Chat and Watching for you must report this unsupported limitation; neither may infer issue status or promise generation monitoring from Booking updatedAt/status. Add an authorised read domain, approved action and deterministic event adapter together before exposing them.

## Release and recovery

Apply only the issue-markings migration to shared development, then deploy the renderer and refresh the local frontend. A protocol check prevents an older renderer from silently ignoring the issue status. Production, GitHub, published layouts and issued files are outside this release. If the provider rejects the watermark options, fail the render rather than silently saving an unmarked draft. Restore the previous renderer if necessary; keep the additive metadata migration and all saved files.

### Shared development verification, 1 October 2026

- Migration registered as `20261001145513_booking_document_issue_markings`; the local filename matches the shared-development history and its SQL is unchanged.
- `render-document` version 60 deployed and read back byte-for-byte; existing hosted authentication helper preserved.
- `agent-dexter` version 311 contains only the two new chat/watch unsupported instructions on top of deployed version 310; all deployed dependencies preserved.
- Local frontend build passes. Booking JE0991153 produced a saved Draft v1 and Final v2; both files remain in Job documents with frozen issue metadata. Draft downloaded and rendered with the diagonal watermark and review footer; Final downloaded with FINAL and no DRAFT.
- The generated-PDF viewer uses an authorised download into a short-lived local Blob; stale loads and closed previews revoke their Blob URLs. Downloads renew authorisation rather than reusing preview links.
- PostgreSQL access regression: 140/141 pass. The separate Finance Director dashboard fixture expects September cash 800/300 but returns 0/0; reproduced independently without this migration and left unchanged. Focused document/issue/access tests pass, including foreign/unlinked actor denials, Original rejection, frozen issue selection, version retention and provisional Final rejection.
- Frontend changes are local on port 3000; this is not a hosted frontend or production release.
- Desktop and 390 × 844 creation-dialog checks pass; the mobile dialog has no horizontal overflow. Chrome console error/warning capture is empty for the final flow. Escape closes the review without creating a file; FIATA selection explains the readiness block and Original/Copy are disabled.

## Transport Draft extension — shared development

Jenkar requested that FIATA remain Draft-only until it confirms whether the mixed FBL/Waybill form represents a negotiable FBL or non-negotiable FWB. Its preferred employee policy is any active Jenkar employee with the existing document-generation and Booking access; no additional manager-only rule is introduced. That preference is not evidence of a carrier/FIATA issuing arrangement. Originals and Copies remain server-blocked for all transport templates in this extension.

Four separate Word revisions cover Master Air Waybill, MNG Air Waybill, FIATA -Waybill and FIATA Bill of Lading · reference layout. Their first-page forms and retained conditions stay in place; a normal-flow schedule carries full saved party addresses, all cargo lines, marks/commodity/handling, all relevant equipment and recorded cargo splits. FIATA retains the Multideck placeholder logo, replaceable in the Word layout, without assuming an authorised company-brand mapping. Draft-only copy labels and the existing mandatory all-page Carbone watermark prevent these revisions from being mistaken for issued Originals.

The service uses an authorised, allowlisted Booking projection rather than the old general document dataset. It requires one main carriage leg, a current review token, an explicit review confirmation and the exact reviewed published source fingerprint. Changed Booking data requires another review. Unknown weights, VGM, signatures, security clearance, freight terms and issuing particulars stay blank. Airport IATA codes come only from one unambiguous active airport reference; they are not inferred from UN/LOCODE text. Cargo-line chargeable kg and an explicitly recorded shipment override remain independent of gross kg and package splits. Private costs and internal notes are excluded.

The existing shared-development AWB tables include issuing-agent, IATA-registration and carrier-agreement fields, but no dedicated AWB issue RPC/workflow was found. They are a foundation to reuse after the issuing arrangement is agreed, not evidence that current Bookings have authorised AWBs. Future Copies must use the stored issued snapshot/file, not freshly mapped Booking data; ocean original-set/surrender rules must not be applied to air waybills.

The shared-development release uses the additive `20261001161514_transport_document_draft_mapping` migration, the renderer extension, four additional fixed fictional preview fixtures and four reviewed layout revisions. Existing published revisions and generated files remain retained. Apply the migration before the renderer; update the studio preview catalogue before reviewing/publishing the layouts. The local frontend enables only published, fingerprint-approved Draft layouts reported by protocol 2. Older services remain compatible with Booking confirmation Draft/Final and keep transport choices blocked.

Recovery is to restore the previous renderer and previous published layout selections. Keep the additive schema and all saved files; do not rewrite previous snapshots or issued documents. Production and GitHub are outside this release. Dexter transport review/generation and Original/Copy remain the documented manual-only exception for both chat and Watching for you.

### Shared-development transport verification, 1 October 2026

- Applied only `20261001161514_transport_document_draft_mapping`; confirmed its registration before resuming an interrupted release. The applied SQL was not edited.
- Deployed and read back `render-document` v61 and `document-studio` v71 byte-for-byte. Preserved their existing hosted authentication dependencies; the studio change only extends its fictional preview catalogue.
- Uploaded, rendered with fictional samples, inspected and published through the real template manager: Master Air Waybill v8, MNG Air Waybill v8, FIATA -Waybill v7, and FIATA Bill of Lading · reference layout v3. All four published source SHA-256 values match the reviewed renderer allowlist. Older versions remain retained.
- Real Booking generation completed for both FIATA layouts on JE0991153 and both air layouts on JI0991152. All four private saved PDFs were downloaded and inspected: 2, 3, 13 and 3 pages respectively; every page has DRAFT and the review footer, with no unresolved data tags. The reference FIATA retains the replaceable Multideck logo. Air PDFs include verified ERF/LGW codes and recorded Fragile handling; missing chargeable weight stays blank.
- Frozen-source readback confirms each sea Draft includes one cargo line, two equipment rows and both recorded allocations. Air Drafts include the single recorded cargo line and no invented equipment or allocations. Existing Booking confirmation Draft/Final files remain in the document list.
- Fixed the saved transport rows' Open PDF action and verified authorised reopening after a refresh. Missing review confirmation produces a visible error and focuses the checkbox. Original and Copy options remain disabled; server and PostgreSQL tests cover their rejection and stale-source/access denials.
- The real mobile transport review measured 364 px within a 390 px viewport, with no horizontal overflow; saved MNG successfully from that review. Temporary viewport overrides were reset. Chrome warning/error logs were empty for the tested flows.
- The final frontend build passes, retaining existing chunk-size/dynamic-import warnings. The focused PostgreSQL/transport checks pass after matching the migration filename to deployed history. The independently reproduced Finance dashboard regression noted above remains outside this change.
- Frontend controls are local on port 3000, connected to the updated shared-development services. Production, GitHub and legal Original/Copy issuance are unchanged.
