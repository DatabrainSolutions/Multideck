import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = readFileSync(new URL('../functions/quote-response/public-view.ts', import.meta.url), 'utf8')
const { customerQuoteResponseView } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
const internal = {
  state: 'active', expiresAt: null, documentId: 'document-1', recipientEmail: 'PRIVATE RECIPIENT',
  internalNotes: 'PRIVATE TOP LEVEL', _brandingCompanyId: 'PRIVATE COMPANY ID',
  quote: { id: 'quote-1', reference: 'JQ20022', versionNumber: 1, customerName: 'PRIVATE PARTY',
    snapshot: { savedAt: 'PRIVATE SNAPSHOT', quote: {
      currency: 'GBP', loadingPoint: 'GBFXT', dischargePoint: 'NLRTM', validTo: '2026-09-20',
      supplierId: 'PRIVATE SUPPLIER', payer: { bank: 'PRIVATE BANK' }, shipmentFacts: { supplierOptions: 'PRIVATE OPTIONS' },
      charges: [
        { sellAmount: 100, sellCurrency: 'GBP', costAmount: 80, costCurrency: 'USD', costRoe: 1.1, margin: 20, profit: 20, supplierId: 'PRIVATE SUPPLIER', internalNotes: 'PRIVATE COST' },
        { sellAmount: '10.125000', sellCurrency: 'GBP', showToCustomer: true, customerNotes: 'PRIVATE UNREVIEWED CONTENT' },
        { sellAmount: 999, sellCurrency: 'GBP', showToCustomer: false, description: 'PRIVATE HIDDEN LINE' },
      ],
    } },
  },
}

test('public response exports only the PDF summary, never operational/commercial snapshots', () => {
  const before = structuredClone(internal)
  assert.deepEqual(customerQuoteResponseView(internal), {
    state: 'active', expiresAt: null, documentId: 'document-1', quote: {
      id: 'quote-1', reference: 'JQ20022', versionNumber: 1, snapshot: { quote: {
        currency: 'GBP', loadingPoint: 'GBFXT', dischargePoint: 'NLRTM', validTo: '2026-09-20',
        charges: [{sellCurrency:'GBP',sellAmount:100,sellLocal:undefined},{sellCurrency:'GBP',sellAmount:'10.125000',sellLocal:undefined}],
      } },
    },
  })
  assert.doesNotMatch(JSON.stringify(customerQuoteResponseView(internal)), /PRIVATE|costAmount|costCurrency|margin|profit|999/)
  assert.deepEqual(internal, before)
})

test('new and nested fields cannot hitchhike through allowlisted scalar values', () => {
  const changed = structuredClone(internal)
  changed.quote.reference = { secret: 'PRIVATE' }
  changed.quote.versionNumber = { secret: 'PRIVATE' }
  changed.quote.snapshot.quote.currency = { secret: 'PRIVATE' }
  changed.quote.snapshot.quote.charges = [{sellCurrency:{secret:'PRIVATE'},sellAmount:{secret:'PRIVATE'},sellLocal:'PRIVATE'}, null, 'PRIVATE']
  assert.doesNotMatch(JSON.stringify(customerQuoteResponseView(changed)), /PRIVATE|secret/)
})

test('terminal links disclose only their outcome even if upstream includes old snapshots', () => {
  for (const state of ['expired','revoked']) assert.deepEqual(customerQuoteResponseView({...internal,state}), {state})
  assert.deepEqual(customerQuoteResponseView({...internal,state:'responded',decision:'accepted',respondedAt:'2026-09-06'}), {state:'responded',decision:'accepted',respondedAt:'2026-09-06'})
  for (const state of [undefined,'pending','unknown']) assert.throws(()=>customerQuoteResponseView({...internal,state}))
})

test('real endpoint sanitises data before document attachment and response emission', () => {
  const endpoint = readFileSync(new URL('../functions/quote-response/index.ts', import.meta.url), 'utf8')
  assert.match(endpoint, /attachQuoteDocument\(admin, customerQuoteResponseView\(data\)\)/)
  assert.doesNotMatch(endpoint, /admin\.schema\("quote_api"\)/)
  assert.match(endpoint, /attachQuoteBrand\(admin, companyId, view\)/)
})

test('branding uses only the validated RPC company context and a bounded public contract', async () => {
  const endpoint = readFileSync(new URL('../functions/quote-response/index.ts', import.meta.url), 'utf8')
  const start = endpoint.indexOf('function publicBrandContract(')
  const end = endpoint.indexOf('function readNamedKey(', start)
  assert.ok(start>=0 && end>start)
  const calls=[]
  const attach = new Function('readConfiguredTenantBrand',stripTypeScriptTypes(endpoint.slice(start,end))+';return attachQuoteBrand;')(
    async (_admin,id)=>{calls.push(id);return {displayName:'Test brand',logoUrl:'https://example.test/logo.svg',primaryColor:'#316FAB',internalSecret:'PRIVATE'}})
  const result=await attach({},'validated-company',customerQuoteResponseView(internal))
  assert.deepEqual(calls,['validated-company'])
  assert.equal(result.branding.displayName,'Test brand')
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|_brandingCompanyId|internalSecret/)
  const fallback=await attach({},'',{state:'revoked'})
  assert.deepEqual(fallback,{state:'revoked',branding:null})
  assert.deepEqual(calls,['validated-company'])
})
