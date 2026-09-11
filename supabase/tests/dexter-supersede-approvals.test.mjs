import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/supersede-approvals.ts',import.meta.url),'utf8'))
const {supersedeApprovals}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const actor={userId:'u',companyId:'c'}
const row=(id,fields={})=>({AIDexterPrepared_ID:id,AIDexterPrepared_UserID:'u',AIDexterPrepared_CompanyID:'c',AIDexterPrepared_ClientSessionID:'s',AIDexterPrepared_ConversationID:null,AIDexterPrepared_Status:'prepared',...fields})
function db(rows){const audit=[];return {audit,from:table=>{
 let patch,conditions=[]
 const query={update:value=>(patch=value,query),in:(field,values)=>(conditions.push(row=>values.includes(row[field])),query),
 eq:(field,value)=>(conditions.push(row=>row[field]===value),query),is:(field,value)=>(conditions.push(row=>row[field]===value),query),
 select:()=>query,order:()=>query,limit:()=>query,gt:(field,value)=>(conditions.push(row=>row[field]>value),query),
 then:(resolve,reject)=>Promise.resolve().then(()=>{const selected=rows.filter(row=>conditions.every(condition=>condition(row)));selected.forEach(row=>Object.assign(row,patch));return {data:selected,error:null}}).then(resolve,reject),
 insert:async value=>{assert.equal(table,'AI_DexterSecurityEvents');audit.push(value);return {error:null}},
 };return query
 }}}
test('corrections expire only this run’s unclaimed approvals, retaining executing and completed actions',async()=>{
 const rows=[row('own'),row('executing',{AIDexterPrepared_Status:'executing'}),row('done',{AIDexterPrepared_Status:'succeeded'}),
 row('foreign-user',{AIDexterPrepared_UserID:'other'}),row('foreign-company',{AIDexterPrepared_CompanyID:'other'}),
 row('foreign-session',{AIDexterPrepared_ClientSessionID:'other'}),row('foreign-conversation',{AIDexterPrepared_ConversationID:'other'}),row('not-requested')]
 const admin=db(rows),context={conversationId:null,clientSessionId:'s',actionIds:rows.slice(0,-1).map(row=>row.AIDexterPrepared_ID)}
 assert.deepEqual(await supersedeApprovals(admin,actor,context),['own'])
 assert.equal(rows[0].AIDexterPrepared_Status,'expired');assert.equal(rows[0].AIDexterPrepared_ErrorCode,'dexter_request_revised')
 assert.equal(rows[1].AIDexterPrepared_Status,'executing');assert.equal(rows[2].AIDexterPrepared_Status,'succeeded')
 assert.ok(rows.slice(3).every(row=>row.AIDexterPrepared_Status==='prepared'))
 assert.deepEqual(admin.audit[0].AIDexterSecurityEvent_MetadataJSON.preparedActionIds,['own'])
 assert.deepEqual(await supersedeApprovals(admin,actor,context),[]);assert.equal(admin.audit.length,1)
})

const reviewSource=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/pending-approval-review.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,''))
const pendingApprovalReview=new Function('supersedeApprovals',reviewSource.replace(/export /g,'')+';return pendingApprovalReview')(supersedeApprovals)
test('follow-up withdrawal requires an observed owned proposal and preserves unrelated work',async()=>{
 const make=(id,patch={})=>row(id,{AIDexterPrepared_ConversationID:'chat',AIDexterPrepared_ExpiresAt:'2999-01-01',...patch})
 const rows=[make('chosen'),make('unrelated'),make('other-user',{AIDexterPrepared_UserID:'other'}),make('other-company',{AIDexterPrepared_CompanyID:'other'}),make('other-chat',{AIDexterPrepared_ConversationID:'other'}),make('old',{AIDexterPrepared_ExpiresAt:'2000-01-01'}),make('done',{AIDexterPrepared_Status:'succeeded'})]
 const admin=db(rows),review=pendingApprovalReview(admin,actor,'chat')
 assert.ok((await review('withdraw_pending_approval',{approval_id:'chosen'})).error)
 const listed=await review('list_pending_approvals',{})
 assert.deepEqual(listed.approvals.map(x=>x.id),['chosen','unrelated'])
 assert.equal(JSON.stringify(listed).includes('ClientSession'),false)
 assert.ok((await review('withdraw_pending_approval',{approval_id:'other-user'})).error)
 assert.equal((await review('withdraw_pending_approval',{approval_id:'chosen'})).withdrawn,true)
 assert.equal(rows[0].AIDexterPrepared_Status,'expired')
 assert.equal(rows[1].AIDexterPrepared_Status,'prepared')
 assert.equal(admin.audit.length,1)
 rows[1].AIDexterPrepared_Status='executing'
 assert.ok((await review('withdraw_pending_approval',{approval_id:'unrelated'})).error)
 assert.equal(rows[1].AIDexterPrepared_Status,'executing')
 assert.ok((await pendingApprovalReview(admin,actor,null)('list_pending_approvals',{})).error)
})
