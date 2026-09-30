# Freight workspace dev merge checkpoint

30 September 2026. Local branch: `codex/freight-workspace-foundation`.

## Preserved history

- `3dc90de2`: saved all 74 changed/new local files before merging.
- `d00fc521`: merged `origin/dev` at `aab23b27` (135 incoming commits).
- Final sync also includes `48d285b0`, the Warehouse billing commit that arrived while verification was running.

## Resolved conflicts

- Booking details: retained multiline fields, cargo accordion and split load plan alongside dev's address autocomplete and shared table controls.
- Notifications: retained new-arrival callbacks alongside dev's unchanged-feed deduplication.
- Design review notes: retained both cargo-load-plan and supplier-review entries.
- Finance migration manifest: explicitly separated the twelve existing freight/document migration files from the Finance installer; retained dev's separate Warehouse billing exclusion. Future migrations still trigger the existing review gate. No applied migration was edited.

The UI/layout review preserved existing operator workflows and composed the shared controls rather than creating a competing interface.

## Verification

- Production client build: TypeScript and Vite passed; existing import/chunk-size warnings remain.
- Focused notification, submitted-quote charges, cargo allocation, Customs source and Booking workspace checks: 52 passed.
- Separate freight/document migration checks: 8 passed with none skipped.
- Final full data-access regression, including Warehouse billing: 140 checks plus 9 provisioning/contract checks passed; none skipped. PostgreSQL suites ran in isolated local databases, not a shared backend.
- Chrome, JE0991153: cargo editor expands; saved load plan remains 20 + 20 pallets across two 40GP containers; entering 41 for the first container reports an excess of 21 and disables Save. Escape discards that draft, and reopening shows the saved 20/20 split unchanged. No record was saved during QA.
- Load-plan sheet checked at desktop and 390px mobile width; footer actions remain accessible. Escape closes it. Browser viewport reset and temporary QA tab closed. No warning/error logs were returned for the QA tab.

## Known pre-existing failures

A broader Booking test run had six failures, reproduced unchanged on a temporary archive of pre-merge `3dc90de2` (not a worktree):

- `booking-cargo-safety-ui.test.mjs`: fixture's CommonJS evaluation omits `require`.
- `booking-cargo-value-ui.test.mjs`: selected-line editing assertion.
- `booking-detail-editing-contract.test.mjs`: four stale source-pattern/type expectations.

These were not weakened or fixed as part of the merge. The repository is not being reported as universally test-green or release-approved.

## Release boundary

Local Git checkpoints only. No GitHub push, hosted deployment, shared database migration, email or business-record mutation was performed. Incoming backend migrations/functions still require their own release approval and live verification.
