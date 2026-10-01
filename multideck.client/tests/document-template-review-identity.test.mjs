import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const page = readFileSync(new URL('../src/pages/documents-page.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/lib/document-builder-api.ts', import.meta.url), 'utf8')
function compile(source, globals) {
  const context = vm.createContext(globals)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context
}
const hash = 'c'.repeat(64)

test('actual publication request carries reviewed source version and hash; absent identity fails before a request', async () => {
  const start = api.indexOf('export async function approveDocumentStudioTemplate(')
  const end = api.indexOf('export async function getGeneratedDocumentDownload', start)
  const calls = []
  const run = compile(api.slice(start, end).replace('export ', ''), {
    requireDocumentClient() {}, getSupabaseSession: async () => ({ access_token: 'fictional' }),
    supabaseFunctionsUrl: 'https://example.invalid/functions/v1', supabasePublicApiKey: 'fictional',
    fetch: async (_url, request) => { calls.push(JSON.parse(request.body)); return { ok: true, json: async () => ({ status: 'published' }) } },
  })
  await run.approveDocumentStudioTemplate('demo-template', 3, hash)
  assert.equal(calls[0].reviewedVersion, 3)
  assert.equal(calls[0].reviewedSourceSha256, hash)
  await assert.rejects(run.approveDocumentStudioTemplate('demo-template'), /Preview the latest/)
  assert.equal(calls.length, 1)
})

test('manager approval uses the exact completed preview and rejects another source or template', async () => {
  const start = page.indexOf('  async function approveTemplate()')
  const end = page.indexOf('  const selectedModuleName', start)
  for (const change of [{}, { base64: 'different-source' }, { templateId: 'different-template' }, { version: 4 }, { sha256: 'd'.repeat(64) }]) {
    const calls = [], errors = []
    const run = compile(page.slice(start, end), {
      selectedTemplate: { id: 'demo-template' }, draftReviewed: true,
      savedTemplate: { status: 'draft', multideckVersion: 3, sourceSha256: hash }, studioTemplateBase64: 'reviewed-source',
      reviewedSource: { templateId: 'demo-template', version: 3, sha256: hash, base64: 'reviewed-source', ...change },
      setApprovingTemplate() {}, setStudioError: value => errors.push(value),
      approveDocumentStudioTemplate: async (...args) => calls.push(args), onRendered: async () => {},
      setSavedTemplate() {}, setDraftReviewed() {}, clearStudio() {}, setSourceReloadKey() {}, toast: { success() {} }, t: value => value,
    })
    await run.approveTemplate()
    assert.equal(calls.length, Object.keys(change).length ? 0 : 1)
    if (calls.length) assert.deepEqual(Array.from(calls[0]), ['demo-template', 3, hash])
    else assert.ok(errors.some(error => error?.includes('Preview the latest')))
  }
})

test('a late template preview cannot grant publishing approval after the source changes', async () => {
  const start = page.indexOf('  async function previewDraft()')
  const end = page.indexOf('  async function approveTemplate()', start)
  const requestRef = { current: 1 }, identities = [], urls = [], busy = []
  let complete
  const run = compile(page.slice(start, end), {
    selectedTemplate: { id: 'demo-template' }, studioTemplateBase64: 'reviewed-source', sourcePreviewSafe: true,
    savedTemplate: { multideckTemplateId: 'demo-template', multideckVersion: 3, sourceSha256: hash },
    previewRequestRef: requestRef, draftSampleJson: '{}', studioTemplateFileName: 'template.docx',
    setDraftPreviewUrl: value => urls.push(value), setDraftPreviewBusy: value => busy.push(value), setStudioError() {}, setDraftReviewed() {},
    setReviewedSource: value => identities.push(value), t: value => value,
    previewDraftDocumentStudioTemplate: () => new Promise(resolve => { complete = resolve }),
    URL: { createObjectURL: () => 'blob:fictional' },
  })
  const pending = run.previewDraft()
  requestRef.current++ // Selecting/reloading a source invalidates the in-flight request.
  complete({})
  await pending
  assert.ok(identities.every(value => value === null))
  assert.ok(urls.every(value => value === null))
  assert.deepEqual(busy, [true]) // A late callback must not clear a newer request's busy state.
})
