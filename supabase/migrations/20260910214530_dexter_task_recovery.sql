begin;
-- Report an interrupted connection promptly and release its slot. Retrying keeps
-- the original run id so saved responses and proposals can be recovered safely.
create function public.multideck_task_worker_interrupted(p_run uuid,p_token uuid,p_code text) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments"; attempts integer;
begin
 a:=public._dexter_task_lease(p_run,p_token);
 select r.attempts into attempts from public."AI_DexterTaskRuns" r where r.id=p_run for update;
 update public."AI_DexterTaskRuns" set error_code=left(regexp_replace(coalesce(p_code,'worker_interrupted'),'[^a-zA-Z0-9_]','','g'),100) where id=p_run;
 if attempts>=3 then
  return public.multideck_task_finish(p_run,p_token,jsonb_build_object('status','failed','summary','The connection was interrupted repeatedly. Your task and any saved work are kept. Open the task to retry.'));
 end if;
 update public."AI_DexterTaskRuns" set state='queued',due_at=now()+interval '30 seconds',lease_until=null,lease_token=null where id=p_run;
 update public."AI_DexterTaskAssignments" set status='queued',summary='The connection was interrupted. Retrying shortly.',version=version+1,updated_at=now() where id=a.id;
 return true;
end $$;
revoke all on function public.multideck_task_worker_interrupted(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_task_worker_interrupted(uuid,uuid,text) to service_role;
-- Linked events wake the task; its actual result is the notification to review.
create function public._dexter_task_notification() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new."CommNotif_TargetTable"='AI_DexterWatches' and exists(select 1 from public."AI_DexterTaskAssignments" where watch_id=new."CommNotif_TargetID" and owner_id=new."CommNotif_UserID") then return null;end if;
 return new;
end $$;
revoke all on function public._dexter_task_notification() from public,anon,authenticated;
create trigger dexter_task_notification before insert on public."Comm_Notifications" for each row execute function public._dexter_task_notification();
commit;
