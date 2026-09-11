-- A finished provider request is distinct from a durably saved conversation reply.
alter table public."AI_DexterActiveRuns"
 add column saved_conversation_id uuid,
 add column saved_message_id uuid;

create function public.multideck_dexter_bind_run_result(
 p_run_id uuid,p_company_id uuid,p_user_id uuid,p_auth_user_id uuid,
 p_client_session_id uuid,p_conversation_id uuid,p_message_id uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public."AI_DexterActiveRuns";
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'server_only' using errcode='42501';end if;
 if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id
  and "Auth_User_ID"=p_auth_user_id and coalesce("User_AccessStatus",'active')='active')
 then raise exception 'actor_unavailable' using errcode='42501';end if;
 select * into r from public."AI_DexterActiveRuns" where id=p_run_id and company_id=p_company_id
  and user_id=p_user_id and client_session_id=p_client_session_id for update;
 if not found then raise exception 'run_unavailable' using errcode='42501';end if;
 if r.conversation_id is not null and r.conversation_id<>p_conversation_id
 then raise exception 'conversation_mismatch' using errcode='42501';end if;
 if not exists(select 1 from public."AI_Messages" m join public."AI_Conversations" c
  on c."AICNV_ID"=m."AIMSG_ConversationID"
  where m."AIMSG_ID"=p_message_id and m."AIMSG_ConversationID"=p_conversation_id
   and m."AIMSG_Role"='assistant' and m."AIMSG_ContentJSON"->'metadata'->>'activeRunId'=p_run_id::text
   and c."AICNV_CompanyID"=p_company_id and c."AICNV_OwnerUserID"=p_user_id
   and c."AICNV_Channel"='chat' and c."AICNV_EndedAt" is null)
 then raise exception 'saved_reply_unavailable' using errcode='42501';end if;
 if r.saved_message_id is not null and (r.saved_message_id<>p_message_id or r.saved_conversation_id<>p_conversation_id)
 then raise exception 'result_already_bound' using errcode='55000';end if;
 update public."AI_DexterActiveRuns" set saved_conversation_id=p_conversation_id,saved_message_id=p_message_id where id=r.id;
end $$;
revoke all on function public.multideck_dexter_bind_run_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_dexter_bind_run_result(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to service_role;

-- Keep the existing owner/session/expiry checks; expose references only while the
-- saved reply still belongs to this operator's active chat conversation.
do $patch$
declare definition text; old_return text := $old$return jsonb_build_object('id',r.id,'status',r.status,'expiresAt',r.expires_at,'inputs',v_inputs);$old$;
begin
 select pg_get_functiondef('public.multideck_dexter_active_run(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text)'::regprocedure) into definition;
 if position(old_return in definition)=0 then raise exception 'active_run_return_changed';end if;
 definition:=replace(definition,old_return,$new$
 return jsonb_build_object('id',r.id,'status',r.status,'expiresAt',r.expires_at,'inputs',v_inputs,
  'savedResult',(select jsonb_build_object('conversationId',c."AICNV_ID",'messageId',m."AIMSG_ID")
   from public."AI_Conversations" c join public."AI_Messages" m on m."AIMSG_ConversationID"=c."AICNV_ID"
   where c."AICNV_ID"=r.saved_conversation_id and m."AIMSG_ID"=r.saved_message_id
    and c."AICNV_CompanyID"=p_company_id and c."AICNV_OwnerUserID"=p_user_id
    and c."AICNV_Channel"='chat' and c."AICNV_EndedAt" is null));
 $new$);
 execute definition;
end $patch$;
