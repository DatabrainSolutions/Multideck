# Charge catalogue and nominal relationships

Finance Setup > Ledger owns the tenant's charge catalogue. Each code has a name,
category, description, financial side and active state. Administrators can set
the quote and booking combinations separately by direction (import, export,
cross trade, other) and mode (air, sea, road, mix, other). An existing code with
no configured matrix retains its former unrestricted status until reviewed.

The catalogue is shared within one physically isolated tenant. A charge's cost
and revenue relationships are selected per legal entity through
`FIN_ChargeNominalMappings`, then resolve to Multideck actual, accrued and control
nominal accounts. External accounting provider mappings continue to use those
Multideck nominals. No provider code is stored on the charge catalogue record.

Catalogue mutations go through `multideck_manage_charge_catalogue`: the
server checks the finance configuration permission and legal entity, validates
the matrix, replaces it atomically, checks the version, and writes an audit
snapshot. Deactivation retains historical charge identities and postings.

## Current integration boundary

The direction and mode matrix is management configuration. Existing quote and
booking charge entry still accepts legacy free-text lines and does not yet
persist a charge identity consistently. It must be wired to the catalogue and
validated on save before the matrix can be described as an operational
restriction. Existing postings and provider mappings are not rewritten by
catalogue edits. Dexter chat and Watching for you explicitly treat catalogue
reads, writes and watches as unsupported, because exposing a partial view could
misstate charge eligibility or nominal resolution.
