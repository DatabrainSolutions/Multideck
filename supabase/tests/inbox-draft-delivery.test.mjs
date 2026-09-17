import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const runtime=readFileSync(new URL('../functions/inbox-api/runtime.ts',import.meta.url),'utf8')
const start=runtime.indexOf('  const delivery = (row: Row) => {')
const code=stripTypeScriptTypes(runtime.slice(start,runtime.indexOf('\n  return {',start)))
const delivery=new Function('deliveryEvents','trackingTokens','messages','replyMessages','inferredReplyTargetByInbound',`${code};return delivery`)([],[],[],[],new Map())
test('unsent provider drafts never inherit sent or tracking evidence',()=>{
 for (const marker of [{CommMessage_IsDraft:true},{CommMessage_StatusCode:'draft'}]) {
  const result=delivery({...marker,CommMessage_SentAt:'2026-09-10',CommMessage_DeliveredAt:'2026-09-10'})
  assert.equal(result.status,'draft')
  for(const key of ['sentAt','deliveredAt','openedAt','repliedAt','failedAt','bouncedAt'])assert.equal(result[key],null)
  assert.equal(result.openTrackingEnabled,false)
 }
 assert.equal(delivery({CommMessage_IsDraft:false,CommMessage_StatusCode:'sent',CommMessage_SentAt:'2026-09-10'}).status,'sent')
})
