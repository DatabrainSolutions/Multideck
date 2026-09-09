create or replace function public.multideck_dexter_record_provider_draft_delivery(
  p_message_id uuid,
  p_draft_message_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_message public."AI_Messages";
  v_provider_draft public."Comm_Messages";
  v_delivery jsonb;
begin
  select * into v_context from public._multideck_dexter_context();

  select message.* into v_message
  from public."AI_Messages" message
  join public."AI_Conversations" conversation
    on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_ID" = p_message_id
    and message."AIMSG_Role" = 'assistant'
    and conversation."AICNV_CompanyID" = v_context.company_id
    and conversation."AICNV_OwnerUserID" = v_context.user_id
    and jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
  for update;
  if not found then
    raise exception 'This Dexter email draft is unavailable.' using errcode = 'P0002';
  end if;

  select draft.* into v_provider_draft
  from public."Comm_Messages" draft
  where draft."CommMessage_ID" = p_draft_message_id
    and draft."CommMessage_CreatedBy" = v_context.user_id
    and draft."CommMessage_IsDraft" = true
    and draft."CommMessage_IsDeleted" = false
    and draft."CommMessage_StatusCode" = 'draft'
    and nullif(draft."CommMessage_ProviderMessageID", '') is not null;
  if not found then
    raise exception 'This provider email draft is unavailable.' using errcode = 'P0002';
  end if;

  v_delivery := jsonb_build_object(
    'status', 'draft_created',
    'messageId', v_provider_draft."CommMessage_ID",
    'threadId', v_provider_draft."CommMessage_ThreadID",
    'updatedAt', v_provider_draft."CommMessage_UpdatedAt"
  );

  update public."AI_Messages"
  set "AIMSG_ContentJSON" = jsonb_set(
    "AIMSG_ContentJSON",
    '{metadata,emailDraft,delivery}',
    v_delivery,
    true
  )
  where "AIMSG_ID" = p_message_id;

  perform public._multideck_dexter_writing_profile_audit(
    null,
    v_context.company_id,
    v_context.user_id,
    'provider_draft_created',
    'draft_created',
    0
  );

  return v_delivery;
end;
$$;

revoke all on function public.multideck_dexter_record_provider_draft_delivery(uuid, uuid)
  from public, anon;
grant execute on function public.multideck_dexter_record_provider_draft_delivery(uuid, uuid)
  to authenticated;

create or replace function public.multideck_dexter_update_email_draft(
  p_message_id uuid,
  p_draft jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_message public."AI_Messages";
  v_current_delivery jsonb;
  v_draft jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if jsonb_typeof(p_draft) <> 'object'
     or coalesce(p_draft ->> 'mode', '') not in ('new','reply','reply_all','forward')
     or coalesce(p_draft ->> 'requestedAction', '') not in ('create_draft','send')
     or jsonb_typeof(coalesce(p_draft -> 'to', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_draft -> 'cc', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_draft -> 'bcc', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_draft -> 'to', '[]'::jsonb)) > 50
     or jsonb_array_length(coalesce(p_draft -> 'cc', '[]'::jsonb)) > 50
     or jsonb_array_length(coalesce(p_draft -> 'bcc', '[]'::jsonb)) > 50
     or char_length(coalesce(p_draft ->> 'subject', '')) > 500
     or char_length(coalesce(p_draft ->> 'bodyText', '')) > 50000
     or pg_column_size(p_draft) > 100000 then
    raise exception 'This email draft is not valid.' using errcode = '22023';
  end if;

  select message.* into v_message
  from public."AI_Messages" message
  join public."AI_Conversations" conversation on conversation."AICNV_ID" = message."AIMSG_ConversationID"
  where message."AIMSG_ID" = p_message_id
    and message."AIMSG_Role" = 'assistant'
    and conversation."AICNV_CompanyID" = v_context.company_id
    and conversation."AICNV_OwnerUserID" = v_context.user_id
    and jsonb_typeof(message."AIMSG_ContentJSON" #> '{metadata,emailDraft}') = 'object'
  for update;
  if not found then
    raise exception 'This Dexter email draft is unavailable.' using errcode = 'P0002';
  end if;

  v_current_delivery := coalesce(
    v_message."AIMSG_ContentJSON" #> '{metadata,emailDraft,delivery}',
    jsonb_build_object('status', 'draft')
  );
  if coalesce(v_current_delivery ->> 'status', 'draft') in ('sent', 'draft_created') then
    raise exception 'A completed email action cannot be edited.' using errcode = '22023';
  end if;

  v_draft := jsonb_strip_nulls(jsonb_build_object(
    'id', left(coalesce(p_draft ->> 'id', gen_random_uuid()::text), 80),
    'requestedAction', p_draft ->> 'requestedAction',
    'mode', p_draft ->> 'mode',
    'mailboxId', nullif(left(coalesce(p_draft ->> 'mailboxId', ''), 80), ''),
    'sourceMessageId', nullif(left(coalesce(p_draft ->> 'sourceMessageId', ''), 80), ''),
    'threadId', nullif(left(coalesce(p_draft ->> 'threadId', ''), 80), ''),
    'to', coalesce(p_draft -> 'to', '[]'::jsonb),
    'cc', coalesce(p_draft -> 'cc', '[]'::jsonb),
    'bcc', coalesce(p_draft -> 'bcc', '[]'::jsonb),
    'subject', left(coalesce(p_draft ->> 'subject', ''), 500),
    'bodyText', left(coalesce(p_draft ->> 'bodyText', ''), 50000),
    'trackOpens', coalesce((p_draft ->> 'trackOpens')::boolean, false),
    'delivery', v_current_delivery
  ));

  update public."AI_Messages"
  set "AIMSG_ContentJSON" = jsonb_set(
    "AIMSG_ContentJSON", '{metadata,emailDraft}', v_draft, true
  )
  where "AIMSG_ID" = p_message_id;
  return v_draft;
end;
$$;

revoke all on function public.multideck_dexter_update_email_draft(uuid, jsonb)
  from public, anon;
grant execute on function public.multideck_dexter_update_email_draft(uuid, jsonb)
  to authenticated;
