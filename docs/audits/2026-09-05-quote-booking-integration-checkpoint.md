# Quote and Booking integration checkpoint

Integrated the Quote/Booking working changes with origin/dev at a04b86b on 5 September 2026.

## Recovery

- Pre-merge working changes committed as b717191.
- Recovery tag: safety/quote-booking-2026-09-05.
- Merge commit: c44e893. No text conflicts or ours/theirs overrides were required.
- Existing Quote versioning, acceptance, selective Booking updates, audit preservation, reference rules, container allocation and branch-relative direction changes are retained.
- Research decisions remain recorded in `.codex-audit/2026-09-04-freight-guidance-review/freight-guidance-review.md`; this integration does not implement that proposed redesign.

## Migration filename conflicts

Four Quote migrations overlapped other migration version identifiers. Their SQL is unchanged; filenames and test references now use these unique identifiers, retaining dependency order:

| Migration | Previous | Current |
| --- | --- | --- |
| quote_draft_version_lifecycle | 20260903120000 | 20260903120100 |
| quote_version_foundation_reconciliation | 20260904110000 | 20260904110100 |
| quote_submission_document_boundary | 20260904120000 | 20260904120100 |
| repeat_quote_new_master | 20260904143000 | 20260904143100 |

No live database migrations or migration-history repairs were run. Existing deployed history must be compared by migration name and content before deployment; do not replay previously applied SQL solely because its local filename differs. Older duplicate migration identifiers and files already present on origin/dev remain a separate deployment-reconciliation issue.

## Verification

- Production client build passed (TypeScript and Vite); bundle-size warnings remain.
- 72 focused Quote/Booking tests passed, including version lifecycle, Booking sync review, accepted documents, PDF submission, container allocation/order, direction, repeat quotes and detail layouts.
- Broad Node `.test.mjs` run: 1,595 tests, 1,539 passed, 55 failed, one skipped.
- Compared the same broad command against isolated pre-merge and origin/dev checkouts with the same client dependencies. Every merged failing test also failed in at least one parent; no unique merge failure was detected.
- These checks are not complete browser, live database or customer-email lifecycle verification. The repository-wide suite is not green.
- No new product features or live backend deployments were performed by this integration.
