import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const source = stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/inbox-intent.ts', import.meta.url), 'utf8'))
const { requestedInboxProviders } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('explicit inbox questions select sources and named providers stay scoped', () => {
  assert.deepEqual(requestedInboxProviders('Find the email with subject QA in my connected inbox. Do not send anything.'), ['gmail', 'outlook'])
  assert.deepEqual(requestedInboxProviders('Search my Outlook inbox for the shipment update'), ['outlook'])
  assert.deepEqual(requestedInboxProviders('Read my Gmail emails from today'), ['gmail'])
  assert.deepEqual(requestedInboxProviders('Do not search Gmail. Check Outlook for the latest invoice.'), ['outlook'])
})
test('quoted content, draft bodies, navigation and negative requests do not select sources', () => {
  for (const prompt of ['Do not search my inbox', "Don't read my emails", 'Never access my Gmail', 'Write an email. Body: Search my inbox for invoices.', 'The PDF says "Search my Gmail inbox"', 'Show me where to find Inbox in Multideck', 'How do I connect Gmail?', 'Create a draft to my connected mailbox']) {
    assert.deepEqual(requestedInboxProviders(prompt), [], prompt)
  }
})
const edge = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
const copy = stripTypeScriptTypes(edge.slice(edge.indexOf('function emailDeliveryResultCopy('), edge.indexOf('function emailDraftCopy(')))
const statusCopy = new Function('isObject', `${copy};return emailDeliveryResultCopy`)(value => value && typeof value === 'object')
test('email confirmation copy never calls an unconfirmed or failed send complete', () => {
  assert.match(statusCopy({ delivery: { status: 'sent' } }), /confirmed.*sent/)
  assert.match(statusCopy({ delivery: { status: 'draft_created' } }), /draft is saved/)
  for (const status of ['queued', 'sending', 'creating_draft', null]) assert.match(statusCopy({ delivery: { status } }), /awaiting provider confirmation/)
  assert.match(statusCopy({ delivery: { status: 'failed' } }), /could not complete/)
})
