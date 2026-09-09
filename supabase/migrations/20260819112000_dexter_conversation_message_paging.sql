begin;

create index if not exists "IX_AI_Messages_DexterConversationPage"
  on public."AI_Messages" ("AIMSG_ConversationID", "AIMSG_CreatedAt" desc, "AIMSG_ID" desc)
  where "AIMSG_ContentText" is not null;

create or replace function public.multideck_dexter_get_conversation_page(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_conversation record;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_total bigint := 0;
  v_messages jsonb := '[]'::jsonb;
begin
  select * into v_context from public._multideck_dexter_context();

  select
    conversation."AICNV_ID" as id,
    coalesce(conversation."AICNV_Title", 'Dexter conversation') as title,
    coalesce(conversation."AICNV_SummaryText", '') as summary,
    conversation."AICNV_UpdatedAt" as updated_at
  into v_conversation
  from public."AI_Conversations" conversation
  where conversation."AICNV_ID" = p_conversation_id
    and conversation."AICNV_CompanyID" = v_context.company_id
    and conversation."AICNV_OwnerUserID" = v_context.user_id
    and conversation."AICNV_Channel" = 'chat'
    and conversation."AICNV_EndedAt" is null
    and conversation."AICNV_DomainCode" in ('multideck', 'warehouse');

  if not found then
    raise exception 'This conversation does not exist or is outside your workspace.' using errcode = 'P0002';
  end if;

  select count(*)
  into v_total
  from public."AI_Messages" message
  where message."AIMSG_ConversationID" = p_conversation_id
    and message."AIMSG_ContentText" is not null;

  select coalesce(jsonb_agg(page.value order by page.created_at, page.id), '[]'::jsonb)
  into v_messages
  from (
    select
      message."AIMSG_ID" as id,
      message."AIMSG_CreatedAt" as created_at,
      jsonb_build_object(
        'id', message."AIMSG_ID",
        'role', message."AIMSG_Role",
        'content', message."AIMSG_ContentText",
        'createdAt', message."AIMSG_CreatedAt",
        'specialist', nullif(message."AIMSG_ContentJSON" ->> 'specialist', ''),
        'attachments', case when jsonb_typeof(message."AIMSG_ContentJSON" -> 'attachments') = 'array'
          then message."AIMSG_ContentJSON" -> 'attachments' else '[]'::jsonb end,
        'parentResponseMessageId', nullif(message."AIMSG_ContentJSON" #>> '{metadata,parentResponseMessageId}', ''),
        'pendingAction', case when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,pendingAction}') = 'object'
          then message."AIMSG_ContentJSON" #> '{metadata,pendingAction}' else null end,
        'reasoningSummary', nullif(message."AIMSG_ContentJSON" #>> '{metadata,reasoningSummary}', ''),
        'emailAttachments', case when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}') = 'array'
          then message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}' else '[]'::jsonb end,
        'emailDraft', case when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
          then message."AIMSG_ContentJSON" #> '{metadata,emailDraft}' else null end,
        'responseToUserMessageId', nullif(message."AIMSG_ContentJSON" #>> '{metadata,responseToUserMessageId}', ''),
        'responseVersion', case when coalesce(message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}', '') ~ '^[1-9][0-9]*$'
          then (message."AIMSG_ContentJSON" #>> '{metadata,responseVersion}')::integer else null end
      ) as value
    from public."AI_Messages" message
    where message."AIMSG_ConversationID" = p_conversation_id
      and message."AIMSG_ContentText" is not null
    order by message."AIMSG_CreatedAt" desc, message."AIMSG_ID" desc
    offset v_offset
    limit v_limit
  ) page;

  return jsonb_build_object(
    'id', v_conversation.id,
    'title', v_conversation.title,
    'summary', v_conversation.summary,
    'updatedAt', v_conversation.updated_at,
    'messages', v_messages,
    'messageTotal', v_total,
    'messageOffset', v_offset,
    'messageLimit', v_limit,
    'hasOlderMessages', v_offset + jsonb_array_length(v_messages) < v_total
  );
end;
$$;

revoke all on function public.multideck_dexter_get_conversation_page(uuid, integer, integer) from public, anon;
grant execute on function public.multideck_dexter_get_conversation_page(uuid, integer, integer) to authenticated, service_role;

comment on function public.multideck_dexter_get_conversation_page(uuid, integer, integer) is
  'Returns one owner-private newest-offset page of a Dexter conversation, in chronological display order. This changes existing read transport only and adds no new write or Watching capability.';

commit;
