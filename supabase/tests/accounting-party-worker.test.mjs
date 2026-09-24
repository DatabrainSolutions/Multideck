import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const state={secret:'fixture-only-secret',enabled:true,endpoint:'https://tenant.supabase.co/functions/v1/accounting-party-worker',calls:[],failCatchup:false,scanEnabled:false,failScan:false}
const admin={
 async rpc(name){state.calls.push(name);return name==='multideck_accounting_worker_secret'?{data:state.secret,error:null}:{data:null,error:state.failCatchup?{code:'failure'}:null}},
 from(){state.calls.push('settings');const q={select(){return q},eq(){return q},async maybeSingle(){return {data:{enabled:state.enabled,endpoint:state.endpoint},error:null}}};return q},
}
globalThis.__partyWorkerTest={admin,async process(){state.calls.push('process');return {processed:1}}}
let handler
globalThis.Deno={env:{get:name=>name==='ERPNEXT_CATCHUP_ENABLED'?(state.scanEnabled?'true':undefined):'https://tenant.supabase.co'},serve(fn){handler=fn}}
const source=readFileSync(new URL('../functions/accounting-party-worker/index.ts',import.meta.url),'utf8')
 .replace(/^import[\s\S]*?from ["']\.\.\/_shared\/backend.ts["'];?\n/,'const adminClient=()=>globalThis.__partyWorkerTest.admin;\n')
 .replace(/^import[\s\S]*?from ["']\.\.\/_shared\/accounting-party-sync.ts["'];?\n/m,'const processAccountingParties=()=>globalThis.__partyWorkerTest.process();\n')
const withInbound=source.replace(/^import.*from ["']\.\.\/_shared\/erpnext-inbound.ts["'];?\n/m,'const processErpNextInbound=async()=>{globalThis.__partyWorkerTest.admin.rpc("inbound");return []};\n')
 .replace(/^import.*from ["']\.\.\/_shared\/erpnext-catchup.ts["'];?\n/m,'const processErpNextCatchup=async()=>{globalThis.__partyWorkerTest.admin.rpc("scan");if(globalThis.__partyWorkerTest.failScan())throw Error("private provider detail");return []};\n')
 .replace(/^import.*from ["']\.\.\/_shared\/cost-accrual-worker.ts["'];?\n/m,'const processCostFinalisations=async()=>[];\n')
await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(withInbound)).toString('base64')}`)
globalThis.__partyWorkerTest.failScan=()=>state.failScan
const call=(secret=state.secret,method='POST')=>handler(new Request(state.endpoint,{method,headers:secret?{'x-multideck-accounting-secret':secret}:{}}))
test('worker rejects non-POST, absent and wrong secrets before accessing the queue',async()=>{
 for(const [secret,method,status] of [[state.secret,'GET',405],['','POST',401],['wrong','POST',401]]){
  state.calls=[];assert.equal((await call(secret,method)).status,status);assert.equal(state.calls.includes('process'),false);assert.equal(state.calls.includes('settings'),false)
 }
})
test('worker refuses disabled settings and a different tenant endpoint',async()=>{
 state.enabled=false;assert.equal((await call()).status,409);state.enabled=true
 const endpoint=state.endpoint;state.endpoint='https://other.supabase.co/functions/v1/accounting-party-worker';assert.equal((await call()).status,409);state.endpoint=endpoint
})
test('authorised worker runs catch-up then processing and returns a bounded result',async()=>{
 state.calls=[];const response=await call();assert.equal(response.status,200);assert.deepEqual(await response.json(),{parties:{processed:1},catchupFinance:{status:'disabled'},incoming:[],costFinalisations:[]});assert.deepEqual(state.calls,['multideck_accounting_worker_secret','settings','multideck_accounting_party_catchup','process','inbound'])
})
test('catch-up persistence failure stops processing without leaking secrets',async()=>{
 state.calls=[];state.failCatchup=true;const response=await call();assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'account_sync_worker_failed'});assert.equal(state.calls.includes('process'),false);state.failCatchup=false
})
test('scan outage is reported without stopping signed inbound processing',async()=>{
 state.calls=[];state.scanEnabled=true;state.failScan=true
 const response=await call();assert.equal(response.status,503)
 assert.deepEqual(await response.json(),{parties:{processed:1},catchupFinance:{status:'retry_pending'},incoming:[],costFinalisations:[]})
 assert.ok(state.calls.includes('scan'));assert.ok(state.calls.includes('inbound'))
 state.scanEnabled=false;state.failScan=false
})
