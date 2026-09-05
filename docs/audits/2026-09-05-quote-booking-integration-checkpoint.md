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

## Refreshed integration checkpoint, 5 September 2026

- Fetched current `origin/dev` at `4198348` and merged it into `codex/freight-workspace-foundation` as `01bc1d0`.
- Preserved the team's support-conversation/PDF attachment changes and updated repository instructions. The two automatically merged gallery files retain both the freight Tabs entries and the support attachment entries. No text conflicts or wholesale ours/theirs replacements were required.
- The previously committed freight foundation (`907b7a8`, `e42b2b2`) is included. Quote and Booking implementation files and the stable-item migration are unchanged from that foundation during this integration. Existing lifecycle decisions and open work remain in `docs/plans/freight-workspace-completion.md`.
- Unfinished Dexter cargo parity was checkpointed separately as `74dca12` on local branch `codex/safety-dexter-cargo-draft-2026-09-05`, with recovery tag `safety/dexter-cargo-draft-2026-09-05`. Its unverified migration and action are deliberately NOT merged into dev. Resume with review and lifecycle tests, not deployment of that snapshot.
- Refreshed production client build passed, with existing bundle-size warnings. All 82 focused Quote/Booking checks passed, including the disposable PostgreSQL save regression (not skipped).
- Support checks: 25 passed, one failed. `create-support-ticket.test.mjs` still expects the older exact seven-action list, while the current support handler includes three message-attachment actions. Both the test and implementation are byte-identical to `origin/dev` at `4198348`; the failure is inherited, not introduced by this merge. No unrelated test or handler was changed to hide it.
- Full repository suite and complete live lifecycle were not rerun for this checkpoint. The earlier broad-suite limitations still apply.
- Recovery tag for the refreshed integration: `safety/quote-booking-dev-sync-2026-09-05`.
- This is a source-control checkpoint, not a claim that all freight features are complete or that database migrations have been deployed. No live database, customer data, Vercel settings or team configuration was changed in this integration pass.

## Verified cargo checkpoint publication, 5 September 2026

- Fresh `origin/dev` is `390de33`, already an ancestor of the clean working branch. Only `ed33640` and `d8a8bae` were ahead; no conflicts or replacement of the team's changes were necessary.
- The isolated Dexter cargo draft has now received the verification described in the completion ledger. It is included in this source checkpoint, superseding the earlier instruction to leave the unverified draft out of dev. Live migration reconciliation and deployment remain separate, unfinished work.
- Reran the focused cargo approval, real disposable PostgreSQL lifecycle, security and support parity checks: 24 passed, zero failed, zero skipped. The earlier repository-wide limitations remain; this is not a claim that all tests or all freight workflows are complete.
- Production client build passed again (TypeScript and Vite), with the existing bundle-size warning.
- Existing Quote/Booking lifecycle decisions remain unchanged. No additional feature implementation or live database changes were undertaken for this checkpoint.
- Recovery tag for this publication: `safety/quote-booking-verified-cargo-2026-09-05`. The earlier dev checkpoint remains available at `safety/quote-booking-dev-sync-2026-09-05`.

## Quote evidence checkpoint publication, 5 September 2026

- Fresh `origin/dev` at `bafa6c3` is already an ancestor of the working branch. The two additional implementation commits are `0120849` (typed version-owned Quote cargo foundation) and `9dfc62b` (version-bound PDF evidence and cargo rendering). Fast-forward integration requires no conflict resolution or replacement of existing decisions.
- Refreshed checks: 11 focused Quote cargo/PostgreSQL/document tests passed, zero failures or skips; the full `quotes-workflow` import graph passed Deno checking; the production client build passed with the existing bundle-size warning. These checks do not supersede the earlier repository-wide test limitations.
- Recovery tag: `safety/quote-booking-quote-evidence-2026-09-05`. Previous checkpoints remain available. A newly generated, empty migration placeholder for future readiness work was removed; it contained no implementation or data.
- This is a source-control safety checkpoint only. The new Quote cargo migration remains unapplied, and the completion ledger explicitly records unfinished editor, readiness, public-response and Booking handover work. No live database changes, customer email, Vercel settings or team configuration were changed. Hosted deployment and full live lifecycle verification are not claimed.
