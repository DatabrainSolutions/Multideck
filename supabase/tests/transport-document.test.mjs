import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../functions/_shared/transport-document.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports })
const { completeDecimalTotal, transportDocumentDataset } = module.exports
const source = () => ({
  job: { bookingReference: 'DEMO-001' }, company: { name: 'Example Freight Ltd' },
  shipper: { name: 'Example Manufacturing Ltd', address: '1 Fictional Street, Demo City' },
  consignee: { name: 'Example Receiver Ltd', address: '2 Fictional Avenue, Demo Town' },
  routing: [{ id: 'route-1', mode: 'sea', isMainCarriage: true, carrierName: 'Example Carrier', origin: { name: 'Felixstowe', unlocode: 'GBFXT' }, destination: { name: 'Demo destination' } }],
  cargo: [{ id: 'cargo-1', lineNumber: 1, description: 'Fictional machine parts', packageQuantity: '40.000000', grossWeight: '40000.00' }],
  equipment: [{ id: 'unit-1', kind: 'container', number: 'DEMO-CTR-001', type: '40GP' }, { id: 'unit-2', kind: 'container', type: '40GP' }],
  allocations: [{ cargoId: 'cargo-1', containerId: 'unit-1', packageQuantity: '18' }, { cargoId: 'cargo-1', containerId: 'unit-2', packageQuantity: '22' }],
})

test('split cargo retains both equipment rows and quantities without inventing weight or VGM', () => {
  const data = transportDocumentDataset(source(), 'sea')
  assert.equal(data.transport.equipment.length, 2)
  assert.equal(data.transport.allocations.length, 2)
  assert.equal(data.transport.allocations[1].packages, '22')
  assert.equal(data.transport.allocations[1].grossWeight, '')
  assert.equal(data.transport.equipment[1].verifiedGrossMass, '')
  assert.ok(data.transport.gaps.some(gap => gap.label === 'Container numbers'))
})

test('full cargo descriptions and all lines survive independently of first-page summaries', () => {
  const input = source()
  const description = 'Detailed fictional goods '.repeat(40)
  input.cargo[0].description = description
  input.cargo.push({ id: 'cargo-2', lineNumber: 2, description: 'Other goods', packageQuantity: '3', grossWeight: '1.25' })
  const data = transportDocumentDataset(input, 'sea')
  assert.equal(data.transport.cargo[0].description, description.trim())
  assert.equal(data.transport.cargo.length, 2)
  assert.equal(data.transport.totals.grossWeight, '40001.25')
})

test('decimal totals are exact and incomplete totals are blank, including missing/invalid values', () => {
  assert.equal(completeDecimalTotal(['0.1', '0.2']), '0.3')
  assert.equal(completeDecimalTotal(['9007199254740993.01', '0.02']), '9007199254740993.03')
  assert.equal(completeDecimalTotal(['0', '0.000']), '0.000')
  for (const values of [[], ['1', null], ['2', ''], ['1', '-1'], ['1', 'NaN'], ['1', '1e3']]) assert.equal(completeDecimalTotal(values), '')
})

test('air chargeable weight, airport codes, security and signature never use unsafe fallbacks', () => {
  const input = source()
  input.routing[0].mode = 'air'
  input.allocations = []
  const data = transportDocumentDataset(input, 'air')
  assert.equal(data.transport.totals.grossWeight, '40000.00')
  assert.equal(data.transport.totals.chargeableWeight, '')
  assert.equal(data.routing[0].origin.iataCode, '')
  assert.equal(data.transport.securityStatus, '')
  assert.equal(data.transport.signingCapacity, '')
  assert.equal(data.transport.issueDate, '')
  input.job.chargeableWeightOverride = '45000.12'
  assert.equal(transportDocumentDataset(input, 'air').transport.totals.chargeableWeight, '45000.12')
})

test('private fields and client-style legal claims cannot cross the projection', () => {
  const input = source()
  input.routing[0].internalNotes = 'PRIVATE RATE'
  input.routing[0].origin.internalNotes = 'PRIVATE LOCATION'
  input.cargo[0].cost = 'PRIVATE COST'
  input.signingCapacity = 'SIGNED ORIGINAL'
  input.notify = undefined
  const data = transportDocumentDataset(input, 'sea')
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|SIGNED ORIGINAL/)
  assert.equal(data.fiata.notify, '')
  assert.equal(data.documentIssue.isLegalOriginal, false)
  assert.equal(data.fiata.originals, '')
})

test('ambiguous main carriage and broken allocation references fail instead of silently choosing', () => {
  const input = source()
  input.routing.push({ ...input.routing[0], id: 'route-2' })
  assert.throws(() => transportDocumentDataset(input, 'sea'), /main carriage/)
  const broken = source()
  broken.allocations[0].cargoId = 'missing'
  assert.throws(() => transportDocumentDataset(broken, 'sea'), /allocation/)
})
