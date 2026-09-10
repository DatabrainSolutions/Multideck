import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { createSecurityContext, declinePreparedAction, prepareServerAction, type DexterActor } from "./security.ts"

type Json = Record<string, any>
const object = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value)

/** The Send button authorises preparation of the exact, already reviewed draft.
 * It does not run a model or grant Full access. Execution still claims a fresh
 * send_email approval, and Inbox independently claims the provider draft once.
 */
export async function prepareProviderDraftSend(admin: SupabaseClient, actor: DexterActor, messageId: string) {
  const { data: allowed, error: permissionError } = await admin.rpc("_multideck_dexter_has_permissions", {
    p_user_id: actor.userId, p_permissions: ["AgentDexter.Manage", "Email.Send"],
  })
  if (permissionError || allowed !== true) throw new Error("email_action_permission_denied")
  const { data: message, error: messageError } = await admin.from("AI_Messages")
    .select("AIMSG_ConversationID,AIMSG_ContentJSON").eq("AIMSG_ID", messageId).eq("AIMSG_Role", "assistant").maybeSingle()
  if (messageError || !message) throw new Error("provider_draft_unavailable")
  const { data: conversation, error: conversationError } = await admin.from("AI_Conversations").select("AICNV_ID")
    .eq("AICNV_ID", message.AIMSG_ConversationID).eq("AICNV_CompanyID", actor.companyId)
    .eq("AICNV_OwnerUserID", actor.userId).eq("AICNV_Channel", "chat").is("AICNV_EndedAt", null).maybeSingle()
  if (conversationError || !conversation) throw new Error("provider_draft_unavailable")
  const content = object(message.AIMSG_ContentJSON) ? message.AIMSG_ContentJSON : {}
  const metadata = object(content.metadata) ? content.metadata : {}
  const original = metadata.emailDraft
  if (!object(original)) throw new Error("provider_draft_unavailable")
  const pendingActions: Json[] = Array.isArray(metadata.pendingActions) ? metadata.pendingActions.filter(object)
    : object(metadata.pendingAction) ? [metadata.pendingAction] : []
  const emailActions = pendingActions.filter(action => action.emailDraftId === original.id || action.id === metadata.pendingAction?.id)
  if (!emailActions.length) throw new Error("provider_draft_unavailable")
  const { data: records, error: actionError } = await admin.from("AI_DexterPreparedActions")
    .select("AIDexterPrepared_ID,AIDexterPrepared_ActionCode,AIDexterPrepared_Status,AIDexterPrepared_ExpiresAt,AIDexterPrepared_ResultJSON")
    .eq("AIDexterPrepared_CompanyID", actor.companyId).eq("AIDexterPrepared_UserID", actor.userId)
    .eq("AIDexterPrepared_ConversationID", conversation.AICNV_ID).in("AIDexterPrepared_ID", emailActions.map(action => action.id))
  if (actionError) throw new Error("provider_draft_unavailable")
  const send = records?.find(row => row.AIDexterPrepared_ActionCode === "send_email")
  if (send) {
    const pendingAction = emailActions.find(action => action.id === send.AIDexterPrepared_ID)!
    if (send.AIDexterPrepared_Status === "prepared" && Date.parse(send.AIDexterPrepared_ExpiresAt) > Date.now()) return { pendingAction }
    // Never turn an uncertain, expired or completed approval into another send.
    throw new Error("provider_draft_send_already_prepared")
  }
  const created = records?.find(row => row.AIDexterPrepared_ActionCode === "create_email_draft" && row.AIDexterPrepared_Status === "succeeded")
  const confirmed = created?.AIDexterPrepared_ResultJSON?.emailDraft
  if (!object(confirmed) || confirmed.id !== original.id || confirmed.delivery?.status !== "draft_created" || !confirmed.delivery.messageId) {
    throw new Error("provider_draft_unavailable")
  }
  const draft: Json = { ...confirmed, requestedAction: "send" }
  const clientSessionId = crypto.randomUUID()
  const security = await createSecurityContext({
    admin, actor, conversationId: conversation.AICNV_ID, clientSessionId, grantId: null,
    prompt: "Send this exact reviewed provider email draft.", specialist: "email",
    availableActionCodes: ["send_email"], trustedTargetIds: [],
    trustedRecipientAddresses: [draft.to, draft.cc, draft.bcc].flatMap(value => Array.isArray(value) ? value : []).map(value => value.address),
  })
  const changes = [
    { field: "To", before: null, after: (draft.to ?? []).map((item: Json) => item.address).join(", ") },
    { field: "Cc", before: null, after: (draft.cc ?? []).map((item: Json) => item.address).join(", ") },
    { field: "Bcc", before: null, after: (draft.bcc ?? []).map((item: Json) => item.address).join(", ") },
    { field: "Subject", before: null, after: draft.subject },
    { field: "Message", before: null, after: draft.bodyText },
  ].filter(change => Boolean(change.after))
  const title = "Send email"
  const description = "Send this exact draft once through its connected mailbox."
  const prepared = await prepareServerAction(admin, actor, {
    conversationId: conversation.AICNV_ID, clientSessionId, intentPlanId: security.intentPlanId, grantId: null,
    actionCode: "send_email", arguments: { draft }, title, description, changes, accessMode: "approve",
  })
  const pendingAction = { id: prepared.id, title, description, changes, emailDraftId: draft.id }
  // Compare-and-set protects the saved conversation against concurrent preparation.
  const { data: saved, error: saveError } = await admin.from("AI_Messages").update({ AIMSG_ContentJSON: {
    ...content, metadata: { ...metadata, emailDraft: draft, pendingAction, pendingActions: [...pendingActions, pendingAction] },
  } }).eq("AIMSG_ID", messageId).eq("AIMSG_ConversationID", conversation.AICNV_ID)
    .eq("AIMSG_ContentJSON", JSON.stringify(content)).select("AIMSG_ID").maybeSingle()
  if (saveError || !saved) {
    await declinePreparedAction(admin, actor, prepared.id, conversation.AICNV_ID)
    throw new Error("provider_draft_changed")
  }
  return { pendingAction }
}
