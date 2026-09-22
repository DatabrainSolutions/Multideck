# Warehouse pricing verification — 22 September 2026

## Implemented locally

- Warehouse → Pricing at `/warehouse/pricing` for defaults across facilities.
- CRM account → Warehouse for customer overrides, including the requested account and direct `?tab=warehouse` links. Pricing drafts remain mounted when switching account tabs.
- Four selectable charging stages, editable rates, effective dates, explicit default restoration, permission-aware saves and a constant-stock estimate.
- Private company-scoped storage, server validation, optimistic version checks for both the edited card and its inherited defaults, and atomic audit history.
- Gallery previews, source, usage examples and product links for Pricing stages and Warehouse rate editor.
- Explicit Dexter chat/read/write/watch exception for pricing configuration; existing operational watches are not presented as pricing watches.

## Verification evidence

- `node --test multideck.client/tests/warehouse-pricing.test.ts`: 4 passing cases covering inheritance/expiry, free periods, minimums, zero quantities, fixed/event charges, started days/weeks, fractional hours, rounding, invalid rates and overlapping dates.
- `PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node supabase/tests/run-data-access-regression.mjs`: 36 database/access tests and 10 selected contracts passed. Temporary PostgreSQL fixtures only; no tenant migration was applied.
- The focused pricing PostgreSQL fixture passed again after adding successful update/version checks and the actual `warehouse` Dexter capability metadata. It tests saved reads, updates, stale card/default saves, invalid rates, overlap, audit rollback, colleague reads, write denial, creator deactivation, foreign company/account denial, inactive/unlinked/unprivileged users and anonymous callers.
- `npm run build`: passed; existing large-chunk warnings remain. TypeScript passed again after the UI refinements.
- Chrome isolated UI fixture: default pallet storage £2.50, ten pallets, seven nights with one free night → £150. Customer override £1.25 → £75. A fixed £20 inbound booking fee → £95 combined estimate. Restoring the default returns storage to £150; discarding the change returns £75.
- Simulated save failure preserves the draft. Retry succeeds; the isolated saved fixture survives reload. Initial load failure displays a recovery action; retry restores the card. Read-only mode removes mutation controls. Required empty charge names prevent apply and focus the missing field. Keyboard entry and measurement selection work.
- UK/US formatting checked: `22 Sept 2026` / `Sep 22, 2026`. Mobile viewport 390px: page content width equals its available width (375px after scrollbar). Desktop and mobile layouts inspected visually.
- Browser logs showed one React root warning caused by hot-reloading the temporary QA entry, not the product component. No pricing runtime/network error appeared apart from the deliberately simulated failure. The temporary entry and fixture were removed; browser viewport and UK English were restored.

## Not confirmed live

Chrome's actual account route requires sign-in, so the authenticated account-tab journey and live saves were not verified. The browser fixture exercised the real UI with an isolated test adapter; PostgreSQL persistence was verified independently. These must not be described as a live integrated test.

The two new migrations and Dexter function change have not been deployed. No production rates, customer records, permissions or billing events were changed. Automatic event rating, historical stock reconstruction, tax and invoice posting remain outside this pricing-configuration release. A future tenant rollout requires the policy's target-tenant checks before and after applying the migrations.
