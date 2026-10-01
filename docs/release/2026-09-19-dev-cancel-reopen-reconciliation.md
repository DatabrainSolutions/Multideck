# Dev sync and Cancel/Reopen reconciliation — 19 September 2026

## Completed local steps

1. Saved all previously unfinished Cancel/Reopen work and evidence in local checkpoint `432a709`.
2. Merged origin/dev `b4e8698` in `e170912`. All 39 incoming commits are included. One actual merge conflict occurred in the lifecycle test's adjacent migration imports; both branches' imports/checks were retained. Colleagues' Booking UI and other changes were not replaced.
3. Renumbered our **unapplied** cancellation migration using the CLI to `20260919080625_provisional_cancellation_audit.sql`. It now follows dev's `20260915174500_booking_quote_charge_domain.sql`, rather than having its discarded-charge protection overwritten by that later function replacement. No previously applied migration or colleague's migration was edited.
4. Ran the checks below and retained known upstream failures without weakening assertions.

## Quote-charge overlap

Dev adds freight-domain classification when deferred accepted-Quote charges transfer into Booking costing. This is compatible with our Keep/Discard policy. Our migration narrowly adds the Discard guard to the current function body rather than replacing the colleague's classification logic. Tests now assert that kept charges transfer exactly once with domain `freight` and the original cost 45/revenue 60 fixture amounts; repeated cancellation/reopening of discarded charges never transfers them. Original Quote evidence remains unchanged.

There is no business-policy conflict requiring a new decision from Lee in this reconciliation. The Quote Charges screen was not redesigned or changed by this step. Earlier unified Goods work is retained separately from colleagues' Quote changes. Actual finance/costing records still require Finance review; this step does not broaden Discard to posted or historical finance records.

## Checks

- Client installed compiler: `tsc -b --pretty false` passed.
- Cancel/Reopen policy, actual Edge-handler fixture and disposable PostgreSQL migration suite: **12 passed**.
- Required shared-data access regression runner: **29 database/contract cases plus 10 access contracts passed**, no skips. Its lifecycle case overlaps the targeted suite; totals are not distinct coverage counts.
- Booking draft rebasing, cargo allocation, Job-reference and route-schedule suites: **17 passed**.
- Finance accrual/WIP suite: **3 passed, 1 failed** on an expected old baseline migration comment marker. Both tested files are byte-identical to origin/dev.
- Customer panel suite: **3 passed, 2 failed** on display expectations (`No preferences saved`, `Do not use…Email`). Test and component are byte-identical to origin/dev.
- Quote Details source-contract suite: **9 passed, 6 failed** on layout/control/source-string expectations. Executing origin/dev's own test against origin/dev file contents via an in-memory read overlay reproduced all six failures. No checkout or test assertions were changed for this comparison.
- `git diff --check` passed.

These checks do not prove the enabled browser journey or every incoming feature. Existing local hold points remain: enabled cancellation dialog keyboard/mobile checks, remaining indirect-child/attachment protections, and connected Cancel → reload → Reopen verification. Detailed Dexter cancellation actions remain explicitly unsupported; no hosted watch-delivery claim is made.

## Safety and handover

Only local Git history and files changed. No push, deployment, shared database mutation or migration application occurred. No new worktree was created. Test databases were disposable local fixtures. Shared enablement still requires explicit approval, including the documented migration/finance-accruals/bookings-workflow ordering.
