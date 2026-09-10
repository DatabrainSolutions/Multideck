import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/async-domain-reads.ts',import.meta.url),'utf8'))
const {asyncDomainReads}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const call=(id,domain='leads')=>({name:'query_data_domain',call_id:id,arguments:JSON.stringify({domain,search:null,take:5})})
test('independent reads start before either finishes and terminal dispatch reuses the original result',async()=>{
 const started=[],finish=[]
 const run=asyncDomainReads(args=>new Promise(resolve=>{started.push(args.domain);finish.push(resolve)}))
 const first=run(call('a'));const second=run(call('b','deals'))
 await Promise.resolve();assert.deepEqual(started,['leads','deals'])
 assert.equal(run(call('a')),first)
 finish[1]({data:['deal']});finish[0]({data:['lead']})
 assert.deepEqual(await first,{data:['lead']});assert.deepEqual(await second,{data:['deal']})
 assert.equal(started.length,2)
})
test('write names, malformed inputs and changed call identities never reach the read executor',()=>{
 let started=0;const run=asyncDomainReads(async()=>{started++})
 assert.throws(()=>run({...call('a'),name:'update_company'}),/invalid_async/)
 assert.throws(()=>run({...call('a'),arguments:'[]'}),/invalid_async/)
 run(call('a'))
 assert.throws(()=>run(call('a','deals')),/call_id_reused/)
 assert.equal(started,0)
})
test('read failure is retained as a recoverable tool result and does not silently repeat the query',async()=>{
 let attempts=0;const run=asyncDomainReads(async()=>{attempts++;throw new Error('private backend detail')})
 const result=await run(call('a'));assert.equal(result.code,'domain_read_failed')
 assert.equal(JSON.stringify(result).includes('private'),false)
 assert.equal(await run(call('a')),result);assert.equal(attempts,1)
})
