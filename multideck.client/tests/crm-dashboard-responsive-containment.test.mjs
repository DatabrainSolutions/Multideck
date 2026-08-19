import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const dashboardStyles = await readFile(new URL("../src/dashboard.css", import.meta.url), "utf8")

test("CRM dashboard remains bounded by the app content area", () => {
  assert.match(
    dashboardStyles,
    /\.md-crm-dashboard\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*clip;/su,
  )
  assert.match(
    dashboardStyles,
    /\.md-crm-dashboard\s+\.md-crm-lead,[\s\S]*?\.md-crm-dashboard\s+\.md-kpi-strip\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/u,
  )
})

test("CRM responsive layouts use the available dashboard container width", () => {
  assert.match(dashboardStyles, /container:\s*md-dash\s*\/\s*inline-size;/u)
  assert.match(dashboardStyles, /@container md-dash \(min-width: 560px\)/u)
  assert.match(dashboardStyles, /@container md-dash \(min-width: 1120px\)/u)
})
