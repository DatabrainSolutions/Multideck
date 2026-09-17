-- Complete successful deliverables independently of reading the response.
create or replace function public.multideck_task_finish(p_run uuid,p_token uuid,p_result jsonb) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
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
 -- A saved, successful deliverable completes the list item immediately.
 -- Keep its response ready and unread until the owner opens it.
 if v_status='ready' and p_result->>'outcome'='deliver_result' then
  perform public._multideck_todo_update_for_actor(a.company_id,a.owner_id,a.task_id,'{"status":"completed"}');
  update public."AI_DexterTaskAssignments" set status='ready' where id=a.id;
 end if;
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
