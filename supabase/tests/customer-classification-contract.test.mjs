import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const roles = read("multideck.client/src/lib/organisation-roles.ts")
const accountDetail = read("multideck.client/src/pages/crm-account-detail-page.tsx")
const accounts = read("multideck.client/src/pages/crm-accounts-page.tsx")
const quotes = read("multideck.client/src/pages/quotes-page.tsx")
const bookings = read("multideck.client/src/components/multideck/booking-components.tsx")
const customers = read("supabase/functions/customers/index.ts")
const migration = read("supabase/migrations/20260910085553_enforce_exclusive_customer_classification.sql")
const requiredTypeMigration = read("supabase/migrations/20260910094423_require_at_least_one_company_type.sql")

test("customer classification is Potential Customer or Customer while operational roles remain multi-select", () => {
  for (const classification of ["Potential Customer", "Customer"]) {
    assert.match(roles, new RegExp(`"${classification}"`, "u"))
  }
  assert.doesNotMatch(roles.match(/customerClassificationNames = \[[\s\S]*?\]/u)?.[0] ?? "", /Key Customer Account/u)
  assert.match(accountDetail, /customerClassificationTypes\.map[\s\S]*<DropdownMenuCheckboxItem/u)
  assert.doesNotMatch(accountDetail, /No customer classification/u)
  assert.match(accountDetail, /clearCustomerClassification\(currentTypeIds, reference\.organisationTypes\)/u)
  assert.match(accountDetail, /if \(!companyTypeIdsDraftRef\.current\.length\)[\s\S]*Choose at least one company type\./u)
  assert.match(accountDetail, /if \(!open\) validateAndFlushCompanyTypes\(\)/u)
  assert.doesNotMatch(accountDetail, /const companyTypesBatchDelayMs/u)
  assert.match(accountDetail, /operationalRoleTypes\.map[\s\S]*<DropdownMenuCheckboxItem/u)
  assert.match(accountDetail, /selectCustomerClassification\(currentTypeIds, type\.id, reference\.organisationTypes\)/u)
  assert.match(accountDetail, /companyTypeIdsDraftRef\.current = null[\s\S]*setCompanyTypeIdsDraft\(null\)[\s\S]*\}, \[accountId\]\)/u)
  assert.match(accounts, /newlySelectedCustomerType[\s\S]*selectCustomerClassification\(nextTypeIds, newlySelectedCustomerType\.id/u)
  assert.match(accounts, /Choose one customer classification, then add every other role this company has\./u)
})

test("every customer classification is eligible wherever a customer or payer is selected", () => {
  assert.match(roles, /export function organisationIsCustomer/u)
  assert.match(quotes, /role === "customer" \|\| role === "payer"\) return organisationIsCustomer\(types\)/u)
  assert.match(bookings, /role === "customer" \|\| role === "payer"\) return organisationIsCustomer\(types\)/u)
})

test("the customer API and database reject multiple classifications and retire the old Key Customer role", () => {
  assert.match(customers, /customerClassificationCount > 1/u)
  assert.match(customers, /Choose either Potential Customer or Customer\./u)
  assert.match(customers, /Key Account is managed within Customer settings\./u)
  assert.doesNotMatch(customers, /validateOrganisationTypeIds\(admin, payload\.orgTypeIds, true\)/u)
  assert.match(migration, /create trigger enforce_customer_classification/u)
  assert.match(migration, /for update;/u)
  assert.match(migration, /customer_classification_rank > 1/u)
  assert.match(migration, /retired role by converting it to Customer \+ Key Account/u)
  assert.match(migration, /clear_key_account_without_customer/u)
  assert.match(requiredTypeMigration, /create constraint trigger require_company_type_for_organisation/u)
  assert.match(requiredTypeMigration, /create constraint trigger retain_company_type_for_organisation/u)
  assert.match(requiredTypeMigration, /deferrable initially deferred/u)
  assert.match(requiredTypeMigration, /Choose at least one company type\./u)
})

test("customer settings hold Key Account controls and potential settings hold lead qualification", () => {
  const operations = read("multideck.client/src/components/multideck/account-operations-workspace.tsx")
  for (const field of ["leadSource", "qualificationStage", "serviceInterest", "estimatedAnnualValue", "nextReviewDate", "qualificationNotes"]) {
    assert.match(operations, new RegExp(`"${field}"`, "u"))
  }
  for (const field of ["accountManagerName", "accountManagerEmail", "serviceReviewCadence", "escalationProcess"]) {
    assert.match(operations, new RegExp(`"${field}"`, "u"))
  }
  assert.match(operations, /Key Accounts require named account management/u)
  assert.match(operations, /\{keyAccount \? \([\s\S]*keyAccountRequirementFields\.map/u)
  assert.match(customers, /multideck_crm_replace_account_operations_with_customer_settings/u)
  assert.match(migration, /Only a Customer can be marked as a Key Account\./u)
})
