import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hydrateConversationArtifacts } from '../functions/agent-dexter/conversation-artifacts.ts'

test('a saved background draft regains its review control from the authorised action ledger', async () => {
  const rows: Record<string, Record<string, unknown>[]> = {
    AI_Conversations: [{ AICNV_ID: 'conversation', AICNV_CompanyID: 'company', AICNV_OwnerUserID: 'owner' }],
    AI_Messages: [{ AIMSG_ID: 'message', AIMSG_ConversationID: 'conversation', AIMSG_ContentJSON: {
      model: 'worker', metadata: { pendingActions: [{ id: 'approval', emailDraftId: 'draft', title: 'Create draft' }] },
    } }],
    AI_DexterPreparedActions: [{ AIDexterPrepared_ID: 'approval', AIDexterPrepared_ConversationID: 'conversation',
      AIDexterPrepared_UserID: 'owner', AIDexterPrepared_CompanyID: 'company', AIDexterPrepared_Status: 'prepared',
      AIDexterPrepared_ExpiresAt: '2099-01-01T00:00:00Z',
    }],
  }
  const admin = { from(table: string) {
    let selected = rows[table] ?? []
    const query = {
      select() { return query },
      eq(key: string, value: unknown) { selected = selected.filter(row => row[key] === value); return query },
      in(key: string, values: unknown[]) { selected = selected.filter(row => values.includes(row[key])); return query },
      maybeSingle() { return Promise.resolve({ data: selected[0] ?? null, error: null }) },
      then(resolve: (value: unknown) => void) { return Promise.resolve({ data: selected, error: null }).then(resolve) },
    }
    return query
  } } as unknown as Parameters<typeof hydrateConversationArtifacts>[0]
  const actor = { userId: 'owner', companyId: 'company', authUserId: 'auth' }
  const conversation = { id: 'conversation', messages: [{ id: 'message', emailDraft: { id: 'draft' }, pendingAction: null }] }
  const result = await hydrateConversationArtifacts(admin, actor, conversation)
  const message = (result.messages as Record<string, unknown>[])[0]
  assert.deepEqual(message.pendingAction, { id: 'approval', emailDraftId: 'draft', title: 'Create draft', status: 'prepared' })
  rows.AI_DexterPreparedActions[0].AIDexterPrepared_Status = 'declined'
  const declined = await hydrateConversationArtifacts(admin, actor, conversation)
  assert.equal(((declined.messages as Record<string, unknown>[])[0].pendingAction as Record<string, unknown>).status, 'declined')
  await assert.rejects(hydrateConversationArtifacts(admin, { ...actor, userId: 'another-owner' }, conversation), /conversation_unavailable/)
  await assert.rejects(hydrateConversationArtifacts(admin, { ...actor, companyId: 'another-company' }, conversation), /conversation_unavailable/)
})
