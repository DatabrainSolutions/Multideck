import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.108.2'
import type {DexterActor} from './security.ts'
/** Expiry uses the existing claim boundary; the reason distinguishes a revised request. */
export async function supersedeApprovals(admin:SupabaseClient,actor:DexterActor,context:{
  conversationId:string|null;clientSessionId:string;actionIds:string[]
}) {
  const ids=[...new Set(context.actionIds)]
  if(!ids.length)return []
  if(ids.length>24)throw new Error('invalid_approval_scope')
  let update=admin.from('AI_DexterPreparedActions').update({
    AIDexterPrepared_Status:'expired',AIDexterPrepared_ErrorCode:'dexter_request_revised',
    AIDexterPrepared_CompletedAt:new Date().toISOString(),
  }).in('AIDexterPrepared_ID',ids).eq('AIDexterPrepared_CompanyID',actor.companyId)
    .eq('AIDexterPrepared_UserID',actor.userId).eq('AIDexterPrepared_ClientSessionID',context.clientSessionId)
    .eq('AIDexterPrepared_Status','prepared')
  update=context.conversationId?update.eq('AIDexterPrepared_ConversationID',context.conversationId):update.is('AIDexterPrepared_ConversationID',null)
  const {data,error}=await update.select('AIDexterPrepared_ID')
  if(error)throw new Error('approval_supersession_failed')
  const changed=(data??[]).map(row=>String(row.AIDexterPrepared_ID))
  if(changed.length){
    const {error:auditError}=await admin.from('AI_DexterSecurityEvents').insert({
      AIDexterSecurityEvent_CompanyID:actor.companyId,AIDexterSecurityEvent_UserID:actor.userId,
      AIDexterSecurityEvent_Kind:'prepared_actions_superseded',AIDexterSecurityEvent_Severity:'info',
      AIDexterSecurityEvent_MetadataJSON:{preparedActionIds:changed,reason:'operator_correction'},
    })
    if(auditError)throw new Error('approval_supersession_audit_failed')
  }
  return changed
}
