import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/active-run.ts',import.meta.url),'utf8'))
const {steeringRequest}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const id='11111111-1111-4111-8111-111111111111'
const actor={companyId:'company',userId:'owner',authUserId:'authenticated-owner'}
test('steering uses the authenticated actor and ignores attempted worker or ownership overrides',async()=>{
 let sent
 const response=await steeringRequest({rpc:async(name,args)=>{sent={name,args};return {data:{status:'active'},error:null}}},actor,
  {operation:'steer',runId:id,clientSessionId:id,inputId:id,input:'Use active leads',companyId:'other',userId:'other',workerToken:id,p_operation:'finish'})
 assert.equal(response.status,200)
 assert.equal(sent.args.p_company_id,'company');assert.equal(sent.args.p_user_id,'owner')
 assert.equal(sent.args.p_auth_user_id,'authenticated-owner');assert.equal(sent.args.p_operation,'enqueue')
 assert.equal('p_worker_token' in sent.args,false)
})
test('invalid input is rejected before storage and inaccessible runs reveal no details',async()=>{
 let calls=0;const db={rpc:async()=>{calls++;return {data:null,error:{code:'42501'}}}}
 assert.equal((await steeringRequest(db,actor,{operation:'steer',runId:id,clientSessionId:id,inputId:id,input:' '.repeat(5)})).status,400)
 assert.equal(calls,0)
 const response=await steeringRequest(db,actor,{operation:'active-run-status',runId:id,clientSessionId:id})
 assert.equal(response.status,404);assert.equal(response.body.run,undefined)
})

const {activeRunWorker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('worker serialises provider statuses, commits input once, and never exposes its private token',async()=>{
 const operations=[],events=[],incorporated=[];let claimed=false,worker
 const db={rpc:async(_name,args)=>{
  operations.push(args)
  return {data:args.p_operation==='claim'&&!claimed?(claimed=true,{id,input:'Only active leads'}):null,error:null}
 }}
 worker=await activeRunWorker(db,actor,{clientSessionId:id,conversationId:null},{
  canSteer:()=>true,emit:event=>events.push(event),
  incorporated:async(...args)=>{incorporated.push(args)},
  steer:async()=>{
   worker.event({type:'steering_status',status:'submitted'})
   worker.event({type:'steering_status',status:'queued'})
   worker.event({type:'steering_status',status:'incorporated',responseId:'resp-next'})
   return true
  },
 })
 worker.announce();await Promise.all([worker.poll(),worker.poll()]);await worker.finish('completed')
 assert.equal(operations.filter(op=>op.p_operation==='claim').length,1)
 assert.deepEqual(operations.filter(op=>op.p_operation==='transition').map(op=>op.p_status),['submitted','queued','incorporated'])
 assert.deepEqual(incorporated,[['Only active leads','resp-next']])
 assert.equal(JSON.stringify(events).includes(operations[0].p_worker_token),false)
 assert.equal(events.at(-1).inputId,id)
 await worker.poll();assert.equal(operations.filter(op=>op.p_operation==='claim').length,1)
})
test('a correction claimed after the response finishes is failed without resubmission',async()=>{
 const operations=[];let attempts=0
 const worker=await activeRunWorker({rpc:async(_name,args)=>{operations.push(args);return {
  data:args.p_operation==='claim'?{id,input:'Use a table'}:null,error:null,
 }}},actor,{clientSessionId:id,conversationId:null},{canSteer:()=>true,steer:async()=>{attempts++;return false},emit:()=>{},incorporated:async()=>{throw new Error('must not commit')}})
 await worker.poll();await worker.finish('completed')
 assert.equal(attempts,1);assert.equal(operations.find(op=>op.p_operation==='transition').p_status,'failed')
})
