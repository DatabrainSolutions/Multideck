import assert from 'node:assert/strict'
import test from 'node:test'
import {presentDexterApproval, formatDexterApprovalValue} from '../src/lib/dexter-approval-presentation.ts'

const id = 'c38b47bc-2ea6-472b-ae28-318a66abf0d5'
test('the reported saved next-action approval shows readable fields without raw JSON or version tokens', () => {
  const review = presentDexterApproval([
    {field: 'Input', value: JSON.stringify({type:'follow_up', dueAt:'2026-09-22T16:24:12+00:00', title:'Confirm scope', ownerId:id, taskDate:'2026-09-22'})},
    {field: 'Operation', value: 'set_next_action'}, {field: 'Expected Version', value: '22'},
  ])
  assert.deepEqual(review.changes.map(change => change.field), ['Action type', 'Due', 'Next action', 'Assigned to', 'Task date', 'Change'])
  assert.equal(review.changes[0].after, 'Follow up')
  assert.equal(review.changes[2].after, 'Confirm scope')
  assert.equal(review.changes.at(-1)?.after, 'Set next action')
  assert.ok(review.issue, 'a missing assignee name requires a new review, never a guessed name')
  assert.ok(review.changes.every(change => !change.after?.includes(id) && !change.after?.includes('{')))
  assert.ok(review.changes.every(change => !change.beforeKnown))
})
test('a verified new proposal retains names, exact before and after values, and needs no repair', () => {
  const changes = [{field:'Assigned to', before:'Alex', after:'Jordan', value:'Jordan', beforeKnown:true, kind:'changed' as const}]
  assert.deepEqual(presentDexterApproval(changes), {changes, issue:null})
  assert.equal(changes[0].before, 'Alex')
})
test('explicit clearing takes precedence over a stale legacy value', () => {
  const review = presentDexterApproval([{field:'Main contact', before:'Sam', after:null, value:'Sam', kind:'removed'}])
  assert.equal(review.changes[0].after, null)
  assert.equal(review.changes[0].kind, 'removed')
})
test('false, zero, empty values and original-language content remain distinct', () => {
  const review = presentDexterApproval([{field:'Input', value:JSON.stringify({enabled:false, amount:0, notes:'Merci, à demain', reference:null})}])
  assert.deepEqual(review.changes.map(change => change.after), ['No','0','Merci, à demain',null])
  assert.equal(review.issue, null)
})
test('nested rows expand without losing changed or removed details', () => {
  const review = presentDexterApproval([{field:'Goods', before:'[{"description":"Old","quantity":2}]', after:'[{"description":"New","quantity":0}]', value:'', beforeKnown:true}])
  assert.deepEqual(review.changes.map(change=>[change.before,change.after]), [['Old','New'],['2','0']])
  assert.equal(review.issue,null)
})
test('malformed or excessively nested saved proposals do not crash or become approvable', () => {
  assert.ok(presentDexterApproval([{field:'Input',value:'{invalid'}]).issue)
  assert.ok(presentDexterApproval([{field:'Input',value:'{"a":{"b":{"c":{"d":{"e":{"f":"value"}}}}}}'}]).issue)
})
test('both English locales format due times and calendar dates, while preserving ordinary text', () => {
  for (const language of ['en-GB','en-US']) {
    const due=formatDexterApprovalValue('2026-09-22T16:24:12+00:00',language)
    assert.ok(!due.includes('T16:24'))
    assert.match(due,/2026/)
    assert.equal(formatDexterApprovalValue('2026-09-22',language),language==='en-GB'?'22 Sept 2026':'Sep 22, 2026')
    assert.equal(formatDexterApprovalValue('Customer reference 2026-09-22',language),'Customer reference 2026-09-22')
    assert.equal(formatDexterApprovalValue('Not a date',language),'Not a date')
  }
})

test('ordinary bracketed notes stay literal and oversized nested details stay bounded',()=>{
 const note='[Awaiting confirmation] Please call back'
 assert.equal(presentDexterApproval([{field:'Notes',value:note}]).changes[0].after,note)
 const large=presentDexterApproval([{field:'Input',value:JSON.stringify({items:Array.from({length:100},(_,i)=>({title:`Item ${i}`}))})}])
 assert.ok(large.issue)
 assert.ok(large.changes.length<=60)
})

test('impossible historical dates never silently become a different commitment',()=>{
 for(const value of ['2026-02-30','2026-02-30T09:00:00Z','2026-99-22']) {
  assert.equal(formatDexterApprovalValue(value,'en-GB'),value)
  assert.ok(presentDexterApproval([{field:'Due',value}]).issue)
 }
})
