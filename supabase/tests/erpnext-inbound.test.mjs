import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const read = name => readFileSync(new URL(`../functions/_shared/${name}.ts`, import.meta.url), 'utf8')
const url = s => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const decimal = url(stripTypeScriptTypes(read('accounting-readback')))
const readback = url(stripTypeScriptTypes(read('erpnext-readback')).replace('./accounting-readback.ts', decimal))
const transport = url(stripTypeScriptTypes(read('erpnext')).replace('import { HttpError } from "./backend.ts"', 'class HttpError extends Error {}'))
const inbound = url(stripTypeScriptTypes(read('erpnext-inbound')).replace('./erpnext.ts', transport).replace('./erpnext-readback.ts', readback).replace('./accounting-readback.ts', decimal))
const { evaluateErpNextInbound: evaluate } = await import(inbound)
const { parseErpNextExactJSON: parse } = await import(transport)
const event = { ACCIWH_ExternalID: 'SI-1', ACCIWH_ExternalObjectType: 'Sales Invoice', ACCIWH_ExternalCompany: 'Acme', ACCIWH_ExternalModifiedAt: '2026-09-17T12:30:00.123456' }
const input = { providerCode: 'erpnext', externalCompany: 'Acme', localTable: 'FIN_Documents', localId: 'local', typeCode: 'sl_invoice', documentDate: '2026-09-17', currencyCode: 'GBP', exchangeRate: 1, amount: 100, localAmount: 100, partyProviderId: 'CUST', lines: [], allocations: [] }
const document = { name: 'SI-1', doctype: 'Sales Invoice', company: 'Acme', modified: '2026-09-17 12:30:00.123456', docstatus: '1', posting_date: '2026-09-17', customer: 'CUST', currency: 'GBP', conversion_rate: '1', is_return: '0', grand_total: '100', base_grand_total: '100', rounding_adjustment: '0', base_rounding_adjustment: '0', disable_rounded_total: '1', items: [], net_total: '0', total_taxes_and_charges: '0', outstanding_amount: '100' }
const reference = { ACCIER_ID: 'ref', ACCIER_LocalID: 'local', ACCIER_LocalTable: 'FIN_Documents', ACCIER_SyncStatusCode: 'synced', ACCIER_LastPayloadJSON: { ...document, multideckCanonicalExport: input } }
test('exact JSON preserves monetary tokens and strings without accepting invalid JSON', () => {
  assert.deepEqual(parse('{"amount":9007199254740993.1234,"name":"123 \\" 456","enabled":true,"other":null,"exponent":1e-9}'), { amount: '9007199254740993.1234', name: '123 " 456', enabled: true, other: null, exponent: '1e-9' })
  for (const raw of ['{"x":01}', '{"x":NaN}', '{"x":1,}', 'undefined']) assert.throws(() => parse(raw))
})
test('echo is matched against retained canonical evidence and late events read current state', () => {
  assert.equal(evaluate(event, reference, document).outcome, 'matched')
  assert.equal(evaluate({ ...event, ACCIWH_ExternalModifiedAt: '2026-09-16 12:30:00' }, reference, document).outcome, 'matched')
  assert.equal(evaluate(event, reference, { ...document, modified: '2026-09-17 12:30:00.123455' }).outcome, 'retry')
  assert.equal(evaluate(event, reference, { ...document, modified: null }).outcome, 'retry')
})
test('external cancellations, wrong companies, modified money and settlements need review', () => {
  for (const patch of [{ docstatus: 2 }, { company: 'Other' }, { name: 'Other' }, { grand_total: '100.000000001' }, { outstanding_amount: '0' }]) {
    assert.equal(evaluate(event, reference, { ...document, ...patch }).outcome, 'review')
  }
})
test('provider-only, legacy and incomplete deliveries never turn green', () => {
  assert.equal(evaluate(event, null, document).outcome, 'review')
  assert.equal(evaluate(event, { ...reference, ACCIER_LastPayloadJSON: document }, document).outcome, 'review')
  assert.equal(evaluate(event, { ...reference, ACCIER_SyncStatusCode: 'failed' }, document).outcome, 'retry')
})

const { processErpNextInbound: processIncoming } = await import(inbound)
function workerFixture(patch = {}) {
  const results = []
  const rows = {
    ACCI_Connections: { ACCIC_StatusCode: 'active', ACCIC_ProviderCode: 'erpnext', ACCIC_ExternalTenantName: 'Acme', ACCIC_LegalEntityID: 'entity', ACCIC_SettingsJSON: {partySync:{siteOrigin:'https://erp.example.test'}} },
    cmp_LegalEntities: { Company_ID:'company', LegalEntity_IsActive:true },
    ACCI_ExternalRefs: [reference], ...patch,
  }
  return { results, async rpc(name, args) {
    if (name === 'multideck_erpnext_claim_inbound') return { data:[{...event,ACCIWH_ID:'receipt',ACCIWH_ConnectionID:'connection',ACCIWH_LeaseToken:'token'}],error:null }
    results.push(args); return {data:true,error:null}
  }, from(table) {
    const q={select(){return q},eq(){return q},limit(){return q},maybeSingle:async()=>({data:rows[table],error:null}),then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject)}};return q
  } }
}
globalThis.Deno={env:{get:()=> 'https://erp.example.test'}}
test('incoming worker refuses revoked scope before any provider read and retains review evidence',async()=>{
  const db=workerFixture({cmp_LegalEntities:{Company_ID:'company',LegalEntity_IsActive:false}})
  let reads=0;await processIncoming(db,async()=>{reads++;return document})
  assert.equal(reads,0);assert.equal(db.results[0].p_result.outcome,'review');assert.equal(db.results[0].p_token,'token')
})
test('incoming worker reads exact identity, records matches and retries provider failures',async()=>{
  const db=workerFixture();await processIncoming(db,async(type,name)=>{assert.equal(type,'Sales Invoice');assert.equal(name,'SI-1');return document})
  assert.equal(db.results[0].p_result.outcome,'matched')
  assert.equal(db.results[0].p_result.reviewedSite,'https://erp.example.test')
  const failed=workerFixture();await processIncoming(failed,async()=>{throw Error('private credential detail')})
  assert.equal(failed.results[0].p_result.outcome,'retry');assert.doesNotMatch(JSON.stringify(failed.results),/private credential/)
})
test('incoming worker never treats persistence failure as completed processing',async()=>{
  const db=workerFixture();const rpc=db.rpc.bind(db);db.rpc=async(name,args)=>name==='multideck_erpnext_finish_inbound'?{error:{code:'failure'}}:rpc(name,args)
  await assert.rejects(processIncoming(db,async()=>document),/could not be retained/)
})
