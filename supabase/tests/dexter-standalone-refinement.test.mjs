import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const source = readFileSync(new URL('../functions/dexter-email-refine/standalone-draft.ts', import.meta.url), 'utf8')
const { standaloneRefinementDraft } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
const draft = { mode: 'new', sourceMessageId: null, threadId: null, subject: 'Shipment update', bodyText: 'Your shipment is booked.', delivery: { status: 'draft' } }
test('standalone refinement accepts wording but strips recipient, identity and delivery claims', () => {
  assert.deepEqual(standaloneRefinementDraft({ ...draft, to: ['attacker@example.test'], mailboxId: 'other-mailbox', id: 'other-draft' }), {subject: draft.subject, bodyText: draft.bodyText})
})
test('standalone refinement cannot impersonate a reply or edit an in-flight or sent email', () => {
  for (const bad of [null, [], {...draft,mode:'reply'}, {...draft,sourceMessageId:'private-thread'}, {...draft,threadId:'private-thread'}, {...draft,bodyText:'x'.repeat(20001)}, {...draft,subject:'x'.repeat(501)}, ...['sending','sent','queued','draft_created'].map(status => ({...draft,delivery:{status}}))]) assert.throws(() => standaloneRefinementDraft(bad), /invalid_request/)
})
