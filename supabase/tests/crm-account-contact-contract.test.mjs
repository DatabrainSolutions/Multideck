import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const customers = readFileSync(new URL("../functions/customers/index.ts", import.meta.url), "utf8")
const migration = readFileSync(new URL("../migrations/20260803224820_crm_account_contact_dexter_parity_v2.sql", import.meta.url), "utf8")
const watchFix = readFileSync(new URL("../migrations/20260803231257_crm_customer_watch_company_scope.sql", import.meta.url), "utf8")
const seed = readFileSync(new URL("../seed.sql", import.meta.url), "utf8")
const customerApi = readFileSync(new URL("../../multideck.client/src/lib/customer-api.ts", import.meta.url), "utf8")
const accountsPage = readFileSync(new URL("../../multideck.client/src/pages/crm-accounts-page.tsx", import.meta.url), "utf8")
const crmPage = readFileSync(new URL("../../multideck.client/src/pages/crm-page.tsx", import.meta.url), "utf8")
const accountDetail = readFileSync(new URL("../../multideck.client/src/pages/crm-account-detail-page.tsx", import.meta.url), "utf8")
const contactsPage = readFileSync(new URL("../../multideck.client/src/pages/crm-contacts-page.tsx", import.meta.url), "utf8")
const contactDetail = readFileSync(new URL("../../multideck.client/src/pages/crm-contact-detail-page.tsx", import.meta.url), "utf8")

test("account and contact product routes use the authenticated customer API rather than fixture arrays", () => {
  assert.match(customerApi, /edgeFetch\("customers"/)
  assert.match(accountsPage, /listCustomers\(/)
  assert.match(contactsPage, /listContacts\(/)
  assert.match(accountDetail, /getCustomer\(accountId\)/)
  assert.match(contactDetail, /getContact\(contactId\)/)
  for (const source of [accountsPage, accountDetail, contactsPage, contactDetail]) {
    assert.doesNotMatch(source, /crmContacts|crmAccountSignals|multideck-data|mock|placeholderData/)
  }
})

test("account and contact details expose real empty states and permission-scoped email history", () => {
  assert.match(customers, /permissionValues\(admin, userId\)/)
  assert.match(customers, /Email\.Read/)
  assert.match(customers, /Comm_MailboxAccess/)
  assert.match(customers, /CommMailboxAccess_CanRead/)
  assert.match(customers, /CommThread_CustomerOrgID/)
  assert.match(accountDetail, /No recent emails are linked to this account or its contacts/)
  assert.match(contactDetail, /No recent emails are linked to this contact/)
  assert.doesNotMatch(accountDetail + contactDetail, /sample email|example conversation|fake activity/i)
})

test("account summary matches the six-tile leads summary pattern", () => {
  const sharedSummaryClass = /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6/
  const sharedTileClass = /h-\[44px\] min-w-0 rounded-\[var\(--md-radius-lg\)\] px-3 py-1\.5/
  assert.match(crmPage, sharedSummaryClass)
  assert.match(accountsPage, sharedSummaryClass)
  assert.match(crmPage, sharedTileClass)
  assert.match(accountsPage, sharedTileClass)
  for (const label of ["Total accounts", "Contacts", "Needs attention", "Marketing opted in", "Unassigned", "Healthy accounts"]) {
    assert.match(accountsPage, new RegExp(`t\\(\\"${label}\\"\\)`))
  }
})

test("contact fields edit inline and consent changes require evidence", () => {
  assert.match(contactDetail, /id="contact-detail-form"/)
  assert.match(contactDetail, /form="contact-detail-form"/)
  assert.match(contactDetail, /Save changes/)
  assert.doesNotMatch(contactDetail, /Edit contact|ContactEditDialog/)
  assert.match(contactDetail, /MarketingOptInControl/)
  assert.match(contactDetail, /Reason or evidence/)
  assert.match(contactDetail, /Additional fields/)
  assert.match(customers, /Explain the source or evidence for this consent change/)
  assert.match(customers, /marketingConsentChanged/)
  assert.match(customers, /OrgContact_Emails"\)\.delete/)
  assert.match(customers, /CommIdentity_IsDeleted: true/)
})

test("account editing uses existing CRM reference data and preserves the current customer model", () => {
  assert.match(customers, /sys_CRMRelationshipStatuses/)
  assert.match(accountDetail, /getCustomerReference/)
  assert.match(accountDetail, /relationshipStatuses/)
  assert.match(accountDetail, /Account health score/)
  assert.match(accountDetail, /Churn risk score/)
  assert.match(accountDetail, /MarketingOptInControl/)
  assert.match(accountDetail, /Additional fields/)
  assert.match(customers, /CRM_AccountProfiles/)
  assert.match(customers, /CRM_CustomerEngagementPreferences/)
  assert.match(accountDetail, /CustomerWarehouseAccess customerId=\{account\.id\}/)
  assert.match(accountDetail, /min-h-14/)
})

test("Dexter read and watch parity remains allowlisted, permissioned and event driven", () => {
  assert.match(migration, /'contacts'/)
  assert.match(migration, /'customers'/)
  assert.match(migration, /Customers\.Read/)
  assert.match(migration, /AI_DexterWatchSignals/)
  assert.match(migration, /TR_CRM_AccountProfiles_crm_customer_watch/)
  assert.match(migration, /TR_CRM_ContactProfiles_crm_customer_watch/)
  assert.match(migration, /AI_DexterWatches/)
  assert.match(watchFix, /select distinct watch\."AIDexterWatch_CompanyID"/)
  assert.match(watchFix, /AIDexterWatch_IsArmed/)
  assert.doesNotMatch(watchFix, /from public\."cmp_Company".*limit 1/s)
  assert.doesNotMatch(migration, /generic.*write|execute.*sql/i)
})

test("development records are database seeds and never browser placeholders", () => {
  assert.match(seed, /CRM_AccountProfiles/)
  assert.match(seed, /CRM_ContactProfiles/)
  assert.match(seed, /CRM_CustomerEngagementPreferences/)
  assert.match(seed, /Comm_ConsentPreferences/)
  assert.match(seed, /\.example\.test/)
  assert.match(seed, /developmentFixture/)
  assert.doesNotMatch(seed, /supabase_seed_crm_email/)
})
