import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const load = async file => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(
  readFileSync(new URL(`../functions/agent-dexter/${file}`, import.meta.url), 'utf8'), { mode: 'transform' },
)).toString('base64')}`)
const { bookingDangerousGoodsActionReview: review } = await load('booking-dangerous-goods-review.ts')
const { resolveBookingDangerousGoodsWatchTarget: resolve } = await load('booking-dangerous-goods-watch.ts')
const cargoId = crypto.randomUUID(), jobId = crypto.randomUUID(), recordId = crypto.randomUUID()
const stamp = '2026-09-07T10:00:00Z'
const cargo = { recordId: cargoId, bookingId: jobId, sourceTable: 'Job_Cargo', bookingReference: 'QA-TEST',
  lineNumber: 2, updatedAt: stamp, cargoUpdatedAt: stamp, archived: false }
const record = { ...cargo, recordId, cargoId, sourceTable: 'Job_CargoDangerousGoods', bookingUpdatedAt: stamp,
  operatorEditable: true, source: 'operator', status: 'recorded', unNumber: '1234', sourceReference: 'Synthetic source',
  marinePollutant: null, limitedQuantity: false, notes: 'Retained', targetLabel: 'QA-TEST · Cargo 2 · 1234' }
const records = () => new Map([[cargoId, cargo], [recordId, record]])
const args = (changes, newRecord = false) => ({ target_id: jobId, cargo_id: cargoId, record_id: newRecord ? null : recordId,
  expected_updated_at: stamp, expected_cargo_updated_at: stamp, expected_record_updated_at: newRecord ? null : stamp,
  reason: 'Supplied evidence', changes })

test('Both actual response parsers preserve DG supplied strings before review and execution', () => {
  const index = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
  const helpers = index.slice(index.indexOf('function sanitiseArgumentValue('), index.indexOf('function actionCopy('))
  const blocks = [...index.matchAll(/let args: JsonObject = \{\}[\s\S]*?(?=\n      let toolOutput: unknown)/g)]
  assert.equal(blocks.length, 2)
  const supplied = '  Source — unchanged – café : : 原文  '
  for (const [path, match] of blocks.entries()) {
    const parse = new Function(stripTypeScriptTypes(`
      function parse(call) {
      const isObject = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);
      const cleanString = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0,max) : '';
      ${helpers}
      ${match[0]}
      return args;
      }
    `, {mode:'transform'})+'; return parse;')()
    const proposed = args([{field:'sourceReference',value:supplied},{field:'notes',value:'Line one\nLine two — retained'}])
    const parsed = parse({name:'record_booking_dangerous_goods',arguments:JSON.stringify(proposed)})
    assert.deepEqual(parsed,proposed,`response path ${path}: no prose punctuation rewrite in evidence`)
    const reviewed = review(records(),parsed)
    assert.equal(reviewed.changes[0].after,supplied.trim())
    assert.equal(reviewed.changes[1].after,'Line one\nLine two — retained')
    // This scoped correction must not silently alter Customs or other tool paths.
    assert.deepEqual(parse({name:'unrelated_existing_action',arguments:'{"value":"a — b"}'}),{value:'a: b'})
  }
})

test('DG review distinguishes unknown, No, Yes and explicit clear without claiming compliance', () => {
  const result = review(records(), args([{ field: 'marinePollutant', value: false }, { field: 'limitedQuantity', value: null }]))
  assert.deepEqual(result.changes.map(({ before, after }) => [before, after]), [[null, 'No'], ['No', null]])
  assert.match(result.title, /QA-TEST · Cargo 2/)
  assert.match(result.description, /not classification|not.*classification|—not classification/)
  assert.match(result.description, /cargo hazardous flag and customer Quotes stay unchanged/)
  assert.equal(review(records(), args([{ field: 'limitedQuantity', value: true }])).changes[0].after, 'Yes')
})

test('DG creation needs current exact cargo plus supplied identity and source', () => {
  const proposal = args([{ field: 'properShippingName', value: 'Synthetic supplied name' }, { field: 'sourceReference', value: 'Internal evidence' }], true)
  assert.match(review(records(), proposal).title, /^Record/)
  assert.throws(() => review(records(), args([{ field: 'unNumber', value: '1234' }], true)), /source reference/)
  assert.throws(() => review(new Map([[cargoId, { ...cargo, archived: true }]]), proposal), /retired/)
  assert.throws(() => review(records(), { ...proposal, expected_cargo_updated_at: 'stale' }), /exact current/)
})

test('DG review rejects stale, foreign, legacy, duplicate, unknown and malformed changes', () => {
  const proposal = args([{ field: 'marinePollutant', value: false }])
  for (const overrides of [{ bookingId: 'other' }, { source: 'legacy' }, { operatorEditable: false }, { updatedAt: 'stale' }, { cargoId: 'other' }]) {
    assert.throws(() => review(new Map([[recordId, { ...record, ...overrides }]]), proposal))
  }
  for (const changes of [[{ field: 'marinePollutant', value: 'false' }], [{ field: 'source', value: 'operator' }],
    [{ field: 'notes', value: 'a' }, { field: 'notes', value: 'b' }], [{ field: 'status', value: 'approved' }],
    [{ field: 'status', value: 'voided' }, { field: 'notes', value: 'Overwrite history' }]]) {
    assert.throws(() => review(records(), args(changes)))
  }
  assert.match(review(records(), args([{ field: 'status', value: 'voided' }])).title, /^Void/)
})

test('DG watch preserves explicit operator identity and returns source-backed label', async () => {
  const searches = []
  const result = await resolve(`Watch dangerous-goods record ${recordId} for QA-TEST cargo 2`,
    { id: '', search: 'incorrect combined description' }, async search => { searches.push(search); return { data: { data: [record] }, error: null } })
  assert.deepEqual(searches, [recordId])
  assert.deepEqual(result, { ok: true, targetId: recordId, targetLabel: record.targetLabel })
})

test('DG watch denies empty, ambiguous, wrong-source and retired targets', async () => {
  let calls = 0
  assert.equal((await resolve('', { id: '', search: '' }, async () => { calls++; return { data: {}, error: null } })).ok, false)
  assert.equal(calls, 0)
  for (const rows of [[], [record, record], [{ ...record, operatorEditable: false }], [{ ...record, sourceTable: 'Other' }], [{ ...record, recordId: crypto.randomUUID() }]]) {
    assert.equal((await resolve(`dangerous goods ${recordId}`, { id: recordId, search: '' }, async () => ({ data: { data: rows }, error: null }))).ok, false)
  }
})

test('Both Dexter response paths use DG source review and watch setup uses the signed-in resolver', () => {
  const index = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
  assert.equal(index.split('bookingDangerousGoodsActionReview(currentRecordsById, actionArguments)').length - 1, 2)
  assert.match(index, /resolveBookingDangerousGoodsWatchTarget\(prompt,[\s\S]*?userClient\.rpc\("multideck_dexter_query_domain"/)
  assert.match(index, /Ordinary chat must hand watch requests to Watchers/)
})
