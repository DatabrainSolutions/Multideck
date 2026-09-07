# Screening schema preflight — not a deployment

The current development project `aqtwypsuijxlnvtxpuxe` reports 462 migrations,
latest `20260907131646`, and no `booking_api.cargo_security_evidence` table.
Both screening migrations remain unapplied remotely.

A fresh schema-only export of public, booking_api, quote_api, private and
document_api was restored into disposable PostgreSQL 17. It includes no business
rows, Auth identities or Storage objects. Managed Auth/Storage boundaries are
explicit empty fixtures. The existing isolated release directory was used for
connection preparation; repository linking and hosted grants were not changed.
Docker export was unavailable, so the established native pg_dump helper was
used with credentials withheld from arguments/output.

Schema SHA-256:
`7a01f2260203472ebf9b94d375edd4194f96869b024503dcf5dee5e92094747c`.
The [pinned migration plan](2026-09-07-air-screening-development-plan.json) passed
hash validation and both migrations applied successfully. Checks confirm private
evidence RLS/table/helper access, service-only save/read/action adapters,
always-approval registration and the enabled deterministic signal trigger.
Existing typed-cargo RLS and Quote finalisation/allocation/revision service
boundaries also pass. No unrelated migrations were applied.

Command:

```sh
node supabase/tests/tools/freight-schema-rehearsal.mjs /tmp/multideck-screening-current-schema.sql --release-plan=/Users/leewright/repo/Multideck/docs/release/2026-09-07-air-screening-development-plan.json
```

Log: `/tmp/multideck-screening-schema-rehearsal.log`.
This is structural rehearsal only. Populated preservation checks against this
fresh schema remain open, as do final remote drift/security checks and combined
hosted operator/approval/watch verification. Separate local lifecycle fixtures
are not presented as hosted proof. No deployment or business-record write was
performed; existing exclusions and approval holds remain unchanged.
