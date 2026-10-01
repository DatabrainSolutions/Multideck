import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { webcrypto } from 'node:crypto'
import vm from 'node:vm'

const root = new URL('../../', import.meta.url).pathname
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const token = 'a'.repeat(32)

function runtime(entry, { code = 'HBL', changedVersion = false, changedJob = false, denied = false, staleApproval = false } = {}) {
  const calls = [], provider = [], cache = new Map()
  let handler
  const air = ['MAWB', 'MNG_AWB', 'HAWB'].includes(code)
  const source = { jobId: id(2), companyId: id(3), reviewToken: token,
    job: { bookingReference: 'DEMO-001' }, company: { name: 'Old tenant name' },
    shipper: { name: 'Demo exporter', address: '1 Demo Street' }, consignee: { name: 'Demo importer', address: '2 Demo Street' },
    routing: [{ id: id(4), mode: air ? 'air' : 'sea', isMainCarriage: true, origin: { name: 'Demo origin', unlocode: air ? 'GBLHR' : 'GBFXT', iataCode: air ? 'LHR' : null }, destination: { name: 'Demo destination', unlocode: air ? 'USJFK' : 'NLRTM', iataCode: air ? 'JFK' : null }, houseTransportReference: air ? 'DEMO-HAWB' : 'DEMO-HBL', vessel: air ? '' : 'Demo vessel', voyageNumber: air ? '' : 'DEMO-01' }],
    cargo: [{ id: id(5), lineNumber: 1, description: 'Demo goods', packageQuantity: '40', grossWeight: '400', packageType: 'Cartons' }], equipment: [], allocations: [] }
  const hashes = { HBL: '439f0208bc97e1ba8ab35a763d6608a810afd17ef514fa8b45f18040a287fc47', HAWB: '892df6229274a0f5674a8d9c7baeec3370d24000159dcbacf385fefdd094ea50',
    MAWB: '01c023ed81c54b982cb02f439e3549a0844a731abbe01bcdb1fb0e1b1538cc32', MNG_AWB: 'bc11f94686b5c8ee17678d4f6388ca95dd3b5a2588adb3c7d412f98bfacbda2f',
    JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859: '7e4ca3982f46813c4965596d74aa8dd0cc3c6077a7cd1b472f81b5d2b7e09319', FIATA_BOL_REFERENCE: '262d720e5ebfa367febcfd515f6381e53093c03239d838f1a042302c31689309' }
  const hash = hashes[code]
  const admin = {
    schema() { return { rpc: async (name, args) => {
      calls.push({ name, args })
      if (denied) return { error: { code: '42501' } }
      if (name === 'authorize_studio_template_save') return { data: { templateCode: code } }
      if (name === 'approve_reviewed_template_version') return staleApproval ? { error: { code: '40001' } } : { data: { status: 'published' } }
      if (name === 'transport_document_source') return { data: { ...source, reviewToken: changedJob ? 'b'.repeat(32) : token } }
      if (name === 'booking_document_issue_options') return { data: { protocolVersion: 1 } }
      if (name === 'prepare_job_render') return { data: { renderJobId: id(6), templateVersionId: id(7), templateCode: code, carboneTemplateReference: 'demo-version', outputFormat: 'pdf', languageCode: 'en-GB', jobId: id(2), companyId: id(3), jobReference: 'DEMO-001', dataset: {} } }
      if (name === 'freeze_transport_document_draft') return { data: args.mapped_dataset }
      if (name === 'complete_job_render') return { data: { ready: true } }
      return { data: {} }
    } } },
    from(table) {
      const result = table === 'Job_Header' ? { data: { Job_LegalEntityNameSnapshot: 'Demo issuer' } }
        : table === 'cmp_CompanySettings' ? { data: null }
        : table === 'DOCB_TemplateVersions' ? { data: { DOCBTV_VersionNo: changedVersion ? 2 : 1, DOCBTV_TemplateSnapshotJSON: { source: { sha256: hash } } } }
        : { data: null }
      const query = { select() { return this }, eq() { return this }, order() { return this }, in() { return this }, limit() { return this }, single: async () => result, maybeSingle: async () => result, then: (yes, no) => Promise.resolve(result).then(yes, no) }
      return query
    },
    storage: { from() { return { upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'https://example.invalid/demo.pdf' } }), remove: async () => ({ error: null }) } } },
  }
  const env = { CARBONE_URL: 'https://example.invalid', CARBONE_API_TOKEN: 'fictional-provider-key', MULTIDECK_ENVIRONMENT: 'test' }
  const globals = { Response, Request, Headers, Blob, DOMException, TextDecoder, TextEncoder, Uint8Array, DataView, URL, AbortController, AbortSignal, setTimeout, clearTimeout, structuredClone, btoa, atob, crypto: webcrypto,
    console: { error() {} }, Deno: { env: { get: key => env[key] }, serve: callback => { handler = callback } },
    fetch: async (_url, options) => { provider.push(JSON.parse(options.body)); return new Response('%PDF-fictional document', { headers: { 'Content-Type': 'application/pdf' } }) } }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8'))
    const module = { exports: {} }; cache.set(file, module)
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    vm.runInNewContext(compiled, { ...globals, module, exports: module.exports, require: name => name.startsWith('npm:fflate') ? require('fflate') : name.startsWith('npm:@supabase') ? { createClient() {} } : load(resolve(dirname(file), name)) }, { filename: file })
    if (file.endsWith('/document-functions.ts')) module.exports.authenticateRequest = async request => {
      if (!request.headers.has('Authorization')) throw new module.exports.FunctionError(401, 'Authentication required.', 'Test missing token')
      return { admin, userId: id(1) }
    }
    return module.exports
  }
  load(resolve(root, `supabase/functions/${entry}/index.ts`))
  return { calls, provider, load, invoke: body => handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer fictional', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })) }
}
const render = code => ({ templateCode: code, targetType: 'Job_Header', jobNumber: 'DEMO-001', outputFormat: 'pdf', contentSections: ['job', 'cargo', 'routing'], documentIssueStatus: 'draft', transportReviewToken: token, confirmTransportReview: true, expectedTemplateVersion: 1 })

test('reconciled renderer freezes reviewed house and FIATA Draft data before storage/cataloguing', async () => {
  for (const code of ['HBL', 'HAWB', 'FIATA_BOL_REFERENCE', 'JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859', 'MAWB', 'MNG_AWB']) {
    const run = runtime('render-document', { code })
    const response = await run.invoke(render(code))
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal(run.provider.length, 1)
    const frozen = run.calls.find(call => call.name === 'freeze_transport_document_draft')
    assert.equal(frozen.args.mapped_dataset.issuer.name, 'Demo issuer')
    assert.equal(frozen.args.mapped_dataset.documentIssue.isLegalOriginal, false)
    assert.ok(run.provider[0].convertTo.formatOptions.Watermarks.some(mark => mark.text === 'DRAFT'))
    assert.ok(run.calls.find(call => call.name === 'complete_job_render'))
  }
})

test('changed templates, changed Booking, permissions, Originals and received confirmations fail closed', async () => {
  for (const [options, body, expected] of [
    [{ changedVersion: true }, render('HBL'), 409], [{ changedJob: true }, render('HBL'), 409],
    [{ denied: true }, render('HBL'), 403], [{}, { ...render('HBL'), documentIssueStatus: 'original' }, 400],
    [{}, render('JOB_CONFIRMATION'), 409],
  ]) {
    const run = runtime('render-document', options)
    assert.equal((await run.invoke(body)).status, expected)
    assert.equal(run.provider.length, 0)
    assert.ok(!run.calls.some(call => call.name === 'complete_job_render'))
  }
})

test('preview source privacy applies to Booking and house templates before provider calls', async () => {
  for (const code of ['HBL', 'HAWB', 'JOB_CONFIRMATION']) {
    const run = runtime('document-studio', { code })
    const response = await run.invoke({ action: 'preview-draft', multideckTemplateId: id(8), templateBase64: btoa('PK unreviewed customer source'), templateFileName: 'template.docx', sampleData: { customer: 'REAL CUSTOMER' } })
    assert.equal(response.status, 400)
    assert.match(await response.text(), /privacy/)
    assert.equal(run.provider.length, 0)
  }
})

test('publication requires the reviewed identity and delegates stale-source rejection to locked RPC', async () => {
  const body = { action: 'approve', multideckTemplateId: id(8), reviewedVersion: 3, reviewedSourceSha256: 'c'.repeat(64) }
  const run = runtime('document-studio', { code: 'OTHER' })
  assert.equal((await run.invoke({ action: 'approve', multideckTemplateId: id(8) })).status, 400)
  assert.equal((await run.invoke(body)).status, 200)
  const approval = run.calls.find(call => call.name === 'approve_reviewed_template_version')
  assert.equal(approval.args.reviewed_version_no, 3)
  assert.equal(approval.args.reviewed_source_sha256, body.reviewedSourceSha256)
  assert.equal((await runtime('document-studio', { code: 'OTHER', staleApproval: true }).invoke(body)).status, 409)
})

test('reviewed default sources validate and only fictional examples reach the preview provider', async () => {
  for (const code of ['HBL', 'HAWB']) {
    const run = runtime('document-studio', { code })
    const { transportDefaultTemplates } = run.load(resolve(root, 'supabase/functions/_shared/transport-default-templates.ts'))
    const response = await run.invoke({ action: 'preview-draft', multideckTemplateId: id(8), templateBase64: transportDefaultTemplates[code], templateFileName: 'template.docx', sampleData: { customer: 'PRIVATE CUSTOMER' } })
    assert.equal(response.status, 200, await response.clone().text())
    assert.doesNotMatch(JSON.stringify(run.provider[0].data), /PRIVATE CUSTOMER/)
    assert.equal(run.provider[0].data.issuer.name, 'Demo Forwarder Limited')
  }
})
