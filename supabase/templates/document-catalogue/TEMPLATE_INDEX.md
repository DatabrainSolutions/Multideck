# Editable catalogue template index

All entries below are unpublished drafts in Documents > Manage templates. Source adapters and production issuance are deferred.

| Draft layout | Proposed source | BoxTop sheet rows |
| --- | --- | --- |
| [Customer quotation](templates/CATALOGUE_QUOTE_LAYOUT.docx) | Quotes | 75, 76, 77, 78 |
| [Freight invoice](templates/CATALOGUE_FREIGHT_INVOICE.docx) | Finance | 174 |
| [Freight proforma invoice](templates/CATALOGUE_FREIGHT_PROFORMA.docx) | Finance | 43, 81 |
| [Advice of charges](templates/CATALOGUE_ADVICE_OF_CHARGES.docx) | Finance | 79 |
| [Remittance advice](templates/CATALOGUE_REMITTANCE_ADVICE.docx) | Finance | 80 |
| [Arrival notice](templates/CATALOGUE_ARRIVAL_NOTICE.docx) | Bookings | 6 |
| [Customs clearance instructions](templates/CATALOGUE_CLEARANCE_INSTRUCTIONS.docx) | Booking Customs | 7 |
| [Delivery confirmation](templates/CATALOGUE_DELIVERY_CONFIRMATION.docx) | Bookings | 8 |
| [ERTS release request](templates/CATALOGUE_ERTS_RELEASE_REQUEST.docx) | Bookings | 9 |
| [Container PIN request](templates/CATALOGUE_PIN_REQUEST.docx) | Bookings | 10 |
| [Cargo release request](templates/CATALOGUE_RELEASE_REQUEST.docx) | Bookings | 11 |
| [Transport instructions](templates/CATALOGUE_TRANSPORT_INSTRUCTIONS.docx) | Bookings | 12, 16, 38 |
| [Sea booking request](templates/CATALOGUE_SEA_BOOKING_REQUEST.docx) | Bookings | 14 |
| [Shipping instructions](templates/CATALOGUE_SHIPPING_INSTRUCTIONS.docx) | Bookings | 15, 23 |
| [Bill of lading instructions](templates/CATALOGUE_BL_INSTRUCTIONS.docx) | Bookings | 17 |
| [Standard shipping note](templates/CATALOGUE_STANDARD_SHIPPING_NOTE.docx) | Bookings | 25 |
| [Road consignment instructions](templates/CATALOGUE_ROAD_CONSIGNMENT.docx) | Bookings | 35, 36 |
| [Road and courier cargo label](templates/CATALOGUE_CARGO_LABEL.docx) | Bookings | 37, 42 |
| [Courier docket](templates/CATALOGUE_COURIER_DOCKET.docx) | Bookings | 41 |
| [Collection and delivery note](templates/CATALOGUE_COLLECTION_DELIVERY_NOTE.docx) | Bookings and Warehouse | 44, 187 |
| [Air assembly manifest](templates/CATALOGUE_AIR_ASSEMBLY_MANIFEST.docx) | Consolidations | 45 |
| [Sea assembly manifest](templates/CATALOGUE_SEA_ASSEMBLY_MANIFEST.docx) | Consolidations | 46 |
| [Consolidation manifest](templates/CATALOGUE_CONSOLIDATION_MANIFEST.docx) | Consolidations | 47, 48, 49, 50, 52 |
| [Agent manifest](templates/CATALOGUE_AGENT_MANIFEST.docx) | Consolidations | 51 |
| [Customs manifest source sheet](templates/CATALOGUE_CUSTOMS_MANIFEST.docx) | Consolidations and Customs | 53 |
| [Container loading manifest](templates/CATALOGUE_LOADING_MANIFEST.docx) | Booking load plan | 54 |
| [Packing list](templates/CATALOGUE_PACKING_LIST.docx) | Booking cargo | 62 |
| [Commercial invoice working draft](templates/CATALOGUE_COMMERCIAL_INVOICE_SOURCE.docx) | Customer trade source | 57, 63 |
| [Warehouse goods in note](templates/CATALOGUE_WAREHOUSE_RECEIPT.docx) | Warehouse receipts | 64, 65, 74 |
| [Warehouse goods out note](templates/CATALOGUE_WAREHOUSE_OUTBOUND.docx) | Warehouse dispatch | 67 |
| [Warehouse pick list](templates/CATALOGUE_WAREHOUSE_PICK_LIST.docx) | Warehouse orders | 66, 72 |
| [Warehouse inventory report](templates/CATALOGUE_WAREHOUSE_INVENTORY.docx) | Warehouse stock | 70, 71 |
| [Operational job sheet](templates/CATALOGUE_JOB_SHEET.docx) | Bookings | 183, 184, 189 |
| [Pre shipment advice](templates/CATALOGUE_PRE_SHIPMENT_ADVICE.docx) | Bookings | 190 |
| [Vehicle handover record](templates/CATALOGUE_VEHICLE_HANDOVER.docx) | Booking vehicles | Additional sample-derived layout |

## Matching notes

### Customer quotation

Use the immutable submitted Quote snapshot. Customer prices only; never expose buying prices.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_QUOTE_LAYOUT.json).

### Freight invoice

Finance-issued invoice identity, tax and totals only. No invoice numbering or financial recalculation in the template.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_FREIGHT_INVOICE.json).

### Freight proforma invoice

Finance proforma projection only. This is not a posted tax invoice.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_FREIGHT_PROFORMA.json).

### Advice of charges

Approved customer-facing Finance lines only; exclude cost and internal notes.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_ADVICE_OF_CHARGES.json).

### Remittance advice

Do not treat a requisition or advice as proof of payment; use only recorded Finance payment facts.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_REMITTANCE_ADVICE.json).

### Arrival notice

Recorded arrival and availability only. An arrival notice is not release authority.

Sample references: `sample-documents/arrival-notice.txt`

Fictional preview: [JSON](samples/CATALOGUE_ARRIVAL_NOTICE.json).

### Customs clearance instructions

Customer-supplied source data for the Customs team, not a Customs declaration or clearance result.

Sample references: `sample-documents/customs-entry.txt`

Fictional preview: [JSON](samples/CATALOGUE_CLEARANCE_INSTRUCTIONS.json).

### Delivery confirmation

Confirm delivery only from a recorded actual event and evidence; do not manufacture a signature.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_DELIVERY_CONFIRMATION.json).

### ERTS release request

Request layout only. An authorised release-note workflow and verified clearance are needed before issuing any release authority.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_ERTS_RELEASE_REQUEST.json).

### Container PIN request

Request only; never invent a PIN, Customs release or carrier permission.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_PIN_REQUEST.json).

### Cargo release request

Does not replace an authorised Release Order. Use a separate verified approval path for release authority.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_RELEASE_REQUEST.json).

### Transport instructions

Collection and delivery locations must be explicitly recorded. Never substitute party addresses automatically.

Sample references: `incoming-documents/More Examples/Transport Order-228990.PDF`

Fictional preview: [JSON](samples/CATALOGUE_TRANSPORT_INSTRUCTIONS.json).

### Sea booking request

Request, not a carrier confirmation. Retain unknown booking numbers, schedules and weights as unknown.

Sample references: `incoming-documents/More Examples/JE2649386_SeaBookingReport_BookingRequest260618155701.pdf`

Fictional preview: [JSON](samples/CATALOGUE_SEA_BOOKING_REQUEST.json).

### Shipping instructions

Separate master and house parties, marks, equipment and cargo allocations. Instructions are not an issued bill.

Sample references: `incoming-documents/More Examples/SHIPPING INSTRUCTION - JE2649386.pdf`

Fictional preview: [JSON](samples/CATALOGUE_SHIPPING_INSTRUCTIONS.json).

### Bill of lading instructions

Only instruct the authorised issuer. Do not replicate carrier terms, title documents or FIATA security forms.

Sample references: `incoming-documents/More Examples/SHIPPING INSTRUCTION - JE2649386.pdf`

Fictional preview: [JSON](samples/CATALOGUE_BL_INSTRUCTIONS.json).

### Standard shipping note

Operational draft, not an approved SITPRO form. Confirm destination requirements before use.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_STANDARD_SHIPPING_NOTE.json).

### Road consignment instructions

Draft instructions only, not a CMR or US legal Bill of Lading. Approved terms and required form are a later review gate.

Sample references: `incoming-documents/IC-Trucking-Bill-of-Lading-9235-PDF.pdf`

Fictional preview: [JSON](samples/CATALOGUE_ROAD_CONSIGNMENT.json).

### Road and courier cargo label

A4 layout draft; agree printer dimensions and identifiers before label generation. No invented carrier barcode.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_CARGO_LABEL.json).

### Courier docket

Recorded courier movement only; no inferred delivery or recipient signature.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_COURIER_DOCKET.json).

### Collection and delivery note

Keep planned and actual movement separate. Leave signatures for authorised human completion.

Sample references: `incoming-documents/More Examples/Transport Order-228990.PDF`

Fictional preview: [JSON](samples/CATALOGUE_COLLECTION_DELIVERY_NOTE.json).

### Air assembly manifest

Consolidation membership and source line values only. No inferred security clearance or airline rates.

Sample references: `incoming-documents/More Examples/17 MAN02250426.pdf`

Fictional preview: [JSON](samples/CATALOGUE_AIR_ASSEMBLY_MANIFEST.json).

### Sea assembly manifest

One authorised consolidation dataset; avoid duplicate master and house cargo totals.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_SEA_ASSEMBLY_MANIFEST.json).

### Consolidation manifest

Address/detail/name-only views share one layout family. Approved projection decides columns and party visibility.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_CONSOLIDATION_MANIFEST.json).

### Agent manifest

Agent-facing approved data only; exclude internal prices and confidential unrelated consignments.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_AGENT_MANIFEST.json).

### Customs manifest source sheet

Handoff source sheet, not a government-issued manifest or submitted declaration.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_CUSTOMS_MANIFEST.json).

### Container loading manifest

Use saved cargo-to-container allocations, including split quantities. Never calculate VGM from cargo weight.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_LOADING_MANIFEST.json).

### Packing list

Jenkar-prepared draft only. Do not replace a customer-issued original required as Customs evidence.

Sample references: `sample-documents/packing-list.txt`

Fictional preview: [JSON](samples/CATALOGUE_PACKING_LIST.json).

### Commercial invoice working draft

Customer approval and authoritative trade values required. Not a Jenkar freight invoice, original customer invoice or CARICOM-certified form.

Sample references: `incoming-documents/IC-Commercial-Invoice-9235_WORD.dotx`, `incoming-documents/scorecard examples/Commercial Invoice 142711.pdf`

Fictional preview: [JSON](samples/CATALOGUE_COMMERCIAL_INVOICE_SOURCE.json).

### Warehouse goods in note

Warehouse receipt records only; not a FIATA FCR or ownership certificate.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_WAREHOUSE_RECEIPT.json).

### Warehouse goods out note

Confirmed dispatch quantities only, preserving inventory and permissions.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_WAREHOUSE_OUTBOUND.json).

### Warehouse pick list

Saved order and location allocation only; a pick list is not confirmation of dispatch.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_WAREHOUSE_PICK_LIST.json).

### Warehouse inventory report

Authorised point-in-time stock projection; define zero-stock filtering before wiring.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_WAREHOUSE_INVENTORY.json).

### Operational job sheet

Internal operations only; master job detail must not double count house cargo or reveal unrelated records.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_JOB_SHEET.json).

### Pre shipment advice

Planned dates clearly labelled; no implied departure, release or delivery.

Sample references: Catalogue purpose and common operational field structure only; no direct sample match.

Fictional preview: [JSON](samples/CATALOGUE_PRE_SHIPMENT_ADVICE.json).

### Vehicle handover record

Additional sample-derived layout. Preserve each VIN/chassis, vehicle condition and mileage; no inferred ownership or signature.

Sample references: `incoming-documents/IC-Auto-Transport-Bill-of-Lading-9235-PDF.pdf`

Fictional preview: [JSON](samples/CATALOGUE_VEHICLE_HANDOVER.json).
