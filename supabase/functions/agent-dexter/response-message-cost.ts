import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.108.2'
import type {DexterActor} from './security.ts'
/** Exact settled response costs, never browser-supplied token counts or prices. */
export async function recordResponseMessageCost(admin:SupabaseClient,actor:DexterActor,conversationId:string,messageId:string,responseIds:string[]) {
 const ids=[...new Set(responseIds)]
 if(!ids.length||ids.length>40)throw new Error('invalid_response_usage_scope')
 const {data:owner,error:ownerError}=await admin.from('AI_Conversations').select('AICNV_ID')
  .eq('AICNV_ID',conversationId).eq('AICNV_CompanyID',actor.companyId).eq('AICNV_OwnerUserID',actor.userId).maybeSingle()
 if(ownerError||!owner)throw new Error('usage_conversation_unavailable')
 const {data,error}=await admin.from('AI_DexterModelEgressAudit')
  .select('AIDexterEgress_ProviderRequestID,AIDexterEgress_ActualCostGBP,AIDexterEgress_Outcome,AIDexterEgress_ConversationID')
  .eq('AIDexterEgress_CompanyID',actor.companyId).eq('AIDexterEgress_UserID',actor.userId)
  .eq('AIDexterEgress_Provider','openai').eq('AIDexterEgress_Model','gpt-6-astra').in('AIDexterEgress_ProviderRequestID',ids)
 if(error||!data||data.length!==ids.length||new Set(data.map(row=>row.AIDexterEgress_ProviderRequestID)).size!==ids.length
  ||data.some(row=>!['succeeded','failed'].includes(row.AIDexterEgress_Outcome)
   ||row.AIDexterEgress_ActualCostGBP===null||!Number.isFinite(Number(row.AIDexterEgress_ActualCostGBP))
   ||Number(row.AIDexterEgress_ActualCostGBP)<0
   ||(row.AIDexterEgress_ConversationID && row.AIDexterEgress_ConversationID!==conversationId)))
  throw new Error('response_usage_not_settled')
 const amount=data.reduce((sum,row)=>sum+Number(row.AIDexterEgress_ActualCostGBP),0)
 const {data:message,error:saveError}=await admin.from('AI_Messages')
  .update({AIMSG_TotalCostAmount:amount,AIMSG_TotalCostCurrencyCode:'GBP'})
  .eq('AIMSG_ID',messageId).eq('AIMSG_ConversationID',conversationId).eq('AIMSG_Role','assistant')
  .select('AIMSG_ID').maybeSingle()
 if(saveError||!message)throw new Error('response_message_cost_not_saved')
 return amount
}
