import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../functions/customers/index.ts", import.meta.url), "utf8")

test("exact account and contact reads do not materialise the tenant account allowlist", () => {
  assert.match(source, /admin\.rpc\("_multideck_crm_require_account_access"/)
  assert.match(source, /accountId && actorUserId \? \[\] : scopedIdsOverride \?\? await accessibleAccountIds/)
  assert.match(source, /contactId && actorUserId[\s\S]*\.eq\("OrgContact_ID", contactId\)[\s\S]*\.limit\(1\)/)
  assert.match(source, /exactAccountId && actorUserId[\s\S]*requireExactAccountAccess/)
  assert.match(source, /accountDetail[\s\S]*customerRows\(admin, companyId, null, id, true, undefined, userId\)/)
  assert.match(source, /contactDetail[\s\S]*contactRows\(admin, companyId, null, null, id, true, undefined, userId, 1\)/)
})

test("legacy unbounded account and contact registers fail closed", () => {
  assert.match(source, /Contact lists require bounded paging/)
  assert.match(source, /Account lists require bounded paging/)
  assert.doesNotMatch(source, /return json\(request, await contactRows\(admin, current\.Company_ID, params\.get\("search"\)\)\)/)
  assert.doesNotMatch(source, /return json\(request, await customerRows\(admin, current\.Company_ID, params\.get\("search"\)\)\)/)
})
