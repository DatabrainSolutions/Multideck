import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const page = await readFile(new URL("../src/pages/finance-document-page.tsx", import.meta.url), "utf8")
const wizard = await readFile(new URL("../src/components/multideck/provider-customer-setup-wizard.tsx", import.meta.url), "utf8")

test("blocked mirror recovery stays in the document workspace", () => {
  assert.match(page, /setMirrorSetupOpen\(true\)/)
  assert.match(page, /ProviderCustomerSetupWizard/)
  assert.match(wizard, /Multideck · Bill to/)
  assert.match(wizard, /Accounts System · AR account/)
  assert.match(wizard, /Create new account/)
})

test("posted billing-party changes explain reversal and replacement", () => {
  assert.match(page, /Change billing party/)
  assert.match(page, /Reverse & repost/)
  assert.match(page, /correctFinanceDocumentBillingParty/)
  assert.match(page, /allocated cash cannot be corrected/)
})
