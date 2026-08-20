import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const ratesPage = await readFile(new URL("../src/pages/rates-page.tsx", import.meta.url), "utf8")
const topBar = await readFile(new URL("../src/components/multideck/top-bar.tsx", import.meta.url), "utf8")
const phrases = await readFile(new URL("../src/i18n/rates-phrases.ts", import.meta.url), "utf8")
const navigation = await readFile(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
const mentions = await readFile(new URL("../src/data/dexter-mentions.ts", import.meta.url), "utf8")
const dexterPage = await readFile(new URL("../src/pages/agent-dexter-page.tsx", import.meta.url), "utf8")

test("rates navigation resolves to cost and customer-pack workspaces", () => {
  assert.match(ratesPage, /route === "\/rates"[\s\S]*?Rate management summary/)
  assert.match(ratesPage, /Cost tariff register/)
  assert.match(ratesPage, /Customer tariff register/)
  assert.match(ratesPage, /No cost tariffs yet/)
  assert.match(ratesPage, /No customer tariffs yet/)
  assert.doesNotMatch(navigation, /Rate contracts/)
  assert.match(app, /getLegacyRatesRoute/)
  assert.match(app, /path === "\/rates\/contracts"/)
})

test("top bar creation language follows the active rates workflow", () => {
  assert.match(topBar, /"\/rates": \{ importLabel: "Import rates", createLabel: "New cost tariff" \}/)
  assert.match(topBar, /"\/rates\/tariffs": \{ createLabel: "New customer tariff" \}/)
  assert.doesNotMatch(topBar, /"\/rates\/contracts"/)
  assert.match(topBar, /ratesTopBarActions\[route\]/)
})

test("new route-specific workspace copy is registered for every app language", () => {
  for (const label of [
    "Rate management",
    "New cost tariff",
    "New customer tariff",
    "Cost tariff register",
    "Customer tariff register",
    "No cost tariffs yet",
    "No customer tariffs yet",
  ]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(phrases, new RegExp(`"${escaped}": \\{ de: .+ fr: .+ ar: .+ \\}`))
  }
})

test("Dexter can @ mention cost tariffs and customer packs", () => {
  assert.match(mentions, /DexterMentionType = [^\n]*"rate"/)
  assert.match(mentions, /export function rateMentionItems/)
  assert.match(dexterPage, /rateMentionItems/)
  assert.match(dexterPage, /getRatesPage\(\{ scope: "costs"/)
  assert.match(dexterPage, /getRatesPage\(\{ scope: "packs"/)
})
