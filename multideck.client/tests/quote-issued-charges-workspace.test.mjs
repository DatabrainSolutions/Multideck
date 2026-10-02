import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import test from "node:test"

const client = fileURLToPath(new URL("../", import.meta.url))
const require = createRequire(`${client}package.json`)
const { build } = require("esbuild")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// Exercise the production workspace and cells, replacing only the table shell
// (layout storage needs a browser) and the language provider for SSR.
const compiled = await build({
  stdin: { contents: 'export { UnifiedQuoteChargesWorkspace } from "@/components/multideck/unified-quote-charges-workspace"; export { TooltipProvider } from "@/components/ui/tooltip"', resolveDir: client },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react/jsx-runtime"], alias: { "@": `${client}src` },
  plugins: [{ name: "workspace-boundaries", setup(builder) {
    builder.onResolve({ filter: /i18n\/language-provider$/ }, () => ({ path: "language", namespace: "fixture" }))
    builder.onResolve({ filter: /multideck\/data-table$/ }, () => ({ path: "table", namespace: "fixture" }))
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "language"
      ? 'export const useLanguage=()=>({t:value=>value,language:globalThis.issuedChargeLocale||"en-GB",direction:"ltr"})'
      : `import React from 'react'; export function DataTable({columns,rows,toolbarOptions,emptyState}) {
          return React.createElement('section',null,toolbarOptions,
            rows.length ? React.createElement('table',null,React.createElement('tbody',null,
              rows.map(row=>React.createElement('tr',{key:row.id},columns.map(column=>
                React.createElement('td',{key:column.id,'data-column':column.id},column.cell(row))))))) : emptyState)
        }` }))
  } }],
})
const module = { exports: {} }
new Function("require", "module", "exports", compiled.outputFiles[0].text)(require, module, module.exports)
const { UnifiedQuoteChargesWorkspace, TooltipProvider } = module.exports
const saved = {
  id: "saved-one", code: "FRT", description: "Issued freight", cost: 100, costCurrency: "USD",
  sell: 160, sellCurrency: "USD", costRoe: 1.285879, sellRoe: 1.296071,
  costRoeSource: "rate", sellRoeSource: "rate", baseCost: 77.77, baseSell: 123.45,
  showToCustomer: false, internalNotes: "Saved internal note", customerNotes: "Saved customer note",
  calculationBasis: "fixed", quantity: 1,
}
const currencies = [
  { code: "GBP", symbol: "£", decimalPlaces: 2 },
  { code: "USD", symbol: "$", decimalPlaces: 2 },
]
function render(rows, options = {}) {
  return renderToStaticMarkup(React.createElement(TooltipProvider, null, React.createElement(UnifiedQuoteChargesWorkspace, {
    rows, onRowsChange: () => { throw new Error("Issued rows must not change") },
    savedValues: true, currencies, parties: [], baseCurrency: "GBP",
    exchangeRates: [{ currency: "USD", baseCurrency: "GBP", costRoe: 2, sellRoe: 4, status: "current" }],
    ...options,
  })))
}
const cell = (html, column) => html.match(new RegExp(`<td data-column="${column}">([\\s\\S]*?)</td>`))?.[1]

test("issued table ignores changed live rates and retains exact saved base amounts and ROEs", () => {
  const original = structuredClone(saved)
  for (const locale of ["en-GB", "en-US"]) {
    globalThis.issuedChargeLocale = locale
    const html = render([saved])
    assert.match(cell(html, "cost"), /\$100\.00/)
    assert.match(cell(html, "sell"), /\$160\.00/)
    assert.match(cell(html, "baseCost"), /£77\.77/)
    assert.match(cell(html, "baseSell"), /£123\.45/)
    assert.match(cell(html, "profit"), /£45\.68/)
    assert.match(cell(html, "costRoe"), /1\.285879/)
    assert.match(cell(html, "sellRoe"), /1\.296071/)
    assert.match(html, /Issued prices · Read-only/)
    assert.doesNotMatch(html, /Job rates current|Live rates current/)
    for (const control of html.matchAll(/<input[^>]*>/g)) assert.match(control[0], /disabled/)
    assert.match(html, /disabled=""[^>]*>[^<]*<svg[\s\S]*?Add/)
    assert.match(html, /Saved internal note/)
    assert.match(html, /Saved customer note/)
  }
  assert.deepEqual(saved, original)
})

test("missing saved values remain missing instead of reviving today's rate or fabricating zero", () => {
  const html = render([{ ...saved, cost: undefined, baseCost: undefined, baseSell: undefined, costRoe: undefined, sellRoe: undefined }])
  for (const column of ["cost", "baseCost", "baseSell", "profit", "costRoe", "sellRoe"]) {
    assert.match(cell(html, column), />–</)
    assert.doesNotMatch(cell(html, column), /0\.00|NaN|Infinity/)
  }
})

test("recorded zero amounts stay zero and an empty issued table offers no add action", () => {
  const html = render([{ ...saved, cost: 0, sell: 0, baseCost: 0, baseSell: 0 }])
  assert.match(cell(html, "cost"), /\$0\.00/)
  assert.match(cell(html, "baseCost"), /£0\.00/)
  assert.match(cell(html, "profit"), /£0\.00/)
  const empty = render([])
  assert.match(empty, /No charge lines yet/)
  assert.doesNotMatch(empty, /Add charge/)
})
