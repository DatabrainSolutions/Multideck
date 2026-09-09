import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260818144500_crm_lead_conversion_account_bridge.sql", import.meta.url), "utf8")
const contactInputFixMigration = await readFile(new URL("../migrations/20260818150000_crm_lead_conversion_contact_input_fix.sql", import.meta.url), "utf8")

test("lead conversion creates or reuses a company-scoped prospect account", () => {
  assert.match(migration, /not public\._multideck_crm_lead_is_reachable\(p_lead_id, v_context\.company_id\)/)
  assert.match(migration, /profile\."CRMAccount_CompanyID" = v_context\.company_id/)
  assert.match(migration, /insert into public\."Org_Master"/)
  assert.match(migration, /"Org_CRMIsPotentialCustomer"/)
  assert.match(migration, /insert into public\."CRM_AccountProfiles"/)
  assert.match(migration, /"CRMAccount_CompanyID"/)
  assert.match(migration, /v_matching_account_count > 1/)
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(lower\(v_company_name\), 0\)\)/)
  assert.match(migration, /developmentFixture/)
  assert.match(migration, /Company names must be 100 characters or fewer/)
  assert.match(migration, /Lead address fields must be 50 characters or fewer/)
  assert.match(migration, /Contact names must fit within 50 characters per name/)
  assert.match(migration, /Contact emails must be 200 characters or fewer/)
  assert.match(migration, /Org_Master_Type/)
  assert.match(migration, /CRM_OrgLifecycleTags/)
})

test("lead conversion carries the native address and contact into the prospect", () => {
  for (const field of [
    "CRMLead_AddressLine1",
    "CRMLead_AddressLine2",
    "CRMLead_TownCity",
    "CRMLead_CountyState",
    "CRMLead_PostZipCode",
    "CRMLead_CountryCode",
  ]) assert.match(migration, new RegExp(`"${field}"`))

  assert.match(migration, /"OrgAdd_CountyState"/)
  assert.doesNotMatch(migration, /"OrgAdd_StateProvince"/)
  assert.match(migration, /insert into public\."Org_Contacts"/)
  assert.match(migration, /insert into public\."CRM_ContactProfiles"/)
  assert.match(migration, /"CRMContact_CompanyID"/)
  assert.match(migration, /insert into public\."OrgContact_Emails"/)
  assert.match(migration, /"CRMLead_PrimaryContactID" = coalesce\(v_contact_id/)
  assert.match(migration, /More than one contact matches this lead email/)
  assert.match(migration, /CRMContact_AccountID.*v_account_id/)
  assert.match(migration, /CRMContact_EditVersion.*CRMContact_EditVersion.*\+ 1/)
  assert.match(migration, /belongs to a different CRM account or company/)
  assert.match(migration, /not exists \(\s*select 1 from public\."Org_Addresses" address/s)
})

test("the legacy converter is private behind the guarded bridge", () => {
  assert.match(migration, /rename to _multideck_crm_convert_lead_with_org_20260818/)
  assert.match(migration, /revoke all on function public\._multideck_crm_convert_lead_with_org_20260818\(uuid, jsonb\)/)
  assert.match(migration, /return public\._multideck_crm_convert_lead_with_org_20260818\(p_lead_id, p_input\)/)
  assert.match(migration, /grant execute on function public\.multideck_crm_convert_lead\(uuid, jsonb\)[\s\S]*to authenticated/)
  assert.match(migration, /Development demo leads cannot be converted/)
  assert.match(migration, /public\."Audit_SetContext"/)
})

test("the follow-up bridge replaces only the synthetic org-free contact input", () => {
  assert.match(contactInputFixMigration, /create or replace function public\.multideck_crm_convert_lead\(\s*p_lead_id uuid,\s*p_input jsonb/s)
  assert.match(contactInputFixMigration, /security definer/)
  assert.match(contactInputFixMigration, /set search_path = pg_catalog, public, auth/)
  assert.match(contactInputFixMigration, /v_promoted_org_free boolean := false/)
  assert.match(contactInputFixMigration, /v_promoted_org_free := true/)
  assert.match(contactInputFixMigration, /if v_promoted_org_free then[\s\S]*jsonb_build_object\('primaryContactId', v_contact_id\)/)
  assert.match(contactInputFixMigration, /return public\._multideck_crm_convert_lead_with_org_20260818\(p_lead_id, v_conversion_input\)/)
  assert.match(contactInputFixMigration, /v_conversion_input jsonb := p_input/)
  assert.match(contactInputFixMigration, /revoke all on function public\.multideck_crm_convert_lead\(uuid, jsonb\)[\s\S]*from public, anon/)
  assert.match(contactInputFixMigration, /grant execute on function public\.multideck_crm_convert_lead\(uuid, jsonb\)[\s\S]*to authenticated/)
  assert.doesNotMatch(contactInputFixMigration, /if not v_promoted_org_free[\s\S]*v_conversion_input/)
})
