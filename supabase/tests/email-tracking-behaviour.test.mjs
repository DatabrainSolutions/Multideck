import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes, createRequire } from 'node:module'
import test from 'node:test'

const runtime = readFileSync(new URL('../functions/inbox-api/runtime.ts', import.meta.url), 'utf8')
const helpers = runtime.slice(runtime.indexOf('function escapeTrackedHtml'), runtime.indexOf('async function recordDeliveryEvent'))
const html = new Function(`${stripTypeScriptTypes(helpers)}; return trackedEmailHtml`)()
const coreSource = readFileSync(new URL('../functions/inbox-api/core.ts', import.meta.url), 'utf8')
const ts = createRequire(new URL('../../multideck.client/package.json', import.meta.url))('typescript')
const core = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(coreSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64')}`)
const deliveryStart = runtime.indexOf('  const delivery = (row: Row) => {')
const deliverySource = stripTypeScriptTypes(runtime.slice(deliveryStart, runtime.indexOf('\n  return {', deliveryStart)))
const delivery = (events=[], tokens=[], replies=[]) => new Function('deliveryEvents','trackingTokens','messages','replyMessages','inferredReplyTargetByInbound',`${deliverySource};return delivery`)(events,tokens,[],replies,new Map())

test('tracking is present in plain, fragment and complete HTML messages, with attachments and all recipient roles', () => {
  const url = 'https://tenant.supabase.co/functions/v1/email-track/open?token=test_token&x=1'
  for (const template of [null, '<p>Branded quote</p>', '<html><body><p>Branded quote</p></body></html>']) {
    const rendered = html('Hello <operator>\nNext line', template, url)
    assert.equal((rendered.match(/email-track\/open/g)||[]).length, 1)
    if (template?.includes('</body>')) assert.ok(rendered.indexOf('<img') < rendered.indexOf('</body>'))
    const mime = core.buildMimeMessage({from:{address:'sender@example.com'},to:[{address:'a@example.com'}],cc:[{address:'b@example.com'}],bcc:[{address:'c@example.com'}],subject:'QA',bodyText:'Hello',bodyHtml:rendered,attachments:[{fileName:'test.txt',mimeType:'text/plain',bytes:new TextEncoder().encode('test')}]})
    assert.match(mime,/multipart\/alternative/)
    // Decode MIME content: the pixel must survive transport encoding.
    const decoded = mime.split(/\r\n\r\n/).map(part => {try {return Buffer.from(part.split('\r\n--')[0].replace(/\r\n/g,''),'base64').toString()} catch {return ''}}).join('\n')
    assert.ok(mime.includes('email-track/open') || decoded.includes('email-track/open'))
  }
  assert.equal(html('hello', null, null),null)
  assert.equal(html('hello','<p>Untracked template</p>',null),'<p>Untracked template</p>')
  assert.match(html('<script>',null,url),/&lt;script&gt;/)
  const sentPreview=core.sanitizeOutboundEmailHtml(html('Test','<p>Signature</p><img src="cid:logo">',url))
  assert.doesNotMatch(sentPreview,/email-track/)
  assert.match(sentPreview,/cid:logo/)
})

test('relayed, expanded and delayed reports never claim confirmed delivery', () => {
  for (const action of ['relayed','expanded','delayed']) {
    assert.equal(core.parseDeliveryStatusReport('multipart/report; report-type=delivery-status',`Original-Message-ID: <qa@example.com>\r\nAction: ${action}\r\nStatus: 2.0.0`),null)
  }
  for (const [action,eventType] of [['delivered','delivered'],['failed','bounced']]) {
    assert.equal(core.parseDeliveryStatusReport('multipart/report; report-type=delivery-status',`Original-Message-ID: <qa@example.com>\r\nAction: ${action}\r\nStatus: ${action==='failed'?'5':'2'}.0.0`).eventType,eventType)
  }
  assert.equal(core.isRecipientReplyMessage({'content-type':'multipart/report; report-type=delivery-status'}),false)
  assert.equal(core.isRecipientReplyMessage({'auto-submitted':'auto-replied'}),false)
})

test('send uncertainty, no-open, open, reply and bounce remain distinct and message-scoped', () => {
  const row = {CommMessage_ID:'a',CommMessage_StatusCode:'sent',CommMessage_SentAt:'2026-09-11T12:00:00Z'}
  const tokens = [{CommTrack_MessageID:'a',CommTrack_FirstOpenedAt:null}]
  assert.equal(delivery([],tokens)(row).status,'no_open_signal')
  assert.equal(delivery([],tokens)({...row,CommMessage_StatusCode:'sending',CommMessage_SentAt:null}).status,'sending')
  tokens[0].CommTrack_FirstOpenedAt='2026-09-11T12:01:00Z'
  assert.equal(delivery([],tokens)(row).status,'opened_estimated')
  assert.equal(delivery([],tokens)(row).confidence,'estimated')
  const replies = [{CommMessage_IsInbound:true,CommMessage_ReplyToMessageID:'a',CommMessage_ReceivedAt:'2026-09-11T12:02:00Z'}]
  assert.equal(delivery([],tokens,replies)(row).status,'replied')
  assert.equal(delivery([],tokens,replies)(row).confidence,'confirmed')
  assert.equal(delivery([],tokens,replies)({...row,CommMessage_ID:'b'}).status,'sent')
  const events = [{CommDelivery_MessageID:'a',CommDelivery_EventTypeCode:'bounced',CommDelivery_EventAt:'2026-09-11T12:03:00Z'}]
  assert.equal(delivery(events,tokens)(row).status,'bounced')
  assert.equal(delivery(events,tokens)(row).confidence,'confirmed')
})

test('public pixel ignores probes, hashes tokens and reports infrastructure failures without exposing details', async () => {
  const source = readFileSync(new URL('../functions/email-track/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'')
  let handler, calls=[], logs=[], rpcError=null
  new Function('Deno','createClient','console',stripTypeScriptTypes(source))({env:{get:()=> 'configured'},serve:fn=>{handler=fn}},()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:rpcError}}}),{error:(...args)=>logs.push(args)})
  const token='a'.repeat(43), url=`https://tenant.supabase.co/functions/v1/email-track/open?token=${token}`
  for (const options of [{method:'HEAD'},{method:'POST'},{headers:{purpose:'prefetch'}},{headers:{'sec-purpose':'prefetch;prerender'}}]) assert.equal((await handler(new Request(url,options))).status,200)
  assert.equal(calls.length,0)
  await handler(new Request(url.replace(token,'short')))
  assert.equal(calls.length,0)
  const response=await handler(new Request(url))
  assert.equal(response.headers.get('content-type'),'image/gif')
  assert.match(response.headers.get('cache-control'),/no-store/)
  assert.ok((await response.arrayBuffer()).byteLength>0)
  assert.equal(calls.length,1)
  assert.match(calls[0].args.p_token_hash,/^[a-f0-9]{64}$/)
  assert.notEqual(calls[0].args.p_token_hash,token)
  rpcError={code:'08006',message:'private database context'}
  assert.equal((await handler(new Request(url))).status,200)
  assert.equal(logs.length,1)
  assert.doesNotMatch(JSON.stringify(logs),/private database context|token=|aaaaa/)
})

test('Gmail policy and quota denials do not falsely revoke a connected mailbox', async () => {
  const start = runtime.indexOf('async function gmailProviderError(')
  const end = runtime.indexOf('\n}', runtime.indexOf('async function providerJson(')) + 2
  const source = stripTypeScriptTypes(runtime.slice(start, end))
  for (const [reason, status, code] of [
    ['userRateLimitExceeded',429,'rate_limited'], ['domainPolicy',403,'provider_policy_denied'],
    ['accessNotConfigured',503,'provider_not_configured'], ['insufficientPermissions',409,'reauthorization_required'],
    ['private-provider-text',403,'provider_forbidden'],
  ]) {
    const request = new Function('fetch','InboxHttpError','providerErrorStatus','cleanString','isObject',`${source};return providerJson`)(
      async () => new Response(JSON.stringify({error:{errors:[{reason}],message:'private details'}}),{status:403}),
      core.InboxHttpError,core.providerErrorStatus,core.cleanString,core.isObject)
    await assert.rejects(request('https://gmail.googleapis.com/gmail/v1/users/me/messages','test-token'),e=>{
      assert.equal(e.status,status);assert.equal(e.code,code);assert.equal(e.providerStatus,403)
      assert.doesNotMatch(e.message,/private/);return true
    })
  }
})

test('quote issue carries the explicitly enabled preference to the common tracked sender', () => {
  const workflow=readFileSync(new URL('../functions/quotes-workflow/index.ts',import.meta.url),'utf8')
  const api=readFileSync(new URL('../../multideck.client/src/lib/quote-workflow-api.ts',import.meta.url),'utf8')
  assert.match(workflow,/trackOpens: body\.trackOpens === true/)
  assert.match(api,/signature\?: SignatureSelection, trackOpens = false/)
  assert.match(api,/signature, trackOpens \}/)
})

test('reading sent copies and quoted replies never fetches our original pixel', () => {
  const expression = runtime.match(/sanitizedHtml: (.+),\n      replyEligible:/)[1]
  const render = new Function('row','inferredReplyTargetByInbound','sanitizeEmailHtml','sanitizeOutboundEmailHtml',`return ${expression}`)
  const body = '<p>Reply and quoted original</p><img src="https://tenant.supabase.co/functions/v1/email-track/open?token=example"><img src="cid:signature">'
  for (const [inbound, replyTo, inferred] of [[false,null,false],[true,'outbound-id',false],[true,null,true]]) {
    const output=render({CommMessage_ID:'reply',CommMessage_BodyHTML:body,CommMessage_IsInbound:inbound,CommMessage_ReplyToMessageID:replyTo},new Map(inferred?[['reply','outbound-id']]:[]),core.sanitizeEmailHtml,core.sanitizeOutboundEmailHtml)
    assert.doesNotMatch(output,/email-track/);assert.match(output,/cid:signature/)
  }
  // An independently received email still renders its normal image content.
  assert.match(render({CommMessage_ID:'incoming',CommMessage_IsInbound:true,CommMessage_BodyHTML:body},new Map(),core.sanitizeEmailHtml,core.sanitizeOutboundEmailHtml),/email-track/)
})

test('credential failure releases the sync lease; a stale sync cannot revoke a reconnected mailbox', async () => {
  const start=runtime.indexOf('export async function syncMailbox(')
  const source=stripTypeScriptTypes(runtime.slice(start,runtime.indexOf('\n}',start)+2)).replace(/^export /,'')
  for (const scenario of ['credential-failure','current-denial','stale-denial']) {
    const connection={CommConn_ID:'connection',CommConn_SecretRef:'old',CommConn_InboundEnabled:true,CommConn_StatusCode:'active'}
    const mailbox={CommMailbox_ID:'mailbox',CommMailbox_InboundEnabled:true,CommMailbox_IndexStatus:'indexing'}
    const storedConnection={...connection},storedMailbox={...mailbox};let released=false
    const denied=()=>{throw new core.InboxHttpError(409,'Reconnect','reauthorization_required')}
    const admin={rpc:async name=>{if(name==='Comm_ReleaseMailboxSyncLease')released=true;return {data:true,error:null}},from:table=>{
      const row=table==='Comm_ProviderConnections'?storedConnection:storedMailbox;let update={},matches=true
      return {update(v){update=v;return this},eq(k,v){matches&&=row[k]===v;return this},select(){return this},then(resolve){if(matches)Object.assign(row,update);return Promise.resolve({data:matches?[row]:[],error:null}).then(resolve)}}}}
    const deps={InboxHttpError:core.InboxHttpError,requirePermission:async()=>{},requireMailbox:async()=>({mailbox,connection}),
      result:async q=>(await q).data,credential:async()=>{if(scenario==='credential-failure')denied();return {accessToken:'test'}},
      refreshFolderCatalogue:async()=>{},publicProvider:()=> 'gmail',syncGmail:async()=>{if(scenario==='stale-denial')storedConnection.CommConn_SecretRef='new';denied()}}
    const run=new Function(...Object.keys(deps),`${source};return syncMailbox`)(...Object.values(deps))
    await assert.rejects(run(admin,{},'mailbox'),/Reconnect/)
    assert.equal(released,true)
    assert.equal(storedConnection.CommConn_StatusCode,scenario==='stale-denial'?'active':'error')
    assert.equal(storedMailbox.CommMailbox_IndexStatus,scenario==='stale-denial'?'indexing':'error')
  }
})
