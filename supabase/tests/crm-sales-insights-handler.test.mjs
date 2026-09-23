import './register-typescript.mjs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { salesNarrativeFixture, salesThemeFixture } from './crm-sales-analysis-fixture.mjs'

let state
globalThis.Deno={env:{get:name=>name==='OPENAI_API_KEY' && state?.configured!==false?'test-key':undefined}}
globalThis.__salesTest={get state(){return state}}
registerHooks({load(url,context,next){
  if(url.endsWith('/functions/_shared/backend.ts'))return{format:'module',shortCircuit:true,source:`
    export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}
    export const corsHeaders=()=>({});export const json=(req,data,status=200)=>new Response(JSON.stringify(data),{status});
    export const adminClient=()=>globalThis.__salesTest.state.admin;
    export async function authenticate(){const s=globalThis.__salesTest.state;if(s.authFail)throw new HttpError(401,'Sign in again.');return{admin:s.admin,user:{id:'auth-user'},token:'user-token'}}
    export async function currentInternalUser(){return{User_ID:'operator',Company_ID:'workspace'}}
    export function authenticatedClient(token){if(token!=='user-token')throw Error('Wrong actor token');return{rpc:async(name)=>{const s=globalThis.__salesTest.state;s.reads++;s.readName=name;return s.denied?{error:{code:'42501'}}:{data:s.briefing}}}}
  `}
  if(url.endsWith('/functions/_shared/model-gateway.ts'))return{format:'module',shortCircuit:true,source:`
    export async function governedModelFetch(context,input){const s=globalThis.__salesTest.state;s.calls++;s.gateway={context,input};if(s.gatewayFailure)throw Error(s.gatewayFailure);return new Response(JSON.stringify({output_text:JSON.stringify(s.model)}),{status:s.providerStatus||200})}
  `}
  return next(url,context)
}})
const {handleSalesInsights}=await import('../functions/crm-sales-insights/index.ts')
const {salesEvidenceFingerprint,buildSalesAnalysisSource}=await import('../functions/crm-sales-insights/core.ts')
const company='20000000-0000-0000-0000-000000000001', user='10000000-0000-0000-0000-000000000001', lease='30000000-0000-0000-0000-000000000001'
const secret='fixture-worker-secret-with-at-least-thirty-two-characters'
function reset(){
  state={reads:0,calls:0,saves:0,claims:0,validations:0,failures:[],briefing:{result:{summary:'Last good review'},status:'stale'},snapshot:{generatedAt:'2026-09-22T11:00:00Z',coverage:{totalDeals:4,note:'Recorded history only.'},summary:{openDeals:3,wonDeals:1,lostDeals:0,closedDeals:1,winRatePct:100}},model:{summary:'A limited sample.',themes:[],findings:[{section:'trend',title:'Build evidence',observation:'One deal has closed.',recommendation:'Review the remaining opportunities.',evidenceIds:['summary.closedDeals']}]}}
  state.jobs=[{companyId:company,userId:user,leaseId:lease,snapshot:state.snapshot,lastFingerprint:null}]
  state.admin={rpc:async(name,args)=>{
    if(name==='multideck_crm_sales_briefing_worker_secret')return{data:secret}
    if(name==='multideck_crm_claim_sales_briefing_jobs'){state.claims++;assert.equal(args.p_limit,1);return{data:state.jobs}}
    if(name==='multideck_crm_validate_sales_briefing_job'){state.validations++;assert.equal(args.p_company_id,company);assert.equal(args.p_user_id,user);assert.equal(args.p_lease_id,lease);return{data:!state.denied && !(state.revokeAfterModel && state.validations>2)}}
    if(name==='multideck_crm_finish_sales_briefing_job'){state.saves++;state.saved=args;return{data:!state.staleLease}}
    if(name==='multideck_crm_fail_sales_briefing_job'){state.failures.push(args);return{data:true}}
    throw Error('Unexpected RPC '+name)
  }}
}
function request(worker=false,payload={}){return new Request('http://localhost/crm-sales-insights',{method:'POST',body:JSON.stringify(payload),headers:{'Content-Type':'application/json',...(worker?{'x-multideck-crm-sales-worker':secret}:{})}})}
test('opening or refreshing the page only reads saved work, regardless of submitted generation instructions',async()=>{
  reset()
  for(let i=0;i<5;i++){
    const response=await handleSalesInsights(request(false,{force:true,companyId:'foreign',filters:{days:30},summary:{won:1000000}}))
    assert.equal(response.status,200);assert.equal((await response.json()).result.summary,'Last good review')
  }
  assert.equal(state.reads,5);assert.equal(state.readName,'multideck_crm_get_sales_briefing');assert.equal(state.claims,0);assert.equal(state.calls,0)
  state.denied=true;assert.equal((await handleSalesInsights(request())).status,403)
  state.authFail=true;assert.equal((await handleSalesInsights(request())).status,401)
})
test('only the private worker secret can claim jobs; an empty queue never reaches the model',async()=>{
  reset();const bad=request(true);bad.headers.set('x-multideck-crm-sales-worker','wrong')
  assert.equal((await handleSalesInsights(bad)).status,401);assert.equal(state.claims,0)
  state.jobs=[];assert.deepEqual(await (await handleSalesInsights(request(true))).json(),{completed:0,skipped:0,failed:0,modelCalls:0});assert.equal(state.calls,0)
})
test('unchanged evidence preserves the saved briefing without another provider call',async()=>{
  reset();state.jobs[0].lastFingerprint=await salesEvidenceFingerprint(buildSalesAnalysisSource(state.snapshot),'gpt-5-mini')
  state.snapshot.generatedAt='2026-09-23T15:00:00Z'
  assert.equal((await (await handleSalesInsights(request(true))).json()).skipped,1)
  assert.equal(state.calls,0);assert.equal(state.saved.p_skipped,true);assert.equal(state.saved.p_result,null)
})
test('a changed leased snapshot uses governed metering and saves only evidence-owned findings',async()=>{
  reset();const response=await handleSalesInsights(request(true,{snapshot:{won:1000000}}));assert.equal(response.status,200)
  assert.equal(state.gateway.context.companyId,company);assert.equal(state.gateway.context.userId,user);assert.equal(state.gateway.input.purpose,'crm_sales_insights')
  assert.deepEqual(state.gateway.input.dataCategories,['business_record']);assert.ok(!JSON.stringify(state.gateway.input.body).includes('1000000'))
  assert.equal(state.saved.p_result.findings[0].evidence[0].value,'1');assert.equal(state.saved.p_lease_id,lease);assert.equal(state.validations,3)
})
test('revoked access and stale leases cannot publish generated findings',async()=>{
  reset();state.denied=true;await handleSalesInsights(request(true));assert.equal(state.calls,0);assert.equal(state.saves,0)
  reset();state.revokeAfterModel=true;await handleSalesInsights(request(true));assert.equal(state.calls,1);assert.equal(state.saves,0);assert.equal(state.failures[0].p_error_code,'access_changed')
  reset();state.staleLease=true;const result=await (await handleSalesInsights(request(true))).json();assert.equal(result.failed,1);assert.equal(result.completed,0);assert.equal(state.failures[0].p_error_code,'stale_lease')
})
test('model failure, unconfigured providers and invented citations retain the prior review with bounded queue failure',async()=>{
  for(const [flag,value,code] of [['providerStatus',503,'provider_unavailable'],['configured',false,'not_configured'],['gatewayFailure','usage_allowance_reached','usage_allowance_reached']]){
    reset();state[flag]=value;await handleSalesInsights(request(true));assert.equal(state.saves,0);assert.equal(state.failures.length,1);assert.equal(state.failures[0].p_error_code,code);assert.equal(state.briefing.result.summary,'Last good review')
  }
  reset();state.model.findings[0].evidenceIds=['invented'];await handleSalesInsights(request(true));assert.equal(state.saves,0);assert.equal(state.failures[0].p_error_code,'invalid_evidence')
})
test('an emptied workspace clears old insights without paying for an empty analysis',async()=>{
  reset();state.snapshot.coverage.totalDeals=0;await handleSalesInsights(request(true));assert.equal(state.calls,0);assert.equal(state.saved.p_result,null);assert.equal(state.saved.p_skipped,false)
})
test('worker classifies only its leased native narratives and rejects fabricated group membership',async()=>{
  reset();state.snapshot.narrative=salesNarrativeFixture();state.model.themes=salesThemeFixture()
  await handleSalesInsights(request(true,{narrative:{documents:[{text:'arbitrary customer data'}]}}))
  assert.equal(state.saved.p_result.schemaVersion,3)
  assert.equal(state.saved.p_result.themes[0].memberships[0].dealId,state.snapshot.narrative.deals[0].id)
  assert.equal(state.gateway.input.recordCount,buildSalesAnalysisSource(state.snapshot).evidence.length+2)
  assert.ok(!JSON.stringify(state.gateway.input.body).includes('arbitrary customer data'))
  reset();state.snapshot.narrative=salesNarrativeFixture();state.model.themes=salesThemeFixture();state.model.themes[0].memberships[0].excerpt='Fabricated customer objection'
  await handleSalesInsights(request(true));assert.equal(state.saves,0);assert.equal(state.failures[0].p_error_code,'invalid_evidence')
})
