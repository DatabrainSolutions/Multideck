# Master Air Waybill (MAWB) Carbone template

This template recreates the supplied laser air waybill as a fixed-layout,
12-page Carbone document. Each of the six operational MAWB faces is followed by
the supplied carrier conditions page. The generated document preserves the
three originals, delivery receipt, airport-of-destination copy and
third-carrier copy.

## Template source

- `build-docx.py` is the authoritative Word-native template builder. It anchors
  the supplied form artwork behind fixed, bounded Carbone fields so values
  cannot move lines or overlap neighbouring sections.
- `master-air-waybill-carbone-template.html` is a readable browser preview of
  one face/conditions pair; it is not converted into the production DOCX.
- `assets/mawb-face-form.png` contains the supplied red form geometry with the
  sample shipment values removed. `assets/mawb-conditions.png` preserves the
  complete supplied conditions page.
- `generate-reference-assets.py` reproducibly rebuilds those assets from the
  supplied PDF when its local path is provided.
- `build-template.sh` produces the 12-page DOCX accepted by Carbone Studio and
  Multideck's secure renderer.
- `master-air-waybill.sample.json` is a sanitised preview dataset using the
  current `document_api.prepare_studio_job_session` contract.

Run the build from the repository root:

```sh
supabase/templates/master-air-waybill/build-template.sh
```

The generated `Master_Air_Waybill_Carbone_Template.docx` is a Multideck-owned
source asset. The authenticated template manager copies it to the private
`multideck-template-sources` bucket inside the tenant's Supabase project and
saves an immutable provider version through the server-side Carbone boundary.
Carbone credentials never enter the browser.

The `MAWB` template is published in the normal Templates row. There is no
separate approval stage: saving a replacement source for an already-published
template makes that immutable version current immediately. Unpublished
templates still retain draft behavior.

## Carbone data contract

The template uses only values currently supplied by Multideck's approved job
snapshot:

- the main-carriage MAWB reference in both reference positions and as a Code
  128 barcode;
- job, shipper and consignee identity and address fields;
- the main route's airports, flight and planned departure date, with UN/LOCODEs
  reduced to their three-character airport code inside narrow routing boxes;
- self-contained Carbone cargo loops and aggregate gross-weight / volume
  totals;
- bounded string formatters on narrow or variable-width fields.

Commercial fields that are not yet part of the approved server-side contract
(carrier account number, rates, charges, declared values, insurance and payment
terms) remain blank. The template never invents those values from unrelated
job data.

## Verification

After every layout change, render both the Word source and an authenticated
Carbone result. Both must be A4 and exactly 12 pages. Inspect the six odd-numbered
faces for field containment and copy labels, and the six even-numbered pages for
the complete conditions text before replacing the published source.
