import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ratesPage = await readFile(new URL("../src/pages/rates-page.tsx", import.meta.url), "utf8")
const topBar = await readFile(new URL("../src/components/multideck/top-bar.tsx", import.meta.url), "utf8")
const phrases = await readFile(new URL("../src/i18n/rates-phrases.ts", import.meta.url), "utf8")

test("rates navigation resolves to three distinct operator workspaces", () => {
  assert.match(ratesPage, /route === "\/rates"[\s\S]*?Rate management summary/)
  assert.match(ratesPage, /route === "\/rates\/contracts"[\s\S]*?Rate contracts register/)
  assert.match(ratesPage, /Tariffs and charges[\s\S]*?Filter by tariff kind/)
  assert.match(ratesPage, /No rate contracts yet/)
  assert.match(ratesPage, /No tariffs or charges yet/)
})

test("top bar creation language follows the active rates workflow", () => {
  assert.match(topBar, /"\/rates": \{ importLabel: "Import rates", createLabel: "New rate" \}/)
  assert.match(topBar, /"\/rates\/contracts": \{ importLabel: "Import contracts", createLabel: "New contract" \}/)
  assert.match(topBar, /"\/rates\/tariffs": \{ importLabel: "Import tariffs", createLabel: "New tariff" \}/)
  assert.match(topBar, /ratesTopBarActions\[route\]/)
})

test("new route-specific workspace copy is registered for every app language", () => {
  for (const label of [
    "Rate management",
    "New contract",
    "New tariff",
    "Rate contracts register",
    "Tariffs and charges register",
    "No rate contracts yet",
    "No tariffs or charges yet",
  ]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(phrases, new RegExp(`"${escaped}": \\{ de: .+ fr: .+ ar: .+ \\}`))
  }
})
