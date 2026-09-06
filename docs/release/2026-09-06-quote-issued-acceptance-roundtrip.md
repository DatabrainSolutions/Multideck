# Hosted Quote issue and acceptance — 6 September 2026

## Scope and authority

The user explicitly approved sending clearly labelled development Quote `JQ20022` from `lee.wright@jenkar.com` to `lee@databrain.solutions`, then using its secure link to create a synthetic Booking. The subject, email body, customer reference, cargo descriptions, charge descriptions and acceptance message identify software-test data. No real transport, supplier instruction, invoice, payment or production-tenant mutation was performed.

Environment: `https://dev.multideck.app`, development project `aqtwypsuijxlnvtxpuxe`. Existing team deployment settings were unchanged. Git push of `116d163260c1d8be3190cf90e7ee669470deb234` to `dev` succeeded. Vercel `dpl_Ac3KJoxsp24A5eVJdeXwKGhD44Mo` is READY for that SHA; immutable deployment is `multideck-app-3ivt6xdsq-databrain-solutions.vercel.app`. The send used the already loaded prior client with the corrected live recipient-readiness SQL; do not attribute a fresh-browser client reload to this send.

## Observed positive lifecycle

1. Visually verified the exact approved From/Send to addresses and explicit test content. Browser DOM/AX inspection omitted the email input value while the actual screenshot showed it correctly; this is not evidence that the controlled application input was empty.
2. Clicked Send secure quote once. Controls disabled with `Sending…`; after completion the dialog closed, a persistent sent acknowledgement appeared, and the `Quote sent` toast stated the PDF was saved and emailed, with a View documents action.
3. Original Quote version became submitted/read-only. Documents listed `JQ20022.pdf`, 80 KB, described as the original sent to the approved recipient. No `V1` filename suffix was introduced.
4. Gmail search found one matching labelled test message in the approved recipient account. The body retained the no-shipment/no-financial-action instructions and contained one `JQ20022.pdf` attachment. The secure response destination was the approved development hostname.
5. Reviewed the complete one-page PDF text and its actual visual preview. It contains both cargo lines, the correct package types and exact weights/volumes, `1 × 40GP; 1 × 20GP`, TBC transport dates, and only the £100 and £10 customer charge lines (£110 total). No £80 supplier cost, margin, profit or supplier identity was present. The logo is broken: see defects below. This is not a clean PDF visual pass.
6. Opened the received secure link. It displayed JQ20022, £110, GBFXT → NLRTM, 20 September validity, the issued PDF, and separate Accept / Ask for changes / Decline options. Quote fields were not customer-editable. Added the explicit software-test-only acceptance message and confirmed once.
7. Customer page confirmed acceptance and new Booking `JE0991134`. The operator Quote subsequently displayed Accepted, Original · Submitted, and its Booking link.
8. Booking Documents lists the same original quote PDF as Version 1. Cargo & equipment shows two independent lines (2 Crates / 100.10 kg / 1.000001 CBM and 3 Cartons / 0.20 kg / 0.000002 CBM). There are two active container rows, 40GP and 20GP, with blank allocation quantities/weights. SQL also shows an archived legacy combined-summary container: it is not a third active container. No arbitrary split of goods totals occurred.
9. Booking ETD/ETA remain blank; the Quote's 6–20 September validity dates did not become transport dates. UK-to-Netherlands direction is Export and the Booking reference uses `JE`.
10. Existing notification bell contains the acceptance notification alongside prior notifications. Clicking only this test notification navigated to `/quotes/JQ20022`. No clearing or mark-all-read action was used.
11. Reloading the customer link displayed the already-accepted outcome, with no further response controls. SQL confirms exactly one customer response and one linked Booking. This proves reload does not duplicate conversion, not simultaneous-submit race coverage.

## Auditable identities

- Quote: `ce9e3e2d-1db5-40f4-81e1-c76dba657d37` (`JQ20022`).
- Submitted/applied original version: `44e4b47b-b9b3-42dd-ad76-30df16a4db66`.
- Response link: `8e591328-80dd-4565-b0e8-653ca973ad3a`; recipient source `manual`; delivery `sent`; provider receipt present; final link status `responded`.
- Issued document: `e17a8c2a-64c9-4603-9c35-7c98dd4cfaef`.
- Acceptance: `bbee7a49-806b-49db-8ae4-7f5dbd5e15d7`, recorded `2026-09-06 10:05:02.283159+00`, with the complete test-only message.
- Booking: `093a6d3f-4507-4e7f-b0ce-571d3a7239e5` (`JE0991134`, job number 49), source version and response IDs above, sync status `in_sync`.

No private response token, signed storage URL, provider credential or mailbox token is retained in this report.

## Defects and limits — not a full pass

- **PDF logo fails visually.** Both operator and received Gmail PDF previews show a broken image. The dataset currently reads the older `Brand_LogoFilePath` in private template storage, whereas operational email uses configured `tenantBranding` and a different SVG in `tenant-brand-assets`. The old PNG was downloaded read-only through the linked development CLI; PNG integrity passes (1081 × 1128 RGBA, interlaced). The exact cause of the broken rendering is not yet proven. Do not replace the already-issued PDF or its accepted evidence; fix future generation and prove with a fresh render.
- **Public response branding fell back to Multideck**, while the email displayed saved Jenkar branding. Development does have configured `tenantBranding` version 1. `attachQuoteBrand` reads the private `quote_api` schema through PostgREST and silently falls back on errors; this is a diagnostic lead, not a proven cause. The logs connector was unavailable. Do not expose the private schema to solve a presentation defect.
- **Top-right customer-response queue was not timed.** The bell/deep link passed; foreground sequencing, 5–6-second timeout, navigation-load gating and retries require a separate controlled check. An already-open background Quote still showed its prior Open state until navigation refreshed it; do not claim reactive page refresh coverage.
- Booking Overview still shows a 78% Dexter forecast despite no schedule, and its context says Documents not connected although the Documents tab contains the accepted PDF. These existing presentation signals need evidence-based review; no fix is claimed here.
- Revised-version acceptance, partial/all Booking application, stale-review conflict handling, change/decline paths, further mode lifecycles, detailed operations and hosted Dexter approval/watch tests remain open. No 95% or overall completion claim is made.

PDF and Carbone skills guided the visual/content review and investigation. No template, application source, migration, branding setting or live record was changed to conceal a failing check in this checkpoint.
