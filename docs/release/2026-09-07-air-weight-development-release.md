# Air weight development release

## Backend verified

On 7 September, development project `aqtwypsuijxlnvtxpuxe` received exactly the
six hash-pinned migrations in `2026-09-07-air-weight-migration-plan.json`.
The isolated release directory `/tmp/multideck-air-release.XuRBfD` reconciled
all 456 existing remote identities and added only these six files. Dry run and
apply included no seeds, roles or unrelated migrations. The separate unapplied
Finance invoice-line migration was excluded. All six applied identities were
confirmed independently from the live ledger.

Fresh count-only inventory before release: 21 cargo keys absent, two explicit
nulls, all 78 shipment override keys absent. No non-null legacy conversion was
needed. Existing submitted Quote and Booking header fingerprints were unchanged:

| Scope | Rows | Before and after MD5 |
| --- | --- | --- |
| Booking headers | 78 | `4c1ba5330ad3a48591d8e9ab0367c12e` |
| Quote versions | 38 | `48f5e0efb6d918d4019edbf8d9e47a28` |

Serialization: ordered concatenated full-row JSON; Booking ordered by Job_ID,
Quote versions ordered by full-row JSON. Compare only this method's hashes.

The application function catalogue grew from 1,042 to 1,044. Exactly the 12
reviewed Air definitions changed; no existing function was removed and no
existing execution ACL changed. New preserved normalizer is private; new Dexter
weight-override action is service-role-only. Security advisors remain 1,555,
with zero added/removed identities (name, level, cache key, metadata). Existing
findings are not certified safe; see the [Supabase security advisor guidance](https://supabase.com/docs/guides/database/database-linter).

Dexter version 168 is ACTIVE with JWT verification retained; bundle SHA-256
`80ea68c2e45d6ff5cd778123cb70ae3a98617b22ee61c2f2bb76d435530f0b85`.
All 23 downloaded deployed source files match checkout byte for byte. Booking
remains version 45; unrelated function metadata is unchanged. No function was
pruned. Before/after downloaded sources are retained in the release directory.

## Client release in progress

Merged teammate Finance commit `fbadac62d45870b078cdad6817b6d817bccf08b4`
without conflicts, producing `54d6da2`. All teammate files are retained unchanged.
The client build and 45 focused Air/Finance regression checks passed; logs:
`/tmp/multideck-air-final-merge-build.log` and
`/tmp/multideck-air-final-merge-tests.log`. Existing bundle-size warning remains.
Fresh fetch showed no incoming divergence before ordinary non-force dev push.
Push succeeded to `dev` at full commit
`54d6da2f078dd56dd45da6ac798cd32f87718230`. Vercel deployment
`dpl_6VmMa56DW2bjsiQSkCDvVc7734BJ` remains QUEUED on the latest inspection;
URL `multideck-app-1azwwc79s-databrain-solutions.vercel.app`. Continue inspecting
this deployment, not creating a replacement. It has not yet proved READY or
assignment of the approved `dev.multideck.app` alias.
Vercel READY/version/alias and hosted Air save/reload/restore plus Dexter
approval/watch checks remain pending until separately recorded below.

Read-only live normalizer returned zero, `1234.123456789` and explicit null
exactly. All 23 typed cargo weights remain null as expected from preflight.
Direct execution of the new override action is denied to anon/authenticated
and granted to service_role. This is not hosted actor/approval lifecycle proof.

No Vercel/team/environment/domain setup changed. Customs/iCustoms, tracking,
PDF-logo work and the held JQ20022 revision send/accept/selective-apply approvals
remain untouched. This release does not complete the all-mode goal.
