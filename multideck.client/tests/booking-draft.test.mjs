import assert from 'node:assert/strict'
import test from 'node:test'
import { rebaseBookingDraft, bookingDraftConflicts } from '../src/lib/booking-draft.ts'
test('save responses retain later typing while advancing the concurrency stamp', () => {
  const before = { booking: { updatedAt: 'v1', name: 'A' }, note: 'old' }
  const saved = { booking: { updatedAt: 'v2', name: 'A' }, note: 'old' }
  assert.deepEqual(rebaseBookingDraft(saved, before, { ...before, note: 'typed during save' }), { ...saved, note: 'typed during save' })
})
test('server-assigned line IDs survive while later values and removals remain intact', () => {
  const sent = [{ description: 'New cargo', packages: 1 }, { id: 'existing', description: 'Existing' }]
  const saved = [{ id: 'new-id', description: 'New cargo', packages: 1 }, sent[1]]
  assert.deepEqual(rebaseBookingDraft(saved, sent, [{ ...sent[0], packages: 2 }]), [{ id: 'new-id', description: 'New cargo', packages: 2 }])
})
test('unrelated server changes merge, conflicting edits remain explicit and reviewable', () => {
  const base = { note: 'old', owner: 'A', updatedAt: 'v1' }, saved = { note: 'theirs', owner: 'B', updatedAt: 'v2' }, draft = { ...base, note: 'mine' }
  assert.deepEqual(rebaseBookingDraft(saved, base, draft), { note: 'mine', owner: 'B', updatedAt: 'v2' })
  assert.deepEqual(bookingDraftConflicts(base, saved, draft), [{ field: 'Note', saved: 'theirs', draft: 'mine' }])
})
test('a deliberate clear is never repopulated by a late response', () => {
  assert.deepEqual(rebaseBookingDraft({ name: 'Saved' }, { name: 'Saved' }, { name: '' }), { name: '' })
})

test('recreated and reordered party rows preserve later payer edits on the correct account', () => {
  const sent = [
    { id: 'old-payer', role: 'payer', name: 'Payer A', organisationId: 'a' },
    { id: 'old-customer', role: 'customer', name: 'Customer', organisationId: 'c' },
  ]
  const saved = [
    { ...sent[1], id: 'new-customer' },
    { ...sent[0], id: 'new-payer' },
  ]
  const current = [{ ...sent[0], name: 'Payer B', organisationId: 'b' }, sent[1]]
  assert.deepEqual(rebaseBookingDraft(saved, sent, current), [
    { ...current[0], id: 'new-payer' }, saved[0],
  ])
})
