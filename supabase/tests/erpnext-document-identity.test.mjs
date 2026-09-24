import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
let records=[],creates=0,field=true,lost=false
const input={externalCompany:'Acme',localTable:'FIN_Documents',localId:'local-1',typeCode:'sl_invoice'}
globalThis.Deno={env:{get:()=> 'https://tenant.supabase.co'}}
globalThis.__identity={
 async list(type,fields,filters){return type==='Custom Field'?(field?[{fieldtype:'Data',unique:1}]:[]):records.filter(x=>x.custom_multideck_document_key===filters[0][2])},
 async create(type,payload){creates++;if(records.some(x=>x.custom_multideck_document_key===payload.custom_multideck_document_key))throw Error('unique violation');const result={...payload,name:`ERP-${creates}`};records.push(result);if(lost)throw Error('response lost');return result},
}
const transport=url('export const erpNextList=(...args)=>globalThis.__identity.list(...args);export const erpNextCreate=(...args)=>globalThis.__identity.create(...args);')
const backend=url('export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}')
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/_shared/erpnext-document-identity.ts',import.meta.url),'utf8')).replace('./erpnext.ts',transport).replace('./backend.ts',backend)
const {ensureErpNextDocument:ensure}=await import(url(source))
test('missing unique field blocks before any provider creation',async()=>{field=false;await assert.rejects(ensure(input,'Sales Invoice',{company:'Acme'}),/unique Multideck/);assert.equal(creates,0);field=true})
test('lost POST response and subsequent retry recover the same unique document',async()=>{lost=true;const first=await ensure(input,'Sales Invoice',{company:'Acme'});assert.equal(first.externalId,'ERP-1');assert.deepEqual(await ensure(input,'Sales Invoice',{company:'Acme'}),first);assert.equal(creates,1);lost=false})
test('concurrent deliveries converge on the provider unique identity',async()=>{records=[];creates=0;const result=await Promise.all(Array.from({length:8},()=>ensure(input,'Sales Invoice',{company:'Acme'})));assert.equal(new Set(result.map(item=>item.externalId)).size,1);assert.equal(records.length,1)})
test('foreign company and duplicate identities fail closed',async()=>{records[0].company='Other';await assert.rejects(ensure(input,'Sales Invoice',{company:'Acme'}),/conflicting/);records[0].company='Acme';records.push({...records[0],name:'DUPLICATE'});await assert.rejects(ensure(input,'Sales Invoice',{company:'Acme'}),/conflicting/)})
