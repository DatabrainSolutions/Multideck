-- A changed schedule must not start from an already selected worker candidate.
begin;

create or replace function public.multideck_task_claim() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record; a public."AI_DexterTaskAssignments"; r public."AI_DexterTaskRuns"; result jsonb:='[]';
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only.' using errcode='42501';end if;
 if not exists(select 1 from public."AI_DexterTaskSettings" where enabled) then return '[]';end if;
 -- Serialise claims, never the model work. Three workers per owner across invocations.
 perform pg_advisory_xact_lock(hashtextextended('dexter-task-claims',0));
 for item in select runs.id from public."AI_DexterTaskRuns" runs join public."AI_DexterTaskAssignments" assignment on assignment.id=runs.assignment_id
 join public."cmp_Users" u on u."User_ID"=assignment.owner_id and u."Company_ID"=assignment.company_id and coalesce(u."User_AccessStatus",'active')='active'
 join public."OPS_UserTasks" t on t."TodoTask_ID"=assignment.task_id and t."TodoTask_StatusCode"='open' and not t."TodoTask_IsDeleted"
 where ((runs.state='queued' and runs.due_at<=now()) or (runs.state='running' and runs.lease_until<now()))
 and (select count(*) from public."AI_DexterTaskRuns" x join public."AI_DexterTaskAssignments" y on y.id=x.assignment_id where y.owner_id=assignment.owner_id and x.state='running' and x.lease_until>now())<3 order by runs.due_at,runs.created_at limit 30 loop
  -- Match task-control lock order. The cursor's candidate may have been
  -- cancelled or rescheduled while we waited for the assignment lock.
  select assignment.* into a from public."AI_DexterTaskAssignments" assignment
   join public."AI_DexterTaskRuns" candidate on candidate.assignment_id=assignment.id
   where candidate.id=item.id for update of assignment;
  select * into r from public."AI_DexterTaskRuns" where id=item.id for update;
  if not ((r.state='queued' and r.due_at<=now()) or
          (r.state='running' and r.lease_until<now())) then continue;end if;
  if not exists(select 1 from public."OPS_UserTasks" t where t."TodoTask_ID"=a.task_id
    and t."TodoTask_StatusCode"='open' and not t."TodoTask_IsDeleted") then continue;end if;
  if r.attempts>=3 then
   update public."AI_DexterTaskRuns" set state='failed',lease_token=null,lease_until=null,error_code='worker_interrupted',finished_at=now() where id=r.id;
   update public."AI_DexterTaskAssignments" set status='failed',summary='The background run was interrupted. Your task is kept; retry when ready.',message_id=null,result_revision=result_revision+1,version=version+1,updated_at=now() where id=a.id;
   insert into public."Comm_Notifications"("CommNotif_UserID","CommNotif_Title","CommNotif_Body","CommNotif_TargetTable","CommNotif_TargetID","CommNotif_LinkTypeCode","CommNotif_MetadataJSON","CommNotif_CreatedBy") values(a.owner_id,'Your task needs attention','The background run was interrupted. Open the task to retry.','AI_DexterTaskAssignments',a.id,'dexter_watch',jsonb_build_object('action_url','/agent-dexter?conversation='||a.conversation_id),a.owner_id);
   continue;
  end if;
  if (select count(*) from public."AI_DexterTaskRuns" x join public."AI_DexterTaskAssignments" y on y.id=x.assignment_id where y.owner_id=a.owner_id and x.state='running' and x.lease_until>now())>=3 then continue;end if;
  update public."AI_DexterTaskRuns" set state='running',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 where id=r.id returning * into r;
  update public."AI_DexterTaskAssignments" set status='working',summary='Finding the context and preparing your result',version=version+1,updated_at=now() where id=a.id;
  perform public._dexter_task_icons(a.owner_id);
  result:=result||jsonb_build_array(jsonb_build_object('id',r.id,'lease_token',r.lease_token));
  exit when jsonb_array_length(result)>=3;
 end loop;
 return result;
end $$;
revoke all on function public.multideck_task_claim() from public,anon,authenticated;
grant execute on function public.multideck_task_claim() to service_role;


commit;
