import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestNominalAccount } from '../src/lib/nominal-mapping-suggestions.ts'

const nominal = (name, reportCategoryCode = 'expense', accountTypeCode = 'Expense Account') => ({ code: '3910.00.00', name, reportCategoryCode, accountTypeCode })
const target = (account_name, root_type = 'Expense', account_type = '', account_currency = 'GBP') => ({ name: `${account_name} - DSL`, account_name, root_type, account_type, account_currency, is_group: 0, disabled: 0 })

test('matches a clear expense alias only in the correct root and currency', () => {
  assert.equal(suggestNominalAccount(nominal('Bank charges', 'finance'), [target('Bank Charges')], 'GBP')?.name, 'Bank Charges - DSL')
  assert.equal(suggestNominalAccount(nominal('Bank charges', 'finance'), [target('Bank Charges', 'Asset')], 'GBP'), null)
  assert.equal(suggestNominalAccount(nominal('Bank charges', 'finance'), [target('Bank Charges', 'Expense', '', 'EUR')], 'GBP'), null)
})

test('does not collapse actual and accrued into generic provider ledgers', () => {
  const source = nominal('Freight costs accrued', 'direct_cost', 'Cost of Goods Sold')
  assert.equal(suggestNominalAccount(source, [target('Cost of Goods Sold')], 'GBP'), null)
  assert.equal(suggestNominalAccount(source, [target('Freight costs accrued')], 'GBP')?.name, 'Freight costs accrued - DSL')
})

test('rejects control accounts for ordinary costs and duplicates', () => {
  assert.equal(suggestNominalAccount(nominal('Wages and salaries'), [target('Salary', 'Expense', 'Payable')], 'GBP'), null)
  assert.equal(suggestNominalAccount(nominal('Wages and salaries'), [target('Salary'), target('Salary')], 'GBP'), null)
})
