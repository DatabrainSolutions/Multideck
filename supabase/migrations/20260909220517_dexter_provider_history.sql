-- Provider wire history is private server state, never accepted from a browser.
create table public."AI_DexterProviderHistory" (
 message_id uuid primary key references public."AI_Messages"("AIMSG_ID") on delete cascade,
 conversation_id uuid not null references public."AI_Conversations"("AICNV_ID") on delete cascade,
 company_id uuid not null,
 user_id uuid not null,
 history jsonb not null check (jsonb_typeof(history)='object' and octet_length(history::text)<=2097152),
 created_at timestamptz not null default clock_timestamp()
);
alter table public."AI_DexterProviderHistory" enable row level security;
revoke all on public."AI_DexterProviderHistory" from public,anon,authenticated;
grant select,insert on public."AI_DexterProviderHistory" to service_role;
create function public.multideck_dexter_provider_history(p_company_id uuid,p_user_id uuid,p_auth_user_id uuid,
 p_conversation_id uuid,p_message_id uuid,p_history jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_history jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'server_only' using errcode='42501';end if;
 if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id
  and "Auth_User_ID"=p_auth_user_id and coalesce("User_AccessStatus",'active')='active')
 or not exists(select 1 from public."AI_Conversations" c join public."AI_Messages" m on m."AIMSG_ConversationID"=c."AICNV_ID"
  where c."AICNV_ID"=p_conversation_id and c."AICNV_CompanyID"=p_company_id and c."AICNV_OwnerUserID"=p_user_id
  and c."AICNV_Channel"='chat' and c."AICNV_EndedAt" is null and m."AIMSG_ID"=p_message_id and m."AIMSG_Role"='assistant')
 then raise exception 'provider_history_unavailable' using errcode='42501';end if;
 if p_history is not null then
  if p_history->>'model' is distinct from 'gpt-6-astra'
   or coalesce(p_history->>'baseEffort','') not in ('low','medium','high','xhigh','max')
   or coalesce(p_history->>'lastEffort','') not in ('low','medium','high','xhigh','max')
   or jsonb_typeof(p_history->'items') is distinct from 'array'
   or jsonb_typeof(p_history->'contract') is distinct from 'string'
  then raise exception 'invalid_provider_history' using errcode='22023';end if;
  insert into public."AI_DexterProviderHistory"(message_id,conversation_id,company_id,user_id,history)
   values(p_message_id,p_conversation_id,p_company_id,p_user_id,p_history) on conflict(message_id) do nothing;
 end if;
 select history into v_history from public."AI_DexterProviderHistory" where message_id=p_message_id
  and conversation_id=p_conversation_id and company_id=p_company_id and user_id=p_user_id;
 if p_history is not null and v_history is distinct from p_history then raise exception 'provider_history_immutable' using errcode='22023';end if;
 return v_history;
end $$;
revoke all on function public.multideck_dexter_provider_history(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_provider_history(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
