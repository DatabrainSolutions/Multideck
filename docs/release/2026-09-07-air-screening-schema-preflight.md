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
The subsequent populated rehearsal also passes using this same schema and pinned
migrations (`--populated`). Synthetic Quote versions/headers, Booking headers,
cargo, equipment, routes, memberships, DG, milestones and watch signals remain
exactly unchanged. Existing registry rows and all unrelated application function
definitions/ACLs are preserved; the new screening table stays empty. The only
initial function-diff failure was the intended workspace wrapper: the fixture
incorrectly listed `(uuid,uuid)` rather than its real `(uuid,text)` signature.
The diagnostic check was corrected after inspecting the migration; no product
code or migration was changed to satisfy it.

Populated log: `/tmp/multideck-screening-populated.log`. Fixtures retain real
application constraints/triggers and use synthetic rows only. This establishes
preservation for those records, not exhaustive hosted tenant behaviour.
Final remote drift/security checks and combined hosted operator/approval/watch
verification remain open. Separate local lifecycle fixtures
are not presented as hosted proof. No deployment or business-record write was
performed; existing exclusions and approval holds remain unchanged.

## Release staging checkpoint

Fresh Git fetch: origin/dev remains `54d6da2`; no incoming commits and no local
worktree changes before this evidence update. Live Dexter remains v168 / bundle
`80ea68c2e45d6ff5cd778123cb70ae3a98617b22ee61c2f2bb76d435530f0b85`;
Booking remains v45 / bundle
`0801f9b54d3e00f1a8566cf92677ab99f9e10ba5406ddd2bd8ea00d20afd6bec`.
Both are ACTIVE with JWT verification. Finance-subledger is now v38 and is
explicitly outside this release; do not overwrite or prune it.

Current security baseline: 1,555 findings (1,314 INFO, 241 WARN), retained as
identities in `/tmp/multideck-screening-advisor-identities-before.json` for the
post-release comparison. Existing findings are not certified safe; see
[advisor guidance](https://supabase.com/docs/guides/database/database-linter).
Full Edge metadata baseline: `/tmp/multideck-screening-edge-before.json`.

Final client build and 27 focused editor/Edge/review/DG checks pass, with the
existing bundle-size warning. Logs: `/tmp/multideck-screening-final-build.log`
and `/tmp/multideck-screening-final-tests.log`.

The existing isolated directory `/tmp/multideck-air-release.XuRBfD` now stages
the two exact hash-pinned screening migrations. A dry run selected only those
two files, with empty seeds/roles and no unrelated migrations. An extra trailing
newline introduced while staging was removed and hashes rechecked against the
plan. No apply, function deployment or Git push has occurred at this checkpoint.
