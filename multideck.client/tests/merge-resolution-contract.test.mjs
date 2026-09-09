import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const require = createRequire(new URL("../package.json", import.meta.url))
const ts = require("typescript")
const read = (path) => readFileSync(join(root, path), "utf8")
const repairedSources = [
  "multideck.client/src/App.tsx",
  "multideck.client/src/pages/settings-page.tsx",
  "multideck.client/src/pages/quotes-page.tsx",
  "multideck.client/src/data/multideck-data.ts",
  "supabase/tests/crm-account-contact-contract.test.mjs",
]

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?[jt]sx?|sql)$/.test(entry.name) ? [path] : []
  })
}

test("client source and backend contracts contain no unresolved merge markers", () => {
  for (const directory of ["multideck.client/src", "multideck.client/tests", "supabase/functions", "supabase/tests"]) {
    for (const path of sourceFiles(join(root, directory))) {
      assert.doesNotMatch(readFileSync(path, "utf8"), /^(?:<{7}|={7}|>{7}|\|{7})(?: .*)?$/m, path)
    }
  }
})

test("every conflict-repaired module parses successfully", () => {
  for (const path of repairedSources) {
    const parsed = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
    assert.deepEqual(parsed.parseDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), [], path)
  }
})

test("both usage and finance retain recognised routes and their real page handlers", () => {
  const app = read("multideck.client/src/App.tsx")
  const validRoutes = app.slice(app.indexOf("const validRoutes"), app.indexOf("function isBookingDetailRoute"))
  assert.match(validRoutes, /"\/admin\/usage"/)
  assert.match(validRoutes, /"\/admin\/finance"/)
  assert.match(app, /route === "\/admin\/finance" \? <FinancePage/)
  assert.match(app, /route\.startsWith\("\/admin"\) && route !== "\/admin\/finance" \? <AdminPage/)
})

test("quote lookups retain manual overrides, provenance and the location directory", () => {
  const page = read("multideck.client/src/pages/quotes-page.tsx")
  assert.match(page, /Promise\.all\(\[loadUnlocodeDirectory\(\), loadUnlocodeDirectoryMetadata\(\)\]\)/)
  assert.match(page, /<CompactCombobox label="Account code"[^\n]+selectOrganisationByCode/)
  assert.match(page, /<CompactCombobox label="Address"[^\n]+autoPopulated=[^\n]+selectAddress\(role, option.id\)[^\n]+onValueChange=/)
  assert.match(page, /<CompactCombobox label="Operational contact"[^\n]+selectContact\("customer", option.id\)[^\n]+onQuoteChange\("contactId", ""\)/)
  assert.match(page, /const customerSourceContact = customerOrganisation\?\.contacts\?\.find\(\(contact\) => contact.isOperational\)/)
  assert.match(page, /label="Customer PO"[^\n]+onQuoteChange\("customerPO", value\)/)
})
