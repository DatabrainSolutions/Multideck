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
test('speech keeps the written answer, approval cards and records in one response',()=>{
 const messages=[{id:'user',role:'user',content:'Find booking AB123.',createdAt:start},
  {id:'assistant',role:'assistant',content:'A detailed response',createdAt:start,responseToUserMessageId:'user',pendingActions:[{id:'approval',status:'pending'}],recordTables:[{id:'table'}]}]
 const transcript=[fragment('user','Find booking AB123.',0,200,'a'),fragment('assistant','Your booking ',500,800,'b'),fragment('assistant','needs review.',800,1000,'c')]
 const result=mergeVoiceTranscript(messages,[{id:'session',created_at:start,transcript}])
 assert.equal(result.length,2);assert.equal(result[1].content,'A detailed response')
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


test('voice keeps inline email citations and full written results during speech and after reload',()=>{
 const content='Two emails need replies. [Chris Harris](https://mail.google.com/mail/u/0/#all/thread-one) asked about a partnership.\n\n'
  + 'Supporting detail. '.repeat(100) + '[Involved Solutions](/inbox?thread=thread-two) asked about AI engineers.'
 const messages=[{id:'request',role:'user',content:'Check my Gmail',createdAt:start},
  {id:'answer',role:'assistant',content,createdAt:start,responseToUserMessageId:'request',toolUsages:[{name:'Gmail'}]}]
 const transcript=[fragment('user','Check my Gmail',0,200,'a'),fragment('assistant','I will check.',500,800,'b'),
  fragment('assistant','There are two who need replies.',4000,4500,'c')]
 const session={id:'session',created_at:start,transcript}
 for (const saved of [session,JSON.parse(JSON.stringify(session))]) {
  const rows=mergeVoiceTranscript(messages,[saved])
  assert.equal(rows.length,3)
  assert.equal(rows[1].content,'I will check.')
  assert.equal(rows[2].content,content)
  assert.equal(rows[2].id,'answer')
  assert.deepEqual(rows[2].toolUsages,messages[1].toolUsages)
 }
 const during=mergeVoiceTranscript(messages,[{...session,transcript:transcript.slice(0,2)}])
 assert.equal(during.at(-1).content,content)
 const noSpeech=mergeVoiceTranscript(messages,[{...session,transcript:transcript.slice(0,1)}])
 assert.equal(noSpeech.find(row=>row.id==='answer').content,content)
})

test('follow-up link results stay on their own voice turn without removing earlier citations',()=>{
 const messages=[{id:'first',role:'user',content:'Check email',createdAt:start},
  {id:'first-answer',role:'assistant',content:'[Email](/inbox?thread=one)',createdAt:start,responseToUserMessageId:'first'},
  {id:'follow-up',role:'user',content:'Give me the link',createdAt:new Date(Date.parse(start)+6000).toISOString()},
  {id:'link-answer',role:'assistant',content:'[Open conversation](https://mail.google.com/mail/u/0/#all/one)',createdAt:new Date(Date.parse(start)+7000).toISOString(),responseToUserMessageId:'follow-up'}]
 const transcript=[fragment('user','Check email',0,200,'a'),fragment('assistant','One reply needed.',1000,2000,'b'),
  fragment('user','Give me the link',6000,6500,'c'),fragment('assistant','Open it in chat.',7500,8000,'d')]
 const rows=mergeVoiceTranscript(messages,[{id:'session',created_at:start,transcript}])
 assert.equal(rows.length,4)
 assert.equal(rows[1].content,messages[1].content)
 assert.equal(rows[3].content,messages[3].content)
})

test('an empty backend answer does not erase spoken feedback',()=>{
 const messages=[{id:'user',role:'user',content:'Find email',createdAt:start},
  {id:'answer',role:'assistant',content:'  ',createdAt:start,responseToUserMessageId:'user'}]
 const transcript=[fragment('user','Find email',0,200,'a'),fragment('assistant','Please try again.',500,800,'b')]
 assert.equal(mergeVoiceTranscript(messages,[{id:'session',created_at:start,transcript}]).at(-1).content,'Please try again.')
})
