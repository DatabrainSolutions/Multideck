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

test("both Reporting routes resolve through the shared front-end page", () => {
  for (const route of ["/reports", "/reports/scheduled"]) {
    assert.match(app, new RegExp(`"${route.replaceAll("/", "\\/")}"`))
  }
  assert.doesNotMatch(app, /"\/reports\/exports"/u)
  assert.match(app, /<ReportsPage route=\{route\}/u)
  assert.match(reportsPage, /if \(route === "\/reports\/scheduled"\) return <ScheduledReports/u)
})

test("Reports is a direct history table with honest UI-only download states", () => {
  assert.match(reportsPage, /<ReportingPageHeader title="Reports" \/>[\s\S]*ariaLabel="Report history"/u)
  assert.doesNotMatch(reportsPage, /Front-end preview|Reporting preview status/u)
  assert.match(reportsPage, /ariaLabel="Report history"/u)
  assert.match(reportsPage, /Ready[\s\S]*Processing[\s\S]*Failed[\s\S]*Expired/u)
  assert.match(reportsPage, /Download feedback is being demonstrated only\. Nothing was generated or downloaded\./u)
  assert.doesNotMatch(reportsPage, /No file was generated or downloaded/u)
  assert.match(reportsPage, /reportUnavailableReason/u)
  assert.doesNotMatch(reportsPage, /Example history while reporting is disconnected/u)
})

test("download feedback follows the exact stable and repeat-safe sequence", () => {
  assert.match(reportsPage, /type DownloadPhase = "idle" \| "downloading" \| "downloaded"/u)
  assert.match(reportsPage, /phase === "downloading" \? "Downloading…" : phase === "downloaded" \? "Downloaded" : "Download"/u)
  assert.match(reportsPage, /phase === "downloading" \? LoaderCircle : phase === "downloaded" \? Check : Download/u)
  assert.match(reportsPage, /w-\[126px\]/u)
  assert.match(reportsPage, /if \(downloadTimers\.current\.has\(row\.id\)\) return/u)
  assert.match(reportsPage, /downloadTimers\.current\.forEach/u)
  assert.match(reportsPage, /useReducedMotion\(\)/u)
  assert.match(reportsPage, /aria-busy=\{phase === "downloading"\}/u)
  assert.match(reportsPage, /role="status" aria-live="polite"/u)
})

test("Scheduled reports lands on a table and opens the shared staged wizard", () => {
  assert.match(reportsPage, /ariaLabel="Scheduled reports"/u)
  assert.doesNotMatch(reportsPage, /Schedule history/u)
  assert.doesNotMatch(reportsPage, /Example schedules|delivery is disconnected|4 example schedules/u)
  assert.match(reportsPage, /\{scheduleHeader\}[\s\S]*ariaLabel="Scheduled reports"/u)
  assert.match(reportsPage, /Review recurring delivery plans and their next run\. Changes are not saved yet\./u)
  assert.match(reportsPage, /Recipients or audience[\s\S]*Cadence[\s\S]*Next delivery[\s\S]*Delivery time[\s\S]*Status/u)
  for (const stateCopy of ["Loading scheduled reports…", "No scheduled reports yet", "Scheduled reports unavailable"]) {
    assert.match(reportsPage, new RegExp(stateCopy))
  }
  assert.match(reportsPage, /<WizardDialog/u)
  assert.match(reportsPage, /title="Set up scheduled report"/u)
  assert.match(reportsPage, /steps=\{steps\}[\s\S]*activeStepId=\{step\}/u)
  assert.match(reportsPage, /Nothing was scheduled or sent/u)
  assert.doesNotMatch(reportsPage, /fetch\(|axios|supabase|application-data-api|listLiveReports/u)
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
