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


## Edge and website activation, 9 September 2026

The owner subsequently requested the complete deployment for manual testing.

- App project `aqtwypsuijxlnvtxpuxe`: deployed `live-company-gateway` and `live-grant-admin`; configured dedicated server-only `LIVE_GATEWAY_KEYS`.
- Portal project `eofqgeffjbbjgadkzkrk`: deployed `live-portal`; configured `LIVE_CONNECTION_WRAPPING_KEY`, `LIVE_WAREHOUSE_MODE=central`, and the exact central origin in CORS. Existing provider secrets and membership records were retained.
- Dev discovery is enabled only for the existing `dev` preview branch. `https://dev.multideck.app/.well-known/multideck-live.json` returns HTTP 200 and the verified Dev project reference.
- App deployment `dpl_AZgJxCcqgNAuVFvo6T1vDdn7HXwm`, source `c7af748`, is ready at `dev.multideck.app`. Other App domains were not promoted to this release.
- Live deployment `dpl_FhK13aAjAPGtHX8bM1hACWJ6esKW`, source `194ef07`, is ready at `multideck.live`. The old demo hostname redirects there with HTTP 307. The central root hostname now shows normal sign-in rather than the legacy workspace chooser.
- Supabase Auth Site URL is `https://multideck.live`; the exact root, `/auth`, setup-password and reset-password callbacks are allowed. Existing callbacks remain intact.
- Registered **Multideck Dev**, connection `204c8ff8-5034-4bef-b8a0-4e95bc58d3c1`, key identifier `dev-live-20260909`, through the audited connection function after validating public discovery. The integration secret is encrypted in the portal registry and is not documented or committed.
- The portal retains its existing internal workspace hostname `jenkar.multideck.live` for membership resolution. This is a server configuration binding to the existing identity store; it does not select the operational company. Company warehouse requests now resolve explicit App grants.

Earlier Git-triggered Live deployments were blocked by Vercel because the commit author was not a team member. These releases were explicitly deployed through the owner's authenticated Vercel account. No paid team member was added and commit authorship was not changed. Future Git pushes alone should not be treated as proof of deployment until that author/team configuration is resolved.

Availability confirmed: central `/auth` HTTP 200 with asset `index-lmYlxDcq.js`, demo redirect to the same page, Dev discovery HTTP 200, App grant and portal routes return sign-in-required responses, and the gateway rejects unsigned access. The Live client build passed; Edge checks and 40 tests passed before the owner clarified they would perform manual workflow testing. No further customer workflow tests were run, no operational records were created, and no customer grants were enabled.

### Original manual customer assignment (superseded below)

1. In Live Admin, choose the existing customer user and full customer profile. Copy that user's Live reference. The **Company connections** screen already contains **Multideck Dev**; no secret entry is needed.
2. In Dev App, open **Organisations → Companies** at `/crm/accounts`, select the intended company, and select its **Multideck Live** tab. Use connection reference `204c8ff8-5034-4bef-b8a0-4e95bc58d3c1`, that Live user reference and key identifier `dev-live-20260909`. Select the permitted warehouses and product/general-order/purchase-order actions, enable the grant, provide a reason, and save. Copy its grant reference.
3. In Live Admin → **Company customer access**, select **Multideck Dev**, the same user and customer profile, paste the App grant reference, enable it, and save. The customer can then sign in at `https://multideck.live/warehouse`.

Customer identity, operational customer and warehouse choices are deliberately left for the owner, who chose to test manually. Admin membership alone is not customer warehouse access.


## Company record placement, 10 September 2026

Warehouse customer access and Multideck Live access are managed on each company record under `/crm/accounts` → Overview. Both controls were removed from the separate Customers detail screen. The same organisation ID, existing permissions, grants and backend operations are reused. The warehouse access panel remounts when the selected company changes so its form state cannot carry into another company. No database migration or key reconfiguration is needed. The owner will perform manual workflow testing.


## Dedicated Live tab, 10 September 2026

Company records now place the grant workspace in a dedicated **Multideck Live** tab next to Setup. The duplicate legacy Warehouse customer access panel is removed from company records, and Overview no longer mounts either access workspace. Existing organisation IDs, grants, permissions and warehouse assignments are retained. Legacy signed-in warehouse users retain their existing account-management route pending migration; no accounts or authentication records are deleted by this UI change.


## Email setup deployment, 10 September 2026

Applied App `20260910130500_live_customer_access_email` to `aqtwypsuijxlnvtxpuxe` and Live `20260910130000_app_managed_customer_access` to `eofqgeffjbbjgadkzkrk`, recording migration history in the same transactions. Deployed Live `live-company-access` and App `live-grant-admin`. App now pins the existing Dev connection through server-only `LIVE_PORTAL_CONNECTION` and reuses its existing integration secret. Enabled App-managed setup only on the reviewed Multideck Dev connection (version 2), with an audit entry.

The company tab now asks for the customer's existing Live email, optional choice of full customer profile, warehouses and actions. It automatically saves both sides. Technical references and the separate manual Live assignment step are removed from routine setup. Interrupted synchronisation shows **Finish Live setup**. New customers still need their invited Live customer account/profile; this release creates no users and sends no email.

Local validation covers client build, App Auth/Training and partial-save handling, signed audience/subject checks, App probe denial, nonce replay, actual SQL cross-workspace/email/profile denials, stale versions, independent revocation, and browser RPC denial. Database DDL was also trialled with rollback before applying. No hosted customer workflow was exercised; the owner will test manually.
