import './register-typescript.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
const {dealSalesActionReview}=await import('../functions/agent-dexter/deal-sales-review.ts')
const deal={recordId:'deal',sourceTable:'CRM_Opportunities',name:'Weekly freight',editVersion:3,ownerName:'Alex',primaryContactName:'Sam',nextAction:{id:'action',title:'Call the buyer',ownerName:'Alex',dueAt:'2026-10-01T09:00:00Z',type:'call'},people:{owners:[{id:'owner',name:'Jordan'}],contacts:[{id:'contact',name:'Pat'}]}}
const records=new Map([['deal',deal]])
test('deal sales approval resolves assignment names and separates existing task ownership',()=>{
  const result=dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'assign',input:{ownerId:'owner'}})
  assert.equal(result.changes[0].before,'Alex');assert.equal(result.changes[0].after,'Jordan');assert.match(result.description,/keeps its own assignee/)
  assert.throws(()=>dealSalesActionReview(records,{target_id:'deal',expected_version:2,operation:'assign',input:{ownerId:'owner'}}))
  assert.throws(()=>dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'assign',input:{ownerId:'unknown'}}))
})
test('next action and completion approvals show the actual commitment and outcome',()=>{
  const result=dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'set_next_action',input:{title:'Confirm volumes',type:'email',ownerId:'owner',dueAt:'2026-10-02T10:00:00Z'}})
  assert.equal(result.changes.find(c=>c.field==='Assigned to').after,'Jordan');assert.match(result.description,/replaced/)
  const done=dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'complete_next_action',input:{actionId:'action',note:'Agreed next month'}})
  assert.match(done.description,/Call the buyer/);assert.equal(done.changes[1].after,'Agreed next month')
  assert.throws(()=>dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'complete_next_action',input:{actionId:'old'}}))
})
test('lost approval includes reason and revisit consequences without claiming customer conversion',()=>{
  const lost=dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'mark_lost',input:{reasonCode:'timing',revisitDate:'2026-12-01'}})
  assert.match(lost.description,/cancel its current next action/);assert.match(lost.description,/revisit task/)
  assert.equal(lost.changes.find(c=>c.field==='Loss reason').after,'Timing')
  assert.throws(()=>dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'mark_lost',input:{reasonCode:'other'}}))
})
test('reopening approval requires a lost deal, a read open stage and a reason',()=>{
  const lost={...deal,isLost:true,pipelineId:'pipeline',pipelineStageName:'Lost'}
  const stage={sourceTable:'CRM_PipelineStages',pipelineId:'pipeline',name:'Qualification',isConversion:false}
  const authorised=new Map([['deal',lost],['stage',stage]])
  const args={target_id:'deal',expected_version:3,operation:'reopen',input:{pipelineStageId:'stage',reason:'Buyer has renewed the project'}}
  const review=dealSalesActionReview(authorised,args)
  assert.match(review.description,/previous loss remains/)
  assert.equal(review.changes.find(c=>c.field==='Stage').after,'Qualification')
  for(const invalid of [new Map([['deal',deal],['stage',stage]]),new Map([['deal',lost],['stage',{...stage,pipelineId:'foreign'}]]),new Map([['deal',lost],['stage',{...stage,isConversion:true}]])]) assert.throws(()=>dealSalesActionReview(invalid,args))
  assert.throws(()=>dealSalesActionReview(authorised,{...args,input:{...args.input,reason:''}}))
})

test('next-action preparation rejects missing owners, ambiguous times and invalid task dates before approval',()=>{
 const input={title:'Confirm volumes',type:'call',ownerId:'owner',dueAt:'2026-10-02T23:30:00Z'}
 const review=(patch)=>dealSalesActionReview(records,{target_id:'deal',expected_version:3,operation:'set_next_action',input:{...input,...patch}})
 for(const patch of [{ownerId:null},{ownerId:''},{ownerId:'unknown'},{title:'x'.repeat(241)},{dueAt:'2026-02-30T09:00:00Z'},{dueAt:'2026-10-02T23:30:00'},{taskDate:'2026-02-30'},{taskDate:'2026-10-07'}]) assert.throws(()=>review(patch))
 assert.equal(review({}).changes.find(change=>change.field==='Task date').after,'2026-10-02')
 assert.equal(review({taskDate:'2026-10-03'}).changes.find(change=>change.field==='Task date').after,'2026-10-03')
})
