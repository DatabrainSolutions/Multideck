import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
async function load(name){const source=stripTypeScriptTypes(readFileSync(new URL(`../functions/agent-dexter/${name}.ts`,import.meta.url),'utf8'));return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)}
const {ResponsesSession}=await load('responses-session')
const {appendReasoningTurn}=await load('reasoning-history')
const body={model:'gpt-6-astra',store:false,input:[{role:'user',content:'Read two records'}],tools:[{type:'function',name:'query_data_domain',async:true}]}
function harness(){
 const sent=[],settled=[],events=[],calls=[];let id=0
 const session=new ResponsesSession({send:event=>sent.push(event),reserve:async()=>`reservation-${++id}`,
  settle:async(...args)=>settled.push(args),onEvent:event=>events.push(event),onAsyncCall:call=>calls.push(call)})
 return {session,sent,settled,events,calls}
}
const created=id=>({type:'response.created',response:{id}})
const completed=(id,output=[])=>({type:'response.completed',response:{id,status:'completed',output,usage:{input_tokens:10,output_tokens:5}}})
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('async calls start at completed items while generation continues and duplicate terminal items do not rerun',async()=>{
 const h=harness();const result=h.session.request(body);await tick();await h.session.receive(created('r1'))
 const call={type:'function_call',name:'query_data_domain',async:true,call_id:'c1',arguments:'{"domain":"leads"}'}
 await h.session.receive({type:'response.output_item.done',item:call})
 assert.equal(h.calls.length,1);assert.equal(h.settled.length,0)
 await h.session.receive(completed('r1',[call]));assert.equal((await result).response.id,'r1');assert.equal(h.calls.length,1);assert.equal(h.settled.length,1)
 await h.session.close();assert.equal(h.settled.length,1)
})
test('queued steering waits for its automatic continuation without sending another create',async()=>{
 const h=harness();let finished=false;const result=h.session.request(body).then(r=>(finished=true,r));await tick();await h.session.receive(created('r1'))
 assert.equal(await h.session.steer('Only show active leads'),true)
 await h.session.receive({type:'response.steer.accepted',steer:{id:'s1',previous_response_id:'r1'}})
 assert.equal(h.events.findLast(e=>e.type==='steering_status').status,'queued')
 await h.session.receive({type:'response.incomplete',response:{id:'r1',status:'incomplete',incomplete_details:{reason:'steered'},output:[]}})
 assert.equal(finished,false)
 await h.session.receive(created('r2'));assert.equal(h.events.findLast(e=>e.type==='steering_status').status,'incorporated')
 await h.session.receive(completed('r2'));assert.equal((await result).responses.length,2)
 assert.equal(h.sent.filter(e=>e.type==='response.create').length,1);assert.equal(h.settled.length,2)
 assert.equal(h.events.findLast(e=>e.type==='steering_status').status,'incorporated')
})
test('a normally completed response can still have an accepted steering continuation',async()=>{
 const h=harness();let finished=false;const result=h.session.request(body).then(r=>(finished=true,r));await tick();await h.session.receive(created('r1'))
 await h.session.steer('Use a table');await h.session.receive({type:'response.steer.accepted',steer:{id:'s1'}})
 await h.session.receive(completed('r1'));assert.equal(finished,false)
 await h.session.receive(created('r2'));await h.session.receive(completed('r2'));await result
 assert.equal(h.sent.length,2)
})
test('required tool output continues on the same response without duplicating accepted steering',async()=>{
 const h=harness();const first=h.session.request(body);await tick();await h.session.receive(created('r1'));await h.session.steer('Keep the names')
 await h.session.receive({type:'response.steer.accepted',steer:{id:'s1'}})
 await h.session.receive(completed('r1',[{type:'function_call',name:'prepare_action',call_id:'sync1',arguments:'{}'}]));await first
 await h.session.receive({type:'response.steer.pending',steer:{id:'s1'},required_input:[{type:'function_call_output',call_id:'sync1'}]})
 const next=h.session.request({...body,input:[{type:'function_call_output',call_id:'sync1',output:'{"prepared":true}'}]});await tick()
 assert.equal(h.sent.at(-1).previous_response_id,'r1');assert.equal(h.sent.at(-1).input.length,1)
 await h.session.receive(created('r2'));await h.session.receive(completed('r2'));await next
 assert.equal(h.settled.length,2)
})
test('disconnection leaves accepted steering unconfirmed and never silently replays it',async()=>{
 const h=harness();const result=h.session.request(body);const rejected=assert.rejects(result,/connection_closed/);await tick();await h.session.receive(created('r1'))
 await h.session.steer('Different direction');await h.session.receive({type:'response.steer.accepted',steer:{id:'s1'}})
 await h.session.close();await rejected;assert.equal(h.settled.length,2);assert.equal(h.events.findLast(e=>e.type==='steering_status').status,'unconfirmed')
 assert.equal(h.sent.length,2);assert.equal(await h.session.steer('retry'),false)
})
test('unadvertised async writes and reused call IDs fail closed',async()=>{
 for(const reused of [false,true]){
  const h=harness();const result=h.session.request(body);const rejected=assert.rejects(result,reused?/call_id_reused/:/unexpected_async/);await tick();await h.session.receive(created('r1'))
  const call={type:'function_call',name:reused?'query_data_domain':'send_email',async:true,call_id:'c1',arguments:'{}'}
  await h.session.receive({type:'response.output_item.done',item:call})
  if(reused)await h.session.receive({type:'response.output_item.done',item:{...call,arguments:'{"changed":true}'}})
  await rejected;assert.equal(h.settled.length,1)
 }
})
test('cache-preserving effort changes append history items and retain request-level effort',()=>{
 const history=[{role:'user',content:'First question'},{role:'assistant',content:'First answer'}]
 const high=appendReasoningTurn(history,{role:'user',content:'Think more deeply'},{baseEffort:'medium',previousEffort:'medium',nextEffort:'high'})
 assert.equal(high.reasoning.effort,'medium');assert.deepEqual(high.input.slice(0,2),history)
 assert.deepEqual(high.input[2],{type:'configuration_update',reasoning:{effort:'high'}})
 const low=appendReasoningTurn([...high.input,{role:'assistant',content:'Analysis'}],{role:'user',content:'Quick follow-up'},{baseEffort:'medium',previousEffort:'high',nextEffort:'low'})
 assert.deepEqual(low.input.slice(0,4),high.input);assert.equal(low.reasoning.effort,'medium')
 assert.throws(()=>appendReasoningTurn([{type:'configuration_update'}],{role:'user'},{baseEffort:'medium',previousEffort:'high',nextEffort:'low'}),/adjacent/)
})
test('committed steering is not labelled unconfirmed when its successor disconnects',async()=>{
 const h=harness();const result=h.session.request(body);const rejected=assert.rejects(result,/connection_closed/);await tick();await h.session.receive(created('r1'))
 await h.session.steer('Use a shorter answer');await h.session.receive({type:'response.steer.accepted',steer:{id:'s1'}})
 await h.session.receive(completed('r1'));await h.session.receive(created('r2'));await h.session.close();await rejected
 assert.equal(h.events.filter(e=>e.type==='steering_status'&&e.status==='unconfirmed').length,0)
 assert.equal(h.events.findLast(e=>e.type==='steering_status').status,'incorporated')
})
test('a response finishing during steering reservation is not sent a stale update',async()=>{
 let release;let count=0;const sent=[],settled=[]
 const session=new ResponsesSession({send:e=>sent.push(e),reserve:()=>++count===1?Promise.resolve('first'):new Promise(resolve=>{release=()=>resolve('steer')}),settle:async(...args)=>settled.push(args),onEvent:()=>{},onAsyncCall:()=>{}})
 const result=session.request(body);await tick();await session.receive(created('r1'));const steering=session.steer('Change scope')
 await session.receive(completed('r1'));await result;release();assert.equal(await steering,false)
 assert.equal(sent.length,1);assert.equal(settled.length,2)
})

test('ledger failure during disconnect settles every reservation and rejects the waiting request',async()=>{
 const settled=[],events=[];let id=0
 const session=new ResponsesSession({send:()=>{},reserve:async()=>`r${++id}`,
  settle:async reservation=>{settled.push(reservation);throw new Error('ledger_offline')},
  onEvent:event=>events.push(event),onAsyncCall:()=>{}})
 const result=session.request(body)
 const rejected=assert.rejects(result,/connection_closed/)
 await tick();await session.receive(created('response1'));await session.steer('Show active records')
 await session.close();await rejected
 assert.deepEqual(settled.sort(),['r1','r2'])
 assert.equal(session.isClosed,true)
 assert.equal(events.filter(event=>event.type==='usage_settlement_failed').length,1)
 assert.equal(events.at(-1).status,'unconfirmed')
 await session.close();assert.equal(settled.length,2)
})

test('terminal usage failure rejects the request without retrying the same settlement',async()=>{
 let attempts=0
 const session=new ResponsesSession({send:()=>{},reserve:async()=> 'reservation',
  settle:async()=>{attempts++;throw new Error('ledger_offline')},onEvent:()=>{},onAsyncCall:()=>{}})
 const result=session.request(body);const rejected=assert.rejects(result,/ledger_offline/)
 await tick();await session.receive(created('response1'));await session.receive(completed('response1'))
 await rejected;assert.equal(session.isClosed,true);assert.equal(attempts,1)
})
