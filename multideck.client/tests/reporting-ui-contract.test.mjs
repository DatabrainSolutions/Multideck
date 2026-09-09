import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const navigation = await readFile(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")
const reportsPage = await readFile(new URL("../src/pages/reports-page.tsx", import.meta.url), "utf8")
const topBar = await readFile(new URL("../src/components/multideck/top-bar.tsx", import.meta.url), "utf8")
const dataTable = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")

test("Reporting replaces Insights and AI with exactly two destinations", () => {
  const reportingArea = navigation.slice(navigation.indexOf('id: "reporting"'), navigation.indexOf('id: "administration"'))

  assert.match(reportingArea, /label: "Reporting"/u)
  assert.match(reportingArea, /label: "Reports"[\s\S]*?route: "\/reports"/u)
  assert.match(reportingArea, /label: "Scheduled reports"[\s\S]*?route: "\/reports\/scheduled"/u)
  assert.equal((reportingArea.match(/route:/gu) ?? []).length, 2)
  assert.doesNotMatch(reportingArea, /Exports|\/reports\/exports/u)
  assert.doesNotMatch(navigation, /Insights & AI|AI workspace|AI Workspaces|Data quality & observability/u)
})

test("Reporting routes share the connected workspace", () => {
  assert.match(app, /<ReportsPage route=\{route\} navigate=\{navigate\}/u)
  assert.match(app, /reports[\s\S]*edit/u)
  assert.match(reportsPage, /<ReportingWorkspace route=\{route\} navigate=\{navigate\}/u)
})

test("Report workspace uses real saves, previews, schedules and snapshots", async () => {
  const workspace = await readFile(new URL("../src/components/multideck/reporting-workspace.tsx", import.meta.url), "utf8")
  const api = await readFile(new URL("../src/lib/reporting-api.ts", import.meta.url), "utf8")
  assert.match(api, /supabase\.rpc\("reporting_workspace"/u)
  assert.match(workspace, /"preview", \{ definition:/u)
  assert.match(workspace, /"save",/u)
  assert.match(workspace, /"run",/u)
  assert.match(workspace, /"schedule",/u)
  assert.match(workspace, /sequence === request.current/u)
  assert.match(workspace, /version: undefined/u)
  assert.match(workspace, /useDocumentPeriod/u)
  assert.match(workspace, /useDocumentCustomer/u)
  assert.doesNotMatch(workspace, /monthlyTemplatePages|generatedReports|reportHistory\s*=|Nothing was scheduled or sent/u)
  assert.match(api, /if \(!response.ok\)/u)
  assert.match(api, /URL\.revokeObjectURL/u)
})

test("Reporting headings stay outside the reusable table-control toolbar", () => {
  assert.doesNotMatch(dataTable, /toolbarLeading\?: ReactNode/u)
  assert.doesNotMatch(dataTable, /data-table-leading/u)
  assert.doesNotMatch(reportsPage, /toolbarLeading/u)
  assert.match(dataTable, /contentBeforeTable\?: ReactNode/u)
  assert.doesNotMatch(reportsPage, /md-page md-page-sections min-w-0/u)
})

test("contextual top-bar actions use the requested Reporting language", () => {
  assert.match(topBar, /aria-label=\{t\("Create report"\)\}[\s\S]*dispatchTopBarAction\(topBarActionEvents\.startReportDraft\)/u)
  assert.match(topBar, /aria-label=\{t\("Set up scheduled report"\)\}[\s\S]*dispatchTopBarAction\(topBarActionEvents\.startReportSchedule\)/u)
})
