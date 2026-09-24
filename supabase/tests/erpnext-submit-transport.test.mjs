import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const backend = `data:text/javascript;base64,${Buffer.from('export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }').toString('base64')}`
const source = stripTypeScriptTypes(readFileSync(new URL('../functions/_shared/erpnext.ts', import.meta.url), 'utf8'))
  .replace('./backend.ts', backend)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { erpNextSubmit, erpNextErrorMessage } = await import(moduleUrl)

test('Frappe v16 errors expose the actual rejection instead of a generic permission guess', () => {
  assert.equal(erpNextErrorMessage({ errors: [{ type: 'PermissionError', message: 'Function <strong>submit</strong> is not whitelisted.' }] }), 'Function submit is not whitelisted.')
})

test('submission uses the supported Frappe API with the verified draft', async () => {
  const originalDeno = globalThis.Deno
  const originalFetch = globalThis.fetch
  const draft = { doctype: 'Journal Entry', name: 'ACC-JV-1', docstatus: '0', accounts: [{ account: 'Costs', debit: '100.00', credit: '0' }] }
  let calls = 0
  try {
    globalThis.Deno = { env: { get: name => ({ ERPNEXT_BASE_URL: 'https://erpnext.example.test', ERPNEXT_API_KEY: 'key', ERPNEXT_API_SECRET: 'secret' })[name] } }
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(url, 'https://erpnext.example.test/api/method/frappe.client.submit')
      assert.equal(init.method, 'POST')
      assert.deepEqual(JSON.parse(init.body), { doc: draft })
      assert.equal(init.headers.Authorization, 'token key:secret')
      return { ok: true, text: async () => JSON.stringify({ message: { name: draft.name, docstatus: 1 } }) }
    }
    assert.deepEqual(await erpNextSubmit('Journal Entry', 'ACC-JV-1', draft), { name: 'ACC-JV-1', docstatus: 1 })
    await assert.rejects(erpNextSubmit('Journal Entry', 'OTHER', draft), /identity or status changed/)
    await assert.rejects(erpNextSubmit('Journal Entry', 'ACC-JV-1', { ...draft, docstatus: 1 }), /identity or status changed/)
    assert.equal(calls, 1)
  } finally {
    globalThis.Deno = originalDeno
    globalThis.fetch = originalFetch
  }
})
