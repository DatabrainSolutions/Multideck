# Quote charge party correction — 6 September 2026

## Observed failure

On the labelled development-only test draft JQ20022, Add charge selected HELWLG / Hellmann Worldwide Logistics without a supplier selection on the Quote. The page supplied a hard-coded demo directory; the shared editor chose its first supplier. This was a misleading operational default, not a confirmed supplier instruction. Hosted send verification stopped at this boundary; no email or acceptance was attempted.

## Correction

- Reuse the existing shared charge editor and authorised Quote source lookups; remove the page's hard-coded supplier/customer directory.
- New rows use only an explicitly selected Quote supplier; otherwise the supplier stays unselected. The customer is the current Quote customer, not an unpersisted alternate demo customer.
- Keep existing saved supplier labels readable as recorded evidence without guessing master-data UUIDs from names. A deliberate clear removes the supplier identity and sets the existing pending label.
- Preserve saved notes and department by stable line identity across removal/reordering; never copy metadata from the row now occupying an old position.

No backend capability, permissions, schema or Dexter approval/watch contract changes. No new UI component or tenant-branding change; this is data binding within the existing Multideck-owned editor. No Vercel configuration changes.

## Local evidence

23 focused tests passed with no failures/skips: charge parties, actual update/save mapping, cargo mapping, customer references and currency contracts. The fixture executes complete production functions via TypeScript AST extraction; it does not replace supplier identity or save logic with test implementations. Checks include explicit/no supplier, current customer, recorded labels, dual-role organisations, reorder/remove/insert metadata, clearing and UUID persistence.

`node build-deployment.mjs` passed; existing large-bundle warnings remain. `git diff --check` passed. Remote dev was re-fetched with no new upstream commits before release.

Hosted verification is pending in this checkpoint. This does not certify the full Quote-to-Booking lifecycle or all-mode completion.

## Hosted result

Commit `4e73f9ebbaa41e8c2e9e1c6dbc02fa8868a90ffb` fast-forwarded to `origin/dev`. Vercel `dpl_9q9QMz4vN5nWSaifmghU2fi7mbUC` is READY, with `/assets/app-Ba97hA3H.js` matching both the immutable deployment and `https://dev.multideck.app`. No team configuration changed.

Authenticated browser and scoped database checks on JQ20022 prove: the original unlinked Hellmann label remains recorded evidence; an explicit clear saves a null supplier; a newly added line selects no supplier; selecting authorised Demo Organisation 045 saves its UUID `51f00000-0000-4000-8000-000000000002`; both lines and synthetic GBP amounts reload correctly. Test charges are labelled not-a-shipment. Historical customer Quotes and Bookings were not edited.

The user explicitly approved a labelled test email to lee@databrain.solutions from lee.wright@jenkar.com and secure-link acceptance into a test Booking. No send or acceptance has yet occurred: the next readiness boundary exposed a saved-contact-email requirement conflicting with the supported manual recipient. N/A scope was verified using keyboard selection and the database; an automated pointer-selection attempt did not commit, so no speculative persistence fix was made for that observation.
