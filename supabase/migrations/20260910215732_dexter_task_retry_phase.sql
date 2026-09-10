-- Retrying due work must not rediscover and defer the same original deadline.
begin;
alter table public."AI_DexterTaskRuns" alter column created_at set default clock_timestamp();

create or replace function public.multideck_task_control(p_id uuid,p_operation text,p_version integer,p_input text default null,p_revision integer default null,p_run_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor record; a public."AI_DexterTaskAssignments"; previous_phase text;
begin
 select * into actor from public._multideck_dexter_context();
 select * into a from public."AI_DexterTaskAssignments" where id=p_id and owner_id=actor.user_id and company_id=actor.company_id for update;
 if not found then raise exception 'This task is unavailable.' using errcode='42501';end if;
 if p_operation='view' then
  update public."AI_DexterTaskAssignments" set viewed_revision=greatest(viewed_revision,least(coalesce(p_revision,0),result_revision)),
   status=case when status='ready' and outcome='deliver_result' and p_revision=result_revision then 'completed' else status end where id=a.id returning * into a;
  if a.status='completed' then perform public._multideck_todo_update_for_actor(actor.company_id,actor.user_id,a.task_id,'{"status":"completed"}');end if;
  return to_jsonb(a);
 end if;
 if a.version is distinct from p_version then raise exception 'This task changed. Refresh it and try again.' using errcode='40001';end if;
 if p_operation='cancel' then
  update public."AI_DexterTaskRuns" set state='cancelled',lease_token=null,lease_until=null where assignment_id=a.id and state in ('queued','running');
  if a.watch_id is not null then perform public.multideck_dexter_set_watch_status(a.watch_id,'paused');end if;
  update public."AI_DexterTaskAssignments" set status='cancelled',summary='Background work stopped',version=version+1,updated_at=now() where id=a.id returning * into a;
 elsif p_operation in ('retry','followup','reschedule','resume') then
  if exists(select 1 from public."AI_DexterTaskRuns" where assignment_id=a.id and state='running') then raise exception 'This agent is still working. Wait for its result before following up.' using errcode='55000';end if;
  if p_operation='reschedule' and (p_run_at is null or p_run_at<=now()) then raise exception 'Choose a future date and time.' using errcode='22023';end if;
  if p_operation='followup' and nullif(btrim(p_input),'') is null then raise exception 'Write a follow-up first.' using errcode='22023';end if;
  select phase into previous_phase from public."AI_DexterTaskRuns" where assignment_id=a.id order by created_at desc,id desc limit 1;
  update public."AI_DexterTaskRuns" set state='cancelled' where assignment_id=a.id and state='queued';
  if a.watch_id is not null then perform public.multideck_dexter_set_watch_status(a.watch_id,'paused');end if;
  if exists(select 1 from public."OPS_UserTasks" where "TodoTask_ID"=a.task_id and "TodoTask_StatusCode"='completed') then
   perform public._multideck_todo_update_for_actor(actor.company_id,actor.user_id,a.task_id,'{"status":"open"}');
  end if;
  insert into public."AI_DexterTaskRuns"(assignment_id,input,phase,due_at) values(a.id,coalesce(nullif(btrim(p_input),''),a.instruction),case when p_operation='reschedule' then 'execute' when p_operation in ('retry','resume') then coalesce(previous_phase,'discover') else 'discover' end,coalesce(p_run_at,now()));
  update public."AI_DexterTaskAssignments" set status=case when p_run_at>now() then 'scheduled' else 'queued' end,summary=case when p_run_at>now() then 'Scheduled for Dexter' else 'Queued for Dexter' end,watch_id=null,instruction=coalesce(nullif(btrim(p_input),''),instruction),version=version+1,updated_at=now() where id=a.id returning * into a;
 else raise exception 'Unsupported task operation.' using errcode='22023';end if;
 perform public._dexter_task_kick();
 return to_jsonb(a);
end $$;
revoke all on function public.multideck_task_control(uuid,text,integer,text,integer,timestamptz) from public,anon;
grant execute on function public.multideck_task_control(uuid,text,integer,text,integer,timestamptz) to authenticated;

commit;
