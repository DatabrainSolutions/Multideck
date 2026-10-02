# BoxTop document catalogue draft library

35 editable Word layouts have been saved as unpublished drafts in the connected Multideck shared-development Documents library. They are a starting point for layout review and later field wiring, not production-ready document issuance.

## Where to find them

Open Documents, then Manage templates. New entries end with **catalogue draft**. Each has a saved Word source that can be downloaded, edited in Word and uploaded again. The Quote layout is version 3; the other catalogue drafts are version 2. Existing published Booking confirmation, FIATA Bill of Lading, Master Air Waybill and MNG Air Waybill layouts were left unchanged.

For a fictional preview, paste the matching file from `samples/` into **Preview sample data (advanced)**, then choose **Preview draft**. The current default preview data is Booking-specific and does not populate these new document contracts. Do not publish a catalogue draft until its fields, permitted source and issuance rules have been reviewed.

## What the matching produced

| BoxTop catalogue entries | Treatment |
| --- | --- |
| 55 | Matched to the 35 new draft layout families |
| 8 | Reuse existing Booking confirmation, FIATA Bill of Lading or Master Air Waybill templates |
| 17 | Controlled forms requiring authorised layouts, terms, evidence or qualified review |
| 109 | Reports or insufficiently defined outputs requiring data, filters, calculations and access rules |
| 189 | Total entries accounted for |

Several menu options share one document family. This is a proposed relationship, not proof that every BoxTop variant is equivalent. For example, release-related entries are matched to **request** layouts, not documents granting release authority. A vehicle handover record is an additional sample-derived layout with no corresponding BoxTop row.

The source workbook is `BoxTop-document-catalogue.xlsx`, Catalogue rows 6 to 194. The reference-folder inventory contains 107 relevant files. Selected booking, shipping instruction, transport order, air waybill and vehicle-form examples informed the draft field patterns; all 107 files were not individually reviewed. These layouts are new drafts, not replicas of carrier or licensed forms. Original samples, customer data, carrier terms and signatures were not uploaded.

`TEMPLATE_INDEX.md` lists every draft, its proposed source, matching BoxTop rows and sample-file references. `catalogue-crosswalk.csv` and `catalogue-crosswalk.json` retain a decision for all 189 catalogue entries, including the entries not turned into new layouts.

## Draft families

- Quotes and Finance: editable customer quotation, freight invoice, proforma invoice, advice of charges and remittance advice.
- Bookings and transport: arrival notice, delivery confirmation, transport instructions, booking and shipping instructions, collection and delivery notes, courier docket, cargo label, job sheet and pre shipment advice.
- Cargo and Customs handoff: packing list, clearance instructions, Customs source manifest, container loading manifest and commercial invoice working draft.
- Consolidations: air, sea, general and agent manifests.
- Warehouse: goods in, goods out, pick list and inventory report.
- Vehicles: handover record with repeatable VIN or chassis, model, registration, mileage and condition fields.
- Requests: ERTS release, container PIN and cargo release requests.

## Boundaries preserved

No catalogue draft was published, wired to real records or used to issue a document. No job, invoice, payment, notification or existing template was changed. There was no GitHub push, deployment or database migration.

Customer commercial invoices remain separate from Multideck freight invoices. A generated commercial invoice working draft is not evidence of a customer-issued original. Requests do not confer release authority. A warehouse goods in note is not a FIATA FCR. Road consignment instructions are not an approved CMR. Dangerous goods declarations, certificates of origin, EUR1, ATR and other controlled forms remain review-gated. No signatures or compliance approvals are manufactured.

Unknown weights and VGM remain unknown. Cargo-to-container splits do not derive container loaded weight or VGM. Collection and delivery points must be explicitly recorded rather than inferred from party addresses.

## Verification completed

- All 35 source DOCX files, 35 fictional filled layouts and a two-page loading-manifest stress fixture were rendered. All 73 page images were visually inspected.
- All template tag paths resolve against their matching fictional JSON, repeating tables have closing loop markers and source hashes match the manifest.
- All 35 saved Word sources were checked in the template UI. A browser reload still showed all 35 catalogue drafts.
- Quote, freight invoice and split-container loading-manifest drafts returned PDF previews through the connected Carbone service. This is representative preview validation, not an end-to-end test of all 35 document families.
- Downloaded Quote and freight invoice Word sources matched the local source hashes.

`library-verification.json` records the observed draft-library results. Internal render files are excluded from the review package and from Git.

## Next stage

First review the names and layouts with Lee and the relevant operators. Then wire an authorised source adapter for each family, beginning with Finance invoice and Booking operational documents. The new dev document studio can be reused for Word editing, preview, review and publishing, but its current Job-based generation cannot safely populate Quotes, Finance, Warehouse or consolidation data without those adapters.

Use the immutable submitted Quote snapshot for customer quotations, customer-facing prices only, Finance-owned identity and tax totals for invoices, saved load-plan allocations for loading manifests and recorded Warehouse facts for stock documents. Each adapter must preserve record permissions, approved branding, audit and document-version history. Specialised FIATA and air waybill issuance needs an additional operational review before being offered as a selectable output.

## Local maintenance

`build-catalogue.py` creates the layouts, fictional fixtures and crosswalk from `catalogue-specs.json`. Running it rewrites Word binaries; do not upload a regenerated source without review. Use `--refresh-fixture CODE` to refresh a fictional fixture without changing uploaded Word sources.

`verify-catalogue.py` checks coverage, tag paths, loops, source hashes and key unknown-weight safeguards. Its optional `--render` flag renders all layout fixtures with the bundled document runtime. `package-catalogue.py` produces the review index, CSV and a ZIP of editable templates, fictional samples and mapping notes; it excludes original customer examples and internal QA renders.
