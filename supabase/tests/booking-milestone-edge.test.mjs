import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const source = name => readFileSync(new URL(`../functions/bookings-workflow/${name}`, import.meta.url), 'utf8')
const core = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source('core.ts'), { mode: 'transform' })).toString('base64')}`)
const index = source('index.ts')
const start = index.indexOf('    if (action === "save-milestone") {')
const end = index.indexOf('    if (action === "quote-sync-review") {', start)
assert.ok(start >= 0 && end > start)
const executeBranch = new (Object.getPrototypeOf(async function () {}).constructor)('admin', 'userId', 'body', 'core', `
  const {parseUuid, parsePayload, BookingWorkflowError} = core;
  const action='save-milestone', request={}, jsonResponse=(_request,data)=>data;
  ${index.slice(start, end)}
`)
const actor = crypto.randomUUID(), job = crypto.randomUUID()

test('Operator milestone route binds the authenticated actor and returns the complete canonical result', async () => {
  assert.equal(core.parseAction('save-milestone'), 'save-milestone')
  const calls = [], milestone = { id: crypto.randomUUID(), changes: { actualAt: null } }
  const workspace = { booking: { jobId: job }, sourceQuote: { appliedVersionNumber: 1 }, routes: [], documents: [{ category: 'quote' }] }
  const admin = { rpc: async (name, args) => { calls.push({ name, args }); return { data: workspace, error: null } } }
  assert.equal(await executeBranch(admin, actor, { jobId: job, userId: 'spoofed', milestone }, core), workspace)
  assert.deepEqual(calls, [{ name: 'booking_workflow_save_route_milestone', args: { caller_auth_user_id: actor, requested_job_id: job, payload: milestone } }])
})

test('Stale milestone response is a recoverable conflict; other errors and missing data are not success', async () => {
  const body = { jobId: job, milestone: {} }
  for (const code of ['PT409', '40001']) {
    let calls = 0
    const stale = { rpc: async () => { calls++; return { error: { code, message: 'Stale exact milestone' } } } }
    await assert.rejects(executeBranch(stale, actor, body, core), error => error.status === 409 && /milestone changed/.test(error.clientMessage))
    assert.equal(calls, 1, 'A stale operator snapshot is returned, not retried by the Edge branch')
  }
  for (const error of [{ code: '42501' }, { code: '22023' }]) {
    await assert.rejects(executeBranch({ rpc: async () => ({ error }) }, actor, body, core), result => result === error)
  }
  await assert.rejects(executeBranch({ rpc: async () => ({ data: null }) }, actor, body, core), /returned no result/)
  let calls = 0
  const admin = { rpc: async () => { calls++; return {} } }
  await assert.rejects(executeBranch(admin, actor, { jobId: 'bad', milestone: {} }, core))
  await assert.rejects(executeBranch(admin, actor, { jobId: job, milestone: [] }, core))
  assert.equal(calls, 0)
})
