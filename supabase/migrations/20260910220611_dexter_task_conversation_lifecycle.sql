-- Keep task conversations available until the owning task is deleted.
begin;

create or replace function public._dexter_task_changed() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new."TodoTask_StatusCode"='completed' or new."TodoTask_IsDeleted" then
  update public."AI_DexterTaskRuns" set state='cancelled',lease_token=null,lease_until=null where assignment_id in(select id from public."AI_DexterTaskAssignments" where task_id=new."TodoTask_ID") and state in ('queued','running');
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID" in(select watch_id from public."AI_DexterTaskAssignments" where task_id=new."TodoTask_ID");
  update public."AI_DexterTaskAssignments" set status=case when new."TodoTask_IsDeleted" then 'cancelled' else 'completed' end,version=version+1 where task_id=new."TodoTask_ID";
  if new."TodoTask_IsDeleted" then
   update public."AI_Conversations" set "AICNV_Status"='closed',"AICNV_EndedAt"=clock_timestamp(),"AICNV_UpdatedAt"=clock_timestamp(),"AICNV_UpdatedBy"=new."TodoTask_OwnerUserID"
   where "AICNV_ID" in(select conversation_id from public."AI_DexterTaskAssignments" where task_id=new."TodoTask_ID") and "AICNV_EndedAt" is null;
  end if;
 end if;
 return new;
end $$;
revoke all on function public._dexter_task_changed() from public,anon,authenticated;

create function public._dexter_task_conversation_closing() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new."AICNV_EndedAt" is not null and old."AICNV_EndedAt" is null and exists(
  select 1 from public."AI_DexterTaskAssignments" a join public."OPS_UserTasks" t on t."TodoTask_ID"=a.task_id
  where a.conversation_id=new."AICNV_ID" and not t."TodoTask_IsDeleted"
 ) then raise exception 'This conversation belongs to a task. Delete the task in Tasks to remove it and stop its background work.' using errcode='55000';end if;
 return new;
end $$;
revoke all on function public._dexter_task_conversation_closing() from public,anon,authenticated;
create trigger dexter_task_conversation_closing before update of "AICNV_EndedAt" on public."AI_Conversations" for each row execute function public._dexter_task_conversation_closing();
commit;
