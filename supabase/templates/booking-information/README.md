# Booking Confirmation template and data mapping

This folder holds the `JOB_CONFIRMATION` Carbone DOCX source. Version 4 was published in the shared dev Documents template library on 29 September 2026 after a one-page fictional Sea Export preview. The Booking Documents tab is the review and PDF-generation entry point. The shared-dev Booking Edge Functions were released on 29 September 2026; the local Chrome flow saved and downloaded versions 1 and 2 from safe demo Booking `JE0991133`. A generated document keeps its own storage object, Booking-local version number, template version ID, and reviewed data snapshot so that subsequent charge edits do not rewrite old PDFs.

The template uses a compact Jenkar-style confirmation layout: typographic wordmark, party boxes, a booking-information grid, transport and shipment tables, then customer selling charges. The 13 ordinary fictional mode/direction and partial-service samples render on one A4 page locally. The 35-cargo-line stress example uses two pages so no shipment or price details are cut off; its table header repeats and rows stay together. The wordmark is text until an approved Jenkar logo asset is available.

## Data and privacy contract

`document_api.booking_confirmation_review` and `document_api.prepare_booking_confirmation` in `20260924133000_booking_confirmation_scope_and_snapshot.sql` are the only data sources for this template. The latter recomputes the review token at render time and replaces the generic render dataset with a customer-safe snapshot. The browser cannot submit its own prices or document text.

- `bookingConfirmation.scope` selects Collection, Main transport, and Delivery independently. An unselected part is absent from the customer document. Routes represent the work the operator records for Jenkar; the customer's onward work does not need a route.
- Collection and Delivery use saved addresses, routing pickup/delivery dates when present, otherwise Booking ready/required-delivery dates, and customer-visible remarks.
- Date-only collection/delivery values are formatted by the server so the renderer cannot shift them to the previous day. Timed route departures/arrivals are printed explicitly in UTC, matching the Booking route editor.
- Cargo supplies description, marks and numbers, packages, package type, and gross weight. Shared special instructions are customer-visible.
- The reviewed mapping reads the Booking's saved direction, overall mode, shipment type, Incoterms, and primary shipper/consignor and consignee name/address. Shipment type falls back to the accepted Quote snapshot for older converted Bookings when the editable Booking field is empty. It does not copy private contacts or identifiers into the PDF.
- Each saved routing step keeps its own mode. Air displays flight and MAWB/HAWB; Sea displays vessel, voyage and MBL/HBL; Road displays vehicle, trailer and CMR; Rail displays rail service and CIM/SMGS. Carrier name, carrier booking reference and service level appear when saved. Stale fields from a different mode are excluded. A mixed-mode Booking can show different details for each leg.
- Recorded equipment appears only when it has a number and its kind matches the overall mode or an active routing step: container, ULD, vehicle, trailer or wagon, with its type. No equipment is invented for an unassigned Booking, and equipment retained from an unrelated previous mode is omitted.
- Customer selling prices come from the current active, customer-visible freight costing lines, including inherited Quote and later Booking lines. They do not add the original Quote total again. Buying prices, internal-only lines, route carrier notes, discarded charges, and unselected service parts are excluded.
- Provisional Bookings cannot publish a price. An In-progress Booking can print confirmed customer selling prices only after the operator checks the review confirmation; otherwise it prints “Price to be confirmed.” This is a document confirmation, **not** a change to the Booking's financial records or the accepted Quote.
- `Prepared by` identifies the current operator. This is not a signature or approval.

The Booking Documents feed lists every generated version. The existing authenticated document-download boundary supplies short-lived preview/download links. Retain each storage object and its `DOCBGD_TemplateVersionID` for future email attachment. Email delivery is deliberately not implemented here.

## Local build and approval boundary

Regenerate the DOCX with the workspace Python runtime using `build-docx.py`. The template uses Carbone tags against `data.bookingConfirmation` and `data.customer`. Review the generated DOCX in Word/LibreOffice and verify populated Air, Sea, Road, Rail, partial-service, Provisional, multiple-currency, and multi-page examples in a **draft** Carbone environment before publishing.

Run `make-review-samples.py` to regenerate the 12 fictional mode/direction preview files in `samples/`, plus the provisional and long multi-page cases. These are preview inputs, not proof of a successful render. All 13 ordinary fictional cases rendered on one page locally after the mode mapping; the 35-line stress case used two pages. The dev Documents preview of version 4 also rendered Sea Export on one page. Safe demo Booking `JE0991133` subsequently produced a one-page Sea Export PDF in Chrome; version 2 shows the accepted Quote's `FCL` shipment type and remains beside version 1 on the Booking.

The additive mapping migrations were approved and applied to shared dev as `20260929095217_booking_confirmation_parties`, `booking_confirmation_equipment_mode`, and `booking_confirmation_shipment_type_source`; none changes charge-code or nominal mappings. Version 4 is the current published dev template. Shared-dev `bookings-workflow` v64 and `render-document` v59 are active. The local Chrome flow against shared dev saved a real Booking PDF; frontend deployment, GitHub push/merge, and the complete multi-stage journey remain separate release and acceptance steps.

Managers can now use **Edit as new template** in Documents to make a separate Booking Confirmation draft from the published Word source. No Job number is needed to edit a template. Move or resize its boxes and tables in Word, upload the edited DOCX, preview it with fictional Booking data, and publish it after review. The original published source and PDFs stay unchanged. Each published layout appears separately in the Documents template library and in the Booking PDF review selector; unpublished drafts are excluded from generation. The shared-dev `booking_confirmation_template_choices` migration and `document-studio` v64 support this path. `JOB_CONFIRMATION_LAYOUT_2` was copied and its Word source downloaded and validated in Chrome, but it remains an **unedited draft**, not a published choice. Carbone supplies the data and render engine; box positioning remains a Word document edit, not an in-browser drag canvas.

## Booking screen to PDF field map

| Booking screen | Reviewed PDF data | Rule |
| --- | --- | --- |
| Booking ref, Direction, Mode, Shipment type, Incoterms, Customer ref | Header and Booking information grid | Saved Booking values; direction does not require a separate Word source |
| Customer, Shipper, Consignee | Party grid | Customer name and primary shipper/consignee name/address only |
| Collection, Main transport, Delivery | Party grid, route table, dates | Selected service scope; each route retains its own mode and planned UTC dates |
| Route carrier, booking ref, transport and master/house refs, service level | Service and references cell | Labels and fields selected by each route mode; private carrier notes excluded |
| Numbered transport equipment | Transport equipment table | Only numbered saved equipment; no internal notes or costs |
| Cargo and customer selling charges | Shipment and charge tables | Active customer-visible values only; unconfirmed prices hidden |

The default conditional template covers import, export and cross-trade. The mode-specific difference is the route and equipment data, including mixed-mode legs. A separately published layout is available when a genuinely different customer-facing design is wanted, while every layout still uses the same reviewed Booking data and approval rules.

Dexter/Watching parity: this operation intentionally requires an interactive operator review and a document snapshot. It is not a background watch or an allowlisted Dexter write; no autonomous PDF generation or customer delivery is added.
