import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const { buildSync } = require('esbuild')
const built = buildSync({ entryPoints: [fileURLToPath(new URL('../functions/quotes-workflow/core.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs' })
const module = { exports: {} }
new Function('module', 'exports', built.outputFiles[0].text)(module, module.exports)
const { quoteWorkspaceCustomerReference } = module.exports

const version = (reference, current = true) => ({
  CusQuoteVersion_IsCurrent: current,
  CusQuoteVersion_SnapshotJSON: { quote: { customerReference: reference } },
})

test('current snapshot enquiry reference does not rename the master or select an older submitted version', () => {
  const versions = [version('OLD-ENQUIRY', false), version('QA-CUSTOMER-42')]
  const before = structuredClone(versions)
  assert.equal(quoteWorkspaceCustomerReference(versions, 'JQ20022'), 'QA-CUSTOMER-42')
  assert.equal(quoteWorkspaceCustomerReference([...versions].reverse(), 'JQ20022'), 'QA-CUSTOMER-42')
  assert.deepEqual(versions, before)
})

test('explicit blank and null stay cleared; only missing legacy evidence falls back', () => {
  for (const value of ['', null]) assert.equal(quoteWorkspaceCustomerReference([version(value)], 'JQ20022'), '')
  for (const versions of [[], [version('OLDER', false)], [{ CusQuoteVersion_IsCurrent: true, CusQuoteVersion_SnapshotJSON: { quote: {} } }]]) {
    assert.equal(quoteWorkspaceCustomerReference(versions, 'JQ20022'), 'JQ20022')
  }
  assert.equal(quoteWorkspaceCustomerReference([], null), '')
})

test('invalid saved types and ambiguous current versions fail without silently replacing customer data', () => {
  for (const value of [false, 42, {}, []]) assert.throws(() => quoteWorkspaceCustomerReference([version(value)], 'JQ20022'))
  assert.throws(() => quoteWorkspaceCustomerReference([version('ONE'), version('TWO')], 'JQ20022'))
})

test('authorised workspace binds the customer reference to its scoped versions while retaining master identity', () => {
  const source = readFileSync(new URL('../functions/quotes-workflow/index.ts', import.meta.url), 'utf8')
  assert.match(source, /customerReference: quoteWorkspaceCustomerReference\(versionResult\.data \?\? \[\], quote\.CusQuoteHeader_CustomerReference\)/)
  assert.match(source, /reference: String\(quote\.CusQuoteHeader_CustomerReference \|\| reference\)/)
  assert.match(source, /\.eq\("CusQuoteHeader_ID", quote\.CusQuoteHeader_ID\)/)
})

test('Dexter explicitly distinguishes the legacy master-reference alias from unsupported enquiry-reference actions and watches', () => {
  const source = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
  assert.match(source, /legacy quotes-domain customerReference is the master Quote reference/)
  assert.match(source, /Customer enquiry-reference reads, edits and watches are not yet exposed/)
})
