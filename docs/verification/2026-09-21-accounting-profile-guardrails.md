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

No tenant data, external customers or provider mappings were modified. The new migration and Edge Function changes are NOT deployed. Do not deploy until the complete access regression passes and these legacy records have been reviewed and repaired through a separately audited operation. Applying guards without resolving known historical inconsistencies would intentionally block further writes to those records.

The audited backfill is not implemented in this change. Do not infer a company's ownership merely from an organisation's name, create a duplicate ERPNext account, or quietly reactivate archived profiles. A repair must verify source ownership, retain the existing organisation and provider IDs, record actor/reason/before-and-after evidence atomically, and repeat the preflight and role-aware access checks.

## 23 September dev candidate check

- Draft PR #24 targets `dev`. Its GitHub `Data access regression` job passed against PostgreSQL; the earlier local fixture run could not initialise because of host shared-memory exhaustion.
- Vercel preview deployment `9Sy62Fn5dZQAdPdvFRUfwCmQ4pKA` built successfully after adding `MULTIDECK_SURFACE=app`, `VITE_MULTIDECK_TENANT_SLUG=dev` and `VITE_SUPABASE_PROJECT_REF=aqtwypsuijxlnvtxpuxe` for `finance-dev-candidate` only. The preview login correctly says the temporary hostname is not authorised. No authenticated browser or ERPNext end-to-end result is claimed.
- A second read-only check found all four missing profiles still absent. The approved financial documents and active provider mappings identify legal entity `a8e98266-f5f4-4620-b45a-e3d991a38209` (company `a0ee9891-f144-48ff-980f-5eea3526a3fc`); the active mappings explicitly identify customer parties. The provider IDs contain demo names only, so they do not supply authoritative billing addresses.
- Demo Organisation 004 has one active, populated address but no customer role or CRM relationship status. Organisations 005, 023 and 061 have customer roles and no address rows. The live deferred accounting-address constraint rejects creation of their customer profiles until a real address with line 1, town/city and valid country is recorded. Verify those details with an authoritative source and repair the records together with an atomic audit trail before applying the profile guard migration or merging this PR.

## Dexter exception

These are internal integrity constraints, not a new user-facing repair capability. Existing accounting status reads and event-driven watches remain unchanged. Profile-integrity reads, approved repair actions and repair-specific watches are explicitly unsupported; the runtime prompt now explains this limitation and directs operators to administrator review. No generic data write or ownership inference is exposed to Dexter. The full access suite exercised existing Dexter actor, approval, deal-watch and address-watch boundaries; a repair lifecycle test cannot be claimed because no repair action exists.
