import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const backend=url('export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}')
const provider=url('export class AccountingProviderPartialError extends Error {} export const exportFinanceRecord=()=>{throw Error("unexpected default provider")};')
const source=readFileSync(new URL('../functions/_shared/finance-export-attempt.ts',import.meta.url),'utf8')
const {deliverFinanceExport}=await import(url(stripTypeScriptTypes(source).replace('./backend.ts',backend).replace('./accounting-providers.ts',provider)))
const {AccountingProviderPartialError}=await import(provider)
const input={providerCode:'erpnext'}
function db({claimError=false,completionError=false,completed=true,status='synced'}={}){const calls=[];return {calls,async rpc(name,args){calls.push({name,args});if(name.endsWith('begin_export'))return claimError?{error:{code:'42501'}}:{data:{token:'token'}};return completionError?{error:{message:'DB unavailable'}}:{data:{completed,status,message:status==='synced'?null:'Review changed source'}}}}}
test('reservation denial prevents provider side effects',async()=>{const d=db({claimError:true});let sent=false;await assert.rejects(deliverFinanceExport(d,'actor','queue','connection',input,async()=>{sent=true}),{status:403});assert.equal(sent,false)})
test('verified delivery finalises once and returns retained identity',async()=>{const d=db();const result=await deliverFinanceExport(d,'actor','queue','connection',input,async()=>({externalId:'ERP-1',externalObjectType:'Sales Invoice',responsePayload:{verified:true}}));assert.equal(result.externalId,'ERP-1');assert.equal(d.calls.length,2);assert.equal(d.calls[1].args.p_token,'token');assert.equal(d.calls[1].args.p_result.status,'synced')})
test('database completion failure never makes a second failure write or claims success',async()=>{for(const opts of [{completionError:true},{completed:false}]){const d=db(opts);await assert.rejects(deliverFinanceExport(d,'actor','queue','connection',input,async()=>({externalId:'ERP-1'})),{status:503});assert.equal(d.calls.length,2);assert.equal(d.calls[1].args.p_result.status,'synced')}})
test('source change at completion returns review instead of false synced response',async()=>{const d=db({status:'blocked'});await assert.rejects(deliverFinanceExport(d,'actor','queue','connection',input,async()=>({externalId:'ERP-1'})),{status:409})})
test('partial provider failure retains identity and mismatch evidence atomically',async()=>{const d=db({status:'blocked'});const error=Object.assign(new AccountingProviderPartialError('Mismatch'),{externalId:'ERP-1',externalObjectType:'Sales Invoice',requestPayload:{},readback:{status:'mismatch'}});await assert.rejects(deliverFinanceExport(d,'actor','queue','connection',input,async()=>{throw error}),{status:409});const r=d.calls[1].args.p_result;assert.equal(r.externalId,'ERP-1');assert.equal(r.issue,'provider_delivery_mismatch');assert.equal(r.status,'blocked')})
