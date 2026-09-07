import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [navigation, financeSetup, financePage, app, sidebar] = await Promise.all([
  read("../src/data/navigation-data.ts"),
  read("../src/pages/finance-setup-page.tsx"),
  read("../src/pages/finance-page.tsx"),
  read("../src/App.tsx"),
  read("../src/components/multideck/app-sidebar.tsx"),
])

test("bank account maintenance lives under Finance cash and banking", () => {
  assert.match(
    navigation,
    /id: "finance-cash-banking"[\s\S]*label: "Bank accounts"[\s\S]*route: "\/finance\/banks"/,
  )
  assert.match(financePage, /"\/finance\/banks": "banks"/)
  assert.match(app, /"\/finance\/banks"/)
  assert.doesNotMatch(
    sidebar,
    /item\.route === "\/finance\/administration"[\s\S]{0,220}\|banks\|/,
  )
})

test("finance administration does not expose bank settings as an admin tab", () => {
  const tabs = financeSetup.match(/const tabs = \[([\s\S]*?)\n  \]\n\n  if \(loading\)/)?.[1] ?? ""
  assert.doesNotMatch(tabs, /id: "banks"/)
  assert.match(financeSetup, /bankAccountsSurface \? "Bank accounts" : "Finance administration"/)
  assert.match(financeSetup, /!bankAccountsSurface \? \(\s*<TabsRail/)
})
