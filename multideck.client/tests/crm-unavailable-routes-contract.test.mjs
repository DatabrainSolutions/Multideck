import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const breadcrumbs = await readFile(new URL("../src/components/multideck/app-breadcrumbs.tsx", import.meta.url), "utf8")
const componentData = await readFile(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")
const crmPage = await readFile(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const settingsPage = await readFile(new URL("../src/pages/settings-page.tsx", import.meta.url), "utf8")

test("prototype-only CRM routes resolve to the working CRM overview", () => {
  for (const route of ["/crm/activity", "/crm/emails", "/crm/forms", "/crm/lists"]) {
    assert.match(app, new RegExp(`"${route.replaceAll("/", "\\/")}"`))
  }

  assert.match(app, /function getUnavailableCrmRoute\(path: string\)/)
  assert.match(app, /path === prefix \|\| path\.startsWith\(`\$\{prefix\}\/`\)/)
  assert.match(app, /const unavailableCrmRoute = getUnavailableCrmRoute\(window\.location\.pathname\)/)
  assert.match(app, /path = getUnavailableCrmRoute\(path\) \?\? path/)
})

test("prototype-only CRM page components are not mounted by the application router", () => {
  for (const page of [
    "CrmActivityPage",
    "CrmEmailsPage",
    "CrmEmailStatsPage",
    "CrmEmailEditPage",
    "CrmFormsPage",
    "CrmListsPage",
    "CrmListDetailPage",
  ]) {
    assert.doesNotMatch(app, new RegExp(`const ${page} = lazy`))
    assert.doesNotMatch(app, new RegExp(`<${page}[ >]`))
  }
})

test("working screens do not advertise prototype-only CRM destinations", () => {
  for (const route of ["/crm/activity", "/crm/emails", "/crm/forms", "/crm/lists"]) {
    assert.doesNotMatch(breadcrumbs, new RegExp(`"${route.replaceAll("/", "\\/")}`))
    assert.doesNotMatch(componentData, new RegExp(`route: "${route.replaceAll("/", "\\/")}`))
    assert.doesNotMatch(settingsPage, new RegExp(`route: "${route.replaceAll("/", "\\/")}`))
  }

  assert.doesNotMatch(crmPage, /onOpen=\{\(\) => \{ window\.location\.href = "\/crm\/activity" \}\}/)
})
