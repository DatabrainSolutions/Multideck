import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url))
const dataTableSource = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")
const statusPillSource = await readFile(new URL("../src/components/multideck/status-pill.tsx", import.meta.url), "utf8")
const registerToolbarSource = await readFile(new URL("../src/components/multideck/register-toolbar.tsx", import.meta.url), "utf8")
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(path)
    return extname(entry.name) === ".tsx" ? [path] : []
  }))
  return nested.flat()
}

test("the canonical toolbar sits outside the rounded table and keeps columns last", () => {
  const toolbar = dataTableSource.indexOf("data-table-toolbar")
  const surface = dataTableSource.indexOf("data-table-surface")
  const search = dataTableSource.indexOf("{toolbarSearch ?", toolbar)
  const filters = dataTableSource.indexOf("{toolbarFilters ?", search)
  const options = dataTableSource.indexOf("{toolbarOptions ?", filters)
  const columns = dataTableSource.indexOf("<Columns3", options)

  assert.ok(toolbar >= 0 && surface > toolbar, "toolbar must be a sibling before the table surface")
  assert.match(dataTableSource.slice(toolbar, surface), /bg-transparent/u)
  assert.ok(search < filters && filters < options && options < columns, "trailing controls must end with Columns")
  assert.match(dataTableSource.slice(toolbar, columns), /data-table-trailing-controls className=\{cn\("ms-auto flex flex-none/u)
  assert.doesNotMatch(dataTableSource.slice(toolbar, columns), /sm:flex-1/u)
  assert.match(dataTableSource.slice(options, columns), /data-table-columns-control className="order-5 flex shrink-0"/u)
  assert.match(dataTableSource, /<Columns3 className="size-4"[^>]+aria-hidden="true"/u)
  assert.doesNotMatch(dataTableSource.slice(dataTableSource.lastIndexOf("<button", columns), columns), /<span>[^<]*Columns/u)
})

test("search, filters, and the Columns icon use the shared tab corner radius", () => {
  assert.match(registerToolbarSource, /registerControlClass = "[^"]*rounded-\[var\(--md-radius-lg\)\]/u)
  assert.match(dataTableSource, /toolbarSearch[^\n]+\[&_input\]:!rounded-\[var\(--md-radius-lg\)\]/u)
  assert.match(dataTableSource, /toolbarFilters[^\n]+\[&_button\]:!rounded-\[var\(--md-radius-lg\)\]/u)
  const columnsButton = dataTableSource.slice(dataTableSource.lastIndexOf("<button", dataTableSource.indexOf("<Columns3")), dataTableSource.indexOf("<Columns3"))
  assert.match(columnsButton, /rounded-\[var\(--md-radius-lg\)\]/u)
  assert.match(columnsButton, /aria-label=\{t\(columnsButtonLabel/u)
})

test("semantic pill colour is confined to the indicator", () => {
  assert.match(statusPillSource, /bg-\[var\(--md-surface\)\]/u)
  assert.match(statusPillSource, /text-\[var\(--md-ink\)\]/u)
  assert.match(statusPillSource, /shadow-\[0_0_0_1px_var\(--md-line\)\]/u)
  assert.match(statusPillSource, /backgroundColor: toneToVar\(tone\)/u)
  assert.doesNotMatch(styleSource, /\.md-email-status-pill--[^\s{]+\s*\{/u)
})

test("operator tables use DataTable instead of one-off table markup", async () => {
  const allowlisted = new Set([
    "components/multideck/data-table.tsx",
    "components/ui/table.tsx",
    "pages/agent-dexter-page.tsx",
    "pages/components-gallery-page.tsx",
  ])
  const violations = []
  const legacyLeadingSlots = []

  for (const file of await collectTsxFiles(srcRoot)) {
    const localPath = relative(srcRoot, file)
    if (allowlisted.has(localPath)) continue
    const source = await readFile(file, "utf8")
    if (/<(?:Table|table)(?:\s|>)/u.test(source)) violations.push(localPath)
    if (/toolbarLeading/u.test(source)) legacyLeadingSlots.push(localPath)
  }

  assert.deepEqual(violations, [])
  assert.deepEqual(legacyLeadingSlots, [])
  assert.doesNotMatch(dataTableSource, /toolbarLeading/u)
  assert.doesNotMatch(dataTableSource, /toolbarActions/u)
  assert.match(dataTableSource, /toolbarTabs\?: ReactNode/u)
  assert.match(dataTableSource, /data-table-tabs/u)
})
