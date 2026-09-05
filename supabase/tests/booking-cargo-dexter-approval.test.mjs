import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { requiresExplicitActionApproval } from '../functions/agent-dexter/email-approval.mjs'
const source = readFileSync(new URL('../functions/agent-dexter/security.ts', import.meta.url), 'utf8')
const executable = stripTypeScriptTypes(source).replace('"./email-approval.mjs"',
  JSON.stringify(new URL('../functions/agent-dexter/email-approval.mjs', import.meta.url).href))
const { operatorAuthorisesAction, allowedActionsForPrompt, prepareServerAction } =
  await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`)

for (const action of ['update_booking_cargo', 'update_booking_container']) {
const container = action === 'update_booking_container'
test(`${action}: edits require explicit approval even in Full access`, () => {
  for (const mode of ['approve', 'full']) assert.equal(requiresExplicitActionApproval(action, mode), true)
})
test(`${action}: edit intent is distinct from an inspection request`, () => {
  for (const prompt of container
    ? ['Update container weight to 42 kg', 'Clear the reefer unit', 'Record verified gross mass']
    : ['Update cargo weight to 42 kg', 'Clear the cargo dimensions', 'Correct the goods description']) {
    assert.equal(operatorAuthorisesAction(prompt, action), true)
    assert.deepEqual(allowedActionsForPrompt(prompt, [action], 'full'), [action])
  }
  assert.deepEqual(allowedActionsForPrompt(container ? 'Show the container VGM' : 'Show the cargo weight', [action], 'full'), [])
})
test(`${action}: proposal stores both exact identities without executing a write`, async () => {
  const writes = []
  const actor = { userId: crypto.randomUUID(), companyId: crypto.randomUUID(), authUserId: crypto.randomUUID() }
  const bookingId = crypto.randomUUID(), cargoId = crypto.randomUUID()
  const intent = { AIDexterIntent_AllowedActionsJSON: [action], AIDexterIntent_TargetConstraintsJSON: [], AIDexterIntent_AccessMode: 'full' }
  const admin = { from(table) {
    const builder = {
      select: () => builder, eq: () => builder, gt: () => builder,
      maybeSingle: async () => ({ data: intent, error: null }),
      insert: async (row) => { writes.push({ table, row }); return { error: null } },
    }
    return builder
  } }
  const input = {
    conversationId: null, clientSessionId: crypto.randomUUID(), intentPlanId: crypto.randomUUID(), grantId: crypto.randomUUID(),
    actionCode: action, arguments: { target_id: bookingId, [container ? 'container_id' : 'cargo_id']: cargoId, field: 'grossWeightKg', value: '42',
      ...(container ? { expected_container_updated_at: '2026-09-05T12:00:00Z' } : {}),
      expected_updated_at: '2026-09-05T12:00:00Z', reason: 'Correct packing list' },
    title: 'Correct cargo weight', description: 'Second cargo line', changes: [{ field: 'grossWeightKg', before: 40, after: 42 }], accessMode: 'full',
  }
  const prepared = await prepareServerAction(admin, actor, input)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].table, 'AI_DexterPreparedActions')
  assert.equal(writes[0].row.AIDexterPrepared_Status, 'prepared')
  assert.equal(writes[0].row.AIDexterPrepared_ApprovedAt, undefined)
  assert.deepEqual(writes[0].row.AIDexterPrepared_TargetJSON.recordIds, [bookingId, cargoId])
  assert.equal(writes[0].row.AIDexterPrepared_ID, prepared.id)
  intent.AIDexterIntent_AllowedActionsJSON = []
  await assert.rejects(prepareServerAction(admin, actor, input), /action_outside_operator_intent/)
  assert.equal(writes.filter(x => x.table === 'AI_DexterPreparedActions').length, 1)
})
}
