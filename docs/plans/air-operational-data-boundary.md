# Air operational data boundary — traced 7 September 2026

Read-only follow-up to the remaining freight acceptance map. No issued AWB,
Booking, Quote, screening status or access policy was changed.

## Current ownership and gap

| Surface | Current source | Meaning and limitation |
| --- | --- | --- |
| Quote cargo line | `quote_api.version_cargo_lines.chargeable_weight_kg` | Typed commercial version value; submitted version remains immutable. |
| Booking shipment field | `Job_Header.Job_EditableDetailsJSON.chargeableWeightKg` with Quote-facts display fallback | Operator-editable shipment value, not a typed cargo-line total. |
| Booking revision comparison | `Job_Cargo.JobCargo_CargoJSON.chargeableWeightKg` | Per-source-line comparison, separate from the visible shipment field. |
| AWB goods line | `AWB_GoodsItems.AWBG_ChargeableWeight` and UOM | Document goods-line value; cannot silently become operational planning truth. |
| AWB screening | `AWB_SecurityScreening`, required AWB foreign key, optional goods-item key | Document-linked status/method/agent/time snapshots, not an independent Booking screening record. |

`BookingDetailWorkspace` shows the shipment-level editable value. The existing
detail-save allowlist accepts that JSON key. `booking_api.current_source_cargo_lines`
instead projects per-line CargoJSON values for revision comparison. A write to
one is not proof the other changed. Replacing only the visible field would leave
two operational sources and incomplete selective-apply semantics.

The AWB header has an optional Job link, lifecycle status, issue time, and number
requirements for issued/later states. `AWB_Versions` is documented as immutable
snapshot storage. Those declarations alone do not prove enforced immutability
or a functioning issuance workflow.

Searches of repository migrations/client/Edge sources found no explicit writer
for AWB screening or goods chargeable weight. A live read of `pg_proc.prosrc` in
public/booking_api/quote_api/document_api/private found no functions explicitly
referencing `AWB_SecurityScreening`, `AWBG_ChargeableWeight` or `AWB_Versions`.
This scoped negative result does not rule out direct table clients, dynamic SQL,
other schemas or external consumers. Do not claim the AWB system is integrated
or safe to modify based only on existing table names.

## Implementation requirements for the next Air batch

1. Preserve Quote per-line provenance and selective application. Introduce typed
   Booking per-line chargeable weight alongside the existing cargo identity,
   with exact-decimal validation, omission/clear distinction and audit. Route
   ordinary saves, revision comparison/application and Dexter through one writer.
2. Inventory legacy shipment-level and per-line JSON values before migration.
   Preserve unknowns and malformed source evidence; never distribute a shipment
   weight arbitrarily across cargo lines or silently overwrite conflicts.
3. Distinguish any operator shipment override from an aggregate. Explicitly label
   which is displayed; missing line weights must not become an apparently complete
   total. Do not use AWB document weight as the default fallback.
4. Define operational screening evidence independently of document issuance.
   It needs an exact Booking/cargo target, supplied status/method/agent/time,
   source attribution, approval-safe writes and deterministic watches. Existing
   AWB-linked evidence can be a labelled source, not invented clearance. Do not
   create an AWB merely to record an operational screening event.
5. Verify Booking-only edits leave submitted Quote versions and issued-document
   snapshots unchanged. Include representative Air/mixed-leg relevance, zero,
   clear, stale update, partial totals, permission denial and hosted persistence.

This closes the preliminary ownership trace, not the Air implementation gate.
The Road-column decision and all existing Quote revision/preview approvals are
still outstanding; tracking, Customs/iCustoms and PDF-logo work remain excluded.
