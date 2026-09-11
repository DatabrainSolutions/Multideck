import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const runtime = readFileSync(new URL('../functions/inbox-api/runtime.ts', import.meta.url), 'utf8')
const sendCode = stripTypeScriptTypes(runtime.slice(runtime.indexOf('export async function sendProviderDraft('), runtime.indexOf('export async function sendMail('))).replace(/^export /, '')
const providerCode = stripTypeScriptTypes(runtime.slice(runtime.indexOf('async function providerSend('), runtime.indexOf('async function providerCreateDraft(')))
const prepareCode = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/provider-draft-send.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '')).replace('export async function', 'async function')
const cleanString = (value, maximum) => typeof value === 'string' ? value.trim().slice(0, maximum) : ''
class InboxHttpError extends Error { constructor(status, message, code, providerStatus) { super(message); Object.assign(this, { status, code, providerStatus }) } }
const normalizeAddresses = value => Array.isArray(value) ? value.map(item => ({ address: item.address.toLowerCase(), displayName: item.displayName ?? null })) : []

function database(seed) {
  const rows = structuredClone(seed)
  return { rows, rpc: async () => ({ data: true, error: null }), from(table) {
    let filters = [], mutation, value, single = false, limit
    const query = {
      select() { return this }, eq(key, value) { filters.push(row => JSON.stringify(row[key]) === (typeof row[key] === "object" && typeof value === "string" ? value : JSON.stringify(value))); return this },
      is(key, value) { return this.eq(key, value) }, in(key, values) { filters.push(row => values.includes(row[key])); return this },
      order() { return this }, limit(value) { limit = value; return this },
      update(data) { mutation = 'update'; value = data; return this }, insert(data) { mutation = 'insert'; value = data; return this },
      maybeSingle() { single = true; return this },
      then(resolve, reject) { return Promise.resolve().then(() => {
        rows[table] ??= []
        let result = rows[table].filter(row => filters.every(filter => filter(row)))
        if (mutation === 'update') result.forEach(row => Object.assign(row, structuredClone(value)))
        if (mutation === 'insert') { const added = structuredClone(Array.isArray(value) ? value : [value]); rows[table].push(...added); result = added }
        if (limit) result = result.slice(0, limit)
        return { data: structuredClone(single ? result[0] ?? null : result), error: null }
      }).then(resolve, reject) },
    }
    return query
  } }
}
const actor = { userId: 'operator', companyId: 'company', authUserId: 'auth' }
const saved = { CommMessage_ID: 'message', CommMessage_CreatedBy: 'operator', CommMessage_IsDeleted: false,
  CommMessage_MailboxID: 'mailbox', CommMessage_ThreadID: 'thread', CommMessage_StatusCode: 'draft', CommMessage_IsDraft: true,
  CommMessage_HeaderJSON: JSON.stringify({ providerDraftId: 'provider-draft', providerDraftState: 'created' }),
  CommMessage_Subject: 'QA draft', CommMessage_BodyText: 'Reviewed wording', CommMessage_UpdatedAt: 'before', CommMessage_InternetMessageID: '<message@test.invalid>' }
const body = { draftMessageId: 'message', mailboxId: 'mailbox', subject: 'QA draft', bodyText: 'Reviewed wording', addedTo: [{ address: 'self@example.test' }], addedCc: [], addedBcc: [] }
function sendHarness(options = {}) {
  const admin = database({ Comm_Messages: [saved], Comm_MessageRecipients: [{ CommRecipient_MessageID: 'message', CommRecipient_RecipientTypeCode: 'to', CommRecipient_Address: 'self@example.test' }] })
  let sends = 0
  const dependencies = { InboxHttpError, cleanString, normalizeAddresses,
    requirePermission: async () => { if (options.deny) throw new InboxHttpError(403, 'Denied', 'forbidden') },
    result: async query => { const { data, error } = await query; if (error) throw error; return data },
    requireMailbox: async () => ({ mailbox: { CommMailbox_OutboundEnabled: true }, connection: { CommConn_OutboundEnabled: true, CommConn_StatusCode: 'active', CommConn_ProviderTypeCode: 'outlook' } }),
    assertRecipients: to => { if (!to.length) throw new Error('No recipients') }, credential: async () => ({ accessToken: 'test-token' }),
    sha256Hex: async value => value, publicProvider: value => value, recordDeliveryEvent: async () => {},
    providerSend: async (...args) => { sends++; if (options.failure) throw options.failure; assert.equal(args.at(-1), 'provider-draft'); return { providerMessageId: 'provider-draft', providerThreadId: 'provider-thread', internetMessageId: '<message@test.invalid>' } },
  }
  const run = new Function(...Object.keys(dependencies), `${sendCode};return sendProviderDraft`)(...Object.values(dependencies))
  return { admin, run: (request = body, user = actor, key = 'click') => run(admin, user, request, key), sends: () => sends }
}

test('saved provider draft is sent once across concurrent clicks and different keys', async () => {
  const h = sendHarness()
  await Promise.allSettled([h.run(), h.run(body, actor, 'second')])
  assert.equal(h.sends(), 1)
  const receipt = await h.run(body, actor, 'third')
  assert.equal(receipt.status, 'sent')
  assert.equal(receipt.reused, true)
  assert.equal(h.admin.rows.Comm_Messages.length, 1)
  assert.equal(h.admin.rows.Comm_Messages[0].CommMessage_IsDraft, false)
})
test('missing send permission and another user are denied before provider access', async () => {
  const denied = sendHarness({ deny: true })
  await assert.rejects(denied.run(), /Denied/)
  assert.equal(denied.sends(), 0)
  const other = sendHarness()
  await assert.rejects(other.run(body, { ...actor, userId: 'other-user' }), /unavailable/)
  assert.equal(other.sends(), 0)
})
test('changed wording or recipients requires a new review', async () => {
  for (const change of [{ bodyText: 'Unreviewed' }, { addedTo: [{ address: 'other@example.test' }] }, { mailboxId: 'other-mailbox' }]) {
    const h = sendHarness()
    await assert.rejects(h.run({ ...body, ...change }), /changed/)
    assert.equal(h.sends(), 0)
    assert.equal(h.admin.rows.Comm_Messages[0].CommMessage_StatusCode, 'draft')
  }
})
test('unknown provider outcome remains claimed and is never retried as another send', async () => {
  const h = sendHarness({ failure: new TypeError('Network disconnected') })
  await assert.rejects(h.run(), /Network/)
  const receipt = await h.run(body, actor, 'retry')
  assert.equal(receipt.status, 'sending')
  assert.equal(h.sends(), 1)
})
test('a definite provider rejection preserves the message and reports failed', async () => {
  const h = sendHarness({ failure: new InboxHttpError(409, 'Rejected', 'provider_rejected', 400) })
  await assert.rejects(h.run(), /Rejected/)
  assert.equal((await h.run()).status, 'failed')
  assert.equal(h.sends(), 1)
  assert.equal(h.admin.rows.Comm_Messages[0].CommMessage_BodyText, body.bodyText)
})

function nativeProvider(fetch) {
  const dependencies = { fetch, cleanString, InboxHttpError, buildRfc2822: value => JSON.stringify(value), appendInternetMessageReference: () => '',
    providerErrorStatus: response => new InboxHttpError(502, 'Provider rejected', 'provider_rejected', response.status),
  }
  const fn = new Function(...Object.keys(dependencies), `${providerCode};return providerSend`)(...Object.values(dependencies))
  return provider => fn(provider, 'test-token', { CommMailbox_Address: 'self@example.test' }, { command: 'new', source: null, to: body.addedTo, cc: [], bcc: [] }, body.subject, body.bodyText, null, '<message@test.invalid>', false, [], 'existing-draft')
}
test('Gmail sends the existing draft ID with the exact approved content', async () => {
  const calls = []
  const run = nativeProvider(async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ id: 'sent', threadId: 'thread' })) })
  await run('gmail')
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /drafts\/send$/)
  assert.equal(calls[0].body.id, 'existing-draft')
  assert.equal(JSON.parse(calls[0].body.message.raw).bodyText, 'Reviewed wording')
})
test('Outlook updates and sends the existing draft without creating a second message', async () => {
  const calls = []
  const run = nativeProvider(async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    return new Response(options.method ? null : JSON.stringify({ id: 'existing-draft', isDraft: true, hasAttachments: false }), { status: options.method ? 204 : 200 })
  })
  await run('outlook')
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PATCH', 'POST'])
  assert.ok(calls.every(call => call.url.includes('/messages/existing-draft')))
  assert.equal(JSON.parse(calls[1].body).body.content, 'Reviewed wording')
  assert.match(calls[2].url, /\/send$/)
})
test('Outlook rejects unseen attachments and previously sent drafts', async () => {
  for (const state of [{ isDraft: true, hasAttachments: true }, { isDraft: false, hasAttachments: false }]) {
    let calls = 0
    const run = nativeProvider(async () => { calls++; return new Response(JSON.stringify({ id: 'existing-draft', ...state })) })
    await assert.rejects(run('outlook'), /attachments|already been sent/)
    assert.equal(calls, 1)
  }
})

function prepareHarness() {
  const draft = { id: 'draft', mailboxId: 'mailbox', to: body.addedTo, cc: [], bcc: [], subject: body.subject, bodyText: body.bodyText, requestedAction: 'create_draft', delivery: { status: 'draft_created', messageId: 'message' } }
  const create = { id: 'created-action', emailDraftId: 'draft' }
  const admin = database({
    AI_Messages: [{ AIMSG_ID: 'assistant', AIMSG_Role: 'assistant', AIMSG_ConversationID: 'conversation', AIMSG_ContentJSON: { metadata: { emailDraft: draft, pendingActions: [create], pendingAction: create } } }],
    AI_Conversations: [{ AICNV_ID: 'conversation', AICNV_CompanyID: 'company', AICNV_OwnerUserID: 'operator', AICNV_Channel: 'chat', AICNV_EndedAt: null }],
    AI_DexterPreparedActions: [{ AIDexterPrepared_ID: 'created-action', AIDexterPrepared_CompanyID: 'company', AIDexterPrepared_UserID: 'operator', AIDexterPrepared_ConversationID: 'conversation', AIDexterPrepared_Status: 'succeeded', AIDexterPrepared_ActionCode: 'create_email_draft', AIDexterPrepared_ResultJSON: { emailDraft: draft } }],
  })
  const prepared = []
  const dependencies = { createSecurityContext: async input => { assert.equal(input.grantId, null); return { intentPlanId: 'intent' } },
    declinePreparedAction: async () => {},
    prepareServerAction: async (_admin, _actor, input) => { prepared.push(input); return { id: 'new-send-action' } },
  }
  const run = new Function(...Object.keys(dependencies), `${prepareCode};return prepareProviderDraftSend`)(...Object.values(dependencies))
  return { admin, prepared, run: (user = actor) => run(admin, user, 'assistant') }
}
test('draft-to-send prepares a new approval for the confirmed exact draft, with no Full access', async () => {
  const h = prepareHarness()
  const result = await h.run()
  assert.equal(result.pendingAction.id, 'new-send-action')
  assert.equal(h.prepared[0].actionCode, 'send_email')
  assert.equal(h.prepared[0].accessMode, 'approve')
  assert.equal(h.prepared[0].arguments.draft.bodyText, 'Reviewed wording')
  assert.equal(h.prepared[0].arguments.draft.delivery.messageId, 'message')
  const metadata = h.admin.rows.AI_Messages[0].AIMSG_ContentJSON.metadata
  assert.equal(metadata.pendingActions.length, 2)
  assert.equal(metadata.pendingAction.id, 'new-send-action')
})
test('another user or company cannot prepare a send from a known conversation message ID', async () => {
  for (const user of [{ ...actor, userId: 'other-user' }, { ...actor, companyId: 'other-company' }]) {
    const h = prepareHarness()
    await assert.rejects(h.run(user), /unavailable/)
    assert.equal(h.prepared.length, 0)
  }
})
