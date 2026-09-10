import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const read = name => readFileSync(new URL(`../functions/agent-dexter/${name}.ts`,import.meta.url),'utf8')
const code = stripTypeScriptTypes(read('deferred-work'))
const {createDeferredWork,resolveDeferredWork} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const source=stripTypeScriptTypes(read('conversation-artifacts')).replace(/^import .*$/gm,'').replace('export async function','async function')
const hydrate = new Function('createDeferredWork',`${source};return hydrateConversationArtifacts`)(createDeferredWork)
function fixture(owned=true,dependencies=['a']) {
 const filters=[]
 const action={id:'a',title:'First',description:'',changes:[]}
 const rows={AI_Conversations:{AICNV_ID:'chat'},AI_Messages:[{AIMSG_ID:'m',AIMSG_ContentJSON:{metadata:{pendingActions:[action],deferredWork:{label:'Next',request:'Read current company and prepare postcode.',afterActionIds:dependencies}}}},{AIMSG_ID:'done',AIMSG_ContentJSON:{metadata:{actionDecision:true,continuationMessageId:"m"}}}],AI_DexterPreparedActions:[{AIDexterPrepared_ID:'a',AIDexterPrepared_Status:'succeeded'}]}
 const admin={from(table){const q={select(){return q},eq(key,value){filters.push([table,key,value]);return q},in(){return q},maybeSingle:async()=>({data:owned?rows[table]:null,error:null}),then(resolve){return Promise.resolve({data:rows[table],error:null}).then(resolve)}};return q}}
 return {admin,filters,conversation:{id:'chat',messages:[{id:'m',role:'assistant'},{id:'decision',role:'user'},{id:'done',role:'assistant',responseToUserMessageId:'decision'}]}}
}
test('owned reload retains dependency plan, ledger success and approval identity',async()=>{
 const f=fixture();const result=await hydrate(f.admin,{companyId:'company',userId:'user'},f.conversation)
 assert.deepEqual(result.messages[0].deferredWork.afterActionIds,['a'])
 assert.equal(result.messages[0].pendingActions[0].status,'succeeded')
 assert.equal(result.messages[2].isActionDecision,true)
 assert.equal(result.messages[2].continuationMessageId,"m")
 assert.equal(result.messages[2].responseToUserMessageId,'decision')
 assert.ok(f.filters.some(v=>v[1]==='AIDexterPrepared_CompanyID'&&v[2]==='company'))
 assert.ok(f.filters.some(v=>v[1]==='AIDexterPrepared_UserID'&&v[2]==='user'))
})
test('unowned conversation cannot expose a plan; foreign dependency metadata is discarded',async()=>{
 const denied=fixture(false);await assert.rejects(hydrate(denied.admin,{companyId:'company',userId:'user'},denied.conversation),/conversation_unavailable/)
 const f=fixture(true,['foreign']);const result=await hydrate(f.admin,{companyId:'company',userId:'user'},f.conversation)
 assert.equal(result.messages[0].deferredWork,null)
})


test('continuation resolves hidden instructions only after owned ledger dependencies succeed',async()=>{
 const rows={AI_Conversations:{AICNV_ID:'chat'},AI_Messages:{AIMSG_ContentJSON:{metadata:{pendingActions:[{id:'a'}],deferredWork:{label:'Next',request:'Read company A then prepare the postcode.',afterActionIds:['a']}}}},AI_DexterPreparedActions:[{AIDexterPrepared_ID:'a',AIDexterPrepared_Status:'succeeded'}]}
 const filters=[]
 const admin={from(table){const q={select(){return q},eq(key,value){filters.push([table,key,value]);return q},in(){return q},maybeSingle:async()=>({data:rows[table],error:null}),then(resolve){return Promise.resolve({data:rows[table],error:null}).then(resolve)}};return q}}
 assert.equal((await resolveDeferredWork(admin,{companyId:'company',userId:'user'},'chat','source')).request,'Read company A then prepare the postcode.')
 assert.ok(filters.some(v=>v[0]==='AI_Messages'&&v[1]==='AIMSG_ConversationID'&&v[2]==='chat'))
 assert.ok(filters.some(v=>v[0]==='AI_DexterPreparedActions'&&v[1]==='AIDexterPrepared_UserID'&&v[2]==='user'))
 for (const status of ['prepared','declined','failed','expired']) {
  rows.AI_DexterPreparedActions[0].AIDexterPrepared_Status=status
  await assert.rejects(resolveDeferredWork(admin,{companyId:'company',userId:'user'},'chat','source'),/continuation_not_ready/)
 }
 rows.AI_DexterPreparedActions[0].AIDexterPrepared_Status="succeeded"
 rows.AI_Messages.AIMSG_ContentJSON.metadata.deferredWorkDismissedAt="2026-09-10T01:00:00Z"
 await assert.rejects(resolveDeferredWork(admin,{companyId:"company",userId:"user"},"chat","source"),/continuation_unavailable/)
 rows.AI_Conversations=null
 await assert.rejects(resolveDeferredWork(admin,{companyId:'company',userId:'user'},'chat','source'),/continuation_unavailable/)
})
