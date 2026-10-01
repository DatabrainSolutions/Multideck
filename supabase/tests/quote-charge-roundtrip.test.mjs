import assert from 'node:assert/strict'
import test from 'node:test'
import { mapping } from './quote-cargo-client-fixture.mjs'

const id = '11111111-1111-4111-8111-111111111111'
const customerId = '22222222-2222-4222-8222-222222222222'
const row = { id, code: 'TEST-FLOW', description: 'Internal test', creditor: 'Test supplier',
  customerId, costCurrency: 'GBP', sellCurrency: 'GBP', costAmount: 100, sellAmount: 150,
  localCost: 100, localSell: 150, costExchange: 1, sellExchange: 1,
  costRoeSource: 'override', sellRoeSource: 'job', department: '', internalNotes: 'Keep internal', additionalDetail: 'Customer note' }
const payload = () => mapping.quoteSavePayload({...mapping.newQuoteDraft, currency:'GBP'},[row],null)
const version = (charges, current=true) => ({CusQuoteVersion_IsCurrent:current,CusQuoteVersion_SnapshotJSON:{quote:{charges}}})

test('saved charge code, stable identity, party, exchange source and notes round-trip', () => {
  const saved = payload()
  const workspace = {versions:[version(saved.charges)],charges:[{...saved.charges[0],id:'rebuilt-sql-row',code:undefined}]}
  const [read] = mapping.quoteChargesFromWorkspace(workspace)
  for (const field of ['id','code','customerId','costAmount','sellAmount','costRoeSource','sellRoeSource','internalNotes','additionalDetail']) assert.equal(read[field],row[field],field)
  const revised = mapping.quoteSavePayload({...mapping.newQuoteDraft,currency:'GBP'},[{...read,costAmount:125,localCost:125}],null)
  assert.equal(revised.charges[0].id,id)
  assert.equal(revised.charges[0].code,'TEST-FLOW')
  assert.equal(revised.charges[0].costAmount,125)
  assert.equal(saved.charges[0].costAmount,100)
})
test('selected historical version never inherits current charge values', () => {
  const old=version(payload().charges,false), current=version([{...payload().charges[0],code:'NEW',costAmount:125}])
  const workspace={versions:[current,old],charges:current.CusQuoteVersion_SnapshotJSON.quote.charges}
  assert.equal(mapping.quoteChargesFromWorkspace(workspace,old)[0].code,'TEST-FLOW')
  assert.equal(mapping.quoteChargesFromWorkspace(workspace,old)[0].costAmount,100)
})
test('an empty saved list stays empty, while legacy absent snapshots use known rows', () => {
  const charges=payload().charges
  assert.deepEqual(mapping.quoteChargesFromWorkspace({versions:[version([])],charges}),[])
  assert.equal(mapping.quoteChargesFromWorkspace({versions:[],charges})[0].id,id)
})
test('new saves bill the visible customer, never an older hidden payer', () => {
  const draft={...mapping.newQuoteDraft,customerId,customer:'Visible customer',customerAddress:'Visible billing address',customerContact:'Visible contact',customerEmail:'visible@example.test',clientCode:'VISIBLE',
    payerOrgId:id,payerName:'Old payer',payerAddress:'Old address',payerContact:'Old contact',payerEmail:'old@example.test',payerCode:'OLD'}
  const before=structuredClone(draft), saved=mapping.quoteSavePayload(draft,[],null)
  assert.deepEqual(saved.payer,{orgId:customerId,name:'Visible customer',address:'Visible billing address',contact:'Visible contact',email:'visible@example.test',code:'VISIBLE'})
  assert.equal(saved.shipmentFacts.payerCode,'VISIBLE')
  assert.equal(saved.shipmentFacts.payerEmail,'visible@example.test')
  assert.deepEqual(draft,before)
})
test('saved billing-address override survives directory enrichment', () => {
  const workspace={quote:{id:'q',reference:'JQ-TEST',lifecycle:'draft',customerId,customerName:'Customer',shipmentFacts:{customerAddress:'Saved override'},payer:{orgId:id,name:'Old payer'},terms:'Old payer terms'},versions:[],charges:[],totals:{cost:0,sell:0,profit:0,marginPct:null}}
  const lookups={organisations:[{id:customerId,name:'Customer',contacts:[],addresses:[{address:'New directory address'}],quoteTerms:{terms:'Customer terms'}}],offices:[],departments:[],users:[],modes:[],shipmentTypes:[]}
  const read=mapping.quoteRecordFromWorkspace(workspace,lookups)
  assert.equal(read.customerAddress,'Saved override')
  assert.equal(read.terms,'Customer terms')
  assert.equal(read.customerTermsSource,'Customer')
  const historic=mapping.quoteRecordFromWorkspace(workspace,null)
  assert.equal(historic.terms,'Old payer terms')
  workspace.quote.payer.orgId=customerId
  workspace.quote.terms='Agreed customer-specific terms'
  assert.equal(mapping.quoteRecordFromWorkspace(workspace,lookups).terms,'Agreed customer-specific terms')
})
