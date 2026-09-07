import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { requiresExplicitActionApproval } from '../functions/agent-dexter/email-approval.mjs'
const load = async file => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(
  readFileSync(new URL(`../functions/agent-dexter/${file}`, import.meta.url), 'utf8'), { mode: 'transform' },
)).toString('base64')}`)
const { bookingSecurityEvidenceActionReview: review } = await load('booking-security-evidence-review.ts')
const { resolveBookingSecurityEvidenceWatchTarget: resolve } = await load('booking-security-evidence-watch.ts')
const cargoId = crypto.randomUUID(), jobId = crypto.randomUUID(), recordId = crypto.randomUUID()
const stamp = '2026-09-07T10:00:00Z'
const cargo = { recordId: cargoId, bookingId: jobId, sourceTable: 'Job_Cargo', bookingReference: 'QA-TEST',
  lineNumber: 2, updatedAt: stamp, cargoUpdatedAt: stamp, archived: false }
const record = { ...cargo, recordId, cargoId, sourceTable: 'booking_api.cargo_security_evidence', bookingUpdatedAt: stamp,
  operatorEditable: true, source: 'operator', recordStatus: 'recorded', securityStatus: ' Supplied ',
  screeningMethod: null, screenedByName: null, agentReference: null, screenedAt: null,
  sourceReference: ' Source ', notes: 'Retained', targetLabel: 'QA-TEST · Cargo 2 · Screening evidence' }
const records = () => new Map([[cargoId, cargo], [recordId, record]])
const args = (changes, fresh = false) => ({ target_id: jobId, cargo_id: cargoId, record_id: fresh ? null : recordId,
  expected_updated_at: stamp, expected_cargo_updated_at: stamp, expected_record_updated_at: fresh ? null : stamp,
  reason: '  Supplied evidence – exact reason  ', changes })

test('Both source-evidence actions require approval even in Full access', () => {
  for (const action of ['record_booking_dangerous_goods', 'record_booking_security_evidence']) {
    for (const mode of ['approve', 'full']) assert.equal(requiresExplicitActionApproval(action, mode), true)
  }
})

test('Both actual response parsers preserve screening source strings before review', () => {
  const index = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
  const helpers = index.slice(index.indexOf('function sanitiseArgumentValue('), index.indexOf('function actionCopy('))
  const blocks = [...index.matchAll(/let args: JsonObject = \{\}[\s\S]*?(?=\n      let toolOutput: unknown)/g)]
  assert.equal(blocks.length, 2)
  for (const [path, match] of blocks.entries()) {
    const parse = new Function(stripTypeScriptTypes(`function parse(call) {
      const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
      const cleanString = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
      ${helpers}
      ${match[0]}
      return args;
    }`, {mode:'transform'})+'; return parse;')()
    const supplied='  Source – café : : 原文\nLine two  '
    const proposal=args([{field:'sourceReference',value:supplied}])
    const parsed=parse({name:'record_booking_security_evidence',arguments:JSON.stringify(proposal)})
    assert.deepEqual(parsed,proposal,`parser ${path}`)
    assert.equal(review(records(),parsed).changes[0].after,supplied)
    assert.deepEqual(parse({name:'unrelated_existing_action',arguments:'{"value":"a – b"}'}),{value:'a: b'})
  }
  assert.equal(index.split('bookingSecurityEvidenceActionReview(currentRecordsById, actionArguments)').length-1,2)
})

test('Screening review preserves source text and distinguishes unknown from supplied status', () => {
  const supplied = '  Source – café : : 原文\nSecond line  '
  const result = review(records(), args([{field:'sourceReference',value:supplied},{field:'screeningMethod',value:'As supplied'}]))
  assert.equal(result.changes[0].before, ' Source ')
  assert.equal(result.changes[0].after, supplied)
  assert.equal(result.changes[1].before, null)
  assert.match(result.description, /not clearance/)
  assert.ok(result.description.endsWith(args([]).reason))
  assert.equal(review(records(),args([{field:'notes',value:null}])).changes[0].after,null)
})
test('Screening creation requires active exact cargo plus supplied evidence and source', () => {
  const proposal = args([{field:'screeningMethod',value:' Supplied method '},{field:'sourceReference',value:' Source '}],true)
  assert.match(review(records(),proposal).title,/^Record QA-TEST · Cargo 2/)
  assert.throws(()=>review(records(),args([{field:'securityStatus',value:'Supplied'}],true)),/source reference/)
  assert.throws(()=>review(new Map([[cargoId,{...cargo,archived:true}]]),proposal),/Retired/)
  assert.throws(()=>review(records(),{...proposal,expected_cargo_updated_at:'stale'}),/exact current/)
})
test('Screening review denies stale, foreign, missing-before, malformed and retired evidence', () => {
  const proposal=args([{field:'notes',value:'Updated'}])
  for(const overrides of [{bookingId:'other'},{cargoId:'other'},{updatedAt:'stale'},
    {source:'legacy'},{operatorEditable:false},{recordStatus:'voided'},{notes:undefined}]) {
    assert.throws(()=>review(new Map([[recordId,{...record,...overrides}]]),proposal))
  }
  for(const changes of [[{field:'notes',value:false}],[{field:'notes',value:'x'.repeat(8001)}],
    [{field:'sourceReference',value:null}],[{field:'recordStatus',value:'cleared'}],
    [{field:'notes',value:'a'},{field:'notes',value:'b'}],[{field:'source',value:'operator'}],
    [{field:'notes',value:'a',extra:true}],[{field:'recordStatus',value:'voided'},{field:'notes',value:'overwrite'}]]) {
    assert.throws(()=>review(records(),args(changes)))
  }
  assert.match(review(records(),args([{field:'recordStatus',value:'voided'}])).title,/^Void/)
})
test('Screening watch uses explicit evidence ID and source-backed label', async () => {
  const searches=[]
  const result=await resolve(`Watch screening evidence record ${recordId}`,{id:'',search:'wrong combined description'},
    async search=>{searches.push(search);return {data:{data:[record]},error:null}})
  assert.deepEqual(searches,[recordId])
  assert.deepEqual(result,{ok:true,targetId:recordId,targetLabel:record.targetLabel})
})
test('Screening watch rejects ambiguous, inaccessible, substituted and voided targets', async () => {
  let calls=0
  const query=async()=>{calls++;return {data:{data:[record]},error:null}}
  assert.equal((await resolve('',{id:'',search:''},query)).ok,false)
  assert.equal((await resolve(`screening ${recordId} and screening ${crypto.randomUUID()}`,{id:'',search:''},query)).ok,false)
  assert.equal(calls,0)
  for(const rows of [[],[record,record],[{...record,recordStatus:'voided'}],[{...record,operatorEditable:false}],
    [{...record,sourceTable:'Other'}],[{...record,recordId:crypto.randomUUID()}]]) {
    assert.equal((await resolve(`screening ${recordId}`,{id:recordId,search:''},async()=>({data:{data:rows},error:null}))).ok,false)
  }
  assert.equal((await resolve(`screening ${recordId}`,{id:recordId,search:''},async()=>({data:{data:[record]},error:'denied'}))).ok,false)
})
