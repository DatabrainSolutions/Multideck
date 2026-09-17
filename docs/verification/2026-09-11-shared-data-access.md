# Shared data access regression coverage — 11 September 2026

## Live audit

Ran `supabase/tests/operational-access-preflight.sql` against the live MultiDeck
project `aqtwypsuijxlnvtxpuxe`. All 12 active internal accounts passed. Each account
was evaluated under PostgreSQL's authenticated role with its real Auth identity.
Exact visible quote and booking ID sets matched the company's expected records.
All temporary probe state was rolled back; no business record was changed.

All accounts received the same 86 booking headers, 31 quote headers, 46 routing
rows, 24 cargo rows, 19 quote lines, 20 organisations and 78 stored document
catalogue entries. Public list RPCs returned 84 bookings and 31 quotes consistently
across accounts. The register's filtering is distinct from the raw header count;
no new register filtering was introduced by this change.

The earlier customs repair remains live: the affected accounts can read the 18
standalone declarations and their items. No additional permission broadening was
needed for quotes or bookings.

## Prevention

`node supabase/tests/run-data-access-regression.mjs` runs the release access suite.
PostgreSQL must be available: missing binaries fail the command instead of silently
skipping database tests. The workflow runs on pull requests and pushes, without
path filters that could leave a required check pending.

The new operational fixture reads current helper definitions and read policies
from the migration chain, rather than asserting strings in one historical
migration. It also replays subsequent top-level role-permission mutations so later role grant removals are tested. It covers 14 tables: colleagues, offices, jobs, routing, cargo, quote
headers and lines, organisations, documents, report runs, personal notifications,
personal job favourites and CRM Drive folders/files. Customs now resolves its
latest shared access helpers and read policy as well.

Behavioural cases include another creator's records and their children,
legacy/current office ownership, unowned records failing closed, cross-company
reads, inactive/deleted/unlinked/anonymous callers, preserved company history after
creator deactivation, immediate access revocation, explicit Drive permissions,
private notification/favourite boundaries, current standard operational role
permissions and denied viewer writes.

Existing executable database tests additionally cover reports and schedules,
Dexter actor identity, approvals, deterministic deal/address watches, provisional
booking lifecycle and public quote-response isolation. Focused source contracts
cover Calendar, finance and warehouse permission boundaries. Those source checks
do not constitute complete live workflow testing for these areas.

Local result: 32 checks passed, zero failures and zero skips. The full Calendar
and finance source suites were also attempted and exposed seven existing layout,
copy and UI-shape assertion failures. Their files were not changed or weakened;
the access runner selects only their ten access-boundary cases. It does not claim
their complete suites pass.

`docs/agent-policies/data-access.md`, linked from AGENTS.md, requires standard-user
and child-data verification for future access changes across operational areas,
including newly affected modules. Personal/provider/financial restrictions remain
explicit. Direct production migration work must run the same tests and the
appropriate before/after live probe; GitHub checks cannot intercept manual SQL.

## Release boundaries

The change is prepared as a focused branch from `dev`, without the unrelated
Task Agents work in the shared checkout. GitHub's `Data access regression` check
is intended to be required on both `dev` and `main`; confirm the remote check and
ruleset before claiming enforcement. Merging the reviewed change remains distinct
from its passing check. No frontend deployment, file download, provider operation
or every-module browser journey is claimed by this access audit.
