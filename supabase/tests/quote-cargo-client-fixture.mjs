import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { transformSync } = require('esbuild')
const ts = require('typescript')
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function evaluate(source, bindings = {}) {
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' })
  const module = { exports: {} }
  new Function('module', 'exports', ...Object.keys(bindings), code)(module, module.exports, ...Object.values(bindings))
  return module.exports
}
export const cargo = evaluate(read('../../multideck.client/src/lib/quote-cargo.ts'))
export const documentCargo = evaluate(read('../functions/_shared/quote-document-cargo.ts'))
const freight = evaluate(read('../../multideck.client/src/lib/freight-direction.ts'))
const source = read('../../multideck.client/src/pages/quotes-page.tsx')
const ast = ts.createSourceFile('quotes-page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
// Execute complete production mapping functions, without loading the page's
// React tree or replacing any cargo/direction/date transformation with a mock.
const names = ['newQuoteDraft', 'quoteUuidPattern', 'millisecondsPerCalendarDay', 'uuidOrNull',
  'quoteContainerRequests', 'quoteRoutingLegs', 'compactQuoteFacts', 'quoteDirectionForSave',
  'calculatedDirectionForQuote', 'quoteSavePayload', 'quoteRecordFromWorkspace',
  'quoteLifecyclePresentation', 'quoteTransitDays', 'quoteDateInputValue', 'getDateInputValue', 'salesRepresentativeValue']
const statements = names.map(name => {
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement)
    ? statement.name?.text === name
    : ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(ast) === name))
  assert.ok(node, `Production mapping ${name} must exist`)
  return node.getText(ast)
})
export const mapping = evaluate(`${statements.join('\n')}\nexport { newQuoteDraft, quoteSavePayload, quoteRecordFromWorkspace, salesRepresentativeValue };`, { ...cargo, ...freight, salesRepresentativeOptions: ['AM1 - Maya Stone'] })
let openingExpression
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'openedQuote') openingExpression = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(openingExpression?.includes('openQuoteWorkflow'))
export const openOnce = new Function('openingQuoteRef', 'openQuoteWorkflow', `return (async () => ${openingExpression})()`)
export const workspace = facts => ({ quote: { reference: 'Q-CARGO', lifecycle: 'draft', shipmentFacts: facts, currency: 'GBP' }, totals: { marginPct: null, profit: 0, cost: 0, sell: 0 } })
export function fixtureLines() {
  return [
    { ...cargo.newQuoteCargoLine(), description: 'Machinery\nKeep upright', commodity: 'Machine parts', packageQuantity: '2', packageType: 'Crates', grossWeightKg: '100.10', netWeightKg: '90.005', volumeCbm: '0.000001', length: '120', width: '80', height: '90', hsCode: '847990', countryOfOrigin: 'GB' },
    { ...cargo.newQuoteCargoLine(), description: 'Spare parts', commodity: 'Machine parts', packageQuantity: '3', packageType: 'Cartons', grossWeightKg: '0.20', volumeCbm: '0.000002', isHazardous: true, isTemperatureControlled: true },
  ]
}
