import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../functions/customers/index.ts", import.meta.url), "utf8")
const migration = readFileSync(new URL("../migrations/20260819132000_crm_contact_counts_read.sql", import.meta.url), "utf8")
const detailPage = readFileSync(new URL("../../multideck.client/src/pages/customer-detail-page.tsx", import.meta.url), "utf8")

test("account hydration aggregates contact totals without loading contact IDs", () => {
  assert.match(source, /rpc\("multideck_crm_contact_counts", \{ p_account_ids: ids \}\)/)
  assert.doesNotMatch(source, /from\("Org_Contacts"\)\.select\("OrgContact_ID,Org_ID"\)\.in\("Org_ID", ids\)/)
  assert.match(source, /contactCountsResult[\s\S]*item\.account_id[\s\S]*item\.contact_count/)
})

test("account detail hydrates only a bounded contact sample for recent email context", () => {
  assert.match(source, /contactRows\(admin, companyId, null, id, null, false, undefined, userId, 20\)/)
  assert.match(source, /if \(maxRows\) query = query\.limit\(Math\.max\(1, Math\.min\(maxRows, 50\)\)\)/)
  assert.match(source, /contactIds = contactList\.map/)
})

test("the count helper is indexed and service-role-only", () => {
  assert.match(migration, /IX_Org_Contacts_AccountCount/)
  assert.match(migration, /group by contact\."Org_ID"/)
  assert.match(migration, /revoke all on function public\.multideck_crm_contact_counts[\s\S]*authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_crm_contact_counts[\s\S]*service_role/)
})

test("customer detail contact UI pages the bounded contact register", () => {
  assert.match(detailPage, /listContactsPage\(\{[\s\S]*accountId: customerId[\s\S]*limit: 20[\s\S]*offset: \(contactPage - 1\) \* 20/)
  assert.match(detailPage, /<Pagination page=\{contactPage\}[\s\S]*totalItems=\{contactListing\.total\}/)
  assert.doesNotMatch(detailPage, /customer\.contacts\.map/)
})
