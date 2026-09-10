import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../../multideck.client/src/lib/dexter-request-recovery.ts',import.meta.url),'utf8'))
const {readDexterRecovery,writeDexterRecovery,clearDexterRecovery}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('tab recovery retains correction identity, isolates owners and cannot clear a newer request',()=>{
 const data=new Map();globalThis.sessionStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}
 const runId=crypto.randomUUID();const record={runId,clientSessionId:crypto.randomUUID(),conversationId:null,prompt:'Show three leads',model:'smart',createdAt:Date.now(),composerText:'Only two',correction:{id:crypto.randomUUID(),runId,input:'Only two'}}
 writeDexterRecovery('alice',record)
 assert.deepEqual(readDexterRecovery('alice'),record)
 assert.equal(readDexterRecovery('bob'),null)
 const newer={...record,runId:crypto.randomUUID(),correction:undefined}
 writeDexterRecovery('alice',newer);clearDexterRecovery('alice',runId)
 assert.equal(readDexterRecovery('alice').runId,newer.runId)
 clearDexterRecovery('alice',newer.runId);assert.equal(readDexterRecovery('alice'),null)
 writeDexterRecovery('alice',{...record,createdAt:Date.now()-86400001});assert.equal(readDexterRecovery('alice'),null)
 writeDexterRecovery('alice',{...record,correction:{...record.correction,runId:crypto.randomUUID()}});assert.equal(readDexterRecovery('alice'),null)
 globalThis.sessionStorage={getItem:()=>{throw Error('disabled')},setItem:()=>{throw Error('disabled')}}
 assert.equal(readDexterRecovery('alice'),null);assert.doesNotThrow(()=>writeDexterRecovery('alice',record))
})
