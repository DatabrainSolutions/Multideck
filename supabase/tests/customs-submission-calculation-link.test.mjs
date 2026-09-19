import test from 'node:test'
import assert from 'node:assert/strict'
import { submissionCalculationLink, retainedSubmissionCalculationLink, retainedCalculationMatches } from '../functions/_shared/customs-submission-calculation-link.mts'
import { CALCULATION_VERSION, PRECISION_POLICY } from '../functions/_shared/customs-calculation-version.mts'

const draft = { direction: 'import', items: [{ id: 'item-1', price: '1000' }], currency: 'GBP' }
const now = '2026-09-15T10:00:00.000Z'
function row() { return { id: 'calculation-1', declaration_id: 'declaration-1', kind: 'calculation', created_at: '2026-09-15T09:00:00Z', draft_snapshot: structuredClone(draft), evidence: { result: { date: '2026-09-15', version: CALCULATION_VERSION, precisionPolicy: PRECISION_POLICY, autoPopulationAllowed: false } } } }
const link = (candidate, value = draft, at = now) => submissionCalculationLink('declaration-1', value, candidate, at)

test('historical comparison requires exact submission ownership but not current rules', () => {
  const candidate = { ...row(), id: '00000000-0000-0000-0000-000000000001' }
  const snapshot = { schemaVersion: 1, capturedAt: now, declaration: { id: 'declaration-1', genericPayload: draft }, calculationLink: link(candidate) }
  candidate.evidence.result.version = 'historical-version'
  assert.equal(retainedCalculationMatches(snapshot, candidate, 'declaration-1'), true)
  for (const patch of [{ declaration_id: 'other' }, { id: 'other' }, { kind: 'override' }, { created_at: '2026-09-16T00:00:00Z' }, { draft_snapshot: { ...draft, currency: 'EUR' } }]) {
    assert.equal(retainedCalculationMatches(snapshot, { ...candidate, ...patch }, 'declaration-1'), false)
  }
  assert.equal(retainedCalculationMatches(snapshot, candidate, 'other'), false)
})

test('binds the immutable current revision without certifying an estimate', () => {
  const candidate = row()
  const before = JSON.stringify(candidate)
  const result = link(candidate, { currency: 'GBP', items: draft.items, direction: 'import' })
  assert.equal(result.calculationId, 'calculation-1')
  assert.equal(result.state, 'linked-estimate')
  assert.deepEqual(result.reasons, [])
  assert.equal(JSON.stringify(candidate), before)
})
test('changed draft, other declaration and override cannot be linked', () => {
  for (const candidate of [null, { ...row(), declaration_id: 'other' }, { ...row(), kind: 'override' }, { ...row(), draft_snapshot: { ...draft, currency: 'EUR' } }]) {
    assert.equal(link(candidate).calculationId, null)
    assert.equal(link(candidate).state, 'unavailable')
    assert.ok(link(candidate).reasons.length)
  }
})
test('old policy, old date, missing timestamp and later calculations fail closed', () => {
  for (const mutate of [r => r.evidence.result.version = 'old', r => r.evidence.result.date = '2026-09-14', r => delete r.created_at, r => r.created_at = '2026-09-15T11:00:00Z']) {
    const candidate = row(); mutate(candidate)
    assert.equal(link(candidate).calculationId, null)
  }
})
test('uses the UK submission date and retains array order', () => {
  const candidate = row(); candidate.created_at = '2026-09-14T23:05:00Z'
  assert.equal(link(candidate, draft, '2026-09-14T23:30:00Z').calculationId, 'calculation-1')
  const reordered = { ...draft, items: [{ id: 'two' }, ...draft.items] }
  candidate.draft_snapshot = { ...reordered, items: [...reordered.items].reverse() }
  assert.equal(link(candidate, reordered).calculationId, null)
})
test('rejects export and invalid preparation time', () => {
  assert.throws(() => link(row(), { ...draft, direction: 'export' }), /import/)
  assert.throws(() => link(row(), draft, 'not-a-date'), /preparation time/)
})
test('retained links expose only reviewed metadata and reject broken linkage', () => {
  const good = { schemaVersion: 1, capturedAt: now, calculationLink: { schemaVersion: 1, checkedAt: now, calculationId: '30000000-0000-0000-0000-000000000001', state: 'linked-estimate', reasons: [], private: 'not-public' } }
  assert.equal(retainedSubmissionCalculationLink(good).calculationId, good.calculationLink.calculationId)
  assert.equal(JSON.stringify(retainedSubmissionCalculationLink(good)).includes('not-public'), false)
  for (const changes of [{ checkedAt: '2026-09-16T00:00:00Z' }, { calculationId: 'not-an-id' }, { state: 'matched' }, { reasons: ['not eligible'] }, { state: 'unavailable' }]) {
    assert.equal(retainedSubmissionCalculationLink({ ...good, calculationLink: { ...good.calculationLink, ...changes } }), null)
  }
  assert.equal(retainedSubmissionCalculationLink({ schemaVersion: 1 }), null)
})
