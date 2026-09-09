-- Supabase-owned runtime for Agent Dexter.
--
-- The browser calls the authenticated agent-dexter Edge Function. The Edge Function
-- uses these narrow RPCs for conversation persistence and history. AI conversation
-- tables remain inaccessible to browser roles and every RPC resolves the signed-in
-- operator through _multideck_dexter_context().

begin;

insert into public."sys_AIContextDomains"
  ("AICD_Code", "AICD_Name", "AICD_Description", "AICD_SortOrder", "AICD_IsActive")
values
  ('warehouse', 'Warehouse', 'Legacy warehouse operations context', 10, true),
  ('multideck', 'Multideck', 'Cross-product workspace context', 20, true)
on conflict ("AICD_Code") do nothing;

insert into public."sys_AIConversationChannels"
  ("AICC_Code", "AICC_Name", "AICC_Description", "AICC_SortOrder", "AICC_IsActive")
values ('chat', 'Chat', 'Interactive AI conversations', 10, true)
on conflict ("AICC_Code") do nothing;

insert into public."sys_AIMessageRoles"
  ("AIMR_Code", "AIMR_Name", "AIMR_SortOrder", "AIMR_IsActive")
values
  ('user', 'User', 10, true),
  ('assistant', 'Assistant', 20, true),
  ('system', 'System', 30, true),
  ('tool', 'Tool', 40, true)
on conflict ("AIMR_Code") do nothing;

alter table public."AI_Conversations" enable row level security;
alter table public."AI_Messages" enable row level security;
alter table public."AI_ConversationParticipants" enable row level security;
alter table public."AI_MessageLinks" enable row level security;

revoke all on table
  public."AI_Conversations",
  public."AI_Messages",
  public."AI_ConversationParticipants",
  public."AI_MessageLinks"
from public, anon, authenticated;

create index if not exists "ix_AI_Conversations_dexter_owner"
  on public."AI_Conversations"
    ("AICNV_CompanyID", "AICNV_OwnerUserID", "AICNV_UpdatedAt" desc)
  where "AICNV_Channel" = 'chat'
    and "AICNV_EndedAt" is null
    and "AICNV_DomainCode" in ('multideck', 'warehouse');

create index if not exists "ix_AI_Messages_dexter_usage"
  on public."AI_Messages" ("AIMSG_CreatedAt" desc, "AIMSG_ConversationID")
  where "AIMSG_Role" = 'assistant';

create or replace function public._multideck_dexter_conversation_json(
  p_conversation_id uuid,
  p_user_id uuid,
  p_company_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', conversation."AICNV_ID",
    'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
    'summary', coalesce(conversation."AICNV_SummaryText", ''),
    'updatedAt', conversation."AICNV_UpdatedAt",
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', message."AIMSG_ID",
          'role', message."AIMSG_Role",
          'content', message."AIMSG_ContentText",
          'createdAt', message."AIMSG_CreatedAt",
          'specialist', nullif(message."AIMSG_ContentJSON" ->> 'specialist', ''),
          'pendingAction', case
            when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,pendingAction}') = 'object'
              then message."AIMSG_ContentJSON" #> '{metadata,pendingAction}'
            else null
          end,
          'reasoningSummary', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,reasoningSummary}',
            ''
          )
        )
        order by message."AIMSG_CreatedAt", message."AIMSG_ID"
      )
      from public."AI_Messages" message
      where message."AIMSG_ConversationID" = conversation."AICNV_ID"
        and message."AIMSG_ContentText" is not null
    ), '[]'::jsonb)
  )
  from public."AI_Conversations" conversation
  where conversation."AICNV_ID" = p_conversation_id
    and conversation."AICNV_CompanyID" = p_company_id
    and conversation."AICNV_OwnerUserID" = p_user_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_EndedAt" is null
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');
$$;

create or replace function public.multideck_dexter_list_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_result jsonb;
begin
  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  select coalesce(jsonb_agg(item.value order by item.updated_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      jsonb_build_object(
        'id', conversation."AICNV_ID",
        'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
        'summary', coalesce(conversation."AICNV_SummaryText", ''),
        'updatedAt', conversation."AICNV_UpdatedAt"
      ) as value,
      conversation."AICNV_UpdatedAt" as updated_at
    from public."AI_Conversations" conversation
    where conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_OwnerUserID" = v_user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
    order by conversation."AICNV_UpdatedAt" desc
    limit 50
  ) item;

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_get_conversation(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_result jsonb;
begin
  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  select public._multideck_dexter_conversation_json(
    p_conversation_id,
    v_user_id,
    v_company_id
  ) into v_result;

  if v_result is null then
    raise exception 'This conversation does not exist or is outside your workspace.'
      using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_prepare_conversation(
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_history jsonb := '[]'::jsonb;
begin
  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  if p_conversation_id is not null and not exists (
    select 1
    from public."AI_Conversations" conversation
    where conversation."AICNV_ID" = p_conversation_id
      and conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_OwnerUserID" = v_user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
  ) then
    raise exception 'This conversation does not exist or is outside your workspace.'
      using errcode = 'P0002';
  end if;

  if p_conversation_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('role', item.role, 'content', item.content)
        order by item.created_at, item.message_id
      ),
      '[]'::jsonb
    )
    into v_history
    from (
      select
        message."AIMSG_ID" as message_id,
        message."AIMSG_Role" as role,
        message."AIMSG_ContentText" as content,
        message."AIMSG_CreatedAt" as created_at
      from public."AI_Messages" message
      where message."AIMSG_ConversationID" = p_conversation_id
        and message."AIMSG_Role" in ('user', 'assistant')
        and message."AIMSG_ContentText" is not null
      order by message."AIMSG_CreatedAt" desc, message."AIMSG_ID" desc
      limit 30
    ) item;
  end if;

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'history', v_history
  );
end;
$$;

create or replace function public.multideck_dexter_rename_conversation(
  p_conversation_id uuid,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_result jsonb;
begin
  if v_title = '' then
    raise exception 'Give this conversation a name first.' using errcode = '22023';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'Keep conversation names under 120 characters.' using errcode = '22023';
  end if;

  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  update public."AI_Conversations" conversation
  set
    "AICNV_Title" = v_title,
    "AICNV_UpdatedAt" = clock_timestamp(),
    "AICNV_UpdatedBy" = v_user_id
  where conversation."AICNV_ID" = p_conversation_id
    and conversation."AICNV_CompanyID" = v_company_id
    and conversation."AICNV_OwnerUserID" = v_user_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_EndedAt" is null
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');

  if not found then
    raise exception 'This conversation does not exist or is outside your workspace.'
      using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', conversation."AICNV_ID",
    'title', coalesce(conversation."AICNV_Title", 'Dexter conversation'),
    'summary', coalesce(conversation."AICNV_SummaryText", ''),
    'updatedAt', conversation."AICNV_UpdatedAt"
  )
  into v_result
  from public."AI_Conversations" conversation
  where conversation."AICNV_ID" = p_conversation_id;

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_close_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  update public."AI_Conversations" conversation
  set
    "AICNV_Status" = 'closed',
    "AICNV_EndedAt" = v_now,
    "AICNV_UpdatedAt" = v_now,
    "AICNV_UpdatedBy" = v_user_id
  where conversation."AICNV_ID" = p_conversation_id
    and conversation."AICNV_CompanyID" = v_company_id
    and conversation."AICNV_OwnerUserID" = v_user_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_EndedAt" is null
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');

  if not found then
    raise exception 'This conversation does not exist or is outside your workspace.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

create or replace function public.multideck_dexter_save_exchange(
  p_conversation_id uuid,
  p_prompt text,
  p_answer text,
  p_specialist text,
  p_model text,
  p_attachments jsonb,
  p_metadata jsonb,
  p_input_tokens integer,
  p_output_tokens integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_conversation_id uuid := p_conversation_id;
  v_user_message_id uuid := gen_random_uuid();
  v_assistant_message_id uuid := gen_random_uuid();
  v_prompt text := btrim(coalesce(p_prompt, ''));
  v_answer text := btrim(coalesce(p_answer, ''));
  v_specialist text := lower(btrim(coalesce(p_specialist, 'auto')));
  v_model text := lower(btrim(coalesce(p_model, 'fast')));
  v_attachments jsonb := case
    when jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) = 'array'
      then coalesce(p_attachments, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_metadata jsonb := case
    when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
      then coalesce(p_metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_now timestamptz := clock_timestamp();
  v_attachment jsonb;
  v_target_id uuid;
  v_target_table text;
  v_summary text;
  v_result jsonb;
begin
  if v_prompt = '' or char_length(v_prompt) > 4000 then
    raise exception 'Write a Dexter request between 1 and 4,000 characters.'
      using errcode = '22023';
  end if;
  if v_answer = '' or char_length(v_answer) > 24000 then
    raise exception 'Dexter did not return a valid answer.'
      using errcode = '22023';
  end if;
  if v_specialist not in ('auto', 'customs', 'customer', 'sales', 'ops', 'analytics') then
    raise exception 'The selected Dexter specialist is not recognised.'
      using errcode = '22023';
  end if;
  if v_model not in ('fast', 'smart', 'worker') then
    raise exception 'The selected Dexter model is not recognised.'
      using errcode = '22023';
  end if;

  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  if v_conversation_id is null then
    v_conversation_id := gen_random_uuid();

    insert into public."AI_Conversations" (
      "AICNV_ID",
      "AICNV_Title",
      "AICNV_Channel",
      "AICNV_DomainCode",
      "AICNV_CompanyID",
      "AICNV_OwnerUserID",
      "AICNV_Status",
      "AICNV_SecurityClass",
      "AICNV_IsTrainingAllowed",
      "AICNV_MetadataJSON",
      "AICNV_StartedAt",
      "AICNV_CreatedAt",
      "AICNV_CreatedBy",
      "AICNV_UpdatedAt",
      "AICNV_UpdatedBy"
    )
    values (
      v_conversation_id,
      case
        when char_length(regexp_replace(v_prompt, '\s+', ' ', 'g')) <= 100
          then regexp_replace(v_prompt, '\s+', ' ', 'g')
        else left(regexp_replace(v_prompt, '\s+', ' ', 'g'), 99) || '…'
      end,
      'chat',
      'multideck',
      v_company_id,
      v_user_id,
      'open',
      'internal',
      false,
      jsonb_build_object('agent', 'dexter', 'domain', 'multideck'),
      v_now,
      v_now,
      v_user_id,
      v_now,
      v_user_id
    );

    insert into public."AI_ConversationParticipants" (
      "AICNP_ConversationID",
      "AICNP_ParticipantType",
      "AICNP_UserID",
      "AICNP_IsPrimary",
      "AICNP_CreatedAt"
    )
    values (
      v_conversation_id,
      'user',
      v_user_id,
      true,
      v_now
    );

    insert into public."AI_ConversationParticipants" (
      "AICNP_ConversationID",
      "AICNP_ParticipantType",
      "AICNP_DisplayNameSnapshot",
      "AICNP_IsPrimary",
      "AICNP_CreatedAt"
    )
    values (
      v_conversation_id,
      'ai',
      'Dexter',
      false,
      v_now
    );
  else
    perform 1
    from public."AI_Conversations" conversation
    where conversation."AICNV_ID" = v_conversation_id
      and conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_OwnerUserID" = v_user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
    for update;

    if not found then
      raise exception 'This conversation does not exist or is outside your workspace.'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public."AI_Messages" (
    "AIMSG_ID",
    "AIMSG_ConversationID",
    "AIMSG_Role",
    "AIMSG_UserID",
    "AIMSG_ContentText",
    "AIMSG_ContentJSON",
    "AIMSG_SecurityClass",
    "AIMSG_IsTrainingCandidate",
    "AIMSG_IsTrainingAllowed",
    "AIMSG_CreatedAt",
    "AIMSG_CreatedBy"
  )
  values (
    v_user_message_id,
    v_conversation_id,
    'user',
    v_user_id,
    v_prompt,
    jsonb_build_object(
      'specialist', v_specialist,
      'model', v_model,
      'attachments', v_attachments,
      'metadata', null
    ),
    'internal',
    false,
    false,
    v_now,
    v_user_id
  );

  insert into public."AI_Messages" (
    "AIMSG_ID",
    "AIMSG_ConversationID",
    "AIMSG_Role",
    "AIMSG_ContentText",
    "AIMSG_ContentJSON",
    "AIMSG_PromptTokens",
    "AIMSG_CompletionTokens",
    "AIMSG_SecurityClass",
    "AIMSG_IsTrainingCandidate",
    "AIMSG_IsTrainingAllowed",
    "AIMSG_CreatedAt"
  )
  values (
    v_assistant_message_id,
    v_conversation_id,
    'assistant',
    v_answer,
    jsonb_build_object(
      'specialist', v_specialist,
      'model', v_model,
      'attachments', '[]'::jsonb,
      'metadata', v_metadata
    ),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    'internal',
    false,
    false,
    v_now + interval '1 microsecond'
  );

  for v_attachment in
    select attachment.value
    from jsonb_array_elements(v_attachments) attachment(value)
    limit 10
  loop
    begin
      v_target_id := nullif(v_attachment ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      continue;
    end;

    v_target_table := case lower(coalesce(v_attachment ->> 'type', ''))
      when 'booking' then 'WMS_Orders'
      when 'order' then 'WMS_Orders'
      when 'item' then 'WMS_Items'
      when 'facility' then 'WMS_Facilities'
      when 'document' then 'WMS_Documents'
      else null
    end;

    if v_target_id is not null and v_target_table is not null then
      insert into public."AI_MessageLinks" (
        "AIML_MessageID",
        "AIML_TargetTable",
        "AIML_TargetID",
        "AIML_LinkRole",
        "AIML_CreatedAt"
      )
      values (
        v_user_message_id,
        v_target_table,
        v_target_id,
        'context',
        v_now
      );
    end if;
  end loop;

  v_summary := case
    when char_length(v_answer) <= 180 then v_answer
    else left(v_answer, 179) || '…'
  end;

  update public."AI_Conversations"
  set
    "AICNV_SummaryText" = v_summary,
    "AICNV_UpdatedAt" = v_now + interval '1 microsecond',
    "AICNV_UpdatedBy" = v_user_id
  where "AICNV_ID" = v_conversation_id;

  select public._multideck_dexter_conversation_json(
    v_conversation_id,
    v_user_id,
    v_company_id
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_get_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_now timestamptz := now();
  v_period_start timestamptz := date_trunc('month', now());
  v_period_end timestamptz := date_trunc('month', now()) + interval '1 month';
  v_trend_start date := (date_trunc('week', now()) - interval '5 weeks')::date;
  v_result jsonb;
begin
  select context.user_id, context.company_id
  into v_user_id, v_company_id
  from public._multideck_dexter_context() context;

  with scoped_rows as (
    select
      message."AIMSG_ID" as id,
      coalesce(conversation."AICNV_Title", 'Dexter conversation') as title,
      greatest(coalesce(message."AIMSG_PromptTokens", 0), 0) as input_tokens,
      greatest(coalesce(message."AIMSG_CompletionTokens", 0), 0) as output_tokens,
      message."AIMSG_ConversationID" as conversation_id,
      message."AIMSG_CreatedAt" as created_at
    from public."AI_Messages" message
    join public."AI_Conversations" conversation
      on conversation."AICNV_ID" = message."AIMSG_ConversationID"
    where message."AIMSG_Role" = 'assistant'
      and message."AIMSG_CreatedAt" >= least(v_period_start, v_trend_start::timestamptz)
      and message."AIMSG_CreatedAt" < v_period_end
      and conversation."AICNV_CompanyID" = v_company_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
  ),
  month_rows as (
    select *
    from scoped_rows
    where created_at >= v_period_start
  ),
  trend as (
    select jsonb_agg(
      jsonb_build_object(
        'weekStart', week.week_start,
        'actions', (
          select count(*)
          from scoped_rows row_data
          where row_data.created_at >= week.week_start::timestamptz
            and row_data.created_at < (week.week_start + 7)::timestamptz
        ),
        'tokens', (
          select coalesce(sum(row_data.input_tokens + row_data.output_tokens), 0)
          from scoped_rows row_data
          where row_data.created_at >= week.week_start::timestamptz
            and row_data.created_at < (week.week_start + 7)::timestamptz
        )
      )
      order by week.week_start
    ) as value
    from (
      select v_trend_start + (series.index * 7) as week_start
      from generate_series(0, 5) series(index)
    ) week
  ),
  recent as (
    select coalesce(jsonb_agg(item.value order by item.created_at desc), '[]'::jsonb) as value
    from (
      select
        jsonb_build_object(
          'id', month.id,
          'title', month.title,
          'inputTokens', month.input_tokens,
          'outputTokens', month.output_tokens,
          'totalTokens', month.input_tokens + month.output_tokens,
          'createdAt', month.created_at
        ) as value,
        month.created_at
      from month_rows month
      order by month.created_at desc
      limit 50
    ) item
  )
  select jsonb_build_object(
    'periodStart', v_period_start,
    'periodEnd', v_period_end,
    'includedActionsLimit', 10000,
    'actionsUsed', (select count(*) from month_rows),
    'trackedActions', (
      select count(*)
      from month_rows
      where input_tokens + output_tokens > 0
    ),
    'conversationCount', (
      select count(distinct conversation_id)
      from month_rows
    ),
    'inputTokens', coalesce((select sum(input_tokens) from month_rows), 0),
    'outputTokens', coalesce((select sum(output_tokens) from month_rows), 0),
    'totalTokens', coalesce((select sum(input_tokens + output_tokens) from month_rows), 0),
    'trend', coalesce((select value from trend), '[]'::jsonb),
    'recentEntries', coalesce((select value from recent), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public._multideck_dexter_conversation_json(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.multideck_dexter_list_conversations()
  from public, anon;
revoke all on function public.multideck_dexter_get_conversation(uuid)
  from public, anon;
revoke all on function public.multideck_dexter_prepare_conversation(uuid)
  from public, anon;
revoke all on function public.multideck_dexter_rename_conversation(uuid, text)
  from public, anon;
revoke all on function public.multideck_dexter_close_conversation(uuid)
  from public, anon;
revoke all on function public.multideck_dexter_save_exchange(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer
) from public, anon;
revoke all on function public.multideck_dexter_get_usage()
  from public, anon;

grant execute on function public.multideck_dexter_list_conversations()
  to authenticated;
grant execute on function public.multideck_dexter_get_conversation(uuid)
  to authenticated;
grant execute on function public.multideck_dexter_prepare_conversation(uuid)
  to authenticated;
grant execute on function public.multideck_dexter_rename_conversation(uuid, text)
  to authenticated;
grant execute on function public.multideck_dexter_close_conversation(uuid)
  to authenticated;
grant execute on function public.multideck_dexter_save_exchange(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer
) to authenticated;
grant execute on function public.multideck_dexter_get_usage()
  to authenticated;

commit;
