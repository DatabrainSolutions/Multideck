import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const load = name => stripTypeScriptTypes(readFileSync(new URL(`../functions/_shared/${name}.ts`, import.meta.url), 'utf8'))
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const moneyUrl = url(load('cost-accrual-model'))
const { moneyUnits, evaluateCostAccrual } = await import(moneyUrl)
const { planGroupedInvoice, groupedExpectedTotal, validateChartTransfer } = await import(url(load('grouped-accrual-model').replace('./cost-accrual-model.ts', moneyUrl)))
const group = { legalEntityId: 'entity', code: 'freight', name: 'Freight costs', kind: 'cost', actualAccountId: 'actual', accruedAccountId: 'accrued', controlAccountId: 'control' }
const invoice = (extra = {}) => planGroupedInvoice({ group, invoiceNet: '96', remainingAccrual: '100', originalAccruedAccountId: 'accrued', originalControlAccountId: 'control', settlementAccountId: 'payable', ...extra })
const balance = lines => assert.equal(lines.reduce((sum, line) => sum + moneyUnits(line.debit) - moneyUnits(line.credit), 0n), 0n)
test('£100 accrued becomes £96 actual plus £4 accrued, then approved finalisation clears only £4', () => {
  const result = invoice()
  assert.deepEqual(result.actual, [{accountId:'actual',debit:'96.0000',credit:'0.0000'},{accountId:'payable',debit:'0.0000',credit:'96.0000'}])
  assert.deepEqual(result.relief, [{accountId:'control',debit:'96.0000',credit:'0.0000'},{accountId:'accrued',debit:'0.0000',credit:'96.0000'}])
  assert.equal(groupedExpectedTotal('96', result.remainingAccrual), '100.0000')
  balance(result.actual); balance(result.relief)
  const final = evaluateCostAccrual({ legalEntityId:'entity',jobId:'job',chargeId:'charge',currency:'GBP',revision:'r1',originalEstimate:'100',currentEstimate:'100',actualCost:'96',openAccrual:'4',finalInvoice:true,serviceConfirmed:true,disputed:false,hasCreditOrCancellation:false,exactInvoiceMatch:true,periodOpen:true,expenseAccountId:'accrued',accrualAccountId:'control',accountsValidated:true,mirrorReady:true,sourceDocumentIds:['invoice'] }, {id:'policy',revision:1,legalEntityId:'entity',currency:'GBP',approvedBy:'controller',autoFinalise:true,underPercent:'5',underCap:'5',overPercent:'5',overCap:'5'})
  assert.equal(final.status, 'finalise'); assert.equal(final.expectedTotalCost, '96.0000')
  assert.ok(final.journal.every(line => line.accountId !== 'actual')); balance(final.journal)
})
test('partial and over-estimate invoices never generate negative accruals', () => {
  assert.equal(invoice({invoiceNet:'60'}).remainingAccrual, '40.0000')
  const over = invoice({invoiceNet:'104'})
  assert.equal(over.relieved, '100.0000'); assert.equal(over.remainingAccrual, '0.0000')
  assert.equal(groupedExpectedTotal('104', over.remainingAccrual), '104.0000'); balance([...over.actual,...over.relief])
})
test('pre-cutover originals are reversed on their original nominal, never today’s accrued nominal', () => {
  const result = invoice({originalAccruedAccountId:'legacy-expense',originalControlAccountId:'legacy-control'})
  assert.deepEqual(result.relief.map(line => line.accountId), ['legacy-control','legacy-expense'])
})
test('revenue uses the opposite signs and receivable settlement', () => {
  const result = invoice({group:{...group,kind:'revenue'},settlementAccountId:'receivable'})
  assert.equal(result.actual[0].accountId,'receivable'); assert.equal(result.relief[0].accountId,'accrued')
  balance([...result.actual,...result.relief])
})
test('exact four-decimal amounts and invalid account pairs are guarded', () => {
  assert.equal(invoice({invoiceNet:'0.0001',remainingAccrual:'0.0002'}).remainingAccrual,'0.0001')
  assert.throws(() => invoice({group:{...group,accruedAccountId:'actual'}}), /distinct/)
  assert.throws(() => invoice({settlementAccountId:'actual'}), /separate/)
  for (const value of ['0','-1','1e2','0.00001']) assert.throws(() => invoice({invoiceNet:value}))
})
const chart = [
  {sourceCode:'1010.20.00',name:'Freight costs',statement:'profit_and_loss',role:'header',groupCode:'freight-cost'},
  {sourceCode:'1010.20.10',name:'Freight costs actual',statement:'profit_and_loss',role:'actual',groupCode:'freight-cost'},
  {sourceCode:'1010.20.20',name:'Freight costs accrued',statement:'profit_and_loss',role:'accrued',groupCode:'freight-cost'},
  {sourceCode:'8410.10.00',name:'Job costing accrual control',statement:'balance_sheet',role:'standard'},
]
test('CargoWise dotted codes remain untouched; complete explicitly classified groups validate', () => {
  const before = structuredClone(chart)
  assert.deepEqual(validateChartTransfer(chart),[]); assert.deepEqual(chart,before)
})
test('migration blocks duplicates, incomplete groups and missing statement classification', () => {
  assert.ok(validateChartTransfer([...chart,chart[1]]).some(error => /duplicate/.test(error)))
  assert.ok(validateChartTransfer(chart.filter(row => row.role !== 'accrued')).some(error => /one accrued/.test(error)))
  assert.ok(validateChartTransfer([{...chart[3],statement:''}]).some(error => /explicitly classify/.test(error)))
  assert.ok(validateChartTransfer([{...chart[1],statement:'balance_sheet'}]).some(error => /profit and loss/.test(error)))
  assert.ok(validateChartTransfer([{...chart[3],sourceCode:8410}]).some(error => /text/.test(error)))
})
