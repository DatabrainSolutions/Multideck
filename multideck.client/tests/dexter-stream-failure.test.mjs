import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const source=readFileSync(new URL('../src/lib/dexter-api.ts',import.meta.url),'utf8')
const errorSource=source.slice(source.indexOf('export class DexterApiError'),source.indexOf('export async function uploadDexterDocument'))
const streamSource=source.slice(source.indexOf('export async function streamDexterMessage'),source.indexOf('export async function dismissDexterDeferredWork'))
const compiled=ts.transpileModule((errorSource+streamSource).replaceAll('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function client(fetch, overrides={}) {
 const context={fetch,getSupabaseSession:async()=>({access_token:'test-session'}),supabaseFunctionsUrl:'https://workspace.test/functions/v1',supabasePublicApiKey:'public-test',supabase:{},window:{setTimeout,clearTimeout},retainStreamedEmailAttachments:value=>value,invalidateRegisterPages:()=>{},...overrides}
 return new Function(...Object.keys(context),`${compiled}; return {streamDexterMessage,DexterApiError}`)(...Object.values(context))
}
const response=events=>new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}})
test('an explicit server-confirmed initial failure permits retry and retains its message',async()=>{
 const {streamDexterMessage}=client(async()=>response([{type:'active_run',runId:'run'},{type:'error',message:'Could not complete',retrySafe:true}]))
 let active
 await assert.rejects(streamDexterMessage({message:'Check Gmail'}, {onActiveRun:id=>active=id}),error=>error.retrySafe===true&&error.message==='Could not complete')
 assert.equal(active,'run')
})
test('later tool failures, old servers, interrupted streams and connection loss require reconciliation',async()=>{
 const cases=[async()=>response([{type:'error',message:'Later failure',retrySafe:false}]),async()=>response([{type:'error',message:'Unknown outcome'}]),async()=>response([{type:'delta',delta:'Partial response'}]),async()=>{throw new TypeError('Failed to fetch')}]
 for(const fetch of cases){
  const {streamDexterMessage}=client(fetch)
  await assert.rejects(streamDexterMessage({message:'Check Gmail'},{}),error=>error.retrySafe===false)
 }
})
test('successful saved replies remain successful',async()=>{
 const conversation={id:'saved',messages:[]}
 const {streamDexterMessage}=client(async()=>response([{type:'complete',conversation}]))
 assert.deepEqual(await streamDexterMessage({message:'Check Gmail'},{}),conversation)
})

const page=readFileSync(new URL('../src/pages/agent-dexter-page.tsx',import.meta.url),'utf8')
for(const name of ['submitPrompt','retryPrompt']) test(`${name}: confirmed failure unlocks retry, uncertain failure keeps recovery and draft`,async()=>{
 const section=page.slice(page.indexOf(`  async function ${name}(`))
 const next=section.indexOf('\n  async function ',10)
 const fn=section.slice(0,next)
 const start=fn.lastIndexOf('} catch (requestError) {')
 const failure=fn.slice(start,fn.lastIndexOf('\n  }'))
 const code=ts.transpileModule(`async function fail(requestError) { try {throw requestError; ${failure} }`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 for(const safe of [true,false]){
  const {DexterApiError}=client(()=>{})
  const requestController={}
  const state={ActiveConversation:{messages:[]},ComposerValue:'',ComposerMentions:[],SelectedAttachmentIds:new Set(),ComposerEmailAttachments:[],ComposerEmailUpdates:[],ComposerUploadedDocuments:[],SelectedResponseMessageIds:{}}
  const recoveryRef={current:{runId:'run'}}
  const context={DexterApiError,conversationIntentRef:{current:{version:1}},submissionIntent:{version:1},recoveryRef,
   pendingConversation:{messages:[]},previousConversation:{messages:[]},assistantStreamMessage:{id:'pending'},liveReasoningRef:{current:''},requestInput:{message:'Check Gmail'},pendingMessage:{id:'user'},
   draft:{value:'Check Gmail',mentions:[],attachmentIds:[],emailAttachments:[],emailUpdates:[],uploadedDocuments:[]},
   userMessage:{id:'user'},previousSelectedResponseId:null,activePromptAbortControllerRef:{current:requestController},requestController,
   promptSubmissionInFlightRef:{current:true},reconcileActiveCorrection:async()=>{},t:value=>value,
   forgetRequest:()=>{recoveryRef.current=null;state.RecoveryNeedsCheck=false;state.RecoveryNotice=null}}
  for(const setter of new Set(failure.match(/\bset[A-Z]\w+/g))) context[setter]=value=>{const key=setter.slice(3);state[key]=typeof value==='function'?value(state[key]):value}
  const fail=new Function(...Object.keys(context),`${code};return fail`)(...Object.values(context))
  await fail(new DexterApiError('Provider failed',safe))
  assert.equal(state.RecoveryNeedsCheck,!safe)
  assert.equal(state.IsSending,false)
  assert.equal(state.Error,'Provider failed')
  if(name==='submitPrompt')assert.equal(state.ComposerValue,'Check Gmail')
 }
})

test('an expired session refreshes once and resends the same rejected request',async()=>{
 const requests=[]
 let refreshes=0
 const {streamDexterMessage}=client(async(_url,request)=>{
  requests.push(request)
  return requests.length===1?new Response('',{status:401}):response([{type:'complete',conversation:{id:'saved',messages:[]}}])
 },{refreshWorkspaceSession:async()=>{refreshes++;return {data:{session:{access_token:'refreshed-session'}},error:null}}})
 assert.equal((await streamDexterMessage({message:'Check the record'},{})).id,'saved')
 assert.equal(refreshes,1)
 assert.equal(requests.length,2)
 assert.equal(requests[0].body,requests[1].body)
 assert.equal(requests[1].headers.Authorization,'Bearer refreshed-session')
})
test('non-authentication failures never silently replay a request',async()=>{
 for(const status of [403,409,429,500,503]){
  let calls=0
  const {streamDexterMessage}=client(async()=>{calls++;return new Response(JSON.stringify({message:'Request unavailable'}),{status})})
  await assert.rejects(streamDexterMessage({message:'Prepare a change'},{}))
  assert.equal(calls,1)
 }
})
test('a failed session refresh asks for sign-in and does not loop',async()=>{
 let calls=0
 const {streamDexterMessage}=client(async()=>{calls++;return new Response('',{status:401})},{refreshWorkspaceSession:async()=>({data:{session:null},error:new Error('expired')})})
 await assert.rejects(streamDexterMessage({message:'Check the record'},{}),/Sign in again/)
 assert.equal(calls,1)
})
