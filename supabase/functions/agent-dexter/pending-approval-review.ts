import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.108.2'
import type { DexterActor } from './security.ts'
import { supersedeApprovals } from './supersede-approvals.ts'

export const pendingApprovalTools = [
  {type:'function',name:'list_pending_approvals',description:'Read your still-pending approvals in this conversation before replacing or withdrawing a previous proposal.',strict:true,parameters:{type:'object',properties:{},required:[],additionalProperties:false}},
  {type:'function',name:'withdraw_pending_approval',description:'Withdraw one previously read pending approval only when the operator asks to cancel or replace that proposal. Does not undo completed work or apply a replacement.',strict:true,parameters:{type:'object',properties:{approval_id:{type:'string'}},required:['approval_id'],additionalProperties:false}},
]

export function pendingApprovalReview(admin: SupabaseClient, actor: DexterActor, conversationId: string|null) {
  const observed = new Map<string, {sessionId:string}>()
  return async (name:string,args:Record<string,unknown>) => {
    if (!conversationId) return {error:'There are no earlier approvals in this new conversation.'}
    if (name==='list_pending_approvals') {
      const {data,error}=await admin.from('AI_DexterPreparedActions')
        .select('AIDexterPrepared_ID,AIDexterPrepared_ClientSessionID,AIDexterPrepared_Title,AIDexterPrepared_ActionCode,AIDexterPrepared_ChangesJSON')
        .eq('AIDexterPrepared_CompanyID',actor.companyId).eq('AIDexterPrepared_UserID',actor.userId)
        .eq('AIDexterPrepared_ConversationID',conversationId).eq('AIDexterPrepared_Status','prepared')
        .gt('AIDexterPrepared_ExpiresAt',new Date().toISOString()).order('AIDexterPrepared_CreatedAt',{ascending:false}).limit(24)
      if(error) throw new Error('pending_approvals_unavailable')
      observed.clear()
      return {approvals:(data??[]).map(row=>{
        observed.set(row.AIDexterPrepared_ID,{sessionId:row.AIDexterPrepared_ClientSessionID})
        return {id:row.AIDexterPrepared_ID,title:row.AIDexterPrepared_Title,actionCode:row.AIDexterPrepared_ActionCode,changes:row.AIDexterPrepared_ChangesJSON}
      })}
    }
    const id=typeof args.approval_id==='string'?args.approval_id:''
    const row=observed.get(id)
    if(!row) return {error:'Read pending approvals in this conversation and select the exact proposal the operator wants replaced or cancelled.'}
    const changed=await supersedeApprovals(admin,actor,{conversationId,clientSessionId:row.sessionId,actionIds:[id]})
    observed.delete(id)
    if(!changed.includes(id)) return {error:'That approval is no longer pending. Read the current approvals; do not claim it was withdrawn or undo completed work.'}
    return {withdrawn:true,approvalId:id,instruction:'The old approval can no longer execute. Read current record data and prepare any requested replacement for a separate review. Leave unrelated approvals alone.'}
  }
}
