import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const accountPage = await readFile(new URL("../src/pages/crm-account-detail-page.tsx", import.meta.url), "utf8")
const operations = await readFile(new URL("../src/components/multideck/account-operations-workspace.tsx", import.meta.url), "utf8")
const customers = await readFile(new URL("../../supabase/functions/customers/index.ts", import.meta.url), "utf8")

test("the signed-in user's permissions reach the account financial workspace", () => {
  assert.match(app, /<CrmAccountDetailPage[^>]*currentUser=\{currentUser\}/)
  assert.match(accountPage, /Finance\.Configuration\.Manage/)
  assert.match(accountPage, /Finance\.Banks\.Manage/)
})

test("restricted financial controls are visibly read-only", () => {
  assert.match(operations, /Financial terms and accounting settings are read-only/)
  assert.match(operations, /Bank details are read-only/)
  assert.match(operations, /<fieldset disabled=\{readOnly\}/)
  assert.match(operations, /activeTab === "financial" && !canManageFinancial/)
})

test("the server remains the authority for finance and bank changes", () => {
  assert.match(customers, /!permissions\.includes\("Finance\.Configuration\.Manage"\)/)
  assert.match(customers, /!permissions\.includes\("Finance\.Banks\.Manage"\)/)
  assert.match(customers, /p_actor_user_id: current\.User_ID/)
})
