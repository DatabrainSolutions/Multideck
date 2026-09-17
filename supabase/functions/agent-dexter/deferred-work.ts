import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import type { DexterActor } from "./security.ts"
type Json = Record<string, unknown>
export type DeferredWork = {label: string; request: string; afterActionIds: string[]}
export const deferredWorkTool = {
 type: "function", name: "defer_work_until_approval", strict: true,
 description: "Save the remaining part of this request when it depends on approvals already prepared in this turn. The UI offers Continue request after all dependencies succeed. This schedules no background work and executes nothing.",
 parameters: {type: "object", properties: {
  label: {type: "string", maxLength: 120, description: "Short description of the remaining work, e.g. Update the main address postcode."},
  request: {type: "string", maxLength: 2000, description: "Self-contained remaining user-requested work, including the exact target and requested values. Require a fresh read and approval; exclude completed or already prepared work."},
  after_action_ids: {type: "array", minItems: 1, maxItems: 8, items: {type: "string"}, description: "IDs returned by this turn's prepared-action tools that must succeed first."},
 }, required: ["label", "request", "after_action_ids"], additionalProperties: false},
}
export function createDeferredWork(args: Json, actions: Json[], accessMode: string): DeferredWork | null {
 const label = typeof args.label === "string" ? args.label.trim() : ""
 const request = typeof args.request === "string" ? args.request.trim() : ""
 const ids = args.after_action_ids
 if (accessMode !== "approve" || !label || label.length > 120 || !request || request.length > 2000
  || !Array.isArray(ids) || !ids.length || ids.length > 8 || new Set(ids).size !== ids.length
  || ids.some(id => typeof id !== "string" || !actions.some(action => action.id === id && (!action.status || action.status === "prepared")))) return null
 return {label, request, afterActionIds: ids as string[]}
}

/** Resolve saved instructions only through the caller's owned conversation and action ledger. */
export async function resolveDeferredWork(admin: SupabaseClient, actor: DexterActor, conversationId: string, messageId: string) {
 const {data: owned,error: ownershipError}=await admin.from("AI_Conversations").select("AICNV_ID")
  .eq("AICNV_ID",conversationId).eq("AICNV_CompanyID",actor.companyId).eq("AICNV_OwnerUserID",actor.userId).maybeSingle()
 if (ownershipError || !owned) throw new Error("continuation_unavailable")
 const {data: message,error: messageError}=await admin.from("AI_Messages").select("AIMSG_ContentJSON")
  .eq("AIMSG_ID",messageId).eq("AIMSG_ConversationID",conversationId).eq("AIMSG_Role","assistant").maybeSingle()
 const metadata=message?.AIMSG_ContentJSON?.metadata
 const saved=metadata?.deferredWork
 const work: DeferredWork | null = saved ? createDeferredWork({label:saved.label,request:saved.request,after_action_ids:saved.afterActionIds},Array.isArray(metadata?.pendingActions)?metadata.pendingActions:[],"approve") : null
 if (messageError || !work || metadata?.deferredWorkDismissedAt) throw new Error("continuation_unavailable")
 const {data: actions,error: actionError}=await admin.from("AI_DexterPreparedActions").select("AIDexterPrepared_ID,AIDexterPrepared_Status")
  .eq("AIDexterPrepared_CompanyID",actor.companyId).eq("AIDexterPrepared_UserID",actor.userId).eq("AIDexterPrepared_ConversationID",conversationId)
  .in("AIDexterPrepared_ID",work.afterActionIds)
 if (actionError || work.afterActionIds.some(id=>!actions?.some(action=>action.AIDexterPrepared_ID===id && action.AIDexterPrepared_Status==="succeeded"))) throw new Error("continuation_not_ready")
 return work
}
