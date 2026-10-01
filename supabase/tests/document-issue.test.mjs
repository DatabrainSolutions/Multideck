import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../functions/_shared/document-issue.ts', import.meta.url), 'utf8')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module, exports: module.exports })
const { resolveDocumentIssue, documentIssueConversion } = module.exports

test('Document issue choices are strict and never enable cosmetic legal originals', () => {
  assert.equal(resolveDocumentIssue('JOB_CONFIRMATION', undefined), 'draft')
  assert.equal(resolveDocumentIssue('JOB_CONFIRMATION_LAYOUT_2', 'final'), 'final')
  assert.equal(resolveDocumentIssue('MAWB', 'draft'), 'draft')
  assert.equal(resolveDocumentIssue('OTHER_WORKFLOW', undefined), null)
  for (const code of ['JOB_CONFIRMATION', 'MAWB', 'FIATA_BOL_REFERENCE']) {
    for (const status of ['original', 'copy', null, 1, {}, ['draft']]) assert.throws(() => resolveDocumentIssue(code, status))
  }
  assert.throws(() => resolveDocumentIssue('MAWB', 'final'))
  assert.throws(() => resolveDocumentIssue('OTHER_WORKFLOW', 'draft'))
})

test('Draft marking covers all pages; Final remains distinct and editable Word output is disallowed', () => {
  const draft = documentIssueConversion('pdf', 'draft')
  assert.equal(draft.formatName, 'pdf')
  assert.equal(draft.formatOptions.Watermarks[0].text, 'DRAFT')
  assert.equal(draft.formatOptions.Watermarks[1].text, 'DRAFT - FOR REVIEW ONLY')
  for (const mark of draft.formatOptions.Watermarks) {
    assert.equal(mark.fromPage, undefined)
    assert.equal(mark.toPage, undefined)
  }
  assert.equal(documentIssueConversion('pdf', 'final').formatOptions.Watermarks[0].text, 'FINAL')
  assert.equal(documentIssueConversion('docx', null), 'docx')
  assert.throws(() => documentIssueConversion('docx', 'draft'))
})
