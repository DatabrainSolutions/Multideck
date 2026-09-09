import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const core = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(
  readFileSync(new URL('../functions/bookings-workflow/core.ts', import.meta.url), 'utf8'), { mode: 'transform' })))
const source = readFileSync(new URL('../functions/bookings-workflow/index.ts', import.meta.url), 'utf8')
const start = source.indexOf('    if (action === "save-security-evidence") {')
const end = source.indexOf('    if (action === "quote-sync-review") {', start)
assert.ok(start >= 0 && end > start)
const run = new (Object.getPrototypeOf(async function () {}).constructor)('deps', `
  const {admin,body,userId,request,action,parseUuid,parsePayload,BookingWorkflowError,jsonResponse}=deps;
  ${source.slice(start, end)}
`)
const jobId = '78313622-1542-4aec-bbb2-c300a7ef5d57'
const userId = '10000000-0000-4000-8000-000000000001'
function invoke(body, rpc) {
  return run({ ...core, admin: { rpc }, body, userId, request: {},
    action: core.parseAction('save-security-evidence'), jsonResponse: (_, data) => data })
}

test('screening Edge dispatch uses the verified caller and exact evidence payload', async () => {
  const evidence = { changes: { securityStatus: ' Supplied source text ' } }
  const workspace = { cargo: [{ securityEvidence: [{ id: 'evidence' }] }], documents: [{ id: 'retained' }] }
  const result = await invoke({ jobId, caller_auth_user_id: 'forged', securityEvidence: evidence }, async (name, args) => {
    assert.equal(name, 'booking_workflow_save_security_evidence')
    assert.deepEqual(args, { caller_auth_user_id: userId, requested_job_id: jobId, payload: evidence })
    return { data: workspace, error: null }
  })
  assert.equal(result, workspace)
})

test('malformed screening requests fail before RPC', async () => {
  for (const body of [{ jobId: 'bad', securityEvidence: {} }, { jobId, securityEvidence: [] }]) {
    await assert.rejects(invoke(body, () => assert.fail('RPC must not run')), error => error.status === 400)
  }
  assert.throws(() => core.parseAction('save-arbitrary-evidence'), error => error.status === 400)
})

test('screening conflicts stay non-retryable review errors', async () => {
  for (const code of ['PT409', '40001']) {
    await assert.rejects(invoke({ jobId, securityEvidence: {} }, async () => ({ error: { code, message: 'stale' } })),
      error => error.status === 409 && /Reload/.test(error.clientMessage))
  }
})

test('missing or failed screening results cannot become success', async () => {
  await assert.rejects(invoke({ jobId, securityEvidence: {} }, async () => ({ data: null })), /no result/)
  const denial = new Error('permission denied')
  await assert.rejects(invoke({ jobId, securityEvidence: {} }, async () => ({ error: denial })), error => error === denial)
})
