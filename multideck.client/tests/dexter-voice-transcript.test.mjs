import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const contract=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/dexter-voice/contract.ts',import.meta.url),'utf8'))
const contractUrl=`data:text/javascript;base64,${Buffer.from(contract).toString('base64')}`
const source=stripTypeScriptTypes(readFileSync(new URL('../src/lib/dexter-voice-transcript.ts',import.meta.url),'utf8'))
 .replace('../../../supabase/functions/dexter-voice/contract',contractUrl)
const {mergeVoiceTranscript}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const start='2026-09-17T10:00:00.000Z'
const fragment=(role,delta,startMs,endMs,id)=>({role,delta,startMs,endMs,id})
test('live input and speech become normal ordered chat messages without initiating work',()=>{
 const transcript=[fragment('user','Find ',0,100,'a'),fragment('user','booking AB123.',100,200,'b'),fragment('assistant','I will check.',500,800,'c')]
 const rows=mergeVoiceTranscript([],[{id:'session',created_at:start,transcript}])
 assert.deepEqual(rows.map(row=>[row.role,row.content]),[['user','Find booking AB123.'],['assistant','I will check.']])
 assert.ok(rows.every(row=>row.id.startsWith('voice-')&&row.voiceTranscript))
 assert.ok(rows.every(row=>!row.pendingAction&&!row.serverId))
})
test('speech replaces duplicate request/reply text while retaining real approval cards and records',()=>{
 const messages=[{id:'user',role:'user',content:'Find booking AB123.',createdAt:start},
  {id:'assistant',role:'assistant',content:'A detailed response',createdAt:start,responseToUserMessageId:'user',pendingActions:[{id:'approval',status:'pending'}],recordTables:[{id:'table'}]}]
 const transcript=[fragment('user','Find booking AB123.',0,200,'a'),fragment('assistant','Your booking ',500,800,'b'),fragment('assistant','needs review.',800,1000,'c')]
 const result=mergeVoiceTranscript(messages,[{id:'session',created_at:start,transcript}])
 assert.equal(result.length,2);assert.equal(result[1].content,'Your booking needs review.')
 assert.deepEqual(result[1].pendingActions,messages[1].pendingActions)
 assert.deepEqual(result[1].recordTables,messages[1].recordTables)
 assert.equal(messages[1].content,'A detailed response')
})
test('overlapping speech is kept, and older identical requests are not overwritten',()=>{
 const messages=[{id:'old',role:'user',content:'Hello',createdAt:'2026-09-16T10:00:00Z'}]
 const transcript=[fragment('assistant','Hello ',0,300,'a'),fragment('user','Hello',100,250,'b'),fragment('assistant','there.',300,600,'c')]
 const result=mergeVoiceTranscript(messages,[{id:'session',created_at:start,transcript}])
 assert.equal(result.length,4);assert.equal(result[1].content,'Hello');assert.equal(result[2].content,'Hello');assert.equal(result[3].content,'there.')
})

test('greeting, follow-up and tool request stay separate when a legacy combined request arrives',()=>{
 const transcript=[fragment('user','Hello',1800,2000,'a'),fragment('assistant','Hey! What’s on your mind?',1800,2600,'b'),
  fragment('user','How are you today',5600,6200,'c'),fragment('assistant','I’m well, thank you.',6000,7600,'d'),
  fragment('user','What leads do I have in the system',10200,11600,'e'),fragment('assistant','Checking your leads now.',11800,12600,'f'),
  fragment('assistant','There are three leads.',23200,24000,'g')]
 const sessions=[{id:'session',created_at:start,transcript}]
 const before=mergeVoiceTranscript([],sessions)
 const messages=[{id:'saved-user',role:'user',content:'Hello How are you today What leads do I have in the system',createdAt:new Date(Date.parse(start)+11700).toISOString()},
  {id:'saved-answer',role:'assistant',responseToUserMessageId:'saved-user',content:'There are three leads.',createdAt:new Date(Date.parse(start)+22000).toISOString(),recordTables:[{id:'leads'}],pendingActions:[{id:'approval'}]}]
 const after=mergeVoiceTranscript(messages,sessions)
 assert.equal(after.length,7)
 assert.deepEqual(after.map(row=>[row.renderKey,row.role,row.content]),before.map(row=>[row.renderKey,row.role,row.content]))
 assert.deepEqual(after.at(-1).recordTables,[{id:'leads'}])
 assert.deepEqual(after.at(-1).pendingActions,[{id:'approval'}])
 assert.equal(after.filter(row=>row.pendingActions).length,1)
 assert.equal(after[4].id,'saved-user')
 assert.deepEqual(mergeVoiceTranscript(messages,JSON.parse(JSON.stringify(sessions))),after)
})

test('nearby exchanges and late caption fragments never compact across speakers',()=>{
 const transcript=[fragment('user','Hello',0,200,'a'),fragment('assistant','Hi.',200,400,'b'),
  fragment('user','Find ',600,800,'c'),fragment('user','my leads.',800,1000,'d'),fragment('assistant','Checking.',1100,1400,'e')]
 const session={id:'session',created_at:start,transcript}
 assert.deepEqual(mergeVoiceTranscript([],[session]).map(row=>row.content),['Hello','Hi.','Find my leads.','Checking.'])
 const delivered=[...transcript.slice(0,3),transcript[4],transcript[3],transcript[4]]
 assert.deepEqual(mergeVoiceTranscript([],[{...session,transcript:delivered}]),mergeVoiceTranscript([],[session]))
})

test('a short caption cannot steal a longer or repeated typed request',()=>{
 const messages=[{id:'typed',role:'user',content:'Hello, find my leads',createdAt:start}]
 const result=mergeVoiceTranscript(messages,[{id:'session',created_at:start,transcript:[fragment('user','Hello',0,200,'a')]}])
 assert.equal(result.length,2);assert.equal(result[0].content,messages[0].content)
})
