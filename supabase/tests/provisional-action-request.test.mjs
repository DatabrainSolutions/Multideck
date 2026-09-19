import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../functions/bookings-workflow/core.ts', import.meta.url), 'utf8')
const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
const { parseProvisionalAction, parseAction } = context.exports
const request = { jobId: '11111111-1111-4111-8111-111111111111', operation: 'cancel', reason: ' Customer postponed ', expectedUpdatedAt: '2026-09-11T14:00:00.123456+00:00', chargeDecision: 'keep' }
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

function routeFixture({ authorised = true, missingCapability = false } = {}) {
  const calls = []
  let handler
  const entry = readFileSync(new URL('../functions/bookings-workflow/index.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('index.ts', entry, ts.ScriptTarget.Latest, true)
  const withoutImports = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n')
  const admin = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === 'resolve_workspace_reference_alias') return { data: { canonicalReference: 'JD1' } }
    if (name === 'booking_workflow_workspace') return { data: { booking: { jobId: request.jobId } } }
    if (name === 'booking_provisional_state') return missingCapability ? { error: { code: 'PGRST202' } } : { data: { supported: true } }
    return { data: { jobId: request.jobId, status: 'cancelled' } }
  } }
  const sandbox = vm.createContext({ ...context.exports, Request, Response, crypto: globalThis.crypto,
    console: { error() {} }, Deno: { serve: fn => { handler = fn } },
    authenticateRequest: async () => { if (!authorised) throw new context.exports.BookingWorkflowError(401, 'Authentication required'); return { admin, userId: 'verified-token-user' } },
    corsHeaders: () => ({}), jsonResponse: (_request, body, status = 200) => new Response(JSON.stringify(body), { status }),
  })
  vm.runInContext(ts.transpileModule(withoutImports, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, sandbox)
  return { calls, send: body => handler(new Request('http://local.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })) }
}
test('actual Edge handler uses only the authenticated actor and the explicit RPC', async () => {
  const f = routeFixture()
  const response = await f.send({ ...request, action: 'provisional-action', caller_auth_user_id: 'spoofed' })
  assert.equal(response.status, 200)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].name, 'booking_provisional_action')
  assert.equal(f.calls[0].args.caller_auth_user_id, 'verified-token-user')
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
