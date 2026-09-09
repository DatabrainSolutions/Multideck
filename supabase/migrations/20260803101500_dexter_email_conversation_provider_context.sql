-- Retain an operator's explicit @Gmail or @Outlook selection while they continue
-- the same conversation branch. This allows natural corrections and follow-up
-- questions without broadening access to new conversations or sibling branches.
create or replace function public.multideck_dexter_conversation_email_context(
  p_conversation_id uuid,
  p_history_message_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_attachments jsonb;
  v_providers jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if p_conversation_id is null then
    return jsonb_build_object('attachments', '[]'::jsonb, 'providers', '[]'::jsonb);
  end if;

  if not exists (
    select 1
    from public."AI_Conversations" conversation
    where conversation."AICNV_ID" = p_conversation_id
      and conversation."AICNV_CompanyID" = v_context.company_id
      and conversation."AICNV_OwnerUserID" = v_context.user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
  ) then
    raise exception 'This conversation does not exist or is outside your workspace.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(context_row.attachment order by context_row.created_at desc, context_row.ordinality), '[]'::jsonb)
  into v_attachments
  from (
    select attachment.value as attachment, message."AIMSG_CreatedAt" as created_at, attachment.ordinality
    from public."AI_Messages" message
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}') = 'array'
          then message."AIMSG_ContentJSON" #> '{metadata,emailAttachments}'
        else '[]'::jsonb
      end
    ) with ordinality attachment(value, ordinality)
    where message."AIMSG_ConversationID" = p_conversation_id
      and message."AIMSG_Role" = 'assistant'
      and (p_history_message_ids is null or message."AIMSG_ID" = any(p_history_message_ids))
      and jsonb_typeof(attachment.value) = 'object'
      and coalesce(attachment.value ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$'
      and attachment.value ->> 'provider' in ('gmail', 'outlook')
    order by message."AIMSG_CreatedAt" desc, attachment.ordinality
    limit 5
  ) context_row;

  select coalesce(jsonb_agg(provider_rows.provider order by provider_rows.provider), '[]'::jsonb)
  into v_providers
  from (
    select distinct lower(regexp_replace(attachment.value ->> 'id', '^email:', '')) as provider
    from public."AI_Messages" message
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(message."AIMSG_ContentJSON" -> 'attachments') = 'array'
          then message."AIMSG_ContentJSON" -> 'attachments'
        else '[]'::jsonb
      end
    ) attachment(value)
    where message."AIMSG_ConversationID" = p_conversation_id
      and message."AIMSG_Role" = 'user'
      and (p_history_message_ids is null or message."AIMSG_ID" = any(p_history_message_ids))
      and jsonb_typeof(attachment.value) = 'object'
      and attachment.value ->> 'type' = 'email'
      and lower(regexp_replace(attachment.value ->> 'id', '^email:', '')) in ('gmail', 'outlook')
  ) provider_rows;

  return jsonb_build_object(
    'attachments', v_attachments,
    'providers', v_providers
  );
end;
$$;

revoke all on function public.multideck_dexter_conversation_email_context(uuid, uuid[]) from public, anon;
grant execute on function public.multideck_dexter_conversation_email_context(uuid, uuid[]) to authenticated;
