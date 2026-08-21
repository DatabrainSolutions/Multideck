-- To Do is intentionally a quick list. Remove the detail-only description
-- field from browser, Dexter and watch contracts, then remove the unused data
-- column. Existing title, date, priority, links and tags remain unchanged.

begin;
set local lock_timeout = '5s';

create or replace function public._multideck_todo_task_json(p_task public."OPS_UserTasks")
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
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
    'editVersion', p_task."TodoTask_EditVersion",
    'createdAt', p_task."TodoTask_CreatedAt",
    'updatedAt', p_task."TodoTask_UpdatedAt"
  );
$$;

drop function public._multideck_todo_create_for_actor(uuid,uuid,text,text,date,text,jsonb,jsonb,text,uuid);

create function public._multideck_todo_create_for_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_title text,
  p_scheduled_date date,
  p_priority text,
  p_links jsonb,
  p_tags jsonb,
  p_source_code text,
  p_source_message_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_task public."OPS_UserTasks";
  v_title text := left(btrim(coalesce(p_title,'')), 240);
  v_priority text := nullif(lower(btrim(coalesce(p_priority,''))), '');
  v_source text := lower(btrim(coalesce(p_source_code,'manual')));
begin
  perform public._multideck_todo_assert_actor(p_company_id, p_user_id);
  if v_title = '' then raise exception 'Give the task a title.' using errcode = '22023'; end if;
  if v_priority is not null and v_priority not in ('low','medium','high','urgent') then
    raise exception 'Choose low, medium, high, urgent, or no priority.' using errcode = '22023';
  end if;
  if v_source not in ('manual','dexter_context','dexter_action') then v_source := 'manual'; end if;

  if p_source_message_id is not null then
    select * into v_task from public."OPS_UserTasks" task
    where task."TodoTask_OwnerUserID" = p_user_id
      and task."TodoTask_SourceDexterMessageID" = p_source_message_id
      and not task."TodoTask_IsDeleted"
    limit 1;
    if found then return public._multideck_todo_task_json(v_task); end if;
  end if;

  begin
    insert into public."OPS_UserTasks" (
      "TodoTask_CompanyID", "TodoTask_OwnerUserID", "TodoTask_Title",
      "TodoTask_ScheduledDate", "TodoTask_PriorityCode", "TodoTask_LinksJSON", "TodoTask_TagsJSON",
      "TodoTask_SourceCode", "TodoTask_SourceDexterMessageID", "TodoTask_CreatedBy", "TodoTask_UpdatedBy"
    ) values (
      p_company_id, p_user_id, v_title, coalesce(p_scheduled_date,current_date), v_priority,
      public._multideck_todo_clean_references(coalesce(p_links,'[]'::jsonb),'link'),
      public._multideck_todo_clean_references(coalesce(p_tags,'[]'::jsonb),'tag'),
      v_source, p_source_message_id, p_user_id, p_user_id
    ) returning * into v_task;
  exception when unique_violation then
    select * into v_task from public."OPS_UserTasks" task
    where task."TodoTask_OwnerUserID" = p_user_id
      and task."TodoTask_SourceDexterMessageID" = p_source_message_id
      and not task."TodoTask_IsDeleted"
    limit 1;
    if not found then raise; end if;
  end;
  return public._multideck_todo_task_json(v_task);
end;
$$;

revoke all on function public._multideck_todo_create_for_actor(uuid,uuid,text,date,text,jsonb,jsonb,text,uuid) from public, anon, authenticated;

create or replace function public._multideck_todo_update_for_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_task public."OPS_UserTasks";
  v_title text;
  v_date date;
  v_priority text;
  v_status text;
  v_links jsonb;
  v_tags jsonb;
begin
  perform public._multideck_todo_assert_actor(p_company_id, p_user_id);
  if jsonb_typeof(coalesce(p_patch,'null'::jsonb)) <> 'object' then
    raise exception 'The task changes are invalid.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) key
    where key not in ('title','scheduledDate','priority','status','links','tags')
  ) then
    raise exception 'That task field cannot be changed.' using errcode = '22023';
  end if;

  select * into v_task from public."OPS_UserTasks" task
  where task."TodoTask_ID" = p_task_id
    and task."TodoTask_CompanyID" = p_company_id
    and task."TodoTask_OwnerUserID" = p_user_id
    and not task."TodoTask_IsDeleted"
  for update;
  if not found then raise exception 'Task not found.' using errcode = 'P0002'; end if;

  v_title := v_task."TodoTask_Title";
  v_date := v_task."TodoTask_ScheduledDate";
  v_priority := v_task."TodoTask_PriorityCode";
  v_status := v_task."TodoTask_StatusCode";
  v_links := v_task."TodoTask_LinksJSON";
  v_tags := v_task."TodoTask_TagsJSON";

  if p_patch ? 'title' then
    v_title := left(btrim(coalesce(p_patch->>'title','')),240);
    if v_title = '' then raise exception 'Give the task a title.' using errcode = '22023'; end if;
  end if;
  if p_patch ? 'scheduledDate' then
    begin
      v_date := (p_patch->>'scheduledDate')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Choose a valid task date.' using errcode = '22023';
    end;
    if v_date is null then raise exception 'Choose a valid task date.' using errcode = '22023'; end if;
  end if;
  if p_patch ? 'priority' then
    v_priority := nullif(lower(btrim(coalesce(p_patch->>'priority',''))),'');
    if v_priority is not null and v_priority not in ('low','medium','high','urgent') then
      raise exception 'Choose low, medium, high, urgent, or no priority.' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'status' then
    v_status := lower(btrim(coalesce(p_patch->>'status','')));
    if v_status not in ('open','completed') then
      raise exception 'Choose open or completed.' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'links' then v_links := public._multideck_todo_clean_references(p_patch->'links','link'); end if;
  if p_patch ? 'tags' then v_tags := public._multideck_todo_clean_references(p_patch->'tags','tag'); end if;

  update public."OPS_UserTasks" set
    "TodoTask_Title" = v_title,
    "TodoTask_ScheduledDate" = v_date,
    "TodoTask_PriorityCode" = v_priority,
    "TodoTask_StatusCode" = v_status,
    "TodoTask_CompletedAt" = case
      when v_status = 'completed' then coalesce("TodoTask_CompletedAt",now())
      else null
    end,
    "TodoTask_LinksJSON" = v_links,
    "TodoTask_TagsJSON" = v_tags,
    "TodoTask_EditVersion" = "TodoTask_EditVersion" + 1,
    "TodoTask_UpdatedBy" = p_user_id,
    "TodoTask_UpdatedAt" = now()
  where "TodoTask_ID" = p_task_id
  returning * into v_task;
  return public._multideck_todo_task_json(v_task);
end;
$$;

drop function public.multideck_todo_create(text,text,date,text,jsonb,jsonb,text,uuid);

create function public.multideck_todo_create(
  p_title text,
  p_scheduled_date date default null,
  p_priority text default null,
  p_links jsonb default '[]'::jsonb,
  p_tags jsonb default '[]'::jsonb,
  p_source_code text default 'manual',
  p_source_message_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_dexter_context();
  return public._multideck_todo_create_for_actor(
    v_context.company_id,v_context.user_id,p_title,p_scheduled_date,p_priority,
    p_links,p_tags,p_source_code,p_source_message_id
  );
end;
$$;

revoke all on function public.multideck_todo_create(text,date,text,jsonb,jsonb,text,uuid) from public, anon;
grant execute on function public.multideck_todo_create(text,date,text,jsonb,jsonb,text,uuid) to authenticated;

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
    raise exception 'That To Do list is outside this workspace.' using errcode = '42501';
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

create or replace function public.multideck_dexter_action_create_todo_task(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_date date;
begin
  begin
    v_date := nullif(p_arguments->>'scheduled_date','')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Choose a valid task date.' using errcode = '22023';
  end;
  return public._multideck_todo_create_for_actor(
    p_company_id,p_user_id,p_arguments->>'title',v_date,
    p_arguments->>'priority',coalesce(p_arguments->'links','[]'::jsonb),
    coalesce(p_arguments->'tags','[]'::jsonb),'dexter_action',null
  );
end;
$$;

create or replace function public.multideck_dexter_action_update_todo_task(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_patch jsonb;
begin
  v_patch := jsonb_strip_nulls(jsonb_build_object(
    'title',p_arguments->'title',
    'scheduledDate',p_arguments->'scheduled_date',
    'priority',p_arguments->'priority',
    'status',p_arguments->'status',
    'links',p_arguments->'links',
    'tags',p_arguments->'tags'
  ));
  return public._multideck_todo_update_for_actor(
    p_company_id,p_user_id,(p_arguments->>'target_id')::uuid,v_patch
  );
end;
$$;

create or replace function public._multideck_todo_watch_signal()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  if not exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = new."TodoTask_CompanyID"
      and watch."AIDexterWatch_OwnerUserID" = new."TodoTask_OwnerUserID"
      and watch."AIDexterWatch_CapabilityCode" = 'todo'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_TargetID" = new."TodoTask_ID"
  ) then return new; end if;

  if tg_op = 'UPDATE' then
    v_old := jsonb_build_object(
      'title',old."TodoTask_Title",
      'scheduledDate',old."TodoTask_ScheduledDate",
      'priority',old."TodoTask_PriorityCode",
      'status',case when old."TodoTask_IsDeleted" then 'deleted' else old."TodoTask_StatusCode" end,
      'tags',old."TodoTask_TagsJSON"::text,
      'ownerUserId',old."TodoTask_OwnerUserID"
    );
  end if;
  v_new := jsonb_build_object(
    'title',new."TodoTask_Title",
    'scheduledDate',new."TodoTask_ScheduledDate",
    'priority',new."TodoTask_PriorityCode",
    'status',case when new."TodoTask_IsDeleted" then 'deleted' else new."TodoTask_StatusCode" end,
    'tags',new."TodoTask_TagsJSON"::text,
    'ownerUserId',new."TodoTask_OwnerUserID"
  );
  if v_old is not distinct from v_new then return new; end if;

  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
    "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
  ) values (
    new."TodoTask_CompanyID",'todo','OPS_UserTasks',new."TodoTask_ID",v_old,v_new
  );
  return new;
end;
$$;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'The signed-in operator''s personal scheduled tasks, priorities, links, tags, and completion state.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'todo';

update public."sys_AIDexterActions"
set "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"title":{"type":"string"},"scheduled_date":{"type":["string","null"],"description":"YYYY-MM-DD; null means today."},"priority":{"type":["string","null"],"enum":["low","medium","high","urgent",null]},"links":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false}},"tags":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"href":{"type":["string","null"]}},"required":["label","href"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["title","scheduled_date","priority","links","tags","reason"],"additionalProperties":false}'::jsonb,
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_todo_task';

update public."sys_AIDexterActions"
set "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"target_id":{"type":"string"},"title":{"type":["string","null"]},"scheduled_date":{"type":["string","null"]},"priority":{"type":["string","null"],"enum":["low","medium","high","urgent",null]},"status":{"type":["string","null"],"enum":["open","completed",null]},"links":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false}},"tags":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"href":{"type":["string","null"]}},"required":["label","href"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","title","scheduled_date","priority","status","links","tags","reason"],"additionalProperties":false}'::jsonb,
    "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_todo_task';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_FieldsJSON" = '["title","scheduledDate","priority","status","tags"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'todo';

alter table public."OPS_UserTasks" drop column "TodoTask_Description";

commit;
