import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const source = stripTypeScriptTypes(readFileSync(new URL('../functions/_shared/cost-accrual-model.ts', import.meta.url), 'utf8'))
const { evaluateCostAccrual, invoiceArrivalEstimate, moneyUnits, moneyString } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const snapshot = {
  legalEntityId: 'entity', jobId: 'job', chargeId: 'charge', currency: 'GBP', revision: 'r1',
  originalEstimate: '100', currentEstimate: '100', actualCost: '96', openAccrual: '4',
  finalInvoice: true, serviceConfirmed: true, disputed: false, hasCreditOrCancellation: false,
  exactInvoiceMatch: true, periodOpen: true, expenseAccountId: 'expense', accrualAccountId: 'accrual',
  accountsValidated: true, mirrorReady: true, sourceDocumentIds: ['invoice'],
}
const policy = { id: 'policy', revision: 1, legalEntityId: 'entity', currency: 'GBP', approvedBy: 'controller', autoFinalise: true, underPercent: '5', underCap: '10', overPercent: '2', overCap: '5' }
const approval = { id: 'approval', actorId: 'controller', reason: 'Supplier confirms final invoice', snapshotRevision: 'r1', policyRevision: 1, legalEntityId: 'entity', chargeId: 'charge' }
const decide = (s = {}, p = policy, a) => evaluateCostAccrual({ ...snapshot, ...s }, p, a)
const balanced = result => assert.equal(result.journal.reduce((n, row) => n + moneyUnits(row.debit) - moneyUnits(row.credit), 0n), 0n)

test('£100 estimate, £96 final actual releases £4 back to original cost nominal', () => {
  const result = decide()
  assert.equal(result.status, 'finalise'); assert.equal(result.authority, 'policy')
  assert.equal(result.targetAccrual, '0.0000'); assert.equal(result.profitMovement, '4.0000')
  assert.equal(result.expectedTotalCost, '96.0000'); assert.equal(result.favourableVariance, '4.0000')
  assert.deepEqual(result.journal.map(({ accountId, debit, credit }) => ({ accountId, debit, credit })), [
    { accountId: 'expense', debit: '0.0000', credit: '4.0000' }, { accountId: 'accrual', debit: '4.0000', credit: '0.0000' },
  ]); balanced(result)
})
test('partial invoices never finalise even inside tolerance', () => {
  const result = decide({ finalInvoice: false })
  assert.equal(result.status, 'partial'); assert.equal(result.targetAccrual, '4.0000')
  assert.equal(result.journal.length, 0); assert.equal(result.expectedTotalCost, '100.0000')
})
test('cumulative actuals and accrued balance make evaluation idempotent', () => {
  const first = decide({ actualCost: '60', openAccrual: '100', finalInvoice: false })
  assert.equal(first.targetAccrual, '40.0000'); balanced(first)
  assert.equal(decide({ actualCost: '60', openAccrual: first.targetAccrual, finalInvoice: false }).journal.length, 0)
  assert.equal(decide({ openAccrual: '0' }).status, 'settled')
  assert.equal(decide({ openAccrual: '0' }).journal.length, 0)
})
test('estimate revisions produce only the delta, preserving original evidence', () => {
  const s = { ...snapshot, originalEstimate: '100', currentEstimate: '120', actualCost: '60', openAccrual: '40', finalInvoice: false }
  const before = structuredClone(s), result = evaluateCostAccrual(s, policy)
  assert.equal(result.adjustment, '20.0000'); assert.equal(result.expectedTotalCost, '120.0000')
  assert.deepEqual(s, before); balanced(result)
})
test('both percentage and absolute caps must pass, including exact boundaries', () => {
  assert.equal(decide({ actualCost: '95', openAccrual: '5' }).status, 'finalise')
  assert.equal(decide({ actualCost: '94.9999', openAccrual: '5.0001' }).status, 'review')
  assert.equal(decide({ currentEstimate: '1000', actualCost: '980', openAccrual: '20' }).status, 'review')
  assert.equal(decide({ currentEstimate: '1000', actualCost: '990', openAccrual: '10' }).status, 'finalise')
  assert.equal(decide({ actualCost: '102', openAccrual: '0' }).status, 'settled')
  assert.equal(decide({ actualCost: '102.0001', openAccrual: '0' }).status, 'review')
})
test('outside tolerance retains accrual until a current scoped human approval', () => {
  const pending = decide({ actualCost: '80', openAccrual: '20' })
  assert.equal(pending.targetAccrual, '20.0000'); assert.equal(pending.journal.length, 0)
  const approved = decide({ actualCost: '80', openAccrual: '20' }, policy, approval)
  assert.equal(approved.status, 'finalise'); assert.equal(approved.authority, 'human')
  assert.equal(approved.evidence.approvalId, 'approval'); balanced(approved)
})
test('missing approval, disabled automation and absent policies do not finalise', () => {
  for (const p of [null, { ...policy, approvedBy: null }, { ...policy, autoFinalise: false }]) {
    const result = decide({}, p); assert.equal(result.status, 'review'); assert.equal(result.journal.length, 0)
  }
})
test('stale or differently scoped approvals cannot authorise release', () => {
  for (const patch of [{ snapshotRevision: 'old' }, { policyRevision: 2 }, { chargeId: 'other' }, { legalEntityId: 'foreign' }, { reason: '' }, { actorId: '' }]) {
    const result = decide({}, policy, { ...approval, ...patch }); assert.equal(result.status, 'review'); assert.equal(result.journal.length, 0)
  }
})
test('hard accounting blockers cannot be overridden by a human approval', () => {
  for (const patch of [{ serviceConfirmed: false }, { periodOpen: false }, { accountsValidated: false }, { expenseAccountId: null }, { accrualAccountId: 'expense' }, { mirrorReady: false }, { disputed: true }, { hasCreditOrCancellation: true }, { exactInvoiceMatch: false }, { sourceDocumentIds: [] }, { actualCost: '-10' }, { actualCost: '0' }]) {
    const result = decide(patch, policy, approval); assert.equal(result.status, 'blocked', JSON.stringify(patch)); assert.equal(result.journal.length, 0)
  }
})
test('partial overspend requires review; zero estimates cannot absorb variances', () => {
  assert.equal(decide({ actualCost: '110', finalInvoice: false }).status, 'review')
  assert.equal(decide({ currentEstimate: '0', actualCost: '1' }).status, 'review')
})
test('new eligible cost proposes a balanced accrual, but proposal does not post', () => {
  const result = decide({ actualCost: '0', openAccrual: '0', finalInvoice: false, sourceDocumentIds: [] }, null)
  assert.equal(result.status, 'awaiting_invoice'); assert.equal(result.adjustment, '100.0000')
  assert.equal(result.authority, 'none'); balanced(result)
})
test('exact money parser rejects floats, scientific notation, overflow and invalid policies', () => {
  for (const value of [1, 'NaN', '', '1e2', '0.00001', '100000000000000']) assert.throws(() => moneyUnits(value))
  assert.equal(moneyString(moneyUnits('99999999999999.9999')), '99999999999999.9999')
  for (const patch of [{ currency: 'USD' }, { legalEntityId: 'foreign' }, { overPercent: '-1' }, { underPercent: '101' }, { overCap: '-1' }, { revision: 0 }]) assert.throws(() => decide({}, { ...policy, ...patch }))
})
test('many small values and all valid deltas remain exactly balanced', () => {
  for (let n = 1; n < 500; n++) {
    const currentEstimate = moneyString(BigInt(n) * 101n)
    const result = decide({ currentEstimate, actualCost: moneyString(BigInt(n) * 37n), openAccrual: moneyString(BigInt(n) * 43n), finalInvoice: false })
    balanced(result)
    assert.equal(moneyUnits(result.actualCost) + moneyUnits(result.targetAccrual), moneyUnits(currentEstimate))
  }
})
test('ageing includes outstanding charges as censored history', () => {
  const arrivals = Array.from({ length: 10 }, () => ({ days: 10, invoiced: true }))
  const outstanding = Array.from({ length: 10 }, () => ({ days: 60, invoiced: false }))
  assert.equal(invoiceArrivalEstimate([...arrivals, ...outstanding], 0, 30).probability, 0.5)
  assert.equal(invoiceArrivalEstimate([...arrivals, ...outstanding], 15, 30).probability, 0)
  assert.equal(invoiceArrivalEstimate(arrivals, 0, 30).probability, null)
  assert.equal(invoiceArrivalEstimate([...arrivals, ...outstanding], 50, 30).probability, null)
})
test('ageing rejects invalid evidence and never becomes posting authority', () => {
  assert.throws(() => invoiceArrivalEstimate([{ days: -1, invoiced: true }], 0, 30))
  assert.throws(() => invoiceArrivalEstimate([], 0, 30, 0))
  const result = invoiceArrivalEstimate(Array.from({ length: 20 }, () => ({ days: 60, invoiced: false })), 0, 30)
  assert.equal(result.reason, 'historical_estimate_not_release_authority')
  assert.equal(decide({ finalInvoice: false }).status, 'partial')
})
