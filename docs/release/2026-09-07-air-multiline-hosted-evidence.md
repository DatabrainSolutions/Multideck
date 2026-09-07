# Hosted Air multi-line weight persistence

Existing internal Air Booking JI0991132, job
`78313622-1542-4aec-bbb2-c300a7ef5d57`, on released client `54d6da2`.
Isolated signed-in Chrome tab `1772488028`; ordinary Booking editor/save only.

The original cargo ID `6a21c245-ba08-4123-9d7f-608ebc441fe9` began with unknown
weight. Set it to exact `0.1`, added a second line explicitly named
`INTERNAL QA Air second line - not a shipment`, and entered `0.200000001`.
No package count, gross weight, safety classification or equipment allocation
was invented for the new line.

Save persisted two distinct cargo identities. New QA cargo ID:
`35b0dfa1-c72b-422b-92f3-f15408b4a3cd`. Independent SQL read confirmed both
exact numeric texts. Fresh browser reload and navigation to Cargo & equipment
showed both rows and exact total `0.300000001` without floating-point rounding.
Selecting the second row allowed editing its own weight, not the first line.

Clearing the first line in the editor changed the display to a recorded subtotal
with one missing line, not a complete total. This partial state was not saved
separately. Cleared the second weight too, then saved. SQL confirms both weights
null. The new labelled QA line is deliberately retained, not deleted or claimed
as restored original row count. The original row identity and unknown weight
are restored. This test added two ordinary saves.

All 38 Quote versions retain fingerprint `48f5e0efb6d918d4019edbf8d9e47a28`
using ordered full-row JSON. Neither cargo row acquired a typed Quote-line or
Quote-version source identity. No Quote issue/response, AWB, Customs action,
email, document or watch mutation occurred.

This closes the two-line exact-total/edit/save/reload gate for this hosted Air
record. It is not an equipment/allocation, flight, screening or complete Air
operational journey. Existing local allocation/mode matrices remain separate.

## Follow-up observation

The Goods section also displays a generic `Source: Accepted quote` while the
new manual QA line is selected. Source inspection shows this is a Booking-level
custom field derived from `booking.sourceQuoteId`, not cargo provenance. Do not
claim the new line came from the Quote. Clarify the label/placement when fixing
the remaining source-presentation gaps; no source data was rewritten here.
