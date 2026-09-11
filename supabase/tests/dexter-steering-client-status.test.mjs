import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../../multideck.client/src/lib/dexter-steering-status.ts',import.meta.url),'utf8'))
const {mergeSteeringStatus}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('a late HTTP acknowledgement cannot undo streamed progress or commit',()=>{
 assert.equal(mergeSteeringStatus('queued','pending'),'queued')
 assert.equal(mergeSteeringStatus('incorporated','queued'),'incorporated')
 assert.equal(mergeSteeringStatus('incorporated','unconfirmed'),'incorporated')
 assert.equal(mergeSteeringStatus('unconfirmed','incorporated'),'incorporated')
 assert.equal(mergeSteeringStatus('failed','pending'),'failed')
 assert.equal(mergeSteeringStatus('queued','failed'),'failed')
})
