import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const reasoningCode=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/reasoning-history.ts',import.meta.url),'utf8'))
const reasoningUrl=`data:text/javascript;base64,${Buffer.from(reasoningCode).toString('base64')}`
const historyCode=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/provider-history.ts',import.meta.url),'utf8')).replace('./reasoning-history.ts',reasoningUrl)
const {continueProviderHistory,recordProviderEvent}=await import(`data:text/javascript;base64,${Buffer.from(historyCode).toString('base64')}`)

test('effort changes preserve the complete previous prefix and append their configuration at the next user turn',()=>{
 const first=continueProviderHistory(null,[],{role:'user',content:'First'},'medium','same-permissions')
 recordProviderEvent(first,{type:'response.completed',response:{id:'r1',output:[{type:'reasoning',encrypted_content:'opaque'},{role:'assistant',content:'Answer'}]}})
 const original=structuredClone(first.items)
 const next=continueProviderHistory(first,[],{role:'user',content:'Second'},'high','same-permissions')
 assert.equal(next.baseEffort,'medium');assert.equal(next.lastEffort,'high')
 assert.deepEqual(next.items.slice(0,original.length),original)
 assert.deepEqual(next.items.slice(-2),[{type:'configuration_update',reasoning:{effort:'high'}},{role:'user',content:'Second'}])
 assert.deepEqual(first.items,original)
 const changed=continueProviderHistory(next,[{role:'assistant',content:'Visible history'}],{role:'user',content:'Third'},'high','revoked-permissions')
 assert.equal(changed.baseEffort,'high');assert.equal(changed.items.length,2)
 assert.equal(JSON.stringify(changed).includes('opaque'),false)
})
test('steered history retains provider output then correction then successor output in their actual positions',()=>{
 const history=continueProviderHistory(null,[],{role:'user',content:'Initial'},'medium','contract')
 recordProviderEvent(history,{type:'response.incomplete',response:{id:'old',output:[{type:'function_call',call_id:'c1',name:'query_data_domain',arguments:'{}',async:true}]}})
 recordProviderEvent(history,{type:'steering_status',status:'queued',input:'Only active'})
 assert.equal(history.items.length,2)
 recordProviderEvent(history,{type:'steering_status',status:'incorporated',input:'Only active'})
 recordProviderEvent(history,{type:'response.completed',response:{id:'new',output:[{role:'assistant',content:'Active records'}]}})
 assert.deepEqual(history.items.map(item=>item.role??item.type),['user','function_call','user','assistant'])
 assert.equal(history.responseId,'new')
})
