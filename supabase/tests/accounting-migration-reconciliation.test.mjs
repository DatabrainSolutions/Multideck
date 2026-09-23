import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const load = name => stripTypeScriptTypes(readFileSync(new URL(`../functions/_shared/${name}.ts`, import.meta.url),'utf8'))
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const { reconcileAccountingMigration: reconcile } = await import(url(load('accounting-migration-reconciliation').replace('./cost-accrual-model.ts',url(load('cost-accrual-model')))))
const accounts = [
  {id:'ar',code:'6210.00.00',active:true,control:'receivables'},
  {id:'ap',code:'8210.00.00',active:true,control:'payables'},
  {id:'bank',code:'0010.00.00',active:true,control:null},
]
const item = extra => ({sourceId:'inv1',partyCode:'C001',reference:'INV-1',accountCode:'6210.00.00',kind:'customer_invoice',documentDate:'2026-08-31',dueDate:'2026-09-30',currency:'GBP',originalAmount:'120',outstandingAmount:'100',outstandingBaseAmount:'100',...extra})
const batch = extra => ({cutoffDate:'2026-09-01',baseCurrency:'GBP',trialBalance:[{accountCode:'6210.00.00',debit:'100',credit:'0'},{accountCode:'8210.00.00',debit:'0',credit:'60'},{accountCode:'0010.00.00',debit:'0',credit:'40'}],openItems:[item({}),item({sourceId:'sup1',partyCode:'S001',kind:'supplier_invoice',accountCode:'8210.00.00',outstandingAmount:'60',outstandingBaseAmount:'60'})],...extra})
test('balanced TB reconciles each control without creating second GL postings for open items',()=>{
  const input=batch(),before=structuredClone(input),result=reconcile(input,accounts,'GBP')
  assert.equal(result.reconciled,true);assert.equal(result.postingAuthorised,false)
  assert.equal(result.postingStrategy,'trial_balance_once_open_items_without_additional_gl')
  assert.deepEqual(result.controls.map(row=>row.difference),['0.0000','0.0000']);assert.deepEqual(input,before)
})
test('credits and unapplied receipts/payments use the correct control signs',()=>{
  const input=batch();input.openItems=[item({outstandingAmount:'110',outstandingBaseAmount:'110'}),item({sourceId:'credit',kind:'customer_credit',outstandingAmount:'4',outstandingBaseAmount:'4'}),item({sourceId:'receipt',kind:'customer_receipt',outstandingAmount:'6',outstandingBaseAmount:'6'}),item({sourceId:'supplier',kind:'supplier_invoice',accountCode:'8210.00.00',outstandingAmount:'80',outstandingBaseAmount:'80'}),item({sourceId:'sc',kind:'supplier_credit',accountCode:'8210.00.00',outstandingAmount:'7',outstandingBaseAmount:'7'}),item({sourceId:'sp',kind:'supplier_payment',accountCode:'8210.00.00',outstandingAmount:'13',outstandingBaseAmount:'13'})]
  assert.equal(reconcile(input,accounts,'GBP').reconciled,true)
})
test('foreign currency retains source carrying value, not a newly calculated exchange rate',()=>{
  const input=batch();input.openItems[0]=item({currency:'EUR',originalAmount:'150',outstandingAmount:'125',outstandingBaseAmount:'100'})
  assert.equal(reconcile(input,accounts,'GBP').reconciled,true)
})
test('a globally balanced TB cannot conceal control mismatches or omitted open transactions',()=>{
  const input=batch();input.openItems=[]
  const result=reconcile(input,accounts,'GBP');assert.equal(result.reconciled,false)
  assert.equal(result.issues.filter(row=>row.area==='control').length,2)
})
test('duplicate IDs and balances, unsupported kind and wrong control are rejected',()=>{
  const input=batch();input.trialBalance.push({...input.trialBalance[2]});input.openItems.push(item({}));input.openItems.push(item({sourceId:'bad',kind:'supplier_invoice'}))
  const issues=reconcile(input,accounts,'GBP').issues.map(row=>row.message).join(' ')
  assert.match(issues,/Duplicate account/);assert.match(issues,/Duplicate source/);assert.match(issues,/corresponding/)
  assert.equal(reconcile(batch({openItems:[item({kind:'invented'})]}),accounts,'GBP').reconciled,false)
})
test('unknown/inactive accounts, invalid dates, wrong base currency and invalid amounts fail closed',()=>{
  for(const input of [batch({cutoffDate:'2026-02-30'}),batch({baseCurrency:'EUR'}),batch({openItems:[item({documentDate:'2026-09-02'})]}),batch({openItems:[item({outstandingAmount:'121'})]}),batch({openItems:[item({outstandingAmount:'1e2'})]}),batch({openItems:[item({outstandingBaseAmount:'99'})]}),batch({openItems:[item({partyCode:''})]})]) assert.equal(reconcile(input,accounts,'GBP').reconciled,false)
  assert.equal(reconcile(batch(),accounts.map(a=>({...a,active:false})),'GBP').reconciled,false)
  assert.equal(reconcile(batch(),accounts.slice(1),'GBP').reconciled,false)
})
test('closing balances reject debit and credit turnover; malformed upload rows return issues',()=>{
  const input=batch();input.trialBalance[0]={accountCode:'6210.00.00',debit:'120',credit:'20'}
  assert.ok(reconcile(input,accounts,'GBP').issues.some(row=>/turnover/.test(row.message)))
  for(const invalid of [null,{}, {trialBalance:[null],openItems:[null]}, {trialBalance:[],openItems:'bad'}]) assert.equal(reconcile(invalid,accounts,'GBP').reconciled,false)
})
test('four-decimal and leading-zero account data remains exact',()=>{
  const input=batch(); input.trialBalance[0].debit='100.0001';input.trialBalance[2].credit='40.0001';input.openItems[0].outstandingAmount='100.0001';input.openItems[0].outstandingBaseAmount='100.0001'
  const result=reconcile(input,accounts,'GBP');assert.equal(result.reconciled,true);assert.equal(result.totals.debit,'100.0001')
})
