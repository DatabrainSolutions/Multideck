import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
let document, submits = 0, identities = 0, accountCompany = 'Example', accountType = 'Expense Account', accountRootType = 'Expense', lostSubmit = false
const input = { id: 'journal-1', company: 'Example', currency: 'GBP', date: '2026-09-18', description: 'Accrual', lines: [{ account: 'Cost', nominalCode: '1010.20.10', expectedRootType: 'Expense', debit: '100.1234', credit: '0', description: '' }, { account: 'Accrual', nominalCode: '1010.20.20', expectedRootType: 'Expense', debit: '0', credit: '100.1234', description: '' }] }
globalThis.__journalTest = {
  async list(type) { return type === 'Company' ? [{ name: 'Example', default_currency: 'GBP' }] : [{ company: accountCompany, account_currency: 'GBP', is_group: 0, disabled: 0, account_type: accountType, root_type: accountRootType }] },
  async identity(identity, type, payload) { identities++; assert.equal(identity.localTable, 'FIN_Journals'); assert.equal(type, 'Journal Entry'); document ??= { ...payload, docstatus: '0', accounts: payload.accounts.map(row => ({ ...row, debit: row.debit_in_account_currency, credit: row.credit_in_account_currency })) }; return { externalId: 'ERP-JN-1' } },
  async request() { return { data: document } },
  async submit() { submits++; document.docstatus = '1'; if (lostSubmit) throw Error('Response lost') },
}
const backend = url('export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}')
const transport = url('export const erpNextList=(...a)=>globalThis.__journalTest.list(...a);export const erpNextRequest=(...a)=>globalThis.__journalTest.request(...a);export const erpNextSubmit=(...a)=>globalThis.__journalTest.submit(...a);')
const identity = url('export const ensureErpNextDocument=(...a)=>globalThis.__journalTest.identity(...a)')
const source = stripTypeScriptTypes(readFileSync(new URL('../functions/_shared/erpnext-journal.ts', import.meta.url), 'utf8')).replace('./backend.ts', backend).replace('./erpnext.ts', transport).replace('./erpnext-document-identity.ts', identity)
const { exportErpNextJournal: deliver, verifyJournal, journalUnits } = await import(url(source))
test('exact journal comparison rejects rounded differences and invalid amounts', () => {
  assert.equal(journalUnits('100.1234'), 1001234n)
  for (const value of ['NaN', '-1', '1e2', '0.00001']) assert.throws(() => journalUnits(value))
})
test('wrong company, control accounts and imbalance block before provider creation', async () => {
  accountCompany = 'Foreign'; await assert.rejects(deliver(input), /active, non-control/)
  accountCompany = 'Example'; accountType = 'Receivable'; await assert.rejects(deliver(input), /active, non-control/)
  accountType = 'Expense Account'; accountRootType = 'Income'; await assert.rejects(deliver(input), /requires Expense/)
  await assert.rejects(deliver({ ...input, lines: [{ ...input.lines[0], expectedRootType: undefined }, input.lines[1]] }), /predates verified nominal mappings/)
  accountRootType = 'Expense'; await assert.rejects(deliver({ ...input, lines: [{ ...input.lines[0], debit: '101' }, input.lines[1]] }), /balance/)
  assert.equal(identities, 0)
})
test('lost submit response recovers the same submitted journal without resubmitting', async () => {
  lostSubmit = true; await assert.rejects(deliver(input), /Response lost/); lostSubmit = false
  assert.equal(await deliver(input), 'ERP-JN-1'); assert.equal(submits, 1)
})
test('readback blocks changed accounts, cancelled journals and fractional differences', async () => {
  const original = structuredClone(document)
  document.accounts[0].debit = '100.1235'; await assert.rejects(deliver(input), /does not match/)
  document = structuredClone(original); document.accounts[0].account = 'Different'; assert.throws(() => verifyJournal(document, input, true), /does not match/)
  document = structuredClone(original); document.docstatus = '2'; await assert.rejects(deliver(input), /differs/)
  document = structuredClone(original); document.company = 'Foreign'; await assert.rejects(deliver(input), /differs/)
  assert.equal(submits, 1)
})
