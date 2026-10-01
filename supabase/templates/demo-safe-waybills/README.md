# Demo-safe waybill sources

These are separate clean revisions, not replacements for retained published
versions or issued documents. Upload through Manage templates, preview and
review before any publication. Draft sources are not operational sign-off.

- Master Air Waybill keeps the original six-copy, twelve-page form.
- MNG Air Waybill keeps its two-page form. Fixed carrier name/address values are
  now Carbone fields. Public form wording and conditions remain unchanged.
- FIATA Waybill rebuilds the inspected completed PDF as an editable one-page
  form. Only form-rule geometry and static labels are retained. Customer text,
  original images, references and the signature are not copied. The logo slot
  contains the reviewed Multideck placeholder and is replaceable.

`build-clean-sources.py` requires the exact inspected reference PDF SHA-256 and
keeps all air-waybill ZIP parts unchanged except document XML and metadata.
Run it with the bundled Python runtime and the retained PDF path. After any
regeneration, re-audit all text and artwork and update the exact source hashes
in `functions/_shared/template-preview-catalogue.json`; never approve an old
completed source or changed bytes by filename alone.

`air-waybill-demo.json` and `fiata-waybill-demo.json` contain fictional fixtures.
The registry adds the reviewed Multideck logo to the FIATA fixture. Preview
requests must use these fixed server fixtures, never current Job data.

Before operational publication, review the new carrier-address fields and the
FIATA `waybill` mapping against real supported document-generation data. The
single-container FIATA demo is a layout/privacy check, not multi-container
generation proof.

## Booking Draft revisions

`build-booking-drafts.py` derives four separate `_booking_draft.docx` revisions
from the inspected clean sources, retaining all package parts except body XML.
The full-party/cargo/equipment/split schedule repeats in normal document flow,
not inside a fixed-height textbox. Full descriptions remain available even when
the face of a form shows a bounded summary. FIATA uses the retained Multideck
logo as its editable Word placeholder. No automatic issuer-brand assumption is
made. MNG's bitmap copy label is covered by a white-backed editable Draft label;
the retained public artwork and conditions are otherwise unchanged.

`prepare-booking-draft-previews.mjs <temporary-qa-directory>` runs the production
mapping with fictional source records and local Carbone for geometry/loop QA.
`--stress` tests twenty long cargo lines and forty recorded splits without
changing the approved preview catalogue. Local community rendering cannot
verify hosted image formatters or native all-page watermarks; provider output
must be checked after the shared-development release is approved.

These sources are Draft-only. Publication makes a reviewed layout usable; it
does not authorise a legal Original. Changed Word bytes require another source,
privacy and mapping review before operational generation. All prior published
versions and issued files remain untouched.
