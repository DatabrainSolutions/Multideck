import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const read=name=>readFileSync(new URL(`../functions/agent-dexter/${name}.ts`,import.meta.url),'utf8')
const sessionCode=stripTypeScriptTypes(read('responses-session'))
const {ResponsesSession}=await import(`data:text/javascript;base64,${Buffer.from(sessionCode).toString('base64')}`)
const source=stripTypeScriptTypes(read('governed-responses-socket').replace(/^import .*\n/gm,''))
  .replace('export function governedResponsesSocket','function governedResponsesSocket')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function harness(){
 const timers=new Map(),settled=[],sent=[],sockets=[];let counter=0
 class Wire{
  static OPEN=1;static CLOSED=3;readyState=0;handlers=new Map()
  constructor(){sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.emit('open')})}
  on(name,fn){const list=this.handlers.get(name)||[];list.push(fn);this.handlers.set(name,list)}
  once(name,fn){this.on(name,fn)}
  emit(name,data){for(const fn of this.handlers.get(name)||[])fn(data)}
  send(text){sent.push(JSON.parse(text))}
  terminate(){if(this.readyState===3)return;this.readyState=3;this.emit('close')}
  event(value){this.emit('message',{toString:()=>JSON.stringify(value)})}
 }
 const build=new Function('WebSocket','ResponsesSession','redactModelSecrets','reserveModelEgress','settleModelEgress','setTimeout','clearTimeout',source+';return governedResponsesSocket')
 const socket=build(Wire,ResponsesSession,x=>x,async()=>`r${++counter}`,async()=>{},(fn,ms)=>{const id=++counter;timers.set(id,{fn,ms});return id},id=>timers.delete(id))({companyId:'company',userId:'user',admin:{rpc:async(_name,args)=>{settled.push(args);return {error:null}}}},'synthetic-key',{onEvent:()=>{},onAsyncCall:()=>{}})
 return {socket,sockets,sent,settled,timers,fire:ms=>{const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry,`Missing ${ms}ms deadline`);timers.delete(entry[0]);entry[1].fn()}}
}
const body={model:'gpt-6-astra',store:false,input:[{role:'user',content:'Read only'}],tools:[]}
test('an unacknowledged continuation fails promptly, settles once, closes and never replays',async()=>{
 const h=harness();const first=h.socket.request(body);await tick()
 h.sockets[0].event({type:'response.created',response:{id:'response1'}});await tick()
 assert.equal([...h.timers.values()].some(t=>t.ms===20000),false)
 h.sockets[0].event({type:'response.completed',response:{id:'response1',output:[],usage:{input_tokens:10,output_tokens:2}}});await first
 const next=h.socket.request({...body,input:[]});const rejected=assert.rejects(next,/responses_start_timeout/);await tick();h.fire(20000);await rejected
 assert.equal(h.sent.length,2);assert.equal(h.sockets.length,1)
 assert.equal(h.settled.length,2);assert.equal(h.settled[1].p_error_code,'responses_start_timeout')
 assert.equal(h.sockets[0].readyState,3);assert.equal(h.timers.size,0)
})
test('an acknowledged but stalled response has a server deadline before the browser deadline',async()=>{
 const h=harness();const result=h.socket.request(body);const rejected=assert.rejects(result,/responses_run_timeout/);await tick()
 h.sockets[0].event({type:'response.created',response:{id:'response1'}});await tick();h.fire(95000);await rejected
 assert.equal(h.settled.length,1);assert.equal(h.settled[0].p_error_code,'responses_run_timeout');assert.equal(h.sent.length,1)
})
