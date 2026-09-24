# Warehouse pricing database installation

Target: **dev.multideck.app**, Supabase **MultiDeck Development**, project `aqtwypsuijxlnvtxpuxe`. The live application's public workspace configuration and the linked CLI project matched before installation.

The frontend was already deployed, but `warehouse_pricing_card` and its private tables were absent. Both pricing migration versions were missing from the remote migration ledger. This caused the account Warehouse tab and default pricing page to report that the database update needed installation.

Installed only:

- `20260922160000_warehouse_pricing_cards`
- `20260922160100_warehouse_pricing_dexter_boundary`

The two reviewed migration bodies and their history entries were applied in one transaction, followed by a PostgREST schema reload. No unrelated pending migrations, tenant databases, user roles, prices, customer data or billing records were changed. No additional Edge Function deployment was needed for the pricing RPC.

## Evidence

- Re-ran the required PostgreSQL access regression suite before installation: 38 tests plus 10 selected contracts passed.
- The pricing commit's GitHub Data access regression runs were successful, including [the dev branch run](https://github.com/DatabrainSolutions/Multideck/actions/runs/35714261653).
- Ran `supabase/tests/warehouse-pricing-live-preflight.sql` before and after. It changed from `pricingInstalled: false` with no recorded versions to `pricingInstalled: true` with both versions recorded.
- The post-install probe executed reads under each linked user's authenticated role, checked permission agreement and account scope, denied inactive/unprivileged/unlinked callers, and verified private-table RLS plus denial of direct authenticated/anonymous table access and anonymous RPC execution.
- Five currently assigned Administrator users have Warehouse read/write permission. The existing Company Manager, Company User and Customs Reader assignments do not. This rollout preserved those mappings; it did not grant warehouse access. Standard permitted colleague reads and foreign-company rejection remain covered by the isolated PostgreSQL fixture.
- Verified the authenticated live CRM account `de1000c1-5eed-4ead-8000-000000000004` → Warehouse in Chrome: the customer rate card and Add charge control load, with no configured rates and no installation error. Followed View defaults and verified `/warehouse/pricing` also loads its empty default rate card and Add charge control.

No live test rates were saved. Write validation, persistence, concurrency and audit remain covered by the database regression tests. Automatic billing and the documented Dexter pricing adapter exception are unchanged.
