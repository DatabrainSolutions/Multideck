# Live warehouse database rollout — 9 September 2026

## Verified targets

- `dev.multideck.app` public client identifies App project `aqtwypsuijxlnvtxpuxe` (MultiDeck).
- `multideck.live` currently redirects to `demo.multideck.live`; its public client identifies portal project `eofqgeffjbbjgadkzkrk` (Multideck-jenkar).
- The portal database's existing tenant hostname is `jenkar.multideck.live`. This rollout does not change that hostname, existing memberships or deployment routing.

## Applied

App project, in one transaction with migration history recorded atomically:

1. `20260909090000_live_gateway_runtime_prerequisite` — restores the missing deny-only Dexter helper, without replaying unrelated historical operational migrations. This repair ran before the missing historical prerequisites.
2. `20260904143000_warehouse_mobile_task_lifecycle` — required item/facility assignments and operational order/task routines.
3. `20260908013000_purchase_order_assigned_warehouse`
4. `20260908014500_warehouse_order_quantity_conversion`
5. `20260908020000_warehouse_allocated_unit_evidence`
6. `20260908030000_live_company_gateway`
7. `20260908033000_live_company_mutations`
8. `20260908040000_live_company_order_reads`
9. `20260908043000_live_grant_administration`

Portal project, in one transaction with migration history recorded atomically:

- `20260908034500_company_connection_registry`
- `20260908041500_company_customer_access`

Only these reviewed changes were applied; no blanket push of pending migrations was used. Original migration files were preserved. A hosted rollback trial found the missing Dexter helper before App changes were committed; the complete corrected trial passed.

## Verification

- Both projects' migration histories confirm the versions above.
- App transaction checks confirmed balance count and on-hand, available, allocated, reserved and held quantity totals were unchanged.
- New private tables have RLS enabled; browser roles cannot invoke gateway mutations, grant administration or private credential resolution/read access.
- Unconfigured and foreign-subject gateway requests are denied.
- Context, stock, products, general-order and purchase-order registers were executed against the hosted App schema using a temporary grant inside a rolled-back transaction. No temporary grants, request records or keys were retained.
- App has zero integration keys and customer grants; portal has zero company connections and customer assignments after rollout.
- The existing local WMS lifecycle/boundary test passes. The added Dexter helper only raises the existing authenticated-runtime-required error; it introduces no chat action or watch. Existing warehouse migration adapters are retained; a hosted end-to-end Dexter/watch lifecycle is not claimed.

## Remaining connection setup

This was a database rollout only. Deploy/reconcile the App gateway and grant-admin Edge Functions and central Live API, configure dedicated integration/encryption keys, enable App discovery and verify the deployed frontend versions. Resolve the portal's existing hostname/deployment configuration for central `multideck.live`, then configure reviewed customer grants and run signed end-to-end acceptance. Do not claim the websites are connected solely because these migrations are applied.
