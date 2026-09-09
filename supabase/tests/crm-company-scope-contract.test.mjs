import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260818115500_crm_account_contact_company_scope.sql", import.meta.url), "utf8")
const customers = readFileSync(new URL("../functions/customers/index.ts", import.meta.url), "utf8")
const boundedReads = readFileSync(new URL("../migrations/20260818156000_crm_customer_detail_bounded_reads.sql", import.meta.url), "utf8")

test("account and contact profiles carry an immutable operator-company scope", () => {
  assert.match(migration, /CRMAccount_CompanyID/)
  assert.match(migration, /CRMContact_CompanyID/)
  assert.match(migration, /TR_CRM_AccountProfiles_company_scope/)
  assert.match(migration, /TR_CRM_ContactProfiles_company_scope/)
  assert.match(migration, /alter column "CRMAccount_CompanyID" set not null/)
  assert.match(migration, /alter column "CRMContact_CompanyID" set not null/)
  assert.match(migration, /old\."CRMAccount_CompanyID" is not null[\s\S]*new\."CRMAccount_CompanyID" := old\."CRMAccount_CompanyID"/)
  assert.match(migration, /old\."CRMContact_CompanyID" is not null[\s\S]*new\."CRMContact_CompanyID" := old\."CRMContact_CompanyID"/)
})

test("company scope does not follow deactivated users or operational carriers", () => {
  assert.match(migration, /create or replace function public\.app_current_company_id/)
  assert.match(migration, /User_AccessStatus", 'active'\) = 'active'/)
  assert.doesNotMatch(migration, /select job\."Job_Carrier"/)
  assert.doesNotMatch(migration, /p_account_id in \(job\."Job_Customer", job\."Job_Carrier"\)/)
  const accessHelper = migration.slice(migration.indexOf("create or replace function public.multideck_crm_company_can_access_account"), migration.indexOf("create or replace function public.multideck_crm_accessible_account_ids"))
  assert.doesNotMatch(accessHelper, /CRMAccount_CompanyID" is null/)
})

test("service-role account and contact reads start from company-accessible IDs", () => {
  assert.match(migration, /multideck_crm_accessible_account_ids\(p_company_id uuid\)/)
  assert.match(customers, /admin\.rpc\("multideck_crm_accessible_account_ids", \{ p_company_id: companyId \}\)/)
  assert.match(customers, /async function customerRows\(admin: any, companyId: string/)
  assert.match(customers, /async function contactRows\(admin: any, companyId: string/)
  assert.match(customers, /\.in\("Org_id", scopedIds\)/)
  assert.match(customers, /\.in\("Org_ID", accessibleIds\)/)
  assert.match(customers, /current\.Company_ID, current\.User_ID, permissions/)
  assert.doesNotMatch(customers, /contactRows\(admin, new URL/)
  assert.doesNotMatch(customers, /customerRows\(admin, new URL/)
  assert.match(migration, /CRMAccount_MetadataJSON" ->> 'developmentFixture'/)
  assert.match(migration, /Codex Account Verification %/)
  assert.match(migration, /automated_qa/)
})

test("transactional writes fail closed when the actor cannot access the account", () => {
  assert.match(migration, /_multideck_crm_require_account_access/)
  for (const fn of ["multideck_crm_update_account", "multideck_crm_update_contact", "multideck_crm_create_contact"]) {
    const start = migration.lastIndexOf(`create function public.${fn}`)
    assert.ok(start >= 0, `${fn} wrapper is present`)
    assert.match(migration.slice(start, start + 1300), /_multideck_crm_require_account_access/)
  }
  assert.match(migration, /revoke all on function public\._multideck_crm_update_account_unscoped_20260818[\s\S]*service_role/)
  assert.match(migration, /grant execute on function public\.multideck_crm_update_account[\s\S]*service_role/)
})

test("Dexter reads and watches retain the same company boundary", () => {
  assert.match(migration, /multideck_dexter_domain_customers[\s\S]*multideck_crm_company_can_access_account/)
  assert.match(migration, /multideck_dexter_domain_contacts[\s\S]*multideck_crm_company_can_access_account/)
  assert.match(migration, /watch\."AIDexterWatch_CompanyID" = v_company/)
  assert.match(migration, /drop trigger if exists "TR_Org_Master_crm_customer_watch"/)
  assert.match(migration, /drop trigger if exists "TR_Org_Contacts_crm_customer_watch"/)
  assert.match(migration, /tg_table_name = 'Org_Master'/)
  assert.match(migration, /tg_table_name = 'Org_Contacts'/)
  assert.match(migration, /create trigger "TR_Org_Master_crm_customer_watch"/)
  assert.match(migration, /create trigger "TR_Org_Contacts_crm_customer_watch"/)
  assert.match(migration, /CRMContact_MetadataJSON" ->> 'developmentFixture'/)
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public._multideck_crm_customer_watch_signal")), /select distinct watch\."AIDexterWatch_CompanyID"/)
})

test("contact email history does not union unrelated account threads", () => {
  assert.match(customers, /includeAccountThreads = true/)
  assert.match(boundedReads, /p_include_account_threads[\s\S]*Comm_Threads/)
  assert.match(customers, /summary\.email \? \[summary\.email\] : \[\], false/)
})
