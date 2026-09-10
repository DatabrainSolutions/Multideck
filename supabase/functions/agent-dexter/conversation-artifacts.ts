import { createDeferredWork } from "./deferred-work.ts"
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import type { DexterActor } from "./security.ts"

type Json = Record<string, unknown>
const object = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value)

/** Enrich only a conversation already returned by the owner-private read RPC.
 * Recheck ownership before the privileged metadata read; never trust a client ID.
 * Action status comes from the action ledger, not saved model prose.
 */
export async function hydrateConversationArtifacts(admin: SupabaseClient, actor: DexterActor, conversation: Json) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages.filter(object) : []
  if (!messages.length) return conversation
  const { data: owned, error: ownershipError } = await admin.from("AI_Conversations")
    .select("AICNV_ID").eq("AICNV_ID", conversation.id)
    .eq("AICNV_CompanyID", actor.companyId).eq("AICNV_OwnerUserID", actor.userId).maybeSingle()
  if (ownershipError || !owned) throw new Error("conversation_unavailable")
  const { data, error } = await admin.from("AI_Messages")
    .select("AIMSG_ID,AIMSG_ContentJSON").eq("AIMSG_ConversationID", conversation.id)
    .in("AIMSG_ID", messages.map(message => message.id))
  if (error) throw new Error("conversation_artifacts_unavailable")
  const metadata = new Map((data ?? []).map(row => [row.AIMSG_ID, object(row.AIMSG_ContentJSON?.metadata) ? row.AIMSG_ContentJSON.metadata : {}]))
  const models = new Map((data ?? []).map(row => [row.AIMSG_ID, row.AIMSG_ContentJSON?.model]))
  const ids = new Set<string>()
  const enriched: (Json & { pendingActions: Json[]; recordTables: unknown[] })[] = messages.map(message => {
    const saved = metadata.get(message.id) ?? {}
    const pendingActions: Json[] = Array.isArray(saved.pendingActions) ? saved.pendingActions.filter(object)
      : object(message.pendingAction) ? [message.pendingAction] : []
    pendingActions.forEach(action => { if (typeof action.id === "string") ids.add(action.id) })
    const model = models.get(message.id)
    return { ...message, ...(["fast", "smart", "worker"].includes(String(model)) ? {model} : {}), pendingActions,
      deferredWorkDismissed: typeof saved.deferredWorkDismissedAt === "string",
      isActionDecision: saved.actionDecision === true,
      continuationMessageId: typeof saved.continuationMessageId === "string" ? saved.continuationMessageId : undefined,
      deferredWork: object(saved.deferredWork) ? createDeferredWork({label: saved.deferredWork.label, request: saved.deferredWork.request, after_action_ids: saved.deferredWork.afterActionIds}, pendingActions, "approve") : null,
      recordTables: Array.isArray(saved.recordTables) ? saved.recordTables : [],
      steeringInputs: Array.isArray(saved.steeringInputs) ? saved.steeringInputs.filter(object)
        .filter((item: Json) => typeof item.input === "string" && typeof item.responseId === "string") : [],
    }
  })
  const draftOwners = new Map<string, unknown>()
  for (const message of enriched) for (const action of message.pendingActions) {
    if (typeof action.emailDraftId === "string") draftOwners.set(action.emailDraftId, message.id)
  }
  const statuses = new Map<string, string>()
  const deliveries = new Map<string, Json>()
  if (ids.size) {
    const { data: actions, error: actionError } = await admin.from("AI_DexterPreparedActions")
      .select("AIDexterPrepared_ID,AIDexterPrepared_Status,AIDexterPrepared_ExpiresAt,AIDexterPrepared_ResultJSON,AIDexterPrepared_ErrorCode")
      .eq("AIDexterPrepared_ConversationID", conversation.id)
      .eq("AIDexterPrepared_CompanyID", actor.companyId).eq("AIDexterPrepared_UserID", actor.userId)
      .in("AIDexterPrepared_ID", [...ids])
    if (actionError) throw new Error("conversation_actions_unavailable")
    for (const action of actions ?? []) {
      if (object(action.AIDexterPrepared_ResultJSON?.emailDraft)) deliveries.set(action.AIDexterPrepared_ID, action.AIDexterPrepared_ResultJSON.emailDraft)
      statuses.set(action.AIDexterPrepared_ID,
      action.AIDexterPrepared_Status === "expired" && action.AIDexterPrepared_ErrorCode === "dexter_request_revised"
        ? "superseded" : action.AIDexterPrepared_Status === "prepared" && Date.parse(action.AIDexterPrepared_ExpiresAt) <= Date.now()
        ? "expired" : action.AIDexterPrepared_Status)
    }
  }
  return { ...conversation, messages: enriched.map(message => {
    const latestEmailAction = [...message.pendingActions].reverse().find(action =>
      typeof action.emailDraftId === "string" || (object(message.pendingAction) && action.id === message.pendingAction.id))
    const delivery = latestEmailAction ? deliveries.get(String(latestEmailAction.id)) : undefined
    return { ...message,
    ...(object(message.emailDraft) && draftOwners.has(String(message.emailDraft.id)) && draftOwners.get(String(message.emailDraft.id)) !== message.id ? { emailDraft: null } : {}),
    ...(delivery ? { emailDraft: delivery } : {}),
    ...(latestEmailAction ? { pendingAction: { ...latestEmailAction, status: statuses.get(String(latestEmailAction.id)) ?? "unavailable" } } : {}),
    pendingActions: message.pendingActions.map(action => ({ ...action, status: statuses.get(String(action.id)) ?? "unavailable" })),
  } }) }
}
