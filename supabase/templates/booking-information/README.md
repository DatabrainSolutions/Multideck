# Booking information PDF release candidate

This folder holds the **unpublished** `JOB_CONFIRMATION` Carbone DOCX source. The Booking Documents tab opens a review, then renders a PDF on demand. It does not send an email. The generated document keeps its own storage object, Booking-local version number, template version ID, and reviewed data snapshot so that subsequent charge edits do not rewrite old PDFs.

## Data and privacy contract

`document_api.booking_confirmation_review` and `document_api.prepare_booking_confirmation` in `20260924133000_booking_confirmation_scope_and_snapshot.sql` are the only data sources for this template. The latter recomputes the review token at render time and replaces the generic render dataset with a customer-safe snapshot. The browser cannot submit its own prices or document text.

- `bookingConfirmation.scope` selects Collection, Main transport, and Delivery independently. An unselected part is absent from the customer document. Routes represent the work the operator records for Jenkar; the customer's onward work does not need a route.
- Collection and Delivery use saved addresses, routing pickup/delivery dates when present, otherwise Booking ready/required-delivery dates, and customer-visible remarks.
- Date-only collection/delivery values are formatted by the server so the renderer cannot shift them to the previous day. Timed route departures/arrivals are printed explicitly in UTC, matching the Booking route editor.
- Cargo supplies description, marks and numbers, packages, package type, and gross weight. Shared special instructions are customer-visible.
- The pending parties migration adds the Booking direction and the primary shipper/consignor and consignee name and address to the reviewed customer snapshot. It does not copy private contacts or identifiers into the PDF.
- Customer selling prices come from the current active, customer-visible freight costing lines, including inherited Quote and later Booking lines. They do not add the original Quote total again. Buying prices, internal-only lines, route carrier notes, discarded charges, and unselected service parts are excluded.
- Provisional Bookings cannot publish a price. An In-progress Booking can print confirmed customer selling prices only after the operator checks the review confirmation; otherwise it prints “Price to be confirmed.” This is a document confirmation, **not** a change to the Booking's financial records or the accepted Quote.
- `Prepared by` identifies the current operator. This is not a signature or approval.

The Booking Documents feed lists every generated version. The existing authenticated document-download boundary supplies short-lived preview/download links. Retain each storage object and its `DOCBGD_TemplateVersionID` for future email attachment. Email delivery is deliberately not implemented here.

## Local build and approval boundary

Regenerate the DOCX with the workspace Python runtime using `build-docx.py`. The template uses Carbone tags against `data.bookingConfirmation` and `data.customer`. Review the generated DOCX in Word/LibreOffice and verify populated Air, Sea, Road, Rail, partial-service, Provisional, multiple-currency, and multi-page examples in a **draft** Carbone environment before publishing.

Run `make-review-samples.py` to regenerate the 12 fictional mode/direction preview files in `samples/`, plus the provisional and long multi-page cases. These are preview inputs, not proof of a successful render. Record the PDF and reviewer for each case in the scenario matrix. The current Word source must not be published until the parties migration is approved and applied to the dev backend, because otherwise live Booking snapshots do not contain the shipper, consignee or direction fields shown in the samples.

The new migration is additive to the existing Quote/Booking data and does not change charge-code or nominal mappings. It must be reviewed and separately approved before application to a shared database. The template must be separately approved before publication as the active `JOB_CONFIRMATION` version. Edge-function release, frontend deployment, GitHub push/merge, and connected browser acceptance are separate release steps. Do not describe local tests or a raw DOCX layout check as a published PDF flow.

Dexter/Watching parity: this operation intentionally requires an interactive operator review and a document snapshot. It is not a background watch or an allowlisted Dexter write; no autonomous PDF generation or customer delivery is added.
