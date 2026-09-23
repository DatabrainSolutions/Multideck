import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareJournalReversal } from '../../multideck.client/src/lib/journal-reversal.ts'

const original = {
  id: 'original', number: 42, status: 'posted', accounting_date: '2026-09-30',
  reference: 'Month end', description: 'Accrued costs', currency: 'GBP',
  version: 2, mirror_status: 'synced', external_id: 'EXTERNAL-42',
  lines: [
    { accountId: 'cost', description: 'Cost', debit: '75.1234', credit: '0' },
    { accountId: 'cost2', description: 'Cost 2', debit: '24.8766', credit: '0' },
    { accountId: 'accrual', description: 'Accrual', debit: '0', credit: '100' },
  ],
}
test('reversal swaps every side exactly without changing the original or retaining posting identity', () => {
  const before = structuredClone(original)
  const result = prepareJournalReversal(original, 'new')
  assert.equal(result.accounting_date, '2026-10-01')
  assert.equal(result.reference, 'Reversal of JN-42')
  assert.equal(result.status, 'draft')
  assert.equal(result.id, 'new')
  assert.equal(result.version, undefined)
  assert.equal(result.external_id, undefined)
  assert.equal(result.mirror_status, 'not_required')
  original.lines.forEach((line, i) => {
    assert.equal(result.lines[i].debit, line.credit)
    assert.equal(result.lines[i].credit, line.debit)
    assert.equal(result.lines[i].accountId, line.accountId)
    assert.notEqual(result.lines[i], line)
  })
  assert.deepEqual(original, before)
})
test('month-end reversal defaults handle year boundaries and leap years', () => {
  for (const [date, expected] of [['2026-12-31','2027-01-01'],['2028-02-29','2028-03-01']]) {
    assert.equal(prepareJournalReversal({ ...original, accounting_date: date }, 'new').accounting_date, expected)
  }
})
test('unposted journals cannot be reversed', () => {
  assert.throws(() => prepareJournalReversal({ ...original, status: 'draft' }, 'new'), /Only posted/)
})
