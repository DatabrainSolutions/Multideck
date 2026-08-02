begin;

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
          'parentResponseMessageId', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,parentResponseMessageId}',
            ''
          ),
          'pendingAction', case
            when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,pendingAction}') = 'object'
              then message."AIMSG_ContentJSON" #> '{metadata,pendingAction}'
            else null
          end,
          'reasoningSummary', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,reasoningSummary}',
            ''
          ),
          'responseToUserMessageId', nullif(
            message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}',
            ''
          ),
          'responseVersion', case
            when coalesce(
              message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}',
              ''
            ) ~ '^[1-9][0-9]*$'
              then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer
            else null
          end
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

drop function if exists public.multideck_dexter_prepare_conversation(uuid);
drop function if exists public.multideck_dexter_prepare_conversation(uuid, uuid);

create function public.multideck_dexter_prepare_conversation(
  p_conversation_id uuid default null,
  p_retry_message_id uuid default null,
  p_history_message_ids uuid[] default null
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
  v_retry_created_at timestamptz;
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

  if p_retry_message_id is not null then
    if p_conversation_id is null then
      raise exception 'Choose a saved message to retry.'
        using errcode = '22023';
    end if;

    select message."AIMSG_CreatedAt"
    into v_retry_created_at
    from public."AI_Messages" message
    where message."AIMSG_ID" = p_retry_message_id
      and message."AIMSG_ConversationID" = p_conversation_id
      and message."AIMSG_Role" = 'user'
      and message."AIMSG_UserID" = v_user_id;

    if not found then
      raise exception 'That message cannot be retried in this conversation.'
        using errcode = 'P0002';
    end if;
  end if;

  if p_conversation_id is not null then
    if coalesce(cardinality(p_history_message_ids), 0) > 30 then
      raise exception 'Dexter can keep up to 30 selected messages in context.'
        using errcode = '22023';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', item.message_id,
          'role', item.role,
          'content', item.content
        )
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
        and (
          (
            p_retry_message_id is not null
            and (
              message."AIMSG_CreatedAt" < v_retry_created_at
              or (
                message."AIMSG_CreatedAt" = v_retry_created_at
                and message."AIMSG_ID" < p_retry_message_id
              )
            )
          )
          or (
            p_retry_message_id is null
            and (
              p_history_message_ids is null
              or message."AIMSG_ID" = any(p_history_message_ids)
            )
          )
        )
      order by message."AIMSG_CreatedAt" desc, message."AIMSG_ID" desc
      limit 30
    ) item;
  end if;

  return jsonb_build_object(
    'conversationId', p_conversation_id,
    'retryMessageId', p_retry_message_id,
    'history', v_history
  );
end;
$$;

drop function if exists public.multideck_dexter_save_exchange(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer
);
drop function if exists public.multideck_dexter_save_exchange(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer, uuid
);

create function public.multideck_dexter_save_exchange(
  p_conversation_id uuid,
  p_prompt text,
  p_answer text,
  p_specialist text,
  p_model text,
  p_attachments jsonb,
  p_metadata jsonb,
  p_input_tokens integer,
  p_output_tokens integer,
  p_retry_message_id uuid default null,
  p_parent_response_message_id uuid default null
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
  v_user_message_id uuid := coalesce(p_retry_message_id, gen_random_uuid());
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
  v_response_version integer := 1;
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
    if p_retry_message_id is not null then
      raise exception 'Choose a saved message to retry.'
        using errcode = '22023';
    end if;

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

  if p_retry_message_id is not null then
    select message."AIMSG_ContentText"
    into v_prompt
    from public."AI_Messages" message
    where message."AIMSG_ID" = p_retry_message_id
      and message."AIMSG_ConversationID" = v_conversation_id
      and message."AIMSG_Role" = 'user'
      and message."AIMSG_UserID" = v_user_id
    for update;

    if not found then
      raise exception 'That message cannot be retried in this conversation.'
        using errcode = 'P0002';
    end if;

    select coalesce(
      max(
        case
          when coalesce(
            message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}',
            ''
          ) ~ '^[1-9][0-9]*$'
            then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer
          else 1
        end
      ),
      1
    ) + 1
    into v_response_version
    from public."AI_Messages" message
    where message."AIMSG_ConversationID" = v_conversation_id
      and message."AIMSG_Role" = 'assistant'
      and message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}' =
        p_retry_message_id::text;
  else
    if p_parent_response_message_id is not null and not exists (
      select 1
      from public."AI_Messages" parent_message
      where parent_message."AIMSG_ID" = p_parent_response_message_id
        and parent_message."AIMSG_ConversationID" = v_conversation_id
        and parent_message."AIMSG_Role" = 'assistant'
    ) then
      raise exception 'That Dexter response is not part of this conversation.'
        using errcode = 'P0002';
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
        'metadata', case
          when p_parent_response_message_id is null then null
          else jsonb_build_object(
            'parentResponseMessageId',
            p_parent_response_message_id::text
          )
        end
      ),
      'internal',
      false,
      false,
      v_now,
      v_user_id
    );
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'responseToUserMessageId', v_user_message_id::text,
    'responseVersion', v_response_version
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

  if p_retry_message_id is null then
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
  end if;

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

revoke all on function public.multideck_dexter_prepare_conversation(uuid, uuid, uuid[])
  from public, anon;
revoke all on function public.multideck_dexter_save_exchange(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer, uuid, uuid
) from public, anon;

grant execute on function public.multideck_dexter_prepare_conversation(uuid, uuid, uuid[])
  to authenticated;
grant execute on function public.multideck_dexter_save_exchange(
  uuid, text, text, text, text, jsonb, jsonb, integer, integer, uuid, uuid
) to authenticated;

commit;
