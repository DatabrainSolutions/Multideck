import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../../multideck.client/src/lib/booking-customs-prefill.ts', import.meta.url), 'utf8')
const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
const { restoreBookingCustomsPrefill: restore, unpadCustomsDecimal: decimal } = context.exports
const original = { exporter: 'GB123456789000', exporterName: 'Test shipper', importerName: 'Test importer', consigneeName: 'Test consignee' }
const snapshot = { source: 'booking_customs_handoff', payload: original }
test('legacy company and identifier are separated from the captured source only', () => {
 const result = restore(original, snapshot)
 assert.equal(result.exporter, 'Test shipper')
 assert.equal(result.exporterEori, 'GB123456789000')
 assert.equal(result.importer, 'Test importer')
 assert.equal(result.importerEori, '')
 assert.equal(original.exporter, 'GB123456789000')
})
test('operator edits, explicit clears and modern fields stay authoritative', () => {
 for (const change of [{ exporter: 'Reviewed company' }, { exporter: '' }, { exporterEori: '' }, { exporterEori: 'GB999' }]) {
  const saved = { ...original, ...change }
  assert.equal(restore(saved, snapshot).exporter, saved.exporter)
 }
 assert.equal(restore({ ...original, exporterName: 'Changed' }, snapshot).exporter, original.exporter)
 assert.equal(restore(original, { ...snapshot, payload: { ...original, bookingHandoffUiVersion: 2 } }).exporter, original.exporter)
})
test('database padding is removed without rounding or numeric coercion', () => {
 for (const [input, expected] of [['60000.0000','60000'],['450.000000','450'],['1.234500','1.2345'],['9007199254740993.0100','9007199254740993.01'],['0.000','0'],['TBC','TBC'],['1e3','1e3'],['',''],[null,null]]) assert.equal(decimal(input), expected)
 const result = restore({ totalAmount: '60000.0000', items: [{ id:'item-1', packageCount:'450.000000', commodityCode:'001234', netMass:'' }], invoiceHeaders:[{ id:'header', totalAmount:'60000.0000', packageCount:'450.000000', netMass:'0' }] }, snapshot)
 assert.equal(result.totalAmount, '60000')
 assert.equal(result.items[0].packageCount, '450')
 assert.equal(result.items[0].commodityCode, '001234')
 assert.equal(result.items[0].netMass, '')
 assert.equal(result.invoiceHeaders[0].totalAmount, '60000')
 assert.equal(result.invoiceHeaders[0].netMass, '0')
})
test('standalone and unproven sources are never adapted', () => {
 assert.equal(restore(original, {}), original)
 assert.equal(restore(original, { source:'other' }), original)
})
