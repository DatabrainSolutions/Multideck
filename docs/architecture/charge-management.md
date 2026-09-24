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

## Operational charge selection

Both quote editors load active catalogue codes for the quote direction and mode.
The save function checks each charge against that matrix and stores its catalogue
identity on the quote line. A rejected or inactive code rolls back the entire
save. Existing free-text lines remain visible so an operator can select a
managed code when revising the quote.

Accepted-quote conversion, quote revisions applied to a booking, and release of
provisional booking charges carry the same code identity onto booking costing
lines. The booking handoff resolves each non-zero cost or revenue through the
legal entity's charge nominal mapping and assigns its actual Multideck posting
nominal. A missing mapping stops the handoff before a booking line can fall back
to a generic nominal. The booking read API exposes the code alongside the line
description. Older historical snapshots without codes are retained; they are
not silently assigned a possibly incorrect code.

The nominal relationship is configured for each legal entity. Existing
postings and provider mappings are not rewritten by catalogue edits. Dexter chat
and Watching for you explicitly treat catalogue reads, writes and watches as
unsupported, because exposing a partial view could misstate charge eligibility
or nominal resolution.
