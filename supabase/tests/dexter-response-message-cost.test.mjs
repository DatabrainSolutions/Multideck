import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/response-message-cost.ts',import.meta.url),'utf8'))
const {recordResponseMessageCost}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const actor={companyId:'company',userId:'user'}
function db(rows,owner=true){const calls=[],updates=[];return {calls,updates,from:table=>{
 const query={select:()=>query,eq:(field,value)=>(calls.push([table,field,value]),query),
 in:async(field,values)=>{calls.push([table,field,values]);return {data:rows,error:null}},
 update:patch=>(updates.push(patch),query),maybeSingle:async()=>({data:table==='AI_Conversations'?(owner?{}:null):{AIMSG_ID:'message'},error:null})};return query
 }}}
const row=(id,cost,extra={})=>({AIDexterEgress_ProviderRequestID:id,AIDexterEgress_ActualCostGBP:cost,AIDexterEgress_Outcome:'succeeded',AIDexterEgress_ConversationID:'conversation',...extra})
test('message cost sums owned settled responses including cache-adjusted costs, without duplicate IDs',async()=>{
 const admin=db([row('r1','0.040624'),row('r2','0.003626')])
 const amount=await recordResponseMessageCost(admin,actor,'conversation','message',['r1','r2','r1'])
 assert.ok(Math.abs(amount-0.04425)<1e-10)
 assert.equal(admin.updates[0].AIMSG_TotalCostCurrencyCode,'GBP')
 assert.ok(admin.calls.some(([,field,value])=>field==='AIDexterEgress_UserID'&&value==='user'))
 assert.ok(admin.calls.some(([,field,value])=>field==='AIDexterEgress_CompanyID'&&value==='company'))
 assert.ok(admin.calls.some(([,field,value])=>field==='AIMSG_ConversationID'&&value==='conversation'))
})
test('missing, duplicate, foreign-conversation or unsettled costs never overwrite the message estimate',async()=>{
 for(const rows of [[],[row('r1',null)],[row('r1',1,{AIDexterEgress_Outcome:'attempted'})],
  [row('r1',1,{AIDexterEgress_ConversationID:'foreign'})],[row('r1',1),row('r1',1)]]){
  const admin=db(rows)
  await assert.rejects(recordResponseMessageCost(admin,actor,'conversation','message',['r1']),/not_settled/)
  assert.equal(admin.updates.length,0)
 }
 const admin=db([row('r1',1)],false)
 await assert.rejects(recordResponseMessageCost(admin,actor,'conversation','message',['r1']),/conversation_unavailable/)
 assert.equal(admin.updates.length,0)
})
