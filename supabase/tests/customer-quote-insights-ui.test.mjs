import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { transformSync } = require('esbuild')
const ts = require('typescript')
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function compile(source, bindings = {}) {
  const module = { exports: {} }
  const { code } = transformSync(source, { loader: 'tsx', jsx: 'automatic', format: 'cjs' })
  new Function('require', 'module', 'exports', ...Object.keys(bindings), code)(require, module, module.exports, ...Object.values(bindings))
  return module.exports
}
const { translateText } = compile(read('../../multideck.client/src/i18n/translate.ts'))
const { buildQuoteIntelligence } = compile(read('../functions/quote-intelligence/core.ts'))
const { intelligenceFromRealtimeRow } = compile(read('../../multideck.client/src/lib/quote-intelligence-snapshot.ts'))
const source = read('../../multideck.client/src/pages/quotes-page.tsx')
const ast = ts.createSourceFile('quotes-page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['ClientPricingIntelligence','quoteIntelligenceReason','quoteIntelligenceCohortLabel','money','moneyWhole']
const selected = names.map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join('\n')
let language = 'en-GB'
const children = ({ children }) => React.createElement(React.Fragment, null, children)
const empty = () => null
// Render the production card logic. These narrow visual primitives do not
// claim browser coverage of popover interaction, focus or responsive layout.
const { ClientPricingIntelligence } = compile(`${selected}\nexport {ClientPricingIntelligence}`, {
  useLanguage: () => ({ language, t: text => translateText(text, language) }),
  DotGridLoader: empty, SpectralBloomShader: empty, Info: empty, Gauge: empty, BrainCircuit: empty, ChartAnalysis: empty,
  Popover: children, PopoverTrigger: children, PopoverContent: children, cn: (...values) => values.join(' '),
})
const now = new Date('2026-09-29T12:00:00Z')
const quote = (id, values = {}) => ({ id, customerId:'customer-a',reference:id,lifecycle:'draft',jobId:null,currency:'GBP',
  origin:'GBFXT',destination:'NLRTM',mode:'sea',shipmentType:'FCL',createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z',
  cost:100,sell:125,profit:25,marginPct:20,fxComplete:true,pricingContext:'recorded-service-cargo',activityCodes:[], ...values })
function snapshot(rows, target = quote('target')) {
  const deterministic = buildQuoteIntelligence({ target, quotes:rows, jobs:[], rates:[] }, { input:'input',evidence:'evidence' }, now)
  return intelligenceFromRealtimeRow({ CusQuoteIntelligence_DeterministicJSON:deterministic, CusQuoteIntelligence_CalculatedAt:now.toISOString() })
}
const render = props => renderToStaticMarkup(React.createElement(ClientPricingIntelligence, props))
for (const variant of ['en-GB','en-US']) {
  test(`${variant}: unsupported, loading and failed figures say No data`, () => {
    language = variant
    const sparse = snapshot([quote('pending', { jobId:'existing-booking' })], quote('target', { lifecycle:'accepted',fxComplete:false }))
    for (const props of [{ intelligence:sparse },{ intelligence:null },{ intelligence:null,unavailable:true }]) {
      const html = render(props)
      assert.equal((html.match(/>No data</g) || []).length, 6)
      assert.doesNotMatch(html, />\d+%</)
      assert.doesNotMatch(html, /AI win likelihood/)
    }
    assert.match(render({ intelligence:sparse }), /Verify the quote currency conversion/)
  })
  test(`${variant}: supported customer history renders its actual observed figures`, () => {
    language = variant
    const ready = snapshot(Array.from({length:10}, (_, i) => quote(`history-${i}`, { lifecycle:i<6?'accepted':'declined' })))
    const html = render({ intelligence:ready })
    assert.doesNotMatch(html, />No data</)
    assert.match(html, />60%</)
    assert.match(html, /6 won \/ 4 lost \/ 0 pending/)
    assert.match(html, /Customer win baseline/)
    assert.match(html, /£125\.00/)
  })
}
