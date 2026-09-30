import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/watch-definition.ts', import.meta.url), 'utf8'))
const { chooseWatchRecord, validateWatchRule } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const label = record => record.name
const records = [
  {recordId:'11111111-1111-4111-8111-111111111111',name:'Acme'},
  {recordId:'22222222-2222-4222-8222-222222222222',name:'Acme Freight'},
  {recordId:'33333333-3333-4333-8333-333333333333',name:'Acme Logistics'},
]

test('watch targets require one exact visible record, even when search returns similar names', () => {
  assert.equal(chooseWatchRecord(records,'Acme','',new Set(),label).record?.recordId,records[0].recordId)
  assert.equal(chooseWatchRecord(records,'Acme Fr','',new Set(),label).record,null)
  assert.equal(chooseWatchRecord([records[1]],'Acme','',new Set(),label).record,null)
  assert.equal(chooseWatchRecord([records[0],records[0]],'Acme','',new Set(),label).record,null)
  assert.equal(chooseWatchRecord(records,'',records[1].recordId,new Set([records[1].recordId]),label).record?.recordId,records[1].recordId)
  assert.equal(chooseWatchRecord(records,'',records[1].recordId,new Set(),label).record,null)
  assert.equal(chooseWatchRecord(records,'',records[1].recordId,new Set([records[0].recordId]),label).record,null)
})

test('named tasks and customs declarations cannot silently become broad watches', () => {
  const tasks = [
    {recordId:records[0].recordId,title:'Call Acme'},
    {recordId:records[1].recordId,title:'Call Acme Freight'},
  ]
  assert.equal(chooseWatchRecord(tasks,'Call Acme','',new Set(),record => record.title).record?.recordId,tasks[0].recordId)
  assert.equal(chooseWatchRecord(tasks,'Call Ac','',new Set(),record => record.title).record,null)
  const declarations = [
    {recordId:records[0].recordId,reference:'CDS-100'},
    {recordId:records[1].recordId,reference:'CDS-100-A'},
  ]
  assert.equal(chooseWatchRecord(declarations,'CDS-100','',new Set(),record => record.reference).record?.recordId,declarations[0].recordId)
  assert.equal(chooseWatchRecord(declarations,'CDS-10','',new Set(),record => record.reference).record,null)
})

test('arbitrary candidate order and distractors never change an exact target', () => {
  let seed = 124321
  const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 2 ** 32)
  for (let run = 0; run < 1_000; run++) {
    const shuffled = [...records, ...Array.from({length:Math.floor(random()*12)},(_,i) =>
      ({recordId:`extra-${run}-${i}`,name:`Acme ${run}-${i}`}))].sort(() => random()-0.5)
    assert.equal(chooseWatchRecord(shuffled,'Acme','',new Set(),label).record?.recordId,records[0].recordId)
  }
})

test('invalid or empty watch conditions ask for clarification before saving', () => {
  const fields = ['status','amount']
  assert.equal(validateWatchRule(fields,'status','changed',''),null)
  assert.match(validateWatchRule(fields,'missing','eq','open'),/field/)
  assert.match(validateWatchRule(fields,'status','contains',''),/value/)
  assert.match(validateWatchRule(fields,'amount','gt','1 day'),/number/)
  assert.match(validateWatchRule(fields,'amount','gte','NaN'),/number/)
  assert.equal(validateWatchRule(fields,'amount','gte','12.5'),null)
  assert.match(validateWatchRule(fields,'status','unsupported','open'),/condition/)
})
