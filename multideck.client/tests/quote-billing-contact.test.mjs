import assert from 'node:assert/strict'
import test from 'node:test'
import { quoteBillingContactName } from '../src/lib/quote-billing-contact.ts'

test('billing contact keeps the saved full name separately from email', () => {
  assert.equal(quoteBillingContactName('Lee Wright', 'New name'), 'Lee Wright')
})
test('a legacy email resolves only through an explicitly linked contact name', () => {
  assert.equal(quoteBillingContactName('lee@example.test', 'Lee Wright'), 'Lee Wright')
})
test('submitted snapshots without a full name do not invent one from email', () => {
  assert.equal(quoteBillingContactName('lee@example.test'), '')
  assert.equal(quoteBillingContactName(null), '')
})
