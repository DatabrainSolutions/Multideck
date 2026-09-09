import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildCsv,
  discoverCsvRecordFields,
  sanitiseCsvFileName,
} from "../src/lib/csv-export.ts"

const dataTableSource = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")
const exportDialogSource = await readFile(new URL("../src/components/multideck/table-csv-export-dialog.tsx", import.meta.url), "utf8")
const customsSource = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
const crmSource = await readFile(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const accountsSource = await readFile(new URL("../src/pages/crm-accounts-page.tsx", import.meta.url), "utf8")
const contactsSource = await readFile(new URL("../src/pages/crm-contacts-page.tsx", import.meta.url), "utf8")
const galleryDataSource = await readFile(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")

test("discovers nested record fields and reads arrays of related records", () => {
  const source = {
    row: { id: "lead-1" },
    record: {
      companyName: "North Star",
      address: { townCity: "Leeds", postZipCode: "LS1" },
      contacts: [
        { name: "Amina", email: "amina@example.com" },
        { name: "Jon", email: "jon@example.com" },
      ],
    },
  }
  const fields = discoverCsvRecordFields([source], { recordCategory: "Lead details" })

  assert.equal(fields.find((field) => field.id === "record:companyName")?.category, "Lead details")
  assert.equal(fields.find((field) => field.id === "record:address.townCity")?.category, "Address")
  assert.equal(fields.find((field) => field.id === "record:contacts.email")?.category, "Contacts")
  assert.deepEqual(fields.find((field) => field.id === "record:contacts.email")?.getValue(source), ["amina@example.com", "jon@example.com"])
})

test("builds Excel-safe UTF-8 CSV with quoted cells and category headers", () => {
  const source = { row: { id: "1" }, record: { subject: "=2+2", balance: -25, contacts: [{ email: "one@example.com" }, { email: "two@example.com" }] } }
  const fields = discoverCsvRecordFields([source], { recordCategory: "Broadcast details" })
    .filter((field) => ["record:subject", "record:balance", "record:contacts.email"].includes(field.id))
  const csv = buildCsv([source], fields)

  assert.ok(csv.startsWith("\uFEFF"))
  assert.match(csv, /"Broadcast details \/ Subject"/u)
  assert.match(csv, /"Contacts \/ Email"/u)
  assert.match(csv, /"'=2\+2"/u)
  assert.match(csv, /"-25"/u)
  assert.doesNotMatch(csv, /"'-25"/u)
  assert.match(csv, /"one@example\.com \| two@example\.com"/u)
  assert.equal(sanitiseCsvFileName(" CRM leads / August.csv "), "CRM-leads-August.csv")
})

test("the canonical table owns aligned selection actions, sticky checkboxes, CSV export, and confirmed bulk deletion", () => {
  assert.match(dataTableSource, /enableSelectionExport = true/u)
  assert.match(dataTableSource, /onContextMenu=\{\(event\) =>/u)
  assert.match(dataTableSource, /data-table-selection-column/u)
  assert.match(dataTableSource, /position: "sticky"/u)
  assert.match(dataTableSource, /<HugeiconsIcon icon=\{Csv02Icon\}/u)
  assert.match(dataTableSource, /className="order-0 flex h-8 items-center/u)
  assert.match(dataTableSource, /className="grid size-7 place-items-center/u)
  assert.match(dataTableSource, /size=\{15\}/u)
  assert.match(dataTableSource, /bulkDelete\?: DataTableBulkDeleteConfig<Row>/u)
  assert.match(dataTableSource, /aria-label=\{t\(selectedRowsCanDelete \? "Delete selected rows"/u)
  assert.match(dataTableSource, /<Dialog open=\{bulkDeleteOpen\}/u)
  assert.match(dataTableSource, /await bulkDelete\.onConfirm\(selectedRows\)/u)
  assert.match(dataTableSource, /shiftKey && event\.key === "F10"/u)
  assert.match(dataTableSource, /<TableCsvExportDialog/u)
  const rowMenu = dataTableSource.slice(dataTableSource.indexOf("{rowContextMenu ? ("), dataTableSource.indexOf("<TableCsvExportDialog"))
  assert.doesNotMatch(rowMenu, /Quick row actions/u)
  assert.match(rowMenu, /scale: \[0\.9, 1\.014, 1\]/u)
  assert.match(exportDialogSource, /border-s border-\[var\(--md-line-strong\)\]/u)
  assert.match(exportDialogSource, /useState<Set<string>>\(new Set\(\)\)/u)
  assert.match(exportDialogSource, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/u)
  assert.match(exportDialogSource, /data-table-export-scroll-area className="min-h-0 overflow-y-auto overscroll-contain/u)
  assert.match(exportDialogSource, /Download CSV/u)
})

test("full-detail loaders cover CRM and sectioned Customs exports", () => {
  assert.match(crmSource, /selectedLeads\.map\(\(lead\) => getLead\(lead\.id\)\)/u)
  assert.match(accountsSource, /selectedAccounts\.map\(\(account\) => getCustomer\(account\.id\)\)/u)
  assert.match(contactsSource, /selectedContacts\.map\(\(contact\) => getContact\(contact\.id\)\)/u)
  assert.match(customsSource, /categoryForPath: customsExportCategory/u)
  assert.match(customsSource, /loadStandaloneDeclarationDraft\(draft\.id, kind, jobRelated \? "job-related" : "standalone"\)/u)
  assert.match(customsSource, /rowContextActions=\{\(draft\) =>/u)
  assert.match(customsSource, /bulkDelete=\{\{/u)
  assert.match(customsSource, /for \(const selectedDraft of selectedDrafts\)[\s\S]*?await deleteICustomsProviderDraft\(selectedDraft\.id\)[\s\S]*?deletedDrafts\.push\(selectedDraft\)/u)
})

test("the components source of truth documents selection and full-record export", () => {
  const entry = galleryDataSource.slice(galleryDataSource.indexOf('id: "data-table"'), galleryDataSource.indexOf('id: "unified-quote-charges-workspace"'))
  assert.match(entry, /right-click row selection/u)
  assert.match(entry, /exportConfig\.loadRecords/u)
  assert.match(entry, /Customs declarations/u)
  assert.match(entry, /Broadcast history/u)
})
