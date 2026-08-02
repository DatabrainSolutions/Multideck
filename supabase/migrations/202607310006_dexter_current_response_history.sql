begin;

drop function if exists public.multideck_dexter_prepare_conversation(uuid, uuid);
drop function if exists public.multideck_dexter_prepare_conversation(uuid, uuid, uuid[]);

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
            p_history_message_ids is not null
            and message."AIMSG_ID" = any(p_history_message_ids)
          )
          or (
            p_history_message_ids is null
            and (
              p_retry_message_id is null
              or message."AIMSG_CreatedAt" < v_retry_created_at
              or (
                message."AIMSG_CreatedAt" = v_retry_created_at
                and message."AIMSG_ID" < p_retry_message_id
              )
            )
          )
        )
        and (
          p_history_message_ids is not null
          or message."AIMSG_Role" = 'user'
          or (
            message."AIMSG_Role" = 'assistant'
            and (
              (
                nullif(
                  message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}',
                  ''
                ) is not null
                and coalesce(
                  case
                    when coalesce(
                      message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}',
                      ''
                    ) ~ '^[1-9][0-9]*$'
                      then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer
                    else 1
                  end,
                  1
                ) = (
                  select max(
                    case
                      when coalesce(
                        versioned."AIMSG_ContentJSON" #>> '{metadata,responseVersion}',
                        ''
                      ) ~ '^[1-9][0-9]*$'
                        then (versioned."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer
                      else 1
                    end
                  )
                  from public."AI_Messages" versioned
                  where versioned."AIMSG_ConversationID" = p_conversation_id
                    and versioned."AIMSG_Role" = 'assistant'
                    and versioned."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}' =
                      message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}'
                )
              )
              or (
                nullif(
                  message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}',
                  ''
                ) is null
                and not exists (
                  select 1
                  from public."AI_Messages" versioned
                  where versioned."AIMSG_ConversationID" = p_conversation_id
                    and versioned."AIMSG_Role" = 'assistant'
                    and versioned."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}' = (
                      select previous_user."AIMSG_ID"::text
                      from public."AI_Messages" previous_user
                      where previous_user."AIMSG_ConversationID" = p_conversation_id
                        and previous_user."AIMSG_Role" = 'user'
                        and (
                          previous_user."AIMSG_CreatedAt" < message."AIMSG_CreatedAt"
                          or (
                            previous_user."AIMSG_CreatedAt" = message."AIMSG_CreatedAt"
                            and previous_user."AIMSG_ID" < message."AIMSG_ID"
                          )
                        )
                      order by previous_user."AIMSG_CreatedAt" desc, previous_user."AIMSG_ID" desc
                      limit 1
                    )
                )
              )
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

revoke all on function public.multideck_dexter_prepare_conversation(uuid, uuid, uuid[])
  from public, anon;

grant execute on function public.multideck_dexter_prepare_conversation(uuid, uuid, uuid[])
  to authenticated;

commit;
