import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/dexter-voice/contract.ts',import.meta.url),'utf8'))
const { cumulativeVoiceSeconds, delegatedPrompt, transcriptFragment, voiceCostGbp, voiceOptions } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('duration snapshots are cumulative, captions retain exact fragments and delegations own work', () => {
  assert.equal(cumulativeVoiceSeconds(cumulativeVoiceSeconds(0,{seconds:12}),{seconds:20}),20)
  assert.equal(cumulativeVoiceSeconds(20,{seconds:12}),20)
  assert.equal(cumulativeVoiceSeconds(20,{seconds:NaN}),20)
  assert.ok(Math.abs(voiceCostGbp(300)-0.25/1.3)<1e-10)
  assert.equal(voiceOptions.length,10)
  const part=(delta,start,end,id)=>transcriptFragment({type:'session.input_transcript.delta',delta,start_ms:start,end_ms:end,event_id:id})
  const fragments=[part('Find ',0,100,'a'),part('booking AB123.',100,200,'b'),part(' Make that AB124.',300,500,'c')]
  assert.equal(delegatedPrompt(fragments,-1,200),'Find booking AB123.')
  assert.equal(delegatedPrompt(fragments,200,500),'Make that AB124.')
  assert.equal(delegatedPrompt(fragments,500,550),'')
  assert.equal(transcriptFragment({type:'session.usage.updated'}),null)
})

test('audio worklet captures PCM, plays ordered PCM, mutes input and bounds latency', () => {
  let Processor;const messages=[]
  vm.runInNewContext(readFileSync(new URL('../../multideck.client/public/audio/dexter-voice-worklet.js',import.meta.url),'utf8'),{
    AudioWorkletProcessor:class {port={postMessage:event=>messages.push(event)}},
    registerProcessor:(name,value)=>{assert.equal(name,'dexter-voice-audio');Processor=value},Int16Array,Math,
  })
  const processor=new Processor()
  const output=new Float32Array(1200)
  processor.port.onmessage({data:{type:'audio',buffer:new Int16Array(1200).fill(16384).buffer}})
  processor.process([[new Float32Array(1200).fill(0.25)]],[[output]])
  assert.equal(output[0],0.5);assert.equal(output[1199],0.5)
  assert.equal(new Int16Array(messages.find(e=>e.type==='input').buffer)[0],8192)
  processor.port.onmessage({data:{type:'mute',muted:true}})
  processor.process([[new Float32Array(1200).fill(0.25)]],[[output]])
  assert.equal(new Int16Array(messages.filter(e=>e.type==='input').at(-1).buffer)[0],0)
  assert.equal(output[0],0)
  processor.port.onmessage({data:{type:'audio',buffer:new Int16Array(48001).buffer}})
  assert.ok(messages.some(e=>e.type==='playback_overflow'))
  processor.process([[]],[[output]])
  assert.ok(output.every(value=>value===0))
})

test('delegation takes the latest spoken request, not greetings already answered aloud',()=>{
 const part=(role,delta,startMs,endMs,id)=>({role,delta,startMs,endMs,id})
 const fragments=[part('user','Hello',0,200,'a'),part('assistant','Hi.',200,400,'b'),
  part('user','How are you?',600,900,'c'),part('assistant','Well, thanks.',1000,1400,'d'),
  part('user','Find ',1600,1800,'e'),part('user','my leads.',1800,2200,'f')]
 assert.equal(delegatedPrompt(fragments,-1,2200),'Find my leads.')
  assert.equal(delegatedPrompt(fragments,2200,2400),'')
  assert.equal(delegatedPrompt([part('user','Find my leads',0,1000,'a'),part('user','that need a follow-up.',4000,5000,'b')],-1,5000),'Find my leads that need a follow-up.')
})
