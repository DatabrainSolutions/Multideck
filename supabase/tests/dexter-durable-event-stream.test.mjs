import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/durable-event-stream.ts',import.meta.url),'utf8'))
const {durableEventStream}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('disconnect stops delivery while the one original task persists its result',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let saved=0;let background
 const stream=durableEventStream(async emit=>{emit({type:'active_run',runId:'one'});await gate;emit({type:'delta',delta:'answer'});saved++;emit({type:'complete'})},task=>background=task)
 const reader=stream.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/active_run/)
 await reader.cancel();release();await background
 assert.equal(saved,1);assert.equal((await reader.read()).done,true)
})
test('connected clients receive completion and a closed stream',async()=>{
 let background
 const stream=durableEventStream(async emit=>{emit({type:'complete',conversation:{id:'saved'}})},task=>background=task)
 const reader=stream.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/saved/)
 await background;assert.equal((await reader.read()).done,true)
})
