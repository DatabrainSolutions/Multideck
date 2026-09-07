import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = name => readFileSync(new URL(`../functions/bookings-workflow/${name}`, import.meta.url), 'utf8')
const core = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source('core.ts'), { mode: 'transform' })).toString('base64')}`)
const index = source('index.ts')
const start = index.indexOf('    if (action === "save-dangerous-goods") {')
const end = index.indexOf('    if (action === "quote-sync-review") {', start)
assert.ok(start >= 0 && end > start)
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('admin', 'userId', 'body', 'core', `
  const {parseUuid, parsePayload, BookingWorkflowError} = core;
  const action='save-dangerous-goods', request={}, jsonResponse=(_request,data)=>data;
  ${index.slice(start, end)}
`)
const actor = crypto.randomUUID(), job = crypto.randomUUID()

test('Dangerous-goods endpoint binds authenticated actor and preserves complete response', async () => {
  assert.equal(core.parseAction('save-dangerous-goods'), 'save-dangerous-goods')
  const calls = [], dangerousGoods = { id: crypto.randomUUID(), changes: { marinePollutant: null } }
  const workspace = { booking: { jobId: job }, cargo: [], documents: [{ category: 'quote' }] }
  const admin = { rpc: async (name, args) => { calls.push({ name, args }); return { data: workspace } } }
  assert.equal(await execute(admin, actor, { jobId: job, userId: 'spoofed', dangerousGoods }, core), workspace)
  assert.deepEqual(calls, [{ name: 'booking_workflow_save_dangerous_goods', args: {
    caller_auth_user_id: actor, requested_job_id: job, payload: dangerousGoods,
  } }])
})

test('Dangerous-goods endpoint returns stale conflicts without retries and rejects malformed input', async () => {
  const body = { jobId: job, dangerousGoods: {} }
  for (const code of ['PT409', '40001']) {
    let calls = 0
    await assert.rejects(execute({ rpc: async () => { calls++; return { error: { code, message: 'Stale record' } } } }, actor, body, core),
      error => error.status === 409 && /dangerous-goods record changed/.test(error.clientMessage))
    assert.equal(calls, 1)
  }
  for (const error of [{ code: '42501' }, { code: '22023' }]) {
    await assert.rejects(execute({ rpc: async () => ({ error }) }, actor, body, core), result => result === error)
  }
  await assert.rejects(execute({ rpc: async () => ({ data: null }) }, actor, body, core), /returned no result/)
  let calls = 0
  const admin = { rpc: async () => { calls++; return {} } }
  await assert.rejects(execute(admin, actor, { jobId: 'bad', dangerousGoods: {} }, core))
  await assert.rejects(execute(admin, actor, { jobId: job, dangerousGoods: [] }, core))
  assert.equal(calls, 0)
})
