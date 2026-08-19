# CRM tenant release preflight

This is the release gate for Multideck App CRM tenants. Quotes are outside this scope.

The database check is [crm-release-readiness-preflight.sql](../../supabase/tests/crm-release-readiness-preflight.sql). It is read-only and reports migration, schema, RPC, Drive and legacy-surface security parity without reading customer row contents.

## Current evidence snapshot — 18 August 2026

| Target | Database preflight | CRM tables | Required Edge Functions | Release position |
| --- | ---: | ---: | --- | --- |
| MultiDeck test | 38 / 38 | 106 | `customers` v27; `agent-dexter` v74 | Release candidate; authenticated UI and performance gates remain |
| Multideck-jenkar | 2 / 38 | 0 | Missing; only `live-portal-bootstrap` v1 is present | Not a CRM tenant deployment |

The two Jenkar passes mean the absent legacy CRM view/function surfaces are not exposed. They do not indicate CRM capability. Jenkar is missing the other 36 database gates and has no public application tables.

## Safe tenant provisioning sequence

1. Confirm the exact customer, Supabase project, permanent tenant hostname, project owner and recovery owner. Never reuse the test project or another tenant's credentials.
2. Confirm the target is intended to host Multideck App. An empty portal/bootstrap project is not automatically an App tenant.
3. Take the approved project backup or recovery checkpoint before changing an existing target.
4. Provision the reviewed App baseline, record its exact snapshot/version, then apply only the approved migrations created after that baseline in dependency order. Do not replay the full historical ledger over a baseline, and do not cherry-pick only the latest CRM migrations onto an empty project.
5. Deploy the tenant-safe `customers` and `agent-dexter` Edge Functions from the reviewed source. Configure required tenant secrets server-side and verify the intended JWT/custom-auth boundary.
6. Apply the tenant Auth settings: public sign-up disabled, approved redirect origins only, manual identity linking enabled and no cross-tenant provider credentials.
7. Build the tenant frontend with only that project's public Supabase URL/key and the exact tenant/root host values. Production must fail closed on a hostname mismatch.
8. Run the SQL preflight against the exact target and require every row to pass. Separately verify the deployed Edge Function names, versions and source parity.
9. Provision only an approved pilot roster and clean pilot data. Do not copy test fixtures, Auth users, secrets or customer records between projects.
10. Run authenticated happy, failure and refresh journeys for Dashboard, Accounts, Contacts, Leads, Deals, Contact cards, Drive and pipeline settings on desktop and mobile, including keyboard and Arabic/RTL checks.
11. Run bidirectional cross-project denial using approved test identities: Auth tokens, direct API reads/writes, Storage paths, Edge Functions, deep links and sign-out/session boundaries must not cross projects.
12. Run the agreed matched performance traces and confirm bounded collection, recent-email and Drive reads before broad-volume release.

## Evidence required to sign off

| Gate | Required evidence |
| --- | --- |
| Database parity | Every row from the read-only SQL preflight passes |
| Edge parity | `customers` and `agent-dexter` are active, source-matched and configured for the target project |
| Tenant identity | Exact hostname, Supabase project and frontend environment match; no other tenant reference is present |
| Authentication | Invite-only access, sign-in/out, reset, identity linking and direct deep links work on the tenant hostname |
| CRM lifecycle | Create, edit, transfer, move, convert, win, delete/cleanup and conflict recovery persist after refresh |
| Access denial | Bidirectional cross-project Auth/API/Storage/Function tests deny access |
| Performance | Approved matched traces meet the agreed p75 budgets with bounded reads |
| Data quality | No development fixtures or ambiguous company ownership appear in the pilot UI |

## Stop conditions

Do not release the tenant when any preflight row fails, required Edge Functions are absent, the project/hostname is ambiguous, public sign-up is enabled, the pilot data is not clean, or authenticated cross-project denial has not been demonstrated.

Do not use migration-history repair to disguise missing schema. Ledger repair is appropriate only when the exact SQL is already applied and the discrepancy is independently verified.
