import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpileModule(readFileSync(new URL('../../multideck.client/src/lib/booking-planning-audit.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
const diff = (beforeRows, afterRows, locale) => context.exports.planningAuditChanges({ planningHistory: { beforeRows, afterRows } }, locale)
const row = { id: 'one', code: 'FRT', description: 'Freight', cost: 100, sell: 150, costCurrency: 'GBP', sellCurrency: 'GBP', supplierId: 'supplier-one', customerId: 'customer-one', quantity: 1, calculationBasis: 'fixed', costRoe: 1, sellRoe: 1 }
test('price edits show precise previous and current values in both English regions', () => {
  for (const locale of ['en-GB', 'en-US']) {
    const changes = diff([row], [{ ...row, cost: 125, sell: 175 }], locale)[0].changes
    assert.equal(changes.length, 2)
    assert.equal(changes[0].before, '£100.00')
    assert.equal(changes[0].after, '£125.00')
    assert.equal(changes[1].after, '£175.00')
  }
})
test('every editable non-price field is compared', () => {
  for (const key of ['code', 'description', 'supplierId', 'customerId', 'costCurrency', 'sellCurrency', 'costRoe', 'sellRoe', 'quantity', 'calculationBasis']) {
    const changes = diff([row], [{ ...row, [key]: typeof row[key] === 'number' ? 2 : 'NEW' }])[0].changes
    assert.equal(changes.length, 1, key)
  }
})
test('additions and deletions retain full values, zero and cleared fields', () => {
  assert.equal(diff([], [row])[0].action, 'Added')
  const removed = diff([row], [])[0]
  assert.equal(removed.action, 'Deleted')
  assert.equal(removed.changes.length, 12)
  assert.equal(removed.changes.find(x => x.label === 'Cost').before, '£100.00')
  assert.equal(diff([row], [{ ...row, cost: 0, supplierId: null }])[0].changes.find(x => x.label === 'Cost').after, '£0.00')
  assert.equal(diff([row], [{ ...row, supplierId: null }])[0].changes[0].after, 'Not recorded')
})
test('identity, not position, controls comparison; unavailable history is not empty history', () => {
  assert.equal(diff([row, { ...row, id: 'two' }], [{ ...row, id: 'two' }, row]).length, 0)
  assert.equal(context.exports.planningAuditChanges({}), null)
  assert.equal(diff([], []).length, 0)
})
test('operational removal receipts display deleted values without backend field names', () => {
  // Workspace readback strips JSON nulls, so deleted `after` may be absent.
  const changes = context.exports.planningAuditChanges({ costingLineId: 'one', before: {
    JobCostingLine_ID: 'one', JobCostingLine_Description: 'Freight', JobCostingLine_CostAmountCurrency: 125,
    JobCostingLine_RevenueAmountCurrency: 175, JobCostingLine_CostROE: 1, JobCostingLine_RevenueROE: 1,
    JobCostingLine_SourceMetadataJSON: { bookingCharge: { ...row, cost: 100, sell: 150 } },
  } })
  assert.equal(changes[0].action, 'Deleted')
  assert.equal(changes[0].changes.find(change => change.label === 'Cost').before, '£125.00')
})

test('Quote review receipts show changed prices and kept independent lines', () => {
  const ledger = value => ({ JobCostingLine_ID: value.id, JobCostingLine_Description: value.description,
    JobCostingLine_CostAmountCurrency: value.cost, JobCostingLine_RevenueAmountCurrency: value.sell,
    JobCostingLine_SupplierID: value.supplierId, JobCostingLine_CostROE: value.costRoe,
    JobCostingLine_RevenueROE: value.sellRoe, JobCostingLine_SourceMetadataJSON: { bookingCharge: value } })
  const changes = context.exports.planningAuditChanges({ decisions: [
    { key: 'one', action: 'replace', before: ledger(row), after: ledger({ ...row, cost: 125, sell: 175 }) },
    { key: 'two', action: 'keep', before: { ...row, id: 'two', code: 'BOOKING' }, after: { ...row, id: 'two', code: 'BOOKING' } },
    { key: 'three', action: 'remove', before: ledger({ ...row, id: 'three' }), after: null },
    { key: 'four', action: 'restore', before: ledger({ ...row, id: 'four' }), after: ledger({ ...row, id: 'four' }) },
  ] })
  assert.equal(changes[0].changes.length, 2)
  assert.equal(changes[0].changes[0].before, '£100.00')
  assert.equal(changes[0].changes[0].after, '£125.00')
  assert.equal(changes[1].action, 'Kept unchanged')
  assert.match(changes[1].label, /BOOKING/)
  assert.equal(changes[2].action, 'Deleted')
  assert.equal(changes[3].action, 'Added')
})
