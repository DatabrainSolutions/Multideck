-- Personal To Do lists with first-class Dexter read, write, and watch parity.
--
-- Tasks belong to one operator inside one physical tenant project. Browser CRUD
-- uses owner-scoped RPCs; Dexter uses the same validation helpers through its
-- opaque prepared-action boundary. Watching for you reacts to row events and is
-- restricted to an exact task owned by the watch creator.

begin;

create table if not exists public."OPS_UserTasks" (
  "TodoTask_ID" uuid primary key default gen_random_uuid(),
  "TodoTask_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "TodoTask_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "TodoTask_Title" varchar(240) not null,
  "TodoTask_ScheduledDate" date not null,
  "TodoTask_PriorityCode" varchar(12),
  "TodoTask_StatusCode" varchar(16) not null default 'open',
  "TodoTask_CompletedAt" timestamptz,
  "TodoTask_LinksJSON" jsonb not null default '[]'::jsonb,
  "TodoTask_TagsJSON" jsonb not null default '[]'::jsonb,
  "TodoTask_SourceCode" varchar(24) not null default 'manual',
  "TodoTask_SourceDexterMessageID" uuid,
  "TodoTask_EditVersion" integer not null default 1,
  "TodoTask_CreatedBy" uuid not null references public."cmp_Users"("User_ID"),
  "TodoTask_UpdatedBy" uuid not null references public."cmp_Users"("User_ID"),
  "TodoTask_CreatedAt" timestamptz not null default now(),
  "TodoTask_UpdatedAt" timestamptz not null default now(),
  "TodoTask_IsDeleted" boolean not null default false,
  constraint "CK_OPS_UserTasks_title" check (btrim("TodoTask_Title") <> ''),
  constraint "CK_OPS_UserTasks_priority" check (
    "TodoTask_PriorityCode" is null or "TodoTask_PriorityCode" in ('low','medium','high','urgent')
  ),
  constraint "CK_OPS_UserTasks_status" check ("TodoTask_StatusCode" in ('open','completed')),
  constraint "CK_OPS_UserTasks_links_array" check (jsonb_typeof("TodoTask_LinksJSON") = 'array'),
  constraint "CK_OPS_UserTasks_tags_array" check (jsonb_typeof("TodoTask_TagsJSON") = 'array'),
  constraint "CK_OPS_UserTasks_source" check (
    "TodoTask_SourceCode" in ('manual','dexter_context','dexter_action')
  ),
  constraint "CK_OPS_UserTasks_completion" check (
    ("TodoTask_StatusCode" = 'completed' and "TodoTask_CompletedAt" is not null)
    or ("TodoTask_StatusCode" = 'open' and "TodoTask_CompletedAt" is null)
  )
);

create index if not exists "IX_OPS_UserTasks_owner_date_status"
  on public."OPS_UserTasks" (
    "TodoTask_OwnerUserID", "TodoTask_ScheduledDate", "TodoTask_StatusCode", "TodoTask_CreatedAt"
  ) where not "TodoTask_IsDeleted";

create unique index if not exists "UX_OPS_UserTasks_owner_dexter_message"
  on public."OPS_UserTasks" ("TodoTask_OwnerUserID", "TodoTask_SourceDexterMessageID")
  where "TodoTask_SourceDexterMessageID" is not null and not "TodoTask_IsDeleted";

alter table public."OPS_UserTasks" enable row level security;
revoke all on table public."OPS_UserTasks" from public, anon, authenticated;

create or replace function public._multideck_todo_clean_references(
  p_value jsonb,
  p_kind text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_label text;
  v_target text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return v_result;
  end if;
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 20 then
    raise exception 'Add no more than 20 task references.' using errcode = '22023';
  end if;
  if p_kind not in ('link','tag') then
    raise exception 'That task reference type is not supported.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each task reference needs a label.' using errcode = '22023';
    end if;
    v_label := left(btrim(coalesce(v_item->>'label','')), 120);
    v_target := left(btrim(coalesce(v_item->>case when p_kind = 'link' then 'url' else 'href' end,'')), 2000);
    if v_label = '' then
      raise exception 'Each task reference needs a label.' using errcode = '22023';
    end if;
    if p_kind = 'link' and v_target = '' then
      raise exception 'Each task link needs a destination.' using errcode = '22023';
    end if;
    if v_target <> '' and v_target !~* '^(https?://|mailto:|/)' then
      raise exception 'Task links must use HTTPS, HTTP, mailto, or a Multideck route.' using errcode = '22023';
    end if;
    if p_kind = 'link' then
      v_result := v_result || jsonb_build_array(jsonb_build_object('label',v_label,'url',v_target));
    else
      v_result := v_result || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object('label',v_label,'href',nullif(v_target,'')))
      );
    end if;
  end loop;
  return v_result;
end;
$$;

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

create or replace function public._multideck_todo_assert_actor(p_company_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public."cmp_Users" profile
    where profile."User_ID" = p_user_id
      and profile."Company_ID" = p_company_id
      and coalesce(profile."User_AccessStatus", 'active') = 'active'
  ) then
    raise exception 'Your Multideck account is no longer available.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._multideck_todo_create_for_actor(
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

create or replace function public._multideck_todo_delete_for_actor(
  p_company_id uuid,
  p_user_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare v_task public."OPS_UserTasks";
begin
  perform public._multideck_todo_assert_actor(p_company_id, p_user_id);
  update public."OPS_UserTasks" set
    "TodoTask_IsDeleted" = true,
    "TodoTask_EditVersion" = "TodoTask_EditVersion" + 1,
    "TodoTask_UpdatedBy" = p_user_id,
    "TodoTask_UpdatedAt" = now()
  where "TodoTask_ID" = p_task_id
    and "TodoTask_CompanyID" = p_company_id
    and "TodoTask_OwnerUserID" = p_user_id
    and not "TodoTask_IsDeleted"
  returning * into v_task;
  if not found then raise exception 'Task not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id',v_task."TodoTask_ID",'deleted',true);
end;
$$;

create or replace function public.multideck_todo_list(p_scheduled_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(public._multideck_todo_task_json(task)
    order by case task."TodoTask_StatusCode" when 'open' then 0 else 1 end,
      task."TodoTask_CreatedAt"), '[]'::jsonb)
  into v_result
  from public."OPS_UserTasks" task
  where task."TodoTask_CompanyID" = v_context.company_id
    and task."TodoTask_OwnerUserID" = v_context.user_id
    and task."TodoTask_ScheduledDate" = coalesce(p_scheduled_date,current_date)
    and not task."TodoTask_IsDeleted";
  return v_result;
end;
$$;

create or replace function public.multideck_todo_create(
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

create or replace function public.multideck_todo_update(p_task_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_dexter_context();
  return public._multideck_todo_update_for_actor(v_context.company_id,v_context.user_id,p_task_id,p_patch);
end;
$$;

create or replace function public.multideck_todo_delete(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_context record;
begin
  select * into v_context from public._multideck_dexter_context();
  return public._multideck_todo_delete_for_actor(v_context.company_id,v_context.user_id,p_task_id);
end;
$$;

revoke all on function public._multideck_todo_clean_references(jsonb,text) from public, anon, authenticated;
revoke all on function public._multideck_todo_task_json(public."OPS_UserTasks") from public, anon, authenticated;
revoke all on function public._multideck_todo_assert_actor(uuid,uuid) from public, anon, authenticated;
revoke all on function public._multideck_todo_create_for_actor(uuid,uuid,text,date,text,jsonb,jsonb,text,uuid) from public, anon, authenticated;
revoke all on function public._multideck_todo_update_for_actor(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public._multideck_todo_delete_for_actor(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.multideck_todo_list(date) from public, anon;
revoke all on function public.multideck_todo_create(text,date,text,jsonb,jsonb,text,uuid) from public, anon;
revoke all on function public.multideck_todo_update(uuid,jsonb) from public, anon;
revoke all on function public.multideck_todo_delete(uuid) from public, anon;
grant execute on function public.multideck_todo_list(date) to authenticated;
grant execute on function public.multideck_todo_create(text,date,text,jsonb,jsonb,text,uuid) to authenticated;
grant execute on function public.multideck_todo_update(uuid,jsonb) to authenticated;
grant execute on function public.multideck_todo_delete(uuid) to authenticated;

-- Dexter read domain: company-scoped by the registry and owner-scoped again by
-- the authenticated operator context.
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

create or replace function public.multideck_dexter_action_complete_todo_task(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public._multideck_todo_update_for_actor(
    p_company_id,p_user_id,(p_arguments->>'target_id')::uuid,
    jsonb_build_object('status',case when coalesce((p_arguments->>'completed')::boolean,true) then 'completed' else 'open' end)
  );
$$;

create or replace function public.multideck_dexter_action_delete_todo_task(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public._multideck_todo_delete_for_actor(
    p_company_id,p_user_id,(p_arguments->>'target_id')::uuid
  );
$$;

revoke all on function public.multideck_dexter_domain_todo(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_create_todo_task(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_todo_task(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_complete_todo_task(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_delete_todo_task(uuid,uuid,jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt", "AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON", "AIDexterDomain_ScopeStrategy"
) values (
  'todo','To Do list',
  'The signed-in operator''s personal scheduled tasks, priorities, links, tags, and completion state.',
  'multideck_dexter_domain_todo',8,true,now(),'[]'::jsonb,
  '["personal_productivity","business_record_references"]'::jsonb,'owner'
)
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = true,
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON" = excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy" = excluded."AIDexterDomain_ScopeStrategy",
  "AIDexterDomain_UpdatedAt" = now();

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code", "AIDexterAction_DomainCode", "AIDexterAction_Name",
  "AIDexterAction_Description", "AIDexterAction_Function", "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder", "AIDexterAction_IsActive", "AIDexterAction_UpdatedAt",
  "AIDexterAction_RequiredPermissionsJSON", "AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy", "AIDexterAction_HasExternalEffect"
) values
(
  'create_todo_task','todo','Add To Do task',
  'Add a task to the signed-in operator''s personal To Do list.',
  'multideck_dexter_action_create_todo_task',
  '{"type":"object","properties":{"title":{"type":"string"},"scheduled_date":{"type":["string","null"],"description":"YYYY-MM-DD; null means today."},"priority":{"type":["string","null"],"enum":["low","medium","high","urgent",null]},"links":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false}},"tags":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"href":{"type":["string","null"]}},"required":["label","href"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["title","scheduled_date","priority","links","tags","reason"],"additionalProperties":false}'::jsonb,
  8,true,now(),'[]'::jsonb,'todo_create','owner',false
),
(
  'update_todo_task','todo','Edit To Do task',
  'Edit or reschedule one exact task owned by the signed-in operator.',
  'multideck_dexter_action_update_todo_task',
  '{"type":"object","properties":{"target_id":{"type":"string"},"title":{"type":["string","null"]},"scheduled_date":{"type":["string","null"]},"priority":{"type":["string","null"],"enum":["low","medium","high","urgent",null]},"status":{"type":["string","null"],"enum":["open","completed",null]},"links":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"url":{"type":"string"}},"required":["label","url"],"additionalProperties":false}},"tags":{"type":["array","null"],"items":{"type":"object","properties":{"label":{"type":"string"},"href":{"type":["string","null"]}},"required":["label","href"],"additionalProperties":false}},"reason":{"type":"string"}},"required":["target_id","title","scheduled_date","priority","status","links","tags","reason"],"additionalProperties":false}'::jsonb,
  9,true,now(),'[]'::jsonb,'todo_update','owner',false
),
(
  'complete_todo_task','todo','Complete To Do task',
  'Complete or reopen one exact task owned by the signed-in operator.',
  'multideck_dexter_action_complete_todo_task',
  '{"type":"object","properties":{"target_id":{"type":"string"},"completed":{"type":"boolean"},"reason":{"type":"string"}},"required":["target_id","completed","reason"],"additionalProperties":false}'::jsonb,
  10,true,now(),'[]'::jsonb,'todo_complete','owner',false
),
(
  'delete_todo_task','todo','Remove To Do task',
  'Soft-delete one exact task owned by the signed-in operator after approval.',
  'multideck_dexter_action_delete_todo_task',
  '{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,
  11,true,now(),'[]'::jsonb,'todo_delete','owner',false
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now(),
  "AIDexterAction_RequiredPermissionsJSON" = excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily" = excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy" = excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect" = excluded."AIDexterAction_HasExternalEffect";

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code", "AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description", "AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder", "AIDexterWatchCapability_IsActive",
  "AIDexterWatchCapability_UpdatedAt", "AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy"
) values (
  'todo','To Do list','Changes to one selected task on the signed-in operator''s personal To Do list.',
  '["title","scheduledDate","priority","status","tags"]'::jsonb,
  8,true,now(),'[]'::jsonb,'owner'
)
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name" = excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description" = excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON" = excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder" = excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive" = true,
  "AIDexterWatchCapability_UpdatedAt" = now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON" = excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy" = excluded."AIDexterWatchCapability_ScopeStrategy";

-- Preserve the existing deal visibility hardening and add an equivalent exact,
-- owner-private target check for personal tasks.
create or replace function public.multideck_dexter_create_watch(
  p_capability text,
  p_title text,
  p_summary text,
  p_request text,
  p_target_id uuid,
  p_target_label text,
  p_rule jsonb,
  p_action jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_capability text := lower(btrim(p_capability));
begin
  select * into v_context from public._multideck_dexter_context();
  if v_capability = 'deals'
     and p_target_id is not null
     and not public._multideck_crm_deal_is_operator_visible(p_target_id, v_context.company_id) then
    raise exception 'Choose a deal that is available in this workspace.' using errcode = '42501';
  end if;
  if v_capability = 'todo' and (
    p_target_id is null or not exists (
      select 1 from public."OPS_UserTasks" task
      where task."TodoTask_ID" = p_target_id
        and task."TodoTask_CompanyID" = v_context.company_id
        and task."TodoTask_OwnerUserID" = v_context.user_id
        and not task."TodoTask_IsDeleted"
    )
  ) then
    raise exception 'Choose one of your To Do tasks before creating this watch.' using errcode = '42501';
  end if;
  return public._multideck_dexter_create_watch_unfiltered_deals_20260818(
    p_capability,p_title,p_summary,p_request,p_target_id,p_target_label,p_rule,p_action
  );
end;
$$;

revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated, service_role;

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

drop trigger if exists "TR_OPS_UserTasks_dexter_watch" on public."OPS_UserTasks";
create trigger "TR_OPS_UserTasks_dexter_watch"
after insert or update on public."OPS_UserTasks"
for each row execute function public._multideck_todo_watch_signal();

revoke all on function public._multideck_todo_watch_signal() from public, anon, authenticated;

commit;
