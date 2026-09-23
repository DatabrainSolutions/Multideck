# Accounting party profile safeguards

## Implemented locally

- Deferred database checks require an active, unambiguous CRM profile when assigning Customer, Potential Customer, legacy Key Customer Account or Supplier roles. Existing atomic CRM creation can insert the organisation, roles and profile in any order within its transaction. No automatic company inference was introduced.
- Financial document and active provider mapping writes require a profile in the corresponding company and, where explicitly scoped, legal entity.
- Profile removal, archival and reassignment cannot orphan retained financial documents or active mappings. Customer/supplier roles also retain their profile requirement.
- Dependent writers serialise through the organisation row; failed checks roll back the transaction.
- Shared Edge Function scope validation explains missing/ambiguous profiles separately from a legal-entity mismatch and warns against creating another provider customer. Existing create/link/sync callers retain their role and scope checks.
- Provisioning baseline includes this migration. A read-only preflight inventories existing financial/profile inconsistencies.

## Verification

- Focused profile and party-sync tests: 19 passed, including a real PostgreSQL transaction fixture.
- Additional provider identity, reviewed-link and worker tests: 13 passed.
- Added and separately reran concurrent document-create/profile-delete test: passed; both transactions cannot commit an orphan.
- Full access regression: 34 passed, 2 failed. Existing accounting-party-lifecycle and webhook-receipt tests reject missing exact migration coverage in the provisioning baseline. These checks were not removed or relaxed.
- `git diff --check`: passed.
- Local port 3000 returned HTTP 200. No browser or ERPNext end-to-end success is claimed.

## Live read-only findings and release hold

Confirmed intended project from local project-ref: `aqtwypsuijxlnvtxpuxe` (MultiDeck). Ran `supabase/tests/accounting-profile-preflight.sql` against it. Demo Organisations 004, 005, 023 and 061 have financial-document or active-provider-mapping dependencies but no CRM profile. Demo 004 appears in both categories.

At the initial preflight, no tenant data, external customers or provider mappings had been modified. The new migration and Edge Function changes were not deployed at that point. Applying guards without resolving known historical inconsistencies would block further writes to those records.

The audited backfill is not part of the repository migration. Do not infer a company's ownership merely from an organisation's name, create a duplicate ERPNext account, or quietly reactivate archived profiles. A repair must verify source ownership, retain the existing organisation and provider IDs, record actor/reason/before-and-after evidence atomically, and repeat the preflight and role-aware access checks.

## 23 September dev candidate check

- Draft PR #24 targets `dev`. Its GitHub `Data access regression` job passed against PostgreSQL; the earlier local fixture run could not initialise because of host shared-memory exhaustion.
- Vercel preview deployment `9Sy62Fn5dZQAdPdvFRUfwCmQ4pKA` built successfully after adding `MULTIDECK_SURFACE=app`, `VITE_MULTIDECK_TENANT_SLUG=dev` and `VITE_SUPABASE_PROJECT_REF=aqtwypsuijxlnvtxpuxe` for `finance-dev-candidate` only. The preview login correctly says the temporary hostname is not authorised. No authenticated browser or ERPNext end-to-end result is claimed.
- A second read-only check found all four missing profiles still absent. The approved financial documents and active provider mappings identify legal entity `a8e98266-f5f4-4620-b45a-e3d991a38209` (company `a0ee9891-f144-48ff-980f-5eea3526a3fc`); the active mappings explicitly identify customer parties. The provider IDs contain demo names only, so they do not supply authoritative billing addresses.
- On 23 September, the user authorised synthetic completion of demo data. An atomic, guarded repair created active customer profiles for Demo Organisations 004, 005, 023 and 061 in verified company `a0ee9891-f144-48ff-980f-5eea3526a3fc` and legal entity `a8e98266-f5f4-4620-b45a-e3d991a38209`. Organisation 004 retained its existing DE address and gained its missing customer role/status; 005, 023 and 061 received clearly synthetic GB/Demo City billing addresses. No provider identity was changed. The repair has explicit before/after system audit events in transaction `1175976170` (event IDs: `9ee2da8f-177f-40e4-9365-453860f71eac`, `271bd437-3ece-48ef-8830-aa3d8933fd33`, `9f3e08a9-e6f4-4e97-a97f-a27c8907cf73`, `d3c62ec6-dda9-4ead-a560-5103a9b4356a`) and row audit for profile/address/master changes. The read-only accounting-profile preflight now returns zero rows.
- A broader role-only inventory found ten other demo organisations with Customer/Potential Customer/Supplier roles and no active profile. They have no finance document or active provider mapping that establishes company ownership. Their profile repair is held until an authoritative company mapping is supplied; assigning them from their demo names would risk crossing company boundaries.

## Dexter exception

These are internal integrity constraints, not a new user-facing repair capability. Existing accounting status reads and event-driven watches remain unchanged. Profile-integrity reads, approved repair actions and repair-specific watches are explicitly unsupported; the runtime prompt now explains this limitation and directs operators to administrator review. No generic data write or ownership inference is exposed to Dexter. The full access suite exercised existing Dexter actor, approval, deal-watch and address-watch boundaries; a repair lifecycle test cannot be claimed because no repair action exists.
