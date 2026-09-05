import assert from 'node:assert/strict'
import test from 'node:test'
import { cargo, documentCargo, mapping, workspace, fixtureLines, openOnce } from './quote-cargo-client-fixture.mjs'

test('replayed new-Quote creation awaits the same request instead of allocating another reference', async () => {
  const ref = { current: null }
  let calls = 0, finish
  const rpc = () => { calls += 1; return new Promise(resolve => { finish = resolve }) }
  const first = openOnce(ref, rpc), replay = openOnce(ref, rpc)
  assert.equal(calls, 1)
  finish({ reference: 'Q-ONE' })
  assert.deepEqual(await Promise.all([first, replay]), [{ reference: 'Q-ONE' }, { reference: 'Q-ONE' }])
  ref.current = null // Leaving /quotes/new starts a different creation lifecycle.
  const next = openOnce(ref, rpc)
  assert.equal(calls, 2)
  finish({ reference: 'Q-TWO' })
  assert.equal((await next).reference, 'Q-TWO')
})

test('real Quote load/save mapping retains every cargo field, stable ID and order', () => {
  const lines = fixtureLines()
  const original = workspace({ cargoLines: lines, goodsValue: '60000.1250', goodsValueCurrency: 'EUR', packageQuantity: '999', commodity: 'Stale summary', grossWeightKg: '9000' })
  const before = structuredClone(original)
  const loaded = mapping.quoteRecordFromWorkspace(original, null)
  const payload = mapping.quoteSavePayload(loaded, [], null)
  assert.deepEqual(payload.shipmentFacts.cargoLines, lines)
  assert.deepEqual(original, before, 'Mapping must not mutate authoritative evidence')
  assert.equal(payload.shipmentFacts.packageQuantity, '5')
  assert.equal(payload.shipmentFacts.grossWeightKg, '100.3')
  assert.equal(payload.shipmentFacts.volumeCbm, '0.000003')
  assert.equal(payload.shipmentFacts.commodity, 'Machine parts')
  assert.equal(payload.shipmentFacts.packageType, undefined, 'Mixed package types have no invented common type')
  assert.equal(payload.shipmentFacts.goodsValue, '60000.1250')
  assert.equal(payload.shipmentFacts.goodsValueCurrency, 'EUR')
  const reloaded = mapping.quoteRecordFromWorkspace(workspace(payload.shipmentFacts), null)
  assert.deepEqual(reloaded.cargoLines, lines)
  const reversed = mapping.quoteSavePayload({ ...reloaded, cargoLines: [...reloaded.cargoLines].reverse() }, [], null)
  assert.deepEqual(reversed.shipmentFacts.cargoLines.map(line => line.id), lines.map(line => line.id).reverse())
})

test('empty structured drafts stay explicit; legacy Quotes are not silently converted', () => {
  const empty = mapping.quoteRecordFromWorkspace(workspace({ cargoLines: [], packageQuantity: '999' }), null)
  const payload = mapping.quoteSavePayload(empty, [], null)
  assert.deepEqual(payload.shipmentFacts.cargoLines, [])
  assert.equal(payload.shipmentFacts.packageQuantity, undefined)
  const legacy = mapping.quoteRecordFromWorkspace(workspace({ packageQuantity: '9', packageType: 'Cartons' }), null)
  assert.equal(legacy.cargoLines, undefined)
  const saved = mapping.quoteSavePayload(legacy, [], null)
  assert.equal(Object.hasOwn(saved.shipmentFacts, 'cargoLines'), false)
  assert.equal(saved.shipmentFacts.packageQuantity, '9')
})

test('unknown fields and invalid IDs fail visibly instead of being dropped on the next save', () => {
  const line = fixtureLines()[0]
  for (const value of [null, {}, [null], [{ ...line, id: 'not-an-id' }], [line, { ...line, id: line.id.toUpperCase() }], [{ ...line, futureField: 'must not disappear' }], [{ ...line, description: {} }], [{ ...line, volumeCbm: {} }], [{ ...line, isHazardous: 'false' }], [{ ...line, lengthUnit: 'feet' }]]) {
    assert.throws(() => mapping.quoteRecordFromWorkspace(workspace({ cargoLines: value }), null))
  }
  assert.equal(cargo.readQuoteCargoLines(Array.from({ length: 500 }, cargo.newQuoteCargoLine)).length, 500)
  assert.throws(() => cargo.readQuoteCargoLines(Array.from({ length: 501 }, cargo.newQuoteCargoLine)))
})

test('complete totals use exact decimals; unknown and temporarily invalid input is not a zero', () => {
  const [first, second] = fixtureLines()
  for (const [a, b, expected] of [['0', '0', '0'], ['0.1', '0.2', '0.3'], ['999999999998.999999', '0.000001', '999999999999'], ['00100.00', '000.000', '100']]) {
    const lines = [{ ...first, grossWeightKg: a }, { ...second, grossWeightKg: b }]
    assert.equal(cargo.quoteCargoSummary(lines).grossWeightKg, expected)
    assert.equal(documentCargo.quoteDocumentCargoTotals({ cargoLines: lines }).grossWeightKg, expected)
  }
  for (const value of ['', ' ', '-', '1.', '-2', 'Infinity', '1e2', '1,000', '9'.repeat(33)]) {
    assert.equal(cargo.quoteCargoSummary([{ ...first, grossWeightKg: value }, second]).grossWeightKg, '')
  }
})

test('real customer PDF projection receives all saved goods and no internal commercial fields', () => {
  const lines = fixtureLines()
  const payload = mapping.quoteSavePayload({ ...mapping.newQuoteDraft, cargoLines: lines, goodsValue: '5000', internalNotes: 'Private margin discussion' }, [], null)
  const output = documentCargo.quoteDocumentCargo(payload.shipmentFacts)
  assert.equal(output.length, 2)
  assert.equal(output[0].description, lines[0].description)
  assert.match(output[0].measurements, /120 × 80 × 90 cm/)
  assert.match(output[0].weights, /Net 90.005 kg/)
  assert.match(output[1].details, /Hazardous · Temperature controlled/)
  assert.equal(JSON.stringify(output).includes('Private margin discussion'), false)
  assert.deepEqual(documentCargo.quoteDocumentCargoTotals(payload.shipmentFacts), { packageQuantity: '5', grossWeightKg: '100.3', volumeCbm: '0.000003' })
})

test('line safety is visible in shipment labels without becoming a sticky manual choice', () => {
  const lines = fixtureLines()
  const draft = { ...mapping.newQuoteDraft, cargoLines: lines, cargoCharacteristics: 'Fragile', knownCargo: 'General merchandise' }
  const saved = mapping.quoteSavePayload(draft, [], null)
  assert.equal(saved.shipmentFacts.knownCargo, 'Hazardous; Temperature controlled; Fragile')
  assert.equal(saved.shipmentFacts.cargoCharacteristics, 'Fragile')
  assert.deepEqual(cargo.quoteCargoSafety(lines), { hazardous: true, temperatureControlled: true })
  const reloaded = mapping.quoteRecordFromWorkspace(workspace(saved.shipmentFacts), null)
  const removed = mapping.quoteSavePayload({ ...reloaded, cargoLines: [lines[0]] }, [], null)
  assert.equal(removed.shipmentFacts.knownCargo, 'Fragile')
  assert.equal(removed.shipmentFacts.cargoCharacteristics, 'Fragile')
  assert.equal(cargo.quoteCargoHandlingSummary([], 'Hazardous; Sensitive consignment'), 'Hazardous; Sensitive consignment')
  assert.equal(cargo.quoteCargoHandlingSummary(lines, 'Hazardous; Fragile'), 'Hazardous; Temperature controlled; Fragile')
  assert.equal(cargo.quoteCargoHandlingSummary([], 'General cargo'), 'General merchandise')
  assert.equal(documentCargo.quoteDocumentHandling({ cargoLines: lines, cargoCharacteristics: 'Fragile', knownCargo: 'General merchandise' }), 'Hazardous; Temperature controlled; Fragile')
  assert.equal(documentCargo.quoteDocumentHandling({ cargoLines: [], cargoCharacteristics: 'Hazardous; PRIVATE COST' }), 'Hazardous')
  assert.equal(documentCargo.quoteDocumentHandling({}), 'No special handling recorded')
  assert.throws(() => documentCargo.quoteDocumentHandling({ cargoLines: [{ isHazardous: 'false' }] }))
})
