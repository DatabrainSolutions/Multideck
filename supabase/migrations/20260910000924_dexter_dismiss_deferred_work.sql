begin;
create function public.multideck_dexter_dismiss_deferred_work(p_company_id uuid,p_user_id uuid,p_conversation_id uuid,p_message_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service only.' using errcode='42501';end if;
 select m."AIMSG_ContentJSON" into saved from public."AI_Messages" m
 join public."AI_Conversations" c on c."AICNV_ID"=m."AIMSG_ConversationID"
 where m."AIMSG_ID"=p_message_id and m."AIMSG_ConversationID"=p_conversation_id and m."AIMSG_Role"='assistant'
  and c."AICNV_CompanyID"=p_company_id and c."AICNV_OwnerUserID"=p_user_id
 for update of m;
 if not found or jsonb_typeof(saved#>'{metadata,deferredWork}') is distinct from 'object' then return false;end if;
 if saved#>>'{metadata,deferredWorkDismissedAt}' is not null then return true;end if;
 update public."AI_Messages" set "AIMSG_ContentJSON"=jsonb_set(saved,'{metadata,deferredWorkDismissedAt}',to_jsonb(now())) where "AIMSG_ID"=p_message_id;
 return true;
end $$;
revoke all on function public.multideck_dexter_dismiss_deferred_work(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_dexter_dismiss_deferred_work(uuid,uuid,uuid,uuid) to service_role;
commit;
