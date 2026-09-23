import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = readFileSync(new URL('../functions/_shared/cost-accrual-worker.ts', import.meta.url), 'utf8')
const load = async deliver => {
  const key = `__costDelivery${Math.random().toString(36).slice(2)}`
  globalThis[key] = deliver
  const js = stripTypeScriptTypes(source.replace(/^import .*finance-journal-delivery.ts"$/m, `const attemptDelivery = globalThis[${JSON.stringify(key)}]`))
  const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  delete globalThis[key]
  return module.processCostFinalisations
}

test('cost worker re-reads outbox after atomic evaluation and retains failed delivery', async () => {
  const calls = []
  const process = await load(async (_admin, actor, entity, id) => { calls.push(['deliver',actor,entity,id]); return {mirror_status:'failed'} })
  let reads = 0
  const result = await process({rpc: async (name,args) => {
    calls.push([name,args])
    if (name==='multideck_cost_work_queue') return {data: ++reads===1 ? {pending:[{id:'evidence',legal_entity_id:'entity'}]} : {delivery:[{id:'journal',legal_entity_id:'entity',authorised_by:'approver'}]}}
    return {data:{status:'posted'}}
  }})
  assert.deepEqual(result,{evaluated:1,delivered:0,failed:1})
  assert.deepEqual(calls[1],['multideck_cost_finalise',{p_entity:'entity',p_evidence:'evidence'}])
  assert.deepEqual(calls[3],['deliver','approver','entity','journal'])
})

test('no activated work means no posting or provider call; errors are not called success', async () => {
  const process = await load(async () => { throw new Error('unexpected delivery') })
  assert.deepEqual(await process({rpc: async () => ({data:{pending:[],delivery:[]}})}),{evaluated:0,delivered:0,failed:0})
  await assert.rejects(process({rpc: async () => ({error:{message:'database unavailable'}})}), /unavailable/)
  let calls=0
  assert.deepEqual(await process({rpc: async name => name==='multideck_cost_work_queue'
    ? {data: ++calls===1 ? {pending:[{id:'evidence',legal_entity_id:'entity'}]} : {delivery:[]}}
    : {error:{code:'42501'}}}),{evaluated:0,delivered:0,failed:1})
})
