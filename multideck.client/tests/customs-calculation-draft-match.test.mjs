import assert from "node:assert/strict"
import test from "node:test"
import { buildSync } from "esbuild"

const source = buildSync({ entryPoints: [new URL("../src/lib/customs-calculation-draft-match.ts", import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
const module = { exports: {} }
new Function("module", "exports", source)(module, module.exports)
const { calculationDraftMatches } = module.exports
const draft = { direction: "import", currency: "", totalAmount: "", invoiceHeaders: [{ id: "invoice", currency: "GBP", totalAmount: "1000" }], items: [{ id: "item", invoiceHeaderId: "invoice", itemPrice: "1000", grossMass: "10" }], dutyCalculationSetup: { jurisdiction: "GB" } }
const snapshot = { ...draft, currency: "GBP", totalAmount: "1000", exchangeRate: "", tradeTerms: "", tradeTermsLocation: "", transactionNature: "", totalGrossMass: "10", totalNetMass: "", totalPackages: "" }

test("saved invoice projection is current without mutating editor or audit evidence", () => {
  const before = JSON.stringify({ draft, snapshot })
  assert.equal(calculationDraftMatches(snapshot, draft), true)
  assert.equal(JSON.stringify({ draft, snapshot }), before)
})

test("genuine calculation input changes remain stale", () => {
  for (const edit of [
    { items: [{ ...draft.items[0], itemPrice: "1001" }] },
    { items: [{ ...draft.items[0], quotaOrderNumber: "051867" }] },
    { invoiceHeaders: [{ ...draft.invoiceHeaders[0], currency: "USD" }] },
    { dutyCalculationSetup: { jurisdiction: "NI" } },
    { importAdjustments: [{ code: "AP", amount: "500", currency: "GBP" }] },
  ]) assert.equal(calculationDraftMatches(snapshot, { ...draft, ...edit }), false)
})

test("snapshot differences are not normalised away and key order is irrelevant", () => {
  assert.equal(calculationDraftMatches({ ...snapshot, currency: "USD" }, draft), false)
  assert.equal(calculationDraftMatches(Object.fromEntries(Object.entries(snapshot).reverse()), draft), true)
})
