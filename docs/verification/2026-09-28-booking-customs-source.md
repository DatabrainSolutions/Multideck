# Booking Customs source — development verification, 28 September 2026

Target: local client on port 3000 and the separate MultiDeck development project
`aqtwypsuijxlnvtxpuxe`. Neither Jenkar Main nor Training was changed.

- Applied only `20260928131554_booking_customs_importer_party.sql` to development.
  Readback confirms one active `importer` party role and matching migration history.
- The read-only operational access preflight passed before and after the change for
  12 active internal operators. No RLS, grant, or Auth policy was changed.
- Local Chrome showed four editable cargo rows on JE0991151 and a distinct Import
  party that starts empty; copying the consignee requires an explicit click.
- A connected database transaction used the real Booking save and workspace read
  functions with a temporary importer and all four existing cargo lines. Readback
  returned one importer and four cargo lines with their IDs retained. The entire
  transaction was rolled back; a separate query confirmed zero persisted test
  importers and four original active cargo lines on JE0991151.
- Focused Customs source tests: 17/17 passed. Mode/direction, Quote/Booking and
  allocation contracts: 42/42 passed. Client build passed. The wider PostgreSQL
  access runner passed 100/101; its sole failure was the CRM weekly-history
  `foreign earlier history does not extend coverage` assertion. This is not a
  full regression pass and was not changed as part of Customs work.

Boundaries and remaining work:

- The browser was used to inspect the fields, not to save a real operator edit,
  attach a commercial invoice, generate a declaration, or submit to iCustoms.
  The 16 Air/Sea/Road/Rail × direction journeys have policy/contract coverage,
  not 16 connected Quote → Booking → Customs acceptance runs.
- Exact importer registration details are not a Dexter chat read/write domain,
  and a field-specific importer watch is unsupported. Dexter must direct the
  operator to Booking > Customs rather than infer an EORI from the CRM account
  code or claim Customs readiness. Existing Booking lifecycle and successful
  Customs-handover watches remain unchanged. This is an explicit parity
  exception for this narrow role-catalogue addition, not a new watch capability.
- No GitHub push, merge, hosted frontend deployment, production migration, or
  external Customs submission was performed.
