# Explicit opening direction — development release

Release commit `b995c72b49da6583b2b460ce06c47ed810730030`; existing dev project
`aqtwypsuijxlnvtxpuxe` and Git `dev` deployment. No team/domain/environment or
approval setting changed. No incoming commits at either pre-release fetch.

## Backend confirmed

- Isolated dry run and apply contained only
  `20260907121414_booking_explicit_open_direction.sql`, SHA-256
  `42dbe99f37f65dcf4501d4e5a34933c0e11ad81a7dfe003f03e123776e8b5a42`.
  No seeds, roles or teammate migration identity changes. Remote ledger confirms
  applied; Road four-argument RPC execute is false for anon/authenticated and
  true for service_role.
- Booking version 45 ACTIVE, JWT enabled, bundle SHA-256
  `0801f9b54d3e00f1a8566cf92677ab99f9e10ba5406ddd2bd8ea00d20afd6bec`.
- Dexter version 167 ACTIVE, JWT enabled, bundle SHA-256
  `4039f03af59a5bc1abab1c8dd4172bac4b7b8f4b4804bad08044509ce609c65e`.
- All 26 downloaded source files match the release commit byte for byte.
  Unrelated function metadata unchanged; none removed. Artifacts under
  `/tmp/multideck-direction-release.R2GwQE/after`.
- Security advisors 1,555 before/after with no added/removed identities using
  name, level, cache key and metadata. Existing findings are not certified safe.
- Before/after full-row fingerprints using MD5 of ordered concatenated JSON:
  77 Job headers, `6e7c6355642fc7eb92409f7d9e163e29`; 38 Quote versions,
  `73ee68f0a8424f20165f7c54e6187e10`. Both unchanged. Compare only fingerprints
  from this same serialization method, not older aggregate-based hashes.

## Client and hosted verification

Normal non-force push to `dev` succeeded. Deployment
`dpl_99fN9nDhbdqo7vmLQCKAC1bZ3PKR` reached READY for the exact
release commit; `dev.multideck.app` assigned and alias error null. Immutable URL:
`multideck-app-jg95qlth6-databrain-solutions.vercel.app`.

Fresh signed-in Chrome tab `1772487995` displayed the explicit direction form.
Keyboard selection of Domestic and Enter created exactly the new synthetic
draft `JD0991135`, Job ID `c7b643bc-547b-4380-b9f8-7eea34032aad`, request key
`b8b341d2-fa60-4edf-bfd0-ba52b25cf910`. Independent SQL confirms Road, Domestic,
draft, null customer and null source Quote. Creation is now hosted-proven.

The subsequent unrelated Customer ref edit exposed a second existing defect:
the form displayed `Direction (auto): Cross trade` with no route. The edit was
discarded, not saved. The draft remains Domestic; normal save/reload proof is
still open. No customer, route, document or transport instruction was added.

Trace: `countryCodeFromFreightLocation` searched country aliases even when the
input was empty. An optional null/empty alpha3 alias matched that empty input,
inventing countries. Both `calculatedDirectionForBooking` and the save payload
then used the calculated Cross trade result. The local follow-up returns null
for empty location text after checking any valid UN/LOCODE. Executable tests
cover omitted/null/blank locations, one missing endpoint, a valid country alias,
and all four real route directions. Thirteen direction/opening tests pass.
This follow-up is not yet released; do not save the draft using the old page.

Prior Job-ref gate remains closed; original Quote revision send/accept/apply
approvals remain held. Customs/iCustoms, tracking and PDF-logo work unchanged.
