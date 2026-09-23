import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const backendUrl = url('export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }')
const source = readFileSync(new URL('../functions/_shared/erpnext-webhook-receipt.ts', import.meta.url), 'utf8')
const { receiveErpNextWebhook: receive, erpNextWebhookBodyLimit: limit } = await import(url(stripTypeScriptTypes(source).replace('./backend.ts', backendUrl)))
const secret = 'test-only-webhook-secret'
const payload = { doctype: 'Sales Invoice', name: 'INV-1', company: 'Example Freight', modified: '2026-09-15 10:30:00.123456', event: 'on_update' }
async function signature(raw, keyText = secret) {
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Buffer.from(await crypto.subtle.sign('HMAC', key, bytes)).toString('base64')
}
async function request(raw = JSON.stringify(payload), options = {}) {
  return new Request('https://tenant.example/functions/v1/erpnext-webhook', {
    method: 'POST', body: raw, headers: { 'X-Frappe-Webhook-Signature': await signature(raw), ...options },
  })
}
function receiver(result = { data: { accepted: true, duplicate: false, eventId: 'event-1' }, error: null }) {
  const calls = []
  return { calls, secret, record: async raw => { calls.push(raw); return result } }
}

test('valid signed UTF-8 is retained exactly, including decimals beyond JS precision', async () => {
  const raw = '{ "doctype":"Sales Invoice", "name":"INV-1", "company":"Example Freight", "modified":"2026-09-15 10:30:00.123456", "grand_total":9007199254740993.1234,"remarks":"Café £" }'
  const deps = receiver()
  assert.equal((await receive(await request(raw), deps)).status, 202)
  assert.deepEqual(deps.calls, [raw])
})

test('missing, forged and different-tenant signatures never reach persistence', async () => {
  for (const invalid of ['', 'bad', 'A'.repeat(43) + '=', await signature(JSON.stringify(payload), 'another-tenant-secret')]) {
    const deps = receiver()
    assert.equal((await receive(await request(undefined, { 'X-Frappe-Webhook-Signature': invalid }), deps)).status, 401)
    assert.equal(deps.calls.length, 0)
  }
  const deps = receiver()
  assert.equal((await receive(await request(JSON.stringify({ ...payload, name: 'modified' }), {
    'X-Frappe-Webhook-Signature': await signature(JSON.stringify(payload)),
  }), deps)).status, 401)
  assert.equal(deps.calls.length, 0)
})

test('oversized streamed bodies and dishonest content lengths never reach persistence', async () => {
  const raw = JSON.stringify({ ...payload, remarks: 'x'.repeat(limit) })
  for (const headers of [{}, { 'content-length': '1' }, { 'content-length': String(limit + 1) }]) {
    const deps = receiver()
    assert.equal((await receive(await request(raw, headers), deps)).status, 413)
    assert.equal(deps.calls.length, 0)
  }
})

test('invalid UTF-8, malformed JSON and non-object bodies fail without storing anything', async () => {
  for (const raw of [new Uint8Array([0xff, 0xfe]), '{', 'null', '[]', '7', '{}']) {
    const deps = receiver()
    assert.equal((await receive(await request(raw), deps)).status, 400)
    assert.equal(deps.calls.length, 0)
  }
})

test('unsupported doctypes are ignored only after authentication', async () => {
  const deps = receiver()
  const raw = JSON.stringify({ ...payload, doctype: 'User' })
  assert.equal((await receive(await request(raw), deps)).status, 204)
  assert.equal(deps.calls.length, 0)
})

test('duplicates acknowledge the existing receipt without implying reconciliation', async () => {
  const deps = receiver({ data: { accepted: true, duplicate: true, eventId: 'original' }, error: null })
  const response = await receive(await request(), deps)
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), { accepted: true, duplicate: true, eventId: 'original' })
})

test('company ambiguity, conflicting versions and storage failures cannot return success', async () => {
  for (const [code, expected] of [['P0002', 409], ['23505', 409], ['22023', 400], ['22P02', 400], ['22008', 400], ['40001', 503], ['42883', 503]]) {
    const deps = receiver({ data: null, error: { code, message: 'private database detail' } })
    const response = await receive(await request(), deps)
    assert.equal(response.status, expected)
    assert.ok(!(await response.text()).includes('private database detail'))
  }
  for (const data of [null, {}, { accepted: true }, { accepted: false, duplicate: false, eventId: 'bad' }]) {
    assert.equal((await receive(await request(), receiver({ data, error: null }))).status, 503)
  }
})

test('missing verification configuration and unsupported methods do not write', async () => {
  const deps = receiver()
  assert.equal((await receive(await request(), { ...deps, secret: undefined })).status, 503)
  assert.equal((await receive(new Request('https://example.test'), deps)).status, 405)
  assert.equal(deps.calls.length, 0)
})
