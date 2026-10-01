# FIATA Bill of Lading reference layout

Separate manager-review draft based on the supplied two-page
`FIATA Bill Of Lading - JE2647319.pdf`. This is a layout asset, not an issued
bill of lading or an approval of its terms.

## What is retained

- Editable Word tables for the parties, routing, cargo, equipment, declarations,
  freight, issue details and delivery agent.
- Independent cargo and container row loops.
- A bounded dynamic company-logo slot. The logo is not combined with the fixed
  Bill of Lading title. `imageFit(contain)` preserves its proportions; the slot
  is removed if no logo is supplied.
- The exact conditions artwork from page two, retained as an image. Those
  conditions are not retyped or changed. Replacing/editing the legal wording
  requires a separately reviewed source.

The sample's customer details, bird/carrier artwork and signature are not
copied. Preview values are fictional. Bill type, on-board statement, insurance,
original count, issue details and signing capacity are blank unless explicitly
provided.

## Data contract and release boundary

The draft uses `d.fiata` for form-specific values and `d.company.logoDataUri`
for the external-document logo. `sample-data.json` and
`sample-multiple-rows.json` demonstrate the contract. The latter exercises three
cargo rows, two equipment rows and a different-aspect-ratio logo.

These fields still need a Booking/Job adapter and operational review before
real document generation. Do not distribute or publish this draft as a working
FIATA form solely because its preview renders successfully.

Development catalogue registration, checked 1 October 2026:

- Code: `FIATA_BOL_REFERENCE`
- Name: `FIATA Bill of Lading · reference layout`
- ID: `bea9caf1-f1a1-4002-b83e-dd8dafc9201e`
- Status/version: draft / 2
- Private retained source SHA-256:
  `cb6d7212191158897fab217ac32c46e2f1144a13638c3f649e3b1e97a08d65ce`

The existing `FIATA_BOL` published version 6 is untouched. Its source was saved
on 18 August 2026 and contains an operations requirements document, not the
expected bill-of-lading form. Earlier versions remain in history; changing the
published selection needs explicit approval.

## Rebuild and verify

Run `build-template.py` with the supplied reference PDF using the bundled
workspace Python (python-docx, pypdf, pypdfium2). The builder extracts only the
BIFA/ICC form marks and conditions artwork. It does not upload or publish.

Render the Word source and fictional filled fixture with the bundled document
renderer, and inspect every page. Verify the actual Carbone preview as well;
the local filler is only a layout check, not a substitute tag engine.

Verified: two-page source/filled renders; connected Carbone two-page render;
three cargo/two equipment row repetition; replacement logo; safe-JSON validation
and recovery. Publishing and real-record mapping are not completed by this work.
