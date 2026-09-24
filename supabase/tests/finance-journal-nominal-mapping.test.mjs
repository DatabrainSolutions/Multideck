import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = readFileSync(new URL('../functions/_shared/finance-journal-delivery.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
const { mappedJournalLines } = await import(`data:text/javascript;base64,${Buffer.from(`class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }\nconst erpNextOrigin = () => '';\nconst validateErpNextJournal = () => {};\nconst exportErpNextJournal = () => {};\nclass JournalDeliveryError extends Error {}\n${stripTypeScriptTypes(source)}`).toString('base64')}`)

const lines = [
  { accountId: 'actual', debit: '96', credit: '0', description: '' },
  { accountId: 'accrued', debit: '0', credit: '96', description: '' },
]
const accounts = [
  { FINNom_ID: 'actual', FINNom_Code: '1010.20.10', FINNom_ReportCategoryCode: 'direct_cost', FINNom_IsActive: true },
  { FINNom_ID: 'accrued', FINNom_Code: '1010.20.20', FINNom_ReportCategoryCode: 'direct_cost', FINNom_IsActive: true },
]
const mappings = [
  { ACCIAM_LocalContextCode: 'nominal:actual', ACCIAM_ProviderAccountID: 'Freight costs actual - DSL' },
  { ACCIAM_LocalContextCode: 'nominal:accrued', ACCIAM_ProviderAccountID: 'Freight costs accrued - DSL' },
]

test('journal delivery uses reviewed mappings for each actual and accrued nominal', () => {
  assert.deepEqual(mappedJournalLines(lines, accounts, mappings, 'Cost true-up'), [
    { account: 'Freight costs actual - DSL', nominalCode: '1010.20.10', expectedRootType: 'Expense', debit: '96', credit: '0', description: 'Cost true-up' },
    { account: 'Freight costs accrued - DSL', nominalCode: '1010.20.20', expectedRootType: 'Expense', debit: '0', credit: '96', description: 'Cost true-up' },
  ])
})

test('missing, conflicting and inactive nominal mappings fail closed', () => {
  assert.throws(() => mappedJournalLines(lines, accounts, mappings.slice(0, 1), 'Cost true-up'), /Map nominal 1010\.20\.20/)
  assert.throws(() => mappedJournalLines(lines, accounts, [...mappings, { ACCIAM_LocalContextCode: 'nominal:actual', ACCIAM_ProviderAccountID: 'Other - DSL' }], 'Cost true-up'), /conflicting/)
  assert.throws(() => mappedJournalLines(lines, [{ ...accounts[0], FINNom_IsActive: false }, accounts[1]], mappings, 'Cost true-up'), /not active/)
  assert.throws(() => mappedJournalLines(lines, [{ ...accounts[0], FINNom_ReportCategoryCode: null }, accounts[1]], mappings, 'Cost true-up'), /Classify nominal/)
})
