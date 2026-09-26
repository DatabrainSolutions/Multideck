import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../functions/bookings-workflow/core.ts', import.meta.url), 'utf8')
const context = vm.createContext({ exports: {}, TextEncoder })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
const { parseProvisionalAction, parseAction } = context.exports
test('opening mode rejects malformed values and preserves legacy omission', () => {
  assert.equal(context.exports.parseOpeningMode(undefined), null)
  assert.equal(context.exports.parseOpeningMode(' SEA '), 'sea')
  for (const mode of [null, '', ' ', {}, 1, '../mode']) assert.throws(() => context.exports.parseOpeningMode(mode))
})
test('mode options are read under verified identity without accepting a browser actor', async () => {
  const f = routeFixture()
  assert.equal((await f.send({ action: 'opening-options', caller_auth_user_id: 'spoof' })).status, 200)
  assert.equal(f.calls[0].name, 'booking_workflow_open_options')
  assert.equal(f.calls[0].args.caller_auth_user_id, 'verified-token-user')
})
test('creation sends mode and direction to the atomic RPC under the authenticated actor', async () => {
  const f = routeFixture()
  const body = { action: 'open', mode: 'air', direction: 'export', idempotencyKey: request.jobId, caller_auth_user_id: 'spoof' }
  assert.equal((await f.send(body)).status, 200)
  assert.equal(f.calls[0].name, 'booking_workflow_open_with_mode')
  assert.equal(f.calls[0].args.requested_mode, 'air')
  assert.equal(f.calls[0].args.requested_direction, 'export')
  assert.equal(f.calls[0].args.caller_auth_user_id, 'verified-token-user')
  assert.equal((await f.send({ ...body, action: 'open-road' })).status, 400)
  assert.equal(f.calls.length, 1)
  assert.equal((await f.send({ ...body, mode: undefined })).status, 200)
  assert.equal(f.calls[1].name, 'booking_workflow_open')
})
test('owner display uses persisted identity and never the current viewer', () => {
  const ownerSource = readFileSync(new URL('../../multideck.client/src/lib/booking-owner.ts', import.meta.url), 'utf8')
  const ownerContext = vm.createContext({ exports: {} })
  vm.runInContext(ts.transpileModule(ownerSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, ownerContext)
  const owner = ownerContext.exports.bookingOwnerLabel
  assert.equal(owner({ booking: {} }), 'Unassigned')
  assert.equal(owner({ booking: { editableDetails: { ownerName: 'Legacy owner' } } }), 'Legacy owner')
  assert.equal(owner({ booking: { operationsOwner: 'Owner A', editableDetails: { ownerName: 'Old owner' } } }), 'Owner A')
  assert.equal(owner({ booking: { operationsOwner: 'Old owner' }, ownership: { owner: 'Owner B' } }), 'Owner B')
})
test('ownership request excludes caller identity and preserves timestamp precision', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const body = { jobId: id, officeId: id, ownerId: id, expectedUpdatedAt: '2026-09-19T18:00:00.123456+00:00', caller_auth_user_id: 'spoof' }
  assert.equal(parseAction('save-ownership'), 'save-ownership')
  assert.equal(context.exports.parseOwnershipSave(body).expected_updated_at, body.expectedUpdatedAt)
  assert.equal('caller_auth_user_id' in context.exports.parseOwnershipSave(body), false)
  for (const patch of [{ ownerId: '' }, { officeId: 'other' }, { expectedUpdatedAt: null }]) assert.throws(() => context.exports.parseOwnershipSave({ ...body, ...patch }))
})
const request = { jobId: '11111111-1111-4111-8111-111111111111', operation: 'cancel', reason: ' Customer postponed ', expectedUpdatedAt: '2026-09-11T14:00:00.123456+00:00', chargeDecision: 'keep' }
test('retained originals use exact declaration links and private stored-object scope', async () => {
  const original = { CUSTD_id: request.jobId, CUSTD_CustomsID: request.jobId, CUSTD_DocumentCode: 'commercial_invoice_original', CUSTD_DocumentPayloadJSON: { storedObjectId: request.jobId, fileName: 'original.xlsx' } }
  const call = { action: 'declaration-attachment-access', declarationId: request.jobId, documentId: request.jobId }
  const f = routeFixture({ linkedIds: [], originalLinks: [original] })
  assert.equal((await f.send(call)).status, 200)
  for (const [column,value] of [['DOCStoredObject_AggregateType','customs_declaration'],['DOCStoredObject_ConcernCode','customs'],['CUSTD_CustomsID',request.jobId],['DOCStoredObject_StatusCode','active']])
    assert.ok(f.calls.some(c=>c.name==='filter' && c.column===column && c.value===value))
  for (const options of [{declarationAllowed:false},{originalMissing:true},{storedMissing:true},{declarationMissing:true}]) {
    const denied=routeFixture({linkedIds:[],originalLinks:[original],...options})
    assert.equal((await denied.send(call)).status,404)
    assert.equal(denied.calls.some(c=>c.name==='sign'),false)
  }
  const standalone=routeFixture({linkedIds:[],originalLinks:[original],originalJobId:null})
  const list=await standalone.send({action:'declaration-attachments',declarationId:request.jobId})
  assert.equal((await list.json()).documents[0].typeCode,'commercial_invoice_original')
  assert.equal((await standalone.send(call)).status,200)
  const mismatched=routeFixture({originalLinks:[original],originalJobId:'another-job',documents:[{id:request.jobId,category:'customs',typeCode:'commercial_invoice_original',isCurrent:false}]})
  assert.equal((await mismatched.send({action:'attachment-access',reference:'JD1',documentId:request.jobId})).status,404)
  assert.equal(mismatched.calls.some(c=>c.name==='sign'),false)
})
test('explicit request keeps timestamp precision and excludes caller identity', () => {
  assert.equal(parseAction('provisional-action'), 'provisional-action')
  const result = parseProvisionalAction({ ...request, caller_auth_user_id: 'spoof', planningChargeCount: 0 })
  assert.equal(result.requested_reason, 'Customer postponed')
  assert.equal(result.expected_updated_at, request.expectedUpdatedAt)
  assert.equal('caller_auth_user_id' in result, false)
  assert.equal('planningChargeCount' in result, false)
})
test('invalid operation, reason, revision, job and decision are rejected', () => {
  for (const patch of [{ operation: 'delete' }, { reason: ' ' }, { reason: 'x'.repeat(2001) }, { expectedUpdatedAt: null }, { expectedUpdatedAt: 'yesterday' }, { jobId: '../booking' }, { chargeDecision: 'delete' }, { operation: 'reopen' }]) assert.throws(() => parseProvisionalAction({ ...request, ...patch }))
  assert.equal(parseProvisionalAction({ ...request, operation: 'reopen', chargeDecision: undefined }).charge_decision, null)
})

function routeFixture({ authorised = true, missingCapability = false, cancelled = false, planningError = null, documents = [], workspaceError = null, signingError = false, attachmentMissing = false, storedMissing = false, declarationAllowed = true, declarationMissing = false, linkedIds = [request.jobId], originalLinks = [], originalMissing = false, originalJobId = request.jobId } = {}) {
  const calls = []
  let handler
  const entry = readFileSync(new URL('../functions/bookings-workflow/index.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('index.ts', entry, ts.ScriptTarget.Latest, true)
  const withoutImports = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n')
  const admin = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === 'customs_declaration_authorised') return { data: declarationAllowed }
    if (name === 'resolve_workspace_reference_alias') return { data: { canonicalReference: 'JD1' } }
    if (name === 'booking_workflow_workspace') return workspaceError ? { error: workspaceError } : { data: { booking: { jobId: request.jobId }, documents } }
    if (name === 'booking_provisional_state') return missingCapability ? { error: { code: 'PGRST202' } } : { data: { supported: true, cancelled } }
    if (name === 'booking_planning_charge_workspace' || name === 'booking_planning_charges_save') return planningError ? { error: planningError } : { data: { supported: true, editable: true, chargeSet: { job_id: args.requested_job_id, revision: 1, base_currency: 'GBP', rows: args.requested_rows ?? [] } } }
    return { data: { jobId: request.jobId, status: 'cancelled' } }
  }, from: table => {
    calls.push({ name: 'stored-read', table })
    const query = { select: () => query, eq: (column, value) => { calls.push({ name: 'filter', column, value }); return query },
      in: (column, value) => { calls.push({ name: 'filter', column, value }); return query },
      then: resolve => resolve({ data: table === 'Customs_Documents' ? [...originalLinks, ...linkedIds.map(id => ({ CUSTD_JobDocumentID: id }))] : documents }),
      is: (column, value) => { calls.push({ name: 'filter', column, value }); return query }, single: async () => ({ data: table === 'Customs_Documents' ? originalMissing ? null : originalLinks[0] : table === 'Customs_Declarations' ? declarationMissing ? null : { CUST_JobID: originalJobId } : table === 'Job_Documents'
        ? attachmentMissing ? null : { JobDoc_StoredObjectID: request.jobId, JobDoc_DocTypeCodeSnapshot: 'commercial_invoice' }
        : storedMissing ? null : { DOCStoredObject_Container: 'private-test', DOCStoredObject_BlobName: 'server-path.pdf', DOCStoredObject_OriginalFileName: 'Quote.pdf', DOCStoredObject_MimeType: 'application/pdf' } }) }
    return query
  }, storage: { from: bucket => ({ createSignedUrl: async (path, seconds) => {
    calls.push({ name: 'sign', bucket, path, seconds })
    return signingError ? { error: new Error('storage') } : { data: { signedUrl: 'https://storage.example.test/private-link' } }
  } }) } }
  const sandbox = vm.createContext({ ...context.exports, Request, Response, File, crypto: globalThis.crypto,
    console: { error() {} }, Deno: { serve: fn => { handler = fn } },
    authenticateRequest: async () => { if (!authorised) throw new context.exports.BookingWorkflowError(401, 'Authentication required'); return { admin, userId: 'verified-token-user' } },
    signedUrlLifetimeSeconds: 300,
    corsHeaders: () => ({}), jsonResponse: (_request, body, status = 200) => new Response(JSON.stringify(body), { status }),
  })
  vm.runInContext(ts.transpileModule(withoutImports, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox)
  return { calls, upload: form => handler(new Request('http://local.test', { method: 'POST', body: form })), send: body => handler(new Request('http://local.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })) }
}
test('Booking PDF access signs only an active document returned by the authorised workspace', async () => {
  const documentId='11111111-1111-4111-8111-111111111111', quoteId='22222222-2222-4222-8222-222222222222'
  const document={id:documentId,category:'quote',status:'active',sourceRecordId:quoteId,metadata:{quoteVersionId:request.jobId}}
  const body={action:'quote-document-access',reference:'JD1',documentId,caller_auth_user_id:'spoof',path:'attacker-path'}
  const good=routeFixture({documents:[document]})
  assert.equal((await good.send(body)).status,200)
  assert.equal(good.calls.find(c=>c.name==='booking_workflow_workspace').args.caller_auth_user_id,'verified-token-user')
  assert.deepEqual(good.calls.find(c=>c.name==='sign'),{name:'sign',bucket:'private-test',path:'server-path.pdf',seconds:300})
  assert.ok(good.calls.some(c=>c.column==='DOCStoredObject_AggregateID' && c.value===quoteId))
  for(const options of [{authorised:false},{documents:[]},{documents:[{...document,status:'deleted'}]},
    {documents:[{...document,category:'job'}]},{documents:[{...document,id:quoteId}]},
    {workspaceError:{code:'42501',message:'Denied'}}]) {
    const denied=routeFixture(options)
    assert.ok((await denied.send(body)).status>=400)
    assert.equal(denied.calls.some(c=>c.name==='stored-read'||c.name==='sign'),false)
  }
  assert.equal((await routeFixture({documents:[document],signingError:true}).send(body)).status,503)
})
test('Booking attachment access binds workspace, child row and private stored object before signing', async () => {
  const document = { id: request.jobId, category: 'customs', isCurrent: true }
  const body = { action: 'attachment-access', reference: 'JD1', documentId: request.jobId, path: 'attacker', bucket: 'public', caller_auth_user_id: 'spoof' }
  const good = routeFixture({ documents: [document] })
  assert.equal((await good.send(body)).status, 200)
  assert.deepEqual(good.calls.find(c => c.name === 'sign'), { name: 'sign', bucket: 'multideck-documents', path: 'server-path.pdf', seconds: 300 })
  for (const [column, value] of [['JobDoc_JobID', request.jobId], ['JobDoc_IsDeleted', false], ['JobDoc_IsCurrentVersion', true],
    ['DOCStoredObject_AggregateID', request.jobId], ['DOCStoredObject_AggregateType', 'job'], ['DOCStoredObject_ConcernCode', 'booking'],
    ['DOCStoredObject_StatusCode', 'active'], ['DOCStoredObject_DeletedAt', null]]) {
    assert.ok(good.calls.some(c => c.column === column && c.value === value), column)
  }
  assert.equal(good.calls.find(c => c.name === 'booking_workflow_workspace').args.caller_auth_user_id, 'verified-token-user')
  for (const options of [{ authorised: false }, { workspaceError: { code: '42501', message: 'Denied' } }, { documents: [] },
    { documents: [{ ...document, category: 'quote' }] }, { documents: [{ ...document, isCurrent: false }] },
    { documents: [document], attachmentMissing: true }, { documents: [document], storedMissing: true }]) {
    const denied = routeFixture(options)
    assert.ok((await denied.send(body)).status >= 400)
    assert.equal(denied.calls.some(c => c.name === 'sign'), false)
  }
  assert.equal((await routeFixture({ documents: [document], signingError: true }).send(body)).status, 503)
})
test('cancelled Booking upload is denied before reserving or writing storage', async () => {
  const f = routeFixture({ cancelled: true })
  const form = new FormData()
  form.set('action', 'upload-document')
  form.set('jobId', request.jobId)
  form.set('documentType', 'commercial_invoice')
  form.set('file', new File(['test'], 'test.pdf', { type: 'application/pdf' }))
  const response = await f.upload(form)
  assert.equal(response.status, 409)
  assert.deepEqual(f.calls.map(call => call.name), ['booking_provisional_state'])
  assert.equal(f.calls[0].args.caller_auth_user_id, 'verified-token-user')
})

test('declaration source access authorises the declaration and exact linked version before signing', async () => {
  const body = { action: 'declaration-attachment-access', declarationId: request.jobId, documentId: request.jobId, caller_auth_user_id: 'spoof', path: 'attacker', bucket: 'public' }
  const good = routeFixture()
  assert.equal((await good.send(body)).status, 200)
  assert.deepEqual({ ...good.calls.find(c => c.name === 'customs_declaration_authorised').args }, { caller_auth_user_id: 'verified-token-user', requested_declaration_id: request.jobId, require_write: false, require_draft: false })
  assert.deepEqual(good.calls.find(c => c.name === 'sign'), { name: 'sign', bucket: 'multideck-documents', path: 'server-path.pdf', seconds: 300 })
  for (const column of ['CUSTD_CustomsID', 'JobDoc_JobID', 'JobDoc_IsDeleted', 'DOCStoredObject_AggregateID', 'DOCStoredObject_AggregateType', 'DOCStoredObject_ConcernCode', 'DOCStoredObject_Container', 'DOCStoredObject_StatusCode', 'DOCStoredObject_DeletedAt']) assert.ok(good.calls.some(c => c.column === column), column)
  assert.equal(good.calls.some(c => c.column === 'JobDoc_IsCurrentVersion'), false, 'Retain the exact handed-over version')
  for (const options of [{ authorised: false }, { declarationAllowed: false }, { declarationMissing: true }, { linkedIds: [] }, { attachmentMissing: true }, { storedMissing: true }]) {
    const f = routeFixture(options)
    assert.ok((await f.send(body)).status >= 400)
    assert.equal(f.calls.some(c => c.name === 'sign'), false)
    if (options.declarationAllowed === false || options.authorised === false) assert.equal(f.calls.some(c => c.name === 'stored-read'), false)
  }
  assert.equal((await routeFixture({ signingError: true }).send(body)).status, 503)
})

test('source document list is metadata only and scoped to linked Booking documents', async () => {
  const f = routeFixture({ documents: [{ JobDoc_ID: request.jobId, JobDoc_FileName: 'Invoice.pdf', JobDoc_DocTypeCodeSnapshot: 'commercial_invoice', JobDoc_VersionNo: 1, JobDoc_StoredObjectID: request.jobId }] })
  const response = await f.send({ action: 'declaration-attachments', declarationId: request.jobId })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { documents: [{ id: request.jobId, fileName: 'Invoice.pdf', typeCode: 'commercial_invoice', version: 1, available: true }] })
  assert.equal(f.calls.some(c => c.name === 'sign'), false)
  assert.ok(f.calls.some(c => c.column === 'JobDoc_JobID' && c.value === request.jobId))
  const empty = await routeFixture({ linkedIds: [] }).send({ action: 'declaration-attachments', declarationId: request.jobId })
  assert.deepEqual(await empty.json(), { documents: [] })
})
test('actual Edge handler uses only the authenticated actor and the explicit RPC', async () => {
  const f = routeFixture()
  const response = await f.send({ ...request, action: 'provisional-action', caller_auth_user_id: 'spoofed' })
  assert.equal(response.status, 200)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].name, 'booking_provisional_action')
  assert.equal(f.calls[0].args.caller_auth_user_id, 'verified-token-user')
})

test('ownership and ordinary saves use editor identity, never owner or supplied actor', async () => {
  const f = routeFixture()
  const response = await f.send({ action: 'save-ownership', jobId: request.jobId, officeId: request.jobId, ownerId: request.jobId, expectedUpdatedAt: request.expectedUpdatedAt, caller_auth_user_id: 'spoof' })
  assert.equal(response.status, 200)
  assert.equal(f.calls[0].name, 'booking_ownership_save')
  assert.equal(f.calls[0].args.caller_auth_user_id, 'verified-token-user')
  const save = await f.send({ action: 'save', jobId: request.jobId, booking: { customerReference: 'test' }, caller_auth_user_id: 'spoof' })
  assert.equal(save.status, 200)
  assert.equal(f.calls.find(c => c.name === 'booking_workflow_save').args.caller_auth_user_id, 'verified-token-user')
})
test('authentication and request validation fail before database mutation', async () => {
  const denied = routeFixture({ authorised: false })
  assert.equal((await denied.send({ ...request, action: 'provisional-action' })).status, 401)
  assert.equal(denied.calls.length, 0)
  const malformed = routeFixture()
  assert.equal((await malformed.send({ ...request, action: 'provisional-action', reason: '' })).status, 400)
  assert.equal(malformed.calls.length, 0)
})
test('workspace capability is server-derived and absent on an older backend', async () => {
  for (const missingCapability of [true, false]) {
    const f = routeFixture({ missingCapability })
    const result = await (await f.send({ action: 'workspace', reference: 'JD1' })).json()
    assert.equal(result.provisionalCancellation?.supported === true, !missingCapability)
    assert.equal(f.calls.some(call => call.name === 'booking_provisional_action'), false)
  }
})

const planningRequest = { action: 'save-planning-charges', jobId: request.jobId, expectedRevision: 0, baseCurrency: 'GBP', rows: [] }
test('planning route uses verified identity and narrow request parameters', async () => {
  const f = routeFixture()
  assert.equal((await f.send({ ...planningRequest, caller_auth_user_id: 'spoofed', editable: true, status: 'open' })).status, 200)
  assert.deepEqual(plain(f.calls[0]), { name: 'booking_planning_charges_save', args: {
    requested_job_id: request.jobId, expected_revision: 0, requested_base_currency: 'GBP', requested_rows: [], caller_auth_user_id: 'verified-token-user',
  } })
})
const plain = value => JSON.parse(JSON.stringify(value))
test('planning malformed requests and unauthenticated calls never reach the database', async () => {
  const denied = routeFixture({ authorised: false })
  assert.equal((await denied.send(planningRequest)).status, 401)
  assert.equal(denied.calls.length, 0)
  for (const patch of [{ expectedRevision: -1 }, { expectedRevision: '0' }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { baseCurrency: 'gbp' }, { rows: {} }, { rows: Array(201).fill({}) }, { rows: [{ text: 'x'.repeat(262144) }] }]) {
    const f = routeFixture()
    assert.ok([400, 409].includes((await f.send({ ...planningRequest, ...patch })).status))
    assert.equal(f.calls.length, 0)
  }
})
test('missing planning capability is read-only absence, never successful save', async () => {
  const f = routeFixture({ planningError: { code: 'PGRST202' } })
  const result = await f.send({ action: 'planning-charges', jobId: request.jobId })
  assert.deepEqual(await result.json(), { supported: false })
  assert.equal((await f.send(planningRequest)).status, 409)
  for (const code of ['42501', '40001', 'XX000']) {
    const denied = routeFixture({ planningError: { code, message: 'test failure' } })
    assert.notEqual((await denied.send({ action: 'planning-charges', jobId: request.jobId })).status, 200)
  }
})
