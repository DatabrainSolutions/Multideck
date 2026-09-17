begin;

-- A voice-only chat belongs in the same private conversation history, even
-- before the first delegated tool request. Creation and reservation are atomic.
do $patch$
declare
  signature regprocedure := 'public.multideck_voice_reserve(uuid,uuid,uuid,text,boolean)'::regprocedure;
  definition text;
  marker text := '  insert into public."AI_DexterModelEgressAudit"';
begin
  definition := pg_get_functiondef(signature);
  if position(marker in definition)=0 or position('return jsonb_build_object(''id'',session_id,''seconds'',allowed);' in definition)=0 then
    raise exception 'Voice conversation patch no longer matches';
  end if;
  definition := replace(definition, marker, $body$
  if p_conversation_id is null and not p_preview then
    p_conversation_id := gen_random_uuid();
    insert into public."AI_Conversations" (
      "AICNV_ID","AICNV_Title","AICNV_Channel","AICNV_DomainCode","AICNV_CompanyID","AICNV_OwnerUserID",
      "AICNV_Status","AICNV_SecurityClass","AICNV_IsTrainingAllowed","AICNV_MetadataJSON",
      "AICNV_StartedAt","AICNV_CreatedAt","AICNV_CreatedBy","AICNV_UpdatedAt","AICNV_UpdatedBy"
    ) values (
      p_conversation_id,'Voice conversation','chat','multideck',p_company_id,p_user_id,
      'open','internal',false,'{"agent":"dexter","domain":"multideck"}',now(),now(),p_user_id,now(),p_user_id
    );
    insert into public."AI_ConversationParticipants" (
      "AICNP_ConversationID","AICNP_ParticipantType","AICNP_UserID","AICNP_IsPrimary","AICNP_CreatedAt"
    ) values (p_conversation_id,'user',p_user_id,true,now());
    insert into public."AI_ConversationParticipants" (
      "AICNP_ConversationID","AICNP_ParticipantType","AICNP_DisplayNameSnapshot","AICNP_IsPrimary","AICNP_CreatedAt"
    ) values (p_conversation_id,'ai','Dexter',false,now());
  end if;
  insert into public."AI_DexterModelEgressAudit"$body$);
  execute replace(definition,
    'return jsonb_build_object(''id'',session_id,''seconds'',allowed);',
    'return jsonb_build_object(''id'',session_id,''seconds'',allowed,''conversationId'',p_conversation_id);');
end $patch$;

-- Database maintenance only: no scheduled LLM calls or dependency on an HTTP
-- retention secret. The job's owner is postgres; browser roles cannot call it.
do $schedule$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('multideck-dexter-voice-reconcile','* * * * *',
      'select set_config(''request.jwt.claim.role'',''service_role'',true); select public.multideck_voice_reconcile(null);');
  end if;
end $schedule$;
commit;
