import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = name => readFileSync(new URL(`../functions/_shared/${name}.ts`, import.meta.url), 'utf8')
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
const transport = moduleUrl(stripTypeScriptTypes(source('erpnext')).replace('import { HttpError } from "./backend.ts"', 'class HttpError extends Error {}'))
const catchup = moduleUrl(stripTypeScriptTypes(source('erpnext-catchup')).replace('./erpnext.ts', transport))
const { normaliseErpNextVersion, scanLowerBound, scanQuery, processErpNextCatchup } = await import(catchup)
globalThis.Deno = { env: { get: () => 'https://erp.example.test' } }

test('checkpoint windows overlap and reject unverified versions', () => {
  assert.equal(normaliseErpNextVersion('2026-09-23T01:02:03.4'), '2026-09-23 01:02:03.400000')
  assert.equal(normaliseErpNextVersion('2026-09-23T01:02:03Z'), null)
  assert.equal(scanLowerBound('2026-09-23 01:02:03.400000'), '2026-09-23 00:02:03.400000')
  assert.equal(scanLowerBound('2026-09-23 01:02:03.400123'), '2026-09-23 00:02:03.400123')
  assert.equal(scanLowerBound(null), '1900-01-01 00:00:00.000000')
  const query = new URLSearchParams(scanQuery('Exact Co', '2026-09-23 00:00:00.000000', '2026-09-23 02:00:00.000000', null, null))
  assert.equal(query.get('order_by'), 'modified asc, name asc')
  assert.equal(query.get('limit_start'), null)
  assert.deepEqual(JSON.parse(query.get('filters')), [['company','=','Exact Co'],['modified','>=','2026-09-23 00:00:00.000000'],['modified','<=','2026-09-23 02:00:00.000000']])
  const same = new URLSearchParams(scanQuery('Exact Co', '2026-09-23 00:00:00.000000', '2026-09-23 02:00:00.000000', '2026-09-23 01:00:00.000000', 'SI-1', 100, true))
  assert.deepEqual(JSON.parse(same.get('filters')), [['company','=','Exact Co'],['modified','=','2026-09-23 01:00:00.000000'],['name','>','SI-1']])
})

function database({ site = 'https://erp.example.test', active = true, state = null, fail = false, backlog = [], connections = null } = {}) {
  const calls = []
  const rows = {
    ACCI_Connections: connections ?? [{ ACCIC_ID: 'connection', ACCIC_ExternalTenantName: 'Exact Co', ACCIC_LegalEntityID: 'entity', ACCIC_SettingsJSON: {partySync:{siteOrigin:site}} }],
    cmp_LegalEntities: { Company_ID: 'company', LegalEntity_IsActive: active },
    ACCI_ProviderScanCursors: state,
    ACCI_WebhookEvents: backlog,
  }
  return { calls, from(table) {
    const q = {select(){return q},eq(){return q},in(){return q},limit(){return q},maybeSingle:async()=>({data:rows[table],error:null}),then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject)}}
    return q
  }, async rpc(name,args) { calls.push({name,args}); return fail ? {error:{message:'failed'}} : {data:true,error:null} } }
}

test('a complete provider page is retained before its checkpoint advances', async () => {
  const db = database()
  const reads = []
  const request = async path => {
    reads.push(path)
    const type = decodeURIComponent(path.split('/api/resource/')[1].split('?')[0])
    const params = new URLSearchParams(path.split('?')[1])
    const latest = params.get('limit_page_length') === '1' && params.get('order_by') === 'modified desc'
    if (type !== 'Sales Invoice') return {data:[]}
    if (latest || params.get('limit_page_length') === '100') return {data:[{name:'SI-1',modified:'2026-09-23 01:00:00',company:'Exact Co'}]}
    return {data:[]}
  }
  const result = await processErpNextCatchup(db,request)
  assert.equal(db.calls.length,1)
  assert.equal(db.calls[0].args.p_rows[0].name,'SI-1')
  assert.equal(db.calls[0].args.p_rows[0].modified,'2026-09-23 01:00:00.000000')
  assert.equal(db.calls[0].args.p_has_more,false)
  assert.equal(db.calls[0].args.p_site,'https://erp.example.test')
  assert.equal(result[0].complete,true)
  assert.equal(reads.length,6)
})

test('foreign site, revoked entity and provider failure cannot advance a checkpoint', async () => {
  for (const input of [{site:'https://other.example.test'}, {active:false}]) {
    const db=database(input)
    await processErpNextCatchup(db,async()=>{throw Error('provider must not be called')})
    assert.equal(db.calls.length,0)
  }
  const db=database()
  await assert.rejects(processErpNextCatchup(db,async()=>{throw Error('outage')}),/outage/)
  assert.equal(db.calls.length,0)
})

test('a failed atomic page write is never reported as complete', async () => {
  const db=database({fail:true,state:{revision:4,watermark:'2026-09-22T00:00:00',upper_bound:'2026-09-23T01:00:00',cursor_modified:'2026-09-22T12:00:00',cursor_name:'SI-0'}})
  await assert.rejects(processErpNextCatchup(db,async()=>({data:[]})),/not retained/)
  assert.equal(db.calls[0].args.p_revision,4)
  assert.equal(db.calls[0].args.p_cursor_name,'SI-0')
})

test('provider restore behind the checkpoint fails closed', async () => {
  const db=database({state:{revision:3,watermark:'2026-09-23T02:00:00.123456',upper_bound:null,cursor_modified:null,cursor_name:null}})
  await assert.rejects(processErpNextCatchup(db,async()=>({data:[{name:'SI-OLD',modified:'2026-09-23 00:00:00',company:'Exact Co'}]})),/older than its retained checkpoint/)
  assert.equal(db.calls.length,0)
})

test('a provider page cap cannot make an incomplete scan look complete', async () => {
  const db=database()
  const request=async path => {
    const type=decodeURIComponent(path.split('/api/resource/')[1].split('?')[0])
    if(type!=='Sales Invoice') return {data:[]}
    const query=new URLSearchParams(path.split('?')[1])
    if(query.get('order_by')==='modified desc') return {data:[{name:'SI-2',modified:'2026-09-23 01:00:00',company:'Exact Co'}]}
    const filters=JSON.parse(query.get('filters'))
    if(filters.some(item=>item[0]==='name' && item[1]==='>')) return {data:[{name:'SI-2',modified:'2026-09-23 01:00:00',company:'Exact Co'}]}
    if(query.get('limit_page_length')==='1') return {data:[]}
    return {data:[{name:'SI-1',modified:'2026-09-23 01:00:00',company:'Exact Co'}]}
  }
  const result=await processErpNextCatchup(db,request)
  assert.equal(db.calls[0].args.p_rows.length,1)
  assert.equal(db.calls[0].args.p_has_more,true)
  assert.equal(result[0].complete,false)
})

test('a latest document missing from the bounded list cannot advance', async () => {
  const db=database()
  const request=async path => {
    const type=decodeURIComponent(path.split('/api/resource/')[1].split('?')[0])
    const query=new URLSearchParams(path.split('?')[1])
    return {data:type==='Sales Invoice' && query.get('order_by')==='modified desc'
      ? [{name:'SI-1',modified:'2026-09-23 01:00:00',company:'Exact Co'}] : []}
  }
  await assert.rejects(processErpNextCatchup(db,request),/absent from its bounded scan/)
  assert.equal(db.calls.length,0)
})

test('equal modified timestamps resume by document ID without offset paging', async () => {
  const db=database({state:{revision:2,watermark:null,upper_bound:'2026-09-23T02:00:00',cursor_modified:'2026-09-23T01:00:00',cursor_name:'SI-1'}})
  const request=async path => {
    const type=decodeURIComponent(path.split('/api/resource/')[1].split('?')[0])
    if(type!=='Sales Invoice') return {data:[]}
    const query=new URLSearchParams(path.split('?')[1])
    const filters=JSON.parse(query.get('filters'))
    if(filters.some(item=>item[0]==='name' && item[1]==='>')) {
      return {data:query.get('limit_page_length')==='100'?[{name:'SI-2',modified:'2026-09-23 01:00:00',company:'Exact Co'}]:[]}
    }
    return {data:query.get('limit_page_length')==='99'?[{name:'SI-3',modified:'2026-09-23 02:00:00',company:'Exact Co'}]:[]}
  }
  const result=await processErpNextCatchup(db,request)
  assert.deepEqual(db.calls[0].args.p_rows.map(row=>row.name),['SI-2','SI-3'])
  assert.equal(db.calls[0].args.p_cursor_name,'SI-1')
  assert.equal(result[0].complete,true)
})

test('a large pending inbound backlog pauses discovery without moving the checkpoint', async () => {
  const db=database({backlog:Array.from({length:100},(_,i)=>({ACCIWH_ID:String(i)}))})
  const result=await processErpNextCatchup(db,async()=>{throw Error('provider listing must wait')})
  assert.equal(result[0].status,'waiting_for_inbound_backlog')
  assert.equal(db.calls.length,0)
})

test('ambiguous ERPNext company bindings fail before provider access', async () => {
  const connection={ACCIC_ID:'one',ACCIC_ExternalTenantName:'Exact Co',ACCIC_LegalEntityID:'entity',ACCIC_SettingsJSON:{partySync:{siteOrigin:'https://erp.example.test'}}}
  const db=database({connections:[connection,{...connection,ACCIC_ID:'two'}]})
  await assert.rejects(processErpNextCatchup(db,async()=>{throw Error('provider must not be called')}),/one connection/)
  assert.equal(db.calls.length,0)
})
