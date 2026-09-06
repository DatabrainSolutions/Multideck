import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mapping, updateChargeRows } from './quote-cargo-client-fixture.mjs'
const customerId = '10000000-0000-4000-8000-000000000001'
const supplierId = '20000000-0000-4000-8000-000000000002'
const otherCustomerId = '30000000-0000-4000-8000-000000000003'
const quote = { ...mapping.newQuoteDraft, id: 'JQ-TEST', customerId, customer: 'QA Customer', clientCode: 'QACUS', currency: 'GBP' }
const organisation = (id, name, types) => ({ id, name, code: name, types })
const lookups = { organisations: [organisation(supplierId, 'QA Supplier', ['Supplier']), organisation(otherCustomerId, 'Other Customer', ['Customer'])], suppliers: [], carriers: [], agents: [] }

test('live parties come only from supplied authorised records and the current Quote customer', () => {
  const parties = mapping.quoteChargeParties(quote, [], lookups)
  assert.deepEqual(parties.filter(p => p.roles.includes('customer')).map(p => p.id), [customerId])
  assert.ok(parties.some(p => p.id === supplierId && p.name === 'QA Supplier'))
  assert.equal(parties.some(p => p.id === otherCustomerId), false)
  assert.equal(parties.some(p => /hellmann|cedar|asterline|northstar/i.test(p.name)), false)
  assert.deepEqual(mapping.quoteChargeParties(mapping.newQuoteDraft, [], null).map(p => p.id), [''])
})

test('new charge never chooses the first directory supplier or creates a demo identity', () => {
  const row = mapping.newQuoteChargeRow(quote)
  assert.equal(row.supplierId, null)
  assert.equal(row.customerId, customerId)
  assert.equal(row.costCurrency, 'GBP')
  assert.equal(row.sellCurrency, 'GBP')
  assert.equal(row.cost, 0)
  assert.equal(row.sell, 0)
  assert.notEqual(row.id, mapping.newQuoteChargeRow(quote).id)
  assert.equal(mapping.newQuoteChargeRow({ ...quote, supplierId }).supplierId, supplierId)
  assert.equal(mapping.newQuoteChargeRow({ ...quote, supplierId: 'supplier-hellmann' }).supplierId, null)
})

test('recorded supplier labels survive without guessing a UUID from a matching name', () => {
  const charge = { id: 'old-line', creditor: 'QA Supplier', supplierId: null }
  const identity = mapping.quoteChargeSupplierIdentity(charge, 0)
  assert.notEqual(identity, supplierId)
  const party = mapping.quoteChargeParties(quote, [charge], lookups).find(p => p.id === identity)
  assert.equal(party.name, 'QA Supplier')
  assert.equal(party.code, 'Recorded')
  assert.equal(mapping.quoteChargeSupplierIdentity({ ...charge, creditor: 'Supplier pending' }, 0), null)
  const stale = { ...charge, supplierId: otherCustomerId, creditor: 'Previously selected supplier' }
  assert.equal(mapping.quoteChargeParties(quote, [stale], null).find(p => p.id === otherCustomerId).name, stale.creditor)
})

test('dual-role current customer retains its supplier role without adding alternate customers', () => {
  const parties = mapping.quoteChargeParties(quote, [], { ...lookups, organisations: [organisation(customerId, 'QA Customer', ['Supplier', 'Customer'])] })
  assert.deepEqual(parties.find(p => p.id === customerId).roles, ['supplier', 'customer'])
})

test('reordering, removal and insertion preserve only the matching saved line metadata', () => {
  const charges = [
    { id: 'a', internalNotes: 'Private A', additionalDetail: 'Customer A', department: 'Air' },
    { id: 'b', internalNotes: 'Private B', additionalDetail: 'Customer B', department: 'Road' },
  ]
  const rows = charges.map(charge => ({ ...mapping.newQuoteChargeRow(quote), id: charge.id }))
  const inserted = mapping.newQuoteChargeRow(quote)
  const result = updateChargeRows({ quote, charges, rows, parties: [], nextRows: [rows[1], inserted, rows[0]] })
  assert.deepEqual(result.map(row => row.internalNotes), ['Private B', '', 'Private A'])
  assert.deepEqual(result.map(row => row.additionalDetail), ['Customer B', '', 'Customer A'])
  assert.deepEqual(result.map(row => row.department), ['Road', quote.department || '', 'Air'])
  assert.equal(updateChargeRows({ quote, charges, rows, parties: [], nextRows: [rows[1]] })[0].internalNotes, 'Private B')
})

test('clearing and choosing suppliers round-trip through the actual update and save mapping', () => {
  const charge = { id: 'a', creditor: 'Legacy label', supplierId: null, internalNotes: 'Keep private' }
  const row = { ...mapping.newQuoteChargeRow(quote), id: 'a', supplierId: mapping.quoteChargeSupplierIdentity(charge, 0) }
  const parties = mapping.quoteChargeParties(quote, [charge], lookups)
  const update = selected => updateChargeRows({ quote, charges: [charge], rows: [row], parties, nextRows: [{ ...row, supplierId: selected }] })[0]
  assert.equal(update(row.supplierId).creditor, 'Legacy label')
  assert.equal(update(row.supplierId).supplierId, null)
  const cleared = update('')
  assert.equal(cleared.creditor, 'Supplier pending')
  assert.equal(cleared.supplierId, null)
  assert.equal(cleared.internalNotes, 'Keep private')
  const selected = update(supplierId)
  assert.equal(selected.creditor, 'QA Supplier')
  assert.equal(selected.supplierId, supplierId)
  const saved = mapping.quoteSavePayload(quote, [selected])
  assert.equal(saved.charges[0].supplierId, supplierId)
  assert.equal(saved.charges[0].sourceLabel, 'QA Supplier')
})

test('real page supplies explicit creation and live lookup bindings and does not copy metadata by shifted row position', () => {
  const page = readFileSync(new URL('../../multideck.client/src/pages/quotes-page.tsx', import.meta.url), 'utf8')
  assert.match(page, /createRow=\{\(\) => newQuoteChargeRow\(quote\)\}/)
  assert.match(page, /quoteChargeParties\(quote, charges, lookups\)/)
  assert.match(page, /const current = charges\[rows\.findIndex\(\(original\) => original\.id === row\.id\)\]/)
  assert.doesNotMatch(page, /const quoteChargeSupplierParties/)
})
