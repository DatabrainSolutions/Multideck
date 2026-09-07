import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [setupPage, documentPage, customerWizard, proforma, breadcrumbs] =
  await Promise.all([
    read("../src/pages/finance-setup-page.tsx"),
    read("../src/pages/finance-document-page.tsx"),
    read("../src/components/multideck/provider-customer-setup-wizard.tsx"),
    read("../src/lib/finance-proforma.ts"),
    read("../src/components/multideck/app-breadcrumbs.tsx"),
  ])

test("finance setup presents integrations as accounts systems", () => {
  assert.match(setupPage, /label=\{t\("Accounts system"\)\}/)
  assert.match(setupPage, /accounts system GL accounts/)
  assert.match(setupPage, /Accounts system item code/)
  assert.match(setupPage, /Accounts system tax code/)
  assert.doesNotMatch(setupPage, /label=\{t\("Provider"\)\}/)
  assert.doesNotMatch(setupPage, /Provider delivery/)
})

test("related finance surfaces use the same operator language", () => {
  assert.match(breadcrumbs, /"\/finance\/mappings": "Accounts system mappings"/)
  assert.match(customerWizard, /"Accounts system details"/)
  assert.match(documentPage, /"Accounts system"/)
  assert.match(proforma, /ledger or accounts system/)
})
