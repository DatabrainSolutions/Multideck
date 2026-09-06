# Customer enquiry reference round-trip

## Observed defect

The deployed development editor created synthetic draft `JQ20022` (Quote ID `ce9e3e2d-1db5-40f4-81e1-c76dba657d37`). Its customer reference `QA-FREIGHT-20260906-NOT-A-SHIPMENT` was persisted in the current version snapshot, but reloading displayed the master reference `JQ20022` instead. No email, submission, acceptance or Booking mutation was performed.

Two synthetic cargo lines survived saving and reloading with stable IDs and exact values: 2 crates / 100.10 kg / 1.000001 CBM and 3 cartons / 0.20 kg / 0.000002 CBM. Repeated autosaves retained one unsubmitted version, ID `44e4b47b-b9b3-42dd-ad76-30df16a4db66`.

## Correction and boundaries

- The authorised Quote workspace reads the customer's enquiry reference from the current version snapshot, independently of the immutable master-reference header column. Explicit blank/null means cleared. Missing legacy snapshot fields retain existing fallback behaviour; ambiguous current versions or invalid saved field types fail visibly.
- The client mapping preserves an explicit blank rather than replacing it with the master reference. Master numbering, aliases, Booking references, submitted snapshots and database schema are unchanged.
- Temporary Dexter exception: the legacy `quotes.customerReference` domain field still describes the master Quote reference. The prompt explicitly prohibits claiming enquiry-reference reads, edits or watches through this domain and directs users to Quote Details. A dedicated adapter remains outstanding; this exception is not full parity or completion of the broader goal.

## Local evidence

22 focused tests passed (customer-reference helper, real editor load/save mapping, structured cargo and immutable submitted versions), zero skipped. Deno checks passed for both complete `quotes-workflow` and `agent-dexter` import graphs. The root deployment build passed; the existing large-chunk warning remains.

Before release, development functions were `quotes-workflow` v74 and `agent-dexter` v157, both JWT-verified. Deployment and hosted corrected reload evidence must be recorded below before claiming the fix live.
