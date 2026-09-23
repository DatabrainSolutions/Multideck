import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../../multideck.client/src/pages/quote-response-page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('response.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'QuotePdfPreview')
let effect
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effect = node.arguments[0].getText(ast)
  ts.forEachChild(node, visit)
}
visit(component)
const code = ts.transpile(`const run = ${effect}`, { target: ts.ScriptTarget.ES2022 })

for (const scenario of ['empty', 'success', 'fetch-error']) test(`real customer PDF effect: ${scenario}`, async () => {
  const state = {}, revoked = []
  const dependencies = {
    AbortController, document: { url: 'https://example.test/quote.pdf' },
    setLoading: value => state.loading = value, setError: value => state.error = value,
    setPages: value => state.pages = value, setBlobUrl: value => state.blobUrl = value,
    fetch: async () => ({ ok: scenario !== 'fetch-error', blob: async () => new Blob(['%PDF-test']) }),
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: value => revoked.push(value) },
    renderPdfPageImages: async (_blob, options) => {
      const pages = scenario === 'success' ? [{ page: 1, url: 'blob:page' }] : []
      pages.forEach(options.onPage)
      return pages
    }, releasePdfPageImages: () => {},
  }
  const run = new Function(...Object.keys(dependencies), `${code}; return run`)(...Object.values(dependencies))
  const cleanup = run()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.loading, false)
  if (scenario === 'success') { assert.equal(state.pages.length, 1); assert.equal(state.error, '') }
  else assert.match(state.error, /could not be/)
  if (scenario === 'empty') assert.equal(state.blobUrl, 'blob:test', 'Original download remains available')
  cleanup()
  if (scenario !== 'fetch-error') assert.deepEqual(revoked, ['blob:test'])
})
