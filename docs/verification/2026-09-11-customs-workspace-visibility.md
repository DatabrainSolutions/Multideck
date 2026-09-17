# Customs workspace visibility — 11 September 2026

## Root cause and repair

Live MultiDeck project `aqtwypsuijxlnvtxpuxe` reproduced Mark's standalone register as zero imports, zero exports and zero item rows. Mark, Amy and Harry's Company User accounts had no Customs.Read permission. The 10 September INSERT RETURNING repair required this permission for every declaration read, including the creator's own records. The older shared access helper also restricted company-wide permission access to named management roles, so list access and item/document/Dexter access could disagree.

Migration `20260911103000_customs_consistent_workspace_read_access.sql` restores scoped creator/assignee/department/handoff visibility and lets explicit Customs.Read holders read same-company declarations through the common access helper. The direct creator check preserves INSERT RETURNING. Soft deletion, active callers and company isolation remain enforced. Write checks are unchanged.

The migration adds a Customs Reader role with Customs.Read only. Live role membership was assigned to the three verified active Company User accounts belonging to Mark, Amy and Harry in the affected company, as part of the requested access repair. Harry's Administrator account already had Customs.Read. Generic Company User and Operator roles were not changed. Future staff who need shared Customs visibility should receive this explicit role or an existing appropriate Customs permission.

## Verified live

Migration application succeeded, followed by authenticated-role SQL transactions with each account's actual auth UID. Transactions were rolled back after reads; no declaration was changed or submitted.

| Check | Mark | Amy | Harry (Company User) |
| --- | ---: | ---: | ---: |
| Standalone exports | 14 | 14 | 14 |
| Standalone imports | 4 | 4 | 4 |
| Accessible Customs item rows | 79 | 79 | 79 |
| Declarations visible without matching child-access authorisation | 0 | 0 | 0 |
| Jobs | 86 | 86 | 86 |
| Quotes | 31 | 31 | 31 |
| Organisations | 20 | 20 | 20 |
| Company user records | 13 | 13 | 13 |
| Stored document catalogue records | 78 | 78 | 78 |

Mark's authenticated `multideck_dexter_query_domain('customs_declarations', null, 50)` returns 18 records. Direct invocation of the internal domain function was correctly denied; verification used the supported public query RPC.

Live policies for jobs, quotes, organisations, colleagues and document catalogue records use office/company relationships rather than requiring the caller to be the creator. Matching counts are targeted evidence, not an exhaustive product audit or confirmation of file downloads.

## Regression coverage and limits

`node --test supabase/tests/customs-consistent-workspace-read-postgres.test.mjs supabase/tests/customs-draft-insert-visibility-postgres.test.mjs` passed against real local PostgreSQL. The new fixture covers company read sharing, INSERT RETURNING, item consistency, read-only permissions, creator/assignee/department/handoff access, soft deletion, foreign-company denial, inactive callers, unprivileged colleagues and unlinked callers.

Six related contract suites returned 38 passes and two failures outside the changed code: document template TypeScript loaded as CommonJS, and an email draft approval expectation (`true !== false`). No tests or validation were weakened. `git diff --check` passed.

Dexter chat, existing watch creation/revocation checks, document access, and lifecycle notes already call the shared Customs access helper, so they inherit the correction. No new write action or watch capability was added. Full watch create/fire-once/non-match/pause/resume lifecycle was not exercised in this repair; its event evaluation was not changed. Cross-company denial was tested locally; independent project-token rejection was not exercised.

Mark's own browser session was not available for verification. He needs to refresh the standalone declaration page. Live backend changes are applied; source changes are included in the focused shared-data access change; see `2026-09-11-shared-data-access.md` for release boundaries. No frontend deployment is claimed.
