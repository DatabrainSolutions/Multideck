-- Owner-private durable Dexter assignments. No browser token is stored or minted.
begin;

create table public."AI_DexterTaskAssignments" (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null unique references public."OPS_UserTasks"("TodoTask_ID"),
 owner_id uuid not null references public."cmp_Users"("User_ID"),
 company_id uuid not null references public."cmp_Company"("Company_ID"),
 conversation_id uuid not null unique references public."AI_Conversations"("AICNV_ID"),
 name text not null default 'Dexter', icon integer check(icon between 0 and 8),
 instruction text not null check(length(instruction) between 1 and 8000),
 time_zone text not null default 'Europe/London',
 status text not null default 'queued' check(status in ('queued','scheduled','waiting','working','ready','needs_input','failed','cancelled','completed')),
 summary text not null default 'Queued for Dexter',
 outcome text check(outcome in ('deliver_result','send_email','apply_changes')),
 watch_id uuid references public."AI_DexterWatches"("AIDexterWatch_ID"),
 result_revision integer not null default 0,
 viewed_revision integer not null default 0,
 message_id uuid,
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public."AI_DexterTaskRuns" (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public."AI_DexterTaskAssignments"(id),
 input text not null check(length(input) between 1 and 8000),
 phase text not null default 'discover' check(phase in ('discover','execute')),
 state text not null default 'queued' check(state in ('queued','running','succeeded','failed','cancelled')),
 due_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz,
 attempts integer not null default 0, error_code text,
 result jsonb, created_at timestamptz not null default now(), finished_at timestamptz
);
create unique index dexter_task_one_active_run on public."AI_DexterTaskRuns"(assignment_id) where state in ('queued','running');
create index dexter_task_due on public."AI_DexterTaskRuns"(due_at,created_at) where state in ('queued','running');
create index dexter_task_owner on public."AI_DexterTaskAssignments"(owner_id,updated_at desc);
create table public."AI_DexterTaskSettings"(singleton boolean primary key default true check(singleton),enabled boolean not null default false,endpoint text);
insert into public."AI_DexterTaskSettings"(singleton) values(true);
alter table public."AI_DexterTaskSettings" enable row level security;
revoke all on public."AI_DexterTaskSettings" from public,anon,authenticated;
grant all on public."AI_DexterTaskSettings" to service_role;
alter table public."AI_DexterTaskAssignments" enable row level security;
alter table public."AI_DexterTaskRuns" enable row level security;
revoke all on public."AI_DexterTaskAssignments",public."AI_DexterTaskRuns" from public,anon,authenticated;
grant all on public."AI_DexterTaskAssignments",public."AI_DexterTaskRuns" to service_role;
grant select on public."AI_DexterTaskAssignments" to authenticated;
create policy dexter_task_owner_read on public."AI_DexterTaskAssignments" for select to authenticated using (
 exists(select 1 from public."cmp_Users" u where u."User_ID"=owner_id and u."Company_ID"=company_id
 and u."Auth_User_ID"=auth.uid() and coalesce(u."User_AccessStatus",'active')='active')
);

create function public._dexter_task_icons(p_owner uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare a record; used integer[]:='{}'; chosen integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('dexter-tasks:'||p_owner,0));
 -- Reserve icons for working agents and the three visible unread results, not the archive.
 for a in select * from public."AI_DexterTaskAssignments" where owner_id=p_owner and
 (status='working' or id in (select id from public."AI_DexterTaskAssignments" where owner_id=p_owner
 and result_revision>viewed_revision and status in ('ready','needs_input','failed','completed')
 order by case when status in ('needs_input','failed') then 0 else 1 end,updated_at desc,id limit 3))
 order by case when status='working' then 0 else 1 end,created_at,id loop
  chosen:=a.icon;
  if chosen is null or chosen=any(used) then
   select i into chosen from generate_series(0,8) i where not(i=any(used)) order by random() limit 1;
   update public."AI_DexterTaskAssignments" set icon=chosen where id=a.id;
  end if;
  used:=array_append(used,chosen);
 end loop;
end $$;
revoke all on function public._dexter_task_icons(uuid) from public,anon,authenticated;

create function public.multideck_task_assignments() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor record; result jsonb;
begin
 select * into actor from public._multideck_dexter_context();
 perform public._dexter_task_icons(actor.user_id);
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('title',t."TodoTask_Title",'taskStatus',t."TodoTask_StatusCode",'scheduledDate',t."TodoTask_ScheduledDate",'due_at',r.due_at) order by a.updated_at desc),'[]') into result
 from (select * from public."AI_DexterTaskAssignments" where owner_id=actor.user_id and company_id=actor.company_id order by case when status in ('queued','working','waiting','scheduled') or result_revision>viewed_revision then 0 else 1 end,updated_at desc limit 200) a
 join public."OPS_UserTasks" t on t."TodoTask_ID"=a.task_id and not t."TodoTask_IsDeleted"
 left join public."AI_DexterTaskRuns" r on r.assignment_id=a.id and r.state in ('queued','running');
 return result;
end $$;
revoke all on function public.multideck_task_assignments() from public,anon;
grant execute on function public.multideck_task_assignments() to authenticated;

create function public.multideck_task_handoff(p_task_id uuid,p_instruction text default null,p_time_zone text default 'Europe/London') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor record; task public."OPS_UserTasks"; a public."AI_DexterTaskAssignments"; conv uuid:=gen_random_uuid();
begin
 select * into actor from public._multideck_dexter_context();
 if not exists(select 1 from public."AI_DexterTaskSettings" where enabled) then raise exception 'Background tasks are not enabled in this workspace yet.' using errcode='55000';end if;
 select * into task from public."OPS_UserTasks" where "TodoTask_ID"=p_task_id and "TodoTask_OwnerUserID"=actor.user_id and "TodoTask_CompanyID"=actor.company_id and not "TodoTask_IsDeleted" for update;
 if not found or task."TodoTask_StatusCode"<>'open' then raise exception 'Choose one of your open tasks.' using errcode='42501';end if;
 if not exists(select 1 from pg_timezone_names where name=p_time_zone) then raise exception 'Choose a valid timezone.' using errcode='22023';end if;
 select * into a from public."AI_DexterTaskAssignments" where task_id=p_task_id;
 if found then return to_jsonb(a);end if;
 insert into public."AI_Conversations"("AICNV_ID","AICNV_Title","AICNV_Channel","AICNV_DomainCode","AICNV_CompanyID","AICNV_OwnerUserID","AICNV_Status","AICNV_SecurityClass","AICNV_IsTrainingAllowed","AICNV_MetadataJSON","AICNV_StartedAt","AICNV_CreatedAt","AICNV_CreatedBy","AICNV_UpdatedAt","AICNV_UpdatedBy")
 values(conv,task."TodoTask_Title",'chat','multideck',actor.company_id,actor.user_id,'open','internal',false,'{"agent":"dexter","backgroundTask":true}',now(),now(),actor.user_id,now(),actor.user_id);
 insert into public."AI_DexterTaskAssignments"(task_id,owner_id,company_id,conversation_id,instruction,time_zone)
 values(p_task_id,actor.user_id,actor.company_id,conv,coalesce(nullif(btrim(p_instruction),''),task."TodoTask_Title"),p_time_zone) returning * into a;
 insert into public."AI_DexterTaskRuns"(assignment_id,input) values(a.id,a.instruction);
 perform public._dexter_task_kick();
 return to_jsonb(a);
end $$;
revoke all on function public.multideck_task_handoff(uuid,text,text) from public,anon;
grant execute on function public.multideck_task_handoff(uuid,text,text) to authenticated;

create function public.multideck_task_control(p_id uuid,p_operation text,p_version integer,p_input text default null,p_revision integer default null,p_run_at timestamptz default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor record; a public."AI_DexterTaskAssignments";
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
  update public."AI_DexterTaskRuns" set state='cancelled' where assignment_id=a.id and state='queued';
  if a.watch_id is not null then perform public.multideck_dexter_set_watch_status(a.watch_id,'paused');end if;
  if exists(select 1 from public."OPS_UserTasks" where "TodoTask_ID"=a.task_id and "TodoTask_StatusCode"='completed') then
   perform public._multideck_todo_update_for_actor(actor.company_id,actor.user_id,a.task_id,'{"status":"open"}');
  end if;
  insert into public."AI_DexterTaskRuns"(assignment_id,input,phase,due_at) values(a.id,coalesce(nullif(btrim(p_input),''),a.instruction),case when p_operation='reschedule' then 'execute' else 'discover' end,coalesce(p_run_at,now()));
  update public."AI_DexterTaskAssignments" set status=case when p_run_at>now() then 'scheduled' else 'queued' end,summary=case when p_run_at>now() then 'Scheduled for Dexter' else 'Queued for Dexter' end,watch_id=null,instruction=coalesce(nullif(btrim(p_input),''),instruction),version=version+1,updated_at=now() where id=a.id returning * into a;
 else raise exception 'Unsupported task operation.' using errcode='22023';end if;
 perform public._dexter_task_kick();
 return to_jsonb(a);
end $$;
revoke all on function public.multideck_task_control(uuid,text,integer,text,integer,timestamptz) from public,anon;
grant execute on function public.multideck_task_control(uuid,text,integer,text,integer,timestamptz) to authenticated;

create function public.multideck_task_claim() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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
  select * into r from public."AI_DexterTaskRuns" where id=item.id for update;
  select * into a from public."AI_DexterTaskAssignments" where id=r.assignment_id for update;
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

create function public._dexter_task_lease(p_run uuid,p_token uuid) returns public."AI_DexterTaskAssignments" language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments";
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only.' using errcode='42501';end if;
 select assignment.* into a from public."AI_DexterTaskAssignments" assignment join public."AI_DexterTaskRuns" r on r.assignment_id=assignment.id
 join public."cmp_Users" u on u."User_ID"=assignment.owner_id and u."Company_ID"=assignment.company_id and coalesce(u."User_AccessStatus",'active')='active'
 join public."OPS_UserTasks" t on t."TodoTask_ID"=assignment.task_id and not t."TodoTask_IsDeleted" and t."TodoTask_StatusCode"='open'
 where r.id=p_run and r.lease_token=p_token and r.state='running' and r.lease_until>now() and assignment.status='working';
 if not found then raise exception 'This task lease is unavailable.' using errcode='42501';end if;
 return a;
end $$;
revoke all on function public._dexter_task_lease(uuid,uuid) from public,anon,authenticated;

-- Strict allowlist over existing permission-checked RPCs; never arbitrary SQL/actions.
create function public.multideck_task_worker_rpc(p_run uuid,p_token uuid,p_name text,p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare a public."AI_DexterTaskAssignments"; actor uuid; proc record; arguments text; result jsonb; claims text:=current_setting('request.jwt.claims',true); sub text:=current_setting('request.jwt.claim.sub',true); jwtrole text:=current_setting('request.jwt.claim.role',true);
begin
 a:=public._dexter_task_lease(p_run,p_token);
 if p_name<>all(array['multideck_dexter_list_domains','multideck_dexter_list_actions','multideck_dexter_query_domain','multideck_dexter_prepare_conversation','multideck_dexter_save_exchange','multideck_dexter_search_email','multideck_dexter_recent_email','multideck_dexter_read_email_thread','multideck_dexter_email_thread_folders','multideck_dexter_resolve_email_attachment','multideck_dexter_get_writing_profile','multideck_dexter_resolve_email_draft_source','multideck_dexter_record_writing_profile_event','multideck_dexter_check_usage_allowance','multideck_dexter_list_watch_capabilities','multideck_dexter_create_watch']) then raise exception 'Unsupported task capability.' using errcode='42501';end if;
 if jsonb_typeof(p_args) is distinct from 'object' then raise exception 'Invalid task arguments.' using errcode='22023';end if;
 if p_name in ('multideck_dexter_save_exchange','multideck_dexter_prepare_conversation') then p_args:=p_args||jsonb_build_object('p_conversation_id',a.conversation_id);end if;
 if p_name='multideck_dexter_save_exchange' then
  if p_args->'p_metadata'->>'taskRunId' is distinct from p_run::text then raise exception 'Task result identity required.' using errcode='42501';end if;
  -- Actual save deduplication happens below after installing the owner context.
 end if;
 if p_name='multideck_dexter_create_watch' then p_args:=p_args||'{"p_action":null}';end if;
 select u."Auth_User_ID" into actor from public."cmp_Users" u where u."User_ID"=a.owner_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 if p_name='multideck_dexter_save_exchange' and exists(select 1 from public."AI_Messages" where "AIMSG_ConversationID"=a.conversation_id and "AIMSG_ContentJSON"->'metadata'->>'taskRunId'=p_run::text) then
  result:=public.multideck_dexter_get_conversation(a.conversation_id);
 else
  select p.* into proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=p_name
   and not p.proretset and (select bool_and(k=any(p.proargnames)) from jsonb_object_keys(p_args) k) is not false
   order by p.pronargs desc limit 1;
  if proc.oid is null then raise exception 'Task capability is unavailable.' using errcode='42883';end if;
  select string_agg(format('%I => %s',proc.proargnames[i+1],case when format_type(proc.proargtypes[i],null) in ('jsonb','json') then format('($1->%L)::%s',proc.proargnames[i+1],format_type(proc.proargtypes[i],null))
   when format_type(proc.proargtypes[i],null) in ('uuid[]','text[]') then format('(case when $1->%L = ''null''::jsonb then null else array(select jsonb_array_elements_text($1->%L)) end)::%s',proc.proargnames[i+1],proc.proargnames[i+1],format_type(proc.proargtypes[i],null))
   else format('($1->>%L)::%s',proc.proargnames[i+1],format_type(proc.proargtypes[i],null)) end),',' order by i) into arguments
   from generate_series(0,proc.pronargs-1) i where p_args ? proc.proargnames[i+1];
  execute format('select to_jsonb(public.%I(%s))',p_name,coalesce(arguments,'')) into result using p_args;
 end if;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(sub,''),true);perform set_config('request.jwt.claim.role',coalesce(jwtrole,''),true);
 return result;
end $$;
revoke all on function public.multideck_task_worker_rpc(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_task_worker_rpc(uuid,uuid,text,jsonb) to service_role;

create function public.multideck_task_worker_context(p_run uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments"; result jsonb;
begin
 a:=public._dexter_task_lease(p_run,p_token);
 select to_jsonb(a)||jsonb_build_object('run',to_jsonb(r)-'lease_token','authUserId',u."Auth_User_ID",'email',u."User_Email",'displayName',concat_ws(' ',u."User_Firstname",u."User_Lastname"),'task',public._multideck_todo_task_json(t)) into result
 from public."AI_DexterTaskRuns" r join public."cmp_Users" u on u."User_ID"=a.owner_id join public."OPS_UserTasks" t on t."TodoTask_ID"=a.task_id where r.id=p_run;
 return result;
end $$;
revoke all on function public.multideck_task_worker_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_task_worker_context(uuid,uuid) to service_role;

create function public.multideck_task_finish(p_run uuid,p_token uuid,p_result jsonb) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments"; r public."AI_DexterTaskRuns"; v_status text; run_at timestamptz; watch uuid; msg uuid;
begin
 a:=public._dexter_task_lease(p_run,p_token);
 select * into r from public."AI_DexterTaskRuns" where id=p_run for update;
 v_status:=p_result->>'status';
 if v_status is null or v_status not in ('ready','needs_input','scheduled','waiting','failed') then raise exception 'Invalid task outcome.' using errcode='22023';end if;
 if v_status<>'failed' then
  select "AIMSG_ID" into msg from public."AI_Messages" where "AIMSG_ConversationID"=a.conversation_id and "AIMSG_Role"='assistant' and "AIMSG_ContentJSON"->'metadata'->>'taskRunId'=p_run::text;
  if msg is null then raise exception 'The task result has not been saved.' using errcode='55000';end if;
 end if;
 if v_status='scheduled' then run_at:=(p_result->>'run_at')::timestamptz;if run_at<=now() or run_at is null then raise exception 'Choose a future time.' using errcode='22023';end if;end if;
 if v_status='waiting' then
  watch:=(p_result->>'watch_id')::uuid;
  if not exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_ID"=watch and "AIDexterWatch_OwnerUserID"=a.owner_id and "AIDexterWatch_CompanyID"=a.company_id and "AIDexterWatch_ActionJSON" is null) then raise exception 'The task watch is unavailable.' using errcode='42501';end if;
 end if;
 update public."AI_DexterTaskRuns" set state=case when v_status='failed' then 'failed' else 'succeeded' end,result=p_result,finished_at=now(),lease_until=null,lease_token=null where id=p_run;
 update public."AI_DexterTaskAssignments" set status=v_status,summary=left(coalesce(p_result->>'summary','Your task has an update'),500),outcome=p_result->>'outcome',
 name=case when p_result->>'name' ~ '^[A-Za-z]{2,24}$' then p_result->>'name' else name end,
 watch_id=watch,message_id=msg,result_revision=result_revision+case when v_status in ('ready','needs_input','failed') then 1 else 0 end,version=version+1,updated_at=now() where id=a.id;
 if v_status='scheduled' then insert into public."AI_DexterTaskRuns"(assignment_id,input,phase,due_at) values(a.id,r.input,'execute',run_at);end if;
 if v_status='waiting' and exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"=watch) then
  insert into public."AI_DexterTaskRuns"(assignment_id,input,phase) values(a.id,r.input,'execute') on conflict do nothing;
  update public."AI_DexterTaskAssignments" set status='queued',summary='The event arrived. Queued for Dexter' where id=a.id;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watch;
 end if;
 if v_status in ('ready','needs_input','failed') then
  insert into public."Comm_Notifications"("CommNotif_UserID","CommNotif_Title","CommNotif_Body","CommNotif_TargetTable","CommNotif_TargetID","CommNotif_LinkTypeCode","CommNotif_MetadataJSON","CommNotif_CreatedBy")
  values(a.owner_id,case when v_status='ready' then 'Your task is ready to review' else 'Your task needs attention' end,left(coalesce(p_result->>'summary','Open the task to continue.'),500),'AI_DexterTaskAssignments',a.id,'dexter_watch',jsonb_build_object('action_url','/agent-dexter?conversation='||a.conversation_id,'task_run_id',p_run),a.owner_id);
 end if;
 perform public._dexter_task_kick();
 return true;
end $$;
revoke all on function public.multideck_task_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_task_finish(uuid,uuid,jsonb) to service_role;

create function public._dexter_task_changed() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new."TodoTask_StatusCode"='completed' or new."TodoTask_IsDeleted" then
  update public."AI_DexterTaskRuns" set state='cancelled',lease_token=null,lease_until=null where assignment_id in(select id from public."AI_DexterTaskAssignments" where task_id=new."TodoTask_ID") and state in ('queued','running');
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID" in(select watch_id from public."AI_DexterTaskAssignments" where task_id=new."TodoTask_ID");
  update public."AI_DexterTaskAssignments" set status=case when new."TodoTask_IsDeleted" then 'cancelled' else 'completed' end,version=version+1 where task_id=new."TodoTask_ID";
 end if;
 return new;
end $$;
revoke all on function public._dexter_task_changed() from public,anon,authenticated;
create trigger dexter_task_completed after update of "TodoTask_StatusCode","TodoTask_IsDeleted" on public."OPS_UserTasks" for each row execute function public._dexter_task_changed();

create function public._dexter_task_watch_fired() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments";
begin
 select * into a from public."AI_DexterTaskAssignments" where watch_id=new."AIDexterWatchEvent_WatchID" and owner_id=new."AIDexterWatchEvent_OwnerUserID" and status='waiting' for update;
 if found then
  insert into public."AI_DexterTaskRuns"(assignment_id,input,phase) values(a.id,a.instruction,'execute') on conflict do nothing;
  update public."AI_DexterTaskAssignments" set status='queued',summary='The event arrived. Queued for Dexter',version=version+1,updated_at=now() where id=a.id;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=a.watch_id;
  perform public._dexter_task_kick();
 end if;
 return new;
end $$;
revoke all on function public._dexter_task_watch_fired() from public,anon,authenticated;
create trigger dexter_task_watch_fired after insert on public."AI_DexterWatchEvents" for each row execute function public._dexter_task_watch_fired();

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public."AI_DexterTaskAssignments";end if;
end $$;

create function public.multideck_task_workspace() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public._multideck_dexter_context();
 return jsonb_build_object('enabled',coalesce((select enabled from public."AI_DexterTaskSettings"),false),'assignments',public.multideck_task_assignments());
end $$;
revoke all on function public.multideck_task_workspace() from public,anon;
grant execute on function public.multideck_task_workspace() to authenticated;

create function public.multideck_task_worker_name(p_run uuid,p_token uuid,p_name text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments";
begin
 a:=public._dexter_task_lease(p_run,p_token);
 if p_name !~ '^[A-Za-z]{2,24}$' then raise exception 'Invalid agent name.' using errcode='22023';end if;
 update public."AI_DexterTaskAssignments" set name=p_name where id=a.id and name='Dexter';
end $$;
revoke all on function public.multideck_task_worker_name(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_task_worker_name(uuid,uuid,text) to service_role;

create function public.multideck_task_worker_secret() returns text language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only.' using errcode='42501';end if;
 return (select decrypted_secret from vault.decrypted_secrets where name='multideck_task_worker_secret' limit 1);
end $$;
revoke all on function public.multideck_task_worker_secret() from public,anon,authenticated;
grant execute on function public.multideck_task_worker_secret() to service_role;

create function public._dexter_task_kick() returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare endpoint text; secret text;
begin
 select s.endpoint into endpoint from public."AI_DexterTaskSettings" s where s.enabled;
 if endpoint is null then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='multideck_task_worker_secret' limit 1;
 if secret is null then return;end if;
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-multideck-task-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=5000);
end $$;
revoke all on function public._dexter_task_kick() from public,anon,authenticated;
grant execute on function public._dexter_task_kick() to service_role;

create function public.multideck_task_configure(p_endpoint text,p_enabled boolean default true) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker only.' using errcode='42501';end if;
 if p_endpoint !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/dexter-task-worker$' then raise exception 'Use the tenant Supabase worker URL.' using errcode='22023';end if;
 if not exists(select 1 from vault.decrypted_secrets where name='multideck_task_worker_secret') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'multideck_task_worker_secret');
 end if;
 update public."AI_DexterTaskSettings" set endpoint=p_endpoint,enabled=p_enabled;
 if p_enabled then perform cron.schedule('multideck-dexter-tasks','* * * * *','select public._dexter_task_kick()');
 elsif exists(select 1 from cron.job where jobname='multideck-dexter-tasks') then perform cron.unschedule('multideck-dexter-tasks');end if;
 return p_enabled;
end $$;
revoke all on function public.multideck_task_configure(text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_task_configure(text,boolean) to service_role;

-- Completion is based on the saved proposal set and confirmed provider results.
-- Client draft edits and the model's prose never constitute completion evidence.
create function public._dexter_task_action_completed() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public."AI_DexterTaskAssignments"; metadata jsonb; ids jsonb;
begin
 if new."AIDexterPrepared_Status"<>'succeeded' then return new;end if;
 select * into a from public."AI_DexterTaskAssignments" where conversation_id=new."AIDexterPrepared_ConversationID" and owner_id=new."AIDexterPrepared_UserID" and company_id=new."AIDexterPrepared_CompanyID" and status='ready' for update;
 if not found then return new;end if;
 select "AIMSG_ContentJSON"->'metadata' into metadata from public."AI_Messages" where "AIMSG_ID"=a.message_id;
 if a.outcome='send_email' then
  if new."AIDexterPrepared_ActionCode"<>'send_email' or new."AIDexterPrepared_ResultJSON"->'emailDraft'->'delivery'->>'status' is distinct from 'sent'
   or metadata->'emailDraft'->>'id' is null or new."AIDexterPrepared_ArgumentsJSON"->'draft'->>'id' is distinct from metadata->'emailDraft'->>'id' then return new;end if;
 elsif a.outcome='apply_changes' then
  ids:=metadata->'pendingActions';
  if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)=0 then return new;end if;
  if exists(select 1 from jsonb_array_elements(ids) item left join public."AI_DexterPreparedActions" p on p."AIDexterPrepared_ID"::text=item->>'id' and p."AIDexterPrepared_UserID"=a.owner_id and p."AIDexterPrepared_CompanyID"=a.company_id and p."AIDexterPrepared_ConversationID"=a.conversation_id where p."AIDexterPrepared_Status" is distinct from 'succeeded') then return new;end if;
 else return new;end if;
 perform public._multideck_todo_update_for_actor(a.company_id,a.owner_id,a.task_id,'{"status":"completed"}');
 update public."AI_DexterTaskAssignments" set summary=case when a.outcome='send_email' then 'The mail provider confirmed the reply was sent' else 'All prepared changes were saved' end,viewed_revision=result_revision,updated_at=now() where id=a.id;
 return new;
end $$;
revoke all on function public._dexter_task_action_completed() from public,anon,authenticated;
create trigger dexter_task_action_completed after update of "AIDexterPrepared_Status" on public."AI_DexterPreparedActions" for each row execute function public._dexter_task_action_completed();

-- Extend the existing owner-scoped task adapter, retaining all its source data.
create or replace function public.multideck_dexter_domain_todo(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb; v_search text := nullif(btrim(p_search),'');
begin
  select * into v_context from public._multideck_dexter_context();
  if v_context.company_id <> p_company_id then
    raise exception 'Those tasks is outside this workspace.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordId', task."TodoTask_ID",
    'title', task."TodoTask_Title",
    'scheduledDate', task."TodoTask_ScheduledDate",
    'priority', task."TodoTask_PriorityCode",
    'status', task."TodoTask_StatusCode",
    'completedAt', task."TodoTask_CompletedAt",
    'links', task."TodoTask_LinksJSON",
    'tags', task."TodoTask_TagsJSON",
    'agent', (select jsonb_build_object('id',a.id,'name',a.name,'status',a.status,'summary',a.summary,'conversationId',a.conversation_id,'route','/agent-dexter?conversation='||a.conversation_id) from public."AI_DexterTaskAssignments" a where a.task_id=task."TodoTask_ID" and a.owner_id=v_context.user_id and a.company_id=p_company_id),
    'route', '/to-do?date=' || task."TodoTask_ScheduledDate"::text
  ) order by task."TodoTask_ScheduledDate", task."TodoTask_CreatedAt"), '[]'::jsonb)
  into v_result
  from (
    select * from public."OPS_UserTasks" task
    where task."TodoTask_CompanyID" = p_company_id
      and task."TodoTask_OwnerUserID" = v_context.user_id
      and not task."TodoTask_IsDeleted"
      and (
        v_search is null
        or task."TodoTask_Title" ilike '%' || v_search || '%'
        or task."TodoTask_ScheduledDate"::text = v_search
        or coalesce(task."TodoTask_PriorityCode",'') ilike '%' || v_search || '%'
        or task."TodoTask_TagsJSON"::text ilike '%' || v_search || '%'
      )
    order by task."TodoTask_ScheduledDate", task."TodoTask_CreatedAt"
    limit greatest(1,least(coalesce(p_take,10),25))
  ) task;
  return v_result;
end;
$$;


update public."sys_AIDexterDataDomains" set "AIDexterDomain_Name"='Tasks',"AIDexterDomain_Description"='Your personal tasks, dates, status and delegated Dexter agent progress.' where "AIDexterDomain_Code"='todo';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Name"='Tasks',"AIDexterWatchCapability_Description"='Changes to a selected owned task, including its agent status.',"AIDexterWatchCapability_FieldsJSON"='["title","scheduledDate","priority","status","tags","agentStatus","agentName"]'::jsonb where "AIDexterWatchCapability_Code"='todo';
create function public._dexter_task_signal() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.status is not distinct from new.status and old.name is not distinct from new.name then return new;end if;
 if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='todo' and "AIDexterWatch_TargetID"=new.task_id and "AIDexterWatch_OwnerUserID"=new.owner_id and "AIDexterWatch_StatusCode"='active') then
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON") values(new.company_id,'todo','OPS_UserTasks',new.task_id,jsonb_build_object('agentStatus',old.status,'agentName',old.name,'ownerUserId',new.owner_id),jsonb_build_object('agentStatus',new.status,'agentName',new.name,'ownerUserId',new.owner_id));
 end if;
 return new;
end $$;
revoke all on function public._dexter_task_signal() from public,anon,authenticated;
create trigger dexter_task_signal after update of status,name on public."AI_DexterTaskAssignments" for each row execute function public._dexter_task_signal();

commit;
