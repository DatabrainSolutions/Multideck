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

for (const action of ['update_booking_cargo', 'update_booking_container', 'update_booking_route']) {
const container = action === 'update_booking_container'
const route = action === 'update_booking_route'
test(`${action}: edits require explicit approval even in Full access`, () => {
  for (const mode of ['approve', 'full']) assert.equal(requiresExplicitActionApproval(action, mode), true)
})
test(`${action}: edit intent is distinct from an inspection request`, () => {
  for (const prompt of route ? ['Update the second leg departure', 'Correct the vessel name', 'Clear the flight number'] : container
    ? ['Update container weight to 42 kg', 'Clear the reefer unit', 'Record verified gross mass']
    : ['Update cargo weight to 42 kg', 'Clear the cargo dimensions', 'Correct the goods description']) {
    assert.equal(operatorAuthorisesAction(prompt, action), true)
    assert.deepEqual(allowedActionsForPrompt(prompt, [action], 'full'), [action])
  }
  assert.deepEqual(allowedActionsForPrompt(route ? 'Show the second routing leg' : container ? 'Show the container VGM' : 'Show the cargo weight', [action], 'full'), [])
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
    actionCode: action, arguments: { target_id: bookingId, [route ? 'route_id' : container ? 'container_id' : 'cargo_id']: cargoId, field: route ? 'voyageNumber' : 'grossWeightKg', value: route ? 'VOY-42' : '42',
      ...(container ? { expected_container_updated_at: '2026-09-05T12:00:00Z' } : {}),
      ...(route ? { expected_route_updated_at: '2026-09-05T12:00:00Z' } : {}),
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

test('Routing mode: explicit leg intent and mandatory approval in both access modes', () => {
  const action = 'change_booking_route_mode'
  for (const mode of ['approve', 'full']) assert.equal(requiresExplicitActionApproval(action, mode), true)
  for (const prompt of ['Change the second leg to Air', 'Switch route mode to sea']) {
    assert.equal(operatorAuthorisesAction(prompt, action), true)
  }
  for (const prompt of ['Show the route mode', 'Change booking mode']) {
    assert.equal(operatorAuthorisesAction(prompt, action), false)
  }
})

test('Routing mode: preparation returns persisted review, rejects unavailable evidence, never executes the change', async () => {
  const action = 'change_booking_route_mode'
  const actor = { userId: crypto.randomUUID(), companyId: crypto.randomUUID(), authUserId: crypto.randomUUID() }
  const changes = [{ field: 'Routing leg mode', before: 'sea', after: 'air', beforeKnown: true, kind: 'changed' },
    { field: 'Master transport reference', before: 'MBL-123', after: null, beforeKnown: true, kind: 'removed' }]
  let response = { data: { AIDexterPrepared_Title: 'Change TEST1 · Leg 2 mode',
    AIDexterPrepared_Description: 'Warning: shared references will be cleared.', AIDexterPrepared_ChangesJSON: changes }, error: null }
  const writes = []
  const admin = { from(table) {
    const builder = { select: () => builder, eq: () => builder, gt: () => builder,
      maybeSingle: async () => ({ data: { AIDexterIntent_AllowedActionsJSON: [action], AIDexterIntent_AccessMode: 'full' }, error: null }),
      insert: row => { writes.push({ table, row }); return builder }, single: async () => response }
    return builder
  }, rpc: () => assert.fail('Preparing must not execute a change') }
  const input = { conversationId: null, clientSessionId: crypto.randomUUID(), intentPlanId: crypto.randomUUID(), grantId: crypto.randomUUID(),
    actionCode: action, arguments: { target_id: crypto.randomUUID(), route_id: crypto.randomUUID(), mode: 'air',
      expected_updated_at: '2026-09-05T12:00:00Z', expected_route_updated_at: '2026-09-05T12:00:00Z', reason: 'Operator changed service' },
    title: 'Harmless change', description: 'Nothing will be cleared', changes: [], accessMode: 'full' }
  const prepared = await prepareServerAction(admin, actor, input)
  assert.deepEqual(prepared.review, { title: response.data.AIDexterPrepared_Title, description: response.data.AIDexterPrepared_Description, changes })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].table, 'AI_DexterPreparedActions')
  assert.equal(writes[0].row.AIDexterPrepared_Status, 'prepared')
  for (const invalid of [{ data: null, error: { message: 'unavailable' } },
    { data: { ...response.data, AIDexterPrepared_ChangesJSON: [null] }, error: null }]) {
    response = invalid
    await assert.rejects(prepareServerAction(admin, actor, input), /prepared_action_unavailable/)
  }
})

// Execute each real response branch with only external/model dependencies
// replaced. This covers what is emitted/persisted, not just source markers.
const agentSource = readFileSync(new URL('../functions/agent-dexter/index.ts', import.meta.url), 'utf8')
const branchStart = '} else if (requiresExplicitActionApproval(action.code, accessMode)) {'
const branchEnd = '\n        } else {\n          if (!security.allowedActionCodes.includes(action.code)'
let offset = 0
for (const streaming of [true, false]) {
  const start = agentSource.indexOf(branchStart, offset) + branchStart.length
  const end = agentSource.indexOf(branchEnd, start)
  assert.ok(start >= branchStart.length && end > start, 'Actual mandatory approval response branch found')
  offset = end
  const executableBranch = stripTypeScriptTypes(`async function responseBranch(deps: any) {
    const { argumentsWithDocumentEvidence, args, latestDocumentExtraction, currentRecordsById, cleanString,
      preparedActionDescription, locale, action, emailState, documentEvidence, actionChanges, prepareServerAction,
      admin, actor, conversationId, security, sanitiseAnswer, actionDisplayName, accessMode, emit,
      extractedActionCopy, actionCopy, lane, route, PROMPT_VERSION, domainCodes, emailProviders,
      reasoningSummaries, usage, json, request, persistExchange } = deps;
    ${agentSource.slice(start, end)}
  }`)
  const responseBranch = new Function(`${executableBranch}; return responseBranch`)()
  test(`Routing mode: ${streaming ? 'streamed' : 'persisted'} response displays canonical review in card and answer`, async () => {
    const review = { title: 'Change TEST1 · Leg 1 mode', description: 'Warning: shared transport references will be cleared.',
      changes: [{ field: 'Master transport reference', before: 'MBL-1', after: null, beforeKnown: true, kind: 'removed' }] }
    const events = [], persisted = []
    const deps = { args: {}, latestDocumentExtraction: null, currentRecordsById: new Map(), cleanString: () => '',
      argumentsWithDocumentEvidence: args => args, preparedActionDescription: () => 'Misleading model copy',
      locale: 'en-GB', action: { code: 'change_booking_route_mode', name: 'Model title', description: 'Model description' },
      emailState: null, documentEvidence: () => null, actionChanges: () => [],
      prepareServerAction: async () => ({ id: 'prepared-id', review }), admin: {}, actor: {}, conversationId: null,
      security: {}, sanitiseAnswer: value => value, actionDisplayName: () => 'Model title', accessMode: 'full',
      emit: event => events.push(event), extractedActionCopy: (_locale, _file, reason) => reason,
      actionCopy: (_locale, _kind, reason) => reason, lane: 'test', route: {}, PROMPT_VERSION: 'test',
      domainCodes: [], emailProviders: [], reasoningSummaries: [], usage: {}, request: {},
      json: (_request, value) => value, persistExchange: async result => { persisted.push(result); return result } }
    const response = await responseBranch(deps)
    const result = streaming ? response : response.conversation
    assert.deepEqual(result.pendingAction, { id: 'prepared-id', ...review })
    assert.equal(result.answer, review.description)
    if (streaming) {
      assert.deepEqual(events.find(event => event.type === 'pending_action').pendingAction, result.pendingAction)
      assert.equal(events.find(event => event.type === 'delta').delta, review.description)
    } else assert.deepEqual(persisted, [result])
  })
}
