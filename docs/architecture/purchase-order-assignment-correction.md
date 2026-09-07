# Purchase-order warehouse assignment correction

The purchase-order mutation now validates an active product assignment in the selected warehouse rather than requiring that warehouse to be the product's default. Ownership, active product status, workspace access, approval paths, existing audit and order lifecycle remain enforced.

Deployment prerequisite: apply the existing App warehouse schema and the 20260904143000 mobile task lifecycle migration before 20260908013000_purchase_order_assigned_warehouse.sql. The migration deliberately fails if its expected routine is missing or has changed. App main currently predates these prerequisites; this isolated fix is not a claim that main is ready for warehouse deployment.

Verification: Multideck.Live's supabase/tests/warehouse/read-boundary.test.mjs executes the original App purchase-order routine and an exact copy of this patch in local PostgreSQL-compatible PGlite. It proves failure before the patch, success and idempotent replay for a non-default assigned warehouse afterwards, and rejection after assignment revocation or product deactivation. These tests use synthetic identities and records, not hosted tenant data.

Dexter parity: this corrects the existing shared purchase-order mutation used by the allowlisted create_purchase_order action. It adds no action, read domain or event. Existing operator purchase_orders reads and database watch signals remain unchanged; customer-facing Live chat/watch access remains explicitly unsupported pending a verified Live identity adapter. Full hosted operator chat/approval/audit/watch lifecycle verification remains a release check and is not proved by this local regression.

Mixed-unit goods-out availability and allocation remain separate unresolved lifecycle work. No hosted database change is applied by this commit.

## Goods-out submission unit conversion

Migration 20260908014500 introduces an internal, service-only unit conversion helper and uses it in the existing scoped order-creation availability total. Each eligible inventory balance is converted into the requested line unit using the product's packaging definitions. The base unit is 1; missing, zero, negative or non-finite conversion factors fail explicitly. Tenant/customer/warehouse filters and the existing creation/audit path are unchanged.

The Live local SQL fixture executes an exact copy of the migration over the actual App order-creation routine. Two CASE balances at twelve EA per case previously rejected twenty EA; after migration twenty succeeds and twenty-five fails. Both conversion directions, base units, unknown units, non-finite quantities and failed-submission rollback are checked.

This fixes submission validation only. Operator allocation, cancellation and dispatch still need matching conversion handling, including immutable conversion evidence on allocated tasks and storage precision checks. Do not treat this batch as mixed-unit operational release readiness. Dexter continues through the same allowlisted backend mutation; its existing read/event boundaries are unchanged, and hosted lifecycle verification remains pending.
