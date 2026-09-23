-- To Do handoff opens an ordinary owner-private Dexter conversation.
-- Retain old conversations and results, but stop the retired background queue.
begin;

alter table public."OPS_UserTasks"
  add column "TodoTask_DexterConversationID" uuid
  references public."AI_Conversations"("AICNV_ID") on delete set null;

update public."OPS_UserTasks" task
set "TodoTask_DexterConversationID" = assignment.conversation_id
from public."AI_DexterTaskAssignments" assignment
where assignment.task_id = task."TodoTask_ID"
  and assignment.owner_id = task."TodoTask_OwnerUserID"
  and assignment.company_id = task."TodoTask_CompanyID";

create or replace function public._multideck_todo_task_json(p_task public."OPS_UserTasks")
returns jsonb language sql stable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'id', p_task."TodoTask_ID",
    'title', p_task."TodoTask_Title",
    'scheduledDate', p_task."TodoTask_ScheduledDate",
    'priority', p_task."TodoTask_PriorityCode",
    'status', p_task."TodoTask_StatusCode",
    'completedAt', p_task."TodoTask_CompletedAt",
    'links', p_task."TodoTask_LinksJSON",
    'tags', p_task."TodoTask_TagsJSON",
    'source', p_task."TodoTask_SourceCode",
    'sourceDexterMessageId', p_task."TodoTask_SourceDexterMessageID",
    'dexterConversationId', p_task."TodoTask_DexterConversationID",
    'editVersion', p_task."TodoTask_EditVersion",
    'createdAt', p_task."TodoTask_CreatedAt",
    'updatedAt', p_task."TodoTask_UpdatedAt"
  );
$$;

create function public.multideck_todo_open_dexter_chat(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  actor record;
  task public."OPS_UserTasks";
  conversation_id uuid := gen_random_uuid();
begin
  select * into actor from public._multideck_dexter_context();
  select * into task from public."OPS_UserTasks"
  where "TodoTask_ID" = p_task_id
    and "TodoTask_OwnerUserID" = actor.user_id
    and "TodoTask_CompanyID" = actor.company_id
    and not "TodoTask_IsDeleted"
  for update;
  if not found or task."TodoTask_StatusCode" <> 'open' then
    raise exception 'Choose one of your open tasks.' using errcode = '42501';
  end if;

  if task."TodoTask_DexterConversationID" is not null and exists (
    select 1 from public."AI_Conversations" conversation
    where conversation."AICNV_ID" = task."TodoTask_DexterConversationID"
      and conversation."AICNV_CompanyID" = actor.company_id
      and conversation."AICNV_OwnerUserID" = actor.user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
  ) then
    return jsonb_build_object('conversationId', task."TodoTask_DexterConversationID", 'isNew', false);
  end if;

  insert into public."AI_Conversations" (
    "AICNV_ID", "AICNV_Title", "AICNV_Channel", "AICNV_DomainCode",
    "AICNV_CompanyID", "AICNV_OwnerUserID", "AICNV_Status", "AICNV_SecurityClass",
    "AICNV_IsTrainingAllowed", "AICNV_MetadataJSON", "AICNV_StartedAt",
    "AICNV_CreatedAt", "AICNV_CreatedBy", "AICNV_UpdatedAt", "AICNV_UpdatedBy"
  ) values (
    conversation_id, task."TodoTask_Title", 'chat', 'multideck',
    actor.company_id, actor.user_id, 'open', 'internal', false,
    jsonb_build_object('agent', 'dexter', 'todoTaskId', task."TodoTask_ID"),
    now(), now(), actor.user_id, now(), actor.user_id
  );
  update public."OPS_UserTasks"
  set "TodoTask_DexterConversationID" = conversation_id
  where "TodoTask_ID" = p_task_id;
  return jsonb_build_object('conversationId', conversation_id, 'isNew', true);
end $$;

revoke all on function public.multideck_todo_open_dexter_chat(uuid) from public, anon;
grant execute on function public.multideck_todo_open_dexter_chat(uuid) to authenticated;
revoke execute on function public.multideck_task_handoff(uuid,text,text) from authenticated;
revoke execute on function public.multideck_task_control(uuid,text,integer,text,integer,timestamptz) from authenticated;

update public."AI_DexterTaskSettings" set enabled = false;
update public."AI_DexterTaskRuns" set state = 'cancelled', lease_token = null, lease_until = null
where state in ('queued', 'running');
update public."AI_DexterWatches" set "AIDexterWatch_StatusCode" = 'paused'
where "AIDexterWatch_ID" in (
  select watch_id from public."AI_DexterTaskAssignments" where watch_id is not null
);
update public."AI_DexterTaskAssignments"
set status = 'cancelled', summary = 'Continue in the Dexter conversation',
    version = version + 1, updated_at = now()
where status in ('queued', 'scheduled', 'waiting', 'working');
do $$ declare scheduled boolean; begin
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname = $1)'
      into scheduled using 'multideck-dexter-tasks';
    if scheduled then
      execute 'select cron.unschedule($1)' using 'multideck-dexter-tasks';
    end if;
  end if;
end $$;

commit;
